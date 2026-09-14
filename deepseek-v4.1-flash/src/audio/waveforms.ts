/**
 * Band-limited wave shapes (PRD AUD-3 / AUD-4).
 *
 * The six oscillator wave shapes are defined by their Fourier series exactly as
 * the PRD's control table orders them: triangle, sawtooth, reverse sawtooth,
 * square, wide pulse, narrow pulse.
 *
 * Antialiasing: the coefficients are handed to `createPeriodicWave`, which every
 * current engine renders from per-octave band-limited tables. That is the
 * platform's supported way of producing an alias-free oscillator (PRD AUD-4),
 * and the in-browser self-test measures the alias floor to prove it.
 *
 * `harmonicsFor()` is a pure function so the offline tests can assert spectral
 * facts (sawtooth 1/n roll-off, square odd-harmonic-only, pulse duty cycle)
 * without an AudioContext.
 */

export type WaveformId =
  | 'triangle'
  | 'saw'
  | 'revsaw'
  | 'square'
  | 'widePulse'
  | 'narrowPulse';

export const WAVEFORM_IDS: readonly WaveformId[] = Object.freeze([
  'triangle',
  'saw',
  'revsaw',
  'square',
  'widePulse',
  'narrowPulse',
]);

/** Pulse duty cycles. Narrow is the thin, nasal setting; wide is the buzzy one. */
export const PULSE_DUTY: Readonly<Record<string, number>> = Object.freeze({
  widePulse: 0.35,
  narrowPulse: 0.15,
});

/** Harmonic count handed to the periodic wave builder. */
export const HARMONIC_COUNT = 512;

export interface Harmonics {
  readonly real: Float32Array;
  readonly imag: Float32Array;
}

/**
 * Fourier coefficients for `waveform`, using the Web Audio convention
 *
 *   x(t) = sum over k >= 1 of  real[k]*cos(2*pi*k*t) + imag[k]*sin(2*pi*k*t)
 *
 * Index 0 is left at zero: the PRD's mixer has no DC path, and a DC component
 * would only offset the ladder filter.
 */
export function harmonicsFor(
  waveform: WaveformId,
  count: number = HARMONIC_COUNT,
): Harmonics {
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);

  switch (waveform) {
    case 'saw':
    case 'revsaw': {
      // Standard sawtooth series: 1/n harmonic roll-off, alternating sign.
      const sign = waveform === 'saw' ? 1 : -1;
      for (let n = 1; n <= count; n += 1) {
        imag[n] = (sign * (2 / Math.PI) * (n % 2 === 1 ? 1 : -1)) / n;
      }
      break;
    }

    case 'triangle': {
      // Odd harmonics only, 1/n^2 roll-off, alternating sign every other odd.
      for (let n = 1; n <= count; n += 2) {
        const k = (n - 1) / 2;
        imag[n] = ((8 / (Math.PI * Math.PI)) * (k % 2 === 0 ? 1 : -1)) / (n * n);
      }
      break;
    }

    case 'square': {
      // Odd harmonics only, 1/n roll-off.
      for (let n = 1; n <= count; n += 2) {
        imag[n] = (4 / Math.PI) / n;
      }
      break;
    }

    case 'widePulse':
    case 'narrowPulse': {
      const duty = PULSE_DUTY[waveform];
      for (let n = 1; n <= count; n += 1) {
        const theta = Math.PI * n * duty;
        real[n] = (4 / (Math.PI * n)) * Math.sin(theta) * Math.cos(theta);
        imag[n] = (4 / (Math.PI * n)) * Math.sin(theta) * Math.sin(theta);
      }
      break;
    }
  }

  return { real, imag };
}

/* ---------------------------------------------------------------------------
 * PeriodicWave cache
 * ------------------------------------------------------------------------- */

const waveCache = new WeakMap<
  BaseAudioContext,
  Map<WaveformId, PeriodicWave>
>();

/**
 * Build (and memoise) a `PeriodicWave` for `waveform`.
 *
 * Default normalisation is left enabled so that every wave shape arrives at the
 * mixer with comparable peak amplitude; the mixer faders, not the wave shape,
 * decide loudness.
 */
export function periodicWaveFor(
  ctx: BaseAudioContext,
  waveform: WaveformId,
): PeriodicWave {
  let perContext = waveCache.get(ctx);
  if (!perContext) {
    perContext = new Map();
    waveCache.set(ctx, perContext);
  }
  const cached = perContext.get(waveform);
  if (cached) return cached;

  const { real, imag } = harmonicsFor(waveform);
  const wave = ctx.createPeriodicWave(real, imag);
  perContext.set(waveform, wave);
  return wave;
}

/** Narrow a stored selector value to a WaveformId, falling back to sawtooth. */
export function asWaveform(value: string): WaveformId {
  return (WAVEFORM_IDS as readonly string[]).includes(value)
    ? (value as WaveformId)
    : 'saw';
}
