/**
 * Computer-keyboard mapping (PRD §7, INT-8, INT-9, INT-11).
 *
 * The driver is the one place where the PRD is internally inconsistent: §7
 * lists V and H as note keys *and* as the view/panel shortcuts. The resolution
 * is documented at the top of `keyboard.ts` — the note rows keep V and H, and
 * the shortcuts move to Q and R. These tests nail that decision down so a later
 * "fix" cannot quietly reintroduce the collision, and they check the panic
 * paths (blur, tab hidden) that PRD INT-9 requires.
 *
 * The driver touches `window`, `document` and `HTMLElement`, so a minimal
 * stand-in for each is installed below. Nothing here renders, so there is no
 * need for a full DOM implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KeyboardParts } from '../src/model/keyboard.ts';
import type { NoteSink } from '../src/interaction/gestures.ts';
import { DEFAULT_BASE_MIDI, createKeyboardDriver } from '../src/interaction/keyboard.ts';

/* ===========================================================================
 * Minimal DOM stand-ins
 * ========================================================================= */

type Listener = (event: unknown) => void;

class Emitter {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, event: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/** Enough of an Element for the tag-based guards in the driver. */
class FakeElement {
  isContentEditable = false;
  constructor(readonly tagName: string) {}
}

interface FakeEvent {
  readonly code: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly target: unknown;
  readonly prevented: { value: boolean };
  preventDefault(): void;
}

function keyEvent(
  code: string,
  options: { repeat?: boolean; shiftKey?: boolean; target?: unknown } = {},
): FakeEvent {
  const prevented = { value: false };
  return {
    code,
    repeat: options.repeat ?? false,
    shiftKey: options.shiftKey ?? false,
    target: options.target ?? null,
    prevented,
    preventDefault() {
      prevented.value = true;
    },
  };
}

/* ===========================================================================
 * Harness
 * ========================================================================= */

let win: Emitter;
let doc: Emitter & { visibilityState: string };
let target: Emitter;
let notes: NoteSink & { noteOn: ReturnType<typeof vi.fn>; noteOff: ReturnType<typeof vi.fn>; panic: ReturnType<typeof vi.fn> };
let keyboard: KeyboardParts & { setPressed: ReturnType<typeof vi.fn>; releaseAll: ReturnType<typeof vi.fn> };
let commands: { toggleView: ReturnType<typeof vi.fn>; togglePanel: ReturnType<typeof vi.fn>; toggleHelp: ReturnType<typeof vi.fn> };

function makeKeyboardParts(): typeof keyboard {
  return {
    root: {} as never,
    pickTargets: [],
    midiForHit: () => null,
    setPressed: vi.fn(),
    isPressed: () => false,
    releaseAll: vi.fn(),
    showOutline: vi.fn(),
  } as unknown as typeof keyboard;
}

beforeEach(() => {
  win = new Emitter();
  doc = Object.assign(new Emitter(), { visibilityState: 'visible' });
  target = new Emitter();
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).HTMLElement = FakeElement;

  notes = { noteOn: vi.fn(), noteOff: vi.fn(), panic: vi.fn() };
  keyboard = makeKeyboardParts();
  commands = { toggleView: vi.fn(), togglePanel: vi.fn(), toggleHelp: vi.fn() };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createDriver(overrides: Partial<Parameters<typeof createKeyboardDriver>[0]> = {}) {
  return createKeyboardDriver({
    notes,
    keyboard,
    commands,
    target: target as unknown as EventTarget,
    ...overrides,
  });
}

function down(code: string, options: Parameters<typeof keyEvent>[1] = {}): FakeEvent {
  const event = keyEvent(code, options);
  target.emit('keydown', event);
  return event;
}

function up(code: string): void {
  target.emit('keyup', keyEvent(code));
}

/* ===========================================================================
 * The two playing rows
 * ========================================================================= */

describe('chromatic row (PRD §7)', () => {
  const CHROMATIC = [
    'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY',
    'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote',
  ];

  it('anchors the row at C4 by default', () => {
    const driver = createDriver();
    expect(driver.baseMidi).toBe(DEFAULT_BASE_MIDI);
    expect(DEFAULT_BASE_MIDI).toBe(60);
  });

  it('runs 18 semitones upward from the base note', () => {
    createDriver();
    CHROMATIC.forEach((code, i) => {
      down(code);
      expect(notes.noteOn).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI + i);
    });
    expect(notes.noteOn).toHaveBeenCalledTimes(CHROMATIC.length);
  });

  it('presses the matching 3D key', () => {
    createDriver();
    down('KeyA');
    expect(keyboard.setPressed).toHaveBeenCalledWith(DEFAULT_BASE_MIDI, true);
  });

  it('lifts the key and silences the note on key up', () => {
    createDriver();
    down('KeyD');
    notes.noteOn.mockClear();
    up('KeyD');
    expect(notes.noteOff).toHaveBeenCalledWith(DEFAULT_BASE_MIDI + 4);
    expect(keyboard.setPressed).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI + 4, false);
    expect(notes.noteOn).not.toHaveBeenCalled();
  });

  it('ignores the operating system key repeat', () => {
    createDriver();
    down('KeyA');
    down('KeyA', { repeat: true });
    down('KeyA', { repeat: true });
    expect(notes.noteOn).toHaveBeenCalledTimes(1);
  });

  it('does not retrigger while the same physical key is held', () => {
    createDriver();
    down('KeyA');
    down('KeyA');
    expect(notes.noteOn).toHaveBeenCalledTimes(1);
  });

  it('swallows the browser default so keys do not scroll or type', () => {
    createDriver();
    expect(down('KeyA').prevented.value).toBe(true);
  });
});

