/**
 * 预设套用(state/presets.ts)
 * 把出厂预设(PresetData)翻译成 ParamStore 的数值补丁并批量写入(ST-2)。
 * 效果器字段已在 data/presets.ts 生成阶段剔除;本文件不做任何效果器处理。
 */
import { params } from "./params";
import { WAVEFORMS, RANGES } from "./params";
import { PRESETS, DEFAULT_PRESET_ID, getPresetById, type PresetData } from "../data/presets";

const b = (v: boolean | undefined): number => (v ? 1 : 0);

function waveformIndex(name: string): number {
  const i = WAVEFORMS.indexOf(name as (typeof WAVEFORMS)[number]);
  if (i >= 0) return i;
  // 参考实现中的个别别名兜底
  if (name === "tri_saw") return 1; // 视作锯齿
  if (name === "square") return 3;
  return 1;
}

function rangeIndex(name: string): number {
  const i = RANGES.indexOf(name as (typeof RANGES)[number]);
  return i >= 0 ? i : 3; // 默认 8'
}

/** 预设 → 参数补丁 */
export function presetToPatch(p: PresetData): Record<string, number> {
  const c = p.controllers;
  const f = p.filter;
  const l = p.loudness;
  const o = p.oscillators;
  const sp = p.sidePanel;

  const patch: Record<string, number> = {
    tune: c.tune,
    glideTime: c.glideTime,
    modMix: c.modMix,
    osc3FilterEgSwitch: b(c.osc3FilterEgSwitch),
    noiseLfoSwitch: b(c.noiseLfoSwitch),
    oscillatorModulationOn: b(c.oscillatorModulationOn),
    osc3Control: b(c.osc3Control),
    keyboardControl1: b(c.keyboardControl1),
    keyboardControl2: b(c.keyboardControl2),

    osc1Range: rangeIndex(o.oscillator1.range),
    osc1Waveform: waveformIndex(o.oscillator1.waveform),
    osc1Frequency: o.oscillator1.frequency,
    osc1On: b(o.oscillator1.enabled),
    osc1Volume: o.oscillator1.volume,

    osc2Range: rangeIndex(o.oscillator2.range),
    osc2Waveform: waveformIndex(o.oscillator2.waveform),
    osc2Frequency: o.oscillator2.frequency,
    osc2On: b(o.oscillator2.enabled),
    osc2Volume: o.oscillator2.volume,

    osc3Range: rangeIndex(o.oscillator3.range),
    osc3Waveform: waveformIndex(o.oscillator3.waveform),
    osc3Frequency: o.oscillator3.frequency,
    osc3On: b(o.oscillator3.enabled),
    osc3Volume: o.oscillator3.volume,

    noiseOn: b(o.mixer?.noise?.enabled),
    noiseVolume: o.mixer?.noise?.volume ?? 0,
    noiseType: (o.mixer?.noise?.noiseType ?? "white") === "pink" ? 1 : 0,

    externalOn: b(o.mixer?.external?.enabled),
    externalVolume: o.mixer?.external?.volume ?? 5,

    filterCutoff: f.filterCutoff,
    filterEmphasis: f.filterEmphasis,
    filterContourAmount: f.filterContourAmount,
    filterAttack: f.filterAttack,
    filterDecay: f.filterDecay,
    filterSustain: f.filterSustain,
    filterModulationOn: b(f.filterModulationOn),

    loudnessAttack: l.loudnessAttack,
    loudnessDecay: l.loudnessDecay,
    loudnessSustain: l.loudnessSustain,

    glideOn: b(sp.glideOn),
    decaySwitchOn: b(sp.decaySwitchOn),
    lfoRate: sp.lfoRate,
    lfoWaveform: sp.lfoWaveform === "square" ? 1 : 0,
    modWheel: sp.modWheel,

    mainVolume: p.mainVolume,
  };

  // 数值兜底:预设里出现 undefined/NaN 时退回当前值
  for (const k of Object.keys(patch)) {
    if (typeof patch[k] !== "number" || Number.isNaN(patch[k])) delete patch[k];
  }
  return patch;
}

export function applyPreset(idOrPreset: string | PresetData): void {
  const p =
    typeof idOrPreset === "string" ? getPresetById(idOrPreset) : idOrPreset;
  if (!p) return;
  params.setMany(presetToPatch(p));
}

export { PRESETS, DEFAULT_PRESET_ID };
