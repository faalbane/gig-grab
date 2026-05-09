// AudioWorklet that captures mono float32 audio at the AudioContext's
// sample rate, downsamples to 16 kHz int16, and posts ArrayBuffer chunks
// to the main thread for transmission over the WebSocket.

class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetSampleRate = opts.targetSampleRate || 16000;
    // sampleRate is a global provided by AudioWorkletGlobalScope.
    this.inputSampleRate = sampleRate;
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    // Buffer chunks until we've accumulated ~20ms at target rate (320 samples).
    this.chunkSize = Math.round(this.targetSampleRate * 0.02);
    this.buffer = new Int16Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0]; // mono

    // Naive linear downsample. Voice quality is fine; we're already at
    // ~48k → 16k for typical mic.
    const outLength = Math.floor(channel.length / this.ratio);
    const downsampled = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const src = channel[Math.floor(i * this.ratio)] || 0;
      // Clamp + scale float [-1, 1] → int16.
      const v = Math.max(-1, Math.min(1, src));
      downsampled[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }

    // Append to running buffer; ship complete chunks.
    const merged = new Int16Array(this.buffer.length + downsampled.length);
    merged.set(this.buffer);
    merged.set(downsampled, this.buffer.length);
    this.buffer = merged;

    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.slice(0, this.chunkSize);
      // Transfer the underlying buffer to avoid copy.
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
      this.buffer = this.buffer.slice(this.chunkSize);
    }
    return true;
  }
}

registerProcessor("mic-capture", MicCaptureProcessor);
