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
import time
from dataclasses import dataclass

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    EndFrame,
    Frame,
    InterimTranscriptionFrame,
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
    SYSTEM_PROMPT,
    render_initial_message,
    CallContext,
)

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


class TranscriptDbWriter(FrameProcessor):
    def __init__(self, session_id: str):
        super().__init__(name="transcript-db-writer")
        self.session_id = session_id
        self.start_ms = int(time.time() * 1000)
        self._ord = 0

    def _next_ord(self) -> int:
        n = self._ord
        self._ord += 1
        return n

    def _ms(self) -> int:
        return int(time.time() * 1000) - self.start_ms

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        # DIAG: surface frames flowing through this point so we can confirm
        # whether LLMRunFrame / TTSSpeakFrame / OpenAILLMContextFrame reach
        # past the input transport + STT.
        ftype = type(frame).__name__
        if ftype not in {
            "AudioRawFrame",
            "InputAudioRawFrame",
            "OutputAudioRawFrame",
            "InterimTranscriptionFrame",
        }:
            logger.info(f"[db-writer] saw {ftype} dir={direction.name}")

        # Candidate speech (only finals — interim transcripts churn too much).
        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            try:
                await db.write_transcript_turn(
                    session_id=self.session_id,
                    ord_=self._next_ord(),
                    speaker="candidate",
                    text=frame.text.strip(),
                    ms_offset=self._ms(),
                )
            except Exception as e:  # never break the pipeline on DB errors
                logger.warning(f"[db] candidate turn write failed: {e}")

        # AI text frames (TextFrame is what the LLM/TTS emits). Pipecat's
        # TranscriptionFrame and InterimTranscriptionFrame inherit from
        # TextFrame — exclude them so we don't capture STT output as "ai".
        if (
            isinstance(frame, TextFrame)
            and not isinstance(frame, (TranscriptionFrame, InterimTranscriptionFrame))
            and direction == FrameDirection.DOWNSTREAM
        ):
            text = frame.text.strip() if hasattr(frame, "text") else ""
            if text:
                try:
                    await db.write_transcript_turn(
                        session_id=self.session_id,
                        ord_=self._next_ord(),
                        speaker="ai",
                        text=text,
                        ms_offset=self._ms(),
                    )
                except Exception as e:
                    logger.warning(f"[db] ai turn write failed: {e}")


# ---------------------------------------------------------------------------
# Pipeline factory
# ---------------------------------------------------------------------------


@dataclass
class AgentConfig:
    session_id: str
    language: str = "en"
    audience: str = "worker"


async def build_pipeline(transport: FastAPIWebsocketTransport, cfg: AgentConfig):
    stt = DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        model="nova-3",
        language="multi",  # code-switching across the supported 10 languages
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
    context.add_message({"role": "system", "content": SYSTEM_PROMPT})
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    db_writer = TranscriptDbWriter(cfg.session_id)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            db_writer,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,  # Twilio mu-law is 8kHz
            audio_out_sample_rate=8000,
            allow_interruptions=True,
        ),
    )

    # NOTE on the kickoff path: confirmed via diagnostic logs that
    # task.queue_frames([LLMRunFrame()]) at PipelineTask::Source is silently
    # dropped — the frame never reaches db_writer (which sits before the
    # user_aggregator). The on_client_connected handler used to do that
    # queue and was effectively a no-op. We now drive the kickoff in
    # run_agent() by calling user_aggregator.push_frame directly, which
    # injects the frame downstream of the source-routing chain. Keeping
    # this handler for the lifecycle log only.
    @transport.event_handler("on_client_connected")
    async def _on_connect(t, client):
        logger.info(f"[agent] on_client_connected fired (session={cfg.session_id})")

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

    task, context, user_aggregator = await build_pipeline(transport, cfg)

    await db.update_session_status(session_id=cfg.session_id, status="in_progress")

    runner = PipelineRunner()
    run_task = asyncio.create_task(runner.run(task))

    # Wait for StartFrame to fully propagate so Deepgram / TTS clients are
    # initialised before we push the kickoff downstream.
    await asyncio.sleep(2.0)

    # Add the kickoff "user" message and push LLMRunFrame DIRECTLY into the
    # user_aggregator. Going through task.queue_frames(...) routes through
    # PipelineTask::Source → RTVIProcessor → input transport → STT, which
    # silently drops control frames (confirmed via db-writer diagnostic
    # logs — only StartFrame ever passed through). push_frame from the
    # aggregator pushes downstream to LLM directly.
    kickoff = (
        f"You're starting an outbound call to a candidate. Greet them "
        f"warmly in {cfg.language}, introduce yourself as Sarah from "
        f"Gig-grab (an AI hiring assistant), and ask their name plus "
        f"the language they're most comfortable speaking. Under 25 words."
    )
    context.add_message({"role": "user", "content": kickoff})
    logger.info("[agent] kickoff via user_aggregator.push_frame(LLMRunFrame, DOWNSTREAM)")
    await user_aggregator.push_frame(LLMRunFrame(), FrameDirection.DOWNSTREAM)

    try:
        await run_task
    except asyncio.CancelledError:
        raise
