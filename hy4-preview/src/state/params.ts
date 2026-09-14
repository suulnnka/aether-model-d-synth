/**
 * ParamStore — 面板参数单一事实来源(ST-1)
 * §6 控件规格总表的注册表:全部控件的类型 / 范围 / 档位 / 默认值都在这里定义。
 * 3D 控件、音频引擎、UI、持久化全部只与本仓库通信。
 */

export type ParamKind = "knob" | "selector" | "switch" | "wheel";

export interface ParamDef {
  id: string;
  kind: ParamKind;
  /** 中文名(用于 tooltip) */
  label: string;
  def: number;
  /** 连续参数范围(kind = knob / wheel / switch) */
  min?: number;
  max?: number;
  /** 档位列表(kind = selector),index 即内部值 */
  steps?: string[];
  /** 数值显示格式化 */
  format?: (v: number) => string;
  /** 分区(丝印区域 id) */
  section: string;
}

/* ---------- 范围与格式化辅助 ---------- */

export const GLIDE_MIN_S = 0.005;
export const GLIDE_MAX_S = 2.5;
/** 0–10 → 5ms–2.5s 指数映射;0 = 关闭 */
export function glideToSeconds(v: number): number {
  if (v <= 0.001) return 0;
  const n = Math.min(1, Math.max(0, v / 10));
  return GLIDE_MIN_S * Math.pow(GLIDE_MAX_S / GLIDE_MIN_S, n);
}

export const ENV_MIN_S = 0.001;
export const ENV_MAX_S = 10;
/** 0–10 → 1ms–10s 对数映射 */
export function envToSeconds(v: number): number {
  const n = Math.min(1, Math.max(0, v / 10));
  return ENV_MIN_S * Math.pow(ENV_MAX_S / ENV_MIN_S, n);
}

export const CUTOFF_MIN_HZ = 10;
export const CUTOFF_MAX_HZ = 18000;
/** 0–10 → 10Hz–18kHz 对数映射 */
export function cutoffToHz(v: number): number {
  const n = Math.min(1, Math.max(0, v / 10));
  return CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, n);
}
/** kHz/Hz 显示 */
function fmtHzKnob(v: number): string {
  const hz = cutoffToHz(v);
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(0)} Hz`;
}
function fmtSeconds(v: number): string {
  const s = envToSeconds(v);
  return s >= 1 ? `${s.toFixed(2)} s` : `${(s * 1000).toFixed(0)} ms`;
}
function fmtPlain(v: number): string {
  return v.toFixed(1);
}
function fmtCents(spanCents: number) {
  const half = spanCents / 2;
  return (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)} ¢ (${(-half).toFixed(0)}~${+half.toFixed(0)})`;
}

/* ---------- 档位定义 ---------- */

export const RANGE_STEPS = ["32'", "16'", "8'", "4'", "2'"];
export const RANGE_STEPS_OSC3 = ["LO", "32'", "16'", "8'", "4'", "2'"];
export const WAVE_STEPS = ["三角波", "锯齿波", "反锯齿", "方波", "宽脉冲", "窄脉冲"];

/* ---------- 控件注册表(§6) ---------- */

const oscDefs = (): ParamDef[] => {
  const out: ParamDef[] = [];
  for (const i of [1, 2, 3] as const) {
    out.push(
      {
        id: `osc${i}Range`,
        kind: "selector",
        label: `Osc-${i} Range 音域`,
        def: 2, // 8'
        steps: i === 3 ? RANGE_STEPS_OSC3 : RANGE_STEPS,
        section: "osc",
      },
      {
        id: `osc${i}Wave`,
        kind: "selector",
        label: `Osc-${i} Waveform 波形`,
        def: i === 3 ? 1 : 1, // 锯齿(Osc-3 默认三角波见下覆盖)
        steps: WAVE_STEPS,
        section: "osc",
      },
      {
        id: `osc${i}Freq`,
        kind: "knob",
        label: `Osc-${i} Frequency 微调`,
        def: i === 2 ? 0.1 : i === 3 ? -0.1 : 0, // +7 / -7 音分(±700 音分 → 0-10)
        min: -700,
        max: 700,
        format: fmtCents(1400),
        section: "osc",
      },
    );
  }
  return out;
};

