/** 整机尺寸(米,按真实乐器比例,PRD MDL-0:整机宽约 0.56m) */

export const DIMS = {
  // 主体
  innerW: 0.5, // 内箱宽度(x:-0.25..0.25)
  cheekW: 0.03, // 木侧板厚度 → 总宽 0.56
  bodyTop: 0.126, // 机身顶面高
  bodyBottom: 0.012, // 底部(含脚垫离地)
  frontZ: 0.135, // 前沿
  rearZ: -0.21, // 后沿(面板放平时容纳面板深度)
  // 键盘
  keyBedTop: 0.132, // 键床面
  keyBedFrontZ: 0.102,
  keyBedRearZ: -0.048, // 铰链线位置
  whiteW: 0.0150,
  whiteGap: 0.00123,
  whiteD: 0.15,
  whiteH: 0.011,
  blackW: 0.0095,
  blackD: 0.095,
  blackH: 0.007,
  keysX0: -0.175, // 白键起始左缘
  // 铰链面板
  panelHingeZ: -0.048,
  panelW: 0.5,
  panelD: 0.155, // 面板「宽」(立起方向)
  panelT: 0.014,
  panelMaxDeg: 60,
  panelDefaultDeg: 50,
  // 轮子
  wheelR: 0.012,
  wheelW: 0.018,
  pitchWheelX: -0.224,
  modWheelX: -0.192,
  wheelZ: 0.028,
} as const;

/** 铰链轴世界位置 */
export const HINGE_POS = {
  x: 0,
  y: 0.14,
  z: DIMS.panelHingeZ,
} as const;

/** MIDI 41(F2)–84(C6),共 44 键 */
export const KEY_LOW = 41;
export const KEY_HIGH = 84;

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
