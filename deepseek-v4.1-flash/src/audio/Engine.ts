/**
 * The synthesizer engine (PRD 5.6, PRD 8).
 *
 * Signal flow
 * -----------
 *   Osc-1 ─ level ─┐
 *   Osc-2 ─ level ─┤
 *   Osc-3 ─ level ─┼─ mix bus ─ 4-pole ladder ─ VCA ─ volume ─ DC block ─
 *   Noise ─ level ─┤                                         saturator ─ power ─ out
 *   Ext   ─ level ─┘
 *
 *   Modulation bus:  [Osc-3 tap | Noise tap] crossfaded by Mod Mix
 *                      -> pitch FM  (x Mod Wheel) -> each VCO detune
 *                      -> filter FM (x Mod Wheel, gated by its own switch)
 *
 *   Contours: Loudness contour -> VCA gain
 *             Filter contour   -> Contour Amount (octaves) -> ladder cutoff
 *
 * Two properties of this design matter for the acceptance criteria:
 *
 *  1. The graph is built once and left resident. Playing a note only automates
 *     parameters, so there is no per-note node churn and therefore no click or
 *     scheduling latency (PRD 8.1).
 *  2. The ladder cutoff parameter is expressed in *octaves above 10 Hz*, not in
 *     hertz. That makes key tracking, contour depth and LFO depth linearly
 *     additive on the same parameter, which is both musically correct and
 *     trivially auditable (PRD AUD-7, AUD-9).
 */

import { ParamStore } from '../state/ParamStore.ts';
import {
  defaultPosOf,
  knobSpec,
  spec,
  type KnobSpec,
} from '../state/specs.ts';
import { MIX_BUS_TRIM, clamp } from '../state/range.ts';
import { MonoVoice } from './MonoVoice.ts';
import { asWaveform, periodicWaveFor } from './waveforms.ts';
import { HOLD_LEVEL } from './dsp/contour.ts';
import {
  FILTER_MOD_MAX_OCTAVES,
  PITCH_MOD_MAX_CENTS,
  glideTimeConstant,
  midiToFrequency,
  oscillatorFrequency,
} from './tuning.ts';
import {
  BiquadFilterStage,
  JsContourStage,
  WorkletContourStage,
  WorkletFilterStage,
  LADDER_WORKLET,
  CONTOUR_WORKLET,
  saturationCurve,
  supportsWorklets,
  workletUrl,
  type ContourStage,
  type FilterStage,
} from './stages.ts';
import {
  channelGain,
  contourDepth,
  cutoffOctaves,
  envSeconds,
  keyboardTrack,
  knob010,
  masterGain,
  modMixGains,
  oscCents,
  pitchBendCents,
  tuneCents,
} from './mapping.ts';

/** Parameter smoothing constants (PRD AUD-12). */
const PITCH_SMOOTH = 0.005;
const LEVEL_SMOOTH = 0.012;
const CUTOFF_SMOOTH = 0.008;
const POWER_SMOOTH = 0.006;
/** Control-rate scheduler period for the compatibility path. */
const FALLBACK_TICK_MS = 4;

/** Default key used while no note has ever been played. */
const IDLE_MIDI = 60;

export interface EngineStatus {
  readonly usingWorklet: boolean;
  readonly fallbackReason: string | null;
  readonly sampleRate: number;
}

interface OscUnit {
  readonly node: OscillatorNode;
  readonly level: GainNode;
  /** Pitch-modulation input gain; Osc-3 in LO mode gets 0 to avoid self-modulation. */
  readonly fm: GainNode;
  readonly index: 1 | 2 | 3;
}

const OSC_IDS: readonly (1 | 2 | 3)[] = [1, 2, 3];

export class SynthEngine {
  readonly ctx: AudioContext;
  readonly status: EngineStatus;

  private readonly store: ParamStore;
  private readonly voice = new MonoVoice();
  private readonly disposers: (() => void)[] = [];

  private readonly oscs: OscUnit[] = [];
  private readonly sources = new Map<string, AudioNode>();
  private readonly noiseSource: AudioBufferSourceNode;
  private readonly extGain: GainNode;

  private readonly mixBus: GainNode;
  private readonly filter: FilterStage;
  private readonly contourAmountGain: GainNode;
  private readonly filterModGain: GainNode;
  private readonly pitchModGain: GainNode;
  private readonly modMixOsc3: GainNode;
  private readonly modMixNoise: GainNode;
  private readonly modBus: GainNode;

