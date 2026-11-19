import * as THREE from "three";
import { SPEC_BY_ID } from "../state/specs.ts";
import type { ControlId } from "../state/types.ts";
import {
  CONTROL_PLACEMENTS,
  OVERLOAD_LED_POS,
  POWER_LED_POS,
  type ControlPlacement,
} from "./layout.ts";
import type { SynthMaterials } from "./materials.ts";

export interface ControlHandle {
  readonly id: ControlId;
  readonly placement: ControlPlacement;
  readonly group: THREE.Group;
  readonly hitMeshes: THREE.Object3D[];
  applyValue: (value: number, immediate?: boolean) => void;
  updateAnimation: (dt: number) => void;
  setHover: (hovered: boolean) => void;
}

/**
 * Maps normalized 0..1 knob position to Y rotation (225° start, 270° clockwise sweep).
 * In Three.js looking down at XZ (+Y up): +Z is 0 rad along +Z or -Z?
 * When pointer bar lies along -Z (pointing to 12 o'clock on panel):
 *   - Rotating around +Y by +135° (+2.356 rad) swings -Z toward bottom-left (7:30 o'clock).
 *   - Rotating around +Y by -135° (-2.356 rad) swings -Z toward bottom-right (4:30 o'clock).
 */
export function knobRotationY(norm01: number): number {
  const t = Math.max(0, Math.min(1, norm01));
  return 0.75 * Math.PI - 1.5 * Math.PI * t;
}

function createKnobControl(p: ControlPlacement, mats: SynthMaterials): ControlHandle {
  const spec = SPEC_BY_ID[p.id];
  const r = p.radius ?? 0.0082;
  const h = p.style === "knob-sm" ? 0.011 : 0.0145;
  const isStep = p.style === "step-knob";

  const root = new THREE.Group();
  const rotor = new THREE.Group();
  root.add(rotor);

  // Tapered skirt base
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.92, r * 1.12, 0.0026, 28),
    mats.knobBody,
  );
  skirt.position.y = 0.0013;
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  rotor.add(skirt);

  // Fluted body (18-sided for authentic tactile grip ridges)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.76, r * 0.86, h, 18),
    mats.knobBody,
  );
  body.position.y = 0.0026 + h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  rotor.add(body);

  // Brushed silver aluminum top insert disc
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.62, r * 0.64, 0.0012, 24),
    mats.knobInsert,
  );
  cap.position.y = 0.0026 + h + 0.0006;
  rotor.add(cap);

  // Crisp pointer indicator line (pointing toward -Z at rotation.y = 0 -> 12 o'clock)
  const ptrLen = isStep ? r * 0.95 : r * 0.74;
  const ptr = new THREE.Mesh(
    new THREE.BoxGeometry(0.0014, 0.0018, ptrLen),
    mats.knobPointer,
  );
  ptr.position.set(0, 0.0026 + h + 0.001, -ptrLen * 0.45);
  rotor.add(ptr);

  if (isStep) {
    // Raised pointer fin on step selectors
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.0022, 0.0025, r * 0.85),
      mats.knobBody,
    );
    fin.position.set(0, 0.0026 + h + 0.0005, -r * 0.3);
    rotor.add(fin);
  }

  // Hover highlight halo ring (hidden unless hovered)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xe8a33d,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(r * 1.15, r * 1.32, 32), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.0006;
  root.add(halo);

  let targetAngle = 0;
  let currentAngle = 0;

  const hitMeshes = [skirt, body, cap, ptr];
  for (const m of hitMeshes) m.userData.controlId = p.id;

  return {
    id: p.id,
    placement: p,
    group: root,
    hitMeshes,
    applyValue(val: number, immediate = false) {
      const t = (val - spec.min) / (spec.max - spec.min || 1);
      targetAngle = knobRotationY(t);
      if (immediate) {
        currentAngle = targetAngle;
        rotor.rotation.y = currentAngle;
      }
    },
    updateAnimation(dt: number) {
      const diff = targetAngle - currentAngle;
      if (Math.abs(diff) > 0.0005) {
        currentAngle += diff * Math.min(1, dt * 22);
        rotor.rotation.y = currentAngle;
      }
    },
    setHover(hovered: boolean) {
      haloMat.opacity = hovered ? 0.65 : 0;
    },
  };
}

function createRockerControl(p: ControlPlacement, mats: SynthMaterials): ControlHandle {
  const root = new THREE.Group();
  const mat =
    p.style === "rocker-orange"
      ? mats.rockerOrange
      : p.style === "rocker-blue"
        ? mats.rockerBlue
        : p.style === "rocker-white"
          ? mats.rockerWhite
          : p.style === "rocker-power"
            ? mats.rockerPower
            : mats.rockerBlack;

  // Recessed black bezel frame
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.0094, 0.002, 0.007),
    mats.wheelBezel,
  );
  bezel.position.y = 0.001;
  root.add(bezel);

  const pivot = new THREE.Group();
  pivot.position.y = 0.0022;
  root.add(pivot);

  // Rocker paddle tilts left/right around Z axis (horizontal rocker)
  const paddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.0076, 0.004, 0.0054),
    mat,
  );
  paddle.castShadow = true;
  pivot.add(paddle);

  // Subtle top bevel ridge
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.0014, 0.0012, 0.0062),
    mats.knobPointer,
  );
  ridge.position.y = 0.0022;
  if (p.style === "rocker-white") {
    ridge.material = mats.darkSteel;
  }
  pivot.add(ridge);

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xe8a33d,
    transparent: true,
    opacity: 0,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.012), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.0005;
  root.add(halo);

  let targetTilt = -0.32;
  let currentTilt = -0.32;

  const hitMeshes = [bezel, paddle, ridge];
  for (const m of hitMeshes) m.userData.controlId = p.id;

  return {
    id: p.id,
    placement: p,
    group: root,
    hitMeshes,
    applyValue(val: number, immediate = false) {
      // ON (+1) tilts right (-Z rotation), OFF (0) tilts left (+Z rotation)
      targetTilt = val >= 0.5 ? -0.32 : 0.32;
      if (immediate) {
        currentTilt = targetTilt;
        pivot.rotation.z = currentTilt;
      }
    },
    updateAnimation(dt: number) {
      const diff = targetTilt - currentTilt;
      if (Math.abs(diff) > 0.001) {
        currentTilt += diff * Math.min(1, dt * 24);
        pivot.rotation.z = currentTilt;
      }
    },
    setHover(hovered: boolean) {
      haloMat.opacity = hovered ? 0.32 : 0;
    },
  };
}

