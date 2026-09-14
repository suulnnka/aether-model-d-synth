/**
 * 控件规格注册表 —— PRD §6 全部面板参数的唯一定义处。
 * kind: knob(连续)/ selector(档位)/ switch(两档)
 * curve: lin(线性归一化)/ log(对数归一化,用于时间与截止频率)
 */

export type ParamKind = "knob" | "selector" | "switch";

export interface ParamDef {
  id: string;
  kind: ParamKind;
  label: string;
  section: string;
  /** knob/selector 有效 */
  min: number;
  max: number;
  default: number;
  curve?: "lin" | "log";
  /** selector 档位显示名(switch 为 ["Off","On"]) */
  steps?: string[];
  /** tooltip 数值格式化 */
  fmt?: (v: number) => string;
}

export const WAVEFORMS = ["三角波", "锯齿", "反锯齿", "方波", "宽脉冲", "窄脉冲"] as const;

const fmt10 = (v: number) => v.toFixed(1);
const fmtMs = (v: number) =>
  v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
const fmtHz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`;
const fmtCents = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} ¢`;

export const PARAM_DEFS: ParamDef[] = [
  // ---- Controllers ----
  {
    id: "glide", kind: "knob", label: "Glide(滑音)", section: "Controllers",
    min: 0, max: 10, default: 0, curve: "lin",
    fmt: (v) => (v <= 0.05 ? "Off" : `${glideSeconds(v).toFixed(2)} s`),
  },
  {
    id: "modMix", kind: "knob", label: "Modulation Mix", section: "Controllers",
    min: 0, max: 10, default: 0, curve: "lin",
    fmt: (v) => (v <= 0.05 ? "Osc-3" : v >= 9.95 ? "Noise" : `${(v / 10 * 100).toFixed(0)}% Noise`),
  },
  {
    id: "tune", kind: "knob", label: "Tune(主音准)", section: "Controllers",
    min: -200, max: 200, default: 0, curve: "lin", fmt: fmtCents,
  },
  { id: "modSwitch", kind: "switch", label: "Modulation", section: "Controllers", min: 0, max: 1, default: 0, steps: ["Off", "On"] },
  { id: "decaySwitch", kind: "switch", label: "Decay", section: "Controllers", min: 0, max: 1, default: 0, steps: ["Off", "On"] },

  // ---- Oscillator Bank(面板自左向右为 Osc-3 / Osc-2 / Osc-1)----
  ...oscDefs(3, { rangeDefault: 2, waveDefault: 0, freqDefault: -7 }),
  ...oscDefs(2, { rangeDefault: 2, waveDefault: 1, freqDefault: 7 }),
  ...oscDefs(1, { rangeDefault: 2, waveDefault: 1, freqDefault: 0 }),
  { id: "osc3Control", kind: "switch", label: "Osc-3 Control", section: "Oscillator Bank", min: 0, max: 1, default: 1, steps: ["Off", "On"] },

  // ---- Mixer ----
  { id: "osc1Vol", kind: "knob", label: "Osc-1 Volume", section: "Mixer", min: 0, max: 10, default: 8, curve: "lin", fmt: fmt10 },
  { id: "osc2Vol", kind: "knob", label: "Osc-2 Volume", section: "Mixer", min: 0, max: 10, default: 8, curve: "lin", fmt: fmt10 },
  { id: "osc3Vol", kind: "knob", label: "Osc-3 Volume", section: "Mixer", min: 0, max: 10, default: 0, curve: "lin", fmt: fmt10 },
  { id: "noiseVol", kind: "knob", label: "Noise Volume", section: "Mixer", min: 0, max: 10, default: 0, curve: "lin", fmt: fmt10 },
  { id: "extVol", kind: "knob", label: "Ext In Volume", section: "Mixer", min: 0, max: 10, default: 0, curve: "lin", fmt: fmt10 },

  // ---- Modifiers ----
  { id: "cutoff", kind: "knob", label: "Cutoff", section: "Modifiers", min: 10, max: 18000, default: 2200, curve: "log", fmt: fmtHz },
  { id: "emphasis", kind: "knob", label: "Emphasis", section: "Modifiers", min: 0, max: 10, default: 3, curve: "lin", fmt: fmt10 },
  { id: "contour", kind: "knob", label: "Contour Amount", section: "Modifiers", min: 0, max: 10, default: 5, curve: "lin", fmt: fmt10 },
  { id: "filtModSwitch", kind: "switch", label: "Modulation (Osc-3)", section: "Modifiers", min: 0, max: 1, default: 0, steps: ["Off", "On"] },
  { id: "kc1", kind: "switch", label: "Keyboard Control 1", section: "Modifiers", min: 0, max: 1, default: 0, steps: ["Off", "On"] },
  { id: "kc2", kind: "switch", label: "Keyboard Control 2", section: "Modifiers", min: 0, max: 1, default: 0, steps: ["Off", "On"] },
  { id: "filtA", kind: "knob", label: "Filter Attack", section: "Modifiers", min: 0.001, max: 10, default: 0.005, curve: "log", fmt: fmtMs },
  { id: "filtD", kind: "knob", label: "Filter Decay", section: "Modifiers", min: 0.001, max: 10, default: 0.3, curve: "log", fmt: fmtMs },
  { id: "filtSustain", kind: "switch", label: "Filter Sustain", section: "Modifiers", min: 0, max: 1, default: 1, steps: ["Off", "On"] },
  { id: "filtR", kind: "knob", label: "Filter Release", section: "Modifiers", min: 0.001, max: 10, default: 0.4, curve: "log", fmt: fmtMs },
  { id: "loudA", kind: "knob", label: "Loudness Attack", section: "Modifiers", min: 0.001, max: 10, default: 0.005, curve: "log", fmt: fmtMs },
  { id: "loudD", kind: "knob", label: "Loudness Decay", section: "Modifiers", min: 0.001, max: 10, default: 0.3, curve: "log", fmt: fmtMs },
  { id: "loudSustain", kind: "switch", label: "Loudness Sustain", section: "Modifiers", min: 0, max: 1, default: 1, steps: ["Off", "On"] },
  { id: "loudR", kind: "knob", label: "Loudness Release", section: "Modifiers", min: 0.001, max: 10, default: 0.4, curve: "log", fmt: fmtMs },
  { id: "volume", kind: "knob", label: "Volume", section: "Modifiers", min: 0, max: 10, default: 6, curve: "lin", fmt: fmt10 },

  // ---- 电源(左侧板)----
  { id: "power", kind: "switch", label: "Power", section: "Side Panel", min: 0, max: 1, default: 1, steps: ["Off", "On"] },
];

