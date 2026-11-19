import type { OscRange } from "../state/types.ts";

export const RANGE_MULTIPLIERS: Record<OscRange, number> = {
  lo: 0.08, // Sub-audio LFO / ultra-low drone range (authentic LO setting)
  "32": 0.25,
  "16": 0.5,
  "8": 1.0,
  "4": 2.0,
  "2": 4.0,
};

const CUTOFF_MIN_HZ = 14;
const CUTOFF_MAX_HZ = 22000;
const CUTOFF_LOG_RATIO = Math.log(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ);

/**
 * Maps filter cutoff knob (-5..+5) to Hz (14 Hz .. 22 kHz) using the
 * musical nonlinear response curve so presets cover warm sub-bass to open brass.
 */
export function mapCutoff(val: number): number {
  const clamped = Math.max(-5, Math.min(5, val));
  const norm = (clamped + 5) / 10;
  const curved = Math.pow(norm, 0.72);
  return CUTOFF_MIN_HZ * Math.exp(curved * CUTOFF_LOG_RATIO);
}

/**
 * Maps 0..10 envelope knob to seconds using a piecewise logarithmic curve
 * closely matching authentic analog Attack / Decay time stops.
 */
export function mapEnvelopeTime(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  if (clamped <= 0) return 0.002;
  const stops = [
    { k: 0, s: 0.002 },
    { k: 1, s: 0.012 },
    { k: 3, s: 0.14 },
    { k: 5, s: 0.55 },
    { k: 7, s: 1.6 },
    { k: 9, s: 5.0 },
    { k: 10, s: 10.0 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (clamped >= a.k && clamped <= b.k) {
      const t = (clamped - a.k) / (b.k - a.k);
      return a.s + t * (b.s - a.s);
    }
  }
  return 10.0;
}

/**
 * Maps 0..10 contour amount knob to filter modulation octaves (0..6.5 octaves).
 */
export function mapContourOctaves(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  return Math.pow(clamped / 10, 0.8) * 6.5;
}

/**
 * Logarithmic volume taper (0..10 -> 0..1) mimicking analog audio potentiometers.
 */
export function mapVolumeGain(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  if (clamped <= 0.01) return 0;
  const norm = clamped / 10;
  return Math.pow(norm, 1.85);
}

/**
 * Maps Glide knob (0..10) to portamento time constant in seconds.
 */
export function mapGlideTime(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  return 0.006 * Math.pow(1.68, clamped);
}

/**
 * Maps LFO Rate knob (0..10) to Hz (0.2 Hz .. 20 Hz).
 */
export function mapLfoRate(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  return 0.2 * Math.pow(100, clamped / 10);
}

/**
 * Maps Delay Time knob (0..10) to seconds (0.02s .. 1.2s).
 */
export function mapDelayTimeSec(val: number): number {
  const clamped = Math.max(0, Math.min(10, val));
  return 0.02 + Math.pow(clamped / 10, 1.4) * 1.18;
}

/**
 * Maps Pitch Wheel (0..100, center 50) to semitones (-5 .. +5).
 */
export function mapPitchWheelSemitones(val: number): number {
  const clamped = Math.max(0, Math.min(100, val));
  return ((clamped - 50) / 50) * 5;
}

/**
 * Maps MIDI note number (0..127) to Hz (A4 = 440 Hz).
 */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Computes oscillator frequency in Hz given MIDI note, range, semitone offset,
 * master tune, and pitch bend.
 */
export function computeOscHz(
  midi: number,
  range: OscRange,
  detuneSemi: number,
  masterTuneSemi: number,
  pitchBendSemi: number,
  microDetuneCents = 0,
): number {
  const base = midiToHz(midi);
  const mult = RANGE_MULTIPLIERS[range] ?? 1;
  const totalSemi = detuneSemi + masterTuneSemi + pitchBendSemi + microDetuneCents / 100;
  const hz = base * mult * Math.pow(2, totalSemi / 12);
  return Math.max(0.5, Math.min(20000, hz));
}

/**
 * Computes keyboard tracking octave offset relative to middle reference note (C4 = 60).
 * KC1 = 1/3 tracking, KC2 = 2/3 tracking, both = 1.0 (full 1V/oct tracking).
 */
export function computeKeyTrackingOctaves(midi: number, kc1: boolean, kc2: boolean): number {
  const weight = (kc1 ? 1 / 3 : 0) + (kc2 ? 2 / 3 : 0);
  if (weight === 0) return 0;
  return ((midi - 60) / 12) * weight;
}
