/**
 * Aether Model D — 4-pole ladder low-pass, realtime AudioWorklet.
 *
 * This file is the realtime twin of `src/audio/dsp/ladder.ts`. The numeric core
 * below is a line-by-line copy of that reference implementation: four TPT
 * one-pole stages in cascade, feedback into a saturating summing node, closed
 * form zero-delay feedback solution, 2x oversampling around the nonlinearity.
 *
 * `tests/ladder-parity.test.ts` runs both implementations over the same input
 * and parameter sweep and fails the build if their output ever diverges.
 *
 * Parameters
 * ----------
 *   cutoff   a-rate   log2(Hz / 10)   -- a musical (exponential) domain, so
 *                                        modulation and key tracking are
 *                                        additive in octaves (PRD AUD-7, AUD-9)
 *   emphasis k-rate   0..10           -- maps to feedback gain 0..4.2, crossing
 *                                        into self-oscillation above ~9.5
 *                                        (PRD AUD-6, PRD 6.4 #22)
 */

const OVERSAMPLE = 2;
const MAX_FEEDBACK = 4.2;
const NYQUIST_MARGIN = 0.9;
const CUTOFF_BASE_HZ = 10;
const SMOOTH_SECONDS = 0.008;

class LadderCore {
  constructor(sampleRate, cutoffHz, emphasis) {
    this.sampleRate = sampleRate;
    this.s0 = 0;
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.downA = 0;
    this.downB = 0;
    this.g = 0;
    this.k = 0;
    this.smoothCoef = 1;
    this.smoothSeconds = SMOOTH_SECONDS;
    this.setSmoothingSeconds(this.smoothSeconds);
    this.snapTo(cutoffHz, emphasis);
  }

  coefForSmoothing(seconds) {
    if (seconds <= 0) return 1;
    return 1 - Math.exp(-1 / (seconds * this.sampleRate));
  }

  setSmoothingSeconds(seconds) {
    this.smoothSeconds = Math.max(0, seconds);
    this.smoothCoef = this.coefForSmoothing(this.smoothSeconds);
  }

  setSampleRate(sampleRate) {
    this.sampleRate = sampleRate;
    this.smoothCoef = this.coefForSmoothing(this.smoothSeconds);
  }

  computeG(cutoffHz) {
    const fs = this.sampleRate * OVERSAMPLE;
    const fc = Math.min(Math.max(cutoffHz, 1), fs * 0.5 * NYQUIST_MARGIN);
    const wd = (2 * Math.PI * fc) / fs;
    const g = Math.tan(Math.min(wd * 0.5, Math.PI * 0.45));
    return g / (1 + g);
  }

  snapTo(cutoffHz, emphasis) {
    this.g = this.computeG(cutoffHz);
    this.k = MAX_FEEDBACK * Math.min(1, Math.max(0, emphasis / 10));
  }

  processWith(x, cutoffHz, emphasis) {
    const a = this.smoothCoef;
    this.g += (this.computeG(cutoffHz) - this.g) * a;
    this.k +=
      (MAX_FEEDBACK * Math.min(1, Math.max(0, emphasis / 10)) - this.k) * a;
    return this.process(x);
  }

  process(x) {
    const g = this.g;
    const k = this.k;

    const prev = this.downB;
    const a = prev + (x - prev) * 0.5;
    const b = x;

    const ya = this.stage(a, g, k);
    const yb = this.stage(b, g, k);

    const out = 0.25 * this.downA + 0.5 * ya + 0.25 * yb;
    this.downA = yb;
    this.downB = x;
    return out;
  }

  stage(x, G, k) {
    const om = 1 - G;
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;

    const S = om * (G3 * this.s0 + G2 * this.s1 + G * this.s2 + this.s3);

    let u = (x - k * S) / (1 + k * G4);
    u = Math.tanh(u);

    let v = (u - this.s0) * G;
    const y0 = v + this.s0;
    this.s0 = y0 + v;

    v = (y0 - this.s1) * G;
    const y1 = v + this.s1;
    this.s1 = y1 + v;

    v = (y1 - this.s2) * G;
    const y2 = v + this.s2;
    this.s2 = y2 + v;

    v = (y2 - this.s3) * G;
    const y3 = v + this.s3;
    this.s3 = y3 + v;

    return y3;
  }
}

class AetherLadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'cutoff',
        defaultValue: Math.log2(2200 / CUTOFF_BASE_HZ),
        // Generous bounds: base cutoff, key tracking, contour and modulation all
        // sum into this parameter. The core clamps the resulting hertz.
        minValue: -8,
        maxValue: 32,
        automationRate: 'a-rate',
      },
      {
        name: 'emphasis',
        defaultValue: 3,
        minValue: 0,
        maxValue: 10,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.core = new LadderCore(
      sampleRate,
      typeof opts.cutoffHz === 'number' ? opts.cutoffHz : 2200,
      typeof opts.emphasis === 'number' ? opts.emphasis : 3,
    );
    this.bypass = false;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'reset') this.core.s0 = this.core.s1 = this.core.s2 = this.core.s3 = 0;
      if (data.type === 'snap') {
        this.core.snapTo(data.cutoffHz, data.emphasis);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const out = output[0];
    const cutoff = parameters.cutoff;
    const emphasisArr = parameters.emphasis;
    const frames = out.length;

    // No upstream signal: keep the filter running (self-oscillation is a
    // legitimate output) but avoid reading a missing buffer.
    const inChannel = input && input[0] ? input[0] : null;

    for (let i = 0; i < frames; i += 1) {
      const x = inChannel ? inChannel[i] : 0;
      const cv = cutoff.length > 1 ? cutoff[i] : cutoff[0];
      const ev = emphasisArr.length > 1 ? emphasisArr[i] : emphasisArr[0];
      out[i] = this.core.processWith(x, CUTOFF_BASE_HZ * Math.pow(2, cv), ev);
    }

    return true;
  }
}

registerProcessor('aether-ladder', AetherLadderProcessor);
