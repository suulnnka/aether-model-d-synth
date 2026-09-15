/**
 * 面板控件 3D 工厂(MDL-2):圆柱旋钮(指针刻线)、带裙边档位旋钮、
 * 拨杆开关、电源跷板、A-440 按钮、指示灯、竖向滑轮(滚花)。
 * 每个控件带不可见拾取体与悬停高亮环,userData.pick 供 raycast 命中。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import type { Val } from "../state/paramStore";

export type PickKind = "knob" | "selector" | "switch" | "button" | "wheel";

export interface PickInfo {
  kind: PickKind;
  paramId: string;
}

export interface CtrlPos {
  x: number;
  v: number;
}

export interface ControlHandle {
  group: THREE.Group;
  update(value: Val): void;
  setHover(on: boolean): void;
}

const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
const hoverMaterial = new THREE.MeshBasicMaterial({
  color: 0xffb340,
  transparent: true,
  opacity: 0.85,
});

function attachPick(
  mesh: THREE.Object3D,
  kind: PickKind,
  paramId: string,
  r: number,
  h: number,
  yCenter: number,
): THREE.Mesh {
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), hitMaterial);
  hit.position.y = yCenter;
  hit.userData.pick = { kind, paramId } satisfies PickInfo;
  mesh.add(hit);
  return hit;
}

function addHoverRing(group: THREE.Group, r: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.0012, 8, 40),
    hoverMaterial,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0015;
  ring.visible = false;
  group.add(ring);
  return ring;
}

/** 连续旋钮(INT-1):垂直拖动 / Shift 精调 / 滚轮微调 / 双击默认 */
export function makeKnob(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
  min: number,
  max: number,
  size = 1,
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);
  const r = 0.0115 * size;

  // 旋转体:帽身 + 指针
  const spinner = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.0135, 24), mats.knobCap);
  cap.position.y = 0.0072;
  // 顶面微凹细节:细环
  const collar = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, 0.0011, 8, 24), mats.knobPointer);
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = 0.0139;
  const pointer = new THREE.Mesh(
    new THREE.BoxGeometry(0.0016, 0.0016, r * 0.92),
    mats.knobPointer,
  );
  pointer.position.set(0, 0.0142, -r * 0.48);
  spinner.add(cap, collar, pointer);
  group.add(spinner);

  attachPick(group, "knob", paramId, r + 0.004, 0.024, 0.008);
  const ring = addHoverRing(group, r + 0.0045);

  return {
    group,
    update(value) {
      const norm = (Number(value) - min) / (max - min);
      spinner.rotation.y = THREE.MathUtils.lerp(
        (135 * Math.PI) / 180,
        (-135 * Math.PI) / 180,
        THREE.MathUtils.clamp(norm, 0, 1),
      );
    },
    setHover(on) {
      ring.visible = on;
    },
  };
}

/** 档位旋钮(INT-2):裙边 + 指针;单击循环进档 */
export function makeSelector(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
  steps: readonly string[],
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);
  const r = 0.0165;

  const spinner = new THREE.Group();
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.1, 0.0075, 24),
    mats.knobSkirt,
  );
  skirt.position.y = 0.0042;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.62, r * 0.68, 0.009, 20),
    mats.knobCap,
  );
  cap.position.y = 0.011;
  const pointer = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, 0.0018, r * 0.95),
    mats.knobPointer,
  );
  pointer.position.set(0, 0.016, -r * 0.5);
  spinner.add(skirt, cap, pointer);
  group.add(spinner);

  attachPick(group, "selector", paramId, r + 0.0035, 0.026, 0.009);
  const ring = addHoverRing(group, r + 0.004);

  return {
    group,
    update(value) {
      const idx = steps.indexOf(String(value));
      const i = idx >= 0 ? idx : 0;
      spinner.rotation.y = THREE.MathUtils.lerp(
        (150 * Math.PI) / 180,
        (-150 * Math.PI) / 180,
        steps.length > 1 ? i / (steps.length - 1) : 0.5,
      );
    },
    setHover(on) {
      ring.visible = on;
    },
  };
}

