/**
 * 入口(main.ts)
 * 装配:状态 → 场景 → 模型 → 音频 → 交互 → 覆盖层 → 输入。
 * 数据流:手势 → ParamStore → (3D 姿态 + 音频自动化);预设载入反向亦然。
 */
import "./styles.css";
import * as THREE from "three";
import { createScene } from "./scene/scene";
import { createSynth } from "./model/synth";
import { createInteractions } from "./interaction/interactions";
import { createOverlay, isNarrow, showMobileGate } from "./ui/overlay";
import { createKeyboardInput } from "./input/qwerty";
import { createMidiInput } from "./input/midi";
import { engine } from "./audio/engine";
import { params, CONTROL_BY_ID } from "./state/params";
import { applyPreset, DEFAULT_PRESET_ID } from "./state/presets";
import { loadState, saveState, loadView, saveView, hasOnboarded, setOnboarded } from "./state/persist";

const app = document.getElementById("app") as HTMLElement;
const boot = document.getElementById("boot-loading");

function hideBoot(): void {
  if (!boot) return;
  boot.classList.add("done");
  setTimeout(() => boot.remove(), 600);
}

// ── 窄屏(UI-5):不渲染 3D ────────────────────────────────────────────
if (isNarrow()) {
  showMobileGate(app);
  hideBoot();
} else {
  boot3D();
}

function boot3D(): void {
  const container = document.createElement("div");
  container.className = "stage";
  app.appendChild(container);

  // 1) 状态恢复
  loadState();
  const view = loadView();

  // 2) 模型(先建模型,材质库里的台面材质要给场景用)
  const model = createSynth(8);
  model.setPanelAngle(view.panelAngle);

  // 3) 场景
  const scene = createScene({
    container,
    tableMaterial: model.materials.table,
    initialView: view.mode,
    initialPanelAngle: view.mode === "2d" ? 0 : view.panelAngle,
  });
  scene.scene.add(model.root);

  let remembered3DAngle = view.panelAngle;
  scene.setPreferredPanelAngle(remembered3DAngle);
  scene.onPanelAngleChange((deg) => {
    model.setPanelAngle(deg);
    if (scene.getView() === "3d") {
      remembered3DAngle = deg;
      scene.setPreferredPanelAngle(deg);
      saveView({ mode: "3d", panelAngle: deg });
    }
    overlay?.setPanelLabel(deg);
  });
  scene.onViewChange((mode) => {
    saveView({ mode, panelAngle: remembered3DAngle });
    overlay?.setView(mode);
  });

  // 4) 覆盖层
  const overlay = createOverlay(
    app,
    scene,
    model,
    {
      onSelectPreset: () => {
        model.syncAll();
        saveState();
      },
      onToggleView: () => {
        scene.setView(scene.getView() === "3d" ? "2d" : "3d");
      },
      onTogglePanel: () => {
        const target = scene.getPanelAngle() > 30 ? 0 : remembered3DAngle > 5 ? remembered3DAngle : 50;
        scene.setPanelAngle(target);
      },
      onSkipIntro: () => scene.skipIntro(),
      onOnboardingDone: () => {
        setOnboarded();
        ensurePower(true);
      },
      onGesture: () => void ensureAudio(),
    }
  );
  overlay.setView(view.mode);
  overlay.setPanelLabel(scene.getPanelAngle());

  // 5) 参数 → 持久化
  params.subscribe(() => saveState());
  params.subscribeBulk(() => saveState());

  // 6) 交互
  const interactions = createInteractions(scene, model, {
    onHover: (info) => {
      if (info) overlay.showTooltip(info.id, info.x, info.y);
      else overlay.hideTooltip();
    },
    onGesture: () => void ensureAudio(),
    onChange: (id) => {
      if (id === "tunerOn") model.setTunerActive(params.getBool("tunerOn"));
      if (id === "power") ensurePower(params.getBool("power"));
      saveState();
    },
    onExternalRequest: async () => {
      const ok = await engine.enableExternalInput();
      if (!ok) {
        params.set("externalOn", 0);
        overlay.toast("无法访问麦克风,外部输入已关闭");
      }
    },
    onPanelAngle: () => {
      /* 场景侧已缓动,此处仅用于未来扩展 */
    },
  });
  interactions.setPower(params.getBool("power"));
  model.setPowerVisual(params.getBool("power"));

  // 7) 输入
  createKeyboardInput({
    noteOn: (m) => interactions.noteOn(m),
    noteOff: (m) => interactions.noteOff(m),
    onGesture: () => void ensureAudio(),
    onToggleView: () => scene.setView(scene.getView() === "3d" ? "2d" : "3d"),
    onTogglePanel: () => {
      const target = scene.getPanelAngle() > 30 ? 0 : remembered3DAngle > 5 ? remembered3DAngle : 50;
      scene.setPanelAngle(target);
    },
  });
  void createMidiInput({
    noteOn: (m) => interactions.noteOn(m),
    noteOff: (m) => interactions.noteOff(m),
    onGesture: () => void ensureAudio(),
  });

  // 8) 过载指示
  engine.onOverload = (on) => model.setOverload(on);

  // 9) 音频(须由用户手势触发)
  let audioStarting = false;
  async function ensureAudio(): Promise<void> {
    if (engine.ready || audioStarting) return;
    audioStarting = true;
    try {
      await engine.start();
      overlay.setAudioReady(true);
      overlay.setFilterFallback(engine.filterMode === "biquad");
      engine.setPower(params.getBool("power"));
    } catch {
      overlay.toast("音频启动失败,请检查浏览器的声音权限");
    } finally {
      audioStarting = false;
    }
  }

  function ensurePower(on: boolean): void {
    params.set("power", on ? 1 : 0);
    interactions.setPower(on);
    model.setPowerVisual(on);
    engine.setPower(on);
  }

  // 首次点击自动上电(INT-8)
  const firstGesture = (): void => {
    scene.skipIntro();
    void ensureAudio();
    if (!params.getBool("power")) ensurePower(true);
    window.removeEventListener("pointerdown", firstGesture);
  };
  window.addEventListener("pointerdown", firstGesture);

  // 10) 开场运镜 + 引导
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (hasOnboarded()) {
    overlay.setAudioReady(true); // 运镜期间先不打扰(VIEW-6)
    if (reduced) scene.skipIntro();
    else scene.playIntro();
    scene.onIntroEnd(() => overlay.setAudioReady(engine.ready));
  } else {
    applyPreset(DEFAULT_PRESET_ID);
    model.syncAll();
    scene.skipIntro();
    setTimeout(() => overlay.startOnboarding(), 420);
  }

  // 11) 主循环
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    scene.render(dt);
    overlay.updateAnchors();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 12) resize / 上下文丢失
  const onResize = (): void => scene.resize();
  window.addEventListener("resize", onResize);
  scene.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    overlay.toast("图形上下文丢失,请刷新页面", 8000);
  });

  scene.resize();
  hideBoot();

  // 供调试
  Object.assign(window as unknown as Record<string, unknown>, {
    __aether: { scene, model, params, controls: CONTROL_BY_ID, three: THREE },
  });
}
