import {
  PARAM_DEFS,
  PARAM_MAP,
  normToRaw,
  rawToNorm,
  type ParamDef,
} from "./params";

export type ParamListener = (id: string, value: number, def: ParamDef) => void;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// 三个实现同域部署在 GitHub Pages 上,localStorage 按域共享:键名必须带项目前缀,避免互相污染。
const STORE_KEY = "aether-model-d/glm-5.3/v1";
const PERSIST_DEBOUNCE_MS = 300;

/**
 * 单一事实来源(PRD ST-1):3D 控件、音频引擎、UI、持久化都只与本仓库通信。
 * 值以「原始单位」存储(Hz/秒/音分/档位序号),旋钮手势使用归一化 0–1。
 */
export class ParamStore {
  private values = new Map<string, number>();
  private listeners = new Map<string, Set<ParamListener>>();
  private wildcard = new Set<ParamListener>();
  private storage: StorageLike | null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** 随参数一起持久化的「机器状态」(视角/面板角等) */
  public meta: Record<string, unknown> = {};

  constructor(storage: StorageLike | null = null) {
    this.storage = storage;
    for (const def of PARAM_DEFS) this.values.set(def.id, def.default);
  }

  getDef(id: string): ParamDef {
    const def = PARAM_MAP.get(id);
    if (!def) throw new Error(`unknown param: ${id}`);
    return def;
  }

  get(id: string): number {
    return this.values.get(id) ?? this.getDef(id).default;
  }

  /** 直接以原始值设置(含钳位与档位取整) */
  set(id: string, value: number): void {
    const def = this.getDef(id);
    let v = Math.min(def.max, Math.max(def.min, value));
    if (def.kind !== "knob") v = Math.round(v);
    if (v === this.values.get(id)) return;
    this.values.set(id, v);
    this.emit(id, v, def);
    this.scheduleSave();
  }

  setNormalized(id: string, n: number): void {
    this.set(id, normToRaw(this.getDef(id), n));
  }

  getNormalized(id: string): number {
    return rawToNorm(this.getDef(id), this.get(id));
  }

  /** 档位/开关步进(+1/-1),到头则回绕(选择器)或钳位(开关) */
  step(id: string, dir: 1 | -1): void {
    const def = this.getDef(id);
    if (def.kind === "switch") {
      this.set(id, dir > 0 ? 1 : 0);
      return;
    }
    const v = this.get(id);
    const next = v + dir;
    if (next > def.max) this.set(id, def.min);
    else if (next < def.min) this.set(id, def.max);
    else this.set(id, next);
  }

  isOn(id: string): boolean {
    return this.get(id) >= 0.5;
  }

  subscribe(id: string, fn: ParamListener): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  subscribeAll(fn: ParamListener): () => void {
    this.wildcard.add(fn);
    return () => {
      this.wildcard.delete(fn);
    };
  }

  private emit(id: string, v: number, def: ParamDef): void {
    this.listeners.get(id)?.forEach((fn) => fn(id, v, def));
    this.wildcard.forEach((fn) => fn(id, v, def));
  }

  /** 全量参数快照(预设/持久化/URL 分享用) */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const def of PARAM_DEFS) out[def.id] = this.get(def.id);
    return out;
  }

  load(snapshot: Record<string, unknown>): void {
    for (const def of PARAM_DEFS) {
      const v = snapshot[def.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        this.set(def.id, v);
      }
    }
  }

  resetToDefaults(): void {
    for (const def of PARAM_DEFS) this.set(def.id, def.default);
  }

  // ---------- 持久化(PRD ST-2/ST-3)----------

  private scheduleSave(): void {
    const storage = this.storage;
    if (!storage) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        storage.setItem(
          STORE_KEY,
          JSON.stringify({ params: this.snapshot(), meta: this.meta })
        );
      } catch {
        /* 存储不可用时静默 */
      }
    }, PERSIST_DEBOUNCE_MS);
  }

  saveNow(): void {
    if (!this.storage) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.storage.setItem(
        STORE_KEY,
        JSON.stringify({ params: this.snapshot(), meta: this.meta })
      );
    } catch {
      /* ignore */
    }
  }

  loadPersisted(): boolean {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(STORE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as {
        params?: Record<string, number>;
        meta?: Record<string, unknown>;
      };
      if (data.params) this.load(data.params);
      if (data.meta) this.meta = data.meta;
      return true;
    } catch {
      return false;
    }
  }

  clearPersisted(): void {
    try {
      this.storage?.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }
}
