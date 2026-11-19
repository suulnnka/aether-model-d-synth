import { describe, expect, it } from "vitest";
import {
  computeKeyTrackingOctaves,
  computeOscHz,
  mapContourOctaves,
  mapCutoff,
  mapEnvelopeTime,
  mapLfoRate,
  mapPitchWheelSemitones,
  midiToHz,
} from "../src/audio/mapping.ts";
import { ParamStore } from "../src/state/paramStore.ts";
import { decodeParamsFromQuery, encodeParamsToQuery } from "../src/state/persist.ts";
import { FACTORY_PRESETS } from "../src/state/presets.ts";
import { CONTROL_SPECS, SPEC_BY_ID } from "../src/state/specs.ts";
import type { ControlId } from "../src/state/types.ts";

describe("Audio Mapping Curves", () => {
  it("maps cutoff monotonically across -5..+5", () => {
    const low = mapCutoff(-5);
    const mid = mapCutoff(0);
    const high = mapCutoff(5);
    expect(low).toBeGreaterThanOrEqual(14);
    expect(low).toBeLessThan(30);
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(4000);
    expect(high).toBeCloseTo(22000, -1);
    expect(low < mid && mid < high).toBe(true);
  });

  it("maps envelope times across 2ms..10s", () => {
    expect(mapEnvelopeTime(0)).toBeCloseTo(0.002, 4);
    expect(mapEnvelopeTime(5)).toBeCloseTo(0.55, 2);
    expect(mapEnvelopeTime(10)).toBeCloseTo(10.0, 2);
  });

  it("computes oscillator octave ranges and detune accurately", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(computeOscHz(69, "8", 0, 0, 0, 0)).toBeCloseTo(440, 4);
    expect(computeOscHz(69, "4", 0, 0, 0, 0)).toBeCloseTo(880, 4);
    expect(computeOscHz(69, "16", 0, 0, 0, 0)).toBeCloseTo(220, 4);
    expect(computeOscHz(69, "32", 0, 0, 0, 0)).toBeCloseTo(110, 4);
    expect(computeOscHz(69, "8", 12, 0, 0, 0)).toBeCloseTo(880, 4);
    expect(computeOscHz(69, "lo", 0, 0, 0, 0)).toBeCloseTo(35.2, 1);
  });

  it("computes keyboard tracking weights (1/3, 2/3, 1.0)", () => {
    expect(computeKeyTrackingOctaves(72, false, false)).toBe(0);
    expect(computeKeyTrackingOctaves(72, true, false)).toBeCloseTo(1 / 3, 5);
    expect(computeKeyTrackingOctaves(72, false, true)).toBeCloseTo(2 / 3, 5);
    expect(computeKeyTrackingOctaves(72, true, true)).toBeCloseTo(1.0, 5);
  });

  it("maps LFO rate, contour octaves, and pitch wheel bounds", () => {
    expect(mapLfoRate(0)).toBeCloseTo(0.2, 4);
    expect(mapLfoRate(10)).toBeCloseTo(20, 4);
    expect(mapContourOctaves(0)).toBe(0);
    expect(mapContourOctaves(10)).toBeCloseTo(6.5, 4);
    expect(mapPitchWheelSemitones(50)).toBe(0);
    expect(mapPitchWheelSemitones(100)).toBe(5);
    expect(mapPitchWheelSemitones(0)).toBe(-5);
  });
});

describe("ParamStore, URL Persistence & Factory Presets", () => {
  it("clamps parameters within spec bounds", () => {
    const store = new ParamStore();
    store.set("filterCutoff", 999);
    expect(store.get("filterCutoff")).toBe(5);
    store.set("filterCutoff", -999);
    expect(store.get("filterCutoff")).toBe(-5);
    store.set("osc1Range", 99);
    expect(store.get("osc1Range")).toBe(5);
  });

  it("roundtrips synth state cleanly through URL query parameters", () => {
    const store = new ParamStore();
    store.set("filterCutoff", -1.45);
    store.set("filterEmphasis", 7.8);
    store.set("osc2Frequency", -7);
    store.set("delayEnabled", 0);
    store.set("reverbMix", 6.4);

    const qs = encodeParamsToQuery(store.snapshot());
    const decoded = decodeParamsFromQuery(`?${qs}`);
    expect(decoded).not.toBeNull();
    expect(decoded?.filterCutoff).toBeCloseTo(-1.45, 2);
    expect(decoded?.filterEmphasis).toBeCloseTo(7.8, 2);
    expect(decoded?.osc2Frequency).toBe(-7);
    expect(decoded?.delayEnabled).toBe(0);
    expect(decoded?.reverbMix).toBeCloseTo(6.4, 2);
  });

  it("validates all 35 factory presets against CONTROL_SPECS", () => {
    expect(FACTORY_PRESETS.length).toBeGreaterThanOrEqual(35);
    for (const preset of FACTORY_PRESETS) {
      for (const [key, val] of Object.entries(preset.params)) {
        const spec = SPEC_BY_ID[key as ControlId];
        expect(spec, `Missing spec for ${key} in ${preset.id}`).toBeDefined();
        expect(typeof val).toBe("number");
        expect(Number.isFinite(val)).toBe(true);
        expect(val!).toBeGreaterThanOrEqual(spec.min);
        expect(val!).toBeLessThanOrEqual(spec.max);
      }
    }
    expect(CONTROL_SPECS.length).toBeGreaterThanOrEqual(50);
  });
});
