/**
 * 控件 3D 工厂(MDL-2)
 * 圆柱旋钮 / 带裙边档位旋钮 / 拨杆开关 / 竖向滑轮 / 圆形指示灯 / 跷板开关 / 按钮。
 * 每个控件最多两个 Mesh(静态件 + 转动件),零件预先合并以控制 draw call(§17)。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { knobAngle } from "./silkscreen";
import { mat, mergeGeoms, placed } from "./geoUtils";

export type ControlKind =
  | "knob"
  | "selector"
  | "switch"
  | "wheel"
  | "rocker"
  | "button"
  | "led";

export interface Control3D {
  id: string;
  kind: ControlKind;
  root: THREE.Object3D;
  /** 供 raycast 使用的目标(含不可见命中代理) */
  hits: THREE.Object3D[];
  /** 是否可由用户操作(指示灯等只读) */
  interactive: boolean;
  /** t ∈ [0,1] 归一化值 */
  setValue(t: number): void;
  setActive?(on: boolean): void;
}

// ── 预合并几何 ───────────────────────────────────────────────────────
const G = {
  knobRing: new THREE.CylinderGeometry(0.0132, 0.0132, 0.0026, 30),
  knobRotor: mergeGeoms([
    placed(new THREE.CylinderGeometry(0.0104, 0.0112, 0.016, 30), mat(0, 0.008, 0)),
    placed(
      new THREE.SphereGeometry(0.0104, 30, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0, 0.016, 0, 0, 0, 0, 0.98, 0.5, 0.98)
    ),
    placed(new THREE.BoxGeometry(0.0068, 0.0016, 0.0018), mat(0.0056, 0.0166, 0)),
  ]),
  selSkirt: new THREE.CylinderGeometry(0.0125, 0.0122, 0.0135, 26),
  selRotor: mergeGeoms([
    placed(new THREE.CylinderGeometry(0.0088, 0.0094, 0.0165, 26), mat(0, 0.0083, 0)),
    placed(
      new THREE.SphereGeometry(0.0088, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0, 0.0165, 0, 0, 0, 0, 0.98, 0.5, 0.98)
    ),
    placed(new THREE.BoxGeometry(0.0056, 0.0016, 0.0018), mat(0.0046, 0.017, 0)),
  ]),
  swBase: mergeGeoms([
    placed(new THREE.BoxGeometry(0.0096, 0.0022, 0.0136), mat(0, 0.0011, 0)),
    placed(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0022, 16), mat(0, 0.0023, 0)),
  ]),
  swLever: mergeGeoms([
    placed(new THREE.BoxGeometry(0.0032, 0.0105, 0.0032), mat(0, 0.0052, 0)),
    placed(new THREE.SphereGeometry(0.0023, 12, 8), mat(0, 0.0104, 0)),
  ]),
  ledHousing: new THREE.CylinderGeometry(0.0054, 0.0054, 0.0024, 20),
  ledLens: placed(new THREE.SphereGeometry(0.004, 20, 12), mat(0, 0.003, 0, 0, 0, 0, 1, 0.65, 1)),
  btnRim: new THREE.CylinderGeometry(0.0074, 0.0074, 0.0016, 22),
  btnCap: new THREE.CylinderGeometry(0.0062, 0.0062, 0.0052, 22),
  rockerBezel: new THREE.BoxGeometry(0.0155, 0.0022, 0.0195),
  rockerCap: new THREE.BoxGeometry(0.0125, 0.0042, 0.016),
  wheelFrame: new THREE.BoxGeometry(0.0235, 0.0075, 0.03),
  wheelRotor: (() => {
    const parts: THREE.BufferGeometry[] = [
      placed(new THREE.CylinderGeometry(0.0135, 0.0135, 0.019, 26), mat(0, 0, 0, 0, 0, Math.PI / 2)),
    ];
    const knurl = new THREE.BoxGeometry(0.0186, 0.0015, 0.0015);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      parts.push(placed(knurl, mat(0, Math.sin(a) * 0.0134, Math.cos(a) * 0.0134, a, 0, 0)));
    }
    return mergeGeoms(parts);
  })(),
  screwHead: new THREE.CylinderGeometry(0.0018, 0.0018, 0.0009, 12),
};

const hitProxy = (radius: number, height: number, y: number): THREE.Mesh => {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    new THREE.MeshBasicMaterial()
  );
  m.position.y = y;
  m.visible = false; // three.js Raycaster 不检查 visible,可作纯命中代理
  return m;
};

function makeKnob(lib: MaterialLibrary, id: string, skirted: boolean): Control3D {
  const root = new THREE.Group();
  const stat = new THREE.Mesh(skirted ? G.selSkirt : G.knobRing, lib.knobSkirt);
  stat.position.y = skirted ? 0.0068 : 0.0013;
  stat.castShadow = true;
  stat.receiveShadow = true;
  root.add(stat);

  const rotor = new THREE.Mesh(skirted ? G.selRotor : G.knobRotor, lib.knobCap);
  rotor.castShadow = true;
  root.add(rotor);

  const proxy = hitProxy(skirted ? 0.0156 : 0.0142, 0.024, 0.012);
  root.add(proxy);

  return {
    id,
    kind: skirted ? "selector" : "knob",
    root,
    hits: [proxy, rotor, stat],
    interactive: true,
    setValue(t: number) {
      rotor.rotation.y = knobAngle(t);
    },
  };
}

