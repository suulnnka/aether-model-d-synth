/**
 * ParamStore — the single source of truth for every panel value (PRD ST-1).
 *
 * 3D controls and the audio engine never talk to each other. They both read
 * and write through this store:
 *
 *   gesture ──► ParamStore ──► subscriber A: 3D pose
 *                          └─► subscriber B: audio parameter automation
 *
 * Storage shape
 * -------------
 *  - knob / wheel  -> number   normalised position in [0, 1]
 *  - switch        -> boolean  on / off
 *  - selector      -> string   the selected option's `value`
 *
 * Storing the normalised position (rather than the engineering value) means a
 * knob's stored state *is* its rotation fraction, so the 3D pose and the audio
 * mapping can never disagree about what the knob currently points at.
 */

import {
  CONTROL_SPECS,
  SPEC_BY_ID,
  defaultPosOf,
  type AnySpec,
  type KnobSpec,
  type SelectorSpec,
  type SwitchSpec,
  type WheelSpec,
} from './specs.ts';
import { clamp01 } from './range.ts';

export type ControlValue = number | boolean | string;
export type ParamState = Record<string, ControlValue>;

/** Why a value changed — lets subscribers skip expensive work for bulk loads. */
export type ChangeOrigin = 'user' | 'restore' | 'preset' | 'init';

type ValueListener = (
  value: ControlValue,
  origin: ChangeOrigin,
  id: string,
) => void;
type BulkListener = (state: ParamState, origin: ChangeOrigin) => void;

function factoryValue(spec: AnySpec): ControlValue {
  switch (spec.kind) {
    case 'knob':
      return defaultPosOf(spec);
    case 'wheel':
      return spec.defaultPos;
    case 'switch':
      return spec.default;
    case 'selector':
      return spec.options[spec.defaultIndex]?.value ?? spec.options[0].value;
  }
}

export function createDefaultState(): ParamState {
  const state: ParamState = {};
  for (const spec of CONTROL_SPECS) state[spec.id] = factoryValue(spec);
  return state;
}

/** Coerce + validate an incoming value against its spec. Returns null if invalid. */
function coerce(spec: AnySpec, raw: ControlValue): ControlValue | null {
  switch (spec.kind) {
    case 'knob':
    case 'wheel':
      return typeof raw === 'number' && Number.isFinite(raw)
        ? clamp01(raw)
        : null;
    case 'switch':
      return typeof raw === 'boolean' ? raw : null;
    case 'selector': {
      if (typeof raw !== 'string') return null;
      return spec.options.some((o) => o.value === raw) ? raw : null;
    }
  }
}

export class ParamStore {
  private values = new Map<string, ControlValue>();
  private valueSubs = new Map<string, Set<ValueListener>>();
  private bulkSubs = new Set<BulkListener>();
  private depth = 0;
  private dirty = new Set<string>();

  constructor(initial?: ParamState) {
    this.values = new Map(Object.entries(createDefaultState()));
    if (initial) this.applySnapshot(initial, 'restore', false);
  }

  /* ---------------------------------------------------------------- reads */

  /** Raw value. Knob/wheel -> position, switch -> boolean, selector -> option value. */
  get(id: string): ControlValue {
    const value = this.values.get(id);
    if (value === undefined) throw new Error(`Unknown control: ${id}`);
    return value;
  }

  /** Normalised position for a continuous control (0..1). */
  pos(id: string): number {
    const value = this.values.get(id) ?? 0;
    return typeof value === 'number' ? value : 0;
  }

  /** Boolean state of a switch. */
  flag(id: string): boolean {
    return this.values.get(id) === true;
  }

  /** Selected option value of a selector. */
  option(id: string): string {
    const value = this.values.get(id);
    return typeof value === 'string' ? value : '';
  }

  /** Selected option index of a selector (-1 when unknown). */
  index(id: string): number {
    const spec = SPEC_BY_ID.get(id);
    if (!spec || spec.kind !== 'selector') return -1;
    const current = this.option(id);
    return spec.options.findIndex((o) => o.value === current);
  }

  snapshot(): ParamState {
    return Object.fromEntries(this.values);
  }

  /* --------------------------------------------------------------- writes */

  set(id: string, value: ControlValue, origin: ChangeOrigin = 'user'): void {
    const spec = SPEC_BY_ID.get(id);
    if (!spec) throw new Error(`Unknown control: ${id}`);
    const next = coerce(spec, value);
    if (next === null) return;
    if (this.values.get(id) === next) return;
    this.values.set(id, next);
    this.valueSubs.get(id)?.forEach((fn) => fn(next, origin, id));
    if (this.depth > 0) this.dirty.add(id);
    else this.emitBulk(origin);
  }

