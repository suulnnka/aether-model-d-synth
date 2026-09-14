/**
 * Computer keyboard driving (PRD §7, INT-8, INT-9, INT-11).
 *
 *   A W S E D F T G Y H U J K O L P ; '   chromatic run from the base note
 *   Z X C V B N M , . /                   white keys one octave below
 *   -  =                                   base octave down / up
 *   Space                                  all notes off (panic)
 *   ?                                      help
 *
 * ---------------------------------------------------------------------------
 * Deviation from PRD §7 (deliberate)
 * ---------------------------------------------------------------------------
 * PRD §7 lists `V` and `H` both as note keys (they are the F and A of the two
 * playing rows) *and* as the "view" and "panel" shortcuts. Those cannot both be
 * true. Playing is P0 and cannot be lossy — dropping F and A out of the two
 * rows would break both scales — while the view and panel actions already have
 * always-visible buttons (PRD UI-1, HINGE-2), so the shortcuts are the
 * redundant side of the conflict. The note rows therefore keep V and H, and the
 * shortcuts move to `Q` (view) and `R` (panel). `?` and Space are unaffected,
 * since `?` needs Shift and therefore never collides with the `/` note key.
 *
 * Physical `event.code` is used rather than `event.key` so the layout survives
 * Shift (Shift+A still plays the note instead of being swallowed) and so the
 * mapping follows key *position*, which is what a player's fingers know.
 */

import { KEY_RANGE } from '../state/specs.ts';
import type { KeyboardParts } from '../model/keyboard.ts';
import type { NoteSink } from './gestures.ts';

/** Chromatic run: A-row, 18 semitones from the base. */
const CHROMATIC_CODES: readonly string[] = [
  'KeyA',
  'KeyW',
  'KeyS',
  'KeyE',
  'KeyD',
  'KeyF',
  'KeyT',
  'KeyG',
  'KeyY',
  'KeyH',
  'KeyU',
  'KeyJ',
  'KeyK',
  'KeyO',
  'KeyL',
  'KeyP',
  'Semicolon',
  'Quote',
];

/** White-key run: Z-row, starting one octave below the base. */
const WHITE_CODES: readonly string[] = [
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'KeyN',
  'KeyM',
  'Comma',
  'Period',
  'Slash',
];
const WHITE_OFFSETS: readonly number[] = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

/** Default base note: C4 (PRD §7). */
export const DEFAULT_BASE_MIDI = 60;

/** The base may move, but the whole map must stay inside the key bed. */
const BASE_MIN = KEY_RANGE.firstMidi + 12;
const BASE_MAX = KEY_RANGE.lastMidi - CHROMATIC_CODES.length + 1;

export interface KeyboardCommandHandlers {
  toggleView(): void;
  togglePanel(): void;
  toggleHelp(): void;
}

export interface KeyboardDriverOptions {
  readonly notes: NoteSink;
  readonly keyboard: KeyboardParts;
  readonly commands: KeyboardCommandHandlers;
  /** Called when the base note changes, for the on-screen readout. */
  readonly onBaseChange?: (midi: number) => void;
  readonly target?: EventTarget;
}

export interface KeyboardDriver {
  /** Base note the playing rows are anchored to. */
  readonly baseMidi: number;
  /** Physical code -> note, for the help sheet's map. */
  describe(): readonly { readonly code: string; readonly midi: number }[];
  /** Release everything and forget held keys. */
  releaseAll(): void;
  dispose(): void;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** Space should still activate a focused button rather than panic (PRD UI-4). */
function isActivatableFocused(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A');
}

export function createKeyboardDriver(
  options: KeyboardDriverOptions,
): KeyboardDriver {
  const { notes, keyboard, commands } = options;
  const target = options.target ?? window;

  let base = DEFAULT_BASE_MIDI;
  /** Physical code -> the note it is currently sounding. */
  const held = new Map<string, number>();

  const clampToRange = (midi: number): number | null => {
    if (midi < KEY_RANGE.firstMidi || midi > KEY_RANGE.lastMidi) return null;
    return midi;
  };

  const setBase = (next: number): void => {
    const clamped = Math.max(BASE_MIN, Math.min(BASE_MAX, next));
    if (clamped === base) return;
    base = clamped;
    options.onBaseChange?.(base);
  };

  const pressAt = (code: string, midi: number | null): void => {
    if (midi === null) return;
    if (held.has(code)) return;
    held.set(code, midi);
    keyboard.setPressed(midi, true);
    notes.noteOn(midi);
  };

  const releaseAt = (code: string): void => {
    const midi = held.get(code);
    if (midi === undefined) return;
    held.delete(code);
    // Only lift the key visually if no other physical key is on the same note.
    if (![...held.values()].includes(midi)) {
      keyboard.setPressed(midi, false);
      notes.noteOff(midi);
    }
  };

  const releaseAll = (): void => {
    for (const midi of new Set(held.values())) {
      keyboard.setPressed(midi, false);
    }
    held.clear();
    keyboard.releaseAll();
    notes.panic();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTextEntry(event.target)) return;
    // Key repeat would retrigger the envelope on every OS repeat.
    if (event.repeat) return;

    const code = event.code;

    if (code === 'Space') {
      if (isActivatableFocused(event.target)) return;
      event.preventDefault();
      releaseAll();
      return;
    }

    // PRD §7 remap: Q / R replace the colliding V / H (see the header note).
    if (code === 'KeyQ') {
      event.preventDefault();
      commands.toggleView();
      return;
    }
    if (code === 'KeyR') {
      event.preventDefault();
      commands.togglePanel();
      return;
    }
    if (code === 'Slash' && event.shiftKey) {
      event.preventDefault();
      commands.toggleHelp();
      return;
    }
    if (code === 'Minus') {
      event.preventDefault();
      setBase(base - 12);
      return;
    }
    if (code === 'Equal') {
      event.preventDefault();
      setBase(base + 12);
      return;
    }

    const chromatic = CHROMATIC_CODES.indexOf(code);
    if (chromatic >= 0) {
      event.preventDefault();
      pressAt(code, clampToRange(base + chromatic));
      return;
    }

    const white = WHITE_CODES.indexOf(code);
    if (white >= 0) {
      event.preventDefault();
      pressAt(code, clampToRange(base - 12 + WHITE_OFFSETS[white]));
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (isTextEntry(event.target)) return;
    const code = event.code;
    if (
      CHROMATIC_CODES.includes(code) ||
      WHITE_CODES.includes(code) ||
      code === 'Minus' ||
      code === 'Equal' ||
      code === 'Space'
    ) {
      if (code !== 'Space') event.preventDefault();
    }
    releaseAt(code);
  };

  // Losing focus or hiding the tab must never leave a note sounding (INT-9).
  const onBlur = (): void => releaseAll();
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') releaseAll();
  };

  target.addEventListener('keydown', onKeyDown as EventListener);
  target.addEventListener('keyup', onKeyUp as EventListener);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    get baseMidi(): number {
      return base;
    },

    describe(): readonly { readonly code: string; readonly midi: number }[] {
      const rows: { code: string; midi: number }[] = [];
      CHROMATIC_CODES.forEach((code, i) => {
        rows.push({ code, midi: base + i });
      });
      WHITE_CODES.forEach((code, i) => {
        rows.push({ code, midi: base - 12 + WHITE_OFFSETS[i] });
      });
      return rows;
    },

    releaseAll,

    dispose(): void {
      target.removeEventListener('keydown', onKeyDown as EventListener);
      target.removeEventListener('keyup', onKeyUp as EventListener);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      held.clear();
    },
  };
}