function oscDefs(
  n: 1 | 2 | 3,
  opt: { rangeDefault: number; waveDefault: number; freqDefault: number }
): ParamDef[] {
  const ranges = n === 3
    ? ["LO", "32'", "16'", "8'", "4'", "2'"]
    : ["32'", "16'", "8'", "4'", "2'"];
  const sec = "Oscillator Bank";
  return [
    { id: `osc${n}Range`, kind: "selector", label: `Osc-${n} Range`, section: sec, min: 0, max: ranges.length - 1, default: opt.rangeDefault, steps: ranges },
    { id: `osc${n}Wave`, kind: "selector", label: `Osc-${n} Waveform`, section: sec, min: 0, max: WAVEFORMS.length - 1, default: opt.waveDefault, steps: [...WAVEFORMS] },
    { id: `osc${n}Freq`, kind: "knob", label: `Osc-${n} Frequency`, section: sec, min: -700, max: 700, default: opt.freqDefault, curve: "lin", fmt: fmtCents },
  ];
}

/** Glide 0–10 → 0=off,5ms–2.5s 指数映射(PRD §6.1) */
export function glideSeconds(v: number): number {
  if (v <= 0.05) return 0;
  return 0.005 * Math.pow(500, v / 10);
}

export const PARAM_MAP: Map<string, ParamDef> = new Map(PARAM_DEFS.map((d) => [d.id, d]));

/** 归一化(0–1,旋钮行程)↔ 原始值换算(含对数曲线) */
export function normToRaw(def: ParamDef, n: number): number {
  n = Math.min(1, Math.max(0, n));
  if (def.curve === "log") {
    return def.min * Math.pow(def.max / def.min, n);
  }
  return def.min + (def.max - def.min) * n;
}

export function rawToNorm(def: ParamDef, v: number): number {
  if (def.curve === "log") {
    return Math.log(v / def.min) / Math.log(def.max / def.min);
  }
  return (v - def.min) / (def.max - def.min);
}

export function formatValue(def: ParamDef, v: number): string {
  if (def.kind !== "knob") {
    const idx = Math.round(v);
    return def.steps?.[idx] ?? String(idx);
  }
  return def.fmt ? def.fmt(v) : v.toFixed(2);
}
