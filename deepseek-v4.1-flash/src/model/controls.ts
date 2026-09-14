/**
 * Control mesh factories (PRD MDL-2).
 *
 * Every factory returns a `ControlView`: an Object3D to drop onto the panel,
 * the list of meshes the raycast picker should test, an `apply()` that poses
 * the control from a ParamStore value, and a hover highlight.
 *
 * Posing is deliberately *derived from the stored value* rather than animated
 * separately, so the 3D attitude and the audio parameter can never disagree —
 * dragging a knob, loading a preset and restoring from localStorage all land in
 * exactly the same pose code (PRD ST-1, INT-6).
 */

import * as THREE from 'three';
import {
  KNOB_HEIGHT,
  KNOB_RADIUS,
  SELECTOR_HEIGHT,
  SELECTOR_RADIUS,
  SWITCH_BASE_HEIGHT,
  SWITCH_BASE_RADIUS,
  SWITCH_LEVER_LENGTH,
  SWITCH_TILT_DEG,
  WHEEL_RADIUS,
  WHEEL_SWEEP_RAD,
  WHEEL_THICKNESS,
  DIAL_SPAN_DEG,
} from './layout.ts';
import {
  chromeMaterial,
  collarMaterial,
  knobMaterial,
  wheelMaterial,
} from './materials.ts';
import type { ControlValue } from '../state/ParamStore.ts';
import type { SelectorSpec } from '../state/specs.ts';

const DIAL_SPAN = (DIAL_SPAN_DEG * Math.PI) / 180;
const HALO_COLOR = 0xff9a4d;

/** Hover outline that lies flat on the panel around a control. */
function halo(inner: number, outer: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(inner, outer, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: HALO_COLOR,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // RingGeometry lies in XY; lay it flat on the panel top.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0007;
  mesh.visible = false;
  mesh.renderOrder = 2;
  return mesh;
}

function pointerBar(length: number, width: number, thickness: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(width, thickness, length);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf2efe6,
    roughness: 0.35,
    metalness: 0.0,
    emissive: new THREE.Color(0x2a2620),
    emissiveIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // The bar runs from near the centre out to the rim; the mesh origin is the
  // knob centre, so shift it along -Z (the pointer's rest direction).
  mesh.position.set(0, 0, -length / 2 - width * 0.6);
  return mesh;
}

export interface ControlView {
  readonly id: string;
  readonly root: THREE.Object3D;
  /** Meshes the picker should raycast against. */
  readonly pick: readonly THREE.Object3D[];
  apply(value: ControlValue): void;
  setHover(on: boolean): void;
}

/* ===========================================================================
 * Continuous knob
 * ========================================================================= */

export function buildKnob(id: string): ControlView {
  const root = new THREE.Group();
  root.name = `knob:${id}`;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(
      KNOB_RADIUS * 0.86,
      KNOB_RADIUS,
      KNOB_HEIGHT,
      32,
      1,
    ),
    knobMaterial(),
  );
  body.position.y = KNOB_HEIGHT / 2;
  body.castShadow = true;
  root.add(body);

  // A narrow band at the base reads as the moulding seam.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(
      KNOB_RADIUS * 1.02,
      KNOB_RADIUS * 1.02,
      0.0016,
      32,
    ),
    collarMaterial(),
  );
  skirt.position.y = 0.0008;
  root.add(skirt);

  const dial = new THREE.Group();
  dial.position.y = KNOB_HEIGHT;
  dial.add(pointerBar(KNOB_RADIUS * 1.3, 0.0017, 0.0005));
  root.add(dial);

  const ring = halo(KNOB_RADIUS * 1.5, KNOB_RADIUS * 1.78);
  root.add(ring);

  return {
    id,
    root,
    pick: [body, skirt],
    apply(value: ControlValue): void {
      const pos = typeof value === 'number' ? value : 0.5;
      // Clockwise for increasing value when viewed from above (PRD INT-1).
      dial.rotation.y = -(pos - 0.5) * DIAL_SPAN;
    },
    setHover(on: boolean): void {
      ring.visible = on;
    },
  };
}

/* ===========================================================================
 * Detented selector
 * ========================================================================= */

export function buildSelector(id: string, spec: SelectorSpec): ControlView {
  const root = new THREE.Group();
  root.name = `selector:${id}`;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(
      SELECTOR_RADIUS * 0.62,
      SELECTOR_RADIUS * 0.68,
      SELECTOR_HEIGHT,
      32,
      1,
    ),
    knobMaterial(),
  );
  body.position.y = SELECTOR_HEIGHT / 2;
  body.castShadow = true;
  root.add(body);

  // Skirted base: the wider flange the pointer rides on (PRD MDL-2).
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(
      SELECTOR_RADIUS,
      SELECTOR_RADIUS * 1.04,
      0.0022,
      40,
    ),
    knobMaterial(),
  );
  skirt.position.y = 0.0011;
  skirt.castShadow = true;
  root.add(skirt);

  const dial = new THREE.Group();
  dial.position.y = SELECTOR_HEIGHT;
  dial.add(pointerBar(SELECTOR_RADIUS * 1.05, 0.0021, 0.0006));
  root.add(dial);

  const ring = halo(SELECTOR_RADIUS * 1.36, SELECTOR_RADIUS * 1.6);
  root.add(ring);

  const count = Math.max(2, spec.options.length);

  return {
    id,
    root,
    pick: [body, skirt],
    apply(value: ControlValue): void {
      const index = Math.max(
        0,
        spec.options.findIndex((o) => o.value === value),
      );
      const pos = count === 1 ? 0.5 : index / (count - 1);
      dial.rotation.y = -(pos - 0.5) * DIAL_SPAN;
    },
    setHover(on: boolean): void {
      ring.visible = on;
    },
  };
}

