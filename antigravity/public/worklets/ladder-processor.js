/**
 * Aether Model D — Nonlinear 4-Pole Ladder Filter AudioWorklet
 *
 * Combines Zero-Delay Feedback (TPT) exact cutoff calibration (10 Hz - 20 kHz)
 * with Huovilainen-inspired 2x oversampling, thermal drive, and asymmetric
 * transistor-pair saturation (`enhancedTanh`) for classic analog warmth and
 * musical self-oscillation without high-frequency instability.
 */

const OVERSAMPLE = 2;
const MAX_FEEDBACK = 4.65; // Self-oscillation threshold ~4.0 (emphasis ~8.6+)
const THERMAL_DRIVE = 1.5;
const INV_THERMAL_DRIVE = 1 / THERMAL_DRIVE;
const CUTOFF_MIN = 12;
const CUTOFF_MAX_RATIO = 0.45;

function enhancedTanh(x) {
  const clamped = Math.max(-6, Math.min(6, x));
  const t = Math.tanh(clamped);
  // Subtle analog asymmetry for rich even + odd harmonics
  const asym = clamped >= 0 ? 1.0 : 0.972;
  return t * asym;
}

class AetherLadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "cutoffMod",
        defaultValue: 0,
        minValue: -12,
        maxValue: 12,
        automationRate: "a-rate",
      },
      {
        name: "emphasis",
        defaultValue: 0,
        minValue: 0,
        maxValue: 10,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.s0 = 0;
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.prevIn = 0;
    this.downPrev = 0;
    this.dcIn = 0;
    this.dcOut = 0;

    this.cutTarget = 1000;
    this.cutSmooth = 1000;
    this.empSmooth = 0;

    // Filter Contour Envelope (0..1)
    this.env = 0;
    this.envStage = "idle"; // "idle" | "attack" | "decay" | "release"
    this.contourOct = 0;
    this.attackS = 0.01;
    this.decayS = 0.3;
    this.sustain = 0.45;
    this.decaySwitchOn = false;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "params") {
        if (typeof msg.cutoffHz === "number") {
          this.cutTarget = Math.max(CUTOFF_MIN, Math.min(32000, msg.cutoffHz));
        }
        if (typeof msg.contourOct === "number") {
          this.contourOct = msg.contourOct;
        }
        if (typeof msg.attackS === "number") {
          this.attackS = Math.max(0.001, msg.attackS);
        }
        if (typeof msg.decayS === "number") {
          this.decayS = Math.max(0.002, msg.decayS);
        }
        if (typeof msg.sustain === "number") {
          this.sustain = Math.max(0, Math.min(1, msg.sustain));
        }
        if (typeof msg.decaySwitchOn === "boolean") {
          this.decaySwitchOn = msg.decaySwitchOn;
        }
      } else if (msg.type === "noteOn") {
        this.envStage = this.attackS <= 0.002 ? "decay" : "attack";
        if (this.attackS <= 0.002) {
          this.env = 1;
        }
      } else if (msg.type === "noteOff") {
        this.envStage = "release";
      } else if (msg.type === "reset") {
        this.s0 = this.s1 = this.s2 = this.s3 = 0;
        this.prevIn = 0;
        this.downPrev = 0;
        this.env = 0;
        this.envStage = "idle";
      }
    };
  }

  computeG(cutoffHz) {
    const osRate = sampleRate * OVERSAMPLE;
    const fc = Math.max(CUTOFF_MIN, Math.min(cutoffHz, osRate * CUTOFF_MAX_RATIO));
    const wd = (2 * Math.PI * fc) / osRate;
    const g = Math.tan(Math.min(wd * 0.5, Math.PI * 0.44));
    return g / (1 + g);
  }

  runStage(x, G, k) {
    const om = 1 - G;
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;

    const S = om * (G3 * this.s0 + G2 * this.s1 + G * this.s2 + this.s3);
    const u = enhancedTanh((x - k * S) / (1 + k * G4));

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

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const inCh = input && input[0] ? input[0] : null;
    const outCh = output[0];
    const modArr = parameters.cutoffMod;
    const empArr = parameters.emphasis;
    const modIsArray = modArr.length > 1;
    const targetEmp = empArr[0];
    const frames = outCh.length;

    const cutAlpha = 1 - Math.exp(-1 / (0.006 * sampleRate));
    const empAlpha = 1 - Math.exp(-1 / (0.008 * sampleRate));

    for (let i = 0; i < frames; i++) {
      const rawIn = inCh ? inCh[i] : 0;

      // DC blocker
      const dcBlocked = rawIn - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = rawIn;
      this.dcOut = dcBlocked;

      // Smooth parameters
      this.cutSmooth += (this.cutTarget - this.cutSmooth) * cutAlpha;
      this.empSmooth += (targetEmp - this.empSmooth) * empAlpha;

      // Advance filter envelope
      if (this.envStage === "attack") {
        const step = 1 / Math.max(1, this.attackS * sampleRate);
        this.env += step;
        if (this.env >= 1) {
          this.env = 1;
          this.envStage = "decay";
        }
      } else if (this.envStage === "decay") {
        const tau = Math.max(0.002, this.decayS * 0.35);
        const coef = 1 - Math.exp(-1 / (tau * sampleRate));
        this.env += (this.sustain - this.env) * coef;
        if (Math.abs(this.env - this.sustain) < 1e-4) {
          this.env = this.sustain;
        }
      } else if (this.envStage === "release") {
        const relS = this.decaySwitchOn
          ? Math.max(0.008, this.decayS)
          : Math.max(0.006, Math.min(0.08, this.decayS * 0.12));
        const tau = Math.max(0.002, relS * 0.35);
        const coef = 1 - Math.exp(-1 / (tau * sampleRate));
        this.env += (0 - this.env) * coef;
        if (this.env < 1e-4) {
          this.env = 0;
          this.envStage = "idle";
        }
      }

      const modOct = modIsArray ? modArr[i] : modArr[0];
      const totalOct = this.contourOct * this.env + modOct;
      const effCutoff = this.cutSmooth * Math.pow(2, totalOct);

      const G = this.computeG(effCutoff);
      // Musical resonance curve matching Model D feedback behavior
      const normEmp = Math.max(0, Math.min(1, this.empSmooth / 10));
      const curvedEmp = normEmp < 0.7 ? normEmp * 0.95 : 0.665 + (normEmp - 0.7) * 1.1167;
      const k = MAX_FEEDBACK * curvedEmp;

      const xScaled = dcBlocked * THERMAL_DRIVE;
      const xHalf = 0.5 * (this.prevIn + xScaled);
      this.prevIn = xScaled;

      const ya = this.runStage(xHalf, G, k);
      const yb = this.runStage(xScaled, G, k);
      const y = 0.25 * this.downPrev + 0.5 * ya + 0.25 * yb;
      this.downPrev = yb;

      // Guard against numerical instability
      if (!Number.isFinite(y)) {
        this.s0 = this.s1 = this.s2 = this.s3 = 0;
        this.prevIn = 0;
        this.downPrev = 0;
        outCh[i] = 0;
      } else {
        outCh[i] = Math.tanh(y * INV_THERMAL_DRIVE * 1.05);
      }
    }

    return true;
  }
}

registerProcessor("aether-ladder-processor", AetherLadderProcessor);
