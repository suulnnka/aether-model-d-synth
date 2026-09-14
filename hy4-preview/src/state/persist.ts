/**
 * ST-2 / ST-3 — 面板状态与视角的 localStorage 持久化 + 恢复出厂
 */
import type { ParamStore } from "./params";

const KEY = "aether-model-d.v1";

export interface PersistedState {
  params: Record<string, number>;
  view: { mode: "3d" | "2d"; hingeDeg: number };
  seenGuide: boolean;
}

export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as PersistedState;
    if (!obj || typeof obj !== "object" || !obj.params) return null;
    return obj;
  } catch {
    return null;
  }
}

export function savePersisted(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 忽略配额/隐私模式错误 */
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function bindPersistence(store: ParamStore, getView: () => { mode: "3d" | "2d"; hingeDeg: number }, getSeenGuide: () => boolean): void {
  let timer: number | undefined;
  const flush = () => {
    savePersisted({
      params: store.snapshot(),
      view: getView(),
      seenGuide: getSeenGuide(),
    });
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 400);
  };
  for (const id of Object.keys(store.snapshot())) store.subscribe(id, schedule);
  window.addEventListener("beforeunload", flush);
}
