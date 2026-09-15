/**
 * 电脑键盘演奏映射(PRD §16,照抄参考实现):
 * A S D F G H J K L ; ' = 白键半音上行(基准 C4);W E T Y U O P = 黑键;
 * Q = 基准音下方大二度;Z/X = 八度移位;1/2 = 弯音下/上(按住生效);
 * 3–8 = 调制深度 0/20/40/60/80/100%;V/H = 视角切换 / 面板立起-放平。
 */
import type { ParamStore } from "../state/paramStore";
import type { SynthEngine } from "../audio/engine";
import type { Interactions } from "../interaction/interactions";
import { bendSemitones } from "../audio/mapping";

export const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, s: 2, d: 4, f: 5, g: 7, h: 9, j: 11, k: 12, l: 14, ";": 16, "'": 17,
  w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15,
  q: -1,
};

const MOD_KEYS: Record<string, number> = {
  "3": 0, "4": 20, "5": 40, "6": 60, "7": 80, "8": 100,
};

const OCTAVE_MIN = -4;
const OCTAVE_MAX = 3;

export interface QwertyHooks {
  onViewToggle(): void;
  onHingeToggle(): void;
}

export class QweryInput {
  private store: ParamStore;
  private engine: SynthEngine;
  private interactions: Interactions;
  private hooks: QwertyHooks;
  private octaveOffset = 0;
  private heldKeys = new Map<string, number>();
  private bendDown = false;
  private bendUp = false;

  constructor(
    store: ParamStore,
    engine: SynthEngine,
    interactions: Interactions,
    hooks: QwertyHooks,
  ) {
    this.store = store;
    this.engine = engine;
    this.interactions = interactions;
    this.hooks = hooks;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseAll);
  }

  /** 事件是否应被合成器拦截(输入框 / 弹层内不拦截) */
  private shouldIntercept(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key.startsWith("F") && e.key.length > 1) return false;
    if (e.key === "Tab" || e.key === "Escape") return false;
    const el = document.activeElement;
    if (el) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable) {
        return false;
      }
      if (el.closest('[role="dialog"]') || el.closest('[role="menu"]') || el.closest('[role="listbox"]')) {
        return false;
      }
    }
    return true;
  }

  private noteMidi(key: string): number | null {
    const semi = KEY_TO_SEMITONE[key];
    if (semi === undefined) return null;
    const midi = 60 + this.octaveOffset * 12 + semi;
    if (midi < 0 || midi > 127) return null; // MIDI 0–127 内钳位
    return midi;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.shouldIntercept(e) || e.repeat) return;
    const key = e.key.toLowerCase();

    if (key === "v") {
      e.preventDefault();
      this.hooks.onViewToggle();
      return;
    }
    if (key === "h") {
      e.preventDefault();
      this.hooks.onHingeToggle();
      return;
    }
    if (key === "z") {
      e.preventDefault();
      this.octaveOffset = Math.max(OCTAVE_MIN, this.octaveOffset - 1);
      return;
    }
    if (key === "x") {
      e.preventDefault();
      this.octaveOffset = Math.min(OCTAVE_MAX, this.octaveOffset + 1);
      return;
    }
    if (key === "1" || key === "!") {
      e.preventDefault();
      this.bendDown = true;
      this.applyBendKeys();
      return;
    }
    if (key === "2" || key === "@") {
      e.preventDefault();
      this.bendUp = true;
      this.applyBendKeys();
      return;
    }
    if (key in MOD_KEYS) {
      e.preventDefault();
      this.store.set("modWheel", MOD_KEYS[key]);
      return;
    }
    const midi = this.noteMidi(key);
    if (midi !== null) {
      e.preventDefault();
      if (!this.heldKeys.has(key)) {
        this.heldKeys.set(key, midi);
        this.engine.noteOn(midi);
        this.interactions.setKeyVisual(midi, true);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (key === "1" || key === "!") {
      this.bendDown = false;
      this.applyBendKeys();
      return;
    }
    if (key === "2" || key === "@") {
      this.bendUp = false;
      this.applyBendKeys();
      return;
    }
    const midi = this.heldKeys.get(key);
    if (midi !== undefined) {
      this.heldKeys.delete(key);
      this.engine.noteOff(midi);
      this.interactions.setKeyVisual(midi, false);
    }
  };

  /** 1/2 弯音键:按住生效,松开回中(±2 半音) */
  private applyBendKeys(): void {
    const wheel = this.bendDown ? 0 : this.bendUp ? 100 : 50;
    this.store.set("pitchWheel", wheel);
  }

  /** 外部(弯音轮拖拽 / MIDI)更新弯音时由 store 订阅驱动引擎 */
  static syncBend(store: ParamStore, engine: SynthEngine): () => void {
    const apply = () => engine.setBend(bendSemitones(store.num("pitchWheel")));
    apply();
    return store.subscribe("pitchWheel", apply);
  }

  releaseAll = (): void => {
    for (const [, midi] of this.heldKeys) {
      this.engine.noteOff(midi);
      this.interactions.setKeyVisual(midi, false);
    }
    this.heldKeys.clear();
    this.bendDown = false;
    this.bendUp = false;
    this.applyBendKeys();
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseAll);
  }
}