  private readonly loudContour: ContourStage;
  private readonly filterContour: ContourStage;

  private readonly vca: GainNode;
  private readonly dcBlock: BiquadFilterNode;
  private readonly outputVolume: GainNode;
  private readonly saturator: WaveShaperNode;
  private readonly powerGain: GainNode;
  private readonly pageMuteGain: GainNode;

  private soundingMidi: number | null = null;
  private extSource: AudioBufferSourceNode | null = null;
  private timer: number | null = null;
  private lastTick = 0;
  private disposed = false;

  private constructor(
    ctx: AudioContext,
    store: ParamStore,
    status: EngineStatus,
  ) {
    this.ctx = ctx;
    this.store = store;
    this.status = status;

    /* ------------------------------------------------------------ sources */

    for (const index of OSC_IDS) {
      const node = ctx.createOscillator();
      node.setPeriodicWave(
        periodicWaveFor(ctx, asWaveform(store.option(`osc${index}Wave`))),
      );
      node.frequency.value = 261.63;
      const level = ctx.createGain();
      level.gain.value = 0;
      const fm = ctx.createGain();
      fm.gain.value = 1;
      node.connect(level);
      node.start();
      this.oscs.push({ node, level, fm, index });
    }

    const noiseBuffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 4),
      ctx.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.start();

    this.extGain = ctx.createGain();
    this.extGain.gain.value = 0;

    /* -------------------------------------------------------------- mixer */

    this.mixBus = ctx.createGain();
    this.mixBus.gain.value = MIX_BUS_TRIM;
    this.mixBus.channelCount = 1;
    this.mixBus.channelCountMode = 'explicit';

    this.oscs.forEach((unit, i) => {
      const id = `osc${i + 1}Vol`;
      const level = ctx.createGain();
      level.gain.value = channelGain(store.pos(id));
      unit.level.connect(level);
      level.connect(this.mixBus);
      this.sources.set(id, level);
    });

    const noiseLevel = ctx.createGain();
    noiseLevel.gain.value = channelGain(store.pos('noiseVol'));
    this.noiseSource.connect(noiseLevel);
    noiseLevel.connect(this.mixBus);
    this.sources.set('noiseVol', noiseLevel);

    this.extGain.gain.value = channelGain(store.pos('extVol'));
    this.extGain.connect(this.mixBus);

    /* ------------------------------------------------------------- filter */

    this.filter = status.usingWorklet
      ? new WorkletFilterStage(
          ctx,
          cutoffOctaves(store.pos('cutoff')),
          knob010(store.pos('emphasis')),
        )
      : new BiquadFilterStage(
          ctx,
          cutoffOctaves(store.pos('cutoff')),
          knob010(store.pos('emphasis')),
        );
    this.mixBus.connect(this.filter.input);

    /* ------------------------------------------------------------ contours */

    const contourInit = {
      attack: envSeconds(store.pos('lAttack')),
      decay: envSeconds(store.pos('lDecay')),
      release: envSeconds(store.pos('lRelease')),
      hold: store.flag('lSustain') && !store.flag('decay') ? HOLD_LEVEL : 0,
    };
    this.loudContour = status.usingWorklet
      ? new WorkletContourStage(ctx, contourInit)
      : new JsContourStage(ctx, ctx.sampleRate);

    const filterInit = {
      attack: envSeconds(store.pos('fAttack')),
      decay: envSeconds(store.pos('fDecay')),
      release: envSeconds(store.pos('fRelease')),
      hold: store.flag('fSustain') && !store.flag('decay') ? HOLD_LEVEL : 0,
    };
    this.filterContour = status.usingWorklet
      ? new WorkletContourStage(ctx, filterInit)
      : new JsContourStage(ctx, ctx.sampleRate);

    this.contourAmountGain = ctx.createGain();
    this.contourAmountGain.gain.value = contourDepth(store.pos('contourAmount'));

    /* -------------------------------------------------------- modulation */

    this.modMixOsc3 = ctx.createGain();
    this.modMixNoise = ctx.createGain();
    this.modBus = ctx.createGain();
    this.pitchModGain = ctx.createGain();
    this.filterModGain = ctx.createGain();

    const [osc3Mix, noiseMix] = modMixGains(store.pos('modMix'));
    this.modMixOsc3.gain.value = osc3Mix;
    this.modMixNoise.gain.value = noiseMix;
    this.pitchModGain.gain.value = 0;
    this.filterModGain.gain.value = 0;