function makeSwitch(lib: MaterialLibrary, id: string, color: "orange" | "blue" | "black"): Control3D {
  const root = new THREE.Group();
  const base = new THREE.Mesh(G.swBase, lib.switchBase);
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const pivot = new THREE.Group();
  pivot.position.y = 0.0023;
  const leverMat =
    color === "orange" ? lib.leverOrange : color === "blue" ? lib.leverBlue : lib.leverBlack;
  const lever = new THREE.Mesh(G.swLever, leverMat);
  lever.castShadow = true;
  pivot.add(lever);
  root.add(pivot);

  const proxy = hitProxy(0.0088, 0.018, 0.009);
  root.add(proxy);

  return {
    id,
    kind: "switch",
    root,
    hits: [proxy, lever, base],
    interactive: true,
    setValue(t: number) {
      // ON = 拨杆倒向面板上沿(+v = -z)
      pivot.rotation.x = t >= 0.5 ? -0.42 : 0.42;
    },
  };
}

function makeLed(lib: MaterialLibrary, id: string, overload: boolean): Control3D {
  const root = new THREE.Group();
  const housing = new THREE.Mesh(G.ledHousing, lib.switchBase);
  housing.position.y = 0.0012;
  root.add(housing);
  const lens = new THREE.Mesh(G.ledLens, lib.ledOff);
  root.add(lens);
  root.add(hitProxy(0.006, 0.008, 0.004));

  let on = false;
  const apply = () => {
    lens.material = on ? (overload ? lib.ledOverload : lib.ledRed) : lib.ledOff;
  };

  return {
    id,
    kind: "led",
    root,
    hits: [lens, housing],
    interactive: false,
    setValue(t: number) {
      on = t >= 0.5;
      apply();
    },
    setActive(v: boolean) {
      on = v;
      apply();
    },
  };
}

function makeButton(lib: MaterialLibrary, id: string): Control3D {
  const root = new THREE.Group();
  const rim = new THREE.Mesh(G.btnRim, lib.switchBase);
  rim.position.y = 0.0008;
  root.add(rim);
  const cap = new THREE.Mesh(G.btnCap, lib.knobCap);
  cap.position.y = 0.0034;
  cap.castShadow = true;
  root.add(cap);
  const proxy = hitProxy(0.0082, 0.012, 0.006);
  root.add(proxy);
  return {
    id,
    kind: "button",
    root,
    hits: [proxy, cap],
    interactive: true,
    setValue(t: number) {
      cap.position.y = t >= 0.5 ? 0.0024 : 0.0034;
    },
  };
}

function makeRocker(lib: MaterialLibrary, id: string): Control3D {
  const root = new THREE.Group();
  const bezel = new THREE.Mesh(G.rockerBezel, lib.switchBase);
  bezel.position.y = 0.0011;
  root.add(bezel);
  const pivot = new THREE.Group();
  pivot.position.y = 0.0022;
  const cap = new THREE.Mesh(G.rockerCap, lib.knobSkirt);
  cap.position.y = 0.0021;
  cap.castShadow = true;
  pivot.add(cap);
  root.add(pivot);
  const proxy = hitProxy(0.0115, 0.016, 0.008);
  root.add(proxy);
  return {
    id,
    kind: "rocker",
    root,
    hits: [proxy, cap],
    interactive: true,
    setValue(t: number) {
      pivot.rotation.x = t >= 0.5 ? -0.2 : 0.2;
    },
  };
}

function makeWheel(lib: MaterialLibrary, id: string): Control3D {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(G.wheelFrame, lib.wheelFrame);
  frame.position.y = 0.0037;
  frame.receiveShadow = true;
  root.add(frame);

  const pivot = new THREE.Group();
  pivot.position.y = 0.0075;
  const wheel = new THREE.Mesh(G.wheelRotor, lib.wheel);
  wheel.castShadow = true;
  pivot.add(wheel);
  root.add(pivot);

  const proxy = hitProxy(0.0145, 0.032, 0.008);
  root.add(proxy);

  return {
    id,
    kind: "wheel",
    root,
    hits: [proxy, wheel],
    interactive: true,
    setValue(t: number) {
      pivot.rotation.x = (t - 0.5) * 1.9;
    },
  };
}

export function createControl(
  lib: MaterialLibrary,
  id: string,
  kind: ControlKind,
  opts: { color?: "orange" | "blue" | "black"; overload?: boolean } = {}
): Control3D {
  switch (kind) {
    case "selector":
      return makeKnob(lib, id, true);
    case "knob":
      return makeKnob(lib, id, false);
    case "switch":
      return makeSwitch(lib, id, opts.color ?? "orange");
    case "led":
      return makeLed(lib, id, !!opts.overload);
    case "button":
      return makeButton(lib, id);
    case "rocker":
      return makeRocker(lib, id);
    case "wheel":
      return makeWheel(lib, id);
    default:
      throw new Error(`unknown control kind ${kind}`);
  }
}

export { G as CONTROL_GEOMETRY };
