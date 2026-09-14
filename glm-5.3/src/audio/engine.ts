import { glideSeconds } from "../state/params";
import type { ParamStore } from "../state/paramStore";
import { MonoKeyboard, type MonoEvent } from "./monoKeys";
import { getWave, WAVE_NAMES } from "./waveforms";

/**
 * Aether Model D 模拟合成引擎(PRD §5.6 / §8)。
 *
 * 信号图常驻:3×VCO → 混音 → 梯形低通(Worklet / 4 极 Biquad 降级)
 *   → VCA(响度包络)→ Volume → 软饱和 → 电源 → UI 静音 → 主输出
 * noteOn/off 只调度包络与音高自动化,不重建图(§8.1)。
 * 所有参数自动化用 setTargetAtTime 平滑,杜绝 zipper 噪声(INT-12)。
 */

const RANGE_MULT = [0.25, 0.5, 1, 2, 4]; // 32' 16' 8' 4' 2'
const LO_BASE_HZ = 2.5; // Osc-3 LO 档中心频率(Frequency ±700¢ → ≈0.26–23Hz)
const A4 = 440;
const MIDI_A4 = 69;
const TC_SMOOTH = 0.012; // 常规参数平滑(PRD 5–15ms)
const TC_FAST = 0.005;
/** 截止频率听感补音:补偿梯形结构的转折点偏低(调音校准,旋钮刻度 10Hz–18kHz 不变) */
const CUTOFF_COMP = 2.5;

function midiToHz(m: number): number {
  return A4 * Math.pow(2, (m - MIDI_A4) / 12);
}

export type FilterMode = "worklet" | "biquad";
type EnvStage = "idle" | "attack" | "decay" | "sustain" | "release";

/**
 * 包络镜像:引擎自己对自动化时间表记账,
 * 用于「从当前值重触发」(AUD-2)与重锚定(不依赖 cancelAndHoldAtTime 的浏览器兼容实现)。
 */
class EnvMirror {
  v0 = 0;
  t0 = -1;
  target = 0;
  tc = 0.001;
  prev: { from: number; target: number; tc: number; tStart: number } | null = null;

  anchor(value: number, t: number): void {
    this.v0 = value;
    this.t0 = t;
    this.prev = null;
  }

  /** 追加一段 setTargetAtTime(与 AudioParam 上的调度一一对应) */
  schedule(target: number, tc: number, t: number): void {
    this.prev = { from: this.v0, target: this.target, tc: this.tc, tStart: this.t0 };
    this.v0 = this.valueAt(t);
    this.t0 = t;
    this.target = target;
    this.tc = Math.max(tc, 1e-5);
  }

  valueAt(t: number): number {
    if (t <= this.t0) {
      const p = this.prev;
      if (p && t > p.tStart) {
        return p.target + (p.from - p.target) * Math.exp(-(t - p.tStart) / p.tc);
      }
      return this.v0;
    }
    return this.target + (this.v0 - this.target) * Math.exp(-(t - this.t0) / this.tc);
  }
}

export class SynthEngine {
  readonly ctx: BaseAudioContext;
  readonly store: ParamStore;
  filterMode: FilterMode = "biquad";
  readonly mono: MonoKeyboard;

  /** 单音事件回调(视觉层同步琴键按下态用) */
  onMonoEvent: ((e: MonoEvent, held: number[]) => void) | null = null;

  private oscs: OscillatorNode[] = [];
  private oscMix: GainNode[] = [];
  private noiseSrc!: AudioBufferSourceNode;
  private noiseMix!: GainNode;
  private extSrc: AudioBufferSourceNode | null = null;
  private extMix!: GainNode;
  private preMix!: GainNode;

  private filter!: AudioNode;
  private cutoffParams: AudioParam[] = [];
  private emphasisParam: AudioParam | null = null;
  private vca!: GainNode;
  private volGain!: GainNode;
  private powerGain!: GainNode;
  private uiMuteGain!: GainNode;
  private master!: GainNode;

  private modMixA!: GainNode; // 调制源 Osc-3 支路
  private modMixB!: GainNode; // 调制源 Noise 支路
  private modDepth!: GainNode; // 深度 = Mod 轮 × Mod 总开关
  private pitchFm!: GainNode; // → 各 VCO detune(音分)
  private filtFm!: GainNode; // → cutoff(Hz)
  private bendGain!: GainNode; // 弯音(音分)→ 各 VCO detune

  private loudEnv = new EnvMirror();
  private filtEnv = new EnvMirror();
  private loudStage: EnvStage = "idle";
  private filtStage: EnvStage = "idle";

