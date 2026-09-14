/**
 * SynthEngine — 模拟合成引擎(AUD-1 ~ AUD-13)
 *
 * 信号流(AUD 图常驻,noteOn/off 只触发自动化):
 *   3×VCO ─ 电平 ┐
 *   Noise ─ 电平 ┼→ 混合 → 梯形低通(Worklet,24dB/oct)→ VCA → 软饱和 → 主音量 → 电源门 → Out
 *   Ext  ─ 电平 ┘              ▲ cutoff = 旋钮 + 包络×Contour + 键盘跟踪 + 调制
 * 调制总线:源 = Mod Mix(Osc-3 ↔ Noise),深度 = Mod 轮 × Mod 开关 → 音高 FM / 滤波调制
 */
import {
  ParamStore,
  cutoffToHz,
  envToSeconds,
  glideToSeconds,
} from "../state/params";

const A4 = 440;

/** 电平旋钮 0-10 → 增益(平方曲线更符合听感) */
const level = (v: number) => Math.pow(Math.max(0, v) / 10, 2) * 1.2;

/* ---------- 带限波形表(AUD-4) ---------- */

function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const N = 64;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function revSawWave(ctx: BaseAudioContext): PeriodicWave {
  const N = 64;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) imag[n] = -2 / (n * Math.PI);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export type WaveIndex = 0 | 1 | 2 | 3 | 4 | 5; // 三角/锯齿/反锯齿/方波/宽脉冲/窄脉冲

function applyWave(osc: OscillatorNode, idx: WaveIndex): void {
  const ctx = osc.context;
  switch (idx) {
    case 0: osc.type = "triangle"; break;
    case 1: osc.type = "sawtooth"; break;
    case 2: osc.setPeriodicWave(revSawWave(ctx)); break;
    case 3: osc.type = "square"; break;
    case 4: osc.setPeriodicWave(pulseWave(ctx, 0.25)); break;
    case 5: osc.setPeriodicWave(pulseWave(ctx, 0.1)); break;
  }
}

/* ---------- 音域 ---------- */

const RANGE_OCT: Record<string, number> = { "32'": -2, "16'": -1, "8'": 0, "4'": 1, "2'": 2 };
/** LO 档基础频率(Hz),微调旋钮 ±700 音分仍生效(近似原机) */
const LO_BASE_HZ = 6.0;

function midiToFreq(m: number): number {
  return A4 * Math.pow(2, (m - 69) / 12);
}

/* ---------- 包络辅助 ---------- */

function holdAndSet(param: AudioParam, t: number, v: number): void {
  const anyParam = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (anyParam.cancelAndHoldAtTime) {
    anyParam.cancelAndHoldAtTime(t);
  } else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}

export class SynthEngine {
  ctx: AudioContext | null = null;
  /** 滤波器处于兼容模式(无 AudioWorklet) */
  degraded = false;

  private osc: OscillatorNode[] = [];
  private oscLevel: GainNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseLevel!: GainNode;
  private extLevel!: GainNode;
  private mixerBus!: GainNode;

  private ladder: AudioWorkletNode | null = null;
  private biquads: BiquadFilterNode[] = [];
  private cutoffParam!: AudioParam;
  private resonanceParam!: AudioParam;

  private vca!: GainNode;
  private shaper!: WaveShaperNode;
  private master!: GainNode;
  private powerGate!: GainNode;

  // 滤波包络 / 键盘跟踪 / 滤波调制
  private fEnvGain!: GainNode;
  private kcSrc!: ConstantSourceNode;
  private filterModGain!: GainNode;

  // 调制总线
  private modBus!: GainNode;
  private osc3ModGain!: GainNode;
  private noiseModGain!: GainNode;
  private modOnGain!: GainNode;
  private fmDepth!: GainNode; // 音高 FM 深度(音分)
  private osc3FmTap!: GainNode; // Osc-3 → FM(LO 模式时断开自身)

  // 弯音
  private bendSrc!: ConstantSourceNode;

  private store: ParamStore;
  private held: number[] = [];
  private current: number | null = null;
  private initDone = false;

  constructor(store: ParamStore) {
    this.store = store;
  }

  /* ========== 生命周期 ========== */

