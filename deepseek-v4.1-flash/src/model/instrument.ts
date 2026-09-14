/**
 * Instrument assembly.
 *
 * Puts the cabinet, the hinged panel, the silkscreen, every control and the
 * keyboard into one group, and owns the two things that are *not* a static
 * mesh: the hinge angle and the pose of every control.
 *
 * The panel group's origin is the hinge axis, so "open the panel" is a single
 * rotation. Everything mounted on the panel is a child of that group, which is
 * what makes PRD HINGE-6 free: controls keep working at any angle because they
 * travel with the panel by construction.
 */

import * as THREE from 'three';
import {
  BODY_CENTRE_Z,
  HINGE_MAX_DEG,
  HINGE_MIN_DEG,
  MOD_WHEEL_ID,
  MOD_WHEEL_X,
  PANEL_DEPTH,
  PANEL_THICK,
  PANEL_W,
  PITCH_WHEEL_ID,
  PITCH_WHEEL_X,
  PLACEMENTS,
  WHEEL_AXIS_Y,
  WHEEL_AXIS_Z,
  KEY_DECK_Y,
  Z_HINGE,
  type Placement,
} from './layout.ts';
import { buildCabinet } from './cabinet.ts';
import { buildKeyOutline, buildKnob, buildSelector, buildSwitch, buildWheel } from './controls.ts';
import type { ControlView, WheelView } from './controls.ts';
import { buildKeyboard, type KeyboardParts } from './keyboard.ts';
import { panelFace } from './materials.ts';
import { SILKSCREEN_SIZE, paintSilkscreen } from './silkscreen.ts';
import type { ParamStore, ControlValue } from '../state/ParamStore.ts';
import type { SelectorSpec } from '../state/specs.ts';

export interface PickEntry {
  readonly object: THREE.Object3D;
  readonly controlId: string;
}

export interface Instrument {
  readonly root: THREE.Group;
  readonly views: ReadonlyMap<string, ControlView>;
  readonly keyboard: KeyboardParts;
  readonly pickList: readonly PickEntry[];
  readonly keyOutline: THREE.Mesh;
  /** Invisible band along the panel's front edge, for the hinge drag. */
  readonly panelEdge: THREE.Mesh;
  /** Panel-local space, exposed so the pointer layer can map screen -> panel. */
  readonly panelContents: THREE.Object3D;
  setHingeAngle(deg: number): void;
  get hingeAngle(): number;
  /** Advance any per-frame control animation (the wheel springs). */
  update(dt: number): void;
  dispose(): void;
}

/** The three controls that live off the hinged panel. */
export const OFF_PANEL_CONTROLS: readonly string[] = Object.freeze([
  PITCH_WHEEL_ID,
  MOD_WHEEL_ID,
  'power',
]);

