/**
 * 整机程序化建模与装配(MDL-1 ~ MDL-5)
 * 以米为单位,整机宽约 0.56m。
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { PARAM_DEFS, ParamStore, type ParamDef } from "../state/params";
import { PLACEMENT_MAP } from "./layout";
import { drawSilkscreen } from "./silkscreen";
import { buildMaterials, type MaterialLib } from "./materials";
import { createKnob, createSelector, createSwitch, createWheel, type ControlBinding } from "./controls3d";

export const PANEL_W = 0.545;
export const PANEL_L = 0.2;

export interface KeyInfo {
  midi: number;
  mesh: THREE.Mesh;
  white: boolean;
  restY: number;
  targetY: number;
}

export interface Synth {
  root: THREE.Group;
  hingeGroup: THREE.Group;
  hingeHandle: THREE.Mesh;
  keys: KeyInfo[];
  bindings: ControlBinding[];
  setHinge(deg: number): void;
  tick(dt: number): void;
  led: THREE.Mesh;
  ledMat: THREE.MeshStandardMaterial;
  silkTexture: THREE.CanvasTexture;
}

/* ---------- 尺寸 ---------- */
const CAB_W = 0.56;
const CAB_H = 0.1;
const CAB_D = 0.36;
const HINGE_Z = 0.05; // 铰链轴 z:面板靠键盘(+z,演奏者)一侧的前缘;面板向 -z 伸展,自由缘向上掀起
const KEY_Z0 = 0.073; // 白键前沿(演奏者在 +z 侧)
const KEY_LEN = 0.095;
const WW = 0.01565; // 白键宽
const WGAP = 0.00055;

function isWhite(midi: number): boolean {
  return [0, 2, 4, 5, 7, 9, 11].includes(((midi % 12) + 12) % 12);
}

