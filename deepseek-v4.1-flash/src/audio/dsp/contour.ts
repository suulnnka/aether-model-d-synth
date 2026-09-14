/**
 * Contour (envelope) generator core — reference implementation.
 *
 * Structure per PRD 5.6 AUD-8 and the control table in PRD 6.4:
 *
 *   Attack -> Decay -> hold | zero
 *
 * Attack, Decay and Release times are set independently; there is no sustain
 * *level* knob — the hold value is a fixed high level selected by switches:
 *
 *   Sustain switch ON  ->  hold at HOLD_LEVEL
 *   Sustain switch OFF ->  decay to 0 while the key is still held
 *   Decay switch ON    ->  same "percussive" behaviour, overriding Sustain
 *                          (PRD 6.1 #5)
 *
 * Analog behaviour comes from exponential segments (RC charge / discharge).
 * Each segment is defined to *complete* within its knob time: a stage is
 * finished once it is within -80 dB of its target, so "Attack = 5 ms" reaches
 * the peak in 5 ms and "Release = 400 ms" reaches silence in 400 ms. That
 * makes the knob values honest and lets the acceptance test in PRD 11.3 see an
 * exactly silent engine floor, because release snaps the final -80 dB to zero.
 *
 * Re-triggering starts from the current level (PRD AUD-2) so repeated notes
 * never click.
 *
 * The realtime AudioWorklet ships a numerically identical copy of this file.
 * `tests/ladder-parity.test.ts` executes both and fails if they drift apart.
 */

/** Time constants needed to fall within -80 dB of the target. */
const TIME_CONSTANTS = Math.log(1e4);

/** -80 dB completion threshold (PRD 11.3 uses -80 dB as the silence floor). */
const EPSILON = 1e-4;

/** Fixed sustain level used when the Sustain switch is on (PRD AUD-8). */
export const HOLD_LEVEL = 0.75;

export type ContourStage = 'idle' | 'attack' | 'decay' | 'hold' | 'release';

export class ContourCore {
  private level = 0;
  private stage: ContourStage = 'idle';
  private sampleRate = 48_000;

  private attack = 0.005;
  private decay = 0.3;
  private release = 0.4;
  private hold = HOLD_LEVEL;

  private coefAttack = 1;
  private coefDecay = 1;
  private coefRelease = 1;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.recomputeCoefficients();
  }

  reset(): void {
    this.level = 0;
    this.stage = 'idle';
  }

  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.recomputeCoefficients();
  }

  /** Stage times in seconds (already mapped from the log knobs). */
  setTimes(attack: number, decay: number, release: number): void {
    this.attack = Math.max(1e-4, attack);
    this.decay = Math.max(1e-4, decay);
    this.release = Math.max(1e-4, release);
    this.recomputeCoefficients();
  }

  /** Target level for the end of the decay stage (0 = percussive). */
  setHold(level: number): void {
    this.hold = Math.min(1, Math.max(0, level));
  }

  private recomputeCoefficients(): void {
    // a = 1 - exp(-1 / (tau * fs)), with tau = T / TIME_CONSTANTS so that the
    // segment completes (to -80 dB) in exactly T seconds.
    const fs = this.sampleRate;
    const coef = (seconds: number) =>
      1 - Math.exp(-TIME_CONSTANTS / (Math.max(seconds, 1e-4) * fs));
    this.coefAttack = Math.min(1, coef(this.attack));
    this.coefDecay = Math.min(1, coef(this.decay));
    this.coefRelease = Math.min(1, coef(this.release));
  }

  /** Target hold level currently in force (diagnostics / tests). */
  get holdLevel(): number {
    return this.hold;
  }

  /** Gate edge. True = key (re)triggered from the current level, false = release. */
  setGate(on: boolean): void {
    if (on) {
      this.stage = 'attack';
    } else if (this.stage !== 'idle') {
      this.stage = 'release';
    }
  }

  /** Current output level, 0..1. */
  get current(): number {
    return this.level;
  }

  get currentStage(): ContourStage {
    return this.stage;
  }

  /** Advance one sample and return the level. */
  process(): number {
    switch (this.stage) {
      case 'idle':
        return 0;

      case 'attack': {
        this.level += (1 - this.level) * this.coefAttack;
        // Cream off the last -80 dB without a step: the decay stage continues
        // from wherever the attack actually finished.
        if (Math.abs(1 - this.level) <= EPSILON) this.stage = 'decay';
        return this.level;
      }

      case 'decay': {
        if (this.hold === 0) {
          this.level -= this.level * this.coefDecay;
          if (this.level <= EPSILON) {
            this.level = 0;
            this.stage = 'idle';
          }
          return this.level;
        }
        this.level += (this.hold - this.level) * this.coefDecay;
        // Must be an *absolute* distance: a signed test would report "arrived"
        // the instant the attack peak overshot the sustain level, skipping the
        // whole decay stage.
        if (Math.abs(this.hold - this.level) <= EPSILON) {
          // Land exactly on the sustain level rather than -80 dB away from it,
          // so "hold" is a true fixed level. The corrected step is at most
          // EPSILON (-80 dB), far below the click threshold.
          this.level = this.hold;
          this.stage = 'hold';
        }
        return this.level;
      }

      case 'hold':
        return this.level;

      case 'release': {
        this.level -= this.level * this.coefRelease;
        // Exact zero at the end: the VCA reaches true silence, so the engine
        // floor required by PRD 11.3 is mathematically zero rather than -79 dB.
        if (this.level <= EPSILON) {
          this.level = 0;
          this.stage = 'idle';
        }
        return this.level;
      }
    }
  }

  /**
   * Run the attack stage to completion analytically and report how long it took.
   * Offline tests use this to assert the knob time maps to the real duration.
   */
  samplesToPeak(): number {
    const previous = this.stage;
    this.stage = 'attack';
    let n = 0;
    const limit = Math.ceil(this.sampleRate * 60);
    while (this.stage === 'attack' && n < limit) {
      this.process();
      n += 1;
    }
    if (n >= limit) this.stage = previous;
    return n;
  }
}
