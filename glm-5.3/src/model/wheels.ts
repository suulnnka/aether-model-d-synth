import * as THREE from "three";
import { DIMS } from "./dimensions";
import type { MaterialLib } from "./materials";

/** 音高轮 / 调制轮(MDL-2):滚花圆柱,音高轮弹簧回中(INT-5) */

export interface WheelObj {
  group: THREE.Group;
  spinner: THREE.Object3D;
  halo: THREE.Mesh;
  kind: "pitch" | "mod";
}

export function createWheel(kind: "pitch" | "mod", x: number, mats: MaterialLib): WheelObj {
  const group = new THREE.Group();
  group.position.set(x, DIMS.keyBedTop + 0.004, DIMS.wheelZ);

  // 轮槽护框
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(DIMS.wheelW + 0.012, 0.006, DIMS.wheelR * 2 + 0.012),
    mats.bed
  );
  frame.position.y = -0.004;
  group.add(frame);

  const spinner = new THREE.Group();
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(DIMS.wheelR, DIMS.wheelR, DIMS.wheelW, 28),
    mats.wheel
  );
  wheel.rotation.z = Math.PI / 2; // 轴向 x
  // 两侧盖片(带刻线感)
  const capGeo = new THREE.CylinderGeometry(DIMS.wheelR * 0.98, DIMS.wheelR * 0.98, 0.0015, 28);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, mats.switchCap);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = (s * DIMS.wheelW) / 2;
    spinner.add(cap);
  }
  spinner.add(wheel);
  group.add(spinner);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(DIMS.wheelR * 1.25, DIMS.wheelR * 0.12, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc35e, transparent: true, opacity: 0.85, depthWrite: false })
  );
  halo.rotation.y = Math.PI / 2;
  halo.visible = false;
  group.add(halo);

  return { group, spinner, halo, kind };
}

/** value: -1..1(pitch)/ 0..1(mod)→ 轮姿态 */
export function setWheelPose(w: WheelObj, value: number): void {
  const max = w.kind === "pitch" ? 0.45 : 0.6;
  w.spinner.rotation.x = -value * max;
}