/** 拨杆开关(INT-3):单击翻转,≤100ms 动画由交互层 tween */
export function makeSwitch(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
  color: "orange" | "blue",
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.0125, 0.0045, 0.0085), mats.switchBase);
  base.position.y = 0.0022;
  group.add(base);

  const leverMat = color === "orange" ? mats.leverOrange : mats.leverBlue;
  const lever = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0016, 0.0115, 10), leverMat);
  stem.position.y = 0.0057;
  const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0021, 0.0055, 4, 10), leverMat);
  tip.position.y = 0.0125;
  lever.add(stem, tip);
  group.add(lever);

  attachPick(group, "switch", paramId, 0.011, 0.022, 0.008);
  const ring = addHoverRing(group, 0.0125);

  return {
    group,
    update(value) {
      const on = Boolean(value);
      lever.rotation.x = on ? 0.5 : -0.5;
    },
    setHover(on) {
      ring.visible = on;
    },
  };
}

/** 电源跷板开关 */
export function makeRocker(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.005, 0.026), mats.switchBase);
  frame.position.y = 0.0025;
  group.add(frame);
  const paddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.0135, 0.004, 0.02),
    mats.rocker,
  );
  paddle.position.y = 0.0062;
  group.add(paddle);

  attachPick(group, "switch", paramId, 0.016, 0.024, 0.008);
  const ring = addHoverRing(group, 0.017);

  return {
    group,
    update(value) {
      paddle.rotation.x = Boolean(value) ? 0.22 : -0.22;
      paddle.position.y = Boolean(value) ? 0.0075 : 0.005;
    },
    setHover(on) {
      ring.visible = on;
    },
  };
}

/** A-440 按钮 */
export function makePushButton(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.003, 20), mats.switchBase);
  bezel.position.y = 0.0018;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.005, 20), mats.pushButton);
  cap.position.y = 0.0045;
  group.add(bezel, cap);

  attachPick(group, "button", paramId, 0.0105, 0.012, 0.005);
  const ring = addHoverRing(group, 0.0105);

  return {
    group,
    update(value) {
      const on = Boolean(value);
      cap.position.y = on ? 0.0028 : 0.0045;
    },
    setHover(on) {
      ring.visible = on;
    },
  };
}

/** 指示灯(LED / Overload;VIS-10 自发光 + Bloom) */
export function makeLamp(
  mats: MaterialLibrary,
  pos: CtrlPos,
  material: THREE.MeshStandardMaterial,
): { group: THREE.Group; set(on: boolean): void } {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.0035, 16), mats.switchBase);
  bezel.position.y = 0.0017;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.0034, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    material,
  );
  dome.position.y = 0.0033;
  group.add(bezel, dome);
  return {
    group,
    set(on) {
      material.emissiveIntensity = on ? 3.2 : 0;
    },
  };
}

/** 竖向滑轮(INT-5):弯音(弹簧回中)/ 调制(保持) */
export function makeWheel(
  mats: MaterialLibrary,
  pos: CtrlPos,
  paramId: string,
  min: number,
  max: number,
): ControlHandle {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.v);

  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0026, 0.0026, 0.009, 10),
    mats.metalPart,
  );
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.004;
  group.add(axle);

  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0165, 0.0165, 0.0062, 28),
    mats.wheel,
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.y = 0.0165;
  // 轮面上的指示槽
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.0068, 0.0009, 0.020),
    mats.knobPointer,
  );
  slot.position.y = 0.0166;
  const spinner = new THREE.Group();
  spinner.add(wheel, slot);
  group.add(spinner);

  attachPick(group, "wheel", paramId, 0.019, 0.036, 0.016);

  return {
    group,
    update(value) {
      const norm = (Number(value) - min) / (max - min);
      spinner.rotation.x = THREE.MathUtils.lerp(
        (-78 * Math.PI) / 180,
        (78 * Math.PI) / 180,
        THREE.MathUtils.clamp(norm, 0, 1),
      );
    },
    setHover() {
      /* 滑轮用指针样式变化即可 */
    },
  };
}
