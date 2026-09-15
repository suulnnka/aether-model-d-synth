/**
 * 单一参数仓库(PRD ST-1)
 * ------------------------------------------------------------------
 * 全部面板参数集中在此定义(min / max / default / 档位 / 类型),
 * 3D 控件与音频引擎只与本仓库通信,互不直接依赖。
 * 控件清单逐项对应 PRD §15「控件规格总表」(48 项)。
 *
 * 取值约定:所有参数以 number 存储(开关为 0/1,档位为下标),
 * 便于统一持久化、预设套用与 3D 姿态插值。
 */

export type SectionId =
  | "controllers"
  | "oscillators"
  | "mixer"
  | "modifiers"
  | "output"
  | "sidepanel";

export type SwitchColor = "orange" | "blue" | "black";

export interface KnobSpec {
  kind: "knob";
  id: string;
  label: string;
  /** 丝印上显示的单位/量纲(仅用于 tooltip) */
  unit?: string;
  min: number;
  max: number;
  def: number;
  /** 中心为 0 的双极性旋钮(Tune / Frequency / Cutoff),丝印刻度对称 */
  bipolar?: boolean;
  /** 数值格式化 */
  format?: (v: number) => string;
}

export interface SelectorSpec {
  kind: "selector";
  id: string;
  label: string;
  /** 档位名(与丝印一致) */
  options: string[];
  def: number;
  /** 波形档位需要在旋钮四周绘制波形图标刻度 */
  waveformTicks?: boolean;
}

export interface SwitchSpec {
  kind: "switch";
  id: string;
  label: string;
  def: 0 | 1;
  color: SwitchColor;
  /** 丝印上的下标签(通常 ON) */
  sub?: string;
  /** 拨杆两档各自的丝印(如 OSC.3 / FILTER EG) */
  onLabel?: string;
  offLabel?: string;
}

export interface WheelSpec {
  kind: "wheel";
  id: string;
  label: string;
  min: number;
  max: number;
  def: number;
  /** 弯音轮松手回中 */
  spring?: boolean;
}

export interface RockerSpec {
  kind: "rocker";
  id: string;
  label: string;
  def: 0 | 1;
}

export type ControlSpec =
  | KnobSpec
  | SelectorSpec
  | SwitchSpec
  | WheelSpec
  | RockerSpec;

/**
 * 六个波形档位(PRD §15.2 / AUD-3)
 * 三角 → 锯齿 → 反锯齿 → 方波 → 宽脉冲 → 窄脉冲。
 * 方波由占空比 50% 的脉冲波生成,宽/窄脉冲分别为 25% / 10% 占空比。
 */
export const WAVEFORMS = [
  "triangle",
  "sawtooth",
  "rev_saw",
  "pulse1",
  "pulse2",
  "pulse3",
] as const;
export const WAVEFORM_LABELS = [
  "TRIANGLE",
  "SAWTOOTH",
  "REV SAW",
  "SQUARE",
  "WIDE PULSE",
  "NARROW PULSE",
];

/** 六个音域档位(PRD 附录 B) */
export const RANGES = ["lo", "32", "16", "8", "4", "2"] as const;
export const RANGE_LABELS = ["LO", "32'", "16'", "8'", "4'", "2'"];

const knob = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  extra: Partial<KnobSpec> = {}
): KnobSpec => ({ kind: "knob", id, label, min, max, def, ...extra });

const sel = (
  id: string,
  label: string,
  options: string[],
  def: number,
  waveformTicks = false
): SelectorSpec => ({ kind: "selector", id, label, options, def, waveformTicks });

const sw = (
  id: string,
  label: string,
  def: 0 | 1,
  color: SwitchColor = "orange",
  extra: Partial<SwitchSpec> = {}
): SwitchSpec => ({ kind: "switch", id, label, def, color, ...extra });

/**
 * 控件注册表(PRD §15 逐项)
 * 顺序即 §15 编号顺序,3D 布局在 model/layout.ts 中另行描述。
 */
