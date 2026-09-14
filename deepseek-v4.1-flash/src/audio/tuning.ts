/**
 * Pitch, range and keyboard-tracking maths (PRD AUD-3, AUD-7, AUD-10, AUD-13).
 *
 * Everything here is pure so the offline tests can assert the ranges, the
 * octave multipliers and the key-tracking percentages without an AudioContext.
 */

/** Oscillator pitch reference (PRD AUD-13: A = 440 Hz at Tune = 0). */
export const A4_HZ = 440;
export const A4_MIDI = 69;

/** Lowest and highest keys, F2..C6 (PRD 6.5 #36). */
export const FIRST_MIDI = 41;
export const LAST_MIDI = 84;

/** Key used as the pivot for keyboard tracking (PRD AUD-7). */
export const KEY_TRACK_PIVOT_MIDI = 60;

/** Key-tracking contribution in octaves-per-octave for each KC switch. */
export const KC1_OCTAVES = 1.0; // +100 % / octave
export const KC2_OCTAVES = 0.5; // +50 % / octave

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** MIDI note -> display name, e.g. 60 -> "C4". */
export function noteName(midi: number): string {
  const clamped = Math.round(midi);
  const name = NOTE_NAMES[((clamped % 12) + 12) % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

/**
 * MIDI note -> frequency in Hz, including the master Tune offset in cents
 * (PRD AUD-13) and an optional extra detune in cents.
 */
export function midiToFrequency(
  midi: number,
  tuneCents = 0,
  detuneCents = 0,
): number {
  const semitones = (midi - A4_MIDI) + (tuneCents + detuneCents) / 100;
  return A4_HZ * Math.pow(2, semitones / 12);
}

export function frequencyToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

// ---------------------------------------------------------------------------
// Oscillator frequency
// ---------------------------------------------------------------------------

/** Range detents -> octave multiplier (PRD 6.2 #6-8). */
export const RANGE_MULTIPLIER: Readonly<Record<string, number>> =
  Object.freeze({
    '32': 0.25,
    '16': 0.5,
    '8': 1,
    '4': 2,
    '2': 4,
    lo: 1 / 64,
  });

/**
 * Free-running LFO span used by Osc-3 in LO mode when its Control switch is off
 * (PRD AUD-3: "LO = 0.1-25 Hz low frequency mode"). The Frequency knob's full
 * +-700 cent travel spans exactly that range.
 */
export const LFO_MIN_HZ = 0.1;
export const LFO_MAX_HZ = 25;
const FREQ_KNOB_SPAN_CENTS = 700;

export interface OscFrequencyInput {
  /** Pitch of the currently played key, in Hz, already including master Tune. */
  readonly keyHz: number;
  readonly range: string;
  /** Osc-3 Control switch; true = follows the keyboard. */
  readonly keyboardTracked: boolean;
  /** This oscillator's Frequency knob, in cents. */
  readonly cents: number;
}

export function oscillatorFrequency(input: OscFrequencyInput): number {
  const { keyHz, range, keyboardTracked, cents } = input;

  // Osc-3 in LO with keyboard control released runs free as an LFO.
  if (range === 'lo' && !keyboardTracked) {
    const t =
      (cents + FREQ_KNOB_SPAN_CENTS) / (2 * FREQ_KNOB_SPAN_CENTS);
    return LFO_MIN_HZ * Math.pow(LFO_MAX_HZ / LFO_MIN_HZ, Math.min(1, Math.max(0, t)));
  }

  const multiplier = RANGE_MULTIPLIER[range] ?? 1;
  const base = keyboardTracked ? keyHz : A4_HZ;
  const hz = base * multiplier * Math.pow(2, cents / 1200);
  // Keep the pitch inside an audible / stable window.
  return Math.min(Math.max(hz, 0.05), 18_000);
}

// ---------------------------------------------------------------------------
// Keyboard tracking for the filter cutoff (PRD AUD-7)
// ---------------------------------------------------------------------------

/**
 * Extra cutoff in octaves contributed by the KC1 / KC2 switches, relative to
 * the tracking pivot. KC1 = +100 %/octave, KC2 = +50 %/octave; both together
 * land near +150 % (PRD AUD-7).
 */
export function keyTrackOctaves(
  midi: number,
  kc1: boolean,
  kc2: boolean,
): number {
  const octavesFromPivot = (midi - KEY_TRACK_PIVOT_MIDI) / 12;
  const amount = (kc1 ? KC1_OCTAVES : 0) + (kc2 ? KC2_OCTAVES : 0);
  return octavesFromPivot * amount;
}

// ---------------------------------------------------------------------------
// Glide (PRD AUD-10)
// ---------------------------------------------------------------------------

export const GLIDE_MIN_SECONDS = 0.005;
export const GLIDE_MAX_SECONDS = 2.5;

/**
 * Glide knob position (0..1) -> `setTargetAtTime` time constant.
 *
 * The knob maps exponentially onto 5 ms .. 2.5 s; position 0 means "off", which
 * we express as the fastest possible settle. The returned value is the time
 * constant, not the full travel time, because the pitch is automated with
 * `setTargetAtTime` (PRD 8.4), where ~4 time constants is a full-settle glide.
 */
export function glideTimeConstant(pos: number): number {
  if (pos <= 0) return 0.0015;
  const seconds = GLIDE_MIN_SECONDS * Math.pow(GLIDE_MAX_SECONDS / GLIDE_MIN_SECONDS, pos);
  return seconds / 4;
}

export function glideSecondsForDisplay(pos: number): number {
  if (pos <= 0) return 0;
  return GLIDE_MIN_SECONDS * Math.pow(GLIDE_MAX_SECONDS / GLIDE_MIN_SECONDS, pos);
}

// ---------------------------------------------------------------------------
// Modulation depth
// ---------------------------------------------------------------------------

/** Full-scale pitch modulation depth in cents at Mod Wheel = 100 %. */
export const PITCH_MOD_MAX_CENTS = 1200;

/** Full-scale filter modulation depth in octaves at Mod Wheel = 100 %. */
export const FILTER_MOD_MAX_OCTAVES = 4;

/** Contour Amount 0-10 -> filter envelope depth in octaves. */
export function contourDepthOctaves(amount: number): number {
  const norm = Math.min(10, Math.max(0, amount)) / 10;
  return 5 * norm;
}

/** Emphasis 0-10 -> filter drive compensation (keeps loudness roughly steady). */
export function emphasisCompensation(emphasis: number): number {
  const norm = Math.min(1, Math.max(0, emphasis / 10));
  return 1 / (1 + 0.35 * norm);
}