export function buildSynth(store: ParamStore, maxAnisotropy: number): Synth {
  const m: MaterialLib = buildMaterials();
  const root = new THREE.Group();

  /* ===== 机箱 ===== */
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(CAB_W, CAB_H, CAB_D), m.cabinet);
  cabinet.position.y = CAB_H / 2;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  root.add(cabinet);

  // 键盘凹槽前沿(装饰斜面)
  const cheekF = new THREE.Mesh(new THREE.BoxGeometry(CAB_W, 0.012, 0.02), m.cabinet);
  cheekF.position.set(0, 0.006, -CAB_D / 2 + 0.01);
  root.add(cheekF);

  /* ===== 左右木侧板(圆角,MDL-1) ===== */
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(
      new RoundedBoxGeometry(0.022, 0.118, CAB_D + 0.02, 3, 0.006),
      m.wood
    );
    board.position.set(side * (CAB_W / 2 + 0.008), 0.059, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    root.add(board);
  }

  /* ===== 铰链面板组(HINGE-1) ===== */
  const hingeGroup = new THREE.Group();
  hingeGroup.position.set(0, 0.103, HINGE_Z);
  root.add(hingeGroup);

  const silkCanvas = drawSilkscreen();
  const silkTexture = new THREE.CanvasTexture(silkCanvas);
  silkTexture.colorSpace = THREE.SRGBColorSpace;
  silkTexture.anisotropy = maxAnisotropy;

  const panelSideMat = new THREE.MeshStandardMaterial({ color: 0x232426, metalness: 0.8, roughness: 0.45 });
  // 面板顶面 = 丝印贴图(VIEW-5 / MDL-3)
  const panelFaceMat = new THREE.MeshStandardMaterial({
    map: silkTexture,
    metalness: 0.75,
    roughness: 0.45,
  });
  const panelMats = [panelSideMat, panelSideMat, panelFaceMat, panelSideMat, panelSideMat, panelSideMat];
  const panel = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.009, PANEL_L), panelMats);
  panel.position.set(0, -0.0045, -PANEL_L / 2);
  panel.castShadow = true;
  panel.receiveShadow = true;
  hingeGroup.add(panel);

  // 面板边框(铝质感薄框)
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb9b9bd, metalness: 0.9, roughness: 0.3 });
  for (const [w, h, d, x, z] of [
    [PANEL_W + 0.006, 0.006, 0.008, 0, -PANEL_L - 0.001],
    [PANEL_W + 0.006, 0.006, 0.008, 0, 0.001],
    [0.008, 0.006, PANEL_L, -PANEL_W / 2 - 0.001, -PANEL_L / 2],
    [0.008, 0.006, PANEL_L, PANEL_W / 2 + 0.001, -PANEL_L / 2],
  ] as const) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trimMat);
    t.position.set(x, -0.0045, z);
    hingeGroup.add(t);
  }

  // 前缘拖拽条带(HINGE-3 命中区)
  const hingeHandleMat = new THREE.MeshStandardMaterial({
    color: 0x8f9095, metalness: 0.85, roughness: 0.35, emissive: 0xe08a3c, emissiveIntensity: 0,
  });
  const hingeHandle = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.014, 0.01), hingeHandleMat);
  hingeHandle.position.set(0, -0.0045, -PANEL_L - 0.006);
  hingeHandle.userData.isHingeHandle = true;
  hingeGroup.add(hingeHandle);

  // 面板螺丝(MDL-4)
  const screwGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.001, 10);
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9e, metalness: 0.95, roughness: 0.35 });
  for (const [sx, sz] of [[-0.265, -0.012], [0.265, -0.012], [-0.265, -0.188], [0.265, -0.188]] as const) {
    const s = new THREE.Mesh(screwGeo, screwMat);
    s.position.set(sx, -0.0005, sz);
    hingeGroup.add(s);
  }

  // 铰链轴细节(机箱侧两个铰链座)
  const hingePinGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 12);
  for (const hx of [-0.24, 0.24]) {
    const pin = new THREE.Mesh(hingePinGeo, m.hinge);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(hx, 0.103, HINGE_Z);
    root.add(pin);
  }

  /* ===== 面板控件 ===== */
  const bindings: ControlBinding[] = [];
  const controlRoots: THREE.Group[] = [];

  for (const def of PARAM_DEFS) {
    if (def.section === "perf") continue; // 轮 / 电源单独处理
    const p = PLACEMENT_MAP.get(def.id);
    if (!p) continue;

    let built: { group: THREE.Group; update: (v: number) => void; hit: THREE.Object3D };
    if (def.kind === "selector") built = createSelector(def, m);
    else if (def.kind === "switch") built = createSwitch(def, m);
    else built = createKnob(def, m);

    built.group.position.set((p.u - 0.5) * PANEL_W, 0.0005, -(1 - p.v) * PANEL_L);
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.controlId = def.id;
    });
    hingeGroup.add(built.group);
    controlRoots.push(built.group);

    const binding: ControlBinding = {
      id: def.id,
      kind: def.kind as ControlBinding["kind"],
      def,
      update: built.update,
      hit: built.hit,
    };
    bindings.push(binding);
    store.bind(def.id, (v) => binding.update(v));
  }

  /* ===== 44 键键盘(F2–C6,MIDI 41–84,MDL/键盘#36) ===== */
  const keys: KeyInfo[] = [];
  const keybedY = 0.101;
  let whiteIdx = 0;
  // 先数白键总数以居中
  let totalWhite = 0;
  for (let midi = 41; midi <= 84; midi++) if (isWhite(midi)) totalWhite++;
  const keysW = totalWhite * WW + (totalWhite - 1) * WGAP;
  const x0 = -keysW / 2;

  for (let midi = 41; midi <= 84; midi++) {
    const white = isWhite(midi);
    if (white) {
      const x = x0 + whiteIdx * (WW + WGAP);
      const geo = new THREE.BoxGeometry(WW, 0.009, KEY_LEN);
      const mesh = new THREE.Mesh(geo, m.keyWhite);
      mesh.position.set(x, keybedY + 0.0045, KEY_Z0 + KEY_LEN / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.keyMidi = midi;
      root.add(mesh);
      keys.push({ midi, mesh, white, restY: mesh.position.y, targetY: mesh.position.y });
      whiteIdx++;
    } else {
      const geo = new THREE.BoxGeometry(WW * 0.62, 0.011, KEY_LEN * 0.64);
      const mesh = new THREE.Mesh(geo, m.keyBlack);
      // 黑键位于前一白键右边界
      const x = x0 + whiteIdx * (WW + WGAP) - (WW + WGAP) / 2;
      mesh.position.set(x, keybedY + 0.0085, KEY_Z0 + KEY_LEN * 0.33);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.keyMidi = midi;
      root.add(mesh);
      keys.push({ midi, mesh, white, restY: mesh.position.y, targetY: mesh.position.y });
    }
  }

  // 键盘木托
  const keybed = new THREE.Mesh(new THREE.BoxGeometry(keysW + 0.01, 0.004, KEY_LEN + 0.012), m.wood);
  keybed.position.set(0, keybedY - 0.004, KEY_Z0 + KEY_LEN / 2);
  keybed.receiveShadow = true;
  root.add(keybed);

  /* ===== 音高轮 / 调制轮(#37/#38) ===== */
  const pitchWheelBuilt = createWheel(m);
  pitchWheelBuilt.group.position.set(-0.256, keybedY + 0.012, KEY_Z0 + KEY_LEN / 2 + 0.005);
  pitchWheelBuilt.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.userData.wheelId = "pitchWheel";
  });
  root.add(pitchWheelBuilt.group);

  const modWheelBuilt = createWheel(m);
  modWheelBuilt.group.position.set(-0.232, keybedY + 0.012, KEY_Z0 + KEY_LEN / 2 + 0.005);
  modWheelBuilt.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.userData.wheelId = "modWheel";
  });
  root.add(modWheelBuilt.group);

  store.bind("pitchWheel", (v) => {
    pitchWheelBuilt.wheel.rotation.x = -(v / 240) * 2.2;
  });
  store.bind("modWheel", (v) => {
    modWheelBuilt.wheel.rotation.x = -v * 2.2;
  });

  /* ===== 电源开关 + 指示灯(#39,VIS-6,左侧板) ===== */
  const powerGroup = new THREE.Group();
  powerGroup.position.set(-CAB_W / 2 - 0.008, 0.118, 0.06);
  const powerBase = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.022), m.switchBase);
  powerBase.position.y = 0.002;
  powerBase.userData.controlId = "power";
  powerGroup.add(powerBase);
  const powerLever = new THREE.Group();
  const powerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.016), m.switchLever);
  powerPlate.position.y = 0.006;
  powerPlate.userData.controlId = "power";
  powerLever.add(powerPlate);
  powerGroup.add(powerLever);
  root.add(powerGroup);

  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 0, roughness: 0.4,
  });
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 12), ledMat);
  led.position.set(-CAB_W / 2 - 0.008, 0.118, 0.11);
  root.add(led);

  store.bind("power", (on) => {
    powerLever.rotation.x = on ? -0.38 : 0.38;
    ledMat.emissiveIntensity = on ? 2.4 : 0;
  });

  /* ===== 后面板装饰插孔(MDL-1) ===== */
  const jackGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.008, 14);
  for (let i = 0; i < 5; i++) {
    const jack = new THREE.Mesh(jackGeo, m.jack);
    jack.rotation.x = Math.PI / 2;
    jack.position.set(-0.18 + i * 0.05, 0.062, CAB_D / 2 + 0.002);
    root.add(jack);
  }

  /* ===== 铰链角状态 ===== */
  let hingeDeg = 0;
  const setHinge = (deg: number) => {
    hingeDeg = Math.min(60, Math.max(0, deg));
    hingeGroup.rotation.x = THREE.MathUtils.degToRad(hingeDeg); // 正角:自由缘(v=0,-z 侧)向上掀起,面朝演奏者(+z)
  };

  /* ===== 逐帧动画(琴键下沉/回弹) ===== */
  const tick = (dt: number) => {
    const k = Math.min(1, dt * 28);
    for (const key of keys) {
      if (Math.abs(key.mesh.position.y - key.targetY) > 1e-5) {
        key.mesh.position.y += (key.targetY - key.mesh.position.y) * k;
      }
    }
  };

  return { root, hingeGroup, hingeHandle, keys, bindings, setHinge, tick, led, ledMat, silkTexture };
}

/** 控件 def 查找(交互层用) */
export function findDef(id: string): ParamDef {
  return PARAM_DEFS.find((d) => d.id === id)!;
}