    // Osc-3's own output is the modulation source (PRD 8.5) and the noise
    // generator doubles as the random modulation source.
    this.oscs[2].node.connect(this.modMixOsc3);
    this.noiseSource.connect(this.modMixNoise);
    this.modMixOsc3.connect(this.modBus);
    this.modMixNoise.connect(this.modBus);
    this.modBus.connect(this.pitchModGain);
    this.modBus.connect(this.filterModGain);

    this.oscs.forEach((unit) => {
      this.pitchModGain.connect(unit.fm);
      unit.fm.connect(unit.node.detune);
    });

    /* -------------------------------------------------------------- output */

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;

    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = 'highpass';
    this.dcBlock.frequency.value = 8;
    this.dcBlock.Q.value = 0.7;

    this.outputVolume = ctx.createGain();
    this.outputVolume.gain.value = masterGain(store.pos('volume'));

    this.saturator = ctx.createWaveShaper();
    this.saturator.curve = saturationCurve();
    this.saturator.oversample = '2x';

    this.powerGain = ctx.createGain();
    this.powerGain.gain.value = store.flag('power') ? 1 : 0;

    this.pageMuteGain = ctx.createGain();
    this.pageMuteGain.gain.value = 1;

    this.filter.output.connect(this.vca);
    this.vca.connect(this.dcBlock);
    this.dcBlock.connect(this.outputVolume);
    this.outputVolume.connect(this.saturator);
    this.saturator.connect(this.powerGain);
    this.powerGain.connect(this.pageMuteGain);
    this.pageMuteGain.connect(ctx.destination);

    // Modulation destinations that only exist on the worklet path.
    const cutoffParam = this.filter.modulationInput;
    if (cutoffParam) {
      this.filterContour.output.connect(this.contourAmountGain);
      this.contourAmountGain.connect(cutoffParam);
      this.filterModGain.connect(cutoffParam);
      this.loudContour.output.connect(this.vca.gain);
    }

    /* --------------------------------------------------------- subscriber */

    this.bind();
    this.applyInitialState();

