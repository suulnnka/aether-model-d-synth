import { SynthEngine } from "./engine";
import { ParamStore } from "../state/paramStore";

/**
 * 离线渲染自检(PRD §8.7):用 OfflineAudioContext 渲染并断言
 * 波形频谱、滤波斜率(24dB/oct)、自激、包络时间、滑音时长、单音优先级。
 * 浏览器访问 ?selftest 运行(OffineAudioContext 仅存在于浏览器)。
 */

export interface SelfTestCase {
  name: string;
  pass: boolean;
  detail: string;
}

function makeStore(): ParamStore {
  const s = new ParamStore(null);
  // 出厂默认 → 干净测试底噪
  s.set("osc1Vol", 0);
  s.set("osc2Vol", 0);
  s.set("osc3Vol", 0);
  s.set("noiseVol", 0);
  s.set("volume", 10);
  return s;
}

async function renderScenario(
  dur: number,
  setup: (eng: SynthEngine, ctx: OfflineAudioContext, setNow: (t: number) => void) => void
): Promise<{ data: Float32Array; sr: number; mode: string }> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
  const store = makeStore();
  const eng = await SynthEngine.create(ctx, store, `${import.meta.env.BASE_URL}audio/ladder-worklet.js`);
  // 引擎以 ctx.currentTime 调度自动化;离线渲染期间手动推进虚拟时钟
  let now = 0;
  Object.defineProperty(ctx, "currentTime", {
    get: () => now,
    configurable: true,
  });
  setup(eng, ctx, (t) => (now = t));
  const buffer = await ctx.startRendering();
  return { data: buffer.getChannelData(0), sr, mode: eng.filterMode };
}

/** Goertzel 单频幅度(start/end 单位:秒) */
function ampAt(data: Float32Array, sr: number, freq: number, start = 0, end = data.length / sr): number {
  const w = (2 * Math.PI * freq) / sr;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  const n0 = Math.max(0, Math.floor(start * sr));
  const n1 = Math.min(data.length, Math.ceil(end * sr));
  for (let i = n0; i < n1; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const len = n1 - n0;
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (len / 2);
}

function rms(data: Float32Array, sr: number, start: number, end: number): number {
  const n0 = Math.max(0, Math.floor(start * sr));
  const n1 = Math.min(data.length, Math.ceil(end * sr));
  let sum = 0;
  for (let i = n0; i < n1; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, n1 - n0));
}

function setVoice(store: ParamStore): void {
  store.set("osc1Vol", 10);
  store.set("osc2Vol", 0);
  store.set("osc3Vol", 0);
  store.set("cutoff", 18000);
  store.set("emphasis", 0);
  store.set("loudA", 0.002);
  store.set("loudD", 10);
  store.set("loudSustain", 1);
  store.set("loudR", 0.05);
  store.set("volume", 10);
}

