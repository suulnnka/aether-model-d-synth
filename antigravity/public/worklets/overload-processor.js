/**
 * Aether Model D — Overload & RMS Level Meter AudioWorklet
 *
 * Monitors mixer output pre-filter to light the classic red Overload jewel
 * LED and feed smooth RMS levels to the HUD meter.
 */

class AetherOverloadProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.lastOverload = false;
    this.lastLevel = 0;
    this.counter = 0;
    this.holdFrames = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const inCh = input && input[0] ? input[0] : null;
    const outCh = output && output[0] ? output[0] : null;

    if (!inCh) {
      if (outCh) outCh.fill(0);
      return true;
    }

    let peak = 0;
    let sumSq = 0;
    const len = inCh.length;
    for (let i = 0; i < len; i++) {
      const s = inCh[i];
      if (outCh) outCh[i] = s;
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sumSq += s * s;
    }

    const rms = Math.sqrt(sumSq / len);
    if (peak > 0.42) {
      this.holdFrames = 14; // Brief LED persistence (~40ms) for visual clarity
    } else if (this.holdFrames > 0) {
      this.holdFrames--;
    }

    const overload = this.holdFrames > 0;
    const normLevel = Math.min(1, rms * 1.9);

    this.counter++;
    if (
      overload !== this.lastOverload ||
      (this.counter % 4 === 0 && Math.abs(normLevel - this.lastLevel) > 0.01)
    ) {
      this.lastOverload = overload;
      this.lastLevel = normLevel;
      this.port.postMessage({ overload, level: normLevel });
    }

    return true;
  }
}

registerProcessor("aether-overload-processor", AetherOverloadProcessor);
