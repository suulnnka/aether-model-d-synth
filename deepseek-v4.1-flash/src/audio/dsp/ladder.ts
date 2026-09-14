/**
 * 4-pole transistor-ladder low-pass core — reference implementation.
 *
 * Topology
 * --------
 * Four one-pole TPT (topology-preserving transform) stages in cascade with a
 * feedback path from the 4th stage back into a saturating differential-pair
 * input, which is the defining structure of a ladder low-pass (PRD 5.6 AUD-6,
 * PRD 8.2 "zero-pole + saturating feedback").
 *
 * Why TPT + zero-delay feedback
 * -----------------------------
 * A TPT one-pole places its -45 degree point exactly at the requested cutoff
 * frequency. Four of them therefore hit exactly -180 degrees at the cutoff,
 * which means:
 *   - the resonant peak (and the self-oscillation tone) sits exactly on the
 *     cutoff frequency, honouring PRD AUD-6's "self-oscillation plays at the
 *     cutoff" behaviour, and
 *   - the critical feedback gain is exactly k = 4, so mapping emphasis 0-10
 *     onto k = 0-4.2 crosses into self-oscillation just above 9.5 (PRD 6.4 #22).
 *
 * The loop is solved in closed form each sample (no unit-delay approximation),
 * so high resonance does not detune the filter. A tanh() saturator on the
 * summing node supplies the analog compression and bounds the self-oscillation
 * amplitude to a stable limit cycle.
 *
 * The realtime AudioWorklet ships a numerically identical copy of this file.
 * `tests/ladder-parity.test.ts` executes both on the same input and fails if
 * they ever drift apart.
 */

/** Cutoff parameter domain: octaves above the 10 Hz base (PRD 6.4 #21). */
export const CUTOFF_BASE_HZ = 10;

export function hzToCutoffParam(hz: number): number {
  return Math.log2(Math.max(hz, 1e-3) / CUTOFF_BASE_HZ);
}

export function cutoffParamToHz(param: number): number {
  return CUTOFF_BASE_HZ * Math.pow(2, param);
}

/** Emphasis (0-10) -> normalised resonance (0-1). */
export function emphasisToResonance(emphasis: number): number {
  return Math.min(1, Math.max(0, emphasis / 10));
}

/**
 * Critical feedback gain is 4 for an ideal 4-pole ladder. Reaching 4.2 at
 * emphasis = 10 puts the self-oscillation threshold at emphasis ~9.52, which
 * matches the PRD's ">= 9.5 自激" acceptance line.
 */
export const MAX_FEEDBACK = 4.2;

/** Oversampling factor for the nonlinear stage (keeps alias energy down). */
export const OVERSAMPLE = 2;

/** Nyquist safety margin: the prewarped coefficient stays well inside range. */
const NYQUIST_MARGIN = 0.9;

export class LadderCore {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  /** Smoothed coefficients — parameter smoothing prevents zipper noise (PRD AUD-12). */
  private g = 0;
  private k = 0;

  private sampleRate = 48_000;

  /** Downsampling filter memory for the 2x oversampled nonlinear stage. */
  private downA = 0;
  private downB = 0;

  /** One-pole coefficient used to smooth cutoff / emphasis per sample. */
  private smoothCoef = 1;
  private smoothSeconds = 0.008;

  constructor(sampleRate: number, cutoffHz = 2200, emphasis = 3) {
    this.sampleRate = sampleRate;
    this.reset();
    this.setSmoothingSeconds(this.smoothSeconds);
    this.snapTo(cutoffHz, emphasis);
  }

  reset(): void {
    this.s0 = this.s1 = this.s2 = this.s3 = 0;
    this.downA = this.downB = 0;
  }

