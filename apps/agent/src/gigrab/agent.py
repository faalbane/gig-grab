"""Gig-grab voice agent — Pipecat pipeline tuned for the candidate-intake call.

Stack:
  Twilio Media Streams (WebSocket) → Silero VAD → Deepgram Nova-3 multi (STT)
  → Groq Llama 3.1 8B (LLM, ~100ms TTFT) → Cartesia Sonic-3 (TTS, multilingual)
  → back to Twilio.

Plus a side-channel that streams transcript turns into Postgres.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    EndFrame,
    Frame,
    TranscriptionFrame,
    TextFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.groq import GroqLLMService
from pipecat.transports.network.fastapi_websocket import (
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

        # AI text frames (TextFrame is what the LLM emits before TTS).
        if isinstance(frame, TextFrame) and direction == FrameDirection.DOWNSTREAM:
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

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    context = OpenAILLMContext(messages=messages)
    context_aggregator = llm.create_context_aggregator(context)

    db_writer = TranscriptDbWriter(cfg.session_id)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            db_writer,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
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

    @transport.event_handler("on_client_connected")
    async def _on_connect(t, client):
        await db.update_session_status(session_id=cfg.session_id, status="in_progress")
        # Have the AI speak the localized greeting via TTS directly. The LLM
        # takes over once the candidate responds.
        from prompts.candidate_interview import CallContext
        ctx = CallContext(language=cfg.language, e164="", audience=cfg.audience)
        await task.queue_frames([TTSSpeakFrame(text=render_initial_message(ctx))])

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnect(t, client):
        await db.update_session_status(
            session_id=cfg.session_id, status="completed", ended=True
        )
        await task.queue_frame(EndFrame())

    return task


async def run_agent(websocket, cfg: AgentConfig):
    serializer = TwilioFrameSerializer(stream_sid=cfg.session_id)
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    task = await build_pipeline(transport, cfg)
    runner = PipelineRunner()
    await runner.run(task)
