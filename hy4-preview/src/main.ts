/**
 * Aether Model D — 主入口
 * 装配:场景 / 模型 / 音频 / 交互 / UI / 持久化,并驱动主循环。
 */
import "./styles.css";
import * as THREE from "three";
import { setupScene, type ViewMode } from "./scene/scene";
import { buildSynth } from "./model/synth";
import { SynthEngine } from "./audio/engine";
import { ParamStore } from "./state/params";
import { bindPersistence, clearPersisted, loadPersisted } from "./state/persist";
import { InteractionManager } from "./interaction/interactions";
import { Overlay } from "./ui/overlay";

const canvas = document.createElement("canvas");
canvas.className = "webgl";
document.getElementById("app")!.appendChild(canvas);

/* ---------- 参数仓库与恢复(ST-2) ---------- */
const store = new ParamStore();
const saved = loadPersisted();
if (saved?.params) store.load(saved.params);

/* ---------- 场景与模型 ---------- */
const rig = setupScene(canvas);
const renderer = rig.renderer;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const synth = buildSynth(store, maxAniso);
rig.scene.add(synth.root);

/* ---------- 音频引擎(AUD-14:首次手势创建) ---------- */
const engine = new SynthEngine(store);
let audioReady = false;

/* ---------- 覆盖层 ---------- */
const layer = document.createElement("div");
layer.className = "aether-layer";
document.getElementById("app")!.appendChild(layer);
const tooltip = document.createElement("div");
tooltip.className = "aether-tooltip";
layer.appendChild(tooltip);

let currentHinge = saved?.view?.hingeDeg ?? 50;
let viewMode: ViewMode = saved?.view?.mode === "2d" ? "2d" : "3d";

const interactions = new InteractionManager(canvas, store, synth, engine, rig.controls, tooltip, {
  toggleView: () => toggleView(),
  toggleHinge: () => toggleHinge(),
  toggleHelp: () => overlay.toggleHelp(),
});
InteractionManager.cameraRef.camera = rig.camera;

const overlay = new Overlay(layer, {
  toggleView: () => toggleView(),
  toggleHinge: () => toggleHinge(),
  onFactoryReset: () => {
    clearPersisted();
    store.resetAll();
    currentHinge = 50;
    viewMode = "3d";
    applyView(viewMode, false);
    interactions.setHingeTarget(50, false);
  },
});

overlay.seenGuide = saved?.seenGuide ?? false;
overlay.setDegraded(false);
overlay.setViewMode(viewMode);

/* ---------- 视角与铰链 ---------- */

function applyView(mode: ViewMode, animate = true) {
  viewMode = mode;
  overlay.setViewMode(mode);
  if (mode === "2d") {
    // HINGE-4:切入 2D 前记住角度,自动放平
    if (rig.mode() === "3d") currentHinge = Math.max(currentHinge, interactions.rememberedHingeDeg || 50);
    interactions.setHingeTarget(0, animate);
    rig.setView("2d");
  } else {
    rig.setView("3d");
    interactions.setHingeTarget(currentHinge > 1 ? currentHinge : 50, animate);
  }
}

function toggleView() {
  applyView(viewMode === "3d" ? "2d" : "3d");
}

function toggleHinge() {
  if (viewMode !== "3d") return;
  const raised = interactions.rememberedHingeDeg > 2;
  const next = raised ? 0 : (currentHinge >= 2 ? currentHinge : 50);
  if (next > 2) currentHinge = next;
  interactions.setHingeTarget(next);
  overlay.setHingeRaised(next > 2);
}

/* ---------- 持久化(ST-2) ---------- */
bindPersistence(store, () => ({ mode: viewMode, hingeDeg: Math.round(currentHinge) }), () => overlay.seenGuide);

/* ---------- 首次手势:创建音频上下文(AUD-14) ---------- */
async function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  await engine.init();
  await engine.resume();
  overlay.hideSoundHint();
  overlay.setDegraded(engine.degraded);
  overlay.skipGuideIfShown();
}
window.addEventListener("pointerdown", () => void ensureAudio(), { once: false });
window.addEventListener("keydown", () => void ensureAudio(), { once: false });

if (!saved?.seenGuide) {
  overlay.showGuide();
  overlay.showSoundHint();
} else {
  overlay.showSoundHint();
}

/* ---------- 启动状态 ---------- */
synth.setHinge(viewMode === "2d" ? 0 : currentHinge);
overlay.setHingeRaised(viewMode === "3d" && currentHinge > 2);
if (viewMode === "2d") {
  // 直接摆到 2D 机位(无动画)
  rig.setView("3d"); // 占位以同步内部状态
  requestAnimationFrame(() => {
    rig.setView("2d");
    overlay.setViewMode("2d");
  });
  viewMode = "2d";
  overlay.setViewMode("2d");
}

/* ---------- 主循环 ---------- */
const clock = new THREE.Clock();
let frames = 0;
let fpsTime = 0;

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  rig.update(dt);
  synth.tick(dt);
  interactions.tick(dt);
  renderer.render(rig.scene, rig.camera);

  // FPS 粗测(开发观察用,不上屏)
  frames++;
  fpsTime += dt;
  if (fpsTime >= 2) {
    void (frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(loop);
}
loop();

/* ---------- resize / DPI ---------- */
const camera = rig.camera;
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* WebGL 上下文丢失保护(鲁棒性) */
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  const div = document.createElement("div");
  div.className = "aether-soundhint";
  div.textContent = "图形上下文丢失,请刷新页面";
  layer.appendChild(div);
});

/* 调试出口(自动化验证用) */
declare global {
  interface Window {
    __aether?: { rig: typeof rig; synth: typeof synth; store: ParamStore; engine: SynthEngine };
  }
}
window.__aether = { rig, synth, store, engine };
