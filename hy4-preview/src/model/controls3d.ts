/**
 * 控件 3D 形态工厂(MDL-2 / INT-6)
 * 每个控件 = Group + update(value) 姿态更新;命中网格带 userData.controlId。
 */
import * as THREE from "three";
import type { ParamDef } from "../state/params";
import type { MaterialLib } from "./materials";

export type ControlKind = "knob" | "selector" | "switch" | "wheel";

export interface ControlBinding {
  id: string;
  kind: ControlKind;
  def: ParamDef;
  /** 铸入 param 归一化值时的姿态更新 */
  update: (v: number) => void;
  /** 参与射线检测的网格 */
  hit: THREE.Object3D;
}

const KNOB_R = 0.0125;

function norm(def: ParamDef, v: number): number {
  return (v - def.min!) / (def.max! - def.min!);
}

/** 旋钮扫过角度:值 0 → -135°,max → +135° */
const SWEEP = (135 * Math.PI) / 180;

/* ---------- 连续旋钮(INT-1) ---------- */

export function createKnob(def: ParamDef, m: MaterialLib): { group: THREE.Group; update: (v: number) => void; hit: THREE.Object3D } {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(KNOB_R, KNOB_R * 1.08, 0.014, 24),
    m.knob
  );
  body.position.y = 0.007;
  body.castShadow = true;
  group.add(body);

  // 顶部银色刻线帽(旋转部分)
  const cap = new THREE.Group();
  const capDisc = new THREE.Mesh(new THREE.CylinderGeometry(KNOB_R * 0.92, KNOB_R * 0.92, 0.002, 24), m.knobCap);
  capDisc.position.y = 0.0145;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.001, KNOB_R * 0.8), m.knobCap);
  line.position.set(0, 0.0155, -KNOB_R * 0.42);
  cap.add(capDisc, line);
  group.add(cap);

  const update = (v: number) => {
    const n = norm(def, v);
    cap.rotation.y = -SWEEP + n * 2 * SWEEP;
  };
  update(def.def);
  return { group, update, hit: body };
}

/* ---------- 档位选择旋钮(INT-2,带裙边) ---------- */

export function createSelector(def: ParamDef, m: MaterialLib): { group: THREE.Group; update: (v: number) => void; hit: THREE.Object3D } {
  const group = new THREE.Group();

  // 裙边底盘
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(KNOB_R * 1.5, KNOB_R * 1.6, 0.005, 28), m.skirt);
  skirt.position.y = 0.0025;
  skirt.receiveShadow = true;
  group.add(skirt);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(KNOB_R * 0.85, KNOB_R * 0.95, 0.012, 20), m.knob);
  body.position.y = 0.011;
  body.castShadow = true;
  group.add(body);

  const cap = new THREE.Group();
  const capDisc = new THREE.Mesh(new THREE.CylinderGeometry(KNOB_R * 0.78, KNOB_R * 0.78, 0.002, 20), m.knobCap);
  capDisc.position.y = 0.0175;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.001, KNOB_R * 0.7), m.knobCap);
  line.position.set(0, 0.0185, -KNOB_R * 0.36);
  cap.add(capDisc, line);
  group.add(cap);

  const update = (v: number) => {
    const n = def.steps!.length > 1 ? v / (def.steps!.length - 1) : 0.5;
    cap.rotation.y = -SWEEP + n * 2 * SWEEP;
  };
  update(def.def);
  return { group, update, hit: skirt };
}

/* ---------- 翘板开关(INT-3) ---------- */

export function createSwitch(def: ParamDef, m: MaterialLib): { group: THREE.Group; update: (v: number) => void; hit: THREE.Object3D } {
  const group = new THREE.Group();

  // 底座
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.022), m.switchBase);
  base.position.y = 0.002;
  group.add(base);

  // 翘板(绕 X 轴倾斜)
  const lever = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.004, 0.018), m.switchLever);
  plate.position.y = 0.006;
  lever.add(plate);
  group.add(lever);

  const update = (v: number) => {
    const on = v >= 0.5;
    lever.rotation.x = on ? -0.38 : 0.38;
  };
  update(def.def);
  return { group, update, hit: base };
}

/* ---------- 演奏轮(INT-5) ---------- */

export function createWheel(m: MaterialLib): { group: THREE.Group; wheel: THREE.Group; hit: THREE.Object3D } {
  const group = new THREE.Group();
  const R = 0.026;
  const wheel = new THREE.Group();

  const geo = new THREE.CylinderGeometry(R, R, 0.02, 28, 1, false);
  const body = new THREE.Mesh(geo, m.wheel);
  body.rotation.z = Math.PI / 2; // 轴沿 X
  body.castShadow = true;
  wheel.add(body);

  // 防滑滚花:两端细环
  for (const dx of [-0.008, 0.008]) {
    const knurl = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.0012, 8, 32), m.wheelKnurl);
    knurl.rotation.y = Math.PI / 2;
    knurl.position.x = dx;
    wheel.add(knurl);
  }

  group.add(wheel);
  return { group, wheel, hit: body };
}
