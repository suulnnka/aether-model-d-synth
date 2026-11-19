import { clampControlValue, createDefaultParams } from "./specs.ts";
import type { ControlId, ParamMap } from "./types.ts";

export type ParamListener = (changed: readonly ControlId[]) => void;

export class ParamStore {
  private values: ParamMap;
  private listeners = new Set<ParamListener>();
  private keyListeners = new Map<ControlId, Set<(val: number) => void>>();

  constructor(initial?: Partial<ParamMap>) {
    this.values = createDefaultParams();
    if (initial) {
      this.applyPartial(initial, false);
    }
  }

  get(id: ControlId): number {
    return this.values[id];
  }

  getBool(id: ControlId): boolean {
    return this.values[id] >= 0.5;
  }

  snapshot(): ParamMap {
    return { ...this.values };
  }

  set(id: ControlId, value: number): boolean {
    const next = clampControlValue(id, value);
    if (Math.abs(next - this.values[id]) < 1e-6) return false;
    this.values[id] = next;
    this.emit([id]);
    return true;
  }

  applyPartial(partial: Partial<ParamMap>, notify = true): ControlId[] {
    const changed: ControlId[] = [];
    for (const [k, v] of Object.entries(partial) as Array<[ControlId, number | undefined]>) {
      if (typeof v !== "number") continue;
      if (!(k in this.values)) continue;
      const next = clampControlValue(k, v);
      if (Math.abs(next - this.values[k]) >= 1e-6) {
        this.values[k] = next;
        changed.push(k);
      }
    }
    if (notify && changed.length > 0) {
      this.emit(changed);
    }
    return changed;
  }

  resetToDefaults(preservePower = true): ControlId[] {
    const defaults = createDefaultParams();
    if (preservePower) {
      defaults.powerOn = this.values.powerOn;
    }
    return this.applyPartial(defaults, true);
  }

  subscribe(listener: ParamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeKey(id: ControlId, listener: (val: number) => void): () => void {
    let set = this.keyListeners.get(id);
    if (!set) {
      set = new Set();
      this.keyListeners.set(id, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  private emit(changed: readonly ControlId[]): void {
    for (const id of changed) {
      const subs = this.keyListeners.get(id);
      if (subs) {
        const val = this.values[id];
        for (const fn of subs) fn(val);
      }
    }
    for (const fn of this.listeners) {
      fn(changed);
    }
  }
}
