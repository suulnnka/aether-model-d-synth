import * as THREE from "three";
import { formatValue, PARAM_MAP, rawToNorm } from "../state/params";
import type { ParamStore } from "../state/paramStore";
import { DIMS } from "./dimensions";
import {
  createKnob,
  createSelector,
  createRockerSwitch,
  setKnobAngle,
  setSelectorAngle,
  setSwitchPose,
  type ControlVisual,
} from "./controls";
import { createCabinet, setPowerPose, type Cabinet } from "./cabinet";
import { createKeyboard, setKeyPose, type KeyObj } from "./keys";
import { createMaterials, type MaterialLib } from "./materials";
import { createPanel, setPanelAngle, type PanelAssembly } from "./panel";
import { createWheel, setWheelPose, type WheelObj } from "./wheels";
import { ITEMS } from "./layout";

/** 命中目标类型 */
export type HitTarget =
  | { type: "control"; id: string }
  | { type: "key"; midi: number }
  | { type: "wheel"; kind: "pitch" | "mod" }
  | { type: "hinge" }
  | { type: "power" }
  | null;

export interface SynthModel {
  root: THREE.Group;
  materials: MaterialLib;
  cabinet: Cabinet;
  panel: PanelAssembly;
  keys: Map<number, KeyObj>;
  wheels: { pitch: WheelObj; mod: WheelObj };
  /** controlId → 视觉句柄 */
  controls: Map<string, ControlVisual>;
  /** 当前铰链角度(度) */
  hingeDeg: number;
  setHingeDeg(deg: number): void;
  /** 参数 → 3D 姿态 更新器(ParamStore 订阅) */
  applyParam(id: string, value: number): void;
  applyAllParams(store: ParamStore): void;
  setKey(midi: number, down: boolean): void;
  setWheel(kind: "pitch" | "mod", value: number): void;
  setPower(on: boolean): void;
  /** raycast 命中解析 */
  resolveHit(obj: THREE.Object3D | null): HitTarget;
  hitRoots: THREE.Object3D[];
  tooltipText(id: string, store: ParamStore): string;
  wheelValues: { pitch: number; mod: number };
}

export function createSynth(): SynthModel {
  const materials = createMaterials();
  const root = new THREE.Group();

  const cabinet = createCabinet(materials);
  root.add(cabinet.root);

  const panel = createPanel(materials);
  root.add(panel.group);

  const keyboard = createKeyboard(materials);
  root.add(keyboard.root);

  const wheels = {
    pitch: createWheel("pitch", DIMS.pitchWheelX, materials),
    mod: createWheel("mod", DIMS.modWheelX, materials),
  };
  root.add(wheels.pitch.group, wheels.mod.group);

  // ---- 面板控件摆位 ----
  const controls = new Map<string, ControlVisual>();
  for (const item of ITEMS) {
    if (!item.id) continue;
    let v: ControlVisual;
    if (item.type === "knob") v = createKnob(item.d ?? 0.024, materials);
    else if (item.type === "selector") v = createSelector(item.d ?? 0.032, materials);
    else v = createRockerSwitch(item.w ?? 0.02, item.h ?? 0.026, item.type === "switch-v", materials);
    v.group.position.copy(panel.localPos(item.x, item.y, 0));
    panel.group.add(v.group);
    controls.set(item.id, v);
  }

  const model: SynthModel = {
    root,
    materials,
    cabinet,
    panel,
    keys: keyboard.keys,
    wheels,
    controls,
    hingeDeg: DIMS.panelDefaultDeg,
    wheelValues: { pitch: 0, mod: 0 },

    setHingeDeg(deg: number) {
      this.hingeDeg = deg;
      setPanelAngle(panel.group, deg);
      const strut = cabinet.interior.getObjectByName("interior-strut");
      if (strut) strut.visible = deg > 15;
    },

    applyParam(id: string, value: number) {
      const def = PARAM_MAP.get(id);
      if (!def) return;
      if (id === "power") {
        this.setPower(value >= 0.5);
        return;
      }
      const v = controls.get(id);
      if (!v) return;
      if (v.kind === "knob") {
        setKnobAngle(v, rawToNorm(def, value));
      } else if (v.kind === "selector") {
        setSelectorAngle(v, value, def.max + 1);
      } else {
        setSwitchPose(v, value);
      }
    },

    applyAllParams(store: ParamStore) {
      for (const def of PARAM_MAP.values()) {
        this.applyParam(def.id, store.get(def.id));
      }
      this.setPower(store.isOn("power"));
    },

    setKey(midi: number, down: boolean) {
      const k = this.keys.get(midi);
      if (k) setKeyPose(k, down);
    },

    setWheel(kind: "pitch" | "mod", value: number) {
      this.wheelValues[kind] = value;
      setWheelPose(this.wheels[kind], value);
    },

    setPower(on: boolean) {
      setPowerPose(cabinet.powerRocker, on);
      cabinet.led.material = on ? materials.ledOn : materials.ledOff;
    },

    resolveHit(obj: THREE.Object3D | null): HitTarget {
      let o = obj;
      while (o) {
        const hit = o.userData?.hit as HitTarget | undefined;
        if (hit) return hit;
        if (o.name === "hinge-edge") return { type: "hinge" };
        o = o.parent;
      }
      return null;
    },

    hitRoots: [],

    tooltipText(id: string, store: ParamStore): string {
      const def = PARAM_MAP.get(id);
      if (!def) return id;
      return `${def.label} · ${formatValue(def, store.get(id))}`;
    },
  };

  // ---- 打 hit 标记 ----
  for (const [id, v] of controls) {
    v.group.traverse((o) => {
      o.userData.hit = { type: "control", id };
    });
  }
  for (const [midi, k] of model.keys) {
    k.group.traverse((o) => {
      o.userData.hit = { type: "key", midi };
    });
  }
  for (const w of [wheels.pitch, wheels.mod]) {
    w.group.traverse((o) => {
      o.userData.hit = { type: "wheel", kind: w.kind };
    });
  }
  cabinet.powerRocker.traverse((o) => {
    o.userData.hit = { type: "power" };
  });

  model.hitRoots = [root];

  return model;
}
