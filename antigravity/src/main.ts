import "./styles.css";
import { SynthEngine } from "./audio/engine.ts";
import { MidiInput } from "./input/midi.ts";
import { QwertyInput } from "./input/qwerty.ts";
import { Interactions } from "./interaction/interactions.ts";
import { createSynthModel } from "./model/synth.ts";
import { CameraRig } from "./scene/cameraRig.ts";
import { createStage } from "./scene/stage.ts";
import { ParamStore } from "./state/paramStore.ts";
import {
  decodeParamsFromQuery,
  loadActivePresetId,
  loadPersistedParams,
  loadUserOptions,
  loadViewState,
  savePersistedParams,
  saveUserOptions,
  saveViewState,
} from "./state/persist.ts";
import { DEFAULT_PRESET_ID, getPresetById } from "./state/presets.ts";
import type { ViewMode, ViewState } from "./state/types.ts";
import { OnboardingTour } from "./ui/onboarding.ts";
import { StudioOverlay } from "./ui/overlay.ts";

function setBootProgress(pct: number): void {
  const el = document.getElementById("boot-progress");
  if (el) el.style.width = `${pct}%`;
}

function hideBootScreen(): void {
  const boot = document.getElementById("boot-screen");
  if (!boot) return;
  boot.classList.add("done");
  window.setTimeout(() => boot.remove(), 500);
}