  /** Set a continuous control by position. */
  setPos(id: string, pos: number, origin: ChangeOrigin = 'user'): void {
    this.set(id, clamp01(pos), origin);
  }

  /** Relative move by position delta (used by knob drag). */
  nudge(id: string, deltaPos: number, origin: ChangeOrigin = 'user'): void {
    this.setPos(id, this.pos(id) + deltaPos, origin);
  }

  toggle(id: string, origin: ChangeOrigin = 'user'): void {
    const spec = SPEC_BY_ID.get(id);
    if (!spec) throw new Error(`Unknown control: ${id}`);
    if (spec.kind === 'switch') this.set(id, !this.flag(id), origin);
  }

  /** Step a selector by `dir` detents, wrapping around (PRD INT-2). */
  cycleOption(id: string, dir = 1, origin: ChangeOrigin = 'user'): void {
    const spec = SPEC_BY_ID.get(id);
    if (!spec || spec.kind !== 'selector') return;
    const count = spec.options.length;
    const current = Math.max(0, this.index(id));
    const next = (((current + dir) % count) + count) % count;
    this.set(id, spec.options[next].value, origin);
  }

  /** Snap a selector to an absolute index. */
  setOptionIndex(id: string, index: number, origin: ChangeOrigin = 'user'): void {
    const spec = SPEC_BY_ID.get(id);
    if (!spec || spec.kind !== 'selector') return;
    const wrapped = ((index % spec.options.length) + spec.options.length) %
      spec.options.length;
    this.set(id, spec.options[wrapped].value, origin);
  }

  /** Restore one control to its factory value (PRD INT-1 double click). */
  resetToDefault(id: string, origin: ChangeOrigin = 'user'): void {
    const spec = SPEC_BY_ID.get(id);
    if (!spec) return;
    this.set(id, factoryValue(spec), origin);
  }

  /** Restore every control to its factory value (PRD ST-3). */
  resetAll(origin: ChangeOrigin = 'restore'): void {
    this.applySnapshot(createDefaultState(), origin, true);
    this.emitBulk(origin);
  }

  /**
   * Merge a partial/complete state in. Unknown ids and out-of-range values are
   * dropped rather than throwing, so a stale localStorage payload from an older
   * build can never brick the app.
   */
  applySnapshot(
    state: ParamState,
    origin: ChangeOrigin = 'restore',
    notify = true,
  ): void {
    const touched: string[] = [];
    for (const [id, raw] of Object.entries(state)) {
      const spec = SPEC_BY_ID.get(id);
      if (!spec) continue;
      const next = coerce(spec, raw);
      if (next === null || this.values.get(id) === next) continue;
      this.values.set(id, next);
      touched.push(id);
    }
    if (!notify) return;
    for (const id of touched) {
      const value = this.values.get(id)!;
      this.valueSubs.get(id)?.forEach((fn) => fn(value, origin, id));
    }
    if (touched.length) this.emitBulk(origin);
  }

  /* ------------------------------------------------------------ subscribe */

  subscribe(id: string, fn: ValueListener): () => void {
    let set = this.valueSubs.get(id);
    if (!set) {
      set = new Set();
      this.valueSubs.set(id, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }

  subscribeAll(fn: BulkListener): () => void {
    this.bulkSubs.add(fn);
    return () => {
      this.bulkSubs.delete(fn);
    };
  }

  /**
   * Wrap several writes in one notification. Per-id listeners still fire
   * immediately (the 3D pose wants every frame), but bulk listeners such as
   * the persistence writer are coalesced.
   */
  transact(fn: () => void, origin: ChangeOrigin = 'preset'): void {
    this.depth += 1;
    try {
      fn();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) {
        this.dirty.clear();
        this.emitBulk(origin);
      }
    }
  }

  private emitBulk(origin: ChangeOrigin): void {
    if (!this.bulkSubs.size) return;
    const snap = this.snapshot();
    this.bulkSubs.forEach((fn) => fn(snap, origin));
  }
}

/* --------------------------------------------------------------------------
 * Typed spec accessors used by the model / audio layers so they never have to
 * narrow the union themselves.
 * ------------------------------------------------------------------------- */

export function asKnob(id: string): KnobSpec {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || spec.kind !== 'knob') throw new Error(`${id} is not a knob`);
  return spec;
}

export function asSelector(id: string): SelectorSpec {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || spec.kind !== 'selector') {
    throw new Error(`${id} is not a selector`);
  }
  return spec;
}

export function asSwitch(id: string): SwitchSpec {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || spec.kind !== 'switch') throw new Error(`${id} is not a switch`);
  return spec;
}

export function asWheel(id: string): WheelSpec {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || spec.kind !== 'wheel') throw new Error(`${id} is not a wheel`);
  return spec;
}