export const PARAM_DEFS: ParamDef[] = [
  /* Controllers */
  { id: "glide", kind: "knob", label: "Glide 滑音", def: 0, min: 0, max: 10, format: (v) => (v < 0.05 ? "关闭" : `${(glideToSeconds(v) * 1000).toFixed(0)} ms`), section: "ctl" },
  { id: "modMix", kind: "knob", label: "Modulation Mix 调制混合", def: 0, min: 0, max: 10, format: (v) => `${(v / 10 * 100).toFixed(0)}% Noise`, section: "ctl" },
  { id: "tune", kind: "knob", label: "Tune 主音准", def: 0, min: -200, max: 200, format: fmtCents(400), section: "ctl" },
  { id: "modOn", kind: "switch", label: "Modulation 调制总开关", def: 0, section: "ctl" },
  { id: "decayOn", kind: "switch", label: "Decay 衰减开关", def: 0, section: "ctl" },

  /* Oscillator Bank(每列自左向右为 Osc-3 / 2 / 1,见 MDL-5) */
  ...oscDefs(),
  { id: "osc3Control", kind: "switch", label: "Osc-3 Control 键盘控制", def: 1, section: "osc" },

  /* Mixer */
  { id: "osc1Vol", kind: "knob", label: "Osc-1 Volume", def: 8, min: 0, max: 10, format: fmtPlain, section: "mix" },
  { id: "osc2Vol", kind: "knob", label: "Osc-2 Volume", def: 8, min: 0, max: 10, format: fmtPlain, section: "mix" },
  { id: "osc3Vol", kind: "knob", label: "Osc-3 Volume", def: 0, min: 0, max: 10, format: fmtPlain, section: "mix" },
  { id: "noiseVol", kind: "knob", label: "Noise Volume 噪声电平", def: 0, min: 0, max: 10, format: fmtPlain, section: "mix" },
  { id: "extVol", kind: "knob", label: "Ext In Volume 外部输入", def: 0, min: 0, max: 10, format: fmtPlain, section: "mix" },

  /* Modifiers — Filter */
  { id: "cutoff", kind: "knob", label: "Cutoff 截止频率", def: 7.2, min: 0, max: 10, format: fmtHzKnob, section: "mod" },
  { id: "emphasis", kind: "knob", label: "Emphasis 共振", def: 3, min: 0, max: 10, format: fmtPlain, section: "mod" },
  { id: "contour", kind: "knob", label: "Contour Amount 包络深度", def: 5, min: 0, max: 10, format: fmtPlain, section: "mod" },
  { id: "filterMod", kind: "switch", label: "Modulation (Osc-3) 滤波调制", def: 0, section: "mod" },
  { id: "kc1", kind: "switch", label: "Keyboard Control 1 (+100%)", def: 0, section: "mod" },
  { id: "kc2", kind: "switch", label: "Keyboard Control 2 (+50%)", def: 0, section: "mod" },
  { id: "fAtt", kind: "knob", label: "Filter Attack", def: 0, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "fDec", kind: "knob", label: "Filter Decay", def: 4.78, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "fRel", kind: "knob", label: "Filter Release", def: 5.12, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "fSus", kind: "switch", label: "Filter Sustain", def: 1, section: "mod" },

  /* Modifiers — Loudness */
  { id: "lAtt", kind: "knob", label: "Loudness Attack", def: 0, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "lDec", kind: "knob", label: "Loudness Decay", def: 4.78, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "lRel", kind: "knob", label: "Loudness Release", def: 5.12, min: 0, max: 10, format: fmtSeconds, section: "mod" },
  { id: "lSus", kind: "switch", label: "Loudness Sustain", def: 1, section: "mod" },
  { id: "volume", kind: "knob", label: "Volume 主音量", def: 6, min: 0, max: 10, format: fmtPlain, section: "mod" },

  /* 演奏控件 */
  { id: "power", kind: "switch", label: "Power 电源", def: 1, section: "perf" },
  { id: "pitchWheel", kind: "wheel", label: "Pitch Wheel 音高轮", def: 0, min: -240, max: 240, format: fmtCents(480), section: "perf" },
  { id: "modWheel", kind: "wheel", label: "Mod Wheel 调制轮", def: 0, min: 0, max: 1, format: (v) => `${(v * 100).toFixed(0)}%`, section: "perf" },
];

/* Osc-3 默认波形 = 三角波(index 0) */
(PARAM_DEFS.find((p) => p.id === "osc3Wave") as ParamDef).def = 0;

export const PARAM_DEF_MAP: Map<string, ParamDef> = new Map(PARAM_DEFS.map((d) => [d.id, d]));

/* ---------- 出厂默认快照 ---------- */

export function defaultSnapshot(): Record<string, number> {
  const snap: Record<string, number> = {};
  for (const d of PARAM_DEFS) snap[d.id] = d.def;
  return snap;
}

type Subscriber = (v: number) => void;

export class ParamStore {
  private values: Record<string, number> = defaultSnapshot();
  private subs = new Map<string, Set<Subscriber>>();

  get(id: string): number {
    return this.values[id];
  }

  /** 直接设值(跳过持久化节流由 persist 层处理) */
  set(id: string, v: number, opts: { silent?: boolean } = {}): void {
    const def = PARAM_DEF_MAP.get(id);
    if (!def) return;
    if (def.kind === "selector") {
      const n = def.steps!.length;
      v = ((Math.round(v) % n) + n) % n;
    } else {
      v = Math.min(def.max!, Math.max(def.min!, v));
    }
    if (this.values[id] === v) return;
    this.values[id] = v;
    if (!opts.silent) this.emit(id, v);
  }

  selectorStep(id: string): string {
    const def = PARAM_DEF_MAP.get(id)!;
    return def.steps![this.values[id]];
  }

  cycle(id: string, dir = 1): void {
    const def = PARAM_DEF_MAP.get(id)!;
    this.set(id, (this.values[id] + dir + def.steps!.length) % def.steps!.length);
  }

  reset(id: string): void {
    this.set(id, PARAM_DEF_MAP.get(id)!.def);
  }

  resetAll(): void {
    this.values = defaultSnapshot();
    for (const d of PARAM_DEFS) this.emit(d.id, this.values[d.id]);
  }

  snapshot(): Record<string, number> {
    return { ...this.values };
  }

  load(snap: Record<string, number>): void {
    for (const d of PARAM_DEFS) {
      if (typeof snap[d.id] === "number") this.values[d.id] = snap[d.id];
    }
    for (const d of PARAM_DEFS) this.emit(d.id, this.values[d.id]);
  }

  subscribe(id: string, cb: Subscriber): () => void {
    let set = this.subs.get(id);
    if (!set) {
      set = new Set();
      this.subs.set(id, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  /** 给音频引擎批量初始化用 */
  bind(id: string, cb: Subscriber): void {
    cb(this.values[id]);
    this.subscribe(id, cb);
  }

  private emit(id: string, v: number): void {
    const set = this.subs.get(id);
    if (set) for (const cb of set) cb(v);
  }
}
