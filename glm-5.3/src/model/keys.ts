import * as THREE from "three";
import { DIMS, isBlackKey, KEY_HIGH, KEY_LOW } from "./dimensions";
import type { MaterialLib } from "./materials";

/** 44 键键盘(F2–C6):白键/黑键、按下下沉行程(INT-4/MDL-2) */

export interface KeyObj {
  midi: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  black: boolean;
  pivotZ: number;
  restRot: number;
  pressRot: number;
  halo: THREE.Mesh;
}

const WHITE_W = DIMS.whiteW + DIMS.whiteGap;

export function createKeyboard(mats: MaterialLib): {
  root: THREE.Group;
  keys: Map<number, KeyObj>;
} {
  const root = new THREE.Group();
  const keys = new Map<number, KeyObj>();

  const whiteGeo = new THREE.BoxGeometry(DIMS.whiteW, DIMS.whiteH, DIMS.whiteD);
  const blackGeo = new THREE.BoxGeometry(DIMS.blackW, DIMS.blackH, DIMS.blackD);

  // 先摆白键
  let wi = 0;
  for (let midi = KEY_LOW; midi <= KEY_HIGH; midi++) {
    if (isBlackKey(midi)) continue;
    const x = DIMS.keysX0 + (wi + 0.5) * WHITE_W;
    wi++;
    const pivotZ = DIMS.keyBedRearZ;
    const group = new THREE.Group();
    group.position.set(x, DIMS.keyBedTop + DIMS.whiteH / 2, pivotZ);
    const mesh = new THREE.Mesh(whiteGeo, mats.keyWhite);
    mesh.position.z = DIMS.whiteD / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const halo = keyHalo(DIMS.whiteW * 0.9, DIMS.whiteD * 0.96);
    group.add(halo);
    root.add(group);
    keys.set(midi, {
      midi,
      group,
      mesh,
      black: false,
      pivotZ,
      restRot: 0,
      pressRot: -0.035,
      halo,
    });
  }

  // 再摆黑键(重叠在白键之上)
  // 黑键位置:位于相邻两白键之间的格缝中点
  const blackOffsets = posOfBlackKeys();
  for (const [midi, x] of blackOffsets) {
    const pivotZ = DIMS.keyBedRearZ + 0.006;
    const group = new THREE.Group();
    group.position.set(x, DIMS.keyBedTop + DIMS.whiteH / 2 + DIMS.blackH / 2 + 0.001, pivotZ);
    const mesh = new THREE.Mesh(blackGeo, mats.keyBlack);
    mesh.position.z = DIMS.blackD / 2;
    mesh.castShadow = true;
    group.add(mesh);
    const halo = keyHalo(DIMS.blackW * 0.95, DIMS.blackD * 0.95);
    group.add(halo);
    root.add(group);
    keys.set(midi, {
      midi,
      group,
      mesh,
      black: true,
      pivotZ,
      restRot: 0,
      pressRot: -0.05,
      halo,
    });
  }

  return { root, keys };
}

/** 计算每个黑键的 x 中心:基于白键格点 */
function posOfBlackKeys(): [number, number][] {
  const out: [number, number][] = [];
  let wi = 0;
  for (let midi = KEY_LOW; midi <= KEY_HIGH; midi++) {
    if (!isBlackKey(midi)) {
      wi++;
      continue;
    }
    // 黑键 midi 位于左白键(midi-1, 第 wi-1 个)与右白键(midi+1)的格缝中点
    const x = DIMS.keysX0 + wi * WHITE_W - DIMS.whiteGap / 2;
    out.push([midi, x]);
  }
  return out;
}

function keyHalo(w: number, d: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  const m = new THREE.MeshBasicMaterial({
    color: 0xffc35e,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, DIMS.whiteH / 2 + 0.0012, d / 2 + 0.0004);
  mesh.visible = false;
  return mesh;
}

/** 设置琴键按下/抬起姿态 */
export function setKeyPose(k: KeyObj, down: boolean): void {
  k.group.rotation.x = down ? k.pressRot : k.restRot;
}
