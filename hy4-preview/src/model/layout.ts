/**
 * 面板布局(MDL-5 / §8.2)
 * ------------------------------------------------------------------
 * 坐标系约定(全项目唯一):
 *   · 演奏者位于 +z 侧;+x 为演奏者视角的右侧;+y 向上。
 *   · 铰链面板局部坐标:原点 = 铰链轴(面板前缘、靠键盘一侧)。
 *       面板向 -z(机身后方)延伸,控制面法线为 +y。
 *       面板面内坐标 (u, v):u = x;v = -z(即 v=0 为铰链边/面板下沿,
 *       v=PANEL_D 为面板上沿)。丝印画布「上方」= v 增大方向。
 *   · 侧边条坐标使用机身坐标 (x, z),位于键盘左侧的机身顶面。
 */

export const DIM = {
  /** 整机宽 */
  W: 0.56,
  /** 整机深 */
  D: 0.36,
  /** 木侧板厚 */
  CHEEK: 0.02,
  /** 底箱高度 */
  CASE_H: 0.1,
  /** 铰链面板纵深 */
  PANEL_D: 0.115,
  /** 铰链面板箱体厚度(厚箱体 MDL-8) */
  PANEL_T: 0.05,
  /** 铰链轴位置(机身坐标) */
  HINGE_Z: -0.055,
  HINGE_Y: 0.105,
  /** 琴键区 */
  KEY_FRONT_Z: 0.125,
  KEY_BACK_Z: -0.01,
  KEY_LEFT: -0.19,
  KEY_RIGHT: 0.26,
  /** 键盘左侧边条 */
  SIDE_X0: -0.26,
  SIDE_X1: -0.19,
};

export const PANEL_INNER_W = DIM.W - 2 * DIM.CHEEK; // 0.52

/** 分区宽度(自左向右,合计 0.50,两侧各留 0.01 边距) */
const SECTION_W: Array<{ id: string; w: number; title?: string }> = [
  { id: "controllers", w: 0.068, title: "CONTROLLERS" },
  { id: "gab", w: 0.012 }, // 交界列 A / B
  { id: "oscillators", w: 0.112, title: "OSCILLATOR BANK" },
  { id: "colC", w: 0.012 }, // 交界列 C
  { id: "mixer", w: 0.098, title: "MIXER" },
  { id: "colD", w: 0.013 }, // 交界列 D
  { id: "modifiers", w: 0.09, title: "MODIFIERS" },
  { id: "output", w: 0.056, title: "OUTPUT" },
  { id: "blank", w: 0.039 }, // 参考实现 EFFECTS 位置,本产品留空(§4.2)
];

export interface SectionBox {
  id: string;
  title?: string;
  x0: number;
  x1: number;
  center: number;
  width: number;
}

export const SECTIONS: SectionBox[] = (() => {
  let x = -PANEL_INNER_W / 2 + 0.01;
  return SECTION_W.map((s) => {
    const box: SectionBox = {
      id: s.id,
      title: s.title,
      x0: x,
      x1: x + s.w,
      center: x + s.w / 2,
      width: s.w,
    };
    x += s.w;
    return box;
  });
})();

export const section = (id: string): SectionBox => {
  const s = SECTIONS.find((b) => b.id === id);
  if (!s) throw new Error(`unknown section ${id}`);
  return s;
};

/** 三排主控件行的 v 坐标(自面板上沿向下) */
export const ROW_V = [0.08, 0.052, 0.024];
/** 分区标题带 */
export const TITLE_V = 0.006;
/** 品牌带 */
export const BRAND_V = 0.104;

export type Space = "panel" | "side";

export interface Placement {
  id: string;
  kind: "knob" | "selector" | "switch" | "wheel" | "rocker" | "button" | "led";
  space: Space;
  /** 面板面内坐标 */
  u: number;
  v: number;
  /** 侧边条机身坐标 */
  x?: number;
  z?: number;
  /** 旋钮半径(米) */
  radius?: number;
  /** 丝印标签 */
  silk?: string;
  /** 丝印副标签(拨杆下方的 ON / 档位名) */
  sub?: string;
  /** 标签相对控件的 v 偏移(负 = 在控件下方) */
  silkOffset?: number;
  /** 丝印字号(画布 px,画布见 silkscreen.ts) */
  silkSize?: number;
  /** 拨杆/开关颜色 */
  color?: "orange" | "blue" | "black";
  /** 档位旋钮周围是否绘制波形图标刻度 */
  waveformTicks?: boolean;
  /** 该控件所在的丝印子框名(如 FILTER / LOUDNESS CONTOUR) */
  group?: string;
  /** 旋钮旁的丝印刻度数量提示(用于绘制刻度点) */
  ticks?: number;
  /** 双极性旋钮(刻度对称) */
  bipolar?: boolean;
  /** 窄交界列中的控件:丝印文字竖排(与原琴一致) */
  vertical?: boolean;
}

const P = (
  id: string,
  kind: Placement["kind"],
  u: number,
  v: number,
  extra: Partial<Placement> = {}
): Placement => ({ id, kind, space: "panel", u, v, ...extra });

