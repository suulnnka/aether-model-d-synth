/**
 * 离线渲染自检(AUD-16 / ?selftest):用 OfflineAudioContext 断言
 * 波形频谱、滤波斜率(24dB/oct)、自激、包络时间、滑音、释放底噪。
 */
import type { SynthEngine } from "./engine";
import type { ParamStore } from "../state/paramStore";

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function goertzel(
  data: Float32Array,
  sampleRate: number,
  freq: number,
  from = 0,
  to = data.length,
): number {
  const k = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i++) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const n = Math.max(1, to - from);
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.sqrt(Math.max(power, 0)) / (n / 2);
}

function rms(data: Float32Array, from: number, to: number): number {
  let acc = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) acc += data[i] * data[i];
  return Math.sqrt(acc / n);
}

/** 过零率估计瞬时频率 */
function zeroCrossHz(data: Float32Array, sampleRate: number, from: number, to: number): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) {
    if ((data[i - 1] < 0 && data[i] >= 0) || (data[i - 1] >= 0 && data[i] < 0)) crossings++;
  }
  const seconds = (to - from) / sampleRate;
  return crossings / 2 / seconds;
}

const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-12));

async function renderWith(
  storeSetup: (store: ParamStore) => void,
  drive: (engine: SynthEngine, store: ParamStore) => void,
  duration: number,
  sampleRate = 44100,
): Promise<Float32Array> {
  const { ParamStore } = await import("../state/paramStore");
  const { SynthEngine } = await import("./engine");
  const store = new ParamStore();
  storeSetup(store);
  const offline = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
  const engine = new SynthEngine(store);
  await engine.ensureStarted(offline);
  drive(engine, store);
  const buffer = await offline.startRendering();
  engine.dispose();
  return buffer.getChannelData(0);
}

