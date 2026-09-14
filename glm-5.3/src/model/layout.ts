/**
 * 面板布局表 —— 丝印绘制与 3D 控件摆位的唯一坐标来源(MDL-5)。
 * 坐标系:x = 距面板左缘距离(米),y = 距面板前缘(近玩家侧)距离(米)。
 * 面板自左向右分区:CONTROLLERS / OSCILLATOR BANK(Osc-3·Osc-2·Osc-1)/ MIXER / MODIFIERS。
 */

import { DIMS } from "./dimensions";

export const PANEL = {
  w: DIMS.panelW,
  h: DIMS.panelD,
};

export type PanelItem = {
  id?: string; // 对应 ParamStore id(selector/knob/switch)
  type: "knob" | "selector" | "switch-v" | "switch-h";
  x: number;
  y: number;
  d?: number; // 直径(knob/selector)
  w?: number; // 开关尺寸
  h?: number;
  label?: string;
  labelPos?: "above" | "below" | "left" | "right";
  /** selector 刻度标签(顺时针从 0 档开始) */
  tickLabels?: string[];
  /** 调制开关文字标签 */
  tag?: string;
};

export const SECTIONS = [
  { title: "CONTROLLERS", x0: 0.004, x1: 0.076 },
  { title: "OSCILLATOR BANK", x0: 0.078, x1: 0.272 },
  { title: "MIXER", x0: 0.274, x1: 0.346 },
  { title: "MODIFIERS", x0: 0.348, x1: 0.404 },
] as const;

export const DIVIDERS = [0.077, 0.273, 0.347, 0.415];

const OSC_X = [0.114, 0.175, 0.236]; // Osc-3 / Osc-2 / Osc-1

export const ITEMS: PanelItem[] = [
  // ---- CONTROLLERS ----
  { id: "glide", type: "knob", x: 0.022, y: 0.116, d: 0.024, label: "GLIDE", labelPos: "below" },
  { id: "modMix", type: "knob", x: 0.022, y: 0.073, d: 0.024, label: "MOD. MIX", labelPos: "above" },
  { id: "tune", type: "knob", x: 0.022, y: 0.03, d: 0.024, label: "TUNE", labelPos: "above" },
  { id: "modSwitch", type: "switch-v", x: 0.054, y: 0.114, w: 0.021, h: 0.028, tag: "MODULATION" },
  { id: "decaySwitch", type: "switch-v", x: 0.054, y: 0.058, w: 0.021, h: 0.028, tag: "DECAY" },

  // ---- OSCILLATOR BANK(三列:Osc-3 / Osc-2 / Osc-1)----
  ...([3, 2, 1] as const).flatMap((n, i): PanelItem[] => {
    const cx = OSC_X[i];
    const items: PanelItem[] = [
      { id: `osc${n}Range`, type: "selector", x: cx, y: 0.112, d: 0.032, label: "RANGE", labelPos: "above" },
      { id: `osc${n}Freq`, type: "knob", x: cx, y: 0.071, d: 0.021, label: "FREQUENCY", labelPos: "above" },
      { id: `osc${n}Wave`, type: "selector", x: cx, y: 0.03, d: 0.032, label: "WAVEFORM", labelPos: "above" },
    ];
    if (n === 3) {
      items.push({
        id: "osc3Control",
        type: "switch-h",
        x: cx + 0.026,
        y: 0.071,
        w: 0.019,
        h: 0.012,
        tag: "CONTROL",
      });
    }
    return items;
  }),

  // ---- MIXER ----
  { id: "osc1Vol", type: "knob", x: 0.31, y: 0.138, d: 0.021, label: "OSC 1", labelPos: "left" },
  { id: "osc2Vol", type: "knob", x: 0.31, y: 0.111, d: 0.021, label: "OSC 2", labelPos: "left" },
  { id: "osc3Vol", type: "knob", x: 0.31, y: 0.084, d: 0.021, label: "OSC 3", labelPos: "left" },
  { id: "noiseVol", type: "knob", x: 0.31, y: 0.057, d: 0.021, label: "NOISE", labelPos: "left" },
  { id: "extVol", type: "knob", x: 0.31, y: 0.03, d: 0.021, label: "EXT. IN", labelPos: "left" },

  // ---- MODIFIERS ----
  { id: "cutoff", type: "knob", x: 0.368, y: 0.114, d: 0.03, label: "CUTOFF", labelPos: "above" },
  { id: "emphasis", type: "knob", x: 0.368, y: 0.062, d: 0.025, label: "EMPHASIS", labelPos: "above" },
  { id: "contour", type: "knob", x: 0.368, y: 0.021, d: 0.025, label: "CONTOUR", labelPos: "above" },
  { id: "filtModSwitch", type: "switch-v", x: 0.397, y: 0.114, w: 0.018, h: 0.024, tag: "MOD" },
  { id: "kc1", type: "switch-v", x: 0.397, y: 0.062, w: 0.018, h: 0.024, tag: "K.B. 1" },
  { id: "kc2", type: "switch-v", x: 0.397, y: 0.021, w: 0.018, h: 0.024, tag: "K.B. 2" },
  // 滤波包络列
  { id: "filtA", type: "knob", x: 0.436, y: 0.122, d: 0.019, tag: "A" },
  { id: "filtD", type: "knob", x: 0.436, y: 0.09, d: 0.019, tag: "D" },
  { id: "filtSustain", type: "switch-v", x: 0.436, y: 0.058, w: 0.017, h: 0.022, tag: "S" },
  { id: "filtR", type: "knob", x: 0.436, y: 0.031, d: 0.019, tag: "R" },
  // 响度包络列
  { id: "loudA", type: "knob", x: 0.472, y: 0.122, d: 0.019, tag: "A" },
  { id: "loudD", type: "knob", x: 0.472, y: 0.09, d: 0.019, tag: "D" },
  { id: "loudSustain", type: "switch-v", x: 0.472, y: 0.058, w: 0.017, h: 0.022, tag: "S" },
  { id: "loudR", type: "knob", x: 0.472, y: 0.031, d: 0.019, tag: "R" },
  { id: "volume", type: "knob", x: 0.454, y: 0.013, d: 0.022, label: "VOLUME", labelPos: "left" },
];

/** 波形 selector 刻度用小图形索引(0-5) */
export const WAVE_GLYPHS = ["tri", "saw", "rsaw", "sqr", "pulse-wide", "pulse-narrow"] as const;

export const RANGE_TICKS = ["32'", "16'", "8'", "4'", "2'"];
export const RANGE_TICKS_LO = ["LO", "32'", "16'", "8'", "4'", "2'"];
