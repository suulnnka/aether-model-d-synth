/**
 * Audio graph building blocks shared by the main (AudioWorklet) signal path
 * and the compatibility fallback required by PRD AUD-6 / PRD 8.6.
 *
 * Two families of stages exist:
 *
 *   FilterStage  — the 4-pole ladder, either as the nonlinear worklet or as a
 *                  cascade of four BiquadFilter lowshelf-less lowpasses that
 *                  approximates the response but cannot self-oscillate.
 *   ContourStage — the A/D/S/R generator, either as an audio-rate worklet (so
 *                  re-triggering can start from the current level) or as a
 *                  control-rate JS envelope for the fallback path.
 *
 * The engine picks a family once, at boot, and never mixes them.
 */

import { cutoffParamToHz } from './dsp/ladder.ts';
import { ContourCore, HOLD_LEVEL } from './dsp/contour.ts';

/* ===========================================================================
 * Worklet asset resolution
 * ========================================================================= */

/**
 * Resolve a worklet module URL. Processors live in `public/worklets/` so they
 * are shipped verbatim, are never rewritten by the bundler, and are served from
 * the same origin (PRD 9: no external runtime requests).
 */
export function workletUrl(file: string): string {
  const base = import.meta.env.BASE_URL || './';
  return new URL(`${base}worklets/${file}`, document.baseURI).href;
}

export const LADDER_WORKLET = 'aether-ladder.worklet.js';
export const CONTOUR_WORKLET = 'aether-contour.worklet.js';

/** True when the runtime can host our AudioWorklet processors. */
export function supportsWorklets(ctx: BaseAudioContext): boolean {
  return typeof AudioWorkletNode !== 'undefined' && !!ctx.audioWorklet;
}

/* ===========================================================================
 * Filter stages
 * ========================================================================= */

export interface FilterStage {
  /** Node to connect the mixer bus into. */
  readonly input: AudioNode;
  /** Node that the VCA should be fed from. */
  readonly output: AudioNode;
  /** AudioParam that accepts *octave* modulation, or null on the fallback. */
  readonly modulationInput: AudioParam | null;
  /** Base cutoff in octaves above 10 Hz (PRD 6.4 #21). */
  setCutoffOctaves(octaves: number, time: number): void;
  setEmphasis(emphasis: number, time: number): void;
  /** Key tracking, already summed in octaves (PRD AUD-7). */
  setKeyTrackOctaves(octaves: number, time: number): void;
  /** Control-rate tick; only the fallback needs it. */
  tick(time: number): void;
  readonly usesWorklet: boolean;
  dispose(): void;
}

const SMOOTH = 0.008;

/** Realtime ladder running in an AudioWorklet. */
export class WorkletFilterStage implements FilterStage {
  readonly usesWorklet = true;
  private readonly node: AudioWorkletNode;
  private readonly cutoffParam: AudioParam;
  private readonly emphasisParam: AudioParam;
  private keyTrackOctaves = 0;
  private baseOctaves: number;

  constructor(
    ctx: AudioContext,
    initialOctaves: number,
    initialEmphasis: number,
  ) {
    this.baseOctaves = initialOctaves;
    this.node = new AudioWorkletNode(ctx, 'aether-ladder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: {
        cutoffHz: cutoffParamToHz(initialOctaves),
        emphasis: initialEmphasis,
      },
    });
    const cutoff = this.node.parameters.get('cutoff');
    const emphasis = this.node.parameters.get('emphasis');
    if (!cutoff || !emphasis) {
      throw new Error('ladder worklet is missing its parameters');
    }
    this.cutoffParam = cutoff;
    this.emphasisParam = emphasis;
    this.cutoffParam.value = initialOctaves + this.keyTrackOctaves;
    this.emphasisParam.value = initialEmphasis;
  }

  get input(): AudioNode {
    return this.node;
  }

  get output(): AudioNode {
    return this.node;
  }

  /** The cutoff AudioParam doubles as the modulation bus destination. */
  get modulationInput(): AudioParam | null {
    return this.cutoffParam;
  }

  setCutoffOctaves(octaves: number, time: number): void {
    this.baseOctaves = octaves;
    this.applyCutoff(time);
  }

  setKeyTrackOctaves(octaves: number, time: number): void {
    if (octaves === this.keyTrackOctaves) return;
    this.keyTrackOctaves = octaves;
    this.applyCutoff(time);
  }

  private applyCutoff(time: number): void {
    // Base + key tracking live in the parameter's intrinsic value; the contour
    // and LFO signals are summed in through connections (PRD 8.2).
    const target = this.baseOctaves + this.keyTrackOctaves;
    this.cutoffParam.cancelScheduledValues(time);
    this.cutoffParam.setTargetAtTime(target, time, SMOOTH);
  }

  setEmphasis(emphasis: number, time: number): void {
    this.emphasisParam.cancelScheduledValues(time);
    this.emphasisParam.setTargetAtTime(emphasis, time, SMOOTH);
  }

  tick(): void {
    /* the worklet smooths internally */
  }

  dispose(): void {
    this.node.disconnect();
  }
}