/* ===========================================================================
 * Lever switch
 * ========================================================================= */

export function buildSwitch(id: string): ControlView {
  const root = new THREE.Group();
  root.name = `switch:${id}`;

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(
      SWITCH_BASE_RADIUS,
      SWITCH_BASE_RADIUS * 1.08,
      SWITCH_BASE_HEIGHT,
      24,
    ),
    collarMaterial(),
  );
  collar.position.y = SWITCH_BASE_HEIGHT / 2;
  collar.castShadow = true;
  root.add(collar);

  // The lever pivots on the collar's top face.
  const pivot = new THREE.Group();
  pivot.position.y = SWITCH_BASE_HEIGHT;
  const lever = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0016, 0.0019, SWITCH_LEVER_LENGTH, 16),
    chromeMaterial(),
  );
  lever.position.y = SWITCH_LEVER_LENGTH / 2;
  lever.castShadow = true;
  pivot.add(lever);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.0022, 16, 12),
    chromeMaterial(),
  );
  tip.position.y = SWITCH_LEVER_LENGTH;
  pivot.add(tip);
  root.add(pivot);

  const ring = halo(SWITCH_BASE_RADIUS * 1.5, SWITCH_BASE_RADIUS * 1.85);
  root.add(ring);

  const tilt = (SWITCH_TILT_DEG * Math.PI) / 180;

  return {
    id,
    root,
    pick: [collar, lever, tip],
    apply(value: ControlValue): void {
      // ON tips the lever toward the rear of the panel, which reads as "up".
      const on = value === true;
      pivot.rotation.x = on ? -tilt : tilt;
    },
    setHover(on: boolean): void {
      ring.visible = on;
    },
  };
}

/* ===========================================================================
 * Performance wheel
 * ========================================================================= */

export interface WheelView extends ControlView {
  /** Feedback loop for callers that spring the wheel via the ParamStore. */
  tick(dt: number): void;
}

export function buildWheel(id: string): WheelView {
  const root = new THREE.Group();
  root.name = `wheel:${id}`;

  // The wheel spins about a left-right axis, so build it in that orientation.
  const spin = new THREE.Group();
  root.add(spin);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_THICKNESS, 48),
    wheelMaterial(),
  );
  // Cylinder axis starts along +Y; rotate so it runs along X.
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  spin.add(body);

  // Grooved rim: a slightly smaller disc inset at each end.
  for (const dir of [-1, 1] as const) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(
        WHEEL_RADIUS * 0.9,
        WHEEL_RADIUS * 0.9,
        0.0022,
        48,
      ),
      wheelMaterial(),
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.x = dir * (WHEEL_THICKNESS / 2 - 0.0011);
    spin.add(rim);
  }

  // Knurling: a ring of small ridges riding on the wheel surface.
  const KNURL_COUNT = 44;
  const knurlGeo = new THREE.BoxGeometry(WHEEL_THICKNESS * 0.62, 0.0016, 0.0026);
  const knurl = new THREE.InstancedMesh(
    knurlGeo,
    wheelMaterial(),
    KNURL_COUNT,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < KNURL_COUNT; i += 1) {
    const a = (i / KNURL_COUNT) * Math.PI * 2;
    const p = new THREE.Vector3(
      0,
      Math.cos(a) * (WHEEL_RADIUS + 0.0004),
      Math.sin(a) * (WHEEL_RADIUS + 0.0004),
    );
    q.setFromEuler(new THREE.Euler(-a, 0, 0));
    m.compose(p, q, scale);
    knurl.setMatrixAt(i, m);
  }
  knurl.instanceMatrix.needsUpdate = true;
  spin.add(knurl);

  // A painted index line across the tread, so rotation is legible.
  const index = new THREE.Mesh(
    new THREE.BoxGeometry(WHEEL_THICKNESS * 0.9, 0.0006, WHEEL_RADIUS * 0.5),
    new THREE.MeshStandardMaterial({
      color: 0xf0ece2,
      roughness: 0.5,
      metalness: 0,
    }),
  );
  index.position.set(0, WHEEL_RADIUS * 0.72, 0);
  spin.add(index);

  // The halo sits on the deck around the wheel slot.
  const ring = halo(WHEEL_RADIUS * 1.16, WHEEL_RADIUS * 1.34);

  return {
    id,
    root,
    pick: [body, knurl],
    apply(value: ControlValue): void {
      const pos = typeof value === 'number' ? value : 0.5;
      spin.rotation.x = (pos - 0.5) * WHEEL_SWEEP_RAD;
    },
    setHover(on: boolean): void {
      ring.visible = on;
    },
    tick(): void {
      // Posing is driven entirely by the stored value; see the note above.
    },
  };
}

/**
 * Hover outline for a piano key. One instance is reused for whichever key the
 * pointer is over, which keeps 44 keys out of the highlight bookkeeping.
 */
export function buildKeyOutline(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.5, 0.62, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: HALO_COLOR,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.PI / 4;
  mesh.visible = false;
  mesh.renderOrder = 3;
  return mesh;
}
