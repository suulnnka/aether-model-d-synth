/**
 * 参数映射(照抄参考实现的映射曲线)
 * ------------------------------------------------------------------
 * 本文件是「旋钮刻度 → 物理量」的唯一换算入口,与参考实现
 * ref/Minimoog/src/utils/{paramMappingUtils,audioUtils,midiUtils,frequencyUtils}.ts
 * 的曲线一致;包络时间按 PRD AUD-8 的分段表实现。
 */

export const MIDI_A4 = 69;
export const A4_FREQ = 440;

export const MIN_FREQUENCY = 20;
export const MAX_FREQUENCY = 20000;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

// ── 截止频率 ────────────────────────────────────────────────────────
const CUTOFF_MIN_FREQ = 10;
const CUTOFF_MAX_FREQ = 32000;
const CUTOFF_LOG_RATIO = Math.log(CUTOFF_MAX_FREQ / CUTOFF_MIN_FREQ);

/** 旋钮 −5…+5 → 10Hz–32kHz(curvePower 0.6 的音乐分布曲线) */
export function mapCutoff(val: number): number {
  const c = clamp(val, -5, 5);
  const normalized = (c + 5) / 10;
  const curved = Math.pow(normalized, 0.6);
  return clamp(CUTOFF_MIN_FREQ * Math.exp(curved * CUTOFF_LOG_RATIO), CUTOFF_MIN_FREQ, CUTOFF_MAX_FREQ);
}

/** 截止频率的反函数(供调制量按倍频程计算时使用) */
export function unmapCutoff(freq: number): number {
  const f = clamp(freq, CUTOFF_MIN_FREQ, CUTOFF_MAX_FREQ);
  const curved = Math.log(f / CUTOFF_MIN_FREQ) / CUTOFF_LOG_RATIO;
  return clamp(Math.pow(curved, 1 / 0.6) * 10 - 5, -5, 5);
}

// ── 共振 / Emphasis ─────────────────────────────────────────────────
/** 旋钮 0–10 → 归一化共振 0–1(四段曲线,高端进入自激) */
export function mapResonance(val: number): number {
  const n = clamp(val, 0, 10) / 10;
  if (n < 0.5) return n * (0.3 / 0.5);
  if (n < 0.7) return 0.3 + Math.pow((n - 0.5) / 0.2, 1.1) * 0.3;
  if (n < 0.85) return 0.6 + Math.pow((n - 0.7) / 0.15, 0.8) * 0.25;
  return 0.85 + Math.pow((n - 0.85) / 0.15, 0.4) * 0.15;
}

/** Emphasis 0–10 → 梯形滤波器共振参数(0–4,≥3.8 自激) */
export function mapEmphasisToLadderResonance(val: number): number {
  return mapResonance(val) * 4;
}

// ── 包络量 ──────────────────────────────────────────────────────────
/** Contour 0–10 → 0–40(滤波包络对截止的作用量) */
export function mapContourAmount(val: number): number {
  return Math.pow(clamp(val, 0, 10) / 10, 0.5) * 40;
}

// ── 包络时间(AUD-8 分段表) ─────────────────────────────────────────
const ENV_STOPS: Array<[number, number]> = [
  [0, 0.0],
  [1, 0.01],
  [2, 0.2],
  [4, 0.6],
  [6, 1.0],
  [8, 5.0],
  [10, 10.0],
];

/** 旋钮 0–10 → 秒(分段线性插值) */
export function mapEnvelopeTime(value: number): number {
  const v = clamp(value, 0, 10);
  for (let i = 1; i < ENV_STOPS.length; i++) {
    const [x1, y1] = ENV_STOPS[i];
    if (v <= x1) {
      const [x0, y0] = ENV_STOPS[i - 1];
      const t = (v - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return ENV_STOPS[ENV_STOPS.length - 1][1];
}

// ── 滑音 / LFO / 音量 ───────────────────────────────────────────────
/** Glide Time 0–10 → 秒(约 5ms–2.5s) */
export function calculateGlideTime(glideTime: number): number {
  return Math.pow(10, glideTime / 5) * 0.02;
}

/** LFO Rate 0–10 → 0.2–20Hz 对数 */
export function calculateLfoFrequency(rate: number): number {
  return clamp(0.2 * Math.pow(100, clamp(rate, 0, 10) / 10), 0.2, 20);
}

/** 主音量 0–10 → 增益 */
export function mapMainVolume(vol: number): number {
  return Math.pow(clamp(vol, 0, 10) / 10, 2);
}

/** 源音量 0–10 → 增益 */
export function calculateVolume(volume: number, boost = 1): number {
  return Math.min(1, (clamp(volume, 0, 10) / 10) * boost);
}

/** 调制轮深度曲线(幂曲线,150 音分满量程) */
export function calculateGradualModulation(value: number, max: number, power = 1.5): number {
  return Math.pow(clamp(value, 0, 100) / 100, power) * max;
}

// ── 音高 / 频率 ─────────────────────────────────────────────────────
export function midiNoteToFrequency(midiNote: number): number {
  return A4_FREQ * Math.pow(2, (midiNote - MIDI_A4) / 12);
}

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

/** "C#4" → MIDI 音符号 */
export function noteToMidiNote(note: string): number {
  const m = /^([A-G]#?)(-?\d+)$/.exec(note);
  if (!m) return MIDI_A4;
  return NOTE_INDEX[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}

export function noteToFrequency(note: string): number {
  return midiNoteToFrequency(noteToMidiNote(note));
}

/**
 * 计算某个振荡器的实际发声频率。
 * @param midiNote   键盘音高(MIDI 号)
 * @param masterTune 主音准 ±12 半音
 * @param detuneSemis 本振荡器 Frequency 旋钮 ±12 半音
 * @param pitchWheel 弯音轮 0–100(50 为中位)
 * @param detuneCents 固定微调音分(用于制造合唱感)
 */
export function calculateFrequency(
  midiNote: number,
  masterTune: number,
  detuneSemis: number,
  pitchWheel: number,
  detuneCents = 0
): number {
  const bendSemis = ((clamp(pitchWheel, 0, 100) - 50) / 50) * 2;
  const semis = midiNote - MIDI_A4 + masterTune + detuneSemis + bendSemis;
  const f = A4_FREQ * Math.pow(2, semis / 12) * Math.pow(2, detuneCents / 1200);
  return clamp(f, MIN_FREQUENCY, 22050);
}

/** 音域档位 → 频率倍率(参考实现:8' = 0.5,即比标准音高低一个八度) */
export const RANGE_MULTIPLIER: Record<string, number> = {
  "32": 0.25,
  "16": 0.5,
  "8": 0.5,
  "4": 2,
  "2": 4,
  lo: 0.5,
};

export const isLoRange = (range: string): boolean => range === "lo";

/** 滤波键盘跟踪:KC1 = +100%/八度,KC2 = +50%/八度(AUD-7) */
export function keyboardTrackingOctaves(kc1: boolean, kc2: boolean, midiNote: number): number {
  if (!kc1 && !kc2) return 0;
  const amount = (kc1 ? 1.0 : 0) + (kc2 ? 0.5 : 0);
  const octaves = (midiNote - 60) / 12; // 以 C4 为参考
  return octaves * amount;
}

/** 单音频率钳位(整机 20Hz–20kHz) */
export const clampAudioFrequency = (f: number): number => clamp(f, MIN_FREQUENCY, MAX_FREQUENCY);
