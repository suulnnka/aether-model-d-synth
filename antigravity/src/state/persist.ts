import { CONTROL_SPECS, SPEC_BY_ID } from "./specs.ts";
import type { ControlId, ParamMap, Preset, UserOptions, ViewState } from "./types.ts";

const PREFIX = "aether-model-d/antigravity/v1";
const KEY_PARAMS = `${PREFIX}/params`;
const KEY_VIEW = `${PREFIX}/view`;
const KEY_OPTIONS = `${PREFIX}/options`;
const KEY_USER_PRESETS = `${PREFIX}/user-presets`;
const KEY_ACTIVE_PRESET = `${PREFIX}/active-preset`;

export const DEFAULT_USER_OPTIONS: UserOptions = {
  learningMode: false,
  magnifyKnobs: true,
  showScope: true,
  showQwertyGuide: false,
  onboardingCompleted: false,
};

export const DEFAULT_VIEW_STATE: ViewState = {
  mode: "3d",
  panelAngleDeg: 52,
  cameraPreset: "overview",
};

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadPersistedParams(): Partial<ParamMap> | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY_PARAMS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<ParamMap> = {};
    for (const spec of CONTROL_SPECS) {
      const val = parsed[spec.id];
      if (typeof val === "number" && Number.isFinite(val)) {
        out[spec.id] = val;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function savePersistedParams(params: ParamMap): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_PARAMS, JSON.stringify(params));
  } catch {
    // ignore storage quota errors
  }
}

export function loadViewState(): ViewState {
  const ls = safeStorage();
  if (!ls) return { ...DEFAULT_VIEW_STATE };
  try {
    const raw = ls.getItem(KEY_VIEW);
    if (!raw) return { ...DEFAULT_VIEW_STATE };
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    return {
      mode: parsed.mode === "2d" ? "2d" : "3d",
      panelAngleDeg:
        typeof parsed.panelAngleDeg === "number" && Number.isFinite(parsed.panelAngleDeg)
          ? Math.max(0, Math.min(75, parsed.panelAngleDeg))
          : DEFAULT_VIEW_STATE.panelAngleDeg,
      cameraPreset:
        parsed.cameraPreset === "panel" ||
        parsed.cameraPreset === "keys" ||
        parsed.cameraPreset === "rear"
          ? parsed.cameraPreset
          : "overview",
    };
  } catch {
    return { ...DEFAULT_VIEW_STATE };
  }
}

export function saveViewState(view: ViewState): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_VIEW, JSON.stringify(view));
  } catch {
    // ignore
  }
}

export function loadUserOptions(): UserOptions {
  const ls = safeStorage();
  if (!ls) return { ...DEFAULT_USER_OPTIONS };
  try {
    const raw = ls.getItem(KEY_OPTIONS);
    if (!raw) return { ...DEFAULT_USER_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<UserOptions>;
    return {
      learningMode: Boolean(parsed.learningMode),
      magnifyKnobs: parsed.magnifyKnobs !== undefined ? Boolean(parsed.magnifyKnobs) : true,
      showScope: parsed.showScope !== undefined ? Boolean(parsed.showScope) : true,
      showQwertyGuide: Boolean(parsed.showQwertyGuide),
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
    };
  } catch {
    return { ...DEFAULT_USER_OPTIONS };
  }
}

export function saveUserOptions(opts: UserOptions): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_OPTIONS, JSON.stringify(opts));
  } catch {
    // ignore
  }
}

export function loadUserPresets(): Preset[] {
  const ls = safeStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(KEY_USER_PRESETS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as Preset[]) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: readonly Preset[]): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_USER_PRESETS, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function loadActivePresetId(): string | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    return ls.getItem(KEY_ACTIVE_PRESET);
  } catch {
    return null;
  }
}

export function saveActivePresetId(id: string | null): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    if (id) ls.setItem(KEY_ACTIVE_PRESET, id);
    else ls.removeItem(KEY_ACTIVE_PRESET);
  } catch {
    // ignore
  }
}

/**
 * Serializes changed parameters (compared to defaults) into compact URL query params
 * so shared patch links stay readable and resilient.
 */
export function encodeParamsToQuery(params: ParamMap): string {
  const usp = new URLSearchParams();
  usp.set("v", "1");
  for (const spec of CONTROL_SPECS) {
    if (spec.id === "pitchWheel") continue; // momentary controller
    const val = params[spec.id];
    if (Math.abs(val - spec.defaultValue) >= 1e-4) {
      usp.set(spec.id, Number(val.toFixed(3)).toString());
    }
  }
  return usp.toString();
}

export function decodeParamsFromQuery(search: string): Partial<ParamMap> | null {
  const usp = new URLSearchParams(search);
  if (!usp.has("v") && [...usp.keys()].length === 0) return null;
  const out: Partial<ParamMap> = {};
  let count = 0;
  for (const [k, raw] of usp.entries()) {
    if (k === "v" || k === "preset") continue;
    const id = k as ControlId;
    if (!(id in SPEC_BY_ID)) continue;
    const num = Number(raw);
    if (Number.isFinite(num)) {
      out[id] = num;
      count++;
    }
  }
  return count > 0 ? out : null;
}

export function buildShareUrl(params: ParamMap): string {
  const qs = encodeParamsToQuery(params);
  return `${window.location.origin}${window.location.pathname}?${qs}`;
}
