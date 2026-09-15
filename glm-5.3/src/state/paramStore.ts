/**
 * ParamStore — 单一参数仓库(PRD ST-1 / §18)。
 * 全部面板参数集中定义(范围/默认/档位/文案),3D 控件与音频引擎只与仓库通信。
 */

export type Val = number | boolean | string;
export type Kind = "knob" | "selector" | "switch" | "lamp" | "wheel" | "button";

export interface Spec {
  id: string;
  label: string;
  kind: Kind;
  /** knob: 数值范围;wheel: 0-100 */
  min?: number;
  max?: number;
  def: Val;
  /** selector: 档位(面板逆时针→顺时针) */
  steps?: readonly string[];
  /** tooltip 功能说明(INT-7),简短中文/控件名照参考实现 */
  tip?: string;
  /** 数值显示格式 */
  fmt?: (v: number) => string;
}

/* ---------- 波形 / 音域档位(PRD AUD-3 / 附录 B) ---------- */
export const WAVE_STEPS = [
  "triangle",
  "sawtooth",
  "rev-saw",
  "square",
  "pulse-wide",
  "pulse-narrow",
] as const;
export const WAVE_LABEL: Record<string, string> = {
  triangle: "三角波",
  sawtooth: "锯齿波",
  "rev-saw": "反锯齿",
  square: "方波",
  "pulse-wide": "宽脉冲",
  "pulse-narrow": "窄脉冲",
};
/** 参考实现预设中的波形名 → 本产品档位 */
export const WAVE_ALIAS: Record<string, string> = {
  sawtooth: "sawtooth",
  square: "square",
  triangle: "triangle",
  pulse1: "pulse-wide",
  pulse2: "pulse-narrow",
  pulse3: "pulse-narrow",
  rev_saw: "rev-saw",
};

export const RANGE_STEPS = ["LO", "32'", "16'", "8'", "4'", "2'"] as const;
/** 音域相对 8' 的八度偏移;LO = 低频模式 */
export const RANGE_OCT: Record<string, number> = {
  LO: 0,
  "32'": -2,
  "16'": -1,
  "8'": 0,
  "4'": 1,
  "2'": 2,
};

