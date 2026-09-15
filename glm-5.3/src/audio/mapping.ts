/**
 * 旋钮值 → 音频物理量 的全部映射曲线(PRD §10 / §15)。
 * 纯函数,便于 Vitest 与 OfflineAudioContext 断言复用。
 */

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** 包络旋钮 0–10 → 秒(PRD AUD-8 分段非线性:0≈0ms…10≈10s) */
const ENV_STOPS: Array<[number, number]> = [
  [0, 0],
  [1, 10],
  [2, 200],
  [4, 600],
  [6, 1000],
  [8, 5000],
  [10, 10000],
];
export function envSeconds(v: number): number {
  const x = clamp(v, 0, 10);
  for (let i = 0; i < ENV_STOPS.length - 1; i++) {
    const [a, ams] = ENV_STOPS[i];
    const [b, bms] = ENV_STOPS[i + 1];
    if (x >= a && x <= b) {
      const t = (x - a) / (b - a);
      return (ams + t * (bms - ams)) / 1000;
    }
  }
  return 10;
}

/** 松键固定释放尾(PRD AUD-8:30–100ms) */
export const RELEASE_SECONDS = 0.07;

/** Cutoff −5…+5 → 10Hz–32kHz,音乐分布曲线(照参考实现的 0.6 幂) */
export function cutoffHz(v: number): number {
  const u = clamp((clamp(v, -5, 5) + 5) / 10, 0, 1);
  return clamp(10 * Math.pow(3200, Math.pow(u, 0.6)), 10, 32000);
}

/** Emphasis 0–10 → 共振 0–1(高端进入自激) */
export function resonance(v: number): number {
  const x = clamp(v, 0, 10) / 10;
  if (x < 0.5) return (x / 0.5) * 0.3;
  if (x < 0.7) return 0.3 + Math.pow((x - 0.5) / 0.2, 1.1) * 0.3;
  if (x < 0.85) return 0.6 + Math.pow((x - 0.7) / 0.15, 0.8) * 0.25;
  return 0.85 + Math.pow((x - 0.85) / 0.15, 0.4) * 0.15;
}

/** 滤波包络对截止的调制深度:0–10 → 0–5.5 个八度(开方曲线,同参考实现的激进感) */
export function contourOctaves(v: number): number {
  return Math.pow(clamp(v, 0, 10) / 10, 0.5) * 5.5;
}

/** Glide 0–10 → 5ms–2.5s 指数(AUD-11) */
export function glideSeconds(v: number): number {
  return 0.005 * Math.pow(500, clamp(v, 0, 10) / 10);
}

/** LFO Rate 0–10 → 0.2–20Hz 对数 */
export function lfoHz(v: number): number {
  return 0.2 * Math.pow(100, clamp(v, 0, 10) / 10);
}

/** LO 档振荡器频率:0–10(Frequency 旋钮)→ 0.2–20Hz 对数 */
export function loHz(v: number): number {
  return lfoHz(v);
}

/** 旋钮 0–10 → 增益(近似平方曲线,模拟抽头) */
export function volGain(v: number, scale = 1): number {
  return Math.pow(clamp(v, 0, 10) / 10, 1.6) * scale;
}

/** 主音量 0–10 → 输出增益(后接软饱和) */
export function masterGain(v: number): number {
  return Math.pow(clamp(v, 0, 10) / 10, 1.5) * 0.55;
}

/** 调制轮 0–100 → 0–1 */
export const wheelDepth = (w: number) => clamp(w, 0, 100) / 100;

/** 音高 FM 满深度(半音)— 常量便于调音决策 */
export const PITCH_FM_SEMITONES = 7;
/** 滤波 FM 满深度(八度) */
export const FILTER_FM_OCTAVES = 3;

/** 弯音轮 ±2 半音(AUD-12);wheel 0–100,50 = 中位 */
export function bendSemitones(wheel: number): number {
  return ((clamp(wheel, 0, 100) - 50) / 50) * 2;
}

/** 混音器电平旋钮 → 进滤波器前的增益 */
export function mixerGain(v: number): number {
  return volGain(v, 0.5);
}

/** MIDI 音符 → 频率(A-440) */
export function midiToHz(midi: number, tuneSemis = 0): number {
  return 440 * Math.pow(2, (midi - 69 + tuneSemis) / 12);
}

/** 振荡器频率:midi 音高 + 音域八度 + 独立失谐;结果钳制 20Hz–20kHz(附录 B) */
export function oscHz(
  midi: number,
  rangeOct: number,
  tuneSemis: number,
  masterTuneSemis: number,
  bendSemis: number,
): number {
  const hz =
    440 *
    Math.pow(
      2,
      (midi - 69 + rangeOct * 12 + tuneSemis + masterTuneSemis + bendSemis) / 12,
    );
  return clamp(hz, 20, 20000);
}

/** 滤波键盘跟踪(AUD-7:KC1 +100%/八度,KC2 +50%/八度) */
export function kcOctaves(kc1: boolean, kc2: boolean): number {
  return (kc1 ? 1 : 0) + (kc2 ? 0.5 : 0);
}
