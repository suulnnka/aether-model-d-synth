/**
 * Control position -> audio-domain value.
 *
 * The ParamStore holds normalised knob positions; the engine needs hertz,
 * seconds, cents and gains. Every conversion the engine performs lives here so
 * that the knob taper can be audited in one place (and asserted in tests).
 */

import {
  RANGE_0_10,
  RANGE_CUTOFF,
  RANGE_ENV_TIME,
  centsRange,
  levelToGain,
  toValue,
  volumeToGain,
} from '../state/range.ts';
import {
  MASTER_TUNE_CENTS,
  PITCH_WHEEL_CENTS,
} from '../state/range.ts';
import { hzToCutoffParam } from './dsp/ladder.ts';
import { contourDepthOctaves, keyTrackOctaves } from './tuning.ts';

const TUNE_RANGE = centsRange(MASTER_TUNE_CENTS);
const OSC_CENTS_RANGE = centsRange(700);

/** 0-10 knob position -> its 0-10 engineering value. */
export function knob010(pos: number): number {
  return toValue(RANGE_0_10, pos);
}

/** Cutoff knob position -> octaves above 10 Hz (the ladder's parameter domain). */
export function cutoffOctaves(pos: number): number {
  return hzToCutoffParam(toValue(RANGE_CUTOFF, pos));
}

/** Envelope stage knob position -> seconds. */
export function envSeconds(pos: number): number {
  return toValue(RANGE_ENV_TIME, pos);
}

/** Mixer channel position -> linear gain. */
export function channelGain(pos: number): number {
  return levelToGain(knob010(pos));
}

/** Main Volume position -> output gain (pre-saturation). */
export function masterGain(pos: number): number {
  return volumeToGain(knob010(pos));
}

/** Tune knob position -> cents. */
export function tuneCents(pos: number): number {
  return toValue(TUNE_RANGE, pos);
}

/** Per-oscillator Frequency knob position -> cents. */
export function oscCents(pos: number): number {
  return toValue(OSC_CENTS_RANGE, pos);
}

/** Pitch wheel position (0.5 = centre) -> cents. */
export function pitchBendCents(pos: number): number {
  return (pos - 0.5) * 2 * PITCH_WHEEL_CENTS;
}

/** Filter contour depth in octaves for a Contour Amount knob position. */
export function contourDepth(pos: number): number {
  return contourDepthOctaves(knob010(pos));
}

/** Keyboard tracking in octaves for the current key + KC switch states. */
export function keyboardTrack(
  midi: number | null,
  kc1: boolean,
  kc2: boolean,
): number {
  if (midi === null) return 0;
  return keyTrackOctaves(midi, kc1, kc2);
}

/** Mod Mix position -> [osc3 gain, noise gain] crossfade. */
export function modMixGains(pos: number): [number, number] {
  const value = knob010(pos);
  return [(10 - value) / 10, value / 10];
}