export function buildInstrument(store: ParamStore): Instrument {
  const root = new THREE.Group();
  root.name = 'instrument';

  const cabinet = buildCabinet();
  root.add(cabinet.root);

  /* ------------------------------------------------------------- the panel */

  const panelGroup = new THREE.Group();
  panelGroup.name = 'panel';
  panelGroup.position.set(0, KEY_DECK_Y, Z_HINGE);
  root.add(panelGroup);

  // Contents frame: z runs 0 (rear of panel) .. PANEL_DEPTH (hinge).
  const contents = new THREE.Group();
  contents.name = 'panel-contents';
  contents.position.set(0, 0, -PANEL_DEPTH);
  panelGroup.add(contents);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_W, PANEL_THICK, PANEL_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0x101013, roughness: 0.5, metalness: 0.3 }),
  );
  body.position.set(0, -PANEL_THICK / 2, PANEL_DEPTH / 2);
  body.castShadow = true;
  body.receiveShadow = true;
  contents.add(body);

  /* --------------------------------------------------------- silkscreen */

  const silkCanvas = paintSilkscreen();
  const silkTexture = new THREE.CanvasTexture(silkCanvas);
  silkTexture.colorSpace = THREE.SRGBColorSpace;
  silkTexture.anisotropy = 8;
  silkTexture.generateMipmaps = true;
  silkTexture.minFilter = THREE.LinearMipmapLinearFilter;
  silkTexture.magFilter = THREE.LinearFilter;
  silkTexture.name = `silkscreen-${SILKSCREEN_SIZE.width}x${SILKSCREEN_SIZE.height}`;

  const silk = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_DEPTH),
    panelFace(silkTexture),
  );
  // Lay the plane flat on the panel's top face; UVs then run x -> u and
  // rear -> v = 1, matching paintSilkscreen's canvas orientation.
  silk.rotation.x = -Math.PI / 2;
  silk.position.set(0, 0.0008, PANEL_DEPTH / 2);
  silk.receiveShadow = true;
  contents.add(silk);

  /* -------------------------------------------------------- panel screws */

  addScrews(contents);

  /* ------------------------------------------- hinge drag strip (HINGE-3) */

  // An invisible band along the panel's front edge. It is never rendered but is
  // handed straight to the raycaster, so the pointer can grab the panel there
  // and nothing else competes for the same pixels.
  const edgeStrip = new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_W * 0.98, 0.014, 0.034),
    new THREE.MeshBasicMaterial(),
  );
  edgeStrip.position.set(0, 0.007, PANEL_DEPTH - 0.019);
  edgeStrip.visible = false;
  edgeStrip.name = 'panel-edge';
  contents.add(edgeStrip);

  /* ----------------------------------------------------------- controls */

  const views = new Map<string, ControlView>();
  const pickList: PickEntry[] = [];

  const register = (view: ControlView, x: number, z: number, y = 0): void => {
    view.root.position.set(x, y, z);
    contents.add(view.root);
    views.set(view.id, view);
    for (const object of view.pick) pickList.push({ object, controlId: view.id });
  };

  for (const placement of PLACEMENTS) {
    register(buildForPlacement(placement), placement.x, placement.z);
  }

  // Performance wheels live in the deck channel, not on the panel.
  const pitchWheel = buildWheel(PITCH_WHEEL_ID);
  const modWheel = buildWheel(MOD_WHEEL_ID);
  for (const [wheel, x] of [
    [pitchWheel, PITCH_WHEEL_X],
    [modWheel, MOD_WHEEL_X],
  ] as const) {
    wheel.root.position.set(x, WHEEL_AXIS_Y, WHEEL_AXIS_Z);
    // The wheel group sits at the axle; nothing rotates the group itself.
    root.add(wheel.root);
    views.set(wheel.id, wheel);
    for (const object of wheel.pick) {
      pickList.push({ object, controlId: wheel.id });
    }
  }

  // The power rocker is the third off-panel control. The cabinet builds it —
  // it has to, since it is sunk into the left end cheek — so it is registered
  // here by hand rather than coming through the placement table. Skipping this
  // leaves the switch unclickable *and* leaves `applyLamp` below with nothing
  // to pose, which is exactly what used to happen.
  views.set(cabinet.powerView.id, cabinet.powerView);
  for (const object of cabinet.powerView.pick) {
    pickList.push({ object, controlId: cabinet.powerView.id });
  }

  /* ------------------------------------------------------------ keyboard */

  const keyboard = buildKeyboard();
  root.add(keyboard.root);
  const keyOutline = buildKeyOutline();
  root.add(keyOutline);

  /* ------------------------------------------- initial pose + subscriptions */

  const applyOne = (id: string): void => {
    const view = views.get(id);
    if (view) view.apply(store.get(id));
  };

  for (const id of views.keys()) applyOne(id);

  const disposers: (() => void)[] = [];
  for (const id of views.keys()) {
    disposers.push(
      store.subscribe(id, (value: ControlValue) => {
        views.get(id)?.apply(value);
      }),
    );
  }

  // Power switch drives the lamp and the panel rocker together (PRD VIS-6).
  const applyLamp = (): void => {
    const on = store.flag('power');
    cabinet.lampMaterial.emissiveIntensity = on ? 2.4 : 0;
    cabinet.lampMaterial.color.setHex(on ? 0x2a1206 : 0x141416);
    views.get('power')?.apply(on);
  };
  applyLamp();
  disposers.push(store.subscribe('power', applyLamp));

  /* --------------------------------------------------------------- hinge */

  let angle = 50;
  const setHingeAngle = (deg: number): void => {
    angle = Math.min(HINGE_MAX_DEG, Math.max(HINGE_MIN_DEG, deg));
    panelGroup.rotation.x = (angle * Math.PI) / 180;
  };
  setHingeAngle(angle);

  // The instrument is authored with the hinge at z = 0; nudge it so the whole
  // object is centred on the scene origin.
  root.position.z = -BODY_CENTRE_Z;

  const wheelViews: WheelView[] = [pitchWheel, modWheel];

  return {
    root,
    views,
    keyboard,
    pickList,
    keyOutline,
    panelEdge: edgeStrip,
    panelContents: contents,
    setHingeAngle,
    get hingeAngle(): number {
      return angle;
    },
    update(dt: number): void {
      for (const wheel of wheelViews) wheel.tick(dt);
    },
    dispose(): void {
      for (const off of disposers) off();
      disposers.length = 0;
      silkTexture.dispose();
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}

function buildForPlacement(placement: Placement): ControlView {
  switch (placement.spec.kind) {
    case 'knob':
      return buildKnob(placement.id);
    case 'selector':
      return buildSelector(placement.id, placement.spec as SelectorSpec);
    case 'switch':
      return buildSwitch(placement.id);
    default:
      throw new Error(`Control ${placement.id} cannot be mounted on the panel`);
  }
}

/** Screw heads around the panel border (PRD MDL-4). */
function addScrews(contents: THREE.Object3D): void {
  const positions: [number, number][] = [];
  const xs = [-PANEL_W / 2 + 0.012, -PANEL_W / 4, 0, PANEL_W / 4, PANEL_W / 2 - 0.012];
  for (const x of xs) {
    positions.push([x, 0.0075]);
    positions.push([x, PANEL_DEPTH - 0.0075]);
  }
  for (const z of [PANEL_DEPTH * 0.33, PANEL_DEPTH * 0.66]) {
    positions.push([-PANEL_W / 2 + 0.0075, z]);
    positions.push([PANEL_W / 2 - 0.0075, z]);
  }

  const head = new THREE.MeshStandardMaterial({
    color: 0x2a2c30,
    roughness: 0.34,
    metalness: 0.95,
  });
  const slot = new THREE.MeshStandardMaterial({
    color: 0x0a0a0c,
    roughness: 0.9,
    metalness: 0,
  });

  const headGeo = new THREE.CylinderGeometry(0.0023, 0.0025, 0.0016, 14);
  const slotGeo = new THREE.BoxGeometry(0.0032, 0.0006, 0.0005);
  const heads = new THREE.InstancedMesh(headGeo, head, positions.length);
  const slots = new THREE.InstancedMesh(slotGeo, slot, positions.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  positions.forEach(([x, z], i) => {
    matrix.compose(new THREE.Vector3(x, 0.0011, z), quat, scale);
    heads.setMatrixAt(i, matrix);
    // Slots are rotated around so they do not read as a printed pattern.
    const twist = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      ((i * 37) % 180) * (Math.PI / 180),
    );
    matrix.compose(new THREE.Vector3(x, 0.0019, z), twist, scale);
    slots.setMatrixAt(i, matrix);
  });
  heads.instanceMatrix.needsUpdate = true;
  slots.instanceMatrix.needsUpdate = true;
  contents.add(heads, slots);
}
