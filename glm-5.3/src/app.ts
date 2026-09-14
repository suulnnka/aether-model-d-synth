import * as THREE from "three";
import { SynthEngine } from "./audio/engine";
import { runSelfTest } from "./audio/selftest";
import { Interactions, type TooltipHandle } from "./interaction/interactions";
import { TypewriterKeyboard, baseWithShift } from "./interaction/keyboardMap";
import { createSynth } from "./model/synth";
import { CameraRig, type ViewMode } from "./scene/cameraRig";
import { HingeController } from "./scene/hinge";
import { bindCamera, createStage } from "./scene/stage";
import { ParamStore } from "./state/paramStore";
import { PRESETS } from "./state/presets";
import { Overlay } from "./ui/overlay";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** localStorage 适配(隐私模式等场景下降级为内存存储) */
function safeStorage(): Storage | null {
  try {
    const t = "__aether_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
}

function workletUrl(): string {
  return `${import.meta.env.BASE_URL}audio/ladder-worklet.js`;
}

/** URL 分享(AUD-16):#p=<base64url(参数快照)> */
function parseHashPreset(): Record<string, number> | null {
  const m = location.hash.match(/p=([A-Za-z0-9+/=_-]+)/);
  if (!m) return null;
  try {
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(atob(b64)) as Record<string, number>;
  } catch {
    return null;
  }
}

export function boot(): void {
  const appHost = document.getElementById("app")!;
  const store = new ParamStore(safeStorage());
  store.loadPersisted();
  const hashParams = parseHashPreset();
  if (hashParams) store.load(hashParams);

  const meta = store.meta as { view?: ViewMode; hinge?: number; onboarded?: boolean };
  let viewMode: ViewMode = meta.view === "2d" ? "2d" : "3d";

  // ---- 3D 场景 ----
  const synth = createSynth();
  const stage = createStage(appHost, synth.root);
  const rig = new CameraRig(reducedMotion);
  rig.setMode(viewMode, true); // 启动直接到位(含 2D 恢复)
  bindCamera(stage, rig.camera);
  const hinge = new HingeController(synth, reducedMotion);
  if (typeof meta.hinge === "number") {
    hinge.memorized = Math.min(60, Math.max(0, meta.hinge));
  }
  hinge.setDeg(viewMode === "2d" ? 0 : hinge.memorized);

  synth.applyAllParams(store);
  store.subscribeAll((id, v) => synth.applyParam(id, v));

  // ---- 覆盖层 ----
  let engine: SynthEngine | null = null;
  let muted = false;
  const tooltip: TooltipHandle = {
    showAt(x, y, text) {
      let t = tooltipEl;
      if (!t) {
        t = document.createElement("div");
        t.className = "tooltip";
        document.body.appendChild(t);
        tooltipEl = t;
      }
      t.textContent = text;
      t.style.left = `${Math.min(x + 14, window.innerWidth - 180)}px`;
      t.style.top = `${Math.max(y - 34, 8)}px`;
      t.style.display = "";
    },
    hide() {
      if (tooltipEl) tooltipEl.style.display = "none";
    },
  };
  let tooltipEl: HTMLElement | null = null;

  let metaSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveMetaSoon = (): void => {
    if (metaSaveTimer) clearTimeout(metaSaveTimer);
    metaSaveTimer = setTimeout(() => {
      metaSaveTimer = null;
      store.saveNow();
    }, 400);
  };

  const overlay = new Overlay({
    onViewMode: (m) => setViewMode(m),
    onHingeToggle: () => hinge.toggle(),
    onMute: (m) => {
      muted = m;
      engine?.setUiMuted(m);
    },
    onUnlock: () => void unlockAudio(),
    onResetFactory: () => {
      store.resetToDefaults();
      store.clearPersisted();
      overlay.toast("已恢复出厂设置");
    },
    onPreset: (id) => loadPreset(id),
    onShareUrl: () => {
      const json = JSON.stringify(store.snapshot());
      const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      location.hash = `p=${b64}`;
      navigator.clipboard?.writeText(location.href).then(
        () => overlay.toast("分享链接已复制"),
        () => overlay.toast("链接已写入地址栏")
      );
    },
    onExtFile: (file) => void loadExtFile(file),
  });

  // ---- 音频解锁(AUD-14:首次用户手势)----
  let unlocking = false;
  async function unlockAudio(): Promise<void> {
    if (engine || unlocking) return;
    unlocking = true;
    try {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      engine = await SynthEngine.create(ctx, store, workletUrl());
      overlay.setFilterMode(engine.filterMode);
      engine.setUiMuted(muted);
      engine.onMonoEvent = (_e, held) => syncKeyVisuals(held);
      overlay.toast(engine.filterMode === "worklet" ? "声音已开启" : "声音已开启(兼容模式)");
      if (!meta.onboarded) {
        meta.onboarded = true;
        overlay.showOnboarding(0);
        saveMetaSoon();
      }
    } catch (err) {
      console.error(err);
      overlay.toast("音频初始化失败", true);
    }
    unlocking = false;
  }
  window.addEventListener("pointerdown", () => void unlockAudio());

  // ---- 音符视觉同步(引擎单音事件 → 键姿态)----
  function syncKeyVisuals(held: number[]): void {
    const set = new Set(held);
    for (const [midi] of synth.keys) {
      synth.setKey(midi, set.has(midi));
    }
  }

  // ---- 预设 / 外部输入 ----
  function loadPreset(id: string): void {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    store.resetToDefaults();
    store.load(p.params);
    overlay.toast(`预设:${p.name}`);
  }

  async function loadExtFile(file: File): Promise<void> {
    if (!engine) await unlockAudio();
    if (!engine) return;
    try {
      const buf = await file.arrayBuffer();
      const audio = await (engine.ctx as AudioContext).decodeAudioData(buf);
      engine.loadExtBuffer(audio);
      overlay.toast(`外部输入:${file.name}`);
    } catch {
      overlay.toast("音频文件解码失败", true);
    }
  }

  // ---- 视角切换(VIEW-1/HINGE-4)----
  function setViewMode(m: ViewMode): void {
    if (m === viewMode && !rig.isTweening) return;
    viewMode = m;
    meta.view = m;
    saveMetaSoon();
    rig.setMode(m);
    overlay.setViewMode(m);
    if (m === "2d") hinge.flatten();
    else hinge.raise();
  }
  overlay.setViewMode(viewMode);

  // ---- 交互 ----
  const typewriter = new TypewriterKeyboard(
    (m) => (engine ? engine.noteOn(m) : synth.setKey(m, true)),
    (m) => (engine ? engine.noteOff(m) : synth.setKey(m, false))
  );

  const interactions = new Interactions(
    stage.renderer.domElement,
    synth,
    store,
    rig,
    hinge,
    () => engine,
    tooltip,
    {
      onNoteOn: (m) => (engine ? engine.noteOn(m) : synth.setKey(m, true)),
      onNoteOff: (m) => (engine ? engine.noteOff(m) : synth.setKey(m, false)),
      onHingeChanged: (deg) => {
        meta.hinge = deg;
        if (deg > 1) hinge.memorized = deg;
        saveMetaSoon();
      },
    },
    { reducedMotion }
  );
  interactions.attach();

  // ---- 挂音防护(INT-9 / INT-11)----
  const panicAll = (): void => {
    engine?.panic();
    typewriter.allOff();
    syncKeyVisuals([]);
  };
  window.addEventListener("blur", panicAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) panicAll();
  });

  // ---- 电脑键盘演奏(§7)----
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    if (e.key === "Escape") {
      overlay.toggleHelp(false);
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      overlay.toggleHelp();
      return;
    }
    if (overlay.helpOpen || overlay.unlockVisible) return;
    if (e.code === "Space") {
      e.preventDefault();
      panicAll();
      return;
    }
    if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      setViewMode(viewMode === "3d" ? "2d" : "3d");
      return;
    }
    if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      hinge.toggle();
      return;
    }
    if (e.key === "-") {
      typewriter.base = baseWithShift(typewriter.base, -1);
      overlay.toast(`基准音:C${typewriter.base / 12 - 1}`);
      return;
    }
    if (e.key === "=" || e.key === "+") {
      typewriter.base = baseWithShift(typewriter.base, 1);
      overlay.toast(`基准音:C${typewriter.base / 12 - 1}`);
      return;
    }
    typewriter.handleKeyDown(e);
  });
  window.addEventListener("keyup", (e) => typewriter.handleKeyUp(e));

  // ---- 自检模式(?selftest,PRD §8.7 离线渲染断言)----
  if (new URLSearchParams(location.search).has("selftest")) {
    void import("./audio/selftestUI").then((m) => m.mountSelfTestUI(() => runSelfTest()));
  }

  // ---- resize / DPI ----
  const doResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    stage.resize(w, h);
    rig.camera.aspect = w / h;
    rig.camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", doResize);
  doResize();

  // ---- WebGL 上下文丢失 ----
  stage.renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const div = document.createElement("div");
    div.className = "gpu-lost";
    div.innerHTML = "图形上下文已丢失,请刷新页面重试。";
    document.body.appendChild(div);
  });

  // ---- 加载页 + 开场运镜(附录 B / P2)----
  overlay.showSplash(
    () => {},
    () => {
      if (viewMode === "3d") rig.playIntro();
      overlay.showUnlock();
    }
  );

  // 开发/测试辅助句柄(自检脚本与调试用)
  const pickRaycaster = new THREE.Raycaster();
  (window as unknown as Record<string, unknown>).__aether = {
    store,
    rig,
    hinge,
    synth,
    getEngine: () => engine,
    /** 手动渲染一帧(性能测量用) */
    renderFrame: () => stage.render(),
    /** 屏幕坐标 → 命中目标(测试辅助) */
    pickAt(clientX: number, clientY: number) {
      const dom = stage.renderer.domElement;
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      pickRaycaster.setFromCamera(ndc, rig.camera);
      const hits = pickRaycaster.intersectObject(synth.root, true);
      return hits.length ? synth.resolveHit(hits[0].object) : null;
    },
    /** 控件世界坐标 → 屏幕坐标(测试辅助) */
    controlScreenPos(id: string) {
      const v = synth.controls.get(id);
      if (!v) return null;
      const p = v.group.getWorldPosition(new THREE.Vector3()).project(rig.camera);
      const rect = stage.renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((p.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - p.y) / 2) * rect.height,
      };
    },
  };

  // ---- 主循环 ----
  const clock = new THREE.Clock();
  function loop(): void {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    rig.update(dt);
    hinge.update(dt);
    interactions.update(dt);
    if (viewMode === "3d") overlay.setHingeRaised(hinge.deg > 0.5);
    stage.render();
  }
  loop();
}