export const CONTROLS: ControlSpec[] = [
  // ── 15.1 CONTROLLERS ─────────────────────────────────────────────
  knob("tune", "TUNE", -12, 12, 0, { unit: "semitones", bipolar: true }),
  knob("glideTime", "GLIDE TIME", 0, 10, 1),
  knob("modMix", "MODULATION MIX", 0, 10, 10),
  sw("osc3FilterEgSwitch", "MOD SOURCE A", 0, "orange", {
    onLabel: "FILTER EG",
    offLabel: "OSC. 3",
    sub: "ON",
  }),
  sw("noiseLfoSwitch", "MOD SOURCE B", 1, "orange", {
    onLabel: "LFO",
    offLabel: "NOISE",
    sub: "ON",
  }),
  sw("oscillatorModulationOn", "OSCILLATOR MODULATION", 0, "orange", {
    sub: "ON",
  }),

  // ── 15.2 OSCILLATOR BANK(×3 排) ────────────────────────────────
  sel("osc1Range", "RANGE", [...RANGE_LABELS], 3),
  sel("osc1Waveform", "WAVEFORM", [...WAVEFORM_LABELS], 1, true),
  knob("osc1Frequency", "FREQUENCY", -12, 12, 0, {
    unit: "semitones",
    bipolar: true,
  }),
  sel("osc2Range", "RANGE", [...RANGE_LABELS], 3),
  sel("osc2Waveform", "WAVEFORM", [...WAVEFORM_LABELS], 1, true),
  knob("osc2Frequency", "FREQUENCY", -12, 12, 0, {
    unit: "semitones",
    bipolar: true,
  }),
  sel("osc3Range", "RANGE", [...RANGE_LABELS], 3),
  sel("osc3Waveform", "WAVEFORM", [...WAVEFORM_LABELS], 0, true),
  knob("osc3Frequency", "FREQUENCY", -12, 12, 0, {
    unit: "semitones",
    bipolar: true,
  }),
  sw("osc3Control", "OSC. 3 CONTROL", 1, "orange", { sub: "ON" }),

  // ── 15.3 MIXER ──────────────────────────────────────────────────
  sw("osc1On", "OSC. 1", 1, "blue", { sub: "ON" }),
  sw("osc2On", "OSC. 2", 0, "blue", { sub: "ON" }),
  sw("osc3On", "OSC. 3", 0, "blue", { sub: "ON" }),
  knob("osc1Volume", "OSC. 1 VOLUME", 0, 10, 9.5),
  knob("osc2Volume", "OSC. 2 VOLUME", 0, 10, 5.5),
  knob("osc3Volume", "OSC. 3 VOLUME", 0, 10, 6),
  sw("externalOn", "EXT. IN", 0, "blue", { sub: "ON" }),
  knob("externalVolume", "EXT. IN VOLUME", 0, 10, 5),
  sw("noiseOn", "NOISE", 0, "blue", { sub: "ON" }),
  knob("noiseVolume", "NOISE VOLUME", 0, 10, 0),
  sw("noiseType", "NOISE TYPE", 0, "blue", {
    onLabel: "PINK",
    offLabel: "WHITE",
  }),
  sw("filterModulationOn", "FILTER MODULATION", 1, "orange", { sub: "ON" }),
  sw("keyboardControl1", "KEYBOARD CONTROL 1", 1, "orange", { sub: "ON" }),
  sw("keyboardControl2", "KEYBOARD CONTROL 2", 1, "orange", { sub: "ON" }),

  // ── 15.4 MODIFIERS ──────────────────────────────────────────────
  knob("filterCutoff", "CUTOFF FREQUENCY", -5, 5, 3.9, { bipolar: true }),
  knob("filterEmphasis", "EMPHASIS", 0, 10, 0),
  knob("filterContourAmount", "AMOUNT OF CONTOUR", 0, 10, 4.71),
  knob("filterAttack", "ATTACK TIME", 0, 10, 0.3),
  knob("filterDecay", "DECAY TIME", 0, 10, 0),
  knob("filterSustain", "SUSTAIN LEVEL", 0, 10, 4.5),
  knob("loudnessAttack", "ATTACK TIME", 0, 10, 0),
  knob("loudnessDecay", "DECAY TIME", 0, 10, 0),
  knob("loudnessSustain", "SUSTAIN LEVEL", 0, 10, 10),

  // ── 15.5 OUTPUT ─────────────────────────────────────────────────
  knob("mainVolume", "VOLUME", 0, 10, 5),
  sw("tunerOn", "A-440", 0, "blue", { sub: "ON" }),
  { kind: "rocker", id: "power", label: "POWER", def: 1 },

  // ── 15.6 侧边条与演奏控件 ────────────────────────────────────────
  knob("lfoRate", "LFO RATE", 0, 10, 3.5),
  sw("lfoWaveform", "LFO WAVEFORM", 0, "black", {
    onLabel: "SQUARE",
    offLabel: "TRIANGLE",
  }),
  sw("glideOn", "GLIDE", 1, "black", { sub: "ON" }),
  sw("decaySwitchOn", "DECAY", 0, "black", { sub: "ON" }),
  { kind: "wheel", id: "pitchWheel", label: "PITCH", min: 0, max: 100, def: 50, spring: true },
  { kind: "wheel", id: "modWheel", label: "MOD.", min: 0, max: 100, def: 0 },
];

