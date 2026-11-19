/**
 * Aether Model D — Analog Tape-Style Delay AudioWorklet
 *
 * Features interpolated fractional delay reads, smooth delay-time slewing
 * (authentic tape-speed pitch shifts when sweeping Delay Time), soft feedback
 * saturation, and a warm 1-pole feedback damping filter.
 */

class AetherDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "delayTime",
        defaultValue: 0.35,
        minValue: 0.01,
        maxValue: 2.0,
        automationRate: "k-rate",
      },
      {
        name: "feedback",
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: 0.92,
        automationRate: "k-rate",
      },
      {
        name: "mix",
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: "k-rate",
      },
      {
        name: "enabled",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.bufferSize = Math.ceil(sampleRate * 2.5);
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.smoothDelaySamples = 0.35 * sampleRate;
    this.smoothMix = 0;
    this.smoothEnabled = 0;
    this.dampState = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const inCh = input && input[0] ? input[0] : null;
    const outCh = output[0];
    const frames = outCh.length;

    const targetTime = Math.max(0.01, Math.min(2.0, parameters.delayTime[0]));
    const targetSamples = targetTime * sampleRate;
    const feedback = Math.max(0, Math.min(0.92, parameters.feedback[0]));
    const targetMix = Math.max(0, Math.min(1, parameters.mix[0]));
    const targetEnabled = parameters.enabled[0] >= 0.5 ? 1 : 0;

    const timeAlpha = 1 - Math.exp(-1 / (0.045 * sampleRate));
    const ctrlAlpha = 1 - Math.exp(-1 / (0.012 * sampleRate));

    for (let i = 0; i < frames; i++) {
      const dry = inCh ? inCh[i] : 0;

      this.smoothDelaySamples += (targetSamples - this.smoothDelaySamples) * timeAlpha;
      this.smoothMix += (targetMix - this.smoothMix) * ctrlAlpha;
      this.smoothEnabled += (targetEnabled - this.smoothEnabled) * ctrlAlpha;

      // Fractional linear interpolated read
      let readPos = this.writeIndex - this.smoothDelaySamples;
      while (readPos < 0) readPos += this.bufferSize;
      const idx0 = Math.floor(readPos) % this.bufferSize;
      const idx1 = (idx0 + 1) % this.bufferSize;
      const frac = readPos - Math.floor(readPos);
      const delayed = this.buffer[idx0] * (1 - frac) + this.buffer[idx1] * frac;

      // Warm tape damping & soft saturation in feedback loop
      this.dampState += (delayed - this.dampState) * 0.42;
      const fbSample = Math.tanh(dry + this.dampState * feedback);
      this.buffer[this.writeIndex] = fbSample;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      const wetGain = this.smoothMix * this.smoothEnabled;
      // Wet-only aux send or dry+wet blend; here returns pure wet signal scaled by mix
      // when wired in parallel aux send, or blended cleanly. We output wet-scaled echo!
      outCh[i] = delayed * wetGain;
    }

    return true;
  }
}

registerProcessor("aether-delay-processor", AetherDelayProcessor);
