/**
 * 出厂预设(PRD AUD-16):默认音色 + 7 个经典风格。
 * 值为对 ParamStore 的部分覆盖,未提及的参数保持当前/出厂值之外还保留当前面板其余部分。
 * 载入语义:先恢复出厂再覆盖 preset.params —— 保证预设可完整复现。
 */

export interface Preset {
  id: string;
  name: string;
  params: Record<string, number>;
}

export const PRESETS: Preset[] = [
  { id: "init", name: "Init(出厂默认)", params: {} },

  {
    id: "fat-bass",
    name: "Fat Bass",
    params: {
      osc1Wave: 1, osc1Range: 3, osc1Vol: 8, osc1Freq: 0,
      osc2Wave: 1, osc2Range: 3, osc2Vol: 7, osc2Freq: 7,
      osc3Wave: 0, osc3Range: 1, osc3Vol: 5, osc3Freq: -5,
      cutoff: 900, emphasis: 5, contour: 6, kc1: 1, kc2: 0,
      filtA: 0.005, filtD: 0.25, filtSustain: 0, filtR: 0.2,
      loudA: 0.005, loudD: 0.35, loudSustain: 1, loudR: 0.15,
      glide: 0, volume: 6.5,
    },
  },
  {
    id: "acid",
    name: "Acid Squelch",
    params: {
      osc1Wave: 1, osc1Range: 3, osc1Vol: 9, osc1Freq: 0,
      osc2Wave: 4, osc2Range: 3, osc2Vol: 6, osc2Freq: 9,
      osc3Vol: 0,
      cutoff: 350, emphasis: 8.4, contour: 8.5, kc1: 1, kc2: 1,
      filtA: 0.002, filtD: 0.18, filtSustain: 0, filtR: 0.12,
      loudA: 0.002, loudD: 0.22, loudSustain: 0, loudR: 0.1,
      glide: 5.5, volume: 6,
    },
  },
  {
    id: "lead",
    name: "Solo Lead",
    params: {
      osc1Wave: 1, osc1Range: 3, osc1Vol: 8, osc1Freq: -4,
      osc2Wave: 1, osc2Range: 3, osc2Vol: 8, osc2Freq: 5,
      osc3Wave: 0, osc3Range: 3, osc3Vol: 4, osc3Freq: 0,
      cutoff: 2600, emphasis: 4, contour: 4, kc1: 1, kc2: 0,
      filtA: 0.03, filtD: 0.5, filtSustain: 1, filtR: 0.25,
      loudA: 0.02, loudD: 0.4, loudSustain: 1, loudR: 0.2,
      glide: 4.5, modSwitch: 1, modMix: 0, volume: 6,
    },
  },
  {
    id: "brass",
    name: "Brass Section",
    params: {
      osc1Wave: 1, osc1Range: 2, osc1Vol: 7, osc1Freq: -6,
      osc2Wave: 1, osc2Range: 2, osc2Vol: 7, osc2Freq: 6,
      osc3Wave: 1, osc3Range: 2, osc3Vol: 6, osc3Freq: 0,
      cutoff: 1400, emphasis: 3, contour: 6.5, kc1: 1, kc2: 0,
      filtA: 0.12, filtD: 0.4, filtSustain: 1, filtR: 0.3,
      loudA: 0.08, loudD: 0.3, loudSustain: 1, loudR: 0.25,
      volume: 6.5,
    },
  },
  {
    id: "hollow",
    name: "Hollow Reed",
    params: {
      osc1Wave: 4, osc1Range: 3, osc1Vol: 8, osc1Freq: 0,
      osc2Wave: 0, osc2Range: 3, osc2Vol: 5, osc2Freq: 9,
      osc3Vol: 0,
      cutoff: 1800, emphasis: 2, contour: 3, kc1: 0, kc2: 0,
      filtA: 0.01, filtD: 0.3, filtSustain: 1, filtR: 0.2,
      loudA: 0.01, loudD: 0.25, loudSustain: 1, loudR: 0.15,
      volume: 6,
    },
  },
  {
    id: "warm-keys",
    name: "Warm Keys",
    params: {
      osc1Wave: 1, osc1Range: 2, osc1Vol: 6, osc1Freq: -3,
      osc2Wave: 3, osc2Range: 2, osc2Vol: 6, osc2Freq: 4,
      osc3Wave: 0, osc3Range: 2, osc3Vol: 3, osc3Freq: 0,
      cutoff: 1900, emphasis: 1.5, contour: 3, kc1: 1, kc2: 0,
      filtA: 0.006, filtD: 0.45, filtSustain: 1, filtR: 0.28,
      loudA: 0.004, loudD: 0.5, loudSustain: 1, loudR: 0.3,
      volume: 6,
    },
  },
  {
    id: "fx-drop",
    name: "FX Noise Drop",
    params: {
      osc1Vol: 0, osc2Vol: 0, osc3Vol: 0, noiseVol: 8,
      cutoff: 6000, emphasis: 6.5, contour: 9, kc1: 0, kc2: 0,
      filtA: 1.8, filtD: 2.4, filtSustain: 0, filtR: 1.5,
      loudA: 0.05, loudD: 2.8, loudSustain: 0, loudR: 1.2,
      modSwitch: 1, modMix: 10, volume: 6.5,
    },
  },
  {
    id: "drone",
    name: "Sci-Fi Drone",
    params: {
      osc1Wave: 2, osc1Range: 2, osc1Vol: 6, osc1Freq: -8,
      osc2Wave: 0, osc2Range: 1, osc2Vol: 6, osc2Freq: 6,
      osc3Wave: 1, osc3Range: 0, osc3Vol: 7, osc3Freq: 0,
      osc3Control: 0,
      cutoff: 800, emphasis: 7.5, contour: 2, kc1: 0, kc2: 0,
      filtA: 0.5, filtD: 1.5, filtSustain: 1, filtR: 1.0,
      loudA: 0.6, loudD: 1.0, loudSustain: 1, loudR: 0.8,
      modSwitch: 1, modMix: 0, volume: 5.5,
    },
  },
];
