import type { SynthEngine } from "../audio/engine.ts";
import type { SynthModel } from "../model/synth.ts";
import type { ParamStore } from "../state/paramStore.ts";

// Two-octave QWERTY piano map relative to base octave (default C3 = 48)
const LOWER_ROW: Record<string, number> = {
  KeyZ: 0, // C
  KeyS: 1, // C#
  KeyX: 2, // D
  KeyD: 3, // D#
  KeyC: 4, // E
  KeyV: 5, // F
  KeyG: 6, // F#
  KeyB: 7, // G
  KeyH: 8, // G#
  KeyN: 9, // A
  KeyJ: 10, // A#
  KeyM: 11, // B
  Comma: 12, // C+1
  KeyL: 13,
  Period: 14,
  Semicolon: 15,
  Slash: 16,
};

const UPPER_ROW: Record<string, number> = {
  KeyQ: 12, // C+1
  Digit2: 13, // C#+1
  KeyW: 14, // D+1
  Digit3: 15, // D#+1
  KeyE: 16, // E+1
  KeyR: 17, // F+1
  Digit5: 18, // F#+1
  KeyT: 19, // G+1
  Digit6: 20, // G#+1
  KeyY: 21, // A+1
  Digit7: 22, // A#+1
  KeyU: 23, // B+1
  KeyI: 24, // C+2
  Digit9: 25,
  KeyO: 26,
  Digit0: 27,
  KeyP: 28,
};

export interface QwertyCallbacks {
  onFirstGesture?: () => void;
  onOctaveChange?: (baseMidi: number) => void;
  onViewToggle?: () => void;
  onHingeToggle?: () => void;
  onNoteActivity?: (midi: number | null) => void;
}

export class QwertyInput {
  private baseMidi = 48; // C3
  private downCodes = new Map<string, number>();

  constructor(
    private readonly store: ParamStore,
    private readonly engine: SynthEngine,
    private readonly model: SynthModel,
    private readonly cb: QwertyCallbacks = {},
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseAll);
  }

  getBaseMidi(): number {
    return this.baseMidi;
  }

  shiftOctave(deltaOctaves: number): void {
    const next = Math.max(24, Math.min(72, this.baseMidi + deltaOctaves * 12));
    if (next !== this.baseMidi) {
      this.releaseAll();
      this.baseMidi = next;
      this.cb.onOctaveChange?.(this.baseMidi);
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.isTypingTarget(e.target)) return;

    this.cb.onFirstGesture?.();

    if (e.code === "Escape") {
      this.releaseAll();
      this.engine.panic();
      this.cb.onNoteActivity?.(null);
      return;
    }
    if (e.code === "BracketLeft" || e.code === "Minus") {
      this.shiftOctave(-1);
      return;
    }
    if (e.code === "BracketRight" || e.code === "Equal") {
      this.shiftOctave(1);
      return;
    }
    if (e.code === "ArrowLeft") {
      this.store.set("pitchWheel", 25);
      return;
    }
    if (e.code === "ArrowRight") {
      this.store.set("pitchWheel", 75);
      return;
    }
    if (e.code === "Backquote") {
      this.cb.onViewToggle?.();
      return;
    }

    const offset = LOWER_ROW[e.code] ?? UPPER_ROW[e.code];
    if (offset === undefined) return;
    e.preventDefault();

    const midi = this.baseMidi + offset;
    if (this.downCodes.has(e.code)) return;
    this.downCodes.set(e.code, midi);
    this.model.setKeyPressed(midi, true);
    this.engine.noteOn(midi);
    this.cb.onNoteActivity?.(midi);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      this.store.set("pitchWheel", 50);
      return;
    }
    const midi = this.downCodes.get(e.code);
    if (midi === undefined) return;
    this.downCodes.delete(e.code);
    this.model.setKeyPressed(midi, false);
    this.engine.noteOff(midi);
    const remaining = this.engine.getHeldNotes();
    this.cb.onNoteActivity?.(remaining.length > 0 ? remaining[remaining.length - 1] : null);
  };

  releaseAll = (): void => {
    for (const midi of this.downCodes.values()) {
      this.model.setKeyPressed(midi, false);
      this.engine.noteOff(midi);
    }
    this.downCodes.clear();
  };

  dispose(): void {
    this.releaseAll();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseAll);
  }
}