/**
 * Compatibility path: four cascaded 2-pole lowpasses = 24 dB/oct.
 *
 * Cutoff is converted from octaves to Hz on the main thread at control rate
 * because a native BiquadFilter's frequency is linear in Hz and cannot receive
 * exponential modulation through a connection. No self-oscillation: that is the
 * documented limitation (PRD 8.6).
 */
export class BiquadFilterStage implements FilterStage {
  readonly usesWorklet = false;
  private readonly filters: BiquadFilterNode[] = [];
  private readonly emphasisToQ = 1.0;

  private baseOctaves: number;
  private keyTrackOctaves = 0;
  private emphasis: number;
  private contourOctaves = 0;
  private modOctaves = 0;

  constructor(ctx: BaseAudioContext, octaves: number, emphasis: number) {
    this.baseOctaves = octaves;
    this.emphasis = emphasis;
    for (let i = 0; i < 4; i += 1) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      this.filters.push(filter);
      if (i > 0) this.filters[i - 1].connect(filter);
    }
  }

  get input(): AudioNode {
    return this.filters[0];
  }

  get output(): AudioNode {
    return this.filters[this.filters.length - 1];
  }

  get modulationInput(): AudioParam | null {
    return null;
  }

  setCutoffOctaves(octaves: number): void {
    this.baseOctaves = octaves;
  }

  setEmphasis(emphasis: number): void {
    this.emphasis = emphasis;
  }

  setKeyTrackOctaves(octaves: number): void {
    this.keyTrackOctaves = octaves;
  }

  /** Additive contour contribution in octaves (control-rate stand-in). */
  setContourOctaves(octaves: number): void {
    this.contourOctaves = octaves;
  }

  /** Additive modulation contribution in octaves. */
  setModOctaves(octaves: number): void {
    this.modOctaves = octaves;
  }

  tick(time: number): void {
    const octaves = this.baseOctaves + this.keyTrackOctaves +
      this.contourOctaves + this.modOctaves;
    const hz = Math.min(Math.max(cutoffParamToHz(octaves), 10), 18_000);
    // Spread the resonance across the cascade; four stages each with modest Q
    // gives a resonant peak without the self-oscillation the ladder provides.
    const q = 0.7 + Math.pow(this.emphasis / 10, 1.4) * 6 * this.emphasisToQ;
    for (const filter of this.filters) {
      filter.frequency.setTargetAtTime(hz, time, SMOOTH);
      filter.Q.setTargetAtTime(q, time, SMOOTH);
    }
  }

  dispose(): void {
    for (const filter of this.filters) filter.disconnect();
  }
}

/* ===========================================================================
 * Contour stages
 * ========================================================================= */

export interface ContourStage {
  /** Audio-rate control signal output (0..1). */
  readonly output: AudioNode;
  setTimes(attack: number, decay: number, release: number): void;
  setHold(level: number): void;
  /** Re-trigger from the current level (PRD AUD-2). */
  trigger(time: number): void;
  release(time: number): void;
  /** Control-rate tick with the elapsed delta; JS fallback only. */
  tick(time: number, delta: number): void;
  /** Current level — needed by the fallback for its control-rate modulation. */
  current(): number;
  dispose(): void;
}

/** Audio-rate contour in a worklet; gate is an a-rate parameter. */
export class WorkletContourStage implements ContourStage {
  private readonly node: AudioWorkletNode;
  private readonly gateParam: AudioParam;
  private readonly attackParam: AudioParam;
  private readonly decayParam: AudioParam;
  private readonly releaseParam: AudioParam;
  private readonly holdParam: AudioParam;
  /** One sample period: the shortest dip that guarantees an observed edge. */
  private readonly edgeDip: number;

