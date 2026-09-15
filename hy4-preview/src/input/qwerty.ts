/**
 * 电脑键盘演奏输入(input/qwerty.ts)
 * 映射照抄参考实现(PRD §16 / PLAY-2):
 *   白键 A S D F G H J K L ; '   黑键 W E   T Y U   O P   Q = 基准音下方大二度
 *   Z / X 八度下 / 上;1 / 2 弯音下 / 上(按住);3–8 调制深度;V 视角;H 面板
 */
import { params } from "../state/params";

export interface KeyboardInputHooks {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  onGesture(): void;
  onToggleView(): void;
  onTogglePanel(): void;
}

/** 白键:基准音 C 起的半音偏移 */
const WHITE: Record<string, number> = {
  KeyA: 0,
  KeyS: 2,
  KeyD: 4,
  KeyF: 5,
  KeyG: 7,
  KeyH: 9,
  KeyJ: 11,
  KeyK: 12,
  KeyL: 14,
  Semicolon: 16,
  Quote: 17,
};

/** 黑键:基准音 C 起的半音偏移 */
const BLACK: Record<string, number> = {
  KeyW: 1,
  KeyE: 3,
  KeyT: 6,
  KeyY: 8,
  KeyU: 10,
  KeyO: 13,
  KeyP: 15,
};

/** Q = 基准音下方大二度 */
const BELOW = -1;

const MOD_DEPTH: Record<string, number> = {
  Digit3: 0,
  Digit4: 20,
  Digit5: 40,
  Digit6: 60,
  Digit7: 80,
  Digit8: 100,
};

const BASE_MIDI = 60; // 基准音默认 C4

export function createKeyboardInput(hooks: KeyboardInputHooks): { dispose(): void; octave(): number } {
  let octaveShift = 0;
  const down = new Map<string, number>(); // code → midi

  const baseMidi = (): number => BASE_MIDI + octaveShift * 12;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    const code = ev.code;
    const known =
      code in WHITE ||
      code in BLACK ||
      code === "KeyQ" ||
      code === "KeyZ" ||
      code === "KeyX" ||
      code === "Digit1" ||
      code === "Digit2" ||
      code in MOD_DEPTH ||
      code === "KeyV" ||
      code === "KeyH";
    if (!known) return;

    ev.preventDefault();
    hooks.onGesture();
    if (ev.repeat) return;

    // 八度切换
    if (code === "KeyZ" || code === "KeyX") {
      const dir = code === "KeyZ" ? -1 : 1;
      const next = Math.max(-5, Math.min(5, octaveShift + dir)); // MIDI 0–127 内钳位
      if (next !== octaveShift) {
        for (const midi of down.values()) hooks.noteOff(midi);
        down.clear();
        octaveShift = next;
      }
      return;
    }

    // 弯音(按住生效,松开回中)
    if (code === "Digit1" || code === "Digit2") {
      params.set("pitchWheel", code === "Digit1" ? 0 : 100);
      return;
    }

    // 调制深度
    if (code in MOD_DEPTH) {
      params.set("modWheel", MOD_DEPTH[code]);
      return;
    }

    if (code === "KeyV") {
      hooks.onToggleView();
      return;
    }
    if (code === "KeyH") {
      hooks.onTogglePanel();
      return;
    }

    // 音符
    if (down.has(code)) return;
    let semis: number | undefined;
    if (code in WHITE) semis = WHITE[code];
    else if (code in BLACK) semis = BLACK[code];
    else if (code === "KeyQ") semis = BELOW;
    if (semis === undefined) return;

    let midi = baseMidi() + semis;
    midi = Math.max(0, Math.min(127, midi));
    down.set(code, midi);
    hooks.noteOn(midi);
  };

  const onKeyUp = (ev: KeyboardEvent): void => {
    const code = ev.code;
    if (code === "Digit1" || code === "Digit2") {
      if (params.get("pitchWheel") !== 50) params.set("pitchWheel", 50);
      return;
    }
    const midi = down.get(code);
    if (midi === undefined) return;
    down.delete(code);
    hooks.noteOff(midi);
  };

  const releaseAll = (): void => {
    for (const midi of down.values()) hooks.noteOff(midi);
    down.clear();
    if (params.get("pitchWheel") !== 50) params.set("pitchWheel", 50);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", releaseAll);

  return {
    octave: () => octaveShift,
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
    },
  };
}
