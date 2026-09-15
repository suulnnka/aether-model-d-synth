/**
 * 声音引擎(PRD §10):常驻音频图 AUD-4 —— 引擎启动即建立完整音频图,
 * noteOn/off 只触发包络与音高自动化。
 *
 * 信号流:
 *   Osc-1/2/3 ─On/Off─ 电平 ─┐
 *   Noise(白/粉) ─电平───────┼→ 混音 → 梯形低通 Worklet → VCA(响度包络)
 *   Ext-In(麦克风) ─电平─────┘                        ↓
 *                              主音量 → 软饱和 → 电源 → Out
 * 调制矩阵:源A = Osc.3 | Filter EG;源B = Noise | LFO;
 *   Mod Mix 线性混合 → { Oscillator Mod ⇒ 三 VCO 音高 FM(深度=调制轮),
 *                       Filter Mod ⇒ 截止 FM(Worklet fm 参数,八度) }
 */
import type { ParamStore } from "../state/paramStore";
import { RANGE_OCT } from "../state/paramStore";
import { MonoKeyboard } from "./monoKeys";
import { periodicWave, type WaveName } from "./waveforms";
import {
  clamp,
  contourOctaves,
  cutoffHz,
  envSeconds,
  FILTER_FM_OCTAVES,
  glideSeconds,
  kcOctaves,
  loHz,
  lfoHz,
  masterGain,
  mixerGain,
  PITCH_FM_SEMITONES,
  RELEASE_SECONDS,
  resonance,
} from "./mapping";

const SMOOTH = 0.008; // 常规参数平滑时间常数(s)

interface OscBank {
  osc: OscillatorNode;
  /** 混音器电平(On × Volume) */
  mixer: GainNode;
  /** 音高 FM 深度(Hz) */
  fmDepth: GainNode;
  lastHz: number;
}

export interface EngineHooks {
  onOverload?(overloaded: boolean): void;
}

export class SynthEngine {
  ctx: AudioContext | null = null;
  private store: ParamStore;
  private hooks: EngineHooks = {};
  private bendSemis = 0;

  /* 图节点 */
  private oscs: OscBank[] = [];
  private noiseWhite!: AudioBufferSourceNode;
  private noisePink!: AudioBufferSourceNode;
  private noiseWhiteSel!: GainNode;
  private noisePinkSel!: GainNode;
  private noiseBus!: GainNode;
  private noiseMixer!: GainNode;
  private lfo!: OscillatorNode;
  private extStream: MediaStream | null = null;
  private extSrc: MediaStreamAudioSourceNode | null = null;
  private extMixer!: GainNode;
  private extAnalyser: AnalyserNode | null = null;
  private extPeakBuf!: Float32Array<ArrayBuffer>;

  private mixBus!: GainNode;
  private ladder: AudioWorkletNode | null = null;
  private ladderFallback: BiquadFilterNode[] = []; // Worklet 不可用时的 4×Biquad 降级
  private fallbackEgGain: GainNode | null = null; // 降级链的包络→Hz 增益
  private vca!: GainNode;
  private volGain!: GainNode;
  private shaper!: WaveShaperNode;
  private powerGain!: GainNode;
  private tunerOsc!: OscillatorNode;
  private tunerGain!: GainNode;

  /* 调制矩阵 */
  private modBusA!: GainNode; // 源 A 贡献 (1-mix)
  private modBusB!: GainNode; // 源 B 贡献 (mix)
  private modSum!: GainNode;
  private osc3Tap!: GainNode; // osc3 → 源A
  private filterEgSource!: ConstantSourceNode; // 滤波包络的调制源形态(0..1)
  private lfoTap!: GainNode;
  private noiseTap!: GainNode;
  private filterFMOct: GainNode | null = null; // modSum → worklet fm(八度)

  /* 键盘逻辑 */
  keyboard!: MonoKeyboard;
  private lastMidi = 60;
  private overload = false;

  workletReady = false;

  constructor(store: ParamStore, hooks: EngineHooks = {}) {
    this.store = store;
    this.hooks = hooks;
    this.keyboard = new MonoKeyboard({
      onPitch: (midi, retrigger) => this.handlePitch(midi, retrigger),
      onRelease: () => this.releaseEnvelopes(),
    });
  }

