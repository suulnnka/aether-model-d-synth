/**
 * 应用总装:ParamStore ↔ 音频引擎 ↔ 3D 模型 ↔ 覆盖层 的接线与主循环。
 */
import "./styles.css";
import { ParamStore } from "./state/paramStore";
import { hasOnboarded, loadPanel, loadView, saveOnboarded, savePanel, saveView } from "./state/persist";
import { SynthEngine } from "./audio/engine";
import { bendSemitones } from "./audio/mapping";
import { createStage } from "./scene/stage";
import { CameraRig } from "./scene/cameraRig";
import { HingeController } from "./scene/hinge";
import { buildSynth } from "./model/synth";
import { Interactions } from "./interaction/interactions";
import { QweryInput } from "./input/qwerty";
import { MidiInput } from "./input/midi";
import { createOverlay } from "./ui/overlay";
import { Onboarding } from "./ui/onboarding";

function boot(): void {
  /* ---------- 状态 ---------- */
  const store = new ParamStore();
  const persisted = loadPanel();
  if (persisted) store.applyAssigns(persisted);
  const savedView = loadView();

  /* ---------- 场景与模型 ---------- */
  const app = document.getElementById("app")!;
  const stage = createStage(app);
  const model = buildSynth(store);
  stage.scene.add(model.root);

  const rig = new CameraRig(stage);
  const hinge = new HingeController(model);
  if (savedView?.mode === "2d") {
    hinge.remembered = savedView.hingeDeg;
    rig.setMode("2d");
    rig.setModeImmediate();
    hinge.setTarget(0, false);
  } else if (savedView) {
    hinge.dragTo(savedView.hingeDeg);
  }

  /* ---------- 音频 ---------- */
  const engine = new SynthEngine(store, {
    onOverload: (on) => model.setOverloadLamp(on),
  });
  store.subscribeAny((changed) => {
    for (const id of changed) engine.syncParam(id);
    schedulePersist();
  });
  // 弯音轮 → 引擎(3D 轮拖拽 / QWERTY 1,2 / MIDI 共用此通道)
  store.subscribe("pitchWheel", () =>
    engine.setBend(bendSemitones(store.num("pitchWheel"))),
  );

  /* ---------- 交互 ---------- */
  const interactions = new Interactions(stage, rig, hinge, model, store, engine);
  const qwerty = new QweryInput(store, engine, interactions, {
    onViewToggle: () => toggleView(),
    onHingeToggle: () => toggleHinge(),
  });
  new MidiInput(store, engine, interactions);

  /* ---------- 覆盖层 ---------- */
  const overlay = createOverlay({
    onPreset(preset) {
      store.applyAssigns(preset.assigns);
      overlay.showToast(`已载入预设:${preset.name}`);
    },
    onViewToggle: () => toggleView(),
    onHingeToggle: () => toggleHinge(),
    is2d: () => rig.mode === "2d",
  });
  const onboarding = new Onboarding(model, rig);
  onboarding.onFinish = () => {
    saveOnboarded();
    ensurePowered();
  };
  onboarding.onSkip = () => saveOnboarded();

  /* ---------- 视角 / 铰链 ---------- */
  function toggleView(): void {
    const next = rig.mode === "3d" ? "2d" : "3d";
    rig.setMode(next);
    if (next === "2d") hinge.enter2d();
    else hinge.exit2d();
    overlay.setViewLabel();
    overlay.setHingeVisible(next === "3d");
    persistView();
  }
  function toggleHinge(): void {
    hinge.toggle();
    persistView();
  }
  hinge.onAngleChange = () => persistView();
  if (savedView?.mode === "2d") {
    overlay.setHingeVisible(false);
  }
  overlay.setViewLabel();

  /* ---------- 持久化 ---------- */
  let persistTimer: number | undefined;
  function schedulePersist(): void {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => savePanel(store.panelSnapshot()), 350);
  }
  let viewTimer: number | undefined;
  function persistView(): void {
    if (viewTimer) window.clearTimeout(viewTimer);
    viewTimer = window.setTimeout(
      () => saveView({ mode: rig.mode, hingeDeg: hinge.current }),
      250,
    );
  }

  /* ---------- 首次手势:解锁音频 + 自动上电(INT-8 / UI-7) ---------- */
  let started = false;
  async function firstGesture(): Promise<void> {
    if (started) return;
    started = true;
    await engine.ensureStarted();
    if (!engine.workletReady) {
      overlay.showToast("滤波器:兼容模式(4×Biquad 级联)");
    }
    engine.syncAll();
    ensurePowered();
    overlay.hideGate();
    if (!hasOnboarded()) {
      onboarding.start();
    }
  }
  function ensurePowered(): void {
    if (!store.bool("power")) store.set("power", true);
  }
  window.addEventListener("pointerdown", () => void firstGesture(), { capture: true });
  window.addEventListener("keydown", () => void firstGesture(), { capture: true });

  /* ---------- 麦克风(EXT-1) ---------- */
  store.subscribe("extOn", async (v) => {
    if (v) {
      try {
        await engine.enableMic();
      } catch {
        overlay.showToast("麦克风不可用:请检查浏览器授权");
        store.set("extOn", false);
      }
    }
  });

  /* ---------- 挂音防护(INT-10) ---------- */
  const allOff = () => {
    engine.allNotesOff();
    qwerty.releaseAll();
    interactions.releaseAllKeys();
  };
  window.addEventListener("blur", allOff);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) allOff();
  });

  /* ---------- WebGL 上下文丢失 ---------- */
  stage.renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const gates = document.querySelectorAll(".mobile-gate");
    const last = gates[gates.length - 1] as HTMLElement | undefined;
    if (last) last.style.display = "flex";
  });

  /* ---------- 开场运镜(VIEW-6) ---------- */
  rig.onIntroDone = () => {
    /* 运镜结束后显示「点击任意处开启声音」提示(UI-7) */
  };
  const skipIntroOnInput = (e: Event) => {
    if (rig.introRunning) {
      if (e.type === "pointerdown" || e.type === "keydown") rig.skipIntro();
    }
  };
  window.addEventListener("pointerdown", skipIntroOnInput, { capture: true });
  window.addEventListener("keydown", skipIntroOnInput, { capture: true });
  requestAnimationFrame(() => rig.startIntro());

  /* ---------- 主循环 ---------- */
  const clock = new ClockShim();
  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.05);
    rig.update(dt);
    hinge.update(dt);
    engine.pollOverload();
    onboarding.update();
    stage.render(clock.elapsedTime);
    requestAnimationFrame(frame);
  }
  frame();

  /* ---------- ?selftest ---------- */
  if (new URLSearchParams(location.search).has("selftest")) {
    void import("./audio/selftest").then((m) => m.runSelfTestUI());
  }

  /* QA 调试钩子:浏览器内可断言状态(非 UI) */
  (window as unknown as { __aether?: object }).__aether = {
    store,
    engine,
    rig,
    hinge,
    model,
    onboarding,
  };
}

/* 轻量时钟 */
class ClockShim {
  private last = performance.now();
  elapsedTime = 0;
  getDelta(): number {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.elapsedTime += dt;
    return dt;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
