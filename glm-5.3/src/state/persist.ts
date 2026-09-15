/**
 * localStorage 持久化(ST-4):面板状态、视角/面板角度、引导已读标记。
 * 键带项目前缀,避免与仓库内其它项目互相污染。
 */
import type { Val } from "./paramStore";

const K_PANEL = "aether.glm53.panel.v2";
const K_VIEW = "aether.glm53.view.v2";
const K_ONBOARD = "aether.glm53.onboarded.v2";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

export function savePanel(snapshot: Record<string, Val>): void {
  safeSet(K_PANEL, JSON.stringify(snapshot));
}

export function loadPanel(): Record<string, Val> | null {
  const raw = safeGet(K_PANEL);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* 损坏数据当作无 */
  }
  return null;
}

export interface ViewState {
  mode: "3d" | "2d";
  hingeDeg: number;
}

export function saveView(state: ViewState): void {
  safeSet(K_VIEW, JSON.stringify(state));
}

export function loadView(): ViewState | null {
  const raw = safeGet(K_VIEW);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.mode === "3d" || parsed.mode === "2d") &&
      typeof parsed.hingeDeg === "number"
    ) {
      return {
        mode: parsed.mode,
        hingeDeg: Math.max(0, Math.min(60, parsed.hingeDeg)),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveOnboarded(): void {
  safeSet(K_ONBOARD, "1");
}

export function hasOnboarded(): boolean {
  return safeGet(K_ONBOARD) === "1";
}
