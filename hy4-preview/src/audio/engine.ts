/**
 * 声音引擎(PRD §10 AUD-1..16、§11 EXT-1/2)
 * ------------------------------------------------------------------
 * 信号链: 混音 → 梯形低通(24dB/oct) → VCA(响度包络) → 主音量(软饱和) → 输出
 * 音频图常驻(AUD-4):引擎启动时一次性建好,noteOn/off 只触发包络与音高自动化。
 */
import { params, RANGES, WAVEFORMS } from "../state/params";
import * as M from "./mapping";
import { createLadderFilter, type LadderFilter, type ParamLike } from "./ladder";

const HARMONICS = 128;
const LO_MULTIPLIER = 0.5 / 64; // LO 档:把音高降到 0.2–20Hz 区间作调制源(PRD 附录 B)

/** 带限周期波表(≤128 谐波,杜绝混叠) */
function buildWave(ctx: BaseAudioContext, type: string): PeriodicWave {
  const N = HARMONICS;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  const TAU2 = Math.PI;
  switch (type) {
    case "triangle":
      for (let k = 1; k <= N; k += 2) {
        imag[k] = (8 / (TAU2 * TAU2)) * (Math.pow(-1, (k - 1) / 2) / (k * k));
      }
      break;
    case "sawtooth":
      for (let k = 1; k <= N; k++) imag[k] = Math.pow(-1, k + 1) / k;
      break;
    case "rev_saw":
      for (let k = 1; k <= N; k++) imag[k] = Math.pow(-1, k) / k;
      break;
    case "pulse1": // 方波(占空比 50%)
      for (let k = 1; k <= N; k += 2) imag[k] = 1 / k;
      break;
    case "pulse2": // 宽脉冲(占空比 25%)
    case "pulse3": // 窄脉冲(占空比 10%)
    case "square": // 兼容别名
    {
      const duty = type === "pulse2" ? 0.25 : type === "pulse3" ? 0.1 : 0.5;
      for (let k = 1; k <= N; k++) imag[k] = (4 / (k * TAU2)) * Math.sin(TAU2 * k * duty);
      break;
    }
    default:
      for (let k = 1; k <= N; k++) imag[k] = Math.pow(-1, k + 1) / k;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeNoiseBuffer(ctx: BaseAudioContext, pink: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else {
    // Paul Kellet 粉噪声近似
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

interface OscVoice {
  osc: OscillatorNode;
  gain: GainNode;
  fm: GainNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private filter!: LadderFilter;
  private waves = new Map<string, PeriodicWave>();
  private voices: OscVoice[] = [];
  private currentWave = ["", "", ""];
  private mixBus!: GainNode;
  private vca!: GainNode;
  private masterGain!: GainNode;
  private shaper!: WaveShaperNode;

  private whiteNoise!: AudioBufferSourceNode;
  private pinkNoise!: AudioBufferSourceNode;
  private noiseGain!: GainNode;
  private extGain!: GainNode;
  private extSource: MediaStreamAudioSourceNode | null = null;
  private extAnalyser: AnalyserNode | null = null;
  private extBuf = new Float32Array(2048);

  private lfo!: OscillatorNode;
  private filterEgSource!: ConstantSourceNode;
  private filterEgDepth!: GainNode;
  private modBus!: GainNode;
  private gAOsc3!: GainNode;
  private gAEg!: GainNode;
  private gBNoise!: GainNode;
  private gBLfo!: GainNode;
  private pitchFm!: GainNode;
  private filterFm!: GainNode;

  private tunerOsc: OscillatorNode | null = null;
  private tunerGain: GainNode | null = null;

  /** 单音逻辑:按住的键(末尾为最后按下) */
  private held: number[] = [];
  private currentNote = 60;
  private osc3FreeNote = 60;
  private baseCutoff = 1200;

  ready = false;
  filterMode: "worklet" | "biquad" = "worklet";
  onOverload: ((on: boolean) => void) | null = null;
  private overloadState = false;
  private overloadTimer: number | undefined;

  // ── 生命周期 ────────────────────────────────────────────────────
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    this.filter = await createLadderFilter(ctx);
    this.filterMode = this.filter.mode;

    // 主链
    this.mixBus = ctx.createGain();
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeSoftSaturation();
    this.shaper.oversample = "2x";

    this.mixBus.connect(this.filter.input);
    this.filter.output.connect(this.vca);
    this.vca.connect(this.masterGain);
    this.masterGain.connect(this.shaper);
    this.shaper.connect(ctx.destination);

    // 三个振荡器
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const fm = ctx.createGain();
      fm.gain.value = 1;
      osc.connect(gain);
      gain.connect(this.mixBus);
      fm.connect(osc.detune);
      osc.frequency.value = 440;
      osc.start();
      this.voices.push({ osc, gain, fm });
    }

    // 调制总线
    this.modBus = ctx.createGain();
    this.modBus.gain.value = 1;
    this.pitchFm = ctx.createGain();
    this.pitchFm.gain.value = 0;
    this.filterFm = ctx.createGain();
    this.filterFm.gain.value = 0;
    this.modBus.connect(this.pitchFm);
    this.modBus.connect(this.filterFm);
    for (const v of this.voices) this.pitchFm.connect(v.fm);
    // 截止频率调制:滤波包络与滤波 FM 都汇入 cutoff 的 AudioParam
    for (const p of this.filter.modulationTargets) this.filterFm.connect(p);

    // 调制源 A / B
    this.filterEgSource = ctx.createConstantSource();
    this.filterEgSource.offset.value = 0;
    this.filterEgSource.start();
    this.filterEgDepth = ctx.createGain();
    this.filterEgDepth.gain.value = 0;
    this.filterEgSource.connect(this.filterEgDepth);
    for (const p of this.filter.modulationTargets) this.filterEgDepth.connect(p);

    this.gAOsc3 = ctx.createGain();
    this.gAOsc3.gain.value = 0;
    this.gAEg = ctx.createGain();
    this.gAEg.gain.value = 0;
    this.gBNoise = ctx.createGain();
    this.gBNoise.gain.value = 0;
    this.gBLfo = ctx.createGain();
    this.gBLfo.gain.value = 0;
    this.voices[2].osc.connect(this.gAOsc3);
    this.filterEgSource.connect(this.gAEg);
    this.gAOsc3.connect(this.modBus);
    this.gAEg.connect(this.modBus);

    // 白/粉噪声
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseGain.connect(this.mixBus);
    this.whiteNoise = ctx.createBufferSource();
    this.whiteNoise.buffer = makeNoiseBuffer(ctx, false);
    this.whiteNoise.loop = true;
    this.whiteNoise.start();
    this.pinkNoise = ctx.createBufferSource();
    this.pinkNoise.buffer = makeNoiseBuffer(ctx, true);
    this.pinkNoise.loop = true;
    this.pinkNoise.start();
    const whiteTap = ctx.createGain();
    const pinkTap = ctx.createGain();
    whiteTap.gain.value = 1;
    pinkTap.gain.value = 0;
    this.whiteNoise.connect(whiteTap);
    this.pinkNoise.connect(pinkTap);
    whiteTap.connect(this.noiseGain);
    pinkTap.connect(this.noiseGain);
    this.noiseTaps = { whiteTap, pinkTap };
    // 噪声作为调制源 B(取当前选中的那一路)
    whiteTap.connect(this.gBNoise);
    pinkTap.connect(this.gBNoise);

    // LFO
    this.lfo = ctx.createOscillator();
    this.lfo.type = "triangle";
    this.lfo.frequency.value = 5;
    this.lfo.start();
    this.lfo.connect(this.gBLfo);
    this.gBLfo.connect(this.modBus);

    // 外部输入
    this.extGain = ctx.createGain();
    this.extGain.gain.value = 0;
    this.extGain.connect(this.mixBus);

    this.bindParams();
    this.applyAll();
    this.ready = true;
    if (ctx.state === "suspended") await ctx.resume();
  }

  private noiseTaps!: { whiteTap: GainNode; pinkTap: GainNode };

  // ── 参数绑定 ────────────────────────────────────────────────────
  private bindParams(): void {
    params.subscribe((id) => this.onParam(id));
    params.subscribeBulk(() => this.applyAll());
  }

  private onParam(id: string): void {
    switch (id) {
      case "osc1Waveform":
      case "osc2Waveform":
      case "osc3Waveform":
      case "osc1Range":
      case "osc2Range":
      case "osc3Range":
      case "osc1Frequency":
      case "osc2Frequency":
      case "osc3Frequency":
      case "tune":
      case "pitchWheel":
        this.updateOscFrequencies(false);
        break;
      case "osc1On":
      case "osc1Volume":
      case "osc2On":
      case "osc2Volume":
      case "osc3On":
      case "osc3Volume":
        this.updateMixer();
        break;
      case "noiseOn":
      case "noiseVolume":
      case "noiseType":
        this.updateNoise();
        break;
      case "externalOn":
      case "externalVolume":
        this.updateExternal();
        break;
      case "filterCutoff":
      case "filterContourAmount":
      case "keyboardControl1":
      case "keyboardControl2":
        this.updateCutoff();
        break;
      case "filterEmphasis":
        this.updateResonance();
        break;
      case "lfoRate":
      case "lfoWaveform":
        this.updateLfo();
        break;
      case "modMix":
      case "osc3FilterEgSwitch":
      case "noiseLfoSwitch":
      case "oscillatorModulationOn":
      case "filterModulationOn":
      case "modWheel":
        this.updateModulation();
        break;
      case "mainVolume":
      case "power":
        this.updateMaster();
        break;
      case "tunerOn":
        this.updateTuner();
        break;
      case "osc3Control":
        this.updateOscFrequencies(false);
        this.updateMixer();
        break;
      default:
        break;
    }
  }

  /** 预设载入 / 本地恢复后的整体同步 */
  applyAll(): void {
    if (!this.ctx) return;
    this.updateOscFrequencies(false);
    this.updateMixer();
    this.updateNoise();
    this.updateExternal();
    this.updateCutoff();
    this.updateResonance();
    this.updateLfo();
    this.updateModulation();
    this.updateMaster();
    this.updateTuner();
  }

  private ctxNow(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private smooth(param: ParamLike | AudioParam, value: number, tc = 0.01): void {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctxNow(), tc);
  }

  // ── 各子系统 ────────────────────────────────────────────────────
  private waveFor(type: string): PeriodicWave | null {
    if (!this.ctx) return null;
    let w = this.waves.get(type);
    if (!w) {
      w = buildWave(this.ctx, type);
      this.waves.set(type, w);
    }
    return w;
  }

  private rangeMul(rangeKey: string): number {
    return rangeKey === "lo" ? LO_MULTIPLIER : M.RANGE_MULTIPLIER[rangeKey] ?? 0.5;
  }

  private updateOscFrequencies(glide: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const tune = params.get("tune");
    const pw = params.get("pitchWheel");
    const glideTime = glide && params.getBool("glideOn") ? M.calculateGlideTime(params.get("glideTime")) : 0.003;
    const osc3Control = params.getBool("osc3Control");
    if (osc3Control) this.osc3FreeNote = this.currentNote;

    for (let i = 0; i < 3; i++) {
      const v = this.voices[i];
      const waveform = WAVEFORMS[params.get(`osc${i + 1}Waveform`)] ?? "sawtooth";
      if (this.currentWave[i] !== waveform) {
        const w = this.waveFor(waveform);
        if (w) {
          try {
            v.osc.setPeriodicWave(w);
          } catch {
            /* 忽略 */
          }
          this.currentWave[i] = waveform;
        }
      }
      const rangeKey = RANGES[params.get(`osc${i + 1}Range`)] ?? "8";
      const detune = params.get(`osc${i + 1}Frequency`);
      // Osc-3 Control 关闭时,Osc-3 脱离键盘,按自身档位/频率自由运行
      const note = i === 2 && !osc3Control ? this.osc3FreeNote : this.currentNote;
      const base = M.calculateFrequency(note, tune, detune, pw, i === 0 ? 2 : 0);
      let f = base * this.rangeMul(rangeKey);
      f = rangeKey === "lo" ? M.clamp(f, 0.2, 20) : M.clampAudioFrequency(f);
      const now = ctx.currentTime;
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(v.osc.frequency.value, now);
      v.osc.frequency.linearRampToValueAtTime(f, now + glideTime);
      // LO 档不接收音高 FM(AUD-10)
      v.fm.gain.setTargetAtTime(rangeKey === "lo" ? 0 : 1, now, 0.01);
    }
  }

  private updateMixer(): void {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      const on = params.getBool(`osc${i + 1}On`);
      const vol = params.get(`osc${i + 1}Volume`);
      const boost = i === 0 ? 1.2 : 1;
      this.smooth(this.voices[i].gain.gain, on ? M.calculateVolume(vol, boost) : 0, 0.012);
    }
  }

  private updateNoise(): void {
    if (!this.ctx) return;
    const on = params.getBool("noiseOn");
    const vol = params.get("noiseVolume");
    const pink = params.getBool("noiseType");
    this.smooth(this.noiseGain.gain, on ? M.calculateVolume(vol) : 0, 0.012);
    this.smooth(this.noiseTaps.whiteTap.gain, pink ? 0 : 1, 0.01);
    this.smooth(this.noiseTaps.pinkTap.gain, pink ? 1 : 0, 0.01);
  }

  private updateExternal(): void {
    if (!this.ctx) return;
    const on = params.getBool("externalOn");
    const vol = params.get("externalVolume");
    this.smooth(this.extGain.gain, on && this.extSource ? M.calculateVolume(vol) : 0, 0.012);
    if (on && !this.extSource) void this.enableExternalInput();
  }

  private updateCutoff(): void {
    if (!this.ctx) return;
    const base = M.mapCutoff(params.get("filterCutoff"));
    const kc1 = params.getBool("keyboardControl1");
    const kc2 = params.getBool("keyboardControl2");
    const track = M.keyboardTrackingOctaves(kc1, kc2, this.currentNote);
    const tracked = M.clamp(base * Math.pow(2, track), 10, 32000);
    this.baseCutoff = tracked;
    this.smooth(this.filter.cutoff, tracked, 0.012);
    const amount = params.get("filterContourAmount");
    this.smooth(this.filterEgDepth.gain, tracked * (amount / 10), 0.02);
    this.updateModulation();
  }

  private updateResonance(): void {
    if (!this.ctx) return;
    this.smooth(
      this.filter.resonance,
      M.mapEmphasisToLadderResonance(params.get("filterEmphasis")),
      0.015
    );
  }

  private updateLfo(): void {
    if (!this.ctx) return;
    const f = M.calculateLfoFrequency(params.get("lfoRate"));
    this.smooth(this.lfo.frequency, f, 0.02);
    this.lfo.type = params.getBool("lfoWaveform") ? "square" : "triangle";
  }

  private updateModulation(): void {
    if (!this.ctx) return;
    const mix = M.clamp(params.get("modMix") / 10, 0, 1);
    const aIsEg = params.getBool("osc3FilterEgSwitch");
    const bIsLfo = params.getBool("noiseLfoSwitch");
    this.smooth(this.gAOsc3.gain, aIsEg ? 0 : 1 - mix, 0.02);
    this.smooth(this.gAEg.gain, aIsEg ? 1 - mix : 0, 0.02);
    this.smooth(this.gBNoise.gain, bIsLfo ? 0 : mix, 0.02);
    this.smooth(this.gBLfo.gain, bIsLfo ? mix : 0, 0.02);

    const wheel = params.get("modWheel");
    const pitchOn = params.getBool("oscillatorModulationOn");
    const cents = M.calculateGradualModulation(wheel, 150, 2.0);
    this.smooth(this.pitchFm.gain, pitchOn ? cents : 0, 0.02);

    const filterOn = params.getBool("filterModulationOn");
    const norm = M.clamp(wheel / 100, 0, 1);
    const depthHz = norm * norm * this.baseCutoff * 3;
    this.smooth(this.filterFm.gain, filterOn ? depthHz : 0, 0.02);
  }

  private updateMaster(): void {
    if (!this.ctx) return;
    const on = params.getBool("power");
    const g = M.mapMainVolume(params.get("mainVolume"));
    this.smooth(this.masterGain.gain, on ? g : 0, 0.02);
    if (!on) this.allNotesOff();
  }

  private updateTuner(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const on = params.getBool("tunerOn");
    if (on && !this.tunerOsc) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setTargetAtTime(0.18, ctx.currentTime, 0.02);
      osc.start();
      this.tunerOsc = osc;
      this.tunerGain = g;
    } else if (!on && this.tunerOsc && this.tunerGain) {
      const osc = this.tunerOsc;
      const g = this.tunerGain;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* 已停止 */
        }
        osc.disconnect();
        g.disconnect();
      }, 120);
      this.tunerOsc = null;
      this.tunerGain = null;
    }
  }

  // ── 演奏 ────────────────────────────────────────────────────────
  noteOn(midi: number): void {
    if (!this.ctx || !params.getBool("power")) return;
    const idx = this.held.indexOf(midi);
    if (idx >= 0) this.held.splice(idx, 1);
    this.held.push(midi);
    const glide = params.getBool("glideOn") && this.held.length > 1;
    this.currentNote = midi;
    this.updateOscFrequencies(glide);
    this.updateCutoff();
    this.triggerEnvelopes();
  }

  noteOff(midi: number): void {
    if (!this.ctx) return;
    const idx = this.held.indexOf(midi);
    if (idx >= 0) this.held.splice(idx, 1);
    if (this.held.length === 0) {
      this.releaseEnvelopes();
      return;
    }
    const next = this.held[this.held.length - 1];
    this.currentNote = next;
    this.updateOscFrequencies(params.getBool("glideOn"));
    this.updateCutoff();
    this.triggerEnvelopes();
  }

  allNotesOff(): void {
    this.held.length = 0;
    this.releaseEnvelopes();
  }

  private triggerEnvelopes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const decayOn = params.getBool("decaySwitchOn");

    const fA = Math.max(0.005, M.mapEnvelopeTime(params.get("filterAttack")));
    const fD = Math.max(0.02, M.mapEnvelopeTime(params.get("filterDecay")));
    const fS = M.clamp(params.get("filterSustain") / 10, 0, 1);

    const feg = this.filterEgSource.offset;
    feg.cancelScheduledValues(now);
    feg.setValueAtTime(feg.value, now);
    feg.linearRampToValueAtTime(1, now + fA);
    feg.linearRampToValueAtTime(decayOn ? 0 : fS, now + fA + fD);

    const lA = Math.max(0.005, M.mapEnvelopeTime(params.get("loudnessAttack")));
    const lD = Math.max(0.02, M.mapEnvelopeTime(params.get("loudnessDecay")));
    const lS = M.clamp(params.get("loudnessSustain") / 10, 0, 1);

    const g = this.vca.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value * 0.3, now);
    g.linearRampToValueAtTime(1, now + lA);
    g.linearRampToValueAtTime(decayOn ? 0 : lS, now + lA + lD);
  }

  private releaseEnvelopes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const decayOn = params.getBool("decaySwitchOn");
    const d = Math.max(0.02, M.mapEnvelopeTime(params.get("loudnessDecay")));
    const fD = Math.max(0.02, M.mapEnvelopeTime(params.get("filterDecay")));
    const rel = decayOn ? d : M.clamp(d * 0.1, 0.03, 0.1);
    const fRel = decayOn ? fD : M.clamp(fD * 0.1, 0.03, 0.1);

    const g = this.vca.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + rel);

    const feg = this.filterEgSource.offset;
    feg.cancelScheduledValues(now);
    feg.setValueAtTime(feg.value, now);
    feg.linearRampToValueAtTime(0, now + fRel);
  }

  // ── 外部输入(EXT-1/2) ─────────────────────────────────────────
  async enableExternalInput(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.extSource) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = this.ctx.createMediaStreamSource(stream);
      src.connect(this.extGain);
      this.extSource = src;
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      this.extGain.connect(an);
      this.extAnalyser = an;
      this.extBuf = new Float32Array(an.fftSize);
      this.startOverloadWatch();
      this.updateExternal();
      return true;
    } catch {
      params.set("externalOn", 0);
      return false;
    }
  }

  private startOverloadWatch(): void {
    if (this.overloadTimer !== undefined) return;
    this.overloadTimer = setInterval(() => {
      const an = this.extAnalyser;
      if (!an) return;
      an.getFloatTimeDomainData(this.extBuf);
      let sum = 0;
      for (let i = 0; i < this.extBuf.length; i++) sum += this.extBuf[i] * this.extBuf[i];
      const rms = Math.sqrt(sum / this.extBuf.length);
      const on = rms > 0.3;
      if (on !== this.overloadState) {
        this.overloadState = on;
        this.onOverload?.(on);
      }
    }, 100) as unknown as number;
  }

  isOverloaded(): boolean {
    return this.overloadState;
  }

  setPower(on: boolean): void {
    params.set("power", on ? 1 : 0);
  }
}

/** 主输出后的轻微软饱和曲线 */
function makeSoftSaturation() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  return curve;
}

export const engine = new AudioEngine();