const S = (
  id: string,
  kind: Placement["kind"],
  x: number,
  z: number,
  extra: Partial<Placement> = {}
): Placement => ({ id, kind, space: "side", u: 0, v: 0, x, z, ...extra });

function buildPlacements(): Placement[] {
  const list: Placement[] = [];
  const ctrl = section("controllers");
  const gab = section("gab");
  const osc = section("oscillators");
  const colC = section("colC");
  const mix = section("mixer");
  const colD = section("colD");
  const mod = section("modifiers");
  const out = section("output");

  // ── CONTROLLERS ────────────────────────────────────────────────
  list.push(P("tune", "knob", ctrl.center, ROW_V[0], { silk: "TUNE", silkSize: 26, ticks: 11, bipolar: true }));
  list.push(P("glideTime", "knob", ctrl.center - 0.018, ROW_V[1], { silk: "GLIDE TIME", silkSize: 22, ticks: 11 }));
  list.push(P("modMix", "knob", ctrl.center + 0.018, ROW_V[1], { silk: "MODULATION MIX", silkSize: 22, ticks: 11 }));
  list.push(P("osc3FilterEgSwitch", "switch", ctrl.center - 0.016, ROW_V[2], {
    silk: "OSC. 3 / FILTER EG", silkSize: 20, color: "orange", sub: "ON",
  }));
  list.push(P("noiseLfoSwitch", "switch", ctrl.center + 0.016, ROW_V[2], {
    silk: "NOISE / LFO", silkSize: 20, color: "orange", sub: "ON",
  }));

  // ── 交界列 A / B ───────────────────────────────────────────────
  list.push(P("oscillatorModulationOn", "switch", gab.center, ROW_V[0] + 0.002, {
    silk: "OSC MODULATION", silkSize: 18, color: "orange", sub: "ON", silkOffset: -0.017, vertical: true,
  }));
  list.push(P("osc3Control", "switch", gab.center, ROW_V[2] - 0.001, {
    silk: "OSC. 3 CONTROL", silkSize: 18, color: "orange", sub: "ON", silkOffset: 0.017, vertical: true,
  }));

  // ── OSCILLATOR BANK ────────────────────────────────────────────
  const oscCols = [osc.x0 + 0.02, osc.x0 + 0.056, osc.x0 + 0.092];
  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    list.push(P(`osc${n}Range`, "selector", oscCols[0], ROW_V[i], { silk: "RANGE", silkSize: 20, radius: 0.0125 }));
    list.push(P(`osc${n}Frequency`, "knob", oscCols[1], ROW_V[i], { silk: "FREQUENCY", silkSize: 20, ticks: 11, bipolar: true }));
    list.push(P(`osc${n}Waveform`, "selector", oscCols[2], ROW_V[i], {
      silk: "WAVEFORM", silkSize: 20, radius: 0.0125, waveformTicks: true,
    }));
  }

  // ── 交界列 C(蓝 ON 拨杆,与振荡器三排逐行对齐) ────────────────
  for (let i = 0; i < 3; i++) {
    list.push(P(`osc${i + 1}On`, "switch", colC.center, ROW_V[i], {
      silk: "", color: "blue", sub: "ON", silkOffset: -0.017,
    }));
  }

  // ── MIXER ──────────────────────────────────────────────────────
  const mixLeft = mix.x0 + 0.022;
  for (let i = 0; i < 3; i++) {
    list.push(P(`osc${i + 1}Volume`, "knob", mixLeft, ROW_V[i], { silk: "", silkSize: 20, ticks: 11 }));
  }
  const extSw = mix.x0 + 0.05;
  const extKn = mix.x0 + 0.07;
  list.push(P("externalOn", "switch", extSw, ROW_V[0], { silk: "", color: "blue", sub: "ON", silkOffset: -0.017 }));
  list.push(P("externalVolume", "knob", extKn, ROW_V[0], { silk: "EXT. IN", silkSize: 20, ticks: 11 }));
  list.push(P("noiseOn", "switch", extSw, ROW_V[1], { silk: "", color: "blue", sub: "ON", silkOffset: -0.017 }));
  list.push(P("noiseVolume", "knob", extKn, ROW_V[1], { silk: "NOISE", silkSize: 20, ticks: 11 }));
  list.push(P("noiseType", "switch", mix.x0 + 0.088, ROW_V[1], {
    silk: "WHITE / PINK", silkSize: 16, color: "blue", silkOffset: -0.019,
  }));
  list.push(P("overload", "led", mix.x0 + 0.086, 0.1, { silk: "OVERLOAD", silkSize: 16, silkOffset: -0.014 }));

  // ── 交界列 D ───────────────────────────────────────────────────
  list.push(P("filterModulationOn", "switch", colD.center, 0.096, {
    silk: "FILTER MODULATION", silkSize: 16, color: "orange", sub: "ON", silkOffset: -0.019, vertical: true,
  }));
  list.push(P("keyboardControl1", "switch", colD.center, 0.06, {
    silk: "KEYBOARD CONTROL", silkSize: 16, color: "orange", sub: "1 · ON", silkOffset: -0.019, vertical: true,
  }));
  list.push(P("keyboardControl2", "switch", colD.center, 0.033, {
    silk: "", silkSize: 16, color: "orange", sub: "2 · ON", silkOffset: -0.019,
  }));

  // ── MODIFIERS ──────────────────────────────────────────────────
  const modCols = [mod.x0 + 0.016, mod.x0 + 0.045, mod.x0 + 0.074];
  list.push(P("filterCutoff", "knob", modCols[0], ROW_V[0], { silk: "CUTOFF FREQUENCY", silkSize: 20, ticks: 11, bipolar: true, group: "FILTER" }));
  list.push(P("filterEmphasis", "knob", modCols[1], ROW_V[0], { silk: "EMPHASIS", silkSize: 20, ticks: 11, group: "FILTER" }));
  list.push(P("filterContourAmount", "knob", modCols[2], ROW_V[0], { silk: "AMOUNT OF CONTOUR", silkSize: 18, ticks: 11, group: "FILTER" }));
  list.push(P("filterAttack", "knob", modCols[0], ROW_V[1], { silk: "ATTACK TIME", silkSize: 20, ticks: 11, group: "FILTER" }));
  list.push(P("filterDecay", "knob", modCols[1], ROW_V[1], { silk: "DECAY TIME", silkSize: 20, ticks: 11, group: "FILTER" }));
  list.push(P("filterSustain", "knob", modCols[2], ROW_V[1], { silk: "SUSTAIN LEVEL", silkSize: 20, ticks: 11, group: "FILTER" }));
  list.push(P("loudnessAttack", "knob", modCols[0], ROW_V[2], { silk: "ATTACK TIME", silkSize: 20, ticks: 11, group: "LOUDNESS CONTOUR" }));
  list.push(P("loudnessDecay", "knob", modCols[1], ROW_V[2], { silk: "DECAY TIME", silkSize: 20, ticks: 11, group: "LOUDNESS CONTOUR" }));
  list.push(P("loudnessSustain", "knob", modCols[2], ROW_V[2], { silk: "SUSTAIN LEVEL", silkSize: 20, ticks: 11, group: "LOUDNESS CONTOUR" }));

  // ── OUTPUT ─────────────────────────────────────────────────────
  list.push(P("mainVolume", "knob", out.x0 + 0.014, ROW_V[0], { silk: "VOLUME · MAIN OUTPUT", silkSize: 19, ticks: 11 }));
  list.push(P("tunerButton", "button", out.x0 + 0.034, ROW_V[1] + 0.004, { silk: "A-440", silkSize: 20 }));
  list.push(P("tunerOn", "switch", out.x0 + 0.034, ROW_V[2] - 0.002, { silk: "", color: "blue", sub: "ON", silkOffset: -0.017 }));
  list.push(P("power", "rocker", out.x0 + 0.05, ROW_V[1], { silk: "POWER", silkSize: 20 }));
  list.push(P("powerLed", "led", out.x0 + 0.05, 0.078, { silk: "POWER ON", silkSize: 16, silkOffset: -0.014 }));

  // ── 键盘左侧边条 ───────────────────────────────────────────────
  const sideX = (DIM.SIDE_X0 + DIM.SIDE_X1) / 2;
  list.push(S("lfoRate", "knob", sideX, 0.006, { silk: "LFO RATE", silkSize: 20, ticks: 11 }));
  list.push(S("lfoWaveform", "switch", sideX, 0.034, { silk: "TRIANGLE / SQUARE", silkSize: 16, color: "black" }));
  list.push(S("glideOn", "switch", sideX - 0.014, 0.058, { silk: "GLIDE", silkSize: 18, color: "black", sub: "ON" }));
  list.push(S("decaySwitchOn", "switch", sideX + 0.014, 0.058, { silk: "DECAY", silkSize: 18, color: "black", sub: "ON" }));
  list.push(S("pitchWheel", "wheel", sideX - 0.018, 0.104, { silk: "PITCH", silkSize: 16 }));
  list.push(S("modWheel", "wheel", sideX + 0.018, 0.104, { silk: "MOD.", silkSize: 16 }));

  return list;
}

export const PLACEMENTS: Placement[] = buildPlacements();

export const PLACEMENT_BY_ID: Record<string, Placement> = {};
for (const p of PLACEMENTS) PLACEMENT_BY_ID[p.id] = p;

/** MODIFIERS 区的两个丝印子框(v 范围与 u 范围) */
export const SUB_FRAMES = [
  { label: "FILTER", x0: section("modifiers").x0, x1: section("modifiers").x1, v0: ROW_V[1] - 0.018, v1: 0.098 },
  {
    label: "LOUDNESS CONTOUR",
    x0: section("modifiers").x0,
    x1: section("modifiers").x1,
    v0: ROW_V[2] - 0.019,
    v1: ROW_V[2] + 0.018,
  },
];
