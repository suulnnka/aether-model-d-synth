/**
 * Renderer setup (PRD VIS-1, PRD 9).
 *
 * ACES Filmic tone mapping with an sRGB output colour space, soft shadow maps,
 * and a hard ceiling on the pixel ratio so a 3x-DPI display cannot quietly cost
 * us three times the fragment work.
 */

import * as THREE from 'three';

export const MAX_PIXEL_RATIO = 2;

/**
 * Shadow filtering.
 *
 * This used to be `PCFSoftShadowMap`, which three removed in r186: the WebGL
 * shadow map warns and silently falls back to plain `PCFShadowMap`, so the
 * instrument was rendering hard-edged shadows while the code claimed they were
 * soft. PCF ignores `shadow.radius` outright and so cannot blur at all, which
 * is why `VSMShadowMap` was tried as the replacement.
 *
 * VSM was reverted. The reason is not that VSM caused the flat grey patch that
 * appears on the panel in the top-down view — that patch measures the same
 * under both VSM and PCF — but that VSM buys its soft edge with light bleeding
 * around contact points, and at the final light levels it showed no visible
 * gain. Plain PCF is also what three silently falls back to anyway, so this
 * makes the behaviour explicit rather than accidental.
 */
export const SHADOW_MAP_TYPE: THREE.ShadowMapType = THREE.PCFShadowMap;
/** Blur radius and sample count, only meaningful for VSM; inert under PCF. */
export const SHADOW_RADIUS = 3.5;
export const SHADOW_BLUR_SAMPLES = 12;

export interface RendererHandle {
  readonly renderer: THREE.WebGLRenderer;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createRenderer(host: HTMLElement): RendererHandle {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
    // The scene is opaque; no need to preserve the drawing buffer.
    preserveDrawingBuffer: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SHADOW_MAP_TYPE;
  renderer.setClearColor(0x08080a, 1);

  host.appendChild(renderer.domElement);

  return {
    renderer,
    setSize(width: number, height: number): void {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(width, height, false);
    },
    dispose(): void {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
