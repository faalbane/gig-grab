"""Raw 16-bit PCM audio serializer for the browser-direct WebSocket path.

Browsers can stream `Int16Array` PCM at 16 kHz mono with very little JS;
this serializer plugs into Pipecat's `FastAPIWebsocketTransport` to do the
same round-trip Twilio Media Streams does, minus the JSON / mu-law wrapper.

Wire format:
- Inbound (browser → agent): every binary WS message is a chunk of int16
  little-endian PCM samples at 16 kHz mono. Text messages are ignored.
- Outbound (agent → browser): every `OutputAudioRawFrame` becomes a binary
  WS message containing its raw bytes (already int16 PCM at the pipeline's
  out sample rate, set by the transport params).
"""

from __future__ import annotations

from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    OutputAudioRawFrame,
    StartFrame,
)
from pipecat.serializers.base_serializer import FrameSerializer


class RawPcm16Serializer(FrameSerializer):
    """Pipecat <-> browser: 16 kHz mono int16 PCM, binary WS frames.

    Newer pipecat versions dropped the FrameSerializerType / `type`
    property pattern; the transport now infers BINARY vs TEXT from the
    `serialize()` return type (`bytes` → binary WS frame, `str` → text).
    """

    SAMPLE_RATE = 16000

    def __init__(self) -> None:
        super().__init__()

    async def setup(self, frame: StartFrame) -> None:
        # Sample rate is fixed; nothing to negotiate.
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        # Ignore text control messages from the browser for now — we only
        # care about the audio bytes.
        if isinstance(data, str):
            return None
        if not data:
            return None
        return InputAudioRawFrame(
            audio=bytes(data),
            sample_rate=self.SAMPLE_RATE,
            num_channels=1,
        )

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            # Raw int16 PCM bytes — the browser plays them through an
            # AudioContext at the pipeline's `audio_out_sample_rate`.
            return frame.audio
        # Other frame types stay internal (not echoed to the browser).
        return None
