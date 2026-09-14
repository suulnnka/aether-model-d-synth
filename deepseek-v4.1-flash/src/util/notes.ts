/**
 * MIDI note helpers shared by the keyboard driver, the readout and the tests.
 */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Scientific pitch notation, e.g. 60 -> "C4". */
export function noteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const name = NAMES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

/** True for the five black keys of an octave. */
export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

/** Semitone offset from the previous C — used by the keyboard map's readout. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}
