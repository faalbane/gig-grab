"""Gig-grab voice agent — Pipecat pipeline tuned for the candidate-intake call.

Stack:
  Twilio Media Streams (WebSocket) → Silero VAD → Deepgram Nova-3 multi (STT)
  → Groq Llama 3.1 8B (LLM, ~100ms TTFT) → Cartesia Sonic-3 (TTS, multilingual)
  → back to Twilio.

Plus a side-channel that streams transcript turns into Postgres.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Optional

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    BotStoppedSpeakingFrame,
    EndFrame,
    Frame,
    InterimTranscriptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesFrame,
    LLMRunFrame,
    TranscriptionFrame,
    TextFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
# Pipecat 0.0.108 still ships the legacy paths but emits DeprecationWarnings
# on import. We use the new paths to silence them and stay compatible with
# whatever 0.x point release is current.
try:  # pragma: no cover - import-shim
    from pipecat.services.groq.llm import GroqLLMService  # type: ignore
except ImportError:
    from pipecat.services.groq import GroqLLMService  # type: ignore
try:
    from pipecat.transports.websocket.fastapi import (  # type: ignore
        FastAPIWebsocketTransport,
        FastAPIWebsocketParams,
    )
except ImportError:  # pragma: no cover
    from pipecat.transports.network.fastapi_websocket import (  # type: ignore
        FastAPIWebsocketTransport,
        FastAPIWebsocketParams,
    )

# --- imports from packages already in src/prompts/ ---
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from prompts.candidate_interview import (  # type: ignore
    SYSTEM_PROMPT as CANDIDATE_SYSTEM_PROMPT,
    render_initial_message,
    CallContext,
)
from prompts.employer_intake import (  # type: ignore
    SYSTEM_PROMPT as EMPLOYER_SYSTEM_PROMPT,
)
from prompts.combined_intake import (  # type: ignore
    SYSTEM_PROMPT as COMBINED_SYSTEM_PROMPT,
)


def _select_system_prompt(audience: str, has_existing_profile: bool) -> str:
    """Pick the system prompt based on cached audience + whether we already
    know the caller. Returning callers always know their lane (their
    existing profile is candidate-only today); unknown inbound callers
    get the combined prompt that does intent detection first."""
    if audience == "employer":
        return EMPLOYER_SYSTEM_PROMPT
    if audience == "worker" or has_existing_profile:
        return CANDIDATE_SYSTEM_PROMPT
    return COMBINED_SYSTEM_PROMPT

from . import db

logger = logging.getLogger(__name__)


# --- Cartesia voice IDs per language --------------------------------------
# These are stable Cartesia v2 voice IDs that work with Sonic-3 multilingual.
# Picked warm/professional female voices as a default — the AI recruiter
# persona reads better with a single consistent voice across languages.
DEFAULT_CARTESIA_VOICE = "79a125e8-cd45-4c13-8a67-188112f4dd22"


# ---------------------------------------------------------------------------
# DB-writing processor — listens for transcription frames + LLM responses,
# writes them to transcript_turns asynchronously without blocking the pipeline.
# ---------------------------------------------------------------------------


# Shared per-session monotonic counter so two TranscriptDbWriter instances
# (one positioned to capture the candidate side, one for the AI side) hand
# out non-colliding `ord` values.
_TRANSCRIPT_ORD: dict[str, int] = {}
_TRANSCRIPT_START_MS: dict[str, int] = {}


# 4+ consecutive single-letter tokens separated by whitespace — Deepgram's
# emission for someone spelling out "A-L-B-A-N-E-S-E" reaches the agent as
# "a l b a n e s e". Llama 3.1 8B routinely drops or repeats letters when
# reading those back, so we pre-concatenate before the LLM sees the text.
_SPELL_OUT_RE = re.compile(r"\b([A-Za-z](?:[ .\-]+[A-Za-z]){3,})\b")


def _normalise_spell_out(text: str) -> str:
    def replace(m: re.Match) -> str:
        letters = re.findall(r"[A-Za-z]", m.group(0))
        joined = "".join(letters).upper()
        return f"{'-'.join(letters).upper()} ({joined})"

    return _SPELL_OUT_RE.sub(replace, text)


class CandidateTextNormalizer(FrameProcessor):
    """Rewrites TranscriptionFrame text to make spell-outs unambiguous to
    the LLM. Sits between STT and the candidate-side db writer."""

    def __init__(self) -> None:
        super().__init__(name="candidate-text-normalizer")

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if (
            isinstance(frame, TranscriptionFrame)
            and not isinstance(frame, InterimTranscriptionFrame)
            and getattr(frame, "text", None)
        ):
            new = _normalise_spell_out(frame.text)
            if new != frame.text:
                logger.info(f"[normalizer] spell-out: {frame.text!r} → {new!r}")
                frame.text = new
        await self.push_frame(frame, direction)


def _next_ord(session_id: str) -> int:
    n = _TRANSCRIPT_ORD.get(session_id, 0)
    _TRANSCRIPT_ORD[session_id] = n + 1
    return n


def _ms_offset(session_id: str) -> int:
    start = _TRANSCRIPT_START_MS.setdefault(session_id, int(time.time() * 1000))
    return int(time.time() * 1000) - start


class TranscriptDbWriter(FrameProcessor):
    """One processor per role. Capture exactly one frame type and forward
    everything downstream. The 'candidate' instance sits between STT and
    user_aggregator (sees TranscriptionFrame). The 'ai' instance sits
    between LLM and TTS — it BUFFERS streaming TextFrame chunks between
    LLMFullResponseStart/EndFrame and writes one row per assistant turn so
    the transcript reads as natural sentences instead of per-token bubbles.
    """

    def __init__(self, session_id: str, role: str):
        super().__init__(name=f"transcript-db-writer-{role}")
        if role not in ("candidate", "ai"):
            raise ValueError(f"role must be candidate|ai, got {role!r}")
        self.session_id = session_id
        self.role = role
        self._ai_buffer: list[str] = []
        self._buffering = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        # CRITICAL: FrameProcessor.process_frame does NOT auto-forward frames
        # downstream. Subclasses must explicitly push.
        await self.push_frame(frame, direction)

        if self.role == "candidate":
            if isinstance(frame, TranscriptionFrame) and frame.text.strip():
                try:
                    await db.write_transcript_turn(
                        session_id=self.session_id,
                        ord_=_next_ord(self.session_id),
                        speaker="candidate",
                        text=frame.text.strip(),
                        ms_offset=_ms_offset(self.session_id),
                    )
                except Exception as e:
                    logger.warning(f"[db] candidate turn write failed: {e}")
            return

        # role == "ai"
        if isinstance(frame, LLMFullResponseStartFrame):
            self._ai_buffer = []
            self._buffering = True
            return
        if isinstance(frame, LLMFullResponseEndFrame):
            self._buffering = False
            text = _clean_ai_text("".join(self._ai_buffer))
            self._ai_buffer = []
            if text:
                try:
                    await db.write_transcript_turn(
                        session_id=self.session_id,
                        ord_=_next_ord(self.session_id),
                        speaker="ai",
                        text=text,
                        ms_offset=_ms_offset(self.session_id),
                    )
                except Exception as e:
                    logger.warning(f"[db] ai turn write failed: {e}")
            return
        # Buffer LLM streaming token chunks. Exclude transcription subclasses
        # (which inherit from TextFrame) so STT echoes never land here.
        if (
            self._buffering
            and isinstance(frame, TextFrame)
            and not isinstance(frame, (TranscriptionFrame, InterimTranscriptionFrame))
            and direction == FrameDirection.DOWNSTREAM
        ):
            chunk = getattr(frame, "text", "")
            if chunk:
                self._ai_buffer.append(chunk)


# Wrap-up phrase detector. Prompts close with "Speak soon." (sometimes the
# log-on instruction immediately precedes it). We match either signal so
# punctuation/case drift in the LLM output doesn't strand the call open.
_WRAPUP_SPEAK_SOON_RE = re.compile(r"speak\s+soon\b", re.IGNORECASE)
_WRAPUP_LOGON_RE = re.compile(
    r"log\s*on\s+to\s+giggrab\.io\s+with\s+your\s+phone\s+number", re.IGNORECASE
)


def _looks_like_wrapup(text: str) -> bool:
    if not text:
        return False
    return bool(_WRAPUP_SPEAK_SOON_RE.search(text) or _WRAPUP_LOGON_RE.search(text))


class WrapUpHangup(FrameProcessor):
    """End the call gracefully once the AI has finished delivering its
    sign-off line.

    Sits at the tail of the pipeline so it observes both the LLM streaming
    output (TextFrame chunks bracketed by LLMFullResponseStart/EndFrame) and
    the BotStoppedSpeakingFrame emitted by the transport output AFTER audio
    playback has actually drained. When the buffered assistant turn matches
    the wrap-up pattern, we arm a one-shot flag and push an EndFrame on the
    next BotStoppedSpeakingFrame.
    """

    def __init__(self) -> None:
        super().__init__(name="wrap-up-hangup")
        self._buffer: list[str] = []
        self._buffering = False
        self._armed = False
        self._fired = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

        if self._fired:
            return

        if direction != FrameDirection.DOWNSTREAM:
            return

        if isinstance(frame, LLMFullResponseStartFrame):
            self._buffer = []
            self._buffering = True
            return

        if isinstance(frame, LLMFullResponseEndFrame):
            self._buffering = False
            text = "".join(self._buffer)
            self._buffer = []
            if _looks_like_wrapup(text):
                logger.info(
                    f"[wrap-up] sign-off detected; will end call after TTS drains: {text[:120]!r}"
                )
                self._armed = True
            return

        if (
            self._buffering
            and isinstance(frame, TextFrame)
            and not isinstance(frame, (TranscriptionFrame, InterimTranscriptionFrame))
        ):
            chunk = getattr(frame, "text", "")
            if chunk:
                self._buffer.append(chunk)
            return

        if self._armed and isinstance(frame, BotStoppedSpeakingFrame):
            self._fired = True
            self._armed = False
            logger.info("[wrap-up] audio drained — pushing EndFrame")
            await self.push_frame(EndFrame(), FrameDirection.DOWNSTREAM)


def _format_profile_snapshot(p: dict) -> str:
    """Render a profile_card row as a compact LLM-friendly snapshot.

    Filters out the empty-string sentinels Claude sometimes emits so we
    never tell the LLM "Tickets & cards: [, ]".
    """
    bits: list[str] = []
    name = (p.get("name") or "").strip()
    title = (p.get("title") or "").strip()
    years = p.get("years_experience") or 0
    location = (p.get("location") or "").strip()
    summary = (p.get("summary") or "").strip()
    tickets_raw = p.get("tickets_and_cards") or []
    projects_raw = p.get("recent_projects") or []
    tickets = [str(t).strip() for t in tickets_raw if str(t).strip()]
    if name:
        bits.append(f"Name: {name}")
    if title:
        bits.append(f"Trade: {title}")
    if isinstance(years, (int, float)) and years > 0:
        bits.append(f"Years experience: {int(years)}")
    if location:
        bits.append(f"Location: {location}")
    if summary:
        bits.append(f"Summary: {summary}")
    if tickets:
        bits.append("Tickets & cards: " + ", ".join(tickets))
    if projects_raw:
        proj_lines: list[str] = []
        for proj in projects_raw[:3]:
            if not isinstance(proj, dict):
                continue
            role = (proj.get("role") or "").strip()
            company = (proj.get("company") or "").strip()
            period = (proj.get("period") or "").strip()
            head = " — ".join([x for x in (role, company) if x])
            tail = f" ({period})" if period else ""
            if head:
                proj_lines.append(f"- {head}{tail}")
        if proj_lines:
            bits.append("Recent projects:\n" + "\n".join(proj_lines))
    return "\n".join(bits) if bits else "(profile exists but is mostly empty — use this call to enrich it)"


def _clean_ai_text(s: str) -> str:
    """Tighten LLM streaming output for human display.

    Streaming concatenation can leave things like 'I 'm' or 'Hi there ,'.
    LLM also wraps direct speech in quotes per system-prompt examples; strip
    those wrapping pairs so transcript bubbles read clean.
    """
    if not s:
        return ""
    t = s.strip()
    # Drop a single layer of wrapping ASCII or smart quotes.
    pairs = [('"', '"'), ("“", "”"), ("'", "'"), ("‘", "’")]
    for o, c in pairs:
        if len(t) >= 2 and t.startswith(o) and t.endswith(c):
            t = t[1:-1].strip()
            break
    # Collapse any double spaces and squeeze spaces around common punctuation.
    import re

    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"\s+'(\w)", r"'\1", t)  # "I 'm" → "I'm"
    return t.strip()


# ---------------------------------------------------------------------------
# Pipeline factory
# ---------------------------------------------------------------------------


@dataclass
class AgentConfig:
    session_id: str
    language: str = "en"
    audience: str = "worker"
    inbound: bool = False  # True for hotline calls (no web form pre-fill)
    surface: str = "phone"  # "phone" (Twilio Media Streams, 8kHz mu-law) or
                            # "web" (browser mic, 16kHz int16 PCM)
    # Existing profile_card for the candidate, if any. Populated by main.py
    # before the pipeline starts. Lets the kickoff branch into a "welcome
    # back" path for returning callers.
    existing_profile: Optional[dict] = None


async def build_pipeline(transport: FastAPIWebsocketTransport, cfg: AgentConfig):
    # Deepgram tuning — switched from "multi" to the per-call language hint
    # because cofounder feedback flagged STT misses + lag. "multi" runs the
    # multilingual model which is slower and less confident on softer EN
    # speech. The hotline still supports 30+ languages because cfg.language
    # is set per-session by /intake/start or the inbound webhook.
    stt = DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        model="nova-3",
        language=cfg.language or "en",
        name="deepgram-stt",
    )

    llm = GroqLLMService(
        api_key=os.environ["GROQ_API_KEY"],
        model="llama-3.1-8b-instant",
        name="groq-llm",
    )

    tts = CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        voice_id=os.getenv("CARTESIA_VOICE_ID", DEFAULT_CARTESIA_VOICE),
        model="sonic-2",
        params=CartesiaTTSService.InputParams(
            language=cfg.language,
        ),
        name="cartesia-tts",
    )

    # Universal LLMContext + LLMContextAggregatorPair (the non-deprecated
    # path in pipecat 0.0.108). The deprecated OpenAIUserContextAggregator
    # silently drops LLMRunFrame, which is why our previous kickoff
    # attempts produced no LLM call and no Cartesia connect.
    context = LLMContext()
    system_prompt = _select_system_prompt(
        cfg.audience, has_existing_profile=bool(cfg.existing_profile)
    )
    logger.info(
        f"[agent] system prompt: "
        f"audience={cfg.audience} returning={bool(cfg.existing_profile)} "
        f"chose={'candidate' if system_prompt is CANDIDATE_SYSTEM_PROMPT else 'employer' if system_prompt is EMPLOYER_SYSTEM_PROMPT else 'combined'}"
    )
    context.add_message({"role": "system", "content": system_prompt})

    # Returning-caller awareness: bake the existing profile into the
    # system context as a structured snapshot, so the LLM can greet by
    # name, offer to read it back, or pick up where the candidate left off.
    if cfg.existing_profile:
        snap = _format_profile_snapshot(cfg.existing_profile)
        context.add_message(
            {
                "role": "system",
                "content": (
                    "RETURNING CANDIDATE — they've talked to GigGrab before. "
                    "Their existing profile on file:\n"
                    f"{snap}\n\n"
                    "Behaviour:\n"
                    "• Greet them BY NAME and acknowledge they're back.\n"
                    "• Offer three options in one short sentence: update "
                    "their profile, hear what's on file, or just add new "
                    "details.\n"
                    "• Never re-ask things you already know unless they "
                    "say something has changed.\n"
                    "• If they ask you to read it back, summarise the snapshot "
                    "above in two sentences max."
                ),
            }
        )
    # VAD tuning — defaults (confidence=0.7, stop_secs=0.8, min_volume=0.6)
    # were dropping softer / accented speech and waiting too long after the
    # caller finished talking. Lowering thresholds + cutting stop_secs to
    # 500 ms makes the agent respond faster and pick up quieter utterances.
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.55,
                    stop_secs=0.5,
                    min_volume=0.5,
                ),
            ),
        ),
    )

    normalizer = CandidateTextNormalizer()
    db_writer_user = TranscriptDbWriter(cfg.session_id, role="candidate")
    db_writer_ai = TranscriptDbWriter(cfg.session_id, role="ai")
    wrap_up_hangup = WrapUpHangup()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            normalizer,         # rewrites spell-out patterns before LLM sees them
            db_writer_user,     # captures candidate's TranscriptionFrames
            user_aggregator,
            llm,
            db_writer_ai,       # captures AI's TextFrame chunks before TTS
            tts,
            transport.output(),
            assistant_aggregator,
            wrap_up_hangup,     # ends the call after the sign-off audio drains
        ]
    )

    # Sample rate depends on the transport protocol — Twilio Media Streams
    # is 8 kHz mu-law, browser raw-PCM is 16 kHz. Set both inputs+outputs
    # to match the surface so the audio path doesn't resample lossily.
    sr = 16000 if cfg.surface == "web" else 8000
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=sr,
            audio_out_sample_rate=sr,
            allow_interruptions=True,
        ),
    )

    # Canonical pipecat 0.0.108 kickoff (matches
    # pipecat-examples/twilio-chatbot/inbound/bot.py): on connect, append a
    # user-role instruction telling the LLM what to do first, then queue
    # LLMRunFrame to trigger the LLM. Now works because db_writer no longer
    # drops frames in transit.
    @transport.event_handler("on_client_connected")
    async def _on_connect(t, client):
        logger.info(
            f"[agent] on_client_connected fired (session={cfg.session_id} inbound={cfg.inbound} returning={bool(cfg.existing_profile)})"
        )
        if cfg.existing_profile:
            # Returning candidate — we know who they are. Greet by name,
            # offer the three options. Recording reminder is short because
            # they've heard it before. The system message already loaded
            # the profile snapshot.
            name = (cfg.existing_profile.get("name") or "").strip()
            named = name if name else "there"
            kickoff = (
                f"This caller already has a profile on file. Greet them in "
                f"TWO short sentences. First sentence: "
                f"'Welcome back, {named} — quick reminder, this call is "
                f"recorded.' Second sentence: 'Want to update your profile, "
                f"hear what's on file, or add something new?' Nothing else."
            )
        elif cfg.audience == "employer":
            # Returning hotline caller previously classified as employer.
            # Skip intent question entirely; go straight to employer flow.
            kickoff = (
                "An employer just dialled GigGrab's hotline — we've "
                "spoken to them before. Greet them in English in TWO "
                "short sentences. First sentence: 'Hi — GigGrab here, "
                "this call is recorded.' Second sentence: 'Who am I "
                "speaking with, and which role are we working on today?' "
                "Nothing else."
            )
        elif cfg.inbound:
            # Hotline caller whose intent we don't yet know — combined
            # prompt handles the branching. UK GDPR Art 13 + ICO call-
            # recording guidance + Twilio AI-disclosure best practice are
            # all baked into the disclosure sentence below.
            kickoff = (
                "An inbound caller just dialled GigGrab's hotline and we "
                "don't yet know what they need. Greet them in English in "
                "TWO short sentences. First sentence: 'Hi — you've "
                "reached GigGrab, this call is recorded and you're "
                "talking to an AI recruiter.' Second sentence: 'Are you "
                "here looking for work, or are you hiring people?' "
                "Nothing else. Wait for their answer, then branch as the "
                "system prompt instructs."
            )
        else:
            # Outbound call from /start — caller already ticked consent on
            # the web form. We still announce recording on the call itself
            # because consent must be informed AND verifiable in audio.
            kickoff = (
                f"The call just connected. The candidate already picked "
                f"'{cfg.language}' as their call language — stay in "
                f"{cfg.language} unless they switch first. Greet them in "
                f"TWO short sentences. First sentence: 'Hi, this is "
                f"GigGrab's AI recruiter — this call is recorded so we can "
                f"build your CV.' Second sentence: ask their name. Nothing "
                f"else."
            )
        context.add_message({"role": "user", "content": kickoff})
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnect(t, client):
        await db.update_session_status(
            session_id=cfg.session_id, status="completed", ended=True
        )
        await task.queue_frame(EndFrame())

    return task, context, user_aggregator


async def run_agent(websocket, cfg: AgentConfig, *, stream_sid: str):
    # stream_sid is Twilio's MZ… identifier from the start frame; the serializer
    # echoes it back on every outbound media frame so Twilio routes audio to
    # the right call leg. cfg.session_id is OUR DB session UUID — separate concern.
    #
    # In Pipecat 0.0.108 auto_hang_up lives on InputParams (not a direct
    # kwarg). We disable it so the serializer doesn't try to call Twilio's
    # REST API when the pipeline ends — the candidate hangs up their phone,
    # Twilio closes the WS, and on_client_disconnected marks the session
    # completed in DB. To enable agent-initiated hangup later, pass
    # call_sid + account_sid + auth_token + params with auto_hang_up=True.
    serializer = TwilioFrameSerializer(
        stream_sid=stream_sid,
        params=TwilioFrameSerializer.InputParams(auto_hang_up=False),
    )
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
            # vad_analyzer moved to LLMUserAggregatorParams in build_pipeline
            # (pipecat 0.0.108 deprecation).
        ),
    )

    task, _context, _user_aggregator = await build_pipeline(transport, cfg)

    await db.update_session_status(session_id=cfg.session_id, status="in_progress")

    # Kickoff happens inside on_client_connected (registered in build_pipeline).
    runner = PipelineRunner()
    await runner.run(task)


async def run_web_agent(websocket, cfg: AgentConfig):
    """Browser-direct path. Same Pipeline, different transport+serializer.

    Wire format is raw int16 PCM at 16 kHz mono in both directions. No
    stream_sid — the WS connection IS the call. cfg.surface should be "web".
    """
    from .web_serializer import RawPcm16Serializer  # avoid import-cycle on phone-only deploys

    serializer = RawPcm16Serializer()
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    task, _context, _user_aggregator = await build_pipeline(transport, cfg)
    await db.update_session_status(session_id=cfg.session_id, status="in_progress")

    runner = PipelineRunner()
    await runner.run(task)
