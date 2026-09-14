/**
 * Ladder low-pass acceptance tests.
 *
 * Covers the three filter claims the PRD makes testable:
 *   AUD-6 / PRD 11.2   24 dB/oct slope, measured through the real kernel
 *   AUD-6 / PRD 6.4 #22  self-oscillation above emphasis ~9.5
 *   AUD-6               self-oscillation tone sits on the cutoff frequency
 *
 * Measurements drive the actual `LadderCore` sample by sample, so they validate
 * the shipped algorithm rather than an idealised formula.
 */

import { describe, expect, it } from 'vitest';
import {
  LadderCore,
  MAX_FEEDBACK,
  cutoffParamToHz,
  emphasisToResonance,
  hzToCutoffParam,
} from '../src/audio/dsp/ladder.ts';

const FS = 48_000;

/** Steady-state gain at `freq` for a small-signal sine input. */
function measureGain(fc: number, emphasis: number, freq: number): number {
  const filter = new LadderCore(FS, fc, emphasis);
  const amplitude = 0.05;
  const settleSamples = Math.floor(FS * 1.5);
  const measureSamples = Math.floor(FS * 0.5);

  let sumSquares = 0;
  const total = settleSamples + measureSamples;
  for (let i = 0; i < total; i += 1) {
    const x = amplitude * Math.sin((2 * Math.PI * freq * i) / FS);
    const y = filter.processWith(x, fc, emphasis);
    if (i >= settleSamples) sumSquares += y * y;
  }
  const rms = Math.sqrt(sumSquares / measureSamples);
  return rms / (amplitude / Math.SQRT2);
}

function toDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-12));
}

describe('ladder slope', () => {
  it('measures 24 dB/oct beyond the cutoff', () => {
    const fc = 500;
    const g1 = measureGain(fc, 0, 2 * fc);
    const g2 = measureGain(fc, 0, 8 * fc);
    const drop = toDb(g2) - toDb(g1);
    // Two octaves of a 4-pole roll-off is -48 dB.
    expect(drop).toBeGreaterThan(-52);
    expect(drop).toBeLessThan(-44);
  });

  it('is roughly flat below the cutoff', () => {
    const fc = 1000;
    const low = toDb(measureGain(fc, 0, 50));
    // A ladder passes DC at unity, so a 50 Hz tone should be near 0 dB.
    expect(low).toBeGreaterThan(-1.5);
    expect(low).toBeLessThan(1.5);
  });

  it('matches the analytic response within 2 dB', () => {
    const fc = 800;
    const probe = new LadderCore(FS, fc, 0);
    for (const freq of [400, 800, 2000, 4000]) {
      const measured = toDb(measureGain(fc, 0, freq));
      const analytic = toDb(probe.magnitudeAt(freq));
      expect(Math.abs(measured - analytic)).toBeLessThan(2);
    }
  });
});

describe('cutoff parameter domain', () => {
  it('round-trips hertz to octaves above 10 Hz', () => {
    for (const hz of [10, 100, 2200, 18_000]) {
      expect(cutoffParamToHz(hzToCutoffParam(hz))).toBeCloseTo(hz, 6);
    }
    expect(hzToCutoffParam(10)).toBeCloseTo(0, 12);
    expect(hzToCutoffParam(20)).toBeCloseTo(1, 12);
  });

  it('tracks the requested cutoff in the prewarped coefficient', () => {
    const filter = new LadderCore(FS, 1234, 0);
    const g = Math.tan((Math.PI * 1234) / FS);
    expect(filter.cutoffHz()).toBeCloseTo((Math.atan(g) * FS) / Math.PI, 3);
  });
});

describe('emphasis -> feedback gain', () => {
  it('crosses the k = 4 self-oscillation threshold just above emphasis 9.5', () => {
    expect(MAX_FEEDBACK * emphasisToResonance(9.5)).toBeLessThan(4);
    expect(MAX_FEEDBACK * emphasisToResonance(10)).toBeGreaterThan(4);
    // PRD 6.4 #22 says self-oscillation starts at ">= 9.5".
    const threshold = 4 / MAX_FEEDBACK;
    expect(threshold * 10).toBeGreaterThan(9.4);
    expect(threshold * 10).toBeLessThan(9.6);
  });
});

/** Root-mean-square of the tail of a self-oscillation run. */
function oscillationTail(
  emphasis: number,
  fc: number,
  seconds = 1.6,
): Float32Array {
  const filter = new LadderCore(FS, fc, emphasis);
  const total = Math.floor(FS * seconds);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    // A single sample of excitation, then silence: the loop must sustain itself.
    const x = i === 0 ? 0.001 : 0;
    out[i] = filter.processWith(x, fc, emphasis);
  }
  return out;
}

function rms(samples: Float32Array, from: number): number {
  let sum = 0;
  let n = 0;
  for (let i = from; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
    n += 1;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

/** Peak absolute value, or NaN if any sample was not finite. */
function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const magnitude = Math.abs(samples[i]);
    if (!Number.isFinite(magnitude)) return Number.NaN;
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

/** Fundamental of the tail, estimated from positive-going zero crossings. */
function estimateFrequency(samples: Float32Array, from: number): number {
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = Math.max(1, from); i < samples.length; i += 1) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      crossings += 1;
      if (first < 0) first = i;
      last = i;
    }
  }
  if (crossings < 2 || last <= first) return 0;
  const periods = crossings - 1;
  return (periods * FS) / (last - first);
}

describe('self-oscillation', () => {
  it('does not oscillate at the factory emphasis', () => {
    const tail = oscillationTail(3, 400);
    expect(rms(tail, Math.floor(FS))).toBeLessThan(1e-3);
  });

  it('oscillates at maximum emphasis', () => {
    const tail = oscillationTail(10, 400);
    expect(rms(tail, Math.floor(FS))).toBeGreaterThan(0.05);
  });

  it('oscillates at the cutoff frequency', () => {
    for (const fc of [150, 400, 1200]) {
      const tail = oscillationTail(10, fc);
      const measured = estimateFrequency(tail, Math.floor(FS));
      // PRD AUD-6: the self-oscillation tone must be playable, i.e. it has to
      // land on the cutoff the knob (and key tracking) asks for.
      expect(measured).toBeGreaterThan(fc * 0.9);
      expect(measured).toBeLessThan(fc * 1.12);
    }
  });

  it('stays bounded and finite across the whole emphasis range', () => {
    for (const emphasis of [0, 2.5, 5, 7.5, 9.5, 10]) {
      const peak = peakOf(oscillationTail(emphasis, 900));
      expect(Number.isFinite(peak)).toBe(true);
      expect(peak).toBeLessThan(4);
    }
  });

  it('is stable at extreme cutoffs', () => {
    for (const fc of [10, 100, 5000, 18_000]) {
      const peak = peakOf(oscillationTail(10, fc, 0.6));
      expect(Number.isFinite(peak)).toBe(true);
      expect(peak).toBeLessThan(4);
    }
  });
});