export async function runSelfTest(): Promise<SelfTestCase[]> {
  const cases: SelfTestCase[] = [];
  const push = (name: string, pass: boolean, detail: string) =>
    cases.push({ name, pass, detail });

  // ---- 1. 锯齿波频谱(带限,谐波 1/n)----
  try {
    const { data, sr, mode } = await renderScenario(1.2, (eng, _ctx, setNow) => {
      setVoice(eng.store);
      setNow(0.01);
      eng.noteOn(60); // C4 = 261.6Hz
    });
    const seg = (f: number) => ampAt(data, sr, f, 0.5, 1.1);
    const f0 = 261.63;
    const m1 = seg(f0);
    const r2 = seg(2 * f0) / m1;
    const r3 = seg(3 * f0) / m1;
    const rOff = seg(1.5 * f0) / m1; // 非谐波杂散
    push(
      `锯齿波频谱(${mode})`,
      r2 > 0.3 && r2 < 0.75 && r3 > 0.12 && r3 < 0.5 && rOff < 0.12,
      `2f0/f0=${r2.toFixed(2)} 3f0/f0=${r3.toFixed(2)} 杂散=${rOff.toFixed(3)}`
    );
  } catch (e) {
    push("锯齿波频谱", false, String(e));
  }

  // ---- 2. 滤波器斜率(正弦直测,取高于转折点 1.5–4.5 oct 区间)----
  try {
    const sr = 44100;
    const ampOf = async (f: number): Promise<number> => {
      const ctx = new OfflineAudioContext(1, sr, sr);
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/ladder-worklet.js`);
      const node = new AudioWorkletNode(ctx, "aether-ladder-filter", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      });
      node.parameters.get("cutoff")!.value = 2500;
      node.parameters.get("emphasis")!.value = 0;
      node.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(node);
      osc.start(0);
      osc.stop(1.0);
      const data = (await ctx.startRendering()).getChannelData(0);
      const w = (2 * Math.PI * f) / sr;
      let re = 0;
      let im = 0;
      for (let i = Math.floor(sr * 0.5); i < data.length; i++) {
        re += data[i] * Math.cos(w * i);
        im -= data[i] * Math.sin(w * i);
      }
      return (2 * Math.hypot(re, im)) / (sr * 0.5) / 0.5;
    };
    const a15 = 20 * Math.log10(await ampOf(1500));
    const a3k = 20 * Math.log10(await ampOf(3000));
    const a6k = 20 * Math.log10(await ampOf(6000));
    const a12k = 20 * Math.log10(await ampOf(12000));
    const slopeLow = (a6k - a15) / 2; // dB/oct(接近转折点,斜率渐升)
    const slopeHigh = (a12k - a3k) / 2; // dB/oct(渐近 24)
    push(
      "滤波斜率(渐近 24dB/oct)",
      slopeHigh > -30 && slopeHigh < -16 && slopeLow < -10,
      `1.5k→6k ${slopeLow.toFixed(1)} dB/oct,3k→12k ${slopeHigh.toFixed(1)} dB/oct`
    );
  } catch (e) {
    push("滤波斜率", false, String(e));
  }

  // ---- 3. 自激(Emphasis 拉满)----
  try {
    const { data, sr, mode } = await renderScenario(1.8, (eng, _ctx, setNow) => {
      const s = eng.store;
      s.set("cutoff", 800);
      s.set("contour", 0);
      s.set("emphasis", 10);
      s.set("loudA", 0.002);
      s.set("loudSustain", 1);
      s.set("volume", 10);
      s.set("noiseVol", 6); // 激励种子
      setNow(0.01);
      eng.noteOn(60);
      setNow(0.25);
      s.set("noiseVol", 0); // 切断激励,观察自激维持
    });
    const segRms = rms(data, sr, 0.9, 1.7);
    let domF = 0;
    let domA = 0;
    for (let f = 80; f <= 3000; f += 8) {
      const a = ampAt(data, sr, f, 0.9, 1.7);
      if (a > domA) {
        domA = a;
        domF = f;
      }
    }
    const ok = segRms > 0.005 && domF >= 400 && domF <= 2600;
    push(
      `自激振荡 Emphasis=10(${mode})`,
      mode === "worklet" ? ok : true,
      mode === "worklet" ? `RMS=${segRms.toFixed(3)} 主频≈${domF}Hz(截止2kHz)` : "兼容模式无自激(预期)"
    );
  } catch (e) {
    push("自激", false, String(e));
  }

  // ---- 4. 响度包络时间(A/D/R 语义)----
  try {
    const { data, sr } = await renderScenario(1.0, (eng, _ctx, setNow) => {
      const s = eng.store;
      setVoice(s);
      s.set("loudA", 0.1);
      s.set("loudD", 0.2);
      s.set("loudSustain", 1);
      s.set("loudR", 0.1);
      setNow(0.1);
      eng.noteOn(60); // attack 0.1s → peak;decay → 0.75;release@0.35
      setNow(0.35);
      eng.noteOff(60);
    });
    const a = (t: number, f = 261.63) => ampAt(data, sr, f, t, t + 0.02);
    const peak = a(0.2);
    const sus = a(0.32);
    const rel = a(0.52);
    const ratio = peak > 0 ? sus / peak : 0;
    const relDb = peak > 0 ? 20 * Math.log10(Math.max(rel, 1e-6) / peak) : -120;
    push(
      "响度包络 A/D/S/R",
      ratio > 0.5 && ratio < 1.05 && relDb < -30,
      `sustain/peak=${ratio.toFixed(2)}(期望≈0.75) release=${relDb.toFixed(0)}dB`
    );
  } catch (e) {
    push("响度包络", false, String(e));
  }

  // ---- 5. 滑音时长(glide TC)----
  try {
    const { data, sr } = await renderScenario(3.6, (eng, _ctx, setNow) => {
      setVoice(eng.store);
      eng.store.set("glide", 10); // 2.5s
      setNow(0.05);
      eng.noteOn(60); // C4
      setNow(0.3);
      eng.noteOn(72); // C5,滑向 C5
    });
    // 第二次按下后 2.5s(τ)→ 频率应到目标的 63%
    const seg = (f: number) => ampAt(data, sr, f, 2.75, 3.3);
    let bestF = 0;
    let bestA = 0;
    for (let f = 300; f <= 600; f += 4) {
      const a = seg(f);
      if (a > bestA) {
        bestA = a;
        bestF = f;
      }
    }
    const expected = 261.63 + (523.25 - 261.63) * 0.632;
    push(
      "滑音 2.5s @ τ",
      Math.abs(bestF - expected) < 40,
      `实测 ${bestF}Hz 期望≈${expected.toFixed(0)}Hz`
    );
  } catch (e) {
    push("滑音", false, String(e));
  }

  // ---- 6. 滤波包络(Contour 扫频)----
  try {
    const { data, sr } = await renderScenario(1.6, (eng, _ctx, setNow) => {
      const s = eng.store;
      setVoice(s);
      s.set("cutoff", 800);
      s.set("contour", 10); // peak = 800×16
      s.set("filtA", 0.01);
      s.set("filtD", 0.25);
      s.set("filtSustain", 0); // 衰减回基准
      s.set("volume", 10);
      setNow(0.05);
      eng.noteOn(60);
    });
    const bright1 = ampAt(data, sr, 5000, 0.07, 0.14); // attack 顶点附近
    const bright2 = ampAt(data, sr, 5000, 1.1, 1.5); // 衰减回 800Hz 后
    const ratio = bright2 > 1e-9 ? bright1 / bright2 : 99;
    push(
      "滤波包络 Contour 扫频",
      ratio > 2,
      `起始/衰减后 5kHz 能量比=${ratio.toFixed(1)}`
    );
  } catch (e) {
    push("滤波包络", false, String(e));
  }

  // ---- 7. 单音 last-note priority(乱序松开回退)----
  try {
    const { data, sr } = await renderScenario(1.4, (eng, _ctx, setNow) => {
      setVoice(eng.store);
      eng.store.set("glide", 0);
      setNow(0.02);
      eng.noteOn(60); // C4
      setNow(0.2);
      eng.noteOn(64); // E4(当前音)
      setNow(0.5);
      eng.noteOff(64); // 乱序松开 → 回退 C4
    });
    const f = (t0: number, t1: number) => {
      let bf = 0;
      let ba = 0;
      for (let fq = 200; fq <= 400; fq += 2) {
        const a = ampAt(data, sr, fq, t0, t1);
        if (a > ba) {
          ba = a;
          bf = fq;
        }
      }
      return bf;
    };
    const during = f(0.3, 0.48);
    const after = f(0.9, 1.3);
    push(
      "单音优先级回退",
      Math.abs(during - 326) < 12 && Math.abs(after - 262) < 12,
      `按住时 ${during}Hz(E4) 松开后 ${after}Hz(C4)`
    );
  } catch (e) {
    push("单音优先级", false, String(e));
  }

  // ---- 8. 释放后底噪 ≤ −80dB ----
  try {
    const { data, sr } = await renderScenario(2.0, (eng, _ctx, setNow) => {
      setVoice(eng.store);
      eng.store.set("loudR", 0.1);
      setNow(0.02);
      eng.noteOn(60);
      setNow(0.3);
      eng.noteOff(60);
    });
    const floor = rms(data, sr, 1.2, 1.9);
    push("Release 后底噪 ≤ −80dB", floor < 1e-4, `RMS=${floor.toExponential(2)}`);
  } catch (e) {
    push("底噪", false, String(e));
  }

  return cases;
}

