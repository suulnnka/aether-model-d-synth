import * as THREE from "three";
import {
  BLACK_KEY_LEN,
  BLACK_KEY_W,
  DIM,
  KEY_SPECS,
  WHITE_KEY_W,
} from "./layout.ts";
import type { SynthMaterials } from "./materials.ts";

export interface KeyHandle {
  readonly midi: number;
  readonly isBlack: boolean;
  readonly pivot: THREE.Group;
  readonly mesh: THREE.Mesh;
  setPressed: (pressed: boolean) => void;
  updateAnimation: (dt: number) => void;
}

export function buildKeyboard3D(
  root: THREE.Group,
  mats: SynthMaterials,
): { keys: Map<number, KeyHandle>; hitMeshes: THREE.Object3D[] } {
  const keys = new Map<number, KeyHandle>();
  const hitMeshes: THREE.Object3D[] = [];

  const whiteW = WHITE_KEY_W - 0.0012;
  const whiteH = 0.015;
  const whiteL = DIM.KEY_LEN;

  const whiteGeo = new THREE.BoxGeometry(whiteW, whiteH, whiteL);
  // Shift geometry so pivot origin (0,0,0) is at the rear top edge of the key
  whiteGeo.translate(0, -whiteH / 2, whiteL / 2);

  const blackH = 0.011;
  const blackGeo = new THREE.BoxGeometry(BLACK_KEY_W, blackH, BLACK_KEY_LEN);
  blackGeo.translate(0, -blackH / 2, BLACK_KEY_LEN / 2);

  for (const k of KEY_SPECS) {
    const pivot = new THREE.Group();
    pivot.position.set(
      k.x,
      k.isBlack ? DIM.KEY_TOP_Y + 0.0075 : DIM.KEY_TOP_Y,
      DIM.KEY_START_Z,
    );

    const mesh = new THREE.Mesh(
      k.isBlack ? blackGeo : whiteGeo,
      k.isBlack ? mats.blackKey : mats.whiteKey,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.midi = k.midi;
    pivot.add(mesh);
    root.add(pivot);

    let targetRot = 0;
    let currentRot = 0;

    keys.set(k.midi, {
      midi: k.midi,
      isBlack: k.isBlack,
      pivot,
      mesh,
      setPressed(pressed: boolean) {
        targetRot = pressed ? (k.isBlack ? 0.068 : 0.062) : 0;
      },
      updateAnimation(dt: number) {
        const diff = targetRot - currentRot;
        if (Math.abs(diff) > 0.0005) {
          currentRot += diff * Math.min(1, dt * 32);
          pivot.rotation.x = currentRot;
        }
      },
    });
    hitMeshes.push(mesh);
  }

  return { keys, hitMeshes };
}
