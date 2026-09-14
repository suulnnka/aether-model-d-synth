/**
 * 44-key keyboard, F2–C6 (PRD MDL-2, 6.5 #36).
 *
 * The keys are two InstancedMeshes — one for the white keys, one for the blacks
 * — because they are the most repeated part on the instrument and PRD 9 asks
 * for instancing on repeated parts. Per-key state (the press travel) is written
 * straight into the instance matrices, so 44 keys still cost two draw calls and
 * the raycast returns an `instanceId` we map back to a MIDI note.
 *
 * Pressing has no velocity: the key either sinks its full travel or it does
 * not, matching the original's non-touch-sensitive keyboard (PRD 6.5 #36).
 */

import * as THREE from 'three';
import {
  KEY_BY_MIDI,
  KEY_RECESS_FLOOR_Y,
  KEYS,
  KEY_TRAVEL,
  type KeyPlacement,
} from './layout.ts';
import { blackKeyMaterial, whiteKeyMaterial } from './materials.ts';

export interface KeyboardParts {
  readonly root: THREE.Group;
  readonly pickTargets: readonly THREE.Object3D[];
  /** Map a raycast hit back to a MIDI note, or null if it was not a key. */
  midiForHit(object: THREE.Object3D, instanceId: number | undefined): number | null;
  setPressed(midi: number, pressed: boolean): void;
  isPressed(midi: number): boolean;
  releaseAll(): void;
  /** Move the shared hover outline onto a key, or hide it. */
  showOutline(midi: number | null, outline: THREE.Mesh): void;
}

interface KeyState {
  readonly placement: KeyPlacement;
  pressed: boolean;
  /** Slot inside its instanced mesh. */
  readonly slot: number;
}

const WHITE_MIDIS: number[] = [];
const BLACK_MIDIS: number[] = [];

export function buildKeyboard(): KeyboardParts {
  const root = new THREE.Group();
  root.name = 'keyboard';

  for (const key of KEYS) {
    if (key.black) BLACK_MIDIS.push(key.midi);
    else WHITE_MIDIS.push(key.midi);
  }

  // Origin at the key's top face; scaling y grows the key downward from there.
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, -0.5, 0);

  const whiteMesh = new THREE.InstancedMesh(
    unit,
    whiteKeyMaterial(),
    WHITE_MIDIS.length,
  );
  const blackMesh = new THREE.InstancedMesh(
    unit,
    blackKeyMaterial(),
    BLACK_MIDIS.length,
  );
  whiteMesh.castShadow = true;
  whiteMesh.receiveShadow = true;
  blackMesh.castShadow = true;
  blackMesh.receiveShadow = true;
  whiteMesh.name = 'keys:white';
  blackMesh.name = 'keys:black';

  // Both meshes must be children of the group the instrument adds to the scene.
  // Their instance matrices are authored in body-local coordinates, so the
  // instrument's own offset is applied by the group chain and not baked in
  // here. Leaving them detached — as this once did — renders no keyboard at
  // all, while the raycast still resolves hits against their local matrices,
  // which is why the keys were clickable but invisible.
  root.add(whiteMesh, blackMesh);

  const states = new Map<number, KeyState>();
  WHITE_MIDIS.forEach((midi, slot) => {
    const placement = KEY_BY_MIDI.get(midi);
    if (placement) states.set(midi, { placement, pressed: false, slot });
  });
  BLACK_MIDIS.forEach((midi, slot) => {
    const placement = KEY_BY_MIDI.get(midi);
    if (placement) states.set(midi, { placement, pressed: false, slot });
  });

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const writeKey = (state: KeyState): void => {
    const p = state.placement;
    const bottom = KEY_RECESS_FLOOR_Y;
    const height = p.topY - bottom;
    const length = p.zFront - p.zBack;
    const sink = state.pressed ? KEY_TRAVEL : 0;
    position.set(p.x, p.topY - sink, p.zCentre);
    scale.set(p.width, height, length);
    matrix.compose(position, quaternion, scale);
    const mesh = p.black ? blackMesh : whiteMesh;
    mesh.setMatrixAt(state.slot, matrix);
  };

  for (const state of states.values()) writeKey(state);
  whiteMesh.instanceMatrix.needsUpdate = true;
  blackMesh.instanceMatrix.needsUpdate = true;

  // Shadows must be recomputed when a key sinks.
  whiteMesh.computeBoundingSphere();
  blackMesh.computeBoundingSphere();

  const midiFor = (
    mesh: THREE.Object3D,
    instanceId: number | undefined,
  ): number | null => {
    if (instanceId === undefined) return null;
    if (mesh === whiteMesh) return WHITE_MIDIS[instanceId] ?? null;
    if (mesh === blackMesh) return BLACK_MIDIS[instanceId] ?? null;
    return null;
  };

  const outlineMatrix = new THREE.Matrix4();
  const outlineScale = new THREE.Vector3();
  const outlinePos = new THREE.Vector3();
  const outlineQuat = new THREE.Quaternion();

  return {
    root,
    pickTargets: [whiteMesh, blackMesh],
    midiForHit: midiFor,

    setPressed(midi: number, pressed: boolean): void {
      const state = states.get(midi);
      if (!state || state.pressed === pressed) return;
      state.pressed = pressed;
      writeKey(state);
      const mesh = state.placement.black ? blackMesh : whiteMesh;
      mesh.instanceMatrix.needsUpdate = true;
    },

    isPressed(midi: number): boolean {
      return states.get(midi)?.pressed ?? false;
    },

    releaseAll(): void {
      for (const state of states.values()) {
        if (!state.pressed) continue;
        state.pressed = false;
        writeKey(state);
      }
      whiteMesh.instanceMatrix.needsUpdate = true;
      blackMesh.instanceMatrix.needsUpdate = true;
    },

    showOutline(midi: number | null, outline: THREE.Mesh): void {
      const state = midi === null ? undefined : states.get(midi);
      if (!state) {
        outline.visible = false;
        return;
      }
      const p = state.placement;
      const length = p.zFront - p.zBack;
      // A flat quad-sized ring is stretched to the key's footprint.
      outlineScale.set(p.width * 1.12, 1, length * 1.06);
      outlinePos.set(
        p.x,
        p.topY + 0.0016 - (state.pressed ? KEY_TRAVEL : 0),
        p.zCentre,
      );
      outlineMatrix.compose(outlinePos, outlineQuat, outlineScale);
      outline.matrixAutoUpdate = false;
      outline.matrix.copy(outlineMatrix);
      outline.visible = true;
    },
  };
}

/** White / black key tallies, derived from the layout rather than build order. */
export const KEYBOARD_WHITE_COUNT = KEYS.filter((k) => !k.black).length;
export const KEYBOARD_BLACK_COUNT = KEYS.filter((k) => k.black).length;
