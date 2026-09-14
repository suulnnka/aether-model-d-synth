/**
 * Aether Model D — contour (envelope) generator, realtime AudioWorklet.
 *
 * Realtime twin of `src/audio/dsp/contour.ts`; the numeric core is a line-by-line
 * copy and `tests/contour-parity.test.ts` fails the build if they diverge.
 *
 * Outputs the envelope level (0..1) as an audio-rate control signal, which the
 * engine routes either into the VCA gain (loudness contour) or, scaled by the
 * Contour Amount knob, into the ladder cutoff parameter (filter contour).
 * Generating the contour at audio rate in the worklet is what allows the
 * re-trigger to start from the *current* level (PRD AUD-2) without any
 * cancel-and-hold gymnastics on the main thread.
 *
 * Parameters
 * ----------
 *   attack   k-rate  seconds
 *   decay    k-rate  seconds
 *   release  k-rate  seconds
 *   hold     k-rate  0..1 steady level after decay; 0 = percussive (PRD AUD-8)
 *   gate     a-rate  0 / 1; rising edge (re)triggers from the current level
 */

const TIME_CONSTANTS = Math.log(1e4);
const EPSILON = 1e-4;
const HOLD_LEVEL = 0.75;

class ContourCore {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.level = 0;
    this.stage = 'idle';
    this.attack = 0.005;
    this.decay = 0.3;
    this.release = 0.4;
    this.hold = HOLD_LEVEL;
    this.coefAttack = 1;
    this.coefDecay = 1;
    this.coefRelease = 1;
    this.recomputeCoefficients();
  }

  setSampleRate(sampleRate) {
    this.sampleRate = sampleRate;
    this.recomputeCoefficients();
  }

  setTimes(attack, decay, release) {
    this.attack = Math.max(1e-4, attack);
    this.decay = Math.max(1e-4, decay);
    this.release = Math.max(1e-4, release);
    this.recomputeCoefficients();
  }

  setHold(level) {
    this.hold = Math.min(1, Math.max(0, level));
  }

  recomputeCoefficients() {
    const fs = this.sampleRate;
    const coef = (seconds) =>
      1 - Math.exp(-TIME_CONSTANTS / (Math.max(seconds, 1e-4) * fs));
    this.coefAttack = Math.min(1, coef(this.attack));
    this.coefDecay = Math.min(1, coef(this.decay));
    this.coefRelease = Math.min(1, coef(this.release));
  }

  setGate(on) {
    if (on) {
      this.stage = 'attack';
    } else if (this.stage !== 'idle') {
      this.stage = 'release';
    }
  }

  process() {
    switch (this.stage) {
      case 'idle':
        return 0;

      case 'attack': {
        this.level += (1 - this.level) * this.coefAttack;
        if (Math.abs(1 - this.level) <= EPSILON) this.stage = 'decay';
        return this.level;
      }

      case 'decay': {
        if (this.hold === 0) {
          this.level -= this.level * this.coefDecay;
          if (this.level <= EPSILON) {
            this.level = 0;
            this.stage = 'idle';
          }
          return this.level;
        }
        this.level += (this.hold - this.level) * this.coefDecay;
        // Absolute distance: a signed test reports "arrived" as soon as the
        // attack peak overshoots the sustain level, skipping the decay stage.
        if (Math.abs(this.hold - this.level) <= EPSILON) {
          // Land exactly on the sustain level (see the TS twin for rationale).
          this.level = this.hold;
          this.stage = 'hold';
        }
        return this.level;
      }

      case 'hold':
        return this.level;

      case 'release': {
        this.level -= this.level * this.coefRelease;
        if (this.level <= EPSILON) {
          this.level = 0;
          this.stage = 'idle';
        }
        return this.level;
      }

      default:
        return 0;
    }
  }
}

class AetherContourProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack', defaultValue: 0.005, minValue: 1e-4, maxValue: 10, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.3, minValue: 1e-4, maxValue: 10, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.4, minValue: 1e-4, maxValue: 10, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: HOLD_LEVEL, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.core = new ContourCore(sampleRate);
    this.lastGate = false;
    this.holdSeen = HOLD_LEVEL;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    // --- control-rate updates (once per render quantum) --------------------
    const attack = parameters.attack[0];
    const decay = parameters.decay[0];
    const release = parameters.release[0];
    const hold = parameters.hold[0];

    if (
      attack !== this.core.attack ||
      decay !== this.core.decay ||
      release !== this.core.release
    ) {
      this.core.setTimes(attack, decay, release);
    }
    // Snap the hold target so switch flips take effect immediately; the
    // envelope's own one-pole keeps the audible transition smooth.
    if (hold !== this.holdSeen) {
      this.holdSeen = hold;
      this.core.setHold(hold);
    }

    // --- audio-rate gate handling + envelope generation --------------------
    const gate = parameters.gate;
    const out = output[0];
    const frames = out.length;

    for (let i = 0; i < frames; i += 1) {
      const g = (gate.length > 1 ? gate[i] : gate[0]) > 0.5;
      if (g !== this.lastGate) {
        this.core.setGate(g);
        this.lastGate = g;
      }
      out[i] = this.core.process();
    }

    return true;
  }
}

registerProcessor('aether-contour', AetherContourProcessor);