function main(): void {
  const app = document.getElementById("app");
  const stageHost = document.getElementById("stage");
  if (!app || !stageHost) {
    throw new Error("Missing #app or #stage mount elements");
  }

  setBootProgress(20);

  // 1. State restoration (URL query params take precedence over localStorage, else default preset)
  const urlParams = decodeParamsFromQuery(window.location.search);
  const savedParams = loadPersistedParams();
  const options = loadUserOptions();
  const viewState: ViewState = loadViewState();
  let remembered3DAngle = viewState.panelAngleDeg;

  const store = new ParamStore();
  let activePresetId: string | null = loadActivePresetId();
  if (urlParams) {
    store.applyPartial(urlParams, false);
    activePresetId = null;
  } else if (savedParams) {
    store.applyPartial(savedParams, false);
  } else {
    const def = getPresetById(DEFAULT_PRESET_ID);
    if (def) {
      store.applyPartial(def.params, false);
      activePresetId = def.id;
    }
  }

  setBootProgress(45);

  // 2. Three.js Stage, 3D Model, Camera Rig
  const stage = createStage(stageHost);
  const model = createSynthModel(store, stage.maxAnisotropy);
  stage.scene.add(model.root);
  stage.attachTable(model.materials.table);

  const rig = new CameraRig(stage);
  if (viewState.mode === "2d") {
    model.setPanelAngle(0);
    rig.setMode("2d", viewState.cameraPreset, true);
  } else {
    model.setPanelAngle(remembered3DAngle);
    rig.setMode("3d", viewState.cameraPreset, true);
  }

  setBootProgress(72);

  // 3. Web Audio Engine
  let overlay: StudioOverlay | null = null;
  const engine = new SynthEngine(store, {
    onOverload: (overload, level) => {
      model.setOverload(overload, level);
      overlay?.setOverload(overload);
    },
    onStatus: (ready, err) => {
      overlay?.setAudioReady(ready);
      if (err) overlay?.showToast(`Audio init warning: ${err}`);
    },
  });

  const ensureAudio = () => {
    void engine.ensureStarted().then(() => {
      overlay?.setAudioReady(engine.isReady());
    });
  };

  // Sync param changes -> 3D pose + audio + debounced persistence
  let saveTimer: number | null = null;
  store.subscribe((changed) => {
    for (const id of changed) {
      model.syncControl(id);
      engine.syncControl(id);
    }
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      savePersistedParams(store.snapshot());
    }, 180);
  });

  // 4. Overlay & Onboarding Tour
  const tour = new OnboardingTour(app, rig, model, {
    onPanelAngle: (deg) => {
      overlay?.setTiltLabel(deg);
    },
    onComplete: () => {
      options.onboardingCompleted = true;
      saveUserOptions(options);
      ensureAudio();
      overlay?.showToast("Tour complete — enjoy playing Aether Model D!");
    },
    onSkip: () => {
      options.onboardingCompleted = true;
      saveUserOptions(options);
    },
  });

  overlay = new StudioOverlay(app, store, engine, model, rig, options, {
    onViewChange: (mode: ViewMode) => {
      viewState.mode = mode;
      if (mode === "2d") {
        remembered3DAngle = model.getPanelAngle();
        model.setPanelAngle(0);
        rig.setMode("2d");
      } else {
        model.setPanelAngle(remembered3DAngle > 5 ? remembered3DAngle : 52);
        rig.setMode("3d", viewState.cameraPreset);
      }
      overlay?.setViewMode(mode);
      overlay?.setTiltLabel(model.getPanelAngle());
      saveViewState(viewState);
    },
    onCameraPreset: (preset) => {
      viewState.mode = "3d";
      viewState.cameraPreset = preset;
      model.setPanelAngle(remembered3DAngle > 5 ? remembered3DAngle : 52);
      rig.goToPreset(preset);
      overlay?.setViewMode("3d");
      overlay?.setTiltLabel(model.getPanelAngle());
      saveViewState(viewState);
    },
    onPanelAngle: (deg) => {
      if (rig.getMode() === "2d" && deg > 0) {
        viewState.mode = "3d";
        rig.setMode("3d", viewState.cameraPreset);
        overlay?.setViewMode("3d");
      }
      model.setPanelAngle(deg);
      remembered3DAngle = deg;
      viewState.panelAngleDeg = deg;
      saveViewState(viewState);
    },
    onPresetApplied: (preset) => {
      activePresetId = preset.id;
      savePersistedParams(store.snapshot());
    },
    onResetPatch: () => {
      store.resetToDefaults(true);
      model.syncAll();
      engine.syncAll();
      savePersistedParams(store.snapshot());
    },
    onOctaveShift: (delta) => qwerty.shiftOctave(delta),
    onPanic: () => {
      qwerty.releaseAll();
      engine.panic();
      overlay?.setNoteReadout(null);
    },
    onStartTour: () => tour.start(),
    onFirstGesture: ensureAudio,
  });

  overlay.setViewMode(viewState.mode);
  overlay.setActiveCameraButton(viewState.cameraPreset);
  overlay.setTiltLabel(model.getPanelAngle());
  overlay.restorePresetName(urlParams ? null : activePresetId);
  if (urlParams) {
    overlay.showToast("Loaded shared patch from URL!");
  }

  // 5. Interactions & Hardware Input (Raycast + QWERTY + MIDI)
  const interactions = new Interactions(stage, rig, model, store, engine, {
    onFirstGesture: ensureAudio,
    onHover: (info) => overlay?.showHoverTooltip(info),
    onDragChange: (info) => overlay?.showMagnifier(info),
    onControlEdited: (id) => {
      if (id !== "pitchWheel" && id !== "modWheel") {
        overlay?.setActivePresetLabel("Custom Patch", null);
      }
    },
    onExternalEnabledRequest: async () => {
      await engine.ensureStarted();
      const ok = await engine.toggleExternalInput(true);
      if (!ok) {
        overlay?.showToast("External microphone input unavailable or permission denied.");
      } else {
        overlay?.showToast("External audio input routed into Ladder Filter.");
      }
      return ok;
    },
  });

  const qwerty = new QwertyInput(store, engine, model, {
    onFirstGesture: ensureAudio,
    onOctaveChange: (baseMidi) => overlay?.setOctaveBase(baseMidi),
    onViewToggle: () => {
      const next: ViewMode = rig.getMode() === "3d" ? "2d" : "3d";
      viewState.mode = next;
      if (next === "2d") {
        remembered3DAngle = model.getPanelAngle();
        model.setPanelAngle(0);
        rig.setMode("2d");
      } else {
        model.setPanelAngle(remembered3DAngle > 5 ? remembered3DAngle : 52);
        rig.setMode("3d", viewState.cameraPreset);
      }
      overlay?.setViewMode(next);
      overlay?.setTiltLabel(model.getPanelAngle());
      saveViewState(viewState);
    },
    onNoteActivity: (midi) => overlay?.setNoteReadout(midi),
  });
  overlay.setOctaveBase(qwerty.getBaseMidi());

  const midi = new MidiInput(store, engine, model, {
    onDeviceChange: (name) => overlay?.setMidiDevice(name),
    onNoteActivity: (midiNote) => overlay?.setNoteReadout(midiNote),
  });

  // Expose debug handle for automated verification without polluting UI
  (window as unknown as Record<string, unknown>).__AETHER__ = {
    store,
    engine,
    model,
    rig,
    stage,
  };

  setBootProgress(100);
  hideBootScreen();

  if (!options.onboardingCompleted && !urlParams) {
    window.setTimeout(() => tour.start(), 650);
  }

  // 6. Render Loop
  let lastTime = performance.now();
  let frameCount = 0;
  let rafId = 0;
  const tick = (now: number) => {
    rafId = window.requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    rig.update(dt);
    model.update(dt);
    stage.renderer.render(stage.scene, stage.camera);

    frameCount++;
    if (frameCount % 2 === 0) {
      overlay?.drawScope();
    }
  };
  rafId = window.requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(rafId);
    interactions.dispose();
    qwerty.dispose();
    midi.dispose();
    model.dispose();
    stage.dispose();
    engine.dispose();
  });
}

main();