describe('white-key row (PRD §7)', () => {
  const WHITE: readonly [string, number][] = [
    ['KeyZ', 0],
    ['KeyX', 2],
    ['KeyC', 4],
    ['KeyV', 5],
    ['KeyB', 7],
    ['KeyN', 9],
    ['KeyM', 11],
    ['Comma', 12],
    ['Period', 14],
    ['Slash', 16],
  ];

  it('starts an octave below the base and follows the white-key scale', () => {
    createDriver();
    for (const [code, offset] of WHITE) {
      down(code);
      expect(notes.noteOn).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI - 12 + offset);
    }
    expect(notes.noteOn).toHaveBeenCalledTimes(WHITE.length);
  });

  it('releases the trailing note when the key comes up', () => {
    createDriver();
    down('Slash');
    up('Slash');
    expect(notes.noteOff).toHaveBeenCalledWith(DEFAULT_BASE_MIDI + 4);
  });
});

describe('two physical keys on one note', () => {
  it('keeps the note sounding until the last of them is released', () => {
    createDriver();
    // A is the base note (C4); the comma key is also C4, an octave down.
    down('KeyA');
    down('Comma');
    expect(notes.noteOn).toHaveBeenCalledTimes(2);

    notes.noteOff.mockClear();
    up('KeyA');
    expect(notes.noteOff).not.toHaveBeenCalled();
    expect(keyboard.setPressed).not.toHaveBeenCalledWith(DEFAULT_BASE_MIDI, false);

    up('Comma');
    expect(notes.noteOff).toHaveBeenCalledWith(DEFAULT_BASE_MIDI);
    expect(keyboard.setPressed).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI, false);
  });
});

/* ===========================================================================
 * Octave shifting
 * ========================================================================= */

describe('octave shift', () => {
  /**
   * The two rows together span 30 semitones — the white row reaches an octave
   * below the base, the chromatic row 17 semitones above it. The 44-key bed is
   * 44 semitones, so the base may only live in a 14-semitone window. The shift
   * buttons move by an octave and then clamp, which means the last step at
   * either end is a partial one. That is deliberate: keeping the rows inside
   * the bed matters more than landing on an exact octave.
   */
  it('shifts down until the white row reaches F2, then stops', () => {
    const onBaseChange = vi.fn();
    const driver = createDriver({ onBaseChange });
    down('Minus');
    expect(driver.baseMidi).toBe(53); // 53 - 12 = 41 = F2
    expect(driver.describe().find((r) => r.code === 'KeyZ')?.midi).toBe(41);
    expect(onBaseChange).toHaveBeenLastCalledWith(53);

    down('Minus');
    expect(driver.baseMidi).toBe(53);
  });

  it('shifts up until the chromatic row reaches C6, then stops', () => {
    const driver = createDriver();
    down('Equal');
    expect(driver.baseMidi).toBe(67); // 67 + 17 = 84 = C6
    expect(driver.describe().find((r) => r.code === 'Quote')?.midi).toBe(84);

    down('Equal');
    expect(driver.baseMidi).toBe(67);
  });

  it('keeps the whole map inside the 44-key bed at both extremes', () => {
    const driver = createDriver();
    for (let i = 0; i < 8; i += 1) down('Equal');
    for (const row of driver.describe()) {
      expect(row.midi).toBeGreaterThanOrEqual(41);
      expect(row.midi).toBeLessThanOrEqual(84);
    }
    for (let i = 0; i < 12; i += 1) down('Minus');
    for (const row of driver.describe()) {
      expect(row.midi).toBeGreaterThanOrEqual(41);
      expect(row.midi).toBeLessThanOrEqual(84);
    }
  });

  it('does not re-announce a base that did not move', () => {
    const onBaseChange = vi.fn();
    createDriver({ onBaseChange });
    for (let i = 0; i < 8; i += 1) down('Equal');
    const calls = onBaseChange.mock.calls.length;
    down('Equal');
    expect(onBaseChange.mock.calls.length).toBe(calls);
  });
});

/* ===========================================================================
 * Commands, and the deliberate PRD §7 deviation
 * ========================================================================= */

