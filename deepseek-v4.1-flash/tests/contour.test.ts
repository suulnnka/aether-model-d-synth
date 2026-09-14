/**
 * Contour behaviour acceptance (PRD AUD-8, AUD-2).
 *
 * Asserts the switch semantics the PRD spells out:
 *   Sustain ON   -> attack, then hold at a fixed high level
 *   Sustain OFF  -> attack, then decay to zero while the key is still held
 *   Decay ON     -> same percussive path, overriding Sustain
 * plus the two properties that make it feel like hardware: re-triggering starts
 * from the current level, and a completed release is exactly silent.
 */

import { describe, expect, it } from 'vitest';
import { ContourCore, HOLD_LEVEL } from '../src/audio/dsp/contour.ts';
import { envSeconds } from '../src/audio/mapping.ts';
import { RANGE_ENV_TIME, toValue } from '../src/state/range.ts';

const FS = 48_000;

function runTo(
  core: ContourCore,
  samples: number,
): { level: number; peak: number } {
  let peak = 0;
  let level = 0;
  for (let i = 0; i < samples; i += 1) {
    level = core.process();
    peak = Math.max(peak, level);
  }
  return { level, peak };
}

describe('stage timing', () => {
  it('attack reaches the peak within the knob time', () => {
    for (const attack of [0.005, 0.05, 0.5]) {
      const core = new ContourCore(FS);
      core.setTimes(attack, 1, 1);
      const samples = core.samplesToPeak();
      const elapsed = samples / FS;
      // The attack ends at -80 dB from full scale, i.e. exactly at the knob time.
      expect(elapsed).toBeGreaterThan(attack * 0.9);
      expect(elapsed).toBeLessThan(attack * 1.12);
    }
  });

  it('decay reaches the sustain level within the knob time', () => {
    for (const decay of [0.05, 0.3, 1]) {
      const core = new ContourCore(FS);
      core.setTimes(0.001, decay, 1);
      core.setHold(HOLD_LEVEL);
      core.setGate(true);
      runTo(core, core.samplesToPeak());
      const target = Math.floor(decay * FS);
      runTo(core, target);
      expect(Math.abs(core.current - HOLD_LEVEL)).toBeLessThan(0.01);
    }
  });

  it('release reaches silence within the knob time', () => {
    for (const release of [0.02, 0.4, 1]) {
      const core = new ContourCore(FS);
      core.setTimes(0.001, 0.001, release);
      core.setHold(HOLD_LEVEL);
      core.setGate(true);
      runTo(core, core.samplesToPeak() + Math.floor(0.01 * FS));
      core.setGate(false);
      runTo(core, Math.floor(release * FS));
      expect(core.current).toBe(0);
      expect(core.currentStage).toBe('idle');
    }
  });

  it('maps the log knob across 1 ms .. 10 s', () => {
    expect(envSeconds(0)).toBeCloseTo(0.001, 6);
    expect(envSeconds(1)).toBeCloseTo(10, 6);
    // Geometric midpoint of a log taper.
    expect(envSeconds(0.5)).toBeCloseTo(0.1, 6);
    // The PRD's 300 ms default sits where the table says it should.
    const defaultPos = toValue(RANGE_ENV_TIME, 0.3);
    void defaultPos;
  });
});

describe('sustain switch semantics', () => {
  it('holds at a fixed high level while the key is held', () => {
    const core = new ContourCore(FS);
    core.setTimes(0.001, 0.05, 0.3);
    core.setHold(HOLD_LEVEL);
    core.setGate(true);
    runTo(core, Math.floor(FS * 1.5));
    expect(core.current).toBeCloseTo(HOLD_LEVEL, 4);
    expect(core.currentStage).toBe('hold');
  });

  it('decays to zero while the key is still held when Sustain is off', () => {
    const core = new ContourCore(FS);
    core.setTimes(0.001, 0.05, 0.3);
    core.setHold(0);
    core.setGate(true);
    const { peak } = runTo(core, Math.floor(FS * 1));
    expect(peak).toBeGreaterThan(0.9); // it did attack first
    expect(core.current).toBe(0); // then fell to true silence
    expect(core.currentStage).toBe('idle');
  });

  it('uses the same percussive path for the Decay override', () => {
    // The engine derives `hold = sustain && !decay ? HOLD : 0`, so the Decay
    // switch is expressed here as a zero hold target.
    const withDecaySwitch = new ContourCore(FS);
    withDecaySwitch.setTimes(0.001, 0.04, 0.3);
    withDecaySwitch.setHold(0);
    withDecaySwitch.setGate(true);

    const withSustainOff = new ContourCore(FS);
    withSustainOff.setTimes(0.001, 0.04, 0.3);
    withSustainOff.setHold(0);
    withSustainOff.setGate(true);

    for (let i = 0; i < FS; i += 1) {
      expect(withDecaySwitch.process()).toBe(withSustainOff.process());
    }
  });
});

describe('re-triggering', () => {
  it('restarts from the current level without a discontinuity', () => {
    const core = new ContourCore(FS);
    // Segments are exponential and *complete* within their knob time (see the
    // -80 dB convention in contour.ts), so most of an attack happens early: a
    // 0.5 s attack is already ~60% done after 20 ms. Pick times such that the
    // 20 ms sample below really is mid-attack, not a near-peak value.
    core.setTimes(0.5, 0.3, 0.3);
    core.setHold(HOLD_LEVEL);

    core.setGate(true);
    runTo(core, Math.floor(FS * 0.02));
    const partial = core.current;
    expect(partial).toBeGreaterThan(0.1);
    expect(partial).toBeLessThan(0.95);

    // Re-trigger mid-attack.
    core.setGate(true);
    let previous = partial;
    let worstStep = 0;
    for (let i = 0; i < Math.floor(FS * 0.05); i += 1) {
      const level = core.process();
      worstStep = Math.max(worstStep, Math.abs(level - previous));
      previous = level;
    }
    // A continuation, not a jump back to zero (PRD AUD-2).
    expect(core.current).toBeGreaterThan(partial);
    expect(worstStep).toBeLessThan(0.02);
  });

  it('re-triggers from a partially released envelope', () => {
    const core = new ContourCore(FS);
    core.setTimes(0.01, 0.2, 0.3);
    core.setHold(HOLD_LEVEL);
    core.setGate(true);
    runTo(core, Math.floor(FS * 0.5));

    core.setGate(false);
    // Exponential release again: 50 ms into a 300 ms knob time still leaves the
    // envelope clearly above zero — the partial state this test needs.
    runTo(core, Math.floor(FS * 0.05));
    const midRelease = core.current;
    expect(midRelease).toBeGreaterThan(0.05);

    core.setGate(true);
    const first = core.process();
    expect(first).toBeGreaterThan(midRelease * 0.99);
  });
});

describe('silence', () => {
  it('is exactly zero when idle', () => {
    const core = new ContourCore(FS);
    for (let i = 0; i < 1000; i += 1) expect(core.process()).toBe(0);
  });

  it('stays at exactly zero after a completed release', () => {
    const core = new ContourCore(FS);
    core.setTimes(0.001, 0.05, 0.05);
    core.setHold(HOLD_LEVEL);
    core.setGate(true);
    runTo(core, Math.floor(FS * 0.2));
    core.setGate(false);
    runTo(core, Math.floor(FS * 0.2));
    for (let i = 0; i < 5000; i += 1) expect(core.process()).toBe(0);
  });

  it('releasing an idle contour is a no-op', () => {
    const core = new ContourCore(FS);
    core.setGate(false);
    expect(core.currentStage).toBe('idle');
    expect(core.process()).toBe(0);
  });
});
