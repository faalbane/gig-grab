"use client";

/**
 * Browser-direct voice agent client.
 *
 * Captures mic audio via an AudioWorklet, ships int16 PCM chunks at 16 kHz
 * to the agent's /web-ws endpoint, and plays back int16 PCM chunks the
 * agent sends back through an AudioContext queue.
 */

const SAMPLE_RATE = 16000;

export type VoiceCallController = {
  state: "connecting" | "live" | "ended" | "error";
  end(): Promise<void>;
};

export type VoiceCallEvents = {
  onStateChange?: (state: VoiceCallController["state"]) => void;
  onError?: (err: Error) => void;
};

export async function startVoiceCall(
  wsUrl: string,
  events: VoiceCallEvents = {},
): Promise<VoiceCallController> {
  let state: VoiceCallController["state"] = "connecting";
  const setState = (s: VoiceCallController["state"]) => {
    state = s;
    events.onStateChange?.(s);
  };

  // 1) Mic + AudioContext at the browser's native rate (we resample in the
  // worklet). Many devices can't run AudioContext at exactly 16k.
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });
  const audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule("/audio/mic-worklet.js");

  const source = audioCtx.createMediaStreamSource(mediaStream);
  const worklet = new AudioWorkletNode(audioCtx, "mic-capture", {
    processorOptions: { targetSampleRate: SAMPLE_RATE },
  });

  // Playback queue using buffered AudioBuffer scheduling.
  const playbackCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  let nextStartAt = 0;
  function playPcm(int16: Int16Array) {
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    const buf = playbackCtx.createBuffer(1, f32.length, SAMPLE_RATE);
    buf.copyToChannel(f32, 0);
    const src = playbackCtx.createBufferSource();
    src.buffer = buf;
    src.connect(playbackCtx.destination);
    const now = playbackCtx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartAt);
    src.start(startAt);
    nextStartAt = startAt + buf.duration;
  }

  // 2) WebSocket
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
  };

  ws.addEventListener("open", () => {
    setState("live");
    source.connect(worklet);
    // Don't connect worklet to destination — we don't want mic echoed locally.
  });
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") return;
    const int16 = new Int16Array(ev.data as ArrayBuffer);
    if (int16.length > 0) playPcm(int16);
  });
  ws.addEventListener("error", () => {
    events.onError?.(new Error("WebSocket error"));
    setState("error");
  });
  ws.addEventListener("close", () => {
    if (state !== "ended") setState("ended");
  });

  async function end() {
    try {
      worklet.disconnect();
      source.disconnect();
      mediaStream.getTracks().forEach((t) => t.stop());
      if (ws.readyState === WebSocket.OPEN) ws.close();
      await audioCtx.close().catch(() => undefined);
      await playbackCtx.close().catch(() => undefined);
    } finally {
      setState("ended");
    }
  }

  return {
    get state() {
      return state;
    },
    end,
  };
}
