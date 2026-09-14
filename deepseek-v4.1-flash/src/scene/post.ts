/**
 * Post-processing (PRD VIS-5).
 *
 * A restrained bloom, used only for the pilot lamp and the chrome highlights —
 * the brief is explicit that over-filtering is not allowed, so the threshold is
 * high and the strength is low. The vignette is a CSS overlay (see app.css)
 * because a screen-space gradient costs nothing and never touches the render
 * target's colour space.
 *
 * The whole stack is optional: if the composer fails to construct on some
 * driver we fall back to a direct render rather than shipping a black canvas
 * (PRD 9 robustness).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostHandle {
  readonly usingComposer: boolean;
  readonly bloom: UnrealBloomPass | null;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setBloomEnabled(on: boolean): void;
  dispose(): void;
}

/**
 * High threshold so only genuinely emissive pixels bloom.
 *
 * At 0.86 the pass was also catching every chrome highlight, and because the
 * hinge barrel is a long thin cylinder its highlight is a long thin line — so
 * the bloom smeared a bright band right across the panel. 0.94 puts the
 * threshold above specular reflections and leaves it to the pilot lamp.
 *
 * The radius is deliberately small. `UnrealBloomPass` builds a five-level mip
 * chain and the radius scales how much each level contributes, so a wide radius
 * lets a blown highlight bleed through the coarsest levels as a large, hard-
 * edged rectangle — which is exactly how a ~55 mm grey patch was appearing on
 * the panel face in the top-down view. Measured by toggling the pass with
 * everything else fixed, that patch reads 76.4 with the bloom on and 52.3 with
 * it off. A tight radius keeps the lamp glowing without the wide ghost.
 */
const BLOOM_THRESHOLD = 0.94;
const BLOOM_STRENGTH = 0.2;
const BLOOM_RADIUS = 0.15;

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostHandle {
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;

  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloom);
    // OutputPass applies the renderer's tone mapping and colour space, which is
    // what keeps the tone curve consistent between the two render paths.
    composer.addPass(new OutputPass());
  } catch {
    composer = null;
    bloom = null;
  }

  const size = new THREE.Vector2();
  renderer.getSize(size);

  return {
    usingComposer: composer !== null,
    bloom,

    render(target, activeCamera): void {
      if (composer) composer.render();
      else renderer.render(target, activeCamera);
    },

    setSize(width, height, pixelRatio): void {
      composer?.setSize(width, height);
      composer?.setPixelRatio(pixelRatio);
    },

    setBloomEnabled(on): void {
      if (bloom) bloom.enabled = on;
    },

    dispose(): void {
      composer?.dispose();
      bloom?.dispose();
    },
  };
}
