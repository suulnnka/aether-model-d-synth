/**
 * Aether Model D — application entry point.
 *
 * Boot order matters here, because two of the requirements pull in opposite
 * directions:
 *
 *   - PRD AUD-14 wants the audio context created on the first user gesture.
 *   - PRD 1.3 wants the instrument on screen fast.
 *
 * So the 3D scene boots and renders immediately behind a full-screen "click to
 * start" gate, and the audio graph is only built when that gate is clicked. The
 * gate covers the whole viewport, which also means the first click cannot be
 * swallowed by a knob or a key.
 *
 * Everything below is wiring. The behaviour lives in the modules it connects.
 */

import './styles/app.css';

import { SynthEngine, filterModeLabel } from './audio/Engine.ts';
import { PointerController, type NoteSink } from './interaction/gestures.ts';
import { createKeyboardDriver } from './interaction/keyboard.ts';
import { Picker } from './interaction/picker.ts';
import { buildInstrument } from './model/instrument.ts';
import { createStage, type Stage } from './scene/stage.ts';
import { ParamStore } from './state/ParamStore.ts';
import { Persister, defaultView, loadPersisted, type PersistedView } from './state/persist.ts';
import { createOverlay } from './ui/overlay.ts';
import type { ViewMode } from './scene/cameraRig.ts';

/* ===========================================================================
 * DOM affordances from index.html
 * ========================================================================= */

const stageHost = document.getElementById('stage');
const boot = document.getElementById('boot');
const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const fatal = document.getElementById('fatal');
const fatalMessage = document.getElementById('fatal-message');
const fatalReload = document.getElementById('fatal-reload');

if (!stageHost) throw new Error('#stage missing from index.html');

function setBoot(pct: number, message: string): void {
  if (bootFill) bootFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (bootStatus) bootStatus.textContent = message;
}

function finishBoot(): void {
  boot?.setAttribute('data-done', '1');
}

function showFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (fatalMessage) fatalMessage.textContent = message;
  fatal?.removeAttribute('hidden');
  boot?.setAttribute('data-done', '1');
}

fatalReload?.addEventListener('click', () => window.location.reload());

/* ===========================================================================
 * Boot
 * ========================================================================= */

const reducedMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

setBoot(8, '读取面板状态…');
const saved = loadPersisted();
const store = new ParamStore(saved?.params ?? undefined);
const view: PersistedView = saved?.view ?? defaultView();

setBoot(28, '构建 3D 模型与丝印…');

/** Filled in once the audio graph exists; until then notes go nowhere. */
const engineRef: { current: SynthEngine | null } = { current: null };
const noteSink: NoteSink = {
  noteOn: (midi) => engineRef.current?.noteOn(midi),
  noteOff: (midi) => engineRef.current?.noteOff(midi),
  panic: () => engineRef.current?.panic(),
};

let stage: Stage;
try {
  stage = createStage({
    store,
    host: stageHost,
    onFrame: (dt) => {
      pointer.update(dt);
      refreshReadout();
    },
    onViewSettled: (mode) => {
      overlay.setTransitioning(false);
      overlay.setView(mode);
    },
  });
} catch (error) {
  showFatal(error);
  throw error;
}

setBoot(72, '布置灯光与后期…');

/* ===========================================================================
 * Overlay
 * ========================================================================= */

const overlay = createOverlay({
  host: document.body,
  reducedMotion,
  handlers: {
    onSetView: (mode) => setView(mode),
    onTogglePanel: () => {
      stage.noteActivity();
      stage.setPanelRaised(!stage.getPanelRaised());
      view.panelAngle = stage.instrument.hingeAngle;
      overlay.setPanelRaised(stage.getPanelRaised());
      persist();
    },
    onResetView: () => {
      stage.noteActivity();
      stage.resetView();
    },
    onToggleAutoRotate: (on) => {
      stage.setAutoRotate(on);
      view.autoRotate = on;
      persist();
    },
    onToggleBloom: (on) => {
      stage.post.setBloomEnabled(on);
    },
    onRestoreFactory: () => {
      store.resetAll();
      stage.setPanelRaised(true);
      view.panelAngle = stage.instrument.hingeAngle;
      overlay.setPanelRaised(true);
      persist();
    },
    onUnlock: () => void unlockAudio(),
    onOnboardingDone: () => {
      view.onboardingDone = true;
      persist();
    },
  },
});

overlay.setView(view.mode);
overlay.setPanelRaised(view.panelAngle > 1);
overlay.setAutoRotate(view.autoRotate);

/* ===========================================================================
 * View control
 * ========================================================================= */

let currentMode: ViewMode = view.mode;

function setView(mode: ViewMode): void {
  if (mode === currentMode) return;
  // PRD HINGE-4: remember the 3D angle so returning restores it.
  if (currentMode === '3d') view.panelAngle = stage.instrument.hingeAngle;
  currentMode = mode;
  view.mode = mode;

  overlay.setTransitioning(true);
  stage.setViewMode(mode);
  // 2D always lays the panel flat; 3D returns to the remembered angle.
  if (mode === '3d') {
    stage.setPanelAngle(view.panelAngle);
    overlay.setPanelRaised(view.panelAngle > 1);
  } else {
    overlay.setPanelRaised(false);
  }
  persist();
}

/* ===========================================================================
 * Instrument interaction
 * ========================================================================= */

setBoot(88, '接线控件与琴键…');

const picker = new Picker(stage.camera, {
  controlTargets: stage.instrument.pickList.map((entry) => ({
    object: entry.object,
    controlId: entry.controlId,
  })),
  keyTargets: stage.instrument.keyboard.pickTargets,
  midiForHit: (object, instanceId) =>
    stage.instrument.keyboard.midiForHit(object, instanceId),
  panelEdge: stage.instrument.panelEdge,
});