  /** 首次用户手势时创建音频上下文并建图(AUD-14);可注入离线上下文供自检 */
  async ensureStarted(external?: BaseAudioContext): Promise<void> {
    if (external) {
      if (this.ctx === (external as AudioContext)) return;
      this.ctx = external as AudioContext;
    } else if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const ctx = (this.ctx ?? new AudioContext({ latencyHint: "interactive" })) as AudioContext;
    this.ctx = ctx;

    /* ---- 输出链 ---- */
    this.mixBus = ctx.createGain();
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.volGain = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = softClipCurve();
    this.shaper.oversample = "2x";
    this.powerGain = ctx.createGain();
    this.powerGain.gain.value = 0;

    /* ---- 滤波包络的调制源形态(降级链与源 A 共用,需先建) ---- */
    this.filterEgSource = ctx.createConstantSource();
    this.filterEgSource.offset.value = 0;
    this.filterEgSource.start();

    /* ---- 梯形滤波器:优先 Worklet,降级 4×Biquad(AUD-6) ---- */
    let filterReady = false;
    try {
      await ctx.audioWorklet.addModule("audio/ladder-processor.js");
      this.ladder = new AudioWorkletNode(ctx, "ladder-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.mixBus.connect(this.ladder);
      this.ladder.connect(this.vca);
      filterReady = true;
      this.workletReady = true;
    } catch {
      /* 降级:4 × 低通 Biquad 级联(兼容模式) */
    }
    if (!filterReady) {
      this.ladderFallback = [];
      let prev: BiquadFilterNode | null = null;
      for (let i = 0; i < 4; i++) {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 0.707;
        if (prev) prev.connect(f);
        this.ladderFallback.push(f);
        prev = f;
      }
      this.mixBus.connect(this.ladderFallback[0]);
      this.ladderFallback[3].connect(this.vca);
      // 滤波包络 → 截止 Hz(近似)
      this.fallbackEgGain = ctx.createGain();
      this.filterEgSource.connect(this.fallbackEgGain);
      this.fallbackEgGain.connect(this.ladderFallback[0].frequency);
    }

    this.vca.connect(this.volGain);
    this.volGain.connect(this.shaper);
    this.shaper.connect(this.powerGain);
    this.powerGain.connect(ctx.destination);

    /* ---- 三 VCO ---- */
    for (let n = 0; n < 3; n++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(periodicWave(ctx, this.oscWave(n + 1)));
      osc.frequency.value = 110 * (n + 1);
      const mixer = ctx.createGain();
      mixer.gain.value = 0;
      const fmDepth = ctx.createGain();
      fmDepth.gain.value = 0;
      osc.connect(mixer);
      mixer.connect(this.mixBus);
      osc.start();
      this.oscs.push({ osc, mixer, fmDepth, lastHz: osc.frequency.value });
    }

    /* ---- 噪声(白 + 粉,双源选择) ---- */
    this.noiseWhite = ctx.createBufferSource();
    this.noiseWhite.buffer = makeNoise(ctx, "white");
    this.noiseWhite.loop = true;
    this.noisePink = ctx.createBufferSource();
    this.noisePink.buffer = makeNoise(ctx, "pink");
    this.noisePink.loop = true;
    this.noiseWhiteSel = ctx.createGain();
    this.noisePinkSel = ctx.createGain();
    this.noiseBus = ctx.createGain();
    this.noiseMixer = ctx.createGain();
    this.noiseMixer.gain.value = 0;
    this.noiseWhite.connect(this.noiseWhiteSel);
    this.noisePink.connect(this.noisePinkSel);
    this.noiseWhiteSel.connect(this.noiseBus);
    this.noisePinkSel.connect(this.noiseBus);
    this.noiseBus.connect(this.noiseMixer);
    this.noiseMixer.connect(this.mixBus);
    this.noiseWhite.start();
    this.noisePink.start();

    /* ---- 独立 LFO ---- */
    this.lfo = ctx.createOscillator();
    this.applyLfoShape();
    this.lfo.frequency.value = lfoHz(this.store.num("lfoRate"));
    this.lfo.start();

    /* ---- 外部输入 ---- */
    this.extMixer = ctx.createGain();
    this.extMixer.gain.value = 0;
    this.extMixer.connect(this.mixBus);
    this.extPeakBuf = new Float32Array(1024);

    /* ---- 调制矩阵 ---- */
    this.modBusA = ctx.createGain();
    this.modBusB = ctx.createGain();
    this.modSum = ctx.createGain();
    this.osc3Tap = ctx.createGain();
    this.osc3Tap.gain.value = 0.6;
    this.lfoTap = ctx.createGain();
    this.lfoTap.gain.value = 1;
    this.noiseTap = ctx.createGain();
    this.noiseTap.gain.value = 0.5;
    this.modBusA.connect(this.modSum);
    this.modBusB.connect(this.modSum);
    this.oscs[2].osc.connect(this.osc3Tap);
    this.lfo.connect(this.lfoTap);
    this.noiseBus.connect(this.noiseTap);

    if (this.ladder) {
      this.filterFMOct = ctx.createGain();
      this.filterFMOct.gain.value = 0;
      this.modSum.connect(this.filterFMOct);
      this.filterFMOct.connect(this.ladder.parameters.get("fm")!);
    }
    // 音高 FM:modSum → 每振荡器独立深度 → osc.frequency(AudioParam 叠加)
    for (const bank of this.oscs) {
      this.modSum.connect(bank.fmDepth);
      bank.fmDepth.connect(bank.osc.frequency);
    }

    /* ---- A-440 调音器(独立支路,仅受电源总闸) ---- */
    this.tunerOsc = ctx.createOscillator();
    this.tunerOsc.frequency.value = 440;
    this.tunerGain = ctx.createGain();
    this.tunerGain.gain.value = 0;
    this.tunerOsc.connect(this.tunerGain);
    this.tunerGain.connect(this.powerGain);
    this.tunerOsc.start();

    this.rewireModSources(false);
    this.syncAll();
  }

  /* ===================== 键盘 → 事件 ===================== */

  noteOn(midi: number): void {
    if (!this.ctx) return;
    this.keyboard.noteOn(midi);
  }
  noteOff(midi: number): void {
    if (!this.ctx) return;
    this.keyboard.noteOff(midi);
  }
  allNotesOff(): void {
    this.keyboard.allOff();
  }

  private handlePitch(midi: number, retrigger: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.lastMidi = midi;
    this.updateOscFrequencies(midi, /*glide*/ true);
    if (retrigger) this.triggerEnvelopes(ctx.currentTime);
  }

  private releaseEnvelopes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = this.vca.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0, g.value), now);
    g.setTargetAtTime(0, now, RELEASE_SECONDS / 3);
    if (!this.ladder) {
      const off = this.filterEgSource.offset;
      off.cancelScheduledValues(now);
      off.setValueAtTime(Math.max(0, off.value), now);
      off.setTargetAtTime(0, now, RELEASE_SECONDS / 3);
    }
  }

  private triggerEnvelopes(now: number): void {
    const s = this.store;
    /* 响度包络(A/D/S;Decay 开关时 Sustain=0) */
    const aA = envSeconds(s.num("loudA"));
    const aD = envSeconds(s.num("loudD"));
    const aS = s.bool("decayMode") ? 0 : s.num("loudS") / 10;
    const g = this.vca.gain;
    const cur = Math.max(0, Math.min(1, g.value));
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    if (aA <= 0.002) {
      g.setValueAtTime(1, now);
    } else {
      g.linearRampToValueAtTime(1, now + aA);
    }
    g.setTargetAtTime(aS, now + aA, Math.max(aD / 4, 0.005));

    /* 滤波包络:Worklet 内部精确实现;主线程近似仅用于
       (a) 降级链的截止自动化 (b) Filter EG 作为调制源 A */
    const fA = envSeconds(s.num("filtA"));
    const fD = envSeconds(s.num("filtD"));
    const fS = s.bool("decayMode") ? 0 : s.num("filtS") / 10;
    if (this.ladder) {
      this.ladder.port.postMessage({ type: "noteOn" });
    }
    if (!this.ladder || s.bool("srcAFilterEg")) {
      const off = this.filterEgSource.offset;
      off.cancelScheduledValues(now);
      off.setValueAtTime(Math.max(0, Math.min(1, off.value)), now);
      if (fA <= 0.002) {
        off.setValueAtTime(1, now);
      } else {
        off.linearRampToValueAtTime(1, now + fA);
      }
      off.setTargetAtTime(fS, now + fA, Math.max(fD / 4, 0.005));
    }
  }

  /* ===================== 音高 ===================== */

  private oscWave(n: number): WaveName {
    return this.store.str(`osc${n}Wave`) as WaveName;
  }

  /** 更新三个振荡器频率(含滑音、LO 档、Osc-3 自由模式、弯音) */
  updateOscFrequencies(midi: number, glide: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.store;
    const now = ctx.currentTime;
    const master = s.num("tune");
    const glideOn = s.bool("glideOn") && s.num("glideTime") > 0.01;
    const tau = glide && glideOn ? glideSeconds(s.num("glideTime")) / 3 : 0.004;

    for (let i = 0; i < 3; i++) {
      const n = i + 1;
      const range = s.str(`osc${n}Range`);
      let hz: number;
      if (range === "LO") {
        // LO 档:Frequency 旋钮 −12..+12 → 0.2–20Hz 对数(AUD-3)
        hz = loHz(((s.num(`osc${n}Tune`) + 12) / 24) * 10);
      } else if (n === 3 && !s.bool("osc3Control")) {
        // Osc-3 Control OFF:脱离键盘与弯音,以中央 C 为基准自由运行(AUD-10)
        hz = oscHzClamped(60, RANGE_OCT[range], s.num("osc3Tune"), master, 0);
      } else {
        hz = oscHzClamped(midi, RANGE_OCT[range], s.num(`osc${n}Tune`), master, this.bendSemis);
      }
      this.oscs[i].lastHz = hz;
      this.oscs[i].osc.frequency.cancelScheduledValues(now);
      this.oscs[i].osc.frequency.setTargetAtTime(hz, now, tau);
    }
    this.updatePitchFMDepths();
  }

  /** 弯音轮(±2 半音,AUD-12):所有受键盘控制的 VCO 即时重算 */
  setBend(semis: number): void {
    this.bendSemis = clamp(semis, -2, 2);
    this.updateOscFrequencies(this.lastMidi, false);
  }

  private updatePitchFMDepths(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.store;
    const wheel = s.num("modWheel") / 100;
    const oscModOn = s.bool("oscMod");
    const mixN = s.num("modMix") / 10;
    const srcAIsOsc3 = !s.bool("srcAFilterEg");
    // 相对频率偏差(满深度 = PITCH_FM_SEMITONES 半音)
    const devRatio = Math.pow(2, (PITCH_FM_SEMITONES * wheel) / 12) - 1;
    for (let i = 0; i < 3; i++) {
      const n = i + 1;
      const range = s.str(`osc${n}Range`);
      // LO 档不接收音高 FM,避免自调制(AUD-10)
      const skip = !oscModOn || range === "LO";
      // 源 A = Osc.3 时,Osc-3 只接收源 B 份额(不自调制)
      const share = n === 3 && srcAIsOsc3 ? mixN : 1;
      const depth = skip ? 0 : this.oscs[i].lastHz * devRatio * share;
      this.oscs[i].fmDepth.gain.setTargetAtTime(depth, ctx.currentTime, SMOOTH);
    }
  }

  /* ===================== 参数同步(ParamStore → Audio) ===================== */

  syncAll(): void {
    const ids = [
      "osc1Wave", "osc2Wave", "osc3Wave",
      "osc1Vol", "osc2Vol", "osc3Vol",
      "osc1On", "osc2On", "osc3On",
      "noiseOn", "noiseVol", "noiseType",
      "extOn", "extVol",
      "lfoRate", "lfoWave",
      "cutoff", "emphasis", "contour",
      "filtA", "filtD", "filtS", "decayMode",
      "volume", "power", "tunerOn",
      "modMix", "srcAFilterEg", "srcBLfo", "oscMod", "filterMod",
      "kc1", "kc2", "modWheel",
      "tune", "glideOn", "glideTime",
      "osc1Range", "osc2Range", "osc3Range",
      "osc1Tune", "osc2Tune", "osc3Tune", "osc3Control",
    ];
    for (const id of ids) this.syncParam(id);
    this.updateOscFrequencies(this.lastMidi, false);
  }

  syncParam(id: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.store;
    const now = ctx.currentTime;
    switch (id) {
      case "osc1Wave":
      case "osc2Wave":
      case "osc3Wave": {
        const n = Number(id[3]);
        this.oscs[n - 1].osc.setPeriodicWave(periodicWave(ctx, this.oscWave(n)));
        break;
      }
      case "osc1Vol":
      case "osc2Vol":
      case "osc3Vol":
      case "osc1On":
      case "osc2On":
      case "osc3On": {
        const n = Number(id[3]);
        const on = s.bool(`osc${n}On`);
        this.oscs[n - 1].mixer.gain.setTargetAtTime(
          on ? mixerGain(s.num(`osc${n}Vol`)) : 0,
          now,
          SMOOTH,
        );
        break;
      }
      case "noiseOn":
      case "noiseVol":
        this.noiseMixer.gain.setTargetAtTime(
          s.bool("noiseOn") ? mixerGain(s.num("noiseVol")) : 0,
          now,
          SMOOTH,
        );
        break;
      case "noiseType": {
        const pink = s.bool("noiseType");
        this.noiseWhiteSel.gain.setTargetAtTime(pink ? 0 : 1, now, 0.02);
        this.noisePinkSel.gain.setTargetAtTime(pink ? 1 : 0, now, 0.02);
        break;
      }
      case "extOn":
      case "extVol":
        this.extMixer.gain.setTargetAtTime(
          s.bool("extOn") ? mixerGain(s.num("extVol")) * 1.6 : 0,
          now,
          SMOOTH,
        );
        break;
      case "lfoRate":
        this.lfo.frequency.setTargetAtTime(lfoHz(s.num("lfoRate")), now, 0.05);
        break;
      case "lfoWave":
        this.applyLfoShape();
        break;
      case "cutoff":
      case "kc1":
      case "kc2":
      case "emphasis":
      case "contour":
      case "filtA":
      case "filtD":
      case "filtS":
      case "decayMode":
        this.pushFilterParams();
        break;
      case "volume":
        this.volGain.gain.setTargetAtTime(masterGain(s.num("volume")), now, SMOOTH);
        break;
      case "power":
        this.setPower(s.bool("power"));
        break;
      case "tunerOn":
        this.tunerGain.gain.setTargetAtTime(s.bool("tunerOn") ? 0.12 : 0, now, 0.03);
        break;
      case "modMix":
      case "srcAFilterEg":
      case "srcBLfo":
        this.updateModMix();
        break;
      case "oscMod":
      case "modWheel":
        this.updatePitchFMDepths();
        this.updateFilterFM();
        break;
      case "filterMod":
        this.updateFilterFM();
        break;
      case "osc1Range":
      case "osc2Range":
      case "osc3Range":
      case "osc1Tune":
      case "osc2Tune":
      case "osc3Tune":
      case "osc3Control":
      case "tune":
      case "glideOn":
      case "glideTime":
        this.updateOscFrequencies(this.lastMidi, false);
        break;
      default:
        break;
    }
  }

  private applyLfoShape(): void {
    this.lfo.type = this.store.bool("lfoWave") ? "square" : "triangle";
  }

  /* ---- 滤波器参数 ---- */
  private pushFilterParams(): void {
    const s = this.store;
    const base = this.baseCutoffHz();
    const res = resonance(s.num("emphasis"));
    const cOct = contourOctaves(s.num("contour"));
    if (this.ladder) {
      this.ladder.port.postMessage({
        type: "params",
        cutoff: base,
        resonance: res,
        contourOct: cOct,
        attackS: envSeconds(s.num("filtA")),
        decayS: envSeconds(s.num("filtD")),
        sustain: s.bool("decayMode") ? 0 : s.num("filtS") / 10,
        decayMode: s.bool("decayMode"),
      });
    } else if (this.ladderFallback.length) {
      const now = this.ctx!.currentTime;
      for (const f of this.ladderFallback) {
        f.frequency.setTargetAtTime(base, now, 0.012);
      }
      // 共振近似:首级承载 Q
      this.ladderFallback[0].Q.setTargetAtTime(0.707 + res * res * 10, now, 0.012);
      if (this.fallbackEgGain) {
        // 包络 0→1 时截止从 base 扫到 base·2^cOct
        this.fallbackEgGain.gain.setTargetAtTime(
          base * (Math.pow(2, cOct) - 1),
          now,
          0.012,
        );
      }
    }
  }

  /** 键盘跟踪后的基础截止(AUD-7:KC1 +100%,KC2 +50%) */
  private baseCutoffHz(): number {
    const s = this.store;
    let hz = cutoffHz(s.num("cutoff"));
    const kc = kcOctaves(s.bool("kc1"), s.bool("kc2"));
    if (kc > 0) hz *= Math.pow(2, (kc * (this.lastMidi - 60)) / 12);
    return clamp(hz, 10, 32000);
  }

  private updateFilterFM(): void {
    if (!this.filterFMOct || !this.ctx) return;
    const s = this.store;
    const wheel = s.num("modWheel") / 100;
    const oct = s.bool("filterMod") ? FILTER_FM_OCTAVES * wheel : 0;
    this.filterFMOct.gain.setTargetAtTime(oct, this.ctx.currentTime, SMOOTH);
  }

  /* ---- 调制矩阵接线 ---- */
  private rewireModSources(disconnectFirst: boolean): void {
    if (disconnectFirst) {
      safeDisconnect(this.osc3Tap, this.modBusA);
      safeDisconnect(this.filterEgSource, this.modBusA);
      safeDisconnect(this.noiseTap, this.modBusB);
      safeDisconnect(this.lfoTap, this.modBusB);
    }
    if (this.store.bool("srcAFilterEg")) {
      this.filterEgSource.connect(this.modBusA);
    } else {
      this.osc3Tap.connect(this.modBusA);
    }
    if (this.store.bool("srcBLfo")) {
      this.lfoTap.connect(this.modBusB);
    } else {
      this.noiseTap.connect(this.modBusB);
    }
  }

  private updateModMix(): void {
    if (!this.ctx) return;
    const mix = this.store.num("modMix") / 10;
    this.modBusA.gain.setTargetAtTime(1 - mix, this.ctx.currentTime, SMOOTH);
    this.modBusB.gain.setTargetAtTime(mix, this.ctx.currentTime, SMOOTH);
    this.rewireModSources(true);
    this.updatePitchFMDepths();
  }

  /* ---- 电源(INT-8 / AUD-13) ---- */
  setPower(on: boolean): void {
    if (!this.ctx) return;
    this.powerGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    if (!on) this.allNotesOff();
  }

  /* ---- 麦克风(EXT-1) ---- */
  async enableMic(): Promise<void> {
    if (this.extStream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (!this.ctx) await this.ensureStarted();
    const ctx = this.ctx!;
    this.extStream = stream;
    this.extSrc = ctx.createMediaStreamSource(stream);
    this.extAnalyser = ctx.createAnalyser();
    this.extAnalyser.fftSize = 1024;
    this.extSrc.connect(this.extAnalyser);
    this.extSrc.connect(this.extMixer);
    this.syncParam("extOn");
  }

  /** 轮询外部输入峰值 → Overload 灯(EXT-2);由渲染循环调用 */
  pollOverload(): void {
    if (!this.extAnalyser || !this.hooks.onOverload) return;
    this.extAnalyser.getFloatTimeDomainData(this.extPeakBuf);
    let peak = 0;
    for (let i = 0; i < this.extPeakBuf.length; i += 4) {
      const v = Math.abs(this.extPeakBuf[i]);
      if (v > peak) peak = v;
    }
    const over = peak > 0.62 && this.store.bool("extOn");
    if (over !== this.overload) {
      this.overload = over;
      this.hooks.onOverload!(over);
    }
  }

  dispose(): void {
    this.allNotesOff();
    this.extStream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && typeof this.ctx.close === "function") {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}

/* ===================== 工具 ===================== */

function oscHzClamped(
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

function safeDisconnect(src: AudioNode, dst: AudioNode): void {
  try {
    src.disconnect(dst);
  } catch {
    /* 未连接 */
  }
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15);
  }
  return curve;
}

function makeNoise(ctx: BaseAudioContext, kind: "white" | "pink"): AudioBuffer {
  const seconds = 2;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    // Paul Kellet 粉噪声滤波器(公开领域算法)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}