export const CONTROL_BY_ID: Record<string, ControlSpec> = {};
for (const c of CONTROLS) CONTROL_BY_ID[c.id] = c;

/** 非持久化的瞬态项:弯音轮松开回中,不写入 localStorage */
export const TRANSIENT_IDS = new Set(["pitchWheel"]);

// ─────────────────────────────────────────────────────────────────────
// 参数仓库
// ─────────────────────────────────────────────────────────────────────

export type ParamListener = (id: string, value: number) => void;
export type BulkListener = () => void;

export class ParamStore {
  private values = new Map<string, number>();
  private listeners = new Set<ParamListener>();
  private bulkListeners = new Set<BulkListener>();

  constructor() {
    for (const c of CONTROLS) this.values.set(c.id, c.def);
  }

  has(id: string): boolean {
    return this.values.has(id);
  }

  get(id: string): number {
    return this.values.get(id) ?? 0;
  }

  getBool(id: string): boolean {
    return this.get(id) >= 0.5;
  }

  /** 0..1 归一化值(供 3D 姿态插值使用) */
  getNormalized(id: string): number {
    const spec = CONTROL_BY_ID[id];
    if (!spec) return 0;
    if (spec.kind === "selector") return spec.def / Math.max(1, spec.options.length - 1);
    const { min, max } = spec as KnobSpec | WheelSpec;
    return (this.get(id) - min) / (max - min);
  }

  set(id: string, value: number, silent = false): void {
    const spec = CONTROL_BY_ID[id];
    if (!spec) return;
    let v = value;
    if (spec.kind === "selector") {
      const n = spec.options.length;
      v = ((Math.round(v) % n) + n) % n;
    } else if (spec.kind === "switch" || spec.kind === "rocker") {
      v = value >= 0.5 ? 1 : 0;
    } else {
      v = Math.min(spec.max, Math.max(spec.min, v));
    }
    if (this.values.get(id) === v) return;
    this.values.set(id, v);
    if (!silent) this.emit(id, v);
  }

  toggle(id: string): void {
    this.set(id, this.getBool(id) ? 0 : 1);
  }

  /** 批量写入(预设载入 / 本地恢复),全部写完后只发一次批量通知 */
  setMany(patch: Record<string, number>): void {
    let changed = false;
    for (const [id, raw] of Object.entries(patch)) {
      const spec = CONTROL_BY_ID[id];
      if (!spec) continue;
      let v = raw;
      if (spec.kind === "selector") {
        const n = spec.options.length;
        v = ((Math.round(v) % n) + n) % n;
      } else if (spec.kind === "switch" || spec.kind === "rocker") {
        v = raw >= 0.5 ? 1 : 0;
      } else {
        v = Math.min(spec.max, Math.max(spec.min, v));
      }
      if (this.values.get(id) !== v) {
        this.values.set(id, v);
        changed = true;
      }
    }
    if (changed) {
      for (const fn of this.bulkListeners) fn();
    }
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.values) {
      if (TRANSIENT_IDS.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  subscribe(fn: ParamListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeBulk(fn: BulkListener): () => void {
    this.bulkListeners.add(fn);
    return () => this.bulkListeners.delete(fn);
  }

  private emit(id: string, value: number): void {
    for (const fn of this.listeners) fn(id, value);
  }
}

export const params = new ParamStore();