describe('shortcuts', () => {
  it('uses Q and R for view and panel, not V and H', () => {
    createDriver();
    down('KeyQ');
    expect(commands.toggleView).toHaveBeenCalledTimes(1);
    down('KeyR');
    expect(commands.togglePanel).toHaveBeenCalledTimes(1);
    expect(notes.noteOn).not.toHaveBeenCalled();
  });

  it('keeps V and H playing notes, because the rows need them', () => {
    createDriver();
    down('KeyV');
    expect(notes.noteOn).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI - 12 + 5);
    down('KeyH');
    expect(notes.noteOn).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI + 9);
    expect(commands.toggleView).not.toHaveBeenCalled();
    expect(commands.togglePanel).not.toHaveBeenCalled();
  });

  it('opens help on shift+slash, leaving slash itself a note', () => {
    createDriver();
    down('Slash', { shiftKey: true });
    expect(commands.toggleHelp).toHaveBeenCalledTimes(1);
    expect(notes.noteOn).not.toHaveBeenCalled();

    down('Slash');
    expect(notes.noteOn).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI + 4);
  });

  it('describes the full map for the help sheet', () => {
    const driver = createDriver();
    const rows = driver.describe();
    expect(rows).toHaveLength(18 + 10);
    expect(rows[0]).toEqual({ code: 'KeyA', midi: DEFAULT_BASE_MIDI });
    expect(rows.find((r) => r.code === 'Slash')?.midi).toBe(DEFAULT_BASE_MIDI + 4);
  });

  it('follows the base note when describing itself', () => {
    const driver = createDriver();
    down('Equal');
    expect(driver.describe()[0]).toEqual({ code: 'KeyA', midi: 67 });
  });
});

/* ===========================================================================
 * Panic paths and focus guards
 * ========================================================================= */

describe('panic (INT-9)', () => {
  it('silences everything on Space', () => {
    createDriver();
    down('KeyA');
    down('Space');
    expect(notes.panic).toHaveBeenCalledTimes(1);
    expect(keyboard.releaseAll).toHaveBeenCalled();
  });

  it('does not steal Space from a focused button (UI-4)', () => {
    createDriver();
    down('Space', { target: new FakeElement('BUTTON') });
    expect(notes.panic).not.toHaveBeenCalled();
  });

  it('releases held notes when the window loses focus', () => {
    createDriver();
    down('KeyA');
    win.emit('blur', keyEvent('KeyA'));
    expect(notes.panic).toHaveBeenCalledTimes(1);
    expect(keyboard.setPressed).toHaveBeenLastCalledWith(DEFAULT_BASE_MIDI, false);
  });

  it('releases held notes when the tab is hidden', () => {
    createDriver();
    down('KeyA');
    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange', {});
    expect(notes.panic).toHaveBeenCalledTimes(1);
  });

  it('leaves notes alone while the tab is merely visible again', () => {
    createDriver();
    down('KeyA');
    doc.visibilityState = 'visible';
    doc.emit('visibilitychange', {});
    expect(notes.panic).not.toHaveBeenCalled();
  });
});

describe('focus guards', () => {
  it('ignores keys typed into a text field', () => {
    createDriver();
    down('KeyA', { target: new FakeElement('INPUT') });
    down('KeyA', { target: new FakeElement('TEXTAREA') });
    down('KeyA', { target: new FakeElement('SELECT') });
    const editable = new FakeElement('DIV');
    editable.isContentEditable = true;
    down('KeyA', { target: editable });
    expect(notes.noteOn).not.toHaveBeenCalled();
  });

  it('still plays when focus sits on a plain element', () => {
    createDriver();
    down('KeyA', { target: new FakeElement('DIV') });
    expect(notes.noteOn).toHaveBeenCalledTimes(1);
  });
});

describe('lifecycle', () => {
  it('detaches every listener on dispose', () => {
    const driver = createDriver();
    expect(target.listenerCount('keydown')).toBe(1);
    expect(target.listenerCount('keyup')).toBe(1);
    expect(win.listenerCount('blur')).toBe(1);
    expect(doc.listenerCount('visibilitychange')).toBe(1);

    driver.dispose();
    expect(target.listenerCount('keydown')).toBe(0);
    expect(target.listenerCount('keyup')).toBe(0);
    expect(win.listenerCount('blur')).toBe(0);
    expect(doc.listenerCount('visibilitychange')).toBe(0);
  });

  it('stops responding once disposed', () => {
    const driver = createDriver();
    driver.dispose();
    down('KeyA');
    expect(notes.noteOn).not.toHaveBeenCalled();
  });

  it('forgets held keys on releaseAll, so key up is harmless', () => {
    const driver = createDriver();
    down('KeyA');
    driver.releaseAll();
    notes.noteOff.mockClear();
    up('KeyA');
    expect(notes.noteOff).not.toHaveBeenCalled();
  });
});
