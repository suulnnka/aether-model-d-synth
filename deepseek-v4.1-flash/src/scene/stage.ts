/**
 * Stage — the render side of the app.
 *
 * Owns the renderer, scene, camera rig, environment, lighting, post stack and
 * the instrument, plus the two animated state machines that are purely visual:
 * the hinge tween and the idle showcase rotation.
 *
 * Everything the app needs to *do* (change view, raise the panel) is a method
 * here, so `main.ts` never touches three.js directly.
 */

import * as THREE from 'three';
import {
  HINGE_DEFAULT_DEG,
  HINGE_MAX_DEG,
  HINGE_MIN_DEG,
} from '../model/layout.ts';
import { buildInstrument, type Instrument } from '../model/instrument.ts';
import type { ParamStore } from '../state/ParamStore.ts';
import { CameraRig, type ViewMode } from './cameraRig.ts';
import {
  createBackdrop,
  createContactShadow,
  createEnvironment,
  createTable,
} from './environment.ts';
import { createLighting } from './lighting.ts';
import { createPost, type PostHandle } from './post.ts';
import { MAX_PIXEL_RATIO, createRenderer, type RendererHandle } from './renderer.ts';

const HINGE_SECONDS = 0.5;
const HINGE_SECONDS_REDUCED = 0.1;

/** Idle time before the showcase rotation starts (PRD VIEW-6). */
const AUTOROTATE_IDLE_SECONDS = 15;
const AUTOROTATE_RATE = 0.11; // radians per second

export interface StageOptions {
  readonly store: ParamStore;
  readonly host: HTMLElement;
  readonly onFrame?: (dt: number) => void;
  readonly onViewSettled?: (mode: ViewMode) => void;
}

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly instrument: Instrument;
  readonly renderer: THREE.WebGLRenderer;
  readonly post: PostHandle;
  readonly usingBloom: boolean;
  /** Notify the stage that the user did something (resets the idle timer). */
  noteActivity(): void;
  setViewMode(mode: ViewMode): void;
  getViewMode(): ViewMode;
  setPanelRaised(raised: boolean): void;
  setPanelAngle(deg: number, immediate?: boolean): void;
  getPanelRaised(): boolean;
  setAutoRotate(on: boolean): void;
  getAutoRotate(): boolean;
  setReducedMotion(on: boolean): void;
  resetView(): void;
  resize(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createStage(options: StageOptions): Stage {
  const { store, host, onFrame, onViewSettled } = options;

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rendererHandle: RendererHandle = createRenderer(host);
  const { renderer } = rendererHandle;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    host.clientWidth / Math.max(1, host.clientHeight),
    0.02,
    60,
  );

  const environment = createEnvironment(renderer);
  scene.environment = environment.texture;
  scene.add(createBackdrop());
  scene.add(createTable());
  scene.add(createContactShadow());

  const lighting = createLighting();
  scene.add(lighting.root);

  const instrument = buildInstrument(store);
  scene.add(instrument.root);

  const rig = new CameraRig(camera, {
    reducedMotion,
    onSettled: (mode) => onViewSettled?.(mode),
  });

  const post = createPost(renderer, scene, camera);

  /* --------------------------------------------------------------- hinge */

  let panelAngle = HINGE_DEFAULT_DEG;
  let hingeFrom = panelAngle;
  let hingeTo = panelAngle;
  let hingeT = 1;
  let raised = true;

  const hingeDuration = (): number =>
    reducedMotion ? HINGE_SECONDS_REDUCED : HINGE_SECONDS;

  const setPanelAngle = (deg: number, immediate = false): void => {
    const clamped = Math.min(HINGE_MAX_DEG, Math.max(HINGE_MIN_DEG, deg));
    if (immediate) {
      hingeFrom = clamped;
      hingeTo = clamped;
      hingeT = 1;
      panelAngle = clamped;
      instrument.setHingeAngle(clamped);
      return;
    }
    if (Math.abs(clamped - hingeTo) < 1e-3 && hingeT >= 1) return;
    hingeFrom = panelAngle;
    hingeTo = clamped;
    hingeT = 0;
  };

  /** Raise or lay the panel per PRD HINGE-2 / HINGE-4. */
  const setPanelRaised = (next: boolean): void => {
    raised = next;
    setPanelAngle(next ? HINGE_DEFAULT_DEG : HINGE_MIN_DEG);
  };

  /* ---------------------------------------------------------- idle spin */

  let autoRotate = false;
  let idleSeconds = 0;

  /* --------------------------------------------------------------- loop */

  let raf = 0;
  let last = 0;
  let running = false;

  const tick = (now: number): void => {
    raf = window.requestAnimationFrame(tick);
    if (!last) {
      last = now;
      return;
    }
    // Clamp so a background tab does not produce a giant first delta.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (hingeT < 1) {
      hingeT = Math.min(1, hingeT + dt / hingeDuration());
      panelAngle = hingeFrom + (hingeTo - hingeFrom) * easeInOut(hingeT);
      instrument.setHingeAngle(panelAngle);
    }

    idleSeconds += dt;
    if (
      autoRotate &&
      idleSeconds > AUTOROTATE_IDLE_SECONDS &&
      rig.viewMode === '3d' &&
      !rig.transitioning
    ) {
      rig.nudgeAzimuth(AUTOROTATE_RATE * dt);
    }

    rig.update(dt);
    instrument.update(dt);
    onFrame?.(dt);

    post.render(scene, camera);
  };

  const resize = (): void => {
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    rendererHandle.setSize(width, height);
    post.setSize(
      width,
      height,
      Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    );
  };

  resize();

  return {
    scene,
    camera,
    rig,
    instrument,
    renderer,
    post,
    usingBloom: post.usingComposer,

    noteActivity(): void {
      idleSeconds = 0;
    },

    setViewMode(mode: ViewMode): void {
      rig.setMode(mode);
      // PRD HINGE-4: 2D always lays the panel flat; 3D restores it.
      setPanelRaised(mode === '3d');
    },

    getViewMode(): ViewMode {
      return rig.viewMode;
    },

    setPanelRaised(next: boolean): void {
      raised = next;
      setPanelAngle(next ? HINGE_DEFAULT_DEG : HINGE_MIN_DEG);
    },

    setPanelAngle,

    getPanelRaised(): boolean {
      return raised;
    },

    setAutoRotate(on: boolean): void {
      autoRotate = on;
      idleSeconds = 0;
    },

    getAutoRotate(): boolean {
      return autoRotate;
    },

    setReducedMotion(on: boolean): void {
      rig.setReducedMotion(on);
    },

    resetView(): void {
      rig.resetView();
    },

    resize,

    start(): void {
      if (running) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    },

    stop(): void {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    },

    dispose(): void {
      this.stop();
      instrument.dispose();
      lighting.dispose();
      post.dispose();
      environment.dispose();
      rendererHandle.dispose();
      scene.clear();
    },
  };
}
