/**
 * 带限周期波表(AUD-4):六档波形全部以傅里叶系数构造 PeriodicWave,
 * ≤128 谐波杜绝混叠。
 */

export type WaveName =
  | "triangle"
  | "sawtooth"
  | "rev-saw"
  | "square"
  | "pulse-wide"
  | "pulse-narrow";

export const HARMONICS = 128;

/**
 * 返回 [real, imag] 谐波系数(忽略直流项 index 0)。
 * 采用正弦相位(imag),与标准 Web Audio 波表约定一致。
 */
export function harmonicSeries(wave: WaveName): {
  real: Float32Array;
  imag: Float32Array;
} {
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  const gain = (n: number) => {
    // 带限衰减:高次谐波轻微滚降,避免截止处的瞬态振铃
    const rolloff = 1 - 0.25 * Math.pow(n / HARMONICS, 2);
    return rolloff;
  };
  switch (wave) {
    case "triangle":
      // 奇次谐波,1/n² 衰减
      for (let n = 1; n <= HARMONICS; n += 2) {
        imag[n] = ((n % 4 === 1 ? 1 : -1) / (n * n)) * (8 / Math.PI ** 2) * gain(n);
      }
      break;
    case "sawtooth":
    case "rev-saw": {
      const sign = wave === "sawtooth" ? 1 : -1;
      for (let n = 1; n <= HARMONICS; n++) {
        imag[n] = (sign * (n % 2 === 0 ? -1 : 1)) / n * (2 / Math.PI) * gain(n);
      }
      break;
    }
    case "square":
      for (let n = 1; n <= HARMONICS; n += 2) {
        imag[n] = (1 / n) * (4 / Math.PI) * gain(n);
      }
      break;
    case "pulse-wide":
    case "pulse-narrow": {
      // 脉冲波:占空比 d 的傅里叶系数 sin(nπd)
      const d = wave === "pulse-wide" ? 0.25 : 0.08;
      const norm = 1 / d; // 保持基波能量接近
      for (let n = 1; n <= HARMONICS; n++) {
        imag[n] = Math.sin(Math.PI * n * d) / n * norm * 0.5 * gain(n);
      }
      break;
    }
  }
  return { real, imag };
}

const cache = new Map<string, PeriodicWave>();

export function periodicWave(ctx: BaseAudioContext, wave: WaveName): PeriodicWave {
  const key = `${ctx.sampleRate}:${wave}`;
  let pw = cache.get(key);
  if (!pw) {
    const { real, imag } = harmonicSeries(wave);
    pw = ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
    cache.set(key, pw);
  }
  return pw;
}

/** 供离线测试/自检直接采样一个周期的波形 */
export function sampleWave(wave: WaveName, points = 1024): Float32Array {
  const { real, imag } = harmonicSeries(wave);
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2;
    let v = 0;
    for (let n = 1; n <= HARMONICS; n++) {
      v += real[n] * Math.cos(n * t) + imag[n] * Math.sin(n * t);
    }
    out[i] = v;
  }
  return out;
}