  constructor(
    ctx: AudioContext,
    initial: { attack: number; decay: number; release: number; hold: number },
  ) {
    this.edgeDip = 1 / ctx.sampleRate;
    this.node = new AudioWorkletNode(ctx, 'aether-contour', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const get = (name: string): AudioParam => {
      const param = this.node.parameters.get(name);
      if (!param) throw new Error(`contour worklet missing ${name}`);
      return param;
    };
    this.gateParam = get('gate');
    this.attackParam = get('attack');
    this.decayParam = get('decay');
    this.releaseParam = get('release');
    this.holdParam = get('hold');
    this.gateParam.value = 0;
    this.setTimes(initial.attack, initial.decay, initial.release);
    this.holdParam.value = initial.hold;
  }

  get output(): AudioNode {
    return this.node;
  }

  setTimes(attack: number, decay: number, release: number): void {
    const now = this.node.context.currentTime;
    this.attackParam.setValueAtTime(attack, now);
    this.decayParam.setValueAtTime(decay, now);
    this.releaseParam.setValueAtTime(release, now);
  }

  setHold(level: number): void {
    this.holdParam.setValueAtTime(
      level > 0 ? HOLD_LEVEL : 0,
      this.node.context.currentTime,
    );
  }

  trigger(time: number): void {
    // A single-sample dip guarantees the worklet observes a rising edge even
    // when the voice is already sounding (a new key pressed while another is
    // held must re-trigger, per PRD AUD-2).
    this.gateParam.cancelScheduledValues(time);
    this.gateParam.setValueAtTime(0, time);
    this.gateParam.setValueAtTime(1, time + this.edgeDip);
  }

  release(time: number): void {
    this.gateParam.cancelScheduledValues(time);
    this.gateParam.setValueAtTime(0, time);
  }

  tick(): void {
    /* the worklet advances itself */
  }

  current(): number {
    return 0;
  }

  dispose(): void {
    this.node.disconnect();
  }
}

/**
 * Control-rate envelope for the compatibility path.
 *
 * Driven by the engine's 4 ms scheduler. Slower than the audio-rate worklet but
 * functional, and it keeps every acceptance behaviour (sustain switch, decay
 * override, re-trigger from the current level, exact silence) intact.
 */
export class JsContourStage implements ContourStage {
  /** Silent placeholder so the engine can treat both contour kinds alike. */
  readonly output: GainNode;
  private readonly core: ContourCore;
  private readonly sampleRate: number;
  private gateOpen = false;

  constructor(ctx: BaseAudioContext, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.core = new ContourCore(sampleRate);
    this.output = ctx.createGain();
    this.output.gain.value = 0;
  }

  setTimes(attack: number, decay: number, release: number): void {
    this.core.setTimes(attack, decay, release);
  }

  setHold(level: number): void {
    this.core.setHold(level > 0 ? HOLD_LEVEL : 0);
  }

  trigger(): void {
    this.core.setGate(true);
    this.gateOpen = true;
  }

  release(): void {
    this.core.setGate(false);
    this.gateOpen = false;
  }

  tick(_time: number, delta: number): void {
    const steps = Math.max(1, Math.round(delta * this.sampleRate));
    for (let i = 0; i < steps; i += 1) this.core.process();
  }

  current(): number {
    return this.core.current;
  }

  get isGateOpen(): boolean {
    return this.gateOpen;
  }

  dispose(): void {
    this.output.disconnect();
  }
}

/* ===========================================================================
 * Output soft-saturation curve (PRD AUD-12)
 * ========================================================================= */

/**
 * tanh transfer curve normalised for unit small-signal gain, so quiet material
 * passes through untouched while peaks compress the way a transistor stage
 * would. The cubic term adds the gentle high-order content that reads as
 * "analog" without becoming audible distortion, and stays odd-order so it can
 * never introduce a DC offset.
 */
export function saturationCurve(
  length = 2048,
  drive = 1.3,
  cubic = 0.02,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const x = (i / (length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / drive + cubic * x * x * x;
  }
  return curve;
}