  private baseCutoff = 1000;
  private glideTc = 0.002;
  private oscAppliedMidi: (number | null)[] = [null, null, null];
  private modWheelValue = 0;
  private uiMuted = false;
  private disposed = false;

  private constructor(ctx: BaseAudioContext, store: ParamStore) {
    this.ctx = ctx;
    this.store = store;
    this.mono = new MonoKeyboard((e) => this.handleMono(e));
  }

  static async create(
    ctx: BaseAudioContext,
    store: ParamStore,
    workletUrl?: string
  ): Promise<SynthEngine> {
    const eng = new SynthEngine(ctx, store);
    await eng.build(workletUrl);
    eng.bindParams();
    eng.applyAllParams();
    return eng;
  }

  // ------------------------------------------------------------------
  // 音频图构建(常驻)
  // ------------------------------------------------------------------
  private async build(workletUrl?: string): Promise<void> {
    const ctx = this.ctx;

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getWave(ctx, WAVE_NAMES[this.store.get(`osc${i + 1}Wave`)]));
      osc.frequency.value = midiToHz(60);
      const mix = ctx.createGain();
      mix.gain.value = 0;
      osc.connect(mix);
      osc.start();
      this.oscs.push(osc);
      this.oscMix.push(mix);
    }

    // 白噪声:mulberry32 确定性生成(频谱平坦,离线测试可复现)
    const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < nd.length; i++) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      nd[i] = ((t ^ (t >>> 14)) >>> 0) / 0xffffffff * 2 - 1;
    }
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = nb;
    this.noiseSrc.loop = true;
    this.noiseMix = ctx.createGain();
    this.noiseMix.gain.value = 0;
    this.noiseSrc.connect(this.noiseMix);
    this.noiseSrc.start();

    this.extMix = ctx.createGain();
    this.extMix.gain.value = 0;

    this.preMix = ctx.createGain();
    this.preMix.gain.value = 0.85;
    for (const g of this.oscMix) g.connect(this.preMix);
    this.noiseMix.connect(this.preMix);
    this.extMix.connect(this.preMix);

    // 梯形滤波器:优先 AudioWorklet;不可用时降级 4 极(2×Biquad 巴特沃斯级联,24dB/oct)
    let workletOk = false;
    if (workletUrl && ctx.audioWorklet) {
      try {
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, "aether-ladder-filter", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        this.preMix.connect(node);
        this.filter = node;
        this.cutoffParams = [node.parameters.get("cutoff")!];
        this.emphasisParam = node.parameters.get("emphasis")!;
        this.filterMode = "worklet";
        workletOk = true;
      } catch {
        workletOk = false;
      }
    }
    if (!workletOk) {
      const bq1 = ctx.createBiquadFilter();
      const bq2 = ctx.createBiquadFilter();
      bq1.type = "lowpass";
      bq2.type = "lowpass";
      bq1.Q.value = 0.541; // 4 极巴特沃斯极点对 → 合成斜率 24dB/oct
      bq2.Q.value = 1.307;
      this.preMix.connect(bq1);
      bq1.connect(bq2);
      this.filter = bq2;
      this.cutoffParams = [bq1.frequency, bq2.frequency];
      this.filterMode = "biquad";
    }

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.volGain = ctx.createGain();
    const sat = ctx.createWaveShaper();
    sat.curve = makeSatCurve();
    sat.oversample = "2x";
    this.powerGain = ctx.createGain();
    this.uiMuteGain = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.filter.connect(this.vca);
    this.vca.connect(this.volGain);
    this.volGain.connect(sat);
    sat.connect(this.powerGain);
    this.powerGain.connect(this.uiMuteGain);
    this.uiMuteGain.connect(this.master);
    this.master.connect(ctx.destination);

    // ---- 调制总线:源 = Mod Mix(Osc-3 ↔ Noise 交叉混合)----
    this.modMixA = ctx.createGain();
    this.modMixB = ctx.createGain();
    this.oscs[2].connect(this.modMixA);
    this.noiseSrc.connect(this.modMixB);
    this.modDepth = ctx.createGain();
    this.modDepth.gain.value = 0;
    this.modMixA.connect(this.modDepth);
    this.modMixB.connect(this.modDepth);

    // 音高 FM:±300 音分满深 → 各 VCO detune
    this.pitchFm = ctx.createGain();
    this.pitchFm.gain.value = 300;
    this.modDepth.connect(this.pitchFm);
    for (const osc of this.oscs) this.pitchFm.connect(osc.detune);

    // 滤波 FM:满深 ≈ ±1 octave → cutoff param(a-rate,音频率调制)
    this.filtFm = ctx.createGain();
    this.filtFm.gain.value = 0;
    this.modDepth.connect(this.filtFm);
    for (const p of this.cutoffParams) this.filtFm.connect(p);

    // 弯音:恒源 → 增益(音分)→ 各 VCO detune
    const bendSrc = ctx.createConstantSource();
    bendSrc.offset.value = 1;
    this.bendGain = ctx.createGain();
    this.bendGain.gain.value = 0;
    bendSrc.connect(this.bendGain);
    for (const osc of this.oscs) this.bendGain.connect(osc.detune);
    bendSrc.start();
  }

  // ------------------------------------------------------------------
  // ParamStore → AudioParam 绑定
  // ------------------------------------------------------------------
  private bindParams(): void {
    const s = this.store;
    for (let i = 1; i <= 3; i++) {
      s.subscribe(`osc${i}Vol`, (_id, v) =>
        this.smooth(this.oscMix[i - 1].gain, Math.pow(v / 10, 1.5))
      );
      s.subscribe(`osc${i}Wave`, (_id, v) => {
        this.oscs[i - 1].setPeriodicWave(getWave(this.ctx, WAVE_NAMES[v]));
      });
      s.subscribe(`osc${i}Freq`, () => this.refreshDetune(i - 1));
      s.subscribe(`osc${i}Range`, () => {
        if (i === 3) this.updateOsc3Wiring();
        this.retuneOsc(i - 1);
      });
    }
    s.subscribe("osc3Control", () => this.retuneOsc(2));
    s.subscribe("tune", () => {
      this.refreshDetune(0);
      this.refreshDetune(1);
      this.refreshDetune(2);
    });
    s.subscribe("glide", (_id, v) => {
      const t = glideSeconds(v);
      this.glideTc = t > 0 ? t : 0.002;
    });
    s.subscribe("modMix", (_id, v) => {
      const k = v / 10;
      this.smooth(this.modMixA.gain, 1 - k);
      this.smooth(this.modMixB.gain, k);
    });
    s.subscribe("modSwitch", () => this.applyModDepth());
    s.subscribe("filtModSwitch", () => this.applyFiltFmDepth());
    s.subscribe("cutoff", () => this.refreshCutoffBase());
    s.subscribe("emphasis", (_id, v) => {
      if (this.emphasisParam) this.smooth(this.emphasisParam, v);
    });
    s.subscribe("kc1", () => this.refreshCutoffBase());
    s.subscribe("kc2", () => this.refreshCutoffBase());
    s.subscribe("volume", (_id, v) =>
      this.smooth(this.volGain.gain, Math.pow(v / 10, 1.8))
    );
    s.subscribe("power", (_id, v) =>
      this.smooth(this.powerGain.gain, v >= 0.5 ? 1 : 0, 0.03)
    );
    s.subscribe("noiseVol", (_id, v) =>
      this.smooth(this.noiseMix.gain, Math.pow(v / 10, 1.5))
    );
    s.subscribe("extVol", (_id, v) =>
      this.smooth(this.extMix.gain, Math.pow(v / 10, 1.5))
    );
  }

  private applyAllParams(): void {
    const s = this.store;
    for (let i = 1; i <= 3; i++) {
      this.oscMix[i - 1].gain.value = Math.pow(s.get(`osc${i}Vol`) / 10, 1.5);
      this.oscs[i - 1].setPeriodicWave(
        getWave(this.ctx, WAVE_NAMES[s.get(`osc${i}Wave`)])
      );
      this.refreshDetune(i - 1);
    }
    this.glideTc = glideSeconds(s.get("glide")) || 0.002;
    this.modMixA.gain.value = 1 - s.get("modMix") / 10;
    this.modMixB.gain.value = s.get("modMix") / 10;
    if (this.emphasisParam) this.emphasisParam.value = s.get("emphasis");
    this.volGain.gain.value = Math.pow(s.get("volume") / 10, 1.8);
    this.noiseMix.gain.value = Math.pow(s.get("noiseVol") / 10, 1.5);
    this.extMix.gain.value = Math.pow(s.get("extVol") / 10, 1.5);
    this.powerGain.gain.value = s.isOn("power") ? 1 : 0;
    this.updateOsc3Wiring();
    this.refreshCutoffBase();
    this.applyModDepth();
  }

  private refreshDetune(i: number): void {
    const cents = this.store.get("tune") + this.store.get(`osc${i + 1}Freq`);
    this.oscs[i].detune.setTargetAtTime(cents, this.ctx.currentTime, TC_SMOOTH);
  }

  /** Osc-3 LO 模式下断开弯音/音高 FM 注入(§8.5:LO 自身不接收 FM,避免自调制) */
  private updateOsc3Wiring(): void {
    const lo = this.store.get("osc3Range") === 0;
    const detune = this.oscs[2].detune;
    try {
      this.pitchFm.disconnect(detune);
      this.bendGain.disconnect(detune);
    } catch {
      /* 原本未连接 */
    }
    if (!lo) {
      this.pitchFm.connect(detune);
      this.bendGain.connect(detune);
    }
  }

  /** 某振荡器当前目标频率(Hz) */
  private oscFreq(i: number): number {
    const s = this.store;
    const n = i + 1;
    const rangeIdx = s.get(`osc${n}Range`);
    if (n === 3 && rangeIdx === 0) {
      return LO_BASE_HZ * Math.pow(2, s.get("osc3Freq") / 1200);
    }
    const mult = RANGE_MULT[n === 3 ? rangeIdx - 1 : rangeIdx] ?? 1;
    const midi =
      n === 3 && !s.isOn("osc3Control")
        ? this.oscAppliedMidi[i] ?? 60 // Control OFF:脱离键盘,停在最后音高
        : this.mono.current ?? this.oscAppliedMidi[i] ?? 60;
    return midiToHz(midi) * mult;
  }

  private retuneOsc(i: number): void {
    this.oscAppliedMidi[i] = this.mono.current;
    this.oscs[i].frequency.setTargetAtTime(
      this.oscFreq(i),
      this.ctx.currentTime,
      this.glideTc
    );
  }

  private retuneAll(): void {
    for (let i = 0; i < 3; i++) this.retuneOsc(i);
  }

  /** 键盘跟踪后的基准截止(KC1=+100%/oct,KC2=+50%/oct,AUD-7) */
  private computeBaseCutoff(): number {
    const s = this.store;
    const kt = (s.isOn("kc1") ? 1 : 0) + (s.isOn("kc2") ? 0.5 : 0);
    const midi = this.mono.current ?? 60;
    const mult = Math.pow(2, (kt * (midi - 60)) / 12);
    return Math.min(18000, Math.max(10, s.get("cutoff") * CUTOFF_COMP * mult));
  }

  private refreshCutoffBase(): void {
    this.baseCutoff = this.computeBaseCutoff();
    this.applyFiltFmDepth();
    const t = this.ctx.currentTime;
    if (this.filtStage === "idle") {
      for (const p of this.cutoffParams) {
        p.setTargetAtTime(this.baseCutoff, t, TC_SMOOTH);
      }
      this.filtEnv.anchor(this.filtEnv.valueAt(t), t);
      this.filtEnv.schedule(this.baseCutoff, TC_SMOOTH, t);
    } else if (this.filtStage === "sustain") {
      this.scheduleFiltSustain(t);
    }
  }

  private applyFiltFmDepth(): void {
    this.smooth(this.filtFm.gain, this.store.isOn("filtModSwitch") ? this.baseCutoff : 0);
  }

  private applyModDepth(): void {
    this.smooth(this.modDepth.gain, this.store.isOn("modSwitch") ? this.modWheelValue : 0);
  }

  // ------------------------------------------------------------------
  // 单音事件 → 包络/音高调度
  // ------------------------------------------------------------------
  private handleMono(e: MonoEvent): void {
    const t = this.ctx.currentTime;
    switch (e.type) {
      case "press":
        this.retuneAll();
        this.loudPress(t);
        this.filtPress(t);
        break;
      case "glideTo":
        this.retuneAll(); // 回退音:只滑音高,不重触发(AUD-1/2)
        this.refreshCutoffBase();
        break;
      case "release":
      case "panic":
        this.loudRelease(t);
        this.filtRelease(t);
        break;
    }
    this.onMonoEvent?.(e, this.mono.heldNotes());
  }

  // ---- 响度包络(AUD-8):A →(Sustain ON ? 保持 0.75 : 衰减到 0),R → 0 ----
  private loudPress(t: number): void {
    const s = this.store;
    const A = s.get("loudA");
    const D = s.get("loudD");
    const decayOnly = s.isOn("decaySwitch") || !s.isOn("loudSustain");
    const g = this.vca.gain;
    const cur = this.loudEnv.valueAt(t);
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    this.loudEnv.anchor(cur, t);
    g.setTargetAtTime(1, t, A / 3);
    this.loudEnv.schedule(1, A / 3, t);
    const sus = decayOnly ? 0 : 0.75;
    g.setTargetAtTime(sus, t + A, D / 3);
    this.loudEnv.schedule(sus, D / 3, t + A);
    this.loudStage = decayOnly ? "decay" : "sustain";
  }

  private loudRelease(t: number): void {
    if (this.loudStage === "idle") return;
    const R = this.store.get("loudR");
    const g = this.vca.gain;
    const cur = this.loudEnv.valueAt(t);
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    this.loudEnv.anchor(cur, t);
    g.setTargetAtTime(0, t, R / 3);
    this.loudEnv.schedule(0, R / 3, t);
    this.loudStage = "release";
  }

  // ---- 滤波包络:cutoff = base × 2^(0.4·Contour·e),e∈[0,1] ----
  private filtPeakHz(): number {
    return this.baseCutoff * Math.pow(2, 0.4 * this.store.get("contour"));
  }

  private filtSusHz(decayOnly: boolean): number {
    return decayOnly ? this.baseCutoff : this.baseCutoff * Math.pow(2, 0.4 * this.store.get("contour") * 0.8);
  }

  private filtPress(t: number): void {
    const s = this.store;
    const A = s.get("filtA");
    const D = s.get("filtD");
    this.baseCutoff = this.computeBaseCutoff();
    const peak = this.filtPeakHz();
    const decayOnly = s.isOn("decaySwitch") || !s.isOn("filtSustain");
    const sus = this.filtSusHz(decayOnly);
    const cur = this.filtEnv.valueAt(t);
    for (const p of this.cutoffParams) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(cur, t);
      p.setTargetAtTime(peak, t, A / 3);
      p.setTargetAtTime(sus, t + A, D / 3);
    }
    this.filtEnv.anchor(cur, t);
    this.filtEnv.schedule(peak, A / 3, t);
    this.filtEnv.schedule(sus, D / 3, t + A);
    this.filtStage = decayOnly ? "decay" : "sustain";
  }

  private scheduleFiltSustain(t: number): void {
    const s = this.store;
    const decayOnly = s.isOn("decaySwitch") || !s.isOn("filtSustain");
    const sus = this.filtSusHz(decayOnly);
    for (const p of this.cutoffParams) p.setTargetAtTime(sus, t, s.get("filtD") / 3);
    this.filtEnv.schedule(sus, s.get("filtD") / 3, t);
  }

  private filtRelease(t: number): void {
    if (this.filtStage === "idle") return;
    const R = this.store.get("filtR");
    const cur = this.filtEnv.valueAt(t);
    for (const p of this.cutoffParams) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(cur, t);
      p.setTargetAtTime(this.baseCutoff, t, R / 3);
    }
    this.filtEnv.anchor(cur, t);
    this.filtEnv.schedule(this.baseCutoff, R / 3, t);
    this.filtStage = "release";
  }

  // ------------------------------------------------------------------
  // 演奏对外接口
  // ------------------------------------------------------------------
  noteOn(midi: number): void {
    if (midi < 21 || midi > 108) return;
    this.mono.press(midi);
  }

  noteOff(midi: number): void {
    this.mono.release(midi);
  }

  /** 空格 panic / 窗口失焦:All Notes Off(INT-9/INT-11) */
  panic(): void {
    this.mono.allOff();
  }

  setPitchBend(cents: number): void {
    const c = Math.min(240, Math.max(-240, cents));
    this.bendGain.gain.setTargetAtTime(c, this.ctx.currentTime, TC_FAST);
  }

  setModWheel(v: number): void {
    this.modWheelValue = Math.min(1, Math.max(0, v));
    this.applyModDepth();
  }

  /** 覆盖层静音键(独立于面板 Volume,PRD UI-1) */
  setUiMuted(muted: boolean): void {
    this.uiMuted = muted;
    this.smooth(this.uiMuteGain.gain, muted ? 0 : 1, 0.03);
  }

  get isUiMuted(): boolean {
    return this.uiMuted;
  }

  /** 外部输入(PRD AUD-15):本地音频文件循环 → Ext 电平 */
  loadExtBuffer(buffer: AudioBuffer): void {
    if (this.extSrc) {
      try {
        this.extSrc.stop();
      } catch {
        /* ignore */
      }
      this.extSrc.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.extMix);
    src.start();
    this.extSrc = src;
  }

  private smooth(p: AudioParam, v: number, tc = TC_SMOOTH): void {
    p.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      for (const o of this.oscs) o.stop();
      this.noiseSrc.stop();
      this.extSrc?.stop();
    } catch {
      /* ignore */
    }
  }
}

/** 轻微软饱和(增添模拟味,AUD-12) */
function makeSatCurve() {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1.6;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
