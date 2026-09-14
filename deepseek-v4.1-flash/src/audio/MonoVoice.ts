/**
 * Monophonic note priority (PRD AUD-1).
 *
 * The instrument is deliberately monophonic: it always sounds the key that was
 * pressed *last*, and when that key is released it falls back to the last key
 * that is still held. Releasing back to a held note re-pitches the running
 * voice — it does not re-trigger the contours, which matches how the hardware
 * behaves and is what PRD AUD-2 specifies (contours re-trigger on a new
 * key press, not on a fallback).
 *
 * Kept free of Web Audio so the exact behaviour asserted in PRD 11.4
 * ("multiple keys down / released out of order") can be unit tested directly.
 */

export interface VoiceDecision {
  /** Whether the gate should be high after this event. */
  readonly gateOn: boolean;
  /** Whether the contours should re-trigger from their current level. */
  readonly retrigger: boolean;
  /** The note that is sounding now, or null when the voice is released. */
  readonly note: number | null;
}

const RELEASE: VoiceDecision = Object.freeze({
  gateOn: false,
  retrigger: false,
  note: null,
});

export class MonoVoice {
  /** Press order; the last entry is the sounding note. */
  private stack: number[] = [];

  get sounding(): number | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  /** Held keys, oldest first. */
  get held(): readonly number[] {
    return this.stack;
  }

  get isGateOpen(): boolean {
    return this.stack.length > 0;
  }

  noteOn(midi: number): VoiceDecision {
    // A repeat of an already-held key means a genuine re-press (auto-repeat is
    // filtered at the input layer), so it moves to the top and re-triggers.
    const existing = this.stack.indexOf(midi);
    if (existing >= 0) this.stack.splice(existing, 1);
    this.stack.push(midi);
    return { gateOn: true, retrigger: true, note: midi };
  }

  noteOff(midi: number): VoiceDecision {
    const index = this.stack.indexOf(midi);
    if (index < 0) return this.snapshotDecision(false);
    this.stack.splice(index, 1);
    if (this.stack.length === 0) return RELEASE;
    // Fall back to the still-held key; pitch glides, contours keep running.
    return { gateOn: true, retrigger: false, note: this.sounding };
  }

  /** All notes off (PRD INT-9 / INT-11). Idempotent. */
  panic(): VoiceDecision {
    if (this.stack.length === 0) return RELEASE;
    this.stack.length = 0;
    return RELEASE;
  }

  private snapshotDecision(retrigger: boolean): VoiceDecision {
    return { gateOn: this.isGateOpen, retrigger, note: this.sounding };
  }
}
