/**
 * 带限波形表(PRD AUD-4):6 档波形以傅里叶系数构造 PeriodicWave,
 * 由 WebAudio 实现内部波表带限渲染,杜绝高频混叠。
 * 档位顺序与 §6.2 一致:三角波 / 锯齿 / 反锯齿 / 方波 / 宽脉冲 / 窄脉冲
 */

export type WaveformName =
  | "triangle"
  | "sawtooth"
  | "reverse-sawtooth"
  | "square"
  | "pulse-wide"
  | "pulse-narrow";

const N = 256; // 谐波上限(实现内部还会按播放频率做波表带限)

type Coefs = { real: Float32Array; imag: Float32Array };

function makeCoefs(fill: (n: number) => [number, number]): Coefs {
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    const [re, im] = fill(n);
    real[n] = re;
    imag[n] = im;
  }
  return { real, imag };
}

// 三角波:奇次谐波,1/n²,符号 (+,-,+,-,...)
const TRIANGLE = makeCoefs((n) => {
  if (n % 2 === 0) return [0, 0];
  const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
  return [(8 / (Math.PI * Math.PI)) * (sign / (n * n)), 0];
});

// 锯齿(升):全谐波 2/n (sine)
const SAW = makeCoefs((n) => [0, 2 / (n * Math.PI)]);
// 反锯齿(降)
const RSAW = makeCoefs((n) => [0, -2 / (n * Math.PI)]);
// 方波:奇次谐波 4/n (sine)
const SQUARE = makeCoefs((n) => (n % 2 === 1 ? [0, 4 / (n * Math.PI)] : [0, 0]));
// 脉冲波(占空比 d):cosine 系数 2/(nπ)·sin(nπd)
function pulse(duty: number): Coefs {
  return makeCoefs((n) => [
    (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty),
    0,
  ]);
}
const PULSE_WIDE = pulse(0.25);
const PULSE_NARROW = pulse(0.1);

const TABLES: Record<WaveformName, Coefs> = {
  triangle: TRIANGLE,
  sawtooth: SAW,
  "reverse-sawtooth": RSAW,
  square: SQUARE,
  "pulse-wide": PULSE_WIDE,
  "pulse-narrow": PULSE_NARROW,
};

const cache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

export function getWave(ctx: BaseAudioContext, name: WaveformName): PeriodicWave {
  let perCtx = cache.get(ctx);
  if (!perCtx) cache.set(ctx, (perCtx = new Map()));
  let wave = perCtx.get(name);
  if (!wave) {
    const { real, imag } = TABLES[name];
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    perCtx.set(name, wave);
  }
  return wave;
}

/** §6.2 波形档位序号 → 波形名 */
export const WAVE_NAMES: WaveformName[] = [
  "triangle",
  "sawtooth",
  "reverse-sawtooth",
  "square",
  "pulse-wide",
  "pulse-narrow",
];
