/**
 * Continuous-range mapping helpers.
 *
 * The ParamStore stores every continuous control as a *normalised position*
 * in [0, 1]. That position is the single physical truth: it is exactly the
 * knob's rotation fraction, so it round-trips through persistence and drives
 * both the 3D pose and the audio engine from one number (PRD ST-1).
 *
 * Specs convert position <-> domain value through a curve. PRD 6 asks for
 * linear tapers on 0-10 controls and logarithmic tapers on frequency / time
 * controls, so those are the two curves we implement.
 */

export type Curve = 'lin' | 'log';

export interface RangeSpec {
  readonly min: number;
  readonly max: number;
  readonly curve: Curve;
  /** Unit suffix used by the default formatter. */
  readonly unit: string;
  /** Decimal places used by the default formatter. */
  readonly decimals: number;
  /** Optional formatter override, e.g. for frequency / time prettifying. */
  readonly format?: (value: number) => string;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Position in [0,1] -> domain value. */
export function toValue(range: RangeSpec, pos: number): number {
  const p = clamp01(pos);
  if (range.curve === 'log') {
    // log taper requires a strictly positive, non-degenerate span
    const lo = Math.max(range.min, Number.EPSILON);
    const hi = Math.max(range.max, lo * (1 + 1e-9));
    return lo * Math.pow(hi / lo, p);
  }
  return range.min + p * (range.max - range.min);
}

/** Domain value -> position in [0,1]. */
export function toPos(range: RangeSpec, value: number): number {
  const v = clamp(value, range.min, range.max);
  if (range.curve === 'log') {
    const lo = Math.max(range.min, Number.EPSILON);
    const hi = Math.max(range.max, lo * (1 + 1e-9));
    return clamp01(Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo));
  }
  if (range.max === range.min) return 0;
  return clamp01((v - range.min) / (range.max - range.min));
}

export function formatValue(range: RangeSpec, value: number): string {
  if (range.format) return range.format(value);
  const text = value.toFixed(range.decimals);
  return range.unit ? `${text} ${range.unit}` : text;
}

/* ---------------------------------------------------------------------------
 * Reusable range definitions
 * ------------------------------------------------------------------------- */

/** Classic 0-10 panel taper (level, glide, emphasis, contour, volume). */
export const RANGE_0_10: RangeSpec = Object.freeze({
  min: 0,
  max: 10,
  curve: 'lin',
  unit: '',
  decimals: 1,
});

/** Oscillator / master detune in cents. */
export function centsRange(span: number): RangeSpec {
  return Object.freeze({
    min: -span,
    max: span,
    curve: 'lin' as Curve,
    unit: 'cents',
    decimals: 0,
    format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)} cents`,
  });
}

/** Ladder cutoff, 10 Hz..18 kHz over a log taper (PRD 6.4 #21). */
export const RANGE_CUTOFF: RangeSpec = Object.freeze({
  min: 10,
  max: 18_000,
  curve: 'log' as Curve,
  unit: 'Hz',
  decimals: 0,
  format: (v: number) =>
    v >= 1000
      ? `${(v / 1000).toFixed(v >= 10_000 ? 1 : 2)} kHz`
      : `${v.toFixed(v < 100 ? 1 : 0)} Hz`,
});

/** Envelope stage time, 1 ms..10 s over a log taper (PRD AUD-8). */
export const RANGE_ENV_TIME: RangeSpec = Object.freeze({
  min: 0.001,
  max: 10,
  curve: 'log' as Curve,
  unit: 's',
  decimals: 3,
  format: (v: number) =>
    v < 0.01
      ? `${(v * 1000).toFixed(1)} ms`
      : v < 1
        ? `${(v * 1000).toFixed(0)} ms`
        : `${v.toFixed(2)} s`,
});

/** Glide is a 0-10 knob whose *time* mapping is exponential (PRD AUD-10). */
export const GLIDE_MIN_SECONDS = 0.005;
export const GLIDE_MAX_SECONDS = 2.5;

export function glideSeconds(pos: number): number {
  const p = clamp01(pos);
  if (p <= 0) return 0;
  return GLIDE_MIN_SECONDS * Math.pow(GLIDE_MAX_SECONDS / GLIDE_MIN_SECONDS, p);
}

/** Pitch wheel travel (PRD 6.5 #37: +-240 cents, spring centred). */
export const PITCH_WHEEL_CENTS = 240;

/** Master tune travel (PRD AUD-13: +-200 cents, A=440). */
export const MASTER_TUNE_CENTS = 200;

/* ---------------------------------------------------------------------------
 * Envelope contour: loudness uses a dedicated amp envelope node per VCO --
 * we keep the log time taper shared with RANGE_ENV_TIME.
 * ------------------------------------------------------------------------- */

/** Mixer channel level 0-10 -> linear gain (with a gentle taper for feel). */
export function levelToGain(value: number): number {
  const v = clamp(value, 0, 10) / 10;
  return v * v * 0.9 + v * 0.1;
}

/**
 * Main output volume 0-10 -> gain before the output soft-clip stage.
 *
 * Calibrated so the factory patch (two saws at 8, filter half open, Volume 6)
 * peaks near -7 dBFS: loud enough to be the obvious listening level, with the
 * headroom the output saturator needs to do its job.
 */
export function volumeToGain(value: number): number {
  const v = clamp(value, 0, 10) / 10;
  return Math.pow(v, 1.6) * 1.8;
}

/** Fixed trim on the mixer bus so a full stack of sources hits the ladder hot. */
export const MIX_BUS_TRIM = 0.5;