  /** Jump the smoothed coefficients straight to their targets (init / offline). */
  snapTo(cutoffHz: number, emphasis: number): void {
    this.g = this.computeG(cutoffHz);
    this.k = MAX_FEEDBACK * emphasisToResonance(emphasis);
  }

  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.smoothCoef = this.coefForSmoothing(this.smoothSeconds);
  }

  /**
   * Parameter smoothing time constant. PRD AUD-12 asks for roughly 5-15 ms so
   * that knob sweeps never produce zipper noise.
   */
  setSmoothingSeconds(seconds: number): void {
    this.smoothSeconds = Math.max(0, seconds);
    this.smoothCoef = this.coefForSmoothing(this.smoothSeconds);
  }

  private coefForSmoothing(seconds: number): number {
    if (seconds <= 0) return 1;
    return 1 - Math.exp(-1 / (seconds * this.sampleRate));
  }

  /**
   * Per-sample entry point: smooth the coefficients toward the incoming control
   * values, then run one sample of the ladder. The realtime worklet calls this
   * with exactly the same arguments, which is what keeps the two
   * implementations bit-comparable.
   */
  processWith(x: number, cutoffHz: number, emphasis: number): number {
    const a = this.smoothCoef;
    this.g += (this.computeG(cutoffHz) - this.g) * a;
    this.k +=
      (MAX_FEEDBACK * emphasisToResonance(emphasis) - this.k) * a;
    return this.process(x);
  }

  /**
   * TPT coefficient G = g / (1 + g) with g = tan(pi * fc / fs) evaluated at the
   * **oversampled** rate, because that is the rate the four stages actually run
   * at. Getting this wrong detunes the filter by the oversampling factor — the
   * self-oscillation test in `tests/ladder.test.ts` pins it down.
   */
  private computeG(cutoffHz: number): number {
    const fs = this.sampleRate * OVERSAMPLE;
    const fc = Math.min(Math.max(cutoffHz, 1), fs * 0.5 * NYQUIST_MARGIN);
    const wd = (2 * Math.PI * fc) / fs;
    const g = Math.tan(Math.min(wd * 0.5, Math.PI * 0.45));
    // Normalising by (1 + g) keeps G strictly inside [0, 1), which is what makes
    // the affine stage relation y = G*x + (1-G)*s unconditionally stable.
    return g / (1 + g);
  }

  /** Process one input sample at the base sample rate (oversampling applied inside). */
  process(x: number): number {
    const step = this.sampleRate * OVERSAMPLE;
    const g = this.g;
    const k = this.k;

    // --- upsample (linear) -------------------------------------------------
    const prev = this.downB;
    const a = prev + (x - prev) * 0.5;
    const b = x;

    const ya = this.stage(a, g, k, step);
    const yb = this.stage(b, g, k, step);

    // --- downsample: 3-tap half-band-ish FIR on the oversampled stream -----
    // out[n] = 0.25*ya[n-1] + 0.5*ya[n] + 0.25*yb[n]
    const out = 0.25 * this.downA + 0.5 * ya + 0.25 * yb;
    this.downA = yb;
    this.downB = x;
    return out;
  }

  /**
   * One oversampled ladder step.
   *
   * Solving the loop in closed form: a TPT one-pole is affine in its input
   * (`y = G*in + (1-G)*state`), so the cascade of four is
   * `y4 = G^4*u + S` where S collects the instantaneous state contributions.
   * Substituting into `u = x - k*y4` gives u directly.
   */
  private stage(x: number, G: number, k: number, _rate: number): number {
    const om = 1 - G;
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;

    const S =
      om * (G3 * this.s0 + G2 * this.s1 + G * this.s2 + this.s3);

    let u = (x - k * S) / (1 + k * G4);

    // Saturating differential pair at the summing node: gives the ladder its
    // compression, its harmonic character, and a bounded self-oscillation.
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

  /**
   * Analytic magnitude response of the *linear* ladder at `freq`.
   *
   * Each TPT one-pole is the bilinear image of 1/(1 + s/wc), so the open-loop
   * cascade is C = (1 + jr)^-4 with r = freq / cutoff. Closing the loop with
   * feedback k gives H = C / (1 + k*C), which is what this evaluates.
   *
   * The saturator is omitted: it is near-identity for the small signals the
   * offline sweep uses, and the measured test in `tests/ladder.test.ts` checks
   * the real implementation numerically anyway.
   */
  magnitudeAt(freq: number): number {
    const r = freq / this.cutoffHz();
    const re1 = 1;
    const im1 = r;
    // (1 + jr)^4 via two squarings.
    const re2 = re1 * re1 - im1 * im1;
    const im2 = 2 * re1 * im1;
    const re4 = re2 * re2 - im2 * im2;
    const im4 = 2 * re2 * im2;

    const denom = re4 * re4 + im4 * im4;
    // C = 1 / (1 + jr)^4
    const cre = re4 / denom;
    const cim = -im4 / denom;

    // H = C / (1 + k*C)
    const nre = 1 + this.k * cre;
    const nim = this.k * cim;
    const numMag = Math.hypot(cre, cim);
    const denMag = Math.hypot(nre, nim);
    return denMag === 0 ? 0 : numMag / denMag;
  }

  /** Current smoothed cutoff in Hz (for diagnostics / tests). */
  cutoffHz(): number {
    // Invert G = g/(1+g) then g = tan(pi*fc/fs), at the oversampled rate.
    const fs = this.sampleRate * OVERSAMPLE;
    const g = this.g >= 1 ? Infinity : this.g / (1 - this.g);
    return (Math.atan(g) * fs) / Math.PI;
  }

  /** Current feedback gain (for diagnostics / tests). */
  feedbackGain(): number {
    return this.k;
  }
}