/** 包络旋钮 0–10 → 毫秒(PRD AUD-8 分段非线性映射) */
const ENV_STOPS: Array<[number, number]> = [
  [0, 0],
  [1, 10],
  [2, 200],
  [4, 600],
  [6, 1000],
  [8, 5000],
  [10, 10000],
];
export function envMs(v: number): number {
  const x = Math.max(0, Math.min(10, v));
  for (let i = 0; i < ENV_STOPS.length - 1; i++) {
    const [a, ams] = ENV_STOPS[i];
    const [b, bms] = ENV_STOPS[i + 1];
    if (x >= a && x <= b) {
      const t = (x - a) / (b - a);
      return ams + t * (bms - ams);
    }
  }
  return 10000;
}
export const envFmt = (v: number): string => {
  const ms = envMs(v);
  if (ms <= 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 5500 ? 2 : 1)} s`;
};

const two = (v: number) => v.toFixed(2).replace(/\.?0+$/, "");

/** §15 控件规格总表(默认值 = 附录 A 口径) */
export const SPECS: readonly Spec[] = [
  /* --- CONTROLLERS --- */
  { id: "tune", label: "TUNE", kind: "knob", min: -12, max: 12, def: 0, tip: "主音准:三个振荡器整体 ±12 半音(0 = A-440)", fmt: (v) => `${v >= 0 ? "+" : ""}${two(v)} 半音` },
  { id: "glideTime", label: "GLIDE TIME", kind: "knob", min: 0, max: 10, def: 1, tip: "滑音时间(开关在键盘左侧边条)", fmt: (v) => `${Math.round(5 * Math.pow(500, v / 10))} ms` },
  { id: "modMix", label: "MODULATION MIX", kind: "knob", min: 0, max: 10, def: 10, tip: "调制源 A(逆时针)↔ 源 B(顺时针)线性混合", fmt: (v) => `A ${Math.round(100 - v * 10)}% / B ${Math.round(v * 10)}%` },
  { id: "srcAFilterEg", label: "OSC.3 / FILTER EG", kind: "switch", def: false, tip: "调制源 A:Osc.3 或滤波包络二选一" },
  { id: "srcBLfo", label: "NOISE / LFO", kind: "switch", def: true, tip: "调制源 B:噪声或 LFO 二选一" },
  /* --- 交界柱 A --- */
  { id: "oscMod", label: "OSCILLATOR MODULATION", kind: "switch", def: false, tip: "音高 FM 总开关,深度 = 调制轮" },
  /* --- OSCILLATOR BANK --- */
  { id: "osc3Control", label: "OSC-3 CONTROL", kind: "switch", def: true, tip: "OFF 时 Osc-3 脱离键盘音高控制,自由运行(LO 档即成 LFO)" },
  ...([1, 2, 3] as const).flatMap((n): Spec[] => [
    { id: `osc${n}Range`, label: `RANGE`, kind: "selector", steps: RANGE_STEPS, def: "8'", tip: `Osc-${n} 音域(LO = 0.2–20Hz 低频模式)` },
    { id: `osc${n}Tune`, label: "FREQUENCY", kind: "knob", min: -12, max: 12, def: 0, tip: `Osc-${n} 独立失谐 ±12 半音`, fmt: (v) => `${v >= 0 ? "+" : ""}${two(v)} 半音` },
    { id: `osc${n}Wave`, label: "WAVEFORM", kind: "selector", steps: WAVE_STEPS, def: n === 3 ? "triangle" : "sawtooth", tip: `Osc-${n} 波形(六档带限)` },
  ]),
  /* --- MIXER(含交界柱 C 蓝拨杆 / D 列在 MODIFIERS 前) --- */
  ...([1, 2, 3] as const).flatMap((n): Spec[] => [
    { id: `osc${n}On`, label: `ON`, kind: "switch", def: n === 1, tip: `Osc-${n} 进混音器通断` },
    { id: `osc${n}Vol`, label: "VOLUME", kind: "knob", min: 0, max: 10, def: [9.5, 5.5, 6][n - 1], tip: `Osc-${n} 电平`, fmt: two },
  ]),
  { id: "extOn", label: "ON", kind: "switch", def: false, tip: "外部输入(麦克风)通断" },
  { id: "extVol", label: "EXTERNAL IN VOLUME", kind: "knob", min: 0, max: 10, def: 5, tip: "外部输入电平(授权后经滤波器)", fmt: two },
  { id: "noiseOn", label: "ON", kind: "switch", def: false, tip: "噪声发生器通断" },
  { id: "noiseVol", label: "NOISE VOLUME", kind: "knob", min: 0, max: 10, def: 0, tip: "噪声电平", fmt: two },
  { id: "noiseType", label: "WHITE / PINK", kind: "switch", def: false, tip: "白噪声 / 粉噪声(false = White)" },
  /* --- 交界柱 D --- */
  { id: "filterMod", label: "FILTER MODULATION", kind: "switch", def: true, tip: "滤波截止 FM 使能,深度 = 调制轮" },
  { id: "kc1", label: "KEYBOARD CONTROL 1", kind: "switch", def: true, tip: "滤波键盘跟踪 +100% / 八度" },
  { id: "kc2", label: "KEYBOARD CONTROL 2", kind: "switch", def: true, tip: "滤波键盘跟踪 +50% / 八度" },
  /* --- MODIFIERS: FILTER --- */
  { id: "cutoff", label: "CUTOFF FREQUENCY", kind: "knob", min: -5, max: 5, def: 3.9, tip: "梯形低通截止 10Hz–32kHz", fmt: (v) => `${Math.round(10 * Math.pow(3200, Math.pow((v + 5) / 10, 0.6)))} Hz` },
  { id: "emphasis", label: "EMPHASIS", kind: "knob", min: 0, max: 10, def: 0, tip: "共振;高端进入自激", fmt: two },
  { id: "contour", label: "AMOUNT OF CONTOUR", kind: "knob", min: 0, max: 10, def: 4.7, tip: "滤波包络对截止频率的调制深度", fmt: two },
  { id: "filtA", label: "ATTACK TIME", kind: "knob", min: 0, max: 10, def: 0.3, tip: "滤波包络 Attack", fmt: envFmt },
  { id: "filtD", label: "DECAY TIME", kind: "knob", min: 0, max: 10, def: 0, tip: "滤波包络 Decay", fmt: envFmt },
  { id: "filtS", label: "SUSTAIN LEVEL", kind: "knob", min: 0, max: 10, def: 4.5, tip: "滤波包络 Sustain", fmt: two },
  /* --- MODIFIERS: LOUDNESS CONTOUR --- */
  { id: "loudA", label: "ATTACK TIME", kind: "knob", min: 0, max: 10, def: 0, tip: "响度包络 Attack", fmt: envFmt },
  { id: "loudD", label: "DECAY TIME", kind: "knob", min: 0, max: 10, def: 0, tip: "响度包络 Decay", fmt: envFmt },
  { id: "loudS", label: "SUSTAIN LEVEL", kind: "knob", min: 0, max: 10, def: 10, tip: "响度包络 Sustain", fmt: two },
  /* --- OUTPUT --- */
  { id: "volume", label: "MAIN OUTPUT", kind: "knob", min: 0, max: 10, def: 5, tip: "主输出增益(后接软饱和)", fmt: two },
  { id: "tunerOn", label: "A-440", kind: "switch", def: false, tip: "440Hz 参考音开关(独立于主信号链)" },
  { id: "power", label: "POWER", kind: "switch", def: false, tip: "电源:OFF 时引擎静音、面板禁用" },
  /* --- 键盘左侧边条 --- */
  { id: "lfoRate", label: "LFO RATE", kind: "knob", min: 0, max: 10, def: 3.5, tip: "独立 LFO 速度 0.2–20Hz", fmt: (v) => `${(0.2 * Math.pow(100, v / 10)).toFixed(2)} Hz` },
  { id: "lfoWave", label: "LFO WAVEFORM", kind: "switch", def: false, tip: "LFO 波形(false = 三角,true = 方波)" },
  { id: "glideOn", label: "GLIDE", kind: "switch", def: true, tip: "滑音使能(时间在 CONTROLLERS 区)" },
  { id: "decayMode", label: "DECAY", kind: "switch", def: false, tip: "打击乐模式:两包络 Attack 后直接衰减到 0,忽略 Sustain" },
  /* --- 演奏轮(不入 localStorage) --- */
  { id: "pitchWheel", label: "PITCH WHEEL", kind: "wheel", min: 0, max: 100, def: 50, tip: "弯音轮 ±2 半音,松手弹簧回中" },
  { id: "modWheel", label: "MOD. WHEEL", kind: "wheel", min: 0, max: 100, def: 0, tip: "调制深度 0–100%(调制矩阵总深度)" },
];

export const SPEC_BY_ID: Record<string, Spec> = Object.fromEntries(
  SPECS.map((s) => [s.id, s]),
);

/** 不做 localStorage 持久化的参数 */
const NO_PERSIST = new Set(["modWheel", "pitchWheel", "power", "tunerOn"]);
type Listener = (v: Val, prev: Val | undefined) => void;

export class ParamStore {
  private values = new Map<string, Val>();
  private listeners = new Map<string, Set<Listener>>();
  private anyListeners = new Set<(changed: string[]) => void>();
  /** 批量载入(预设/恢复)期间不逐条广播,结束后广播一次变更集合 */
  private batch: Set<string> | null = null;

  constructor() {
    for (const s of SPECS) this.values.set(s.id, s.def);
  }

  get(id: string): Val {
    const v = this.values.get(id);
    if (v === undefined) throw new Error(`unknown param: ${id}`);
    return v;
  }
  num(id: string): number {
    return Number(this.get(id));
  }
  bool(id: string): boolean {
    return Boolean(this.get(id));
  }
  str(id: string): string {
    return String(this.get(id));
  }
  spec(id: string): Spec {
    return SPEC_BY_ID[id];
  }

  set(id: string, value: Val): void {
    const spec = SPEC_BY_ID[id];
    if (!spec) throw new Error(`unknown param: ${id}`);
    let v = value;
    if (spec.kind === "knob" || spec.kind === "wheel") {
      v = Math.max(spec.min!, Math.min(spec.max!, Number(value)));
    } else if (spec.kind === "selector") {
      v = spec.steps!.includes(String(value)) ? String(value) : spec.def;
    } else {
      v = Boolean(value);
    }
    const prev = this.values.get(id);
    if (prev === v) return;
    this.values.set(id, v);
    if (this.batch) {
      this.batch.add(id);
    } else {
      this.listeners.get(id)?.forEach((fn) => fn(v, prev));
      this.anyListeners.forEach((fn) => fn([id]));
    }
  }

  /** 批量赋值:预设载入 / 状态恢复 */
  applyAssigns(assigns: Record<string, Val>): void {
    this.batch = new Set();
    let changed: string[] = [];
    try {
      for (const [id, v] of Object.entries(assigns)) {
        if (!SPEC_BY_ID[id]) continue;
        this.set(id, v);
      }
      changed = [...this.batch];
    } finally {
      this.batch = null;
    }
    if (changed.length) {
      for (const id of changed) {
        const v = this.values.get(id)!;
        this.listeners.get(id)?.forEach((fn) => fn(v, undefined));
      }
      this.anyListeners.forEach((fn) => fn(changed));
    }
  }

  subscribe(id: string, fn: Listener): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)!.delete(fn);
  }

  subscribeAny(fn: (changed: string[]) => void): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  /** 面板状态快照(持久化用) */
  panelSnapshot(): Record<string, Val> {
    const out: Record<string, Val> = {};
    for (const s of SPECS) {
      if (NO_PERSIST.has(s.id)) continue;
      out[s.id] = this.values.get(s.id)!;
    }
    return out;
  }

  resetToFactory(): void {
    const assigns: Record<string, Val> = {};
    for (const s of SPECS) assigns[s.id] = s.def;
    this.applyAssigns(assigns);
  }
}
