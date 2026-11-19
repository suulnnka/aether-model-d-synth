import type { ParamStore } from "../state/paramStore.ts";
import { OSC12_WAVEFORMS, OSC3_WAVEFORMS, OSC_RANGES } from "../state/specs.ts";
import type { ControlId } from "../state/types.ts";
import {
  computeKeyTrackingOctaves,
  computeOscHz,
  mapContourOctaves,
  mapCutoff,
  mapDelayTimeSec,
  mapEnvelopeTime,
  mapGlideTime,
  mapLfoRate,
  mapPitchWheelSemitones,
  mapVolumeGain,
} from "./mapping.ts";
import { createStudioImpulseResponse } from "./reverb.ts";
import {
  applyOscWaveform,
  createPinkNoiseBuffer,
  createWhiteNoiseBuffer,
} from "./waveforms.ts";

export interface EngineCallbacks {
  onOverload?: (overload: boolean, level: number) => void;
  onStatus?: (ready: boolean, error?: string) => void;
}

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  // Monophonic last-note priority stack
  private heldNotes: number[] = [];
  private activeMidi = 48; // C3 default reference pitch
  private gateOpen = false;

  // Continuous VCOs
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private osc3!: OscillatorNode;
  private osc1Gain!: GainNode;
  private osc2Gain!: GainNode;
  private osc3Gain!: GainNode;
  private osc3ModTapGain!: GainNode;

  // Noise & Ext
  private whiteSource!: AudioBufferSourceNode;
  private pinkSource!: AudioBufferSourceNode;
  private whiteGate!: GainNode;
  private pinkGate!: GainNode;
  private noiseBusGain!: GainNode;
  private noiseModTapGain!: GainNode;
  private extGain!: GainNode;
  private extStream: MediaStream | null = null;
  private extSource: MediaStreamAudioSourceNode | null = null;

  // Mixer + Overload + Filter + VCA
  private mixerSumGain!: GainNode;
  private ladderNode: AudioWorkletNode | null = null;
  private fallbackFilter1: BiquadFilterNode | null = null;
  private fallbackFilter2: BiquadFilterNode | null = null;
  private loudnessVca!: GainNode;

  // Modulation Bus
  private lfoOsc!: OscillatorNode;
  private lfoModGain!: GainNode;
  private filterEgSource!: ConstantSourceNode;
  private filterEgModGain!: GainNode;
  private modMixSrc1Gain!: GainNode;
  private modMixSrc2Gain!: GainNode;
  private modWheelGain!: GainNode;
  private oscModDepthGain!: GainNode;
  private filterModDepthGain!: GainNode;
  private keyTrackSource!: ConstantSourceNode;

  // Output, Tuner & Effects
  private mainDryGain!: GainNode;
  private auxSendGain!: GainNode;
  private delayNode: AudioWorkletNode | null = null;
  private reverbInputGain!: GainNode;
  private convolver!: ConvolverNode;
  private reverbToneFilter!: BiquadFilterNode;
  private reverbWetGain!: GainNode;
  private fxReturnGain!: GainNode;

  private tunerOsc!: OscillatorNode;
  private tunerGain!: GainNode;
  private masterPowerGate!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;
  private scopeBuffer = new Float32Array(512);

  constructor(
    private readonly store: ParamStore,
    private readonly callbacks: EngineCallbacks = {},
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  getActiveMidi(): number {
    return this.activeMidi;
  }

  getHeldNotes(): readonly number[] {
    return this.heldNotes;
  }

  async ensureStarted(): Promise<void> {
    if (this.ready && this.ctx) {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initAudioGraph();
    await this.initPromise;
  }

  private async initAudioGraph(): Promise<void> {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ latencyHint: "interactive" });
      this.ctx = ctx;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Load AudioWorklet modules using relative URLs (safe on subpath deployments)
      let workletsOk = false;
      if (ctx.audioWorklet) {
        try {
          const base = import.meta.env.BASE_URL || "./";
          await Promise.all([
            ctx.audioWorklet.addModule(new URL(`${base}worklets/ladder-processor.js`, document.baseURI).href),
            ctx.audioWorklet.addModule(new URL(`${base}worklets/delay-processor.js`, document.baseURI).href),
            ctx.audioWorklet.addModule(new URL(`${base}worklets/overload-processor.js`, document.baseURI).href),
          ]);
          workletsOk = true;
        } catch (err) {
          console.warn("AudioWorklet loading failed, using fallback filter:", err);
        }
      }

      // 1. Oscillators
      this.osc1 = ctx.createOscillator();
      this.osc2 = ctx.createOscillator();
      this.osc3 = ctx.createOscillator();
      this.osc1Gain = ctx.createGain();
      this.osc2Gain = ctx.createGain();
      this.osc3Gain = ctx.createGain();
      this.osc3ModTapGain = ctx.createGain();
      this.osc3ModTapGain.gain.value = 1;

      this.osc1.connect(this.osc1Gain);
      this.osc2.connect(this.osc2Gain);
      this.osc3.connect(this.osc3Gain);
      this.osc3.connect(this.osc3ModTapGain);

      // 2. Noise Sources
      this.whiteSource = ctx.createBufferSource();
      this.whiteSource.buffer = createWhiteNoiseBuffer(ctx, 4);
      this.whiteSource.loop = true;

      this.pinkSource = ctx.createBufferSource();
      this.pinkSource.buffer = createPinkNoiseBuffer(ctx, 4);
      this.pinkSource.loop = true;

      this.whiteGate = ctx.createGain();
      this.pinkGate = ctx.createGain();
      this.noiseBusGain = ctx.createGain();
      this.noiseModTapGain = ctx.createGain();
      this.noiseModTapGain.gain.value = 1.4;

      this.whiteSource.connect(this.whiteGate);
      this.pinkSource.connect(this.pinkGate);
      this.whiteGate.connect(this.noiseBusGain);
      this.pinkGate.connect(this.noiseBusGain);
      this.whiteGate.connect(this.noiseModTapGain);
      this.pinkGate.connect(this.noiseModTapGain);

      // 3. External Input Gain
      this.extGain = ctx.createGain();
      this.extGain.gain.value = 0;

      // 4. Mixer Sum
      this.mixerSumGain = ctx.createGain();
      this.mixerSumGain.gain.value = 0.42;
      this.osc1Gain.connect(this.mixerSumGain);
      this.osc2Gain.connect(this.mixerSumGain);
      this.osc3Gain.connect(this.mixerSumGain);
      this.noiseBusGain.connect(this.mixerSumGain);
      this.extGain.connect(this.mixerSumGain);

      // 5. Overload Meter + 4-Pole Ladder Filter
      let filterInput: AudioNode;
      if (workletsOk) {
        const ovl = new AudioWorkletNode(ctx, "aether-overload-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        ovl.port.onmessage = (ev) => {
          const d = ev.data as { overload?: boolean; level?: number } | null;
          if (d && typeof d.overload === "boolean") {
            this.callbacks.onOverload?.(d.overload, d.level ?? 0);
          }
        };
        this.mixerSumGain.connect(ovl);
        filterInput = ovl;
      } else {
        const pass = ctx.createGain();
        this.mixerSumGain.connect(pass);
        filterInput = pass;
      }

      this.loudnessVca = ctx.createGain();
      this.loudnessVca.gain.value = 0;

      if (workletsOk) {
        this.ladderNode = new AudioWorkletNode(ctx, "aether-ladder-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        filterInput.connect(this.ladderNode);
        this.ladderNode.connect(this.loudnessVca);
      } else {
        this.fallbackFilter1 = ctx.createBiquadFilter();
        this.fallbackFilter1.type = "lowpass";
        this.fallbackFilter2 = ctx.createBiquadFilter();
        this.fallbackFilter2.type = "lowpass";
        filterInput.connect(this.fallbackFilter1);
        this.fallbackFilter1.connect(this.fallbackFilter2);
        this.fallbackFilter2.connect(this.loudnessVca);
      }

      // 6. Modulation Bus (a-rate Web Audio routing)
      this.lfoOsc = ctx.createOscillator();
      this.lfoModGain = ctx.createGain();
      this.lfoOsc.connect(this.lfoModGain);

      this.filterEgSource = ctx.createConstantSource();
      this.filterEgSource.offset.value = 0;
      this.filterEgModGain = ctx.createGain();
      this.filterEgSource.connect(this.filterEgModGain);

      this.modMixSrc1Gain = ctx.createGain();
      this.modMixSrc2Gain = ctx.createGain();
      this.modWheelGain = ctx.createGain();
      this.oscModDepthGain = ctx.createGain();
      this.filterModDepthGain = ctx.createGain();

      // Source 1 inputs (Osc3 vs FilterEG) -> modMixSrc1Gain
      this.osc3ModTapGain.connect(this.modMixSrc1Gain);
      this.filterEgModGain.connect(this.modMixSrc1Gain);

      // Source 2 inputs (Noise vs LFO) -> modMixSrc2Gain
      this.noiseModTapGain.connect(this.modMixSrc2Gain);
      this.lfoModGain.connect(this.modMixSrc2Gain);

      this.modMixSrc1Gain.connect(this.modWheelGain);
      this.modMixSrc2Gain.connect(this.modWheelGain);

      this.modWheelGain.connect(this.oscModDepthGain);
      this.modWheelGain.connect(this.filterModDepthGain);

      this.oscModDepthGain.connect(this.osc1.detune);
      this.oscModDepthGain.connect(this.osc2.detune);
      this.oscModDepthGain.connect(this.osc3.detune);

      // Key tracking + filter mod -> ladderNode cutoffMod
      this.keyTrackSource = ctx.createConstantSource();
      this.keyTrackSource.offset.value = 0;
      if (this.ladderNode) {
        const cutoffModParam = this.ladderNode.parameters.get("cutoffMod");
        if (cutoffModParam) {
          this.filterModDepthGain.connect(cutoffModParam);
          this.keyTrackSource.connect(cutoffModParam);
        }
      }

      // 7. Output, Effects (Delay + Reverb), Tuner & Limiter
      this.mainDryGain = ctx.createGain();
      this.auxSendGain = ctx.createGain();
      this.fxReturnGain = ctx.createGain();
      this.fxReturnGain.gain.value = 1;

      this.loudnessVca.connect(this.mainDryGain);
      this.loudnessVca.connect(this.auxSendGain);

      if (workletsOk) {
        this.delayNode = new AudioWorkletNode(ctx, "aether-delay-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        this.auxSendGain.connect(this.delayNode);
        this.delayNode.connect(this.fxReturnGain);
      }

      // Reverb
      this.reverbInputGain = ctx.createGain();
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = createStudioImpulseResponse(ctx, 2.5, 2.5);
      this.reverbToneFilter = ctx.createBiquadFilter();
      this.reverbToneFilter.type = "lowpass";
      this.reverbToneFilter.Q.value = 0.7;
      this.reverbWetGain = ctx.createGain();

      this.auxSendGain.connect(this.reverbInputGain);
      this.reverbInputGain.connect(this.convolver);
      this.convolver.connect(this.reverbToneFilter);
      this.reverbToneFilter.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.fxReturnGain);

      // A-440 Reference Tuner
      this.tunerOsc = ctx.createOscillator();
      this.tunerOsc.type = "sine";
      this.tunerOsc.frequency.value = 440;
      this.tunerGain = ctx.createGain();
      this.tunerGain.gain.value = 0;
      this.tunerOsc.connect(this.tunerGain);

      // Master bus + Safety Limiter + Analyser
      this.masterPowerGate = ctx.createGain();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -4;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.12;

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.scopeBuffer = new Float32Array(this.analyser.fftSize);

      this.mainDryGain.connect(this.masterPowerGate);
      this.fxReturnGain.connect(this.masterPowerGate);
      this.tunerGain.connect(this.masterPowerGate);
      this.masterPowerGate.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      // Start all continuous generators
      const now = ctx.currentTime;
      this.osc1.start(now);
      this.osc2.start(now);
      this.osc3.start(now);
      this.whiteSource.start(now);
      this.pinkSource.start(now);
      this.lfoOsc.start(now);
      this.filterEgSource.start(now);
      this.keyTrackSource.start(now);
      this.tunerOsc.start(now);

      this.ready = true;
      this.syncAll();
      this.callbacks.onStatus?.(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onStatus?.(false, msg);
    }
  }

  async toggleExternalInput(enable: boolean): Promise<boolean> {
    if (!this.ctx) return false;
    if (!enable) {
      if (this.extSource) {
        try {
          this.extSource.disconnect();
        } catch {
          // ignore
        }
        this.extSource = null;
      }
      if (this.extStream) {
        this.extStream.getTracks().forEach((t) => t.stop());
        this.extStream = null;
      }
      return true;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.extStream = stream;
      this.extSource = this.ctx.createMediaStreamSource(stream);
      this.extSource.connect(this.extGain);
      return true;
    } catch {
      return false;
    }
  }

  noteOn(midi: number): void {
    const idx = this.heldNotes.indexOf(midi);
    if (idx !== -1) this.heldNotes.splice(idx, 1);
    this.heldNotes.push(midi);
    this.activeMidi = midi;

    if (!this.ready || !this.ctx) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    if (!this.store.getBool("powerOn")) return;

    const wasOpen = this.gateOpen;
    this.gateOpen = true;
    const now = this.ctx.currentTime;

    this.updatePitch(wasOpen);
    this.updateKeyTracking();

    // Trigger Loudness ADS envelope
    const lAttack = mapEnvelopeTime(this.store.get("loudnessAttack"));
    const lDecay = mapEnvelopeTime(this.store.get("loudnessDecay"));
    const lSustain = Math.max(0, Math.min(1, this.store.get("loudnessSustain") / 10));

    const lGain = this.loudnessVca.gain;
    lGain.cancelScheduledValues(now);
    const startVal = lGain.value;
    lGain.setValueAtTime(startVal, now);
    lGain.linearRampToValueAtTime(1.0, now + lAttack);
    lGain.setTargetAtTime(lSustain, now + lAttack, Math.max(0.004, lDecay * 0.35));

    // Trigger Filter EG modulation source
    const fAttack = mapEnvelopeTime(this.store.get("filterAttack"));
    const fDecay = mapEnvelopeTime(this.store.get("filterDecay"));
    const fSustain = Math.max(0, Math.min(1, this.store.get("filterSustain") / 10));
    const fOff = this.filterEgSource.offset;
    fOff.cancelScheduledValues(now);
    fOff.setValueAtTime(fOff.value, now);
    fOff.linearRampToValueAtTime(1.0, now + fAttack);
    fOff.setTargetAtTime(fSustain, now + fAttack, Math.max(0.004, fDecay * 0.35));

    // Trigger Ladder Filter Worklet envelope
    this.ladderNode?.port.postMessage({ type: "noteOn" });
    if (this.fallbackFilter1 && this.fallbackFilter2) {
      const baseHz = mapCutoff(this.store.get("filterCutoff"));
      const oct = mapContourOctaves(this.store.get("filterContourAmount"));
      const peakHz = Math.min(18000, baseHz * Math.pow(2, oct));
      const susHz = Math.min(18000, baseHz * Math.pow(2, oct * fSustain));
      for (const bf of [this.fallbackFilter1, this.fallbackFilter2]) {
        bf.frequency.cancelScheduledValues(now);
        bf.frequency.setValueAtTime(bf.frequency.value, now);
        bf.frequency.linearRampToValueAtTime(peakHz, now + fAttack);
        bf.frequency.setTargetAtTime(susHz, now + fAttack, Math.max(0.004, fDecay * 0.35));
      }
    }
  }

  noteOff(midi: number): void {
    const idx = this.heldNotes.indexOf(midi);
    if (idx !== -1) this.heldNotes.splice(idx, 1);

    if (!this.ready || !this.ctx) return;

    if (this.heldNotes.length > 0) {
      // Return to previously held note (last-note priority)
      this.activeMidi = this.heldNotes[this.heldNotes.length - 1];
      this.updatePitch(true);
      this.updateKeyTracking();
      return;
    }

    this.gateOpen = false;
    const now = this.ctx.currentTime;
    const decayOn = this.store.getBool("decaySwitchOn");
    const lDecay = mapEnvelopeTime(this.store.get("loudnessDecay"));
    const lRel = decayOn ? Math.max(0.01, lDecay) : Math.max(0.008, Math.min(0.055, lDecay * 0.1));

    const lGain = this.loudnessVca.gain;
    lGain.cancelScheduledValues(now);
    lGain.setValueAtTime(lGain.value, now);
    lGain.setTargetAtTime(0, now, Math.max(0.004, lRel * 0.35));

    const fDecay = mapEnvelopeTime(this.store.get("filterDecay"));
    const fRel = decayOn ? Math.max(0.01, fDecay) : Math.max(0.008, Math.min(0.08, fDecay * 0.12));
    const fOff = this.filterEgSource.offset;
    fOff.cancelScheduledValues(now);
    fOff.setValueAtTime(fOff.value, now);
    fOff.setTargetAtTime(0, now, Math.max(0.004, fRel * 0.35));

    this.ladderNode?.port.postMessage({ type: "noteOff" });
    if (this.fallbackFilter1 && this.fallbackFilter2) {
      const baseHz = mapCutoff(this.store.get("filterCutoff"));
      for (const bf of [this.fallbackFilter1, this.fallbackFilter2]) {
        bf.frequency.cancelScheduledValues(now);
        bf.frequency.setValueAtTime(bf.frequency.value, now);
        bf.frequency.setTargetAtTime(baseHz, now, Math.max(0.005, fRel * 0.35));
      }
    }
  }

  panic(): void {
    this.heldNotes = [];
    this.gateOpen = false;
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.loudnessVca.gain.cancelScheduledValues(now);
    this.loudnessVca.gain.setTargetAtTime(0, now, 0.005);
    this.filterEgSource.offset.cancelScheduledValues(now);
    this.filterEgSource.offset.setTargetAtTime(0, now, 0.005);
    this.ladderNode?.port.postMessage({ type: "reset" });
  }

  getScopeSamples(): Float32Array | null {
    if (!this.ready || !this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.scopeBuffer);
    return this.scopeBuffer;
  }

  syncAll(): void {
    if (!this.ready || !this.ctx) return;
    this.updatePowerAndMain();
    this.updateOscWaveforms();
    this.updatePitch(true);
    this.updateMixer();
    this.updateFilterParams();
    this.updateKeyTracking();
    this.updateModulation();
    this.updateTuner();
    this.updateEffects();
  }

  syncControl(id: ControlId): void {
    if (!this.ready || !this.ctx) return;
    switch (id) {
      case "powerOn":
      case "mainVolume":
      case "isMainActive":
        this.updatePowerAndMain();
        this.updateTuner();
        break;
      case "tunerOn":
        this.updateTuner();
        break;
      case "osc1Waveform":
      case "osc2Waveform":
      case "osc3Waveform":
        this.updateOscWaveforms();
        break;
      case "masterTune":
      case "pitchWheel":
      case "glideOn":
      case "glideTime":
      case "osc1Range":
      case "osc2Range":
      case "osc2Frequency":
      case "osc3Range":
      case "osc3Frequency":
      case "osc3Control":
        this.updatePitch(true);
        break;
      case "osc1Enabled":
      case "osc1Volume":
      case "osc2Enabled":
      case "osc2Volume":
      case "osc3Enabled":
      case "osc3Volume":
      case "noiseEnabled":
      case "noiseVolume":
      case "noiseType":
      case "extEnabled":
      case "extVolume":
        this.updateMixer();
        break;
      case "filterCutoff":
      case "filterEmphasis":
      case "filterContourAmount":
      case "filterAttack":
      case "filterDecay":
      case "filterSustain":
      case "decaySwitchOn":
        this.updateFilterParams();
        break;
      case "keyboardControl1":
      case "keyboardControl2":
        this.updateKeyTracking();
        break;
      case "lfoRate":
      case "lfoWaveform":
      case "modMix":
      case "modWheel":
      case "osc3FilterEgSwitch":
      case "noiseLfoSwitch":
      case "oscillatorModulationOn":
      case "filterModulationOn":
        this.updateModulation();
        break;
      case "effectsVolume":
      case "auxOutputOn":
      case "delayEnabled":
      case "delayMix":
      case "delayTime":
      case "delayFeedback":
      case "reverbEnabled":
      case "reverbMix":
      case "reverbTone":
        this.updateEffects();
        break;
    }
  }

  private updatePowerAndMain(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const power = this.store.getBool("powerOn");
    this.masterPowerGate.gain.setTargetAtTime(power ? 1 : 0, now, 0.015);
    const mainActive = this.store.getBool("isMainActive");
    const mainGain = power && mainActive ? mapVolumeGain(this.store.get("mainVolume")) * 0.9 : 0;
    this.mainDryGain.gain.setTargetAtTime(mainGain, now, 0.01);
  }

  private updateTuner(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const active = this.store.getBool("powerOn") && this.store.getBool("tunerOn");
    this.tunerGain.gain.setTargetAtTime(active ? 0.16 : 0, now, 0.01);
  }

  private updateOscWaveforms(): void {
    if (!this.ctx) return;
    const w1 = OSC12_WAVEFORMS[Math.round(this.store.get("osc1Waveform"))] ?? "sawtooth";
    const w2 = OSC12_WAVEFORMS[Math.round(this.store.get("osc2Waveform"))] ?? "sawtooth";
    const w3 = OSC3_WAVEFORMS[Math.round(this.store.get("osc3Waveform"))] ?? "triangle";
    applyOscWaveform(this.ctx, this.osc1, w1);
    applyOscWaveform(this.ctx, this.osc2, w2);
    applyOscWaveform(this.ctx, this.osc3, w3);
  }

  private updatePitch(allowGlide: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const glide = allowGlide && this.store.getBool("glideOn");
    const tau = glide ? Math.max(0.004, mapGlideTime(this.store.get("glideTime"))) : 0.0025;

    const masterTune = this.store.get("masterTune");
    const pitchBend = mapPitchWheelSemitones(this.store.get("pitchWheel"));

    const r1 = OSC_RANGES[Math.round(this.store.get("osc1Range"))] ?? "8";
    const r2 = OSC_RANGES[Math.round(this.store.get("osc2Range"))] ?? "8";
    const r3 = OSC_RANGES[Math.round(this.store.get("osc3Range"))] ?? "8";

    const hz1 = computeOscHz(this.activeMidi, r1, 0, masterTune, pitchBend, 2.0);
    const hz2 = computeOscHz(this.activeMidi, r2, this.store.get("osc2Frequency"), masterTune, pitchBend, -1.5);
    const osc3Midi = this.store.getBool("osc3Control") ? this.activeMidi : 36; // C2 anchor when free-running
    const hz3 = computeOscHz(osc3Midi, r3, this.store.get("osc3Frequency"), masterTune, pitchBend, 0);

    this.osc1.frequency.setTargetAtTime(hz1, now, tau);
    this.osc2.frequency.setTargetAtTime(hz2, now, tau);
    this.osc3.frequency.setTargetAtTime(hz3, now, this.store.getBool("osc3Control") ? tau : 0.008);
  }

  private updateMixer(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const g1 = this.store.getBool("osc1Enabled") ? mapVolumeGain(this.store.get("osc1Volume")) * 0.52 : 0;
    const g2 = this.store.getBool("osc2Enabled") ? mapVolumeGain(this.store.get("osc2Volume")) * 0.45 : 0;
    const g3 = this.store.getBool("osc3Enabled") ? mapVolumeGain(this.store.get("osc3Volume")) * 0.45 : 0;

    this.osc1Gain.gain.setTargetAtTime(g1, now, 0.008);
    this.osc2Gain.gain.setTargetAtTime(g2, now, 0.008);
    this.osc3Gain.gain.setTargetAtTime(g3, now, 0.008);

    const noiseOn = this.store.getBool("noiseEnabled");
    const isPink = this.store.getBool("noiseType");
    const noiseVol = noiseOn ? mapVolumeGain(this.store.get("noiseVolume")) * 0.42 : 0;
    this.whiteGate.gain.setTargetAtTime(isPink ? 0 : 1, now, 0.008);
    this.pinkGate.gain.setTargetAtTime(isPink ? 1 : 0, now, 0.008);
    this.noiseBusGain.gain.setTargetAtTime(noiseVol, now, 0.008);

    const extVol = this.store.getBool("extEnabled") ? mapVolumeGain(this.store.get("extVolume")) * 0.9 : 0;
    this.extGain.gain.setTargetAtTime(extVol, now, 0.01);
  }

  private updateFilterParams(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const cutoffHz = mapCutoff(this.store.get("filterCutoff"));
    const emphasis = this.store.get("filterEmphasis");
    const contourOct = mapContourOctaves(this.store.get("filterContourAmount"));
    const attackS = mapEnvelopeTime(this.store.get("filterAttack"));
    const decayS = mapEnvelopeTime(this.store.get("filterDecay"));
    const sustain = this.store.get("filterSustain") / 10;
    const decaySwitchOn = this.store.getBool("decaySwitchOn");

    if (this.ladderNode) {
      this.ladderNode.parameters.get("emphasis")?.setTargetAtTime(emphasis, now, 0.008);
      this.ladderNode.port.postMessage({
        type: "params",
        cutoffHz,
        contourOct,
        attackS,
        decayS,
        sustain,
        decaySwitchOn,
      });
    } else if (this.fallbackFilter1 && this.fallbackFilter2) {
      this.fallbackFilter1.frequency.setTargetAtTime(cutoffHz, now, 0.01);
      this.fallbackFilter2.frequency.setTargetAtTime(cutoffHz, now, 0.01);
      const q = (emphasis / 10) * 14;
      this.fallbackFilter1.Q.setTargetAtTime(q * 0.6, now, 0.01);
      this.fallbackFilter2.Q.setTargetAtTime(q * 0.6, now, 0.01);
    }
  }

  private updateKeyTracking(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const oct = computeKeyTrackingOctaves(
      this.activeMidi,
      this.store.getBool("keyboardControl1"),
      this.store.getBool("keyboardControl2"),
    );
    this.keyTrackSource.offset.setTargetAtTime(oct, now, 0.005);
  }

  private updateModulation(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // LFO
    this.lfoOsc.type = this.store.getBool("lfoWaveform") ? "square" : "triangle";
    this.lfoOsc.frequency.setTargetAtTime(mapLfoRate(this.store.get("lfoRate")), now, 0.01);

    // Source 1: 0 = Osc 3, 1 = Filter EG
    const useFilterEg = this.store.getBool("osc3FilterEgSwitch");
    this.osc3ModTapGain.gain.setTargetAtTime(useFilterEg ? 0 : 1, now, 0.008);
    this.filterEgModGain.gain.setTargetAtTime(useFilterEg ? 1 : 0, now, 0.008);

    // Source 2: 0 = Noise, 1 = LFO
    const useLfo = this.store.getBool("noiseLfoSwitch");
    this.noiseModTapGain.gain.setTargetAtTime(useLfo ? 0 : 1.4, now, 0.008);
    this.lfoModGain.gain.setTargetAtTime(useLfo ? 1 : 0, now, 0.008);

    // Mod Mix (0 = 100% Source 1, 10 = 100% Source 2)
    const mix = Math.max(0, Math.min(1, this.store.get("modMix") / 10));
    this.modMixSrc1Gain.gain.setTargetAtTime(1 - mix, now, 0.008);
    this.modMixSrc2Gain.gain.setTargetAtTime(mix, now, 0.008);

    // Mod Wheel depth
    const wheelNorm = Math.max(0, Math.min(1, this.store.get("modWheel") / 100));
    const wheelCurve = Math.pow(wheelNorm, 1.35);
    this.modWheelGain.gain.setTargetAtTime(wheelCurve, now, 0.008);

    // Destinations
    const oscMod = this.store.getBool("oscillatorModulationOn");
    const filtMod = this.store.getBool("filterModulationOn");
    this.oscModDepthGain.gain.setTargetAtTime(oscMod ? 240 : 0, now, 0.008); // cents
    this.filterModDepthGain.gain.setTargetAtTime(filtMod ? 3.2 : 0, now, 0.008); // octaves
  }

  private updateEffects(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const auxOn = this.store.getBool("auxOutputOn");
    const fxVol = auxOn ? mapVolumeGain(this.store.get("effectsVolume")) * 0.9 : 0;
    this.auxSendGain.gain.setTargetAtTime(fxVol, now, 0.01);

    if (this.delayNode) {
      const p = this.delayNode.parameters;
      p.get("enabled")?.setValueAtTime(this.store.getBool("delayEnabled") ? 1 : 0, now);
      p.get("mix")?.setTargetAtTime(this.store.get("delayMix") / 10, now, 0.01);
      p.get("delayTime")?.setTargetAtTime(mapDelayTimeSec(this.store.get("delayTime")), now, 0.015);
      p.get("feedback")?.setTargetAtTime((this.store.get("delayFeedback") / 10) * 0.9, now, 0.01);
    }

    const revOn = this.store.getBool("reverbEnabled");
    const revMix = revOn ? Math.pow(this.store.get("reverbMix") / 10, 1.2) * 0.75 : 0;
    this.reverbWetGain.gain.setTargetAtTime(revMix, now, 0.015);

    // Tone (0..10 -> 650 Hz .. 14 kHz lowpass damping)
    const toneNorm = Math.max(0, Math.min(1, this.store.get("reverbTone") / 10));
    const toneHz = 650 * Math.pow(21.5, toneNorm);
    this.reverbToneFilter.frequency.setTargetAtTime(toneHz, now, 0.015);
  }

  dispose(): void {
    void this.toggleExternalInput(false);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.ready = false;
  }
}
