/**
 * localStorage 持久化(PRD ST-4)
 * 保存:面板参数快照、视角(2D/3D)、面板角度、引导已读标记。
 */
import { params } from "./params";

const KEY_STATE = "aether-model-d:state:v3";
const KEY_VIEW = "aether-model-d:view:v3";
const KEY_ONBOARDING = "aether-model-d:onboarded:v3";

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 隐私模式下静默失败 */
  }
};

export interface ViewState {
  mode: "2d" | "3d";
  /** 3D 模式记忆的面板角度(度) */
  panelAngle: number;
}

let saveTimer: number | undefined;

export function loadState(): void {
  const raw = safeGet(KEY_STATE);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw) as Record<string, number>;
    params.setMany(obj);
  } catch {
    /* 数据损坏则忽略,走默认值 */
  }
}

export function saveState(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    safeSet(KEY_STATE, JSON.stringify(params.snapshot()));
  }, 250) as unknown as number;
}

export function loadView(): ViewState {
  const raw = safeGet(KEY_VIEW);
  const def: ViewState = { mode: "3d", panelAngle: 50 };
  if (!raw) return def;
  try {
    const o = JSON.parse(raw) as Partial<ViewState>;
    return {
      mode: o.mode === "2d" ? "2d" : "3d",
      panelAngle: typeof o.panelAngle === "number" ? Math.min(60, Math.max(0, o.panelAngle)) : 50,
    };
  } catch {
    return def;
  }
}

export function saveView(v: ViewState): void {
  safeSet(KEY_VIEW, JSON.stringify(v));
}

export function hasOnboarded(): boolean {
  return safeGet(KEY_ONBOARDING) === "1";
}

export function setOnboarded(): void {
  safeSet(KEY_ONBOARDING, "1");
}