export async function runSelfTest(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. 锯齿波频谱:谐波 1/n 衰减 */
  try {
    const data = await renderWith(
      (s) => {
        s.set("osc1Wave", "sawtooth");
        s.set("osc1On", true);
        s.set("osc1Vol", 10);
        s.set("cutoff", 5);
        s.set("loudS", 10);
        s.set("loudA", 0);
        s.set("power", true);
      },
      (engine) => {
        engine.updateOscFrequencies(57, false); // A3 = 220Hz
        engine.noteOn(57);
      },
      0.6,
    );
    const seg = data.subarray(Math.floor(0.3 * 44100), Math.floor(0.5 * 44100));
    const h1 = goertzel(seg, 44100, 220);
    const h2 = goertzel(seg, 44100, 440);
    const h3 = goertzel(seg, 44100, 660);
    const ratio2 = h2 / h1;
    const ratio3 = h3 / h1;
    add(
      "sawtooth harmonics 1/n",
      ratio2 > 0.3 && ratio2 < 0.75 && ratio3 > 0.15 && ratio3 < 0.5,
      `h2/h1=${ratio2.toFixed(2)} h3/h1=${ratio3.toFixed(2)}`,
    );
  } catch (err) {
    add("sawtooth harmonics 1/n", false, String(err));
  }

  /* 2. 滤波斜率:渐近 24dB/oct(2.8k → 5.6k 一个八度) */
  try {
    const data = await renderWith(
      (s) => {
        s.set("noiseOn", true);
        s.set("noiseVol", 5);
        s.set("cutoff", -1.87); // ≈570Hz
        s.set("emphasis", 0);
        s.set("contour", 0); // 关滤波包络,隔离截止频率
        s.set("filtS", 0);
        s.set("loudS", 10);
        s.set("power", true);
      },
      (engine) => engine.noteOn(60),
      1.2,
    );
    const seg = data.subarray(Math.floor(0.4 * 44100), Math.floor(1.1 * 44100));
    const a28 = goertzel(seg, 44100, 2800);
    const a56 = goertzel(seg, 44100, 5600);
    const slope = db(a28) - db(a56);
    add(
      "filter slope ≈24dB/oct",
      slope > 16 && slope < 34,
      `2.8k→5.6k = ${slope.toFixed(1)} dB(理想 24)`,
    );
  } catch (err) {
    add("filter slope ≈24dB/oct", false, String(err));
  }

  /* 3. 自激:直接驱动 Worklet,Emphasis=10 时形成正弦振荡 */
  try {
    const duration = 2.2;
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(duration * sampleRate),
      sampleRate,
    );
    await offline.audioWorklet.addModule("audio/ladder-processor.js");
    const node = new AudioWorkletNode(offline, "ladder-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.postMessage({
      type: "params",
      cutoff: 2000,
      resonance: 1,
      contourOct: 0,
      attackS: 0.001,
      decayS: 1,
      sustain: 1,
      decayMode: false,
    });
    node.port.postMessage({ type: "noteOn" });
    const buf = offline.createBuffer(1, offline.length, sampleRate);
    const seed = buf.getChannelData(0);
    const seedLen = Math.floor(0.004 * sampleRate); // 4ms 噪声脉冲作种子
    for (let i = 0; i < seedLen; i++) seed[i] = (Math.random() * 2 - 1) * 0.5;
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(node);
    node.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const out = rendered.getChannelData(0);
    const from = Math.floor(1.3 * sampleRate);
    const to = Math.floor(2.1 * sampleRate);
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(out[i]));
    // 扫描自激频率(恒等极点结构 ≈ 2.2 × 标称截止)
    let bestFreq = 0;
    let bestAmp = 0;
    for (let f = 800; f <= 9000; f += 200) {
      const a = goertzel(out, sampleRate, f, from, to);
      if (a > bestAmp) {
        bestAmp = a;
        bestFreq = f;
      }
    }
    const nb = Math.max(
      goertzel(out, sampleRate, Math.max(400, bestFreq - 900), from, to),
      goertzel(out, sampleRate, bestFreq + 900, from, to),
    );
    add(
      "self-oscillation at Emphasis=10",
      peak > 0.01 && bestAmp > nb * 6,
      `f≈${bestFreq}Hz peak=${peak.toFixed(3)} peak/nb=${(bestAmp / Math.max(nb, 1e-12)).toFixed(1)}(需 >6)`,
    );
  } catch (err) {
    add("self-oscillation at Emphasis=10", false, String(err));
  }

  /* 4. 响度包络时间:loudA=6 → 1s Attack */
  try {
    const data = await renderWith(
      (s) => {
        s.set("osc1Wave", "square");
        s.set("osc1On", true);
        s.set("osc1Vol", 10);
        s.set("cutoff", 5);
        s.set("loudA", 6);
        s.set("loudS", 10);
        s.set("power", true);
      },
      (engine) => {
        engine.updateOscFrequencies(69, false);
        engine.noteOn(69);
      },
      1.8,
    );
    // 50% 交叉时刻(线性 ramp → 0.5s)
    let cross = -1;
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(data[i]) > peak * 0.5 && Math.abs(data[i - 1]) <= peak * 0.5) {
        cross = i / 44100;
        break;
      }
    }
    add(
      "loudness attack ≈1s @6",
      cross > 0.35 && cross < 0.68,
      `50% 交叉 = ${cross.toFixed(2)}s(线性 ramp 预期 0.5s)`,
    );
  } catch (err) {
    add("loudness attack ≈1s @6", false, String(err));
  }

  /* 5. 滑音:glideTime=10 → 2.5s τ,C4→C5 中途应处于过渡 */
  try {
    const data = await renderWith(
      (s) => {
        s.set("osc1Wave", "sawtooth");
        s.set("osc1On", true);
        s.set("osc1Vol", 10);
        s.set("cutoff", 5);
        s.set("loudS", 10);
        s.set("loudA", 0);
        s.set("glideOn", true);
        s.set("glideTime", 10);
        s.set("power", true);
      },
      (engine) => {
        engine.updateOscFrequencies(60, false); // C4 起点
        engine.noteOn(72); // C5 目标
      },
      2.8,
    );
    const fMid = zeroCrossHz(data, 44100, Math.floor(0.8 * 44100), Math.floor(1.0 * 44100));
    const fEnd = zeroCrossHz(data, 44100, Math.floor(2.4 * 44100), Math.floor(2.7 * 44100));
    add(
      "glide 2.5s tail",
      fMid > 290 && fMid < 480 && fEnd > 470 && fEnd < 580,
      `f(0.9s)=${fMid.toFixed(0)}Hz f(2.55s)=${fEnd.toFixed(0)}Hz(目标 523Hz)`,
    );
  } catch (err) {
    add("glide 2.5s tail", false, String(err));
  }

  /* 6. 释放底噪:立即松键后,0.35s 起 RMS ≤ −80dB */
  try {
    const data = await renderWith(
      (s) => {
        s.set("osc1Wave", "sawtooth");
        s.set("osc1On", true);
        s.set("osc1Vol", 10);
        s.set("cutoff", 5);
        s.set("loudS", 10);
        s.set("power", true);
      },
      (engine) => {
        engine.noteOn(60);
        engine.noteOff(60);
      },
      2.0,
    );
    const from = Math.floor(0.35 * 44100);
    const to = Math.floor(0.6 * 44100);
    const level = rms(data, from, to);
    add(
      "release tail ≤ −80dB",
      level <= 1e-4,
      `释放后 RMS=${db(level).toFixed(1)}dB(需 ≤ −80)`,
    );
  } catch (err) {
    add("release tail ≤ −80dB", false, String(err));
  }

  return checks;
}

/** 在页面上展示结果(?selftest) */
export async function runSelfTestUI(): Promise<void> {
  const panel = document.createElement("div");
  panel.className = "selftest";
  panel.innerHTML = `<h3>OfflineAudioContext 自检运行中…</h3>`;
  document.body.appendChild(panel);
  const checks = await runSelfTest();
  const rows = checks
    .map(
      (c) =>
        `<div class="${c.pass ? "ok" : "fail"}">${c.pass ? "✔" : "✘"} ${c.name} — ${c.detail}</div>`,
    )
    .join("");
  const passed = checks.filter((c) => c.pass).length;
  panel.innerHTML = `<h3>自检 ${passed}/${checks.length} 通过</h3>${rows}`;
}
