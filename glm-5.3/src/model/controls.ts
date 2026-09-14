import * as THREE from "three";
import type { MaterialLib } from "./materials";

/**
 * 面板控件 3D 工厂(MDL-2):
 * knob = 圆柱旋钮 + 指针刻线
 * selector = 旋钮 + 裙边 + 裙边指针(波形/音域档位)
 * switch-v/h = 翘板开关(通断两个姿态)
 * 每个控件附带 hover 高亮环与 raycast 命中体。
 */

export interface ControlVisual {
  group: THREE.Group;
  kind: "knob" | "selector" | "switch-v" | "switch-h";
  /** 旋钮/裙边(旋转) */
  rotator?: THREE.Object3D;
  /** 开关翘板(俯仰) */
  rocker?: THREE.Object3D;
  /** 高亮环 */
  halo: THREE.Mesh;
  /** 档位数(switch=2) */
  steps: number;
}

function haloMesh(r: number): THREE.Mesh {
  const g = new THREE.TorusGeometry(r, r * 0.12, 8, 32);
  const m = new THREE.MeshBasicMaterial({
    color: 0xffc35e,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0012;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
}

export function createKnob(d: number, mats: MaterialLib): ControlVisual {
  const group = new THREE.Group();
  const h = d * 0.62;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2 * 0.94, h, 28), mats.knob);
  body.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 * 0.82, d / 2 * 0.82, h * 0.24, 28), mats.knobSkirt);
  cap.position.y = h + h * 0.1;
  // 指针刻线
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(d * 0.07, h * 0.5, d * 0.34), mats.pointer);
  pointer.position.set(0, h + h * 0.16, d * 0.2);
  const rotator = new THREE.Group();
  rotator.add(body, cap, pointer);
  group.add(rotator);
  const halo = haloMesh(d * 0.62);
  group.add(halo);
  return { group, kind: "knob", rotator, halo, steps: 0 };
}

export function createSelector(d: number, mats: MaterialLib): ControlVisual {
  const group = new THREE.Group();
  const h = d * 0.5;
  const skirtH = d * 0.16;
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(d / 2, d / 2 * 1.06, skirtH, 30),
    mats.knobSkirt
  );
  skirt.position.y = skirtH / 2;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 * 0.62, d / 2 * 0.58, h, 24), mats.knob);
  body.position.y = skirtH + h / 2;
  // 裙边指针(小三角刻线)
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(d * 0.05, skirtH * 0.7, d * 0.3), mats.pointer);
  pointer.position.set(0, skirtH / 2, d * 0.42);
  const rotator = new THREE.Group();
  rotator.add(skirt, body, pointer);
  group.add(rotator);
  const halo = haloMesh(d * 0.66);
  group.add(halo);
  return { group, kind: "selector", rotator, halo, steps: 0 };
}

export function createRockerSwitch(
  w: number,
  h: number,
  vertical: boolean,
  mats: MaterialLib
): ControlVisual {
  const group = new THREE.Group();
  // 底座圈
  const base = new THREE.Mesh(
    vertical
      ? new THREE.BoxGeometry(w * 1.28, h * 0.24, w * 0.9)
      : new THREE.BoxGeometry(h * 0.24, w * 0.9, w * 1.28),
    mats.switchBody
  );
  base.position.y = 0.0008;
  group.add(base);

  // 翘板:绕水平轴翻转;vertical 开关绕 x 轴,horizontal 绕 z 轴
  const capLen = h * 0.86;
  const cap = new THREE.Mesh(
    vertical
      ? new THREE.BoxGeometry(w * 0.92, capLen, w * 0.5)
      : new THREE.BoxGeometry(capLen, w * 0.5, w * 0.92),
    mats.switchCap
  );
  cap.position.y = w * 0.24;
  const rocker = new THREE.Group();
  rocker.add(cap);
  group.add(rocker);

  const halo = haloMesh(Math.max(w, h) * 0.62);
  group.add(halo);
  return {
    group,
    kind: vertical ? "switch-v" : "switch-h",
    rocker,
    halo,
    steps: 2,
  };
}

/** 开关姿态:0 = Off,1 = On(vertical:On 向后仰) */
export function setSwitchPose(v: ControlVisual, value: number): void {
  if (!v.rocker) return;
  const on = value >= 0.5;
  if (v.kind === "switch-v") {
    v.rocker.rotation.x = on ? -0.42 : 0.42;
  } else {
    v.rocker.rotation.z = on ? -0.42 : 0.42;
  }
}

/** 旋钮角度:归一化 0-1 → -135°..+135°(PRD 行程) */
export function setKnobAngle(v: ControlVisual, norm: number): void {
  if (!v.rotator) return;
  const a = -Math.PI * 0.75 + norm * Math.PI * 1.5;
  v.rotator.rotation.y = -a; // 顺时针为增
}

/** 选择器角度:step i/n → 均匀分布 */
export function setSelectorAngle(v: ControlVisual, step: number, steps: number): void {
  if (!v.rotator || steps < 2) return;
  const a0 = -Math.PI * 0.72;
  const a1 = Math.PI * 0.72;
  const a = a0 + ((a1 - a0) * step) / (steps - 1);
  v.rotator.rotation.y = -a;
}