  async init(): Promise<void> {
    if (this.initDone) return;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    // 梯形滤波器:Worklet 优先,失败降级 4×Biquad(AUD-6)
    try {
      await ctx.audioWorklet.addModule("./audio/ladder-processor.js");
      this.ladder = new AudioWorkletNode(ctx, "ladder-filter", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.cutoffParam = this.ladder.parameters.get("cutoff")!;
      this.resonanceParam = this.ladder.parameters.get("resonance")!;
    } catch {
      this.degraded = true;
      this.biquads = [];
      for (let i = 0; i < 4; i++) {
        const bq = ctx.createBiquadFilter();
        bq.type = "lowpass";
        bq.Q.value = 0.5;
        this.biquads.push(bq);
      }
      this.cutoffParam = this.biquads[0].frequency;
      this.resonanceParam = this.biquads[0].Q;
    }

    /* --- 振荡器 --- */
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(this.connectPoint());
      osc.start();
      this.osc.push(osc);
      this.oscLevel.push(g);
    }

    /* --- 噪声 --- */
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buf;
    this.noiseSrc.loop = true;
    this.noiseLevel = ctx.createGain();
    this.noiseLevel.gain.value = 0;
    this.noiseSrc.connect(this.noiseLevel).connect(this.connectPoint());
    this.noiseSrc.start();

    /* --- 外部输入通道(V1 无声源,预留电平) --- */
    this.extLevel = ctx.createGain();
    this.extLevel.gain.value = 0;
    this.extLevel.connect(this.connectPoint());

    /* --- 输出链 --- */
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(1.6 * x) * 0.85;
    }
    this.shaper.curve = curve;
    this.shaper.oversample = "2x";
    this.master = ctx.createGain();
    this.powerGate = ctx.createGain();
    this.powerGate.gain.value = 1;

    if (this.ladder) {
      this.ladder.connect(this.vca);
    } else {
      for (let i = 0; i < 4; i++) {
        this.biquads[i].Q.value = 0.5;
        if (i === 0) this.mixerBus.connect(this.biquads[0]);
        else this.biquads[i - 1].connect(this.biquads[i]);
      }
      this.biquads[3].connect(this.vca);
    }
    this.vca.connect(this.shaper).connect(this.master).connect(this.powerGate).connect(ctx.destination);

    /* --- 滤波包络与键盘跟踪(加法接入 cutoff 参数) --- */
    this.fEnvGain = ctx.createGain();
    this.fEnvGain.gain.value = 0;
    this.fEnvGain.connect(this.cutoffParam);

    this.kcSrc = ctx.createConstantSource();
    this.kcSrc.offset.value = 0;
    this.kcSrc.connect(this.cutoffParam);
    this.kcSrc.start();

    this.filterModGain = ctx.createGain();
    this.filterModGain.gain.value = 0;
    this.filterModGain.connect(this.cutoffParam);

    /* --- 调制总线 --- */
    this.modBus = ctx.createGain();
    this.osc3ModGain = ctx.createGain();
    this.noiseModGain = ctx.createGain();
    this.osc[2].connect(this.osc3ModGain); // 直接取 Osc-3 输出
    this.noiseSrc.connect(this.noiseModGain);
    this.osc3ModGain.connect(this.modBus);
    this.noiseModGain.connect(this.modBus);

    this.modOnGain = ctx.createGain();
    this.modOnGain.gain.value = 0;
    this.modBus.connect(this.modOnGain);

    // 音高 FM → 各 VCO detune(音分);Osc-3 LO 模式时断开自身
    this.fmDepth = ctx.createGain();
    this.fmDepth.gain.value = 0;
    this.modOnGain.connect(this.fmDepth);
    this.fmDepth.connect(this.osc[0].detune);
    this.fmDepth.connect(this.osc[1].detune);
    this.osc3FmTap = ctx.createGain();
    this.osc3FmTap.gain.value = 1;
    this.fmDepth.connect(this.osc3FmTap).connect(this.osc[2].detune);

    // 滤波调制(Osc-3 源,深度 × Mod 轮)
    this.modOnGain.connect(this.filterModGain);

