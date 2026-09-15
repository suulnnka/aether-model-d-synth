/**
 * 整机尺寸与面板布局坐标(PRD §8:以真实乐器比例建模,单位米)。
 * 面板布局以 §8.2 文字转录为准:五分区 + 四条交界开关列 + 键盘左侧边条。
 */

export const DIM = {
  totalW: 0.56,
  chassisW: 0.524,
  woodT: 0.018,
  depth: 0.36, // z ∈ [-0.18, +0.18]
  baseH: 0.062, // 底箱顶面
  keyTopY: 0.058, // 白键顶面
  keyWellFloor: 0.03, // 键盘井底
  /** 铰链线:面板前缘(键盘侧)—— 面板向前(向演奏者)掀起,对照 ref 图 3/图 4 */
  hingeZ: 0.04,
  hingeY: 0.068,
  /** 面板(控制面)纵深:铰链 → 前缘 */
  panelD: 0.205,
  /** 面板厚箱体纵深(MDL-8:8–12cm) */
  panelThick: 0.08,
  keyBayStart: 0.04, // 面板前缘 = 键盘区起点
  keyLen: 0.132, // 白键长度
  frontLip: 0.178,
} as const;

export const HALF_W = DIM.chassisW / 2; // 0.262

/** 面板分区 x 边界(自左向右,PRD §8.2) */
export const SEC = {
  controllers: [-0.262, -0.187],
  colAB: [-0.187, -0.167], // 交界柱 A/B:Oscillator Modulation(上)、Osc-3 Control(下)
  osc: [-0.167, -0.017],
  colC_mixer: [-0.017, 0.075],
  colD_mod: [0.075, 0.2],
  output: [0.2, 0.262],
} as const;

/** 面板 v 行位(距铰链边,自上而下) */
export const ROW = {
  v0: 0.02, // 顶部留白 / Overload 灯
  r1: 0.052, // 振荡器 1 / Tune / Cutoff 行
  r2: 0.102, // 振荡器 2 / 滤波包络行
  r3: 0.152, // 振荡器 3 / 响度包络行
  title: 0.186, // 分区标题带
  front: 0.205,
} as const;

/** 控件中心坐标(面板局部:x 横向,v 距铰链) */
export interface CtrlPos {
  x: number;
  v: number;
}

export const POS = {
  /* CONTROLLERS */
  tune: { x: -0.2245, v: ROW.r1 },
  glideTime: { x: -0.243, v: ROW.r2 },
  modMix: { x: -0.206, v: ROW.r2 },
  srcA: { x: -0.243, v: ROW.r3 },
  srcB: { x: -0.206, v: ROW.r3 },
  /* 交界柱 A/B */
  oscMod: { x: -0.177, v: ROW.r1 },
  osc3Control: { x: -0.177, v: ROW.r3 },
  /* OSCILLATOR BANK:每排 Range / Frequency / Waveform */
  oscRange: (n: number): CtrlPos => ({ x: -0.1325, v: rowOf(n) }),
  oscFreq: (n: number): CtrlPos => ({ x: -0.092, v: rowOf(n) }),
  oscWave: (n: number): CtrlPos => ({ x: -0.047, v: rowOf(n) }),
  /* MIXER:交界列 C 蓝拨杆 + 三枚 Volume;右侧 Ext/Noise */
  oscOn: (n: number): CtrlPos => ({ x: -0.008, v: rowOf(n) }),
  oscVol: (n: number): CtrlPos => ({ x: 0.024, v: rowOf(n) }),
  extVol: { x: 0.058, v: ROW.r1 },
  extOn: { x: 0.036, v: ROW.r1 },
  noiseVol: { x: 0.058, v: ROW.r3 },
  noiseOn: { x: 0.036, v: ROW.r3 },
  noiseType: { x: 0.069, v: ROW.r2 },
  overload: { x: 0.067, v: ROW.v0 + 0.006 },
  /* 交界柱 D */
  filterMod: { x: 0.083, v: ROW.r1 },
  kc1: { x: 0.083, v: ROW.r2 },
  kc2: { x: 0.083, v: ROW.r3 },
  /* MODIFIERS — FILTER 框(6 旋钮,2×3) */
  cutoff: { x: 0.113, v: ROW.r1 },
  emphasis: { x: 0.147, v: ROW.r1 },
  contour: { x: 0.181, v: ROW.r1 },
  filtA: { x: 0.113, v: ROW.r2 },
  filtD: { x: 0.147, v: ROW.r2 },
  filtS: { x: 0.181, v: ROW.r2 },
  /* MODIFIERS — LOUDNESS CONTOUR 框(3 旋钮) */
  loudA: { x: 0.117, v: ROW.r3 },
  loudD: { x: 0.147, v: ROW.r3 },
  loudS: { x: 0.177, v: ROW.r3 },
  /* OUTPUT */
  volume: { x: 0.218, v: ROW.r1 },
  a440: { x: 0.209, v: ROW.r2 },
  tunerOn: { x: 0.233, v: ROW.r2 },
  power: { x: 0.249, v: ROW.r1 + 0.012 },
  powerLed: { x: 0.249, v: ROW.r2 + 0.012 },
} as const;

function rowOf(n: number): number {
  return n === 1 ? ROW.r1 : n === 2 ? ROW.r2 : ROW.r3;
}

/* ---------------- 键盘左侧边条(黑色面板,自上而下) ---------------- */
export const SIDE = {
  x0: -0.262, // 左缘
  x1: -0.192, // 右缘(条宽 0.07)
  /** 边条面板 z 范围 [0.03, 0.18] */
  z0: 0.03,
  z1: 0.18,
  lfoRate: { x: -0.227, z: 0.056 },
  lfoWave: { x: -0.246, z: 0.092 },
  glide: { x: -0.209, z: 0.092 },
  decay: { x: -0.227, z: 0.118 },
  pitchWheel: { x: -0.245, z: 0.152 },
  modWheel: { x: -0.209, z: 0.152 },
} as const;

/* ---------------- 44 键键盘(C3–B5 + 高位延伸 8 键,PLAY-1 / 附录 B) ---------------- */
export const KEY_MIDI_START = 48; // C3
export const KEY_COUNT = 44;
/** 白键宽 */
export const WHITE_KEY_W = 0.0168;
export const KEY_AREA_X0 = SIDE.x1 + 0.008; // -0.184
export const KEY_AREA_X1 = HALF_W - 0.008; // 0.254
export const BLACK_KEY_W = WHITE_KEY_W * 0.58;
export const BLACK_KEY_LEN = DIM.keyLen * 0.62;

export interface KeyLayout {
  midi: number;
  x: number; // 白键槽位中心(黑键 = 相邻白键槽位之间)
  black: boolean;
}

/** 生成 44 键布局:C3..B5(36)+ C6..G6(8) */
export function keyLayout(): KeyLayout[] {
  const keys: KeyLayout[] = [];
  const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  let whiteIndex = 0;
  for (let i = 0; i < KEY_COUNT; i++) {
    const midi = KEY_MIDI_START + i;
    const black = isBlack(midi);
    const x =
      KEY_AREA_X0 + (whiteIndex - (black ? 0.5 : 0)) * WHITE_KEY_W + WHITE_KEY_W / 2;
    keys.push({ midi, x, black });
    if (!black) whiteIndex++;
  }
  return keys;
}
