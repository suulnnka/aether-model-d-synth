/**
 * 面板布局总表(MDL-3 / MDL-5)
 * u,v 为面板正面归一化坐标:u = 0(左)→1(右);v = 0(前缘,靠键盘)→1(铰链轴,靠机身后)
 * 丝印绘制与控件 3D 摆位共用此表。
 */

export interface Placement {
  id: string;
  u: number;
  v: number;
}

export const SECTION_TITLES: { title: string; u0: number; u1: number }[] = [
  { title: "CONTROLLERS", u0: 0.015, u1: 0.155 },
  { title: "OSCILLATOR BANK", u0: 0.165, u1: 0.53 },
  { title: "MIXER", u0: 0.54, u1: 0.69 },
  { title: "MODIFIERS", u0: 0.7, u1: 0.985 },
];

/** 振荡器三列自左向右为 Osc-3 / Osc-2 / Osc-1(MDL-5) */
export const OSC_COLUMN_U = [0.235, 0.33, 0.425];

export const PLACEMENTS: Placement[] = [
  /* Controllers */
  { id: "glide", u: 0.055, v: 0.24 },
  { id: "modMix", u: 0.055, v: 0.52 },
  { id: "tune", u: 0.055, v: 0.8 },
  { id: "modOn", u: 0.125, v: 0.72 },
  { id: "decayOn", u: 0.125, v: 0.9 },

  /* Oscillator Bank:每列 Range / Waveform / Frequency */
  { id: "osc3Range", u: OSC_COLUMN_U[0], v: 0.2 },
  { id: "osc3Wave", u: OSC_COLUMN_U[0], v: 0.42 },
  { id: "osc3Freq", u: OSC_COLUMN_U[0], v: 0.64 },
  { id: "osc3Control", u: OSC_COLUMN_U[0], v: 0.86 },

  { id: "osc2Range", u: OSC_COLUMN_U[1], v: 0.2 },
  { id: "osc2Wave", u: OSC_COLUMN_U[1], v: 0.42 },
  { id: "osc2Freq", u: OSC_COLUMN_U[1], v: 0.64 },

  { id: "osc1Range", u: OSC_COLUMN_U[2], v: 0.2 },
  { id: "osc1Wave", u: OSC_COLUMN_U[2], v: 0.42 },
  { id: "osc1Freq", u: OSC_COLUMN_U[2], v: 0.64 },

  /* Mixer */
  { id: "osc1Vol", u: 0.585, v: 0.14 },
  { id: "osc2Vol", u: 0.585, v: 0.3 },
  { id: "osc3Vol", u: 0.585, v: 0.46 },
  { id: "noiseVol", u: 0.585, v: 0.62 },
  { id: "extVol", u: 0.585, v: 0.78 },

  /* Modifiers — 滤波器 */
  { id: "cutoff", u: 0.765, v: 0.2 },
  { id: "emphasis", u: 0.845, v: 0.2 },
  { id: "contour", u: 0.925, v: 0.2 },
  { id: "filterMod", u: 0.765, v: 0.42 },
  { id: "kc1", u: 0.805, v: 0.42 },
  { id: "kc2", u: 0.845, v: 0.42 },
  { id: "fAtt", u: 0.75, v: 0.66 },
  { id: "fDec", u: 0.812, v: 0.66 },
  { id: "fSus", u: 0.858, v: 0.66 },
  { id: "fRel", u: 0.912, v: 0.66 },

  /* Modifiers — 响度 */
  { id: "lAtt", u: 0.75, v: 0.9 },
  { id: "lDec", u: 0.812, v: 0.9 },
  { id: "lSus", u: 0.858, v: 0.9 },
  { id: "lRel", u: 0.912, v: 0.9 },
  { id: "volume", u: 0.965, v: 0.52 },
];

export const PLACEMENT_MAP: Map<string, Placement> = new Map(PLACEMENTS.map((p) => [p.id, p]));

/** 旋钮旁的小字标签(丝印) */
export const LABELS: { text: string; u: number; v: number; size?: number; small?: boolean }[] = [
  { text: "GLIDE", u: 0.055, v: 0.35 },
  { text: "MOD. MIX", u: 0.055, v: 0.63 },
  { text: "TUNE", u: 0.055, v: 0.9 },
  { text: "MOD", u: 0.125, v: 0.64, small: true },
  { text: "DECAY", u: 0.125, v: 0.82, small: true },

  ...[0, 1, 2].flatMap((col) => {
    const oscNo = 3 - col;
    const u = OSC_COLUMN_U[col];
    return [
      { text: `RANGE`, u, v: 0.31, small: true },
      { text: `WAVEFORM`, u, v: 0.53, small: true },
      { text: `FREQ`, u, v: 0.74, small: true },
      ...(oscNo === 3 ? [{ text: `OSC-3  ·  CONTROL`, u, v: 0.95, small: true }] : []),
    ];
  }),

  { text: "OSC-1", u: 0.585, v: 0.245, small: true },
  { text: "OSC-2", u: 0.585, v: 0.405, small: true },
  { text: "OSC-3", u: 0.585, v: 0.565, small: true },
  { text: "NOISE", u: 0.585, v: 0.725, small: true },
  { text: "EXT IN", u: 0.585, v: 0.885, small: true },

  { text: "CUTOFF", u: 0.765, v: 0.09, small: true },
  { text: "EMPHASIS", u: 0.845, v: 0.09, small: true },
  { text: "CONTOUR", u: 0.925, v: 0.09, small: true },
  { text: "MOD", u: 0.765, v: 0.5, small: true },
  { text: "KC1", u: 0.805, v: 0.5, small: true },
  { text: "KC2", u: 0.845, v: 0.5, small: true },
  { text: "FILTER CONTOUR", u: 0.79, v: 0.575, small: true },
  { text: "A", u: 0.75, v: 0.75, small: true },
  { text: "D", u: 0.812, v: 0.75, small: true },
  { text: "S", u: 0.858, v: 0.75, small: true },
  { text: "R", u: 0.912, v: 0.75, small: true },
  { text: "LOUDNESS CONTOUR", u: 0.795, v: 0.815, small: true },
  { text: "A", u: 0.75, v: 0.985, small: true },
  { text: "D", u: 0.812, v: 0.985, small: true },
  { text: "S", u: 0.858, v: 0.985, small: true },
  { text: "R", u: 0.912, v: 0.985, small: true },
  { text: "VOLUME", u: 0.965, v: 0.63, small: true },
];