    /* --- 弯音 --- */
    this.bendSrc = ctx.createConstantSource();
    this.bendSrc.offset.value = 0;
    this.bendSrc.connect(this.osc[0].detune);
    this.bendSrc.connect(this.osc[1].detune);
    this.bendSrc.connect(this.osc[2].detune);
    this.bendSrc.start();

    this.bindParams();
    this.initDone = true;
  }

  /** mixerBus 的懒连接点(振荡器建graph时 mixerBus 还没建) */
  private tap: GainNode | null = null;
  private connectPoint(): GainNode {
    if (!this.tap) {
      this.tap = this.ctx!.createGain();
      this.mixerBus = this.tap;
    }
    return this.tap;
  }

  resume(): Promise<void> {
    return this.ctx ? this.ctx.resume() : Promise.resolve();
  }

  /* ========== 参数绑定 ========== */

  private smooth(p: AudioParam, v: number, tc = 0.012): void {
    p.setTargetAtTime(v, this.ctx!.currentTime, tc);
  }

  private bindParams(): void {
    const s = this.store;
    const t0 = this.ctx!.currentTime;

    // 振荡器波形 / 音域 / 微调 / 电平
    for (let i = 0; i < 3; i++) {
      s.bind(`osc${i + 1}Wave`, (v) => applyWave(this.osc[i], v as WaveIndex));
      s.bind(`osc${i + 1}Freq`, () => this.updatePitch(true));
      s.bind(`osc${i + 1}Vol`, (v) => this.smooth(this.oscLevel[i].gain, level(v)));
    }
    // 电平立即应用初始值
    for (let i = 0; i < 3; i++) this.oscLevel[i].gain.value = level(s.get(`osc${i + 1}Vol`));

    s.bind("noiseVol", (v) => this.smooth(this.noiseLevel.gain, level(v)));
    s.bind("extVol", (v) => this.smooth(this.extLevel.gain, level(v)));
    s.bind("tune", () => this.updatePitch(true));
    s.bind("glide", () => this.updatePitch(true));
    s.bind("osc3Control", () => {
      this.updateFmRouting();
      this.updatePitch(true);
    });
    for (const id of ["osc1Range", "osc2Range", "osc3Range"]) s.bind(id, () => {
      this.updateFmRouting();
      this.updatePitch(true);
    });

    // 滤波器
    s.bind("cutoff", () => this.updateFilter());
    s.bind("emphasis", () => this.updateResonance());
    s.bind("contour", () => this.updateFilter());
    s.bind("kc1", () => this.updateKC());
    s.bind("kc2", () => this.updateKC());
    s.bind("filterMod", () => this.updateFilterMod());
    s.bind("volume", (v) => this.smooth(this.master.gain, level(v) * 0.9));
    s.bind("power", (on) => this.smooth(this.powerGate.gain, on ? 1 : 0, 0.03));

    // 调制总线
    s.bind("modMix", () => this.updateModMix());
    s.bind("modOn", (on) => this.smooth(this.modOnGain.gain, on ? 1 : 0));
    s.bind("modWheel", () => this.updateModDepth());
    s.bind("pitchWheel", (v) => this.smooth(this.bendSrc.offset, v, 0.005));

    // 包络时间旋钮只影响下次触发
    void t0;
    this.updateModMix();
    this.updateResonance();
    this.updateFilter();
    this.updateModDepth();
    this.updatePitch(true);
  }

  /* ========== 内部状态刷新 ========== */

  private rangeOct(i: number): number {
    const step = this.store.selectorStep(`osc${i + 1}Range`);
    if (step === "LO") return 0;
    return RANGE_OCT[step] ?? 0;
  }

  private isLO(i: number): boolean {
    return this.store.selectorStep(`osc${i + 1}Range`) === "LO";
  }

  private baseFreq(i: number, midi: number | null): number {
    const fine = this.store.get(`osc${i + 1}Freq`);
    const tune = this.store.get("tune");
    if (this.isLO(i)) {
      return LO_BASE_HZ * Math.pow(2, fine / 1200);
    }
    const m = i === 2 && this.store.get("osc3Control") === 0 ? 60 : midi ?? 60;
    return midiToFreq(m) * Math.pow(2, this.rangeOct(i)) * Math.pow(2, (fine + tune) / 1200);
  }

  /** 音高更新(含滑音 AUD-10):frequency 走 setTargetAtTime,回退音自然获得滑音 */
  private updatePitch(instant = false): void {
    if (!this.ctx) return;
    const glideS = glideToSeconds(this.store.get("glide"));
    const tc = instant && !this.current ? 0.001 : Math.max(0.001, glideS / 3);
    for (let i = 0; i < 3; i++) {
      const f = this.baseFreq(i, this.current);
      this.osc[i].frequency.setTargetAtTime(f, this.ctx.currentTime, tc);
    }
  }

  private updateFmRouting(): void {
    // Osc-3 处于 LO 模式时不接收 FM(避免自调制,AUD/§8.5)
    const lo = this.isLO(2);
    // 断开/接回 osc3 的 FM 分支(LO 模式 = 作调制源,不接收 FM)
    try { this.fmDepth.disconnect(this.osc3FmTap); } catch { /* noop */ }
    if (!lo) this.fmDepth.connect(this.osc3FmTap);
  }

  private updateResonance(): void {
    if (!this.ctx) return;
    const emp = this.store.get("emphasis"); // 0-10
    // Improved model:resonance ∈ [0,4],≥3.8 自激(≈ 面板 9.5)
    const res = Math.min(4, (emp / 10) * 4.2);
    if (this.ladder) {
      this.resonanceParam.setTargetAtTime(res, this.ctx.currentTime, 0.012);
    } else {
      // Biquad 降级:Q 上限 12,无自激
      const q = 0.5 + Math.pow(emp / 10, 2) * 11.5;
      for (const bq of this.biquads) bq.Q.setTargetAtTime(q, this.ctx.currentTime, 0.012);
    }
  }

  private currentCutoffHz(): number {
    return cutoffToHz(this.store.get("cutoff"));
  }

  private updateFilter(): void {
    if (!this.ctx) return;
    this.smooth(this.cutoffParam, this.currentCutoffHz());
    this.updateFilterDepth();
    this.updateKC();
    this.updateFilterMod();
  }

  /** 滤波包络深度(Hz)= (2^(oct)-1) × 基准截止 */
  private updateFilterDepth(): void {
    if (!this.ctx) return;
    const amt = this.store.get("contour") / 10; // 0-1
    const oct = amt * 5;
    const depth = (Math.pow(2, oct) - 1) * this.currentCutoffHz();
    this.smooth(this.fEnvGain.gain, depth, 0.008);
  }

  /** 键盘跟踪(AUD-7):KC1=+100%/oct,KC2=+50%/oct,以 C4 为基准 */
  private updateKC(): void {
    if (!this.ctx) return;
    const kc1 = this.store.get("kc1") ? 1 : 0;
    const kc2 = this.store.get("kc2") ? 0.5 : 0;
    const m = this.current ?? 60;
    const oct = (m - 60) / 12;
    const hz = this.currentCutoffHz() * (Math.pow(2, oct * (kc1 + kc2)) - 1);
    this.kcSrc.offset.setTargetAtTime(hz, this.ctx.currentTime, 0.01);
  }

  private updateFilterMod(): void {
    if (!this.ctx) return;
    const on = this.store.get("filterMod") ? 1 : 0;
    const wheel = this.store.get("modWheel");
    const depth = on * wheel * this.currentCutoffHz() * 0.6;
    this.filterModGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.01);
  }

  private updateModMix(): void {
    if (!this.ctx) return;
    const mix = this.store.get("modMix") / 10; // 0=纯Osc-3, 1=纯Noise
    const t = this.ctx.currentTime;
    this.osc3ModGain.gain.setTargetAtTime(Math.cos(mix * Math.PI * 0.5), t, 0.01);
    this.noiseModGain.gain.setTargetAtTime(Math.sin(mix * Math.PI * 0.5), t, 0.01);
  }

  private updateModDepth(): void {
    if (!this.ctx) return;
    const wheel = this.store.get("modWheel");
    // 音高 FM 深度:±200 音分 × Mod 轮
    this.fmDepth.gain.setTargetAtTime(wheel * 200, this.ctx.currentTime, 0.01);
    this.updateFilterMod();
  }

  /* ========== 演奏 ========== */

  /** 当前是否仍按住键 */
  get playing(): boolean {
    return this.current !== null;
  }

  noteOn(midi: number): void {
    if (!this.ctx || !this.initDone) return;
    if (this.held.includes(midi)) return;
    this.held.push(midi);
    const prev = this.current;
    this.current = midi;
    const t = this.ctx.currentTime;
    // 重触发(AUD-2):从当前值起 Attack
    this.triggerEnvelopes(t);
    this.updatePitch(prev !== null); // 已有按住键时也滑音
    this.updateKC();
  }

  noteOff(midi: number): void {
    if (!this.ctx) return;
    const idx = this.held.indexOf(midi);
    if (idx === -1) return;
    this.held.splice(idx, 1);
    if (this.current === midi) {
      this.current = this.held.length ? this.held[this.held.length - 1] : null;
      if (this.current !== null) {
        // 回退到仍按住的最后一键(滑音同样适用)
        this.triggerEnvelopes(this.ctx.currentTime);
        this.updatePitch();
        this.updateKC();
      } else {
        this.release(this.ctx.currentTime);
      }
    }
  }

  /** 空格 panic(INT-11) */
  allNotesOff(): void {
    this.held = [];
    if (this.ctx && this.current !== null) {
      this.current = null;
      this.release(this.ctx.currentTime);
    }
  }

  /** INT-9:失焦保护 */
  panic(): void {
    this.allNotesOff();
    if (this.ctx) {
      const t = this.ctx.currentTime;
      holdAndSet(this.vca.gain, t, this.vca.gain.value);
      this.vca.gain.setTargetAtTime(0, t, 0.01);
    }
  }

  private triggerEnvelopes(t: number): void {
    const s = this.store;
    const decayForced = s.get("decayOn") === 1;

    // --- 响度包络 ---
    const att = envToSeconds(s.get("lAtt"));
    const dec = envToSeconds(s.get("lDec"));
    const sus = s.get("lSus") === 1 && !decayForced;
    holdAndSet(this.vca.gain, t, Math.max(0.0001, this.vca.gain.value));
    this.vca.gain.setValueAtTime(Math.max(0.0001, this.vca.gain.value), t);
    this.vca.gain.linearRampToValueAtTime(1, t + Math.max(0.001, att));
    if (!sus) {
      this.vca.gain.setTargetAtTime(0.0001, t + Math.max(0.001, att), Math.max(0.001, dec) / 3);
    }

    // --- 滤波包络(走 fEnvGain,单位 Hz) ---
    const fatt = envToSeconds(s.get("fAtt"));
    const fdec = envToSeconds(s.get("fDec"));
    const fsus = s.get("fSus") === 1 && !decayForced;
    const depth = this.fEnvGain.gain.value || (Math.pow(2, (s.get("contour") / 10) * 5) - 1) * this.currentCutoffHz();
    holdAndSet(this.fEnvGain.gain, t, Math.max(0, this.fEnvGain.gain.value));
    this.fEnvGain.gain.setValueAtTime(Math.max(0, this.fEnvGain.gain.value), t);
    this.fEnvGain.gain.linearRampToValueAtTime(depth, t + Math.max(0.001, fatt));
    if (!fsus) {
      this.fEnvGain.gain.setTargetAtTime(0, t + Math.max(0.001, fatt), Math.max(0.001, fdec) / 3);
    }
  }

  private release(t: number): void {
    const rel = envToSeconds(this.store.get("lRel"));
    const frel = envToSeconds(this.store.get("fRel"));
    holdAndSet(this.vca.gain, t, this.vca.gain.value);
    this.vca.gain.setTargetAtTime(0.0001, t, Math.max(0.001, rel) / 3);
    holdAndSet(this.fEnvGain.gain, t, this.fEnvGain.gain.value);
    this.fEnvGain.gain.setTargetAtTime(0, t, Math.max(0.001, frel) / 3);
  }

  dispose(): void {
    try { this.ctx?.close(); } catch { /* noop */ }
    this.ctx = null;
    this.initDone = false;
  }
}