const pointer = new PointerController({
  canvas: stage.renderer.domElement,
  camera: stage.camera,
  picker,
  store,
  views: stage.instrument.views,
  keyboard: stage.instrument.keyboard,
  keyOutline: stage.instrument.keyOutline,
  rig: stage.rig,
  notes: noteSink,
  hinge: {
    get: () => stage.instrument.hingeAngle,
    set: (deg) => {
      stage.setPanelAngle(deg, true);
      view.panelAngle = deg;
    },
  },
  events: {
    onHover: (hover, x, y) => {
      overlay.showTooltip(
        hover ? { text: hover.text, value: hover.value, hint: hover.hint } : null,
        x,
        y,
      );
    },
    onActivity: () => stage.noteActivity(),
    onPanelAngle: (deg, x, y) => {
      overlay.setPanelAngle(deg, x, y);
      overlay.setPanelRaised(deg > 1);
      persist();
    },
  },
});

const keyboardDriver = createKeyboardDriver({
  notes: noteSink,
  keyboard: stage.instrument.keyboard,
  commands: {
    toggleView: () => setView(currentMode === '3d' ? '2d' : '3d'),
    togglePanel: () => {
      if (currentMode !== '3d') return;
      stage.setPanelRaised(!stage.getPanelRaised());
      overlay.setPanelRaised(stage.getPanelRaised());
      view.panelAngle = stage.instrument.hingeAngle;
      persist();
    },
    toggleHelp: () => overlay.toggleHelp(),
  },
  onBaseChange: () => refreshBaseReadout(),
});

overlay.setKeyboardMap(keyboardDriver.describe());
overlay.setKeyboardBase(keyboardDriver.baseMidi);
overlay.setFilterMode('梯形滤波器 — AudioWorklet');

/* ===========================================================================
 * Audio unlock (PRD AUD-14)
 * ========================================================================= */

let unlocking = false;

async function unlockAudio(): Promise<void> {
  if (engineRef.current || unlocking) return;
  unlocking = true;
  overlay.hideUnlock();
  setBoot(94, '启动音频引擎…');

  try {
    const engine = await SynthEngine.create(store);
    engineRef.current = engine;
    // PRD 8.6: the readout tells the user which filter is actually running.
    overlay.setFilterMode(filterModeLabel(engine.status));
  } catch (error) {
    console.error('[aether] audio engine failed to start', error);
    overlay.setFilterMode('音频引擎未能启动');
  } finally {
    unlocking = false;
  }

  if (!view.onboardingDone) overlay.showOnboarding();
}

/* ===========================================================================
 * Persistence (PRD ST-2)
 * ========================================================================= */

const persister = new Persister();

function persist(): void {
  persister.schedule(() => ({
    version: 1,
    params: store.snapshot(),
    view,
  }));
}

const unsubscribePersist = store.subscribeAll(() => {
  view.panelAngle =
    currentMode === '3d' ? stage.instrument.hingeAngle : view.panelAngle;
  persist();
});

/* ===========================================================================
 * Readout
 * ========================================================================= */

let lastNote: number | null = null;
let lastMode: ViewMode | null = null;
let lastWorklet: boolean | null = null;

/** Push the sounding-note readout, but only when something actually changed. */
function refreshReadout(): void {
  const note = engineRef.current?.soundingNote ?? null;
  const worklet = engineRef.current?.status.usingWorklet ?? true;
  if (note === lastNote && currentMode === lastMode && worklet === lastWorklet) {
    return;
  }
  lastNote = note;
  lastMode = currentMode;
  lastWorklet = worklet;
  overlay.setReadout(note, currentMode, worklet);
}

function refreshBaseReadout(): void {
  overlay.setKeyboardBase(keyboardDriver.baseMidi);
}

/* ===========================================================================
 * Robustness (PRD 9, INT-9)
 * ========================================================================= */

// Stuck-note guard: tab switch, blur, page hide and pointer cancel all panic.
const panicEverything = (): void => {
  pointer.cancel();
  stage.instrument.keyboard.releaseAll();
  keyboardDriver.releaseAll();
  engineRef.current?.panic();
};

window.addEventListener('blur', panicEverything);
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  engineRef.current?.setPageMuted(hidden);
  if (hidden) panicEverything();
});

// WebGL context loss must not leave a blank page (PRD 9).
stage.renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  stage.stop();
  showFatal(new Error('WebGL 上下文丢失。请刷新页面以重新加载场景。'));
});

// Escape closes any open sheet.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && overlay.sheetsOpen) {
    overlay.closeSheets();
    event.preventDefault();
  }
});

// Resize / DPI changes (PRD 9).
let resizeFrame = 0;
const onResize = (): void => {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    stage.resize();
  });
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

/* ===========================================================================
 * Go
 * ========================================================================= */

stage.setPanelAngle(view.panelAngle, true);
stage.start();
setBoot(100, '就绪');
window.setTimeout(finishBoot, reducedMotion ? 60 : 320);
overlay.showUnlock();

// Expose a tiny handle for manual poking in the console; not used by the app.
declare global {
  interface Window {
    aether?: {
      store: ParamStore;
      stage: Stage;
      engine: () => SynthEngine | null;
      instrument: ReturnType<typeof buildInstrument>;
    };
  }
}
window.aether = {
  store,
  stage,
  engine: () => engineRef.current,
  instrument: stage.instrument,
};

// Keep the keyboard base readout in sync when persistence restores a base.
refreshBaseReadout();

window.addEventListener('beforeunload', () => {
  persister.flush();
  unsubscribePersist();
  keyboardDriver.dispose();
  pointer.dispose();
  overlay.dispose();
  engineRef.current?.dispose();
  stage.dispose();
});