    if (!status.usingWorklet) {
      this.lastTick = ctx.currentTime;
      this.timer = window.setInterval(
        () => this.controlTick(),
        FALLBACK_TICK_MS,
      );
    }
  }

  static async create(store: ParamStore): Promise<SynthEngine> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });

    let usingWorklet = supportsWorklets(ctx);
    let fallbackReason: string | null = null;

    if (usingWorklet) {
      try {
        await ctx.audioWorklet.addModule(workletUrl(LADDER_WORKLET));
        await ctx.audioWorklet.addModule(workletUrl(CONTOUR_WORKLET));
      } catch (error) {
        usingWorklet = false;
        fallbackReason =
          error instanceof Error ? error.message : 'AudioWorklet unavailable';
      }
    } else {
      fallbackReason = 'AudioWorklet unavailable';
    }

    if (ctx.state === 'suspended') await ctx.resume();

    return new SynthEngine(ctx, store, {
      usingWorklet,
      fallbackReason,
      sampleRate: ctx.sampleRate,
    });
  }

  /* ==================================================================== */
  /* Note events                                                           */
  /* ==================================================================== */

  noteOn(midi: number): void {
    if (this.disposed) return;
    const time = this.ctx.currentTime;
    const decision = this.voice.noteOn(midi);
    if (!decision.gateOn) return;

    this.soundingMidi = decision.note;
    this.applyPitch(time);
    this.updateKeyTrack(time);

    if (decision.retrigger) {
      this.loudContour.trigger(time);
      this.filterContour.trigger(time);
    }
  }

  noteOff(midi: number): void {
    if (this.disposed) return;
    const time = this.ctx.currentTime;
    const decision = this.voice.noteOff(midi);

    if (decision.gateOn && decision.note !== null) {
      // Fallback to a still-held key: re-pitch, do not re-trigger (PRD AUD-1).
      this.soundingMidi = decision.note;
      this.applyPitch(time);
      this.updateKeyTrack(time);
      return;
    }

    if (decision.note === null) {
      this.loudContour.release(time);
      this.filterContour.release(time);
    }
  }

  /** All notes off (PRD INT-9, INT-11). Safe to call at any time. */
  panic(): void {
    if (this.disposed) return;
    const time = this.ctx.currentTime;
    this.voice.panic();
    this.loudContour.release(time);
    this.filterContour.release(time);
  }

  get soundingNote(): number | null {
    return this.voice.sounding;
  }

  /* ==================================================================== */
  /* Transport / output                                                    */
  /* ==================================================================== */

  setPageMuted(muted: boolean): void {
    this.pageMuteGain.gain.setTargetAtTime(
      muted ? 0 : 1,
      this.ctx.currentTime,
      POWER_SMOOTH,
    );
  }

  /**
   * External input channel (PRD AUD-15). The node is mixed in through the Ext
   * In fader; nothing is connected in V1, which is why the fader is documented
   * as "visual only" until a source is supplied.
   */
  setExternalSource(node: AudioNode | null): void {
    node?.connect(this.extGain);
  }

  /** Load a local audio file and loop it through the external input. */
  async loadExternalFile(file: File): Promise<void> {
    const bytes = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(bytes);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    this.extSource?.disconnect();
    this.extSource = source;
    source.connect(this.extGain);
  }

  /* ==================================================================== */
  /* Store binding                                                         */
  /* ==================================================================== */

  private bind(): void {
    const on = (id: string, fn: () => void): void => {
      this.disposers.push(this.store.subscribe(id, fn));
    };
    const time = (): number => this.ctx.currentTime;

    // Wave shapes live on the oscillator nodes.
    for (const index of OSC_IDS) {
      on(`osc${index}Wave`, () => {
        const unit = this.oscs[index - 1];
        unit.node.setPeriodicWave(
          periodicWaveFor(
            this.ctx,
            asWaveform(this.store.option(`osc${index}Wave`)),
          ),
        );
      });
      on(`osc${index}Range`, () => {
        this.applyPitch(time());
        this.updateKeyTrack(time());
        this.updateFmGate();
      });
      on(`osc${index}Frequency`, () => {
        this.applyPitch(time());
        this.updateFmGate();
      });
      on(`osc${index}Vol`, () => {
        this.setGain(
          this.sources.get(`osc${index}Vol`),
          channelGain(this.store.pos(`osc${index}Vol`)),
        );
      });
    }

    on('noiseVol', () => {
      this.setGain(this.sources.get('noiseVol'), channelGain(this.store.pos('noiseVol')));
    });
    on('extVol', () => {
      this.setGain(this.extGain, channelGain(this.store.pos('extVol')));
    });

    on('osc3Control', () => {
      this.applyPitch(time());
      this.updateFmGate();
    });

    on('tune', () => this.applyPitch(time()));
    on('pitchWheel', () => this.applyPitch(time()));

    on('cutoff', () => {
      this.filter.setCutoffOctaves(cutoffOctaves(this.store.pos('cutoff')), time());
    });
    on('emphasis', () => {
      this.filter.setEmphasis(knob010(this.store.pos('emphasis')), time());
    });
    on('kc1', () => this.updateKeyTrack(time()));
    on('kc2', () => this.updateKeyTrack(time()));
    on('contourAmount', () => {
      this.contourAmountGain.gain.setTargetAtTime(
        contourDepth(this.store.pos('contourAmount')),
        time(),
        CUTOFF_SMOOTH,
      );
    });

    // Contour timing and hold levels.
    for (const [prefix, contour] of [
      ['l', this.loudContour],
      ['f', this.filterContour],
    ] as const) {
      const update = (): void => {
        contour.setTimes(
          envSeconds(this.store.pos(`${prefix}Attack`)),
          envSeconds(this.store.pos(`${prefix}Decay`)),
          envSeconds(this.store.pos(`${prefix}Release`)),
        );
      };
      on(`${prefix}Attack`, update);
      on(`${prefix}Decay`, update);
      on(`${prefix}Release`, update);
      const hold = (): void => {
        contour.setHold(
          this.store.flag(`${prefix}Sustain`) && !this.store.flag('decay')
            ? HOLD_LEVEL
            : 0,
        );
      };
      on(`${prefix}Sustain`, hold);
      on('decay', hold);
    }
    // The Decay switch also acts on the other contour via the two calls above;
    // register once more for the filter contour so both stay in sync.
    on('decay', () => {
      this.filterContour.setHold(
        this.store.flag('fSustain') && !this.store.flag('decay') ? HOLD_LEVEL : 0,
      );
    });

    // Modulation.
    on('modMix', () => {
      const [osc3, noise] = modMixGains(this.store.pos('modMix'));
      this.modMixOsc3.gain.setTargetAtTime(osc3, time(), LEVEL_SMOOTH);
      this.modMixNoise.gain.setTargetAtTime(noise, time(), LEVEL_SMOOTH);
    });
    on('modWheel', () => this.updateModDepth(time()));
    on('modulation', () => this.updateModDepth(time()));
    on('filterMod', () => this.updateModDepth(time()));

    // Output.
    on('volume', () => {
      this.outputVolume.gain.setTargetAtTime(
        masterGain(this.store.pos('volume')),
        time(),
        LEVEL_SMOOTH,
      );
    });
    on('power', () => {
      this.powerGain.gain.setTargetAtTime(
        this.store.flag('power') ? 1 : 0,
        time(),
        POWER_SMOOTH,
      );
    });
  }

  /** Push every stored value into the graph once, without smoothing. */
  private applyInitialState(): void {
    const time = this.ctx.currentTime;
    for (const index of OSC_IDS) {
      this.setGain(
        this.sources.get(`osc${index}Vol`),
        channelGain(this.store.pos(`osc${index}Vol`)),
        0,
      );
    }
    this.setGain(
      this.sources.get('noiseVol'),
      channelGain(this.store.pos('noiseVol')),
      0,
    );
    this.setGain(this.extGain, channelGain(this.store.pos('extVol')), 0);
    this.filter.setCutoffOctaves(cutoffOctaves(this.store.pos('cutoff')), time);
    this.filter.setEmphasis(knob010(this.store.pos('emphasis')), time);
    this.contourAmountGain.gain.value = contourDepth(
      this.store.pos('contourAmount'),
    );
    this.updateModDepth(time, true);
    this.updateFmGate();
    this.applyPitch(time, true);
    this.updateKeyTrack(time);
  }

  private setGain(
    node: AudioNode | undefined,
    value: number,
    smooth = LEVEL_SMOOTH,
  ): void {
    if (!(node instanceof GainNode)) return;
    if (smooth <= 0) node.gain.value = value;
    else node.gain.setTargetAtTime(value, this.ctx.currentTime, smooth);
  }

  /* ==================================================================== */
  /* Derived values                                                        */
  /* ==================================================================== */

  /**
   * Recompute oscillator pitch. The key frequency lands on `frequency` (so it
   * can glide with `setTargetAtTime`, PRD 8.4) while every cents-domain offset
   * lands on `detune` (so it can be modulated additively by the FM bus).
   */
  private applyPitch(time: number, immediate = false): void {
    const keyMidi = this.soundingMidi ?? IDLE_MIDI;
    const keyHz = midiToFrequency(keyMidi, 0);
    const tune = tuneCents(this.store.pos('tune'));
    const bend = pitchBendCents(this.store.pos('pitchWheel'));
    const glide = glideTimeConstant(this.store.pos('glide'));

    for (const unit of this.oscs) {
      const index = unit.index;
      const range = this.store.option(`osc${index}Range`);
      const tracked = index === 3 ? this.store.flag('osc3Control') : true;
      const cents = oscCents(this.store.pos(`osc${index}Frequency`));
      const loFreeRun = range === 'lo' && !tracked;

      const hz = oscillatorFrequency({
        keyHz,
        range,
        keyboardTracked: tracked,
        cents: loFreeRun ? cents : 0,
      });

      if (immediate) {
        unit.node.frequency.cancelScheduledValues(time);
        unit.node.frequency.setValueAtTime(hz, time);
      } else {
        unit.node.frequency.cancelScheduledValues(time);
        unit.node.frequency.setTargetAtTime(hz, time, glide);
      }

      const detune = tune + bend + (loFreeRun ? 0 : cents);
      unit.node.detune.cancelScheduledValues(time);
      unit.node.detune.setTargetAtTime(detune, time, PITCH_SMOOTH);
    }
  }

  private updateKeyTrack(time: number): void {
    const octaves = keyboardTrack(
      this.soundingMidi,
      this.store.flag('kc1'),
      this.store.flag('kc2'),
    );
    this.filter.setKeyTrackOctaves(octaves, time);
  }

  private updateFmGate(): void {
    for (const unit of this.oscs) {
      if (unit.index !== 3) continue;
      // Osc-3 in LO mode must not receive its own modulation (PRD 8.5).
      const selfModulating = this.store.option('osc3Range') === 'lo';
      unit.fm.gain.setTargetAtTime(
        selfModulating ? 0 : 1,
        this.ctx.currentTime,
        LEVEL_SMOOTH,
      );
    }
  }

  private updateModDepth(time: number, immediate = false): void {
    const wheel = this.store.pos('modWheel');
    const busOn = this.store.flag('modulation');
    const pitchDepth = busOn ? wheel * PITCH_MOD_MAX_CENTS : 0;
    const filterDepth =
      busOn && this.store.flag('filterMod')
        ? wheel * FILTER_MOD_MAX_OCTAVES
        : 0;

    const apply = (param: AudioParam, value: number): void => {
      if (immediate) {
        param.cancelScheduledValues(time);
        param.value = value;
        return;
      }
      param.setTargetAtTime(value, time, LEVEL_SMOOTH);
    };
    apply(this.pitchModGain.gain, pitchDepth);
    apply(this.filterModGain.gain, filterDepth);
  }

  /* ==================================================================== */
  /* Compatibility path control-rate loop (PRD 8.6)                        */
  /* ==================================================================== */

  private controlTick(): void {
    if (this.disposed) return;
    const time = this.ctx.currentTime;
    const delta = Math.max(0, time - this.lastTick);
    this.lastTick = time;

    this.loudContour.tick(time, delta);
    this.filterContour.tick(time, delta);

    if (this.loudContour instanceof JsContourStage) {
      this.vca.gain.setTargetAtTime(
        this.loudContour.current(),
        time,
        FALLBACK_TICK_MS / 1000,
      );
    }

    const biquad = this.filter;
    if (biquad instanceof BiquadFilterStage) {
      // Filter modulation normally rides an audio-rate connection that a native
      // Biquad cannot accept, so the fallback folds the contour and the LFO
      // approximation into the cutoff at control rate.
      biquad.setContourOctaves(
        this.filterContour.current() *
          contourDepth(this.store.pos('contourAmount')),
      );
      const wheel = this.store.pos('modWheel');
      const busOn = this.store.flag('modulation');
      biquad.setModOctaves(
        busOn && this.store.flag('filterMod')
          ? wheel * FILTER_MOD_MAX_OCTAVES * this.approxModValue()
          : 0,
      );
    }
    this.filter.tick(time);
  }

  private approxModPhase = 0;

  /**
   * Cheap stand-in for the modulation bus on the fallback path: a sine LFO when
   * Mod Mix points at Osc-3, white noise when it points at Noise.
   */
  private approxModValue(): number {
    const mix = knob010(this.store.pos('modMix')) / 10;
    const range = this.store.option('osc3Range');
    const tracked = this.store.flag('osc3Control');
    const cents = oscCents(this.store.pos('osc3Frequency'));
    const hz = oscillatorFrequency({
      keyHz: midiToFrequency(this.soundingMidi ?? IDLE_MIDI, 0),
      range,
      keyboardTracked: tracked,
      cents,
    });
    const dt = FALLBACK_TICK_MS / 1000;
    this.approxModPhase = (this.approxModPhase + hz * dt) % 1;
    const lfo = Math.sin(this.approxModPhase * Math.PI * 2);
    const noise = Math.random() * 2 - 1;
    return lfo * (1 - mix) + noise * mix;
  }

  /* ==================================================================== */

  /**
   * Spin the render loop's idle time into a safety check: any stuck gate is
   * released. Belt and braces alongside the document-level listeners (INT-9).
   */
  enforceSilence(): void {
    if (this.voice.isGateOpen) return;
    /* nothing to do; kept as a hook for future watchdogs */
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    for (const unit of this.oscs) {
      try {
        unit.node.stop();
      } catch {
        /* already stopped */
      }
      unit.node.disconnect();
    }
    this.noiseSource.stop();
    this.noiseSource.disconnect();
    this.extSource?.disconnect();
    this.filter.dispose();
    this.loudContour.dispose();
    this.filterContour.dispose();
    void this.ctx.close();
  }
}

/* ---------------------------------------------------------------------------
 * Small helpers used by the UI as well.
 * ------------------------------------------------------------------------- */

/** Factory position of any knob, for tooltips and reset buttons. */
export function knobDefaultPos(id: string): number {
  return defaultPosOf(knobSpec(id) as KnobSpec);
}

/** Clamp helper exposed for the interaction layer. */
export function clampPos(value: number): number {
  return clamp(value, 0, 1);
}

/** Human-readable name for the engine's current filter mode (PRD 8.6). */
export function filterModeLabel(status: EngineStatus): string {
  return status.usingWorklet ? '梯形滤波器（Worklet）' : '过滤器：兼容模式';
}

/** Exported for the UI so a control's spec and value can be rendered together. */
export { spec };
