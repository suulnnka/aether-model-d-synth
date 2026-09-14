/**
 * Three-point studio lighting (PRD VIS-2).
 *
 *   key   — warm, high, front-right, casts the soft shadow
 *   fill  — cool, low, front-left, lifts the shadow side without flattening
 *   rim   — behind, rakes the top edges so the silhouette separates from the
 *           backdrop
 *
 * Shadow-camera bounds are tightened to the instrument's real bounding box so
 * the 2048 map is spent on the object rather than on empty floor.
 */

import * as THREE from 'three';
import { BODY_WIDTH } from '../model/layout.ts';
import { SHADOW_BLUR_SAMPLES, SHADOW_RADIUS } from './renderer.ts';

export interface LightingHandle {
  readonly root: THREE.Group;
  readonly keyLight: THREE.DirectionalLight;
  dispose(): void;
}

/** Half-extent of the shadow frustum, with a little breathing room. */
const SHADOW_EXTENT = BODY_WIDTH * 1.15;

export function createLighting(): LightingHandle {
  const root = new THREE.Group();
  root.name = 'lighting';

  const keyLight = new THREE.DirectionalLight(0xfff1de, 1.85);
  keyLight.position.set(1.45, 2.1, 1.65);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.6;
  keyLight.shadow.camera.far = 6.5;
  keyLight.shadow.camera.left = -SHADOW_EXTENT;
  keyLight.shadow.camera.right = SHADOW_EXTENT;
  keyLight.shadow.camera.top = SHADOW_EXTENT;
  keyLight.shadow.camera.bottom = -SHADOW_EXTENT;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.012;
  // VSM blurs the shadow map, so these are the knobs that actually soften the
  // contact shadow. They are inert under PCF, which has no blur at all.
  keyLight.shadow.radius = SHADOW_RADIUS;
  keyLight.shadow.blurSamples = SHADOW_BLUR_SAMPLES;
  keyLight.target.position.set(0, 0.09, 0);
  root.add(keyLight, keyLight.target);

  const fill = new THREE.DirectionalLight(0x9dc2ff, 0.72);
  fill.position.set(-1.9, 1.05, 1.15);
  fill.target.position.set(0, 0.09, 0);
  root.add(fill, fill.target);

  const rim = new THREE.DirectionalLight(0xffd8b4, 1.2);
  rim.position.set(-0.75, 1.15, -2.1);
  rim.target.position.set(0, 0.12, 0);
  root.add(rim, rim.target);

  // A very low hemisphere keeps the underside from going pure black.
  const ambient = new THREE.HemisphereLight(0x30343d, 0x0a0a0c, 0.35);
  root.add(ambient);

  return {
    root,
    keyLight,
    dispose(): void {
      keyLight.shadow.dispose();
      root.clear();
    },
  };
}
