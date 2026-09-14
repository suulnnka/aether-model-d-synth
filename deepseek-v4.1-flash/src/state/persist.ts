/**
 * Persistence (PRD ST-2 / ST-3).
 *
 * One versioned JSON blob in localStorage holds the whole panel plus the view
 * preferences. Writes are debounced because knobs broadcast on every animation
 * frame while dragging.
 *
 * Robustness: any parse / version / quota failure degrades to "no saved state"
 * instead of throwing, so a corrupt payload can never stop the instrument from
 * booting.
 */

import type { ParamState } from './ParamStore.ts';

// 三个实现同域部署在 GitHub Pages 上,localStorage 按域共享:键名必须带项目前缀,避免互相污染。
const STORAGE_KEY = 'aether-model-d/deepseek-v4.1-flash/v1';
const SCHEMA_VERSION = 1;
const WRITE_DEBOUNCE_MS = 250;

export type ViewMode = '3d' | '2d';

export interface PersistedView {
  mode: ViewMode;
  /** Remembered 3D hinge angle in degrees (PRD HINGE-4). */
  panelAngle: number;
  autoRotate: boolean;
  onboardingDone: boolean;
}

export interface PersistedBlob {
  version: number;
  params: ParamState;
  view: PersistedView;
}

export function defaultView(): PersistedView {
  return {
    mode: '3d',
    panelAngle: 50, // PRD HINGE-2 default
    autoRotate: false, // PRD VIEW-6 default off
    onboardingDone: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadPersisted(): PersistedBlob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return null;

    const params = isRecord(parsed.params) ? (parsed.params as ParamState) : {};
    const view = isRecord(parsed.view) ? parsed.view : {};
    const base = defaultView();

    return {
      version: SCHEMA_VERSION,
      params,
      view: {
        mode: view.mode === '2d' ? '2d' : '3d',
        panelAngle:
          typeof view.panelAngle === 'number' && Number.isFinite(view.panelAngle)
            ? Math.min(60, Math.max(0, view.panelAngle))
            : base.panelAngle,
        autoRotate: view.autoRotate === true,
        onboardingDone: view.onboardingDone === true,
      },
    };
  } catch {
    return null;
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / disabled storage — nothing to clear */
  }
}

/**
 * Debounced writer. `schedule()` is cheap enough to call from a per-frame
 * knob handler; the actual serialisation happens at most every 250 ms.
 */
export class Persister {
  private timer: number | null = null;
  private pending: (() => PersistedBlob) | null = null;

  schedule(build: () => PersistedBlob): void {
    this.pending = build;
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    const build = this.pending;
    this.pending = null;
    if (!build) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build()));
    } catch {
      /* quota exceeded / storage disabled — keep playing */
    }
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
