/**
 * Parity between the reference DSP kernels and the realtime AudioWorklet
 * processors that actually ship in `public/worklets/`.
 *
 * The two implementations are intentionally separate files (a worklet cannot
 * import from the bundle), which means they can drift. These tests execute the
 * real worklet source inside a sandbox and compare it sample by sample against
 * `src/audio/dsp/*` over a parameter sweep. If anyone edits one without the
 * other, this fails.
 */

import { describe, expect, it } from 'vitest';
import {
  LadderCore,
  cutoffParamToHz,
  hzToCutoffParam,
} from '../src/audio/dsp/ladder.ts';
import { ContourCore } from '../src/audio/dsp/contour.ts';
import { constParam, loadProcessor, runSample } from './helpers/worklet.ts';

const FS = 48_000;

/**
 * AudioWorklet parameters arrive as Float32 and its output buffer is Float32,
 * so the reference must be fed the same rounded input and its result compared
 * after the same rounding. With that discipline the two implementations must be
 * *bit-identical*; a loose tolerance would let a real drift hide.
 */
const f32 = Math.fround;

/** Largest absolute gap seen, plus the count of samples that differed at all. */
interface Comparison {
  worst: number;
  mismatches: number;
}

function compare(comparison: Comparison, workletValue: number, referenceValue: number): void {
  const expected = f32(referenceValue);
  if (workletValue !== expected) {
    comparison.mismatches += 1;
    comparison.worst = Math.max(comparison.worst, Math.abs(workletValue - expected));
  }
}

/** Deterministic pseudo-random source so failures are reproducible. */
function makeNoise(seed = 12345): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

describe('ladder worklet parity', () => {
  it('produces identical output to the reference kernel', () => {
    const processor = loadProcessor(
      'aether-ladder.worklet.js',
      'aether-ladder',
      FS,
      { cutoffHz: 700, emphasis: 4 },
    );
    const reference = new LadderCore(FS, 700, 4);
    const noise = makeNoise();

    const frames = 4000;
    const result: Comparison = { worst: 0, mismatches: 0 };
    for (let i = 0; i < frames; i += 1) {
      const x = f32(noise() * 0.4);

      // Sweep cutoff and emphasis so smoothing, saturation and the feedback
      // path are all exercised, including past the self-oscillation threshold.
      const t = i / frames;
      const cutoffHz = 60 * Math.pow(2, t * 8); // 60 Hz .. 15 kHz
      const cutoffParam = f32(hzToCutoffParam(cutoffHz));
      const emphasis = f32(t * 10.5);

      const fromWorklet = runSample(processor, x, {
        cutoff: constParam(cutoffParam),
        emphasis: constParam(emphasis),
      });
      // Mirror the worklet's own conversion back to hertz.
      const referenceHz = cutoffParamToHz(cutoffParam);
      const fromReference = reference.processWith(x, referenceHz, emphasis);

      compare(result, fromWorklet, fromReference);
    }

    expect(result.worst).toBe(0);
    expect(result.mismatches).toBe(0);
  });

  it('agrees on self-oscillation behaviour', () => {
    const processor = loadProcessor(
      'aether-ladder.worklet.js',
      'aether-ladder',
      FS,
      { cutoffHz: 400, emphasis: 10 },
    );
    const reference = new LadderCore(FS, 400, 10);
    const cutoffParam = constParam(f32(hzToCutoffParam(400)));
    const emphasisParam = constParam(f32(10));
    const referenceHz = cutoffParamToHz(f32(hzToCutoffParam(400)));

    let peakWorklet = 0;
    let peakReference = 0;
    const result: Comparison = { worst: 0, mismatches: 0 };
    for (let i = 0; i < FS; i += 1) {
      // Inputs travel through a Float32 buffer in realtime, so round them here
      // too — in a marginally stable feedback loop any difference amplifies.
      const x = f32(i === 0 ? 0.001 : 0);
      const a = runSample(processor, x, {
        cutoff: cutoffParam,
        emphasis: emphasisParam,
      });
      const b = reference.processWith(x, referenceHz, f32(10));
      peakWorklet = Math.max(peakWorklet, Math.abs(a));
      peakReference = Math.max(peakReference, Math.abs(b));
      compare(result, a, b);
    }
    expect(peakWorklet).toBeGreaterThan(0.05);
    expect(result.mismatches).toBe(0);
    expect(Math.abs(peakWorklet - f32(peakReference))).toBeLessThan(1e-12);
  });
});

describe('contour worklet parity', () => {
  interface Times {
    readonly attack: number;
    readonly decay: number;
    readonly release: number;
    readonly hold: number;
  }

  /** Drives both implementations through the identical float32 parameter values. */
  function buildContour(times: Times) {
    const rounded: Times = {
      attack: f32(times.attack),
      decay: f32(times.decay),
      release: f32(times.release),
      hold: f32(times.hold),
    };
    const processor = loadProcessor(
      'aether-contour.worklet.js',
      'aether-contour',
      FS,
    );
    const reference = new ContourCore(FS);
    reference.setTimes(rounded.attack, rounded.decay, rounded.release);
    reference.setHold(rounded.hold);

    let lastGate = false;
    const result: Comparison = { worst: 0, mismatches: 0 };

    return {
      /** Advance one sample; only edges are forwarded to the reference. */
      step(gate: number, frameIndex: number, override?: Partial<Times>): void {
        const active: Times = { ...rounded, ...override };
        const fromWorklet = runSample(processor, 0, {
          attack: constParam(f32(active.attack)),
          decay: constParam(f32(active.decay)),
          release: constParam(f32(active.release)),
          hold: constParam(f32(active.hold)),
          gate: constParam(gate),
        });

        const level = gate > 0.5;
        if (level !== lastGate) {
          reference.setGate(level);
          lastGate = level;
        }
        if (override?.hold !== undefined) reference.setHold(f32(override.hold));
        const fromReference = reference.process();

        // The first frame only establishes the initial gate edge.
        if (frameIndex >= 1) compare(result, fromWorklet, fromReference);
      },
      observed: result,
    };
  }

  it('produces identical output to the reference kernel', () => {
    const run = buildContour({
      attack: 0.02,
      decay: 0.25,
      release: 0.35,
      hold: 0.75,
    });

    // Attack, then settle on the sustain level.
    for (let i = 0; i < 12_000; i += 1) run.step(1, i);
    // Full release down to exact silence.
    for (let i = 0; i < 20_000; i += 1) run.step(0, i);
    // Re-trigger from wherever the release left the envelope.
    for (let i = 0; i < 4000; i += 1) run.step(1, i);
    // Percussive: hold forced to zero, played and released.
    for (let i = 0; i < 12_000; i += 1) {
      run.step(i === 0 ? 0 : 1, i, { hold: 0 });
    }
    for (let i = 0; i < 20_000; i += 1) run.step(0, i, { hold: 0 });

    expect(run.observed.mismatches).toBe(0);
    expect(run.observed.worst).toBe(0);
  });

  it('agrees on the factory patch envelope shape', () => {
    // 5 ms attack / 300 ms decay / 400 ms release, sustain on: the state the
    // instrument boots into, and the one the acceptance test in PRD 11.1 hears.
    const run = buildContour({
      attack: 0.005,
      decay: 0.3,
      release: 0.4,
      hold: 0.75,
    });
    for (let i = 0; i < 30_000; i += 1) {
      run.step(i < 8000 ? 1 : 0, i);
    }
    expect(run.observed.mismatches).toBe(0);
    expect(run.observed.worst).toBe(0);
  });
});