function createWheelControl(p: ControlPlacement, mats: SynthMaterials): ControlHandle {
  const root = new THREE.Group();
  const spec = SPEC_BY_ID[p.id];
  const radius = 0.019;
  const width = 0.011;

  const axle = new THREE.Group();
  // Recessed partially below the left-hand controller plate
  axle.position.y = -0.0055;
  root.add(axle);

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 32),
    mats.wheelBody,
  );
  drum.rotation.z = Math.PI / 2;
  drum.castShadow = true;
  axle.add(drum);

  // Knurled notch ribs around perimeter
  const notchGeo = new THREE.BoxGeometry(width * 0.94, 0.0014, 0.0012);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const notch = new THREE.Mesh(notchGeo, mats.darkSteel);
    notch.position.set(0, Math.cos(a) * radius, Math.sin(a) * radius);
    notch.rotation.x = -a;
    axle.add(notch);
  }

  // Ivory index stripe on perimeter (starts pointing UP at +Y)
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.98, 0.0024, 0.0026),
    mats.knobPointer,
  );
  stripe.position.set(0, radius + 0.0005, 0);
  axle.add(stripe);

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xe8a33d,
    transparent: true,
    opacity: 0,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.017, 0.044), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.0008;
  root.add(halo);

  let targetAngle = 0;
  let currentAngle = 0;
  const hitMeshes = [drum, stripe];
  for (const m of hitMeshes) m.userData.controlId = p.id;

  return {
    id: p.id,
    placement: p,
    group: root,
    hitMeshes,
    applyValue(val: number, immediate = false) {
      const t = (val - spec.min) / (spec.max - spec.min || 1);
      // 0 (down/toward player) = +0.55 rad, 100 (up/away) = -0.55 rad around X
      targetAngle = 0.55 - t * 1.1;
      if (immediate) {
        currentAngle = targetAngle;
        axle.rotation.x = currentAngle;
      }
    },
    updateAnimation(dt: number) {
      const diff = targetAngle - currentAngle;
      if (Math.abs(diff) > 0.001) {
        currentAngle += diff * Math.min(1, dt * 24);
        axle.rotation.x = currentAngle;
      }
    },
    setHover(hovered: boolean) {
      haloMat.opacity = hovered ? 0.3 : 0;
    },
  };
}

export interface LampsRef {
  powerLedMat: THREE.MeshStandardMaterial;
  overloadLedMat: THREE.MeshStandardMaterial;
  powerRockerMat: THREE.MeshStandardMaterial;
}

export function buildControls3D(
  panelPivot: THREE.Group,
  sideStripGroup: THREE.Group,
  mats: SynthMaterials,
): { handles: Map<ControlId, ControlHandle>; hitMeshes: THREE.Object3D[]; lamps: LampsRef } {
  const handles = new Map<ControlId, ControlHandle>();
  const hitMeshes: THREE.Object3D[] = [];

  for (const p of CONTROL_PLACEMENTS) {
    let handle: ControlHandle;
    if (p.style === "wheel") {
      handle = createWheelControl(p, mats);
    } else if (p.style.startsWith("rocker")) {
      handle = createRockerControl(p, mats);
    } else {
      handle = createKnobControl(p, mats);
    }

    if (p.space === "panel") {
      handle.group.position.set(p.x, 0.0008, -p.pos);
      panelPivot.add(handle.group);
    } else {
      handle.group.position.set(p.x, 0.0706, p.pos);
      sideStripGroup.add(handle.group);
    }

    handles.set(p.id, handle);
    hitMeshes.push(...handle.hitMeshes);
  }

  // Jewel Pilot Lamp (Power) & Overload Lamp
  const makeJewel = (pos: { x: number; v: number }, mat: THREE.MeshStandardMaterial) => {
    const g = new THREE.Group();
    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0048, 0.0022, 16),
      mats.chrome,
    );
    bezel.position.y = 0.0011;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.0033, 16, 12), mat);
    lens.position.y = 0.0024;
    lens.scale.y = 0.78;
    g.add(bezel, lens);
    g.position.set(pos.x, 0.0005, -pos.v);
    panelPivot.add(g);
  };

  makeJewel(OVERLOAD_LED_POS, mats.overloadLed);
  makeJewel(POWER_LED_POS, mats.powerLed);

  return {
    handles,
    hitMeshes,
    lamps: {
      powerLedMat: mats.powerLed,
      overloadLedMat: mats.overloadLed,
      powerRockerMat: mats.rockerPower,
    },
  };
}
