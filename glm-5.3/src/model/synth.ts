/**
 * 整机总装:铰链面板厚箱体(控制面 + 背腔)+ 全部控件按 §8.2 摆位 +
 * 44 键键盘 + 状态联动(ParamStore → 3D 姿态)。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { createMaterials } from "./materials";
import { DIM, HALF_W, POS, ROW, SEC, SIDE } from "./dimensions";
import { RANGE_STEPS, WAVE_STEPS } from "../state/paramStore";
import { panelSilkscreen, sideStripSilkscreen } from "./silkscreen";
import {
  makeKnob,
  makeSelector,
  makeSwitch,
  makeRocker,
  makePushButton,
  makeLamp,
  makeWheel,
  type ControlHandle,
} from "./controls";
import { buildBackroom } from "./backroom";
import { buildCabinet } from "./cabinet";
import { KeyboardModel } from "./keys";
import type { ParamStore } from "../state/paramStore";

export interface SynthModel {
  root: THREE.Group;
  panelPivot: THREE.Group;
  keyboard: KeyboardModel;
  handles: Map<string, ControlHandle>;
  /** 面板前缘拖拽调角的命中区(HINGE-3) */
  panelLip: THREE.Mesh;
  setPowerLed(on: boolean): void;
  setOverloadLamp(on: boolean): void;
  setPoweredLook(on: boolean): void;
  anchors: Record<string, THREE.Object3D>;
  mats: MaterialLibrary;
  dispose(): void;
}

export function buildSynth(store: ParamStore): SynthModel {
  const mats = createMaterials();
  const root = new THREE.Group();
  const handles = new Map<string, ControlHandle>();

  /* ============ 底箱 + 木侧板 ============ */
  const { group: cabinet } = buildCabinet(mats);
  root.add(cabinet);

  /* ============ 铰链面板(厚箱体) ============ */
  const panelPivot = new THREE.Group();
  panelPivot.position.set(0, DIM.hingeY, DIM.hingeZ);
  root.add(panelPivot);

  const panel = new THREE.Group();
  // 布局坐标 v=0 为面板后缘(自由边)、v=panelD 为前缘(铰链/键盘侧);
  // 平移后 v=0 边落在铰链轴上,内部布局/丝印方向无需改动
  panel.position.z = -DIM.panelD;
  panelPivot.add(panel);

  // 控制面金属板
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_W * 2, 0.004, DIM.panelD),
    mats.panelMetal,
  );
  face.position.set(0, -0.001, DIM.panelD / 2);
  face.receiveShadow = true;
  panel.add(face);

  // 丝印
  const silk = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2 - 0.004, DIM.panelD - 0.004),
    new THREE.MeshStandardMaterial({
      map: panelSilkscreen(),
      transparent: true,
      roughness: 0.5,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  silk.rotation.x = -Math.PI / 2;
  silk.position.set(0, 0.0012, DIM.panelD / 2);
  panel.add(silk);

  // 面板凸边框
  const frameMat = mats.panelFrame;
  const fw = 0.005;
  const fh = 0.0075;
  const frames: Array<[number, number, number, number]> = [
    [0, DIM.panelD - fw / 2, HALF_W * 2, fw],
    [0, fw / 2, HALF_W * 2, fw],
  ];
  for (const [fx, fz, bw, bd] of frames) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, fh, bd), frameMat);
    m.position.set(fx, fh / 2 - 0.001, fz);
    panel.add(m);
  }
  for (const fx of [-HALF_W + fw / 2, HALF_W - fw / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, DIM.panelD), frameMat);
    m.position.set(fx, fh / 2 - 0.001, DIM.panelD / 2);
    panel.add(m);
  }

  // 背腔:侧壁 + 后壁 + 元器件
  const cavityWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.chassis);
    m.position.set(x, y, z);
    panel.add(m);
  };
  const CH = DIM.panelThick;
  cavityWall(0.004, CH, DIM.panelD, -HALF_W + 0.002, -CH / 2, DIM.panelD / 2);
  cavityWall(0.004, CH, DIM.panelD, HALF_W - 0.002, -CH / 2, DIM.panelD / 2);
  cavityWall(HALF_W * 2, CH, 0.004, 0, -CH / 2, 0.002);
  cavityWall(HALF_W * 2, CH, 0.004, 0, -CH / 2, DIM.panelD - 0.002);
  panel.add(buildBackroom(mats));

  // 面板螺丝(MDL-4)
  const screwGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 0.0012, 10);
  const screws = new THREE.InstancedMesh(screwGeo, mats.metalPart, 6);
  const dummy = new THREE.Object3D();
  const screwPos: Array<[number, number]> = [
    [-HALF_W + 0.012, 0.012],
    [HALF_W - 0.012, 0.012],
    [-HALF_W + 0.012, DIM.panelD - 0.012],
    [HALF_W - 0.012, DIM.panelD - 0.012],
    [-0.09, 0.008],
    [0.1, 0.008],
  ];
  screwPos.forEach(([sx, sz], i) => {
    dummy.position.set(sx, 0.0018, sz);
    dummy.updateMatrix();
    screws.setMatrixAt(i, dummy.matrix);
  });
  panel.add(screws);

  /* 面板前缘拖拽条(HINGE-3) */
  const panelLip = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_W * 2 - 0.02, 0.012, 0.014),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  panelLip.position.set(0, 0.002, 0.008); // 自由后缘(v=0 侧)
  panelLip.userData.panelLip = true;
  panel.add(panelLip);

  /* ============ 面板控件 ============ */
  const add = (h: ControlHandle) => {
    panel.add(h.group);
    handles.set(handlesId(h), h);
  };
  function handlesId(h: ControlHandle): string {
    // 工厂不知道 paramId,从拾取体取回
    const hit = h.group.children.find((c) => c.userData.pick);
    return (hit!.userData.pick as { paramId: string }).paramId;
  }

  /* CONTROLLERS */
  add(makeKnob(mats, POS.tune, "tune", -12, 12, 1.12));
  add(makeKnob(mats, POS.glideTime, "glideTime", 0, 10, 0.92));
  add(makeKnob(mats, POS.modMix, "modMix", 0, 10, 0.92));
  add(makeSwitch(mats, POS.srcA, "srcAFilterEg", "orange"));
  add(makeSwitch(mats, POS.srcB, "srcBLfo", "orange"));
  /* 交界柱 A/B */
  add(makeSwitch(mats, POS.oscMod, "oscMod", "orange"));
  add(makeSwitch(mats, POS.osc3Control, "osc3Control", "orange"));
  /* OSCILLATOR BANK ×3 */
  for (let n = 1; n <= 3; n++) {
    add(makeSelector(mats, POS.oscRange(n), `osc${n}Range`, RANGE_STEPS));
    add(makeKnob(mats, POS.oscFreq(n), `osc${n}Tune`, -12, 12, 0.95));
    add(makeSelector(mats, POS.oscWave(n), `osc${n}Wave`, WAVE_STEPS));
  }
  /* MIXER:交界列 C 蓝拨杆 + Volume ×3 + Ext/Noise */
  for (let n = 1; n <= 3; n++) {
    add(makeSwitch(mats, POS.oscOn(n), `osc${n}On`, "blue"));
    add(makeKnob(mats, POS.oscVol(n), `osc${n}Vol`, 0, 10, 0.9));
  }
  add(makeKnob(mats, POS.extVol, "extVol", 0, 10, 0.9));
  add(makeSwitch(mats, POS.extOn, "extOn", "blue"));
  add(makeKnob(mats, POS.noiseVol, "noiseVol", 0, 10, 0.9));
  add(makeSwitch(mats, POS.noiseOn, "noiseOn", "blue"));
  add(makeSwitch(mats, POS.noiseType, "noiseType", "blue"));
  /* 交界柱 D */
  add(makeSwitch(mats, POS.filterMod, "filterMod", "orange"));
  add(makeSwitch(mats, POS.kc1, "kc1", "orange"));
  add(makeSwitch(mats, POS.kc2, "kc2", "orange"));
  /* MODIFIERS */
  add(makeKnob(mats, POS.cutoff, "cutoff", -5, 5, 1.0));
  add(makeKnob(mats, POS.emphasis, "emphasis", 0, 10, 0.95));
  add(makeKnob(mats, POS.contour, "contour", 0, 10, 0.95));
  add(makeKnob(mats, POS.filtA, "filtA", 0, 10, 0.9));
  add(makeKnob(mats, POS.filtD, "filtD", 0, 10, 0.9));
  add(makeKnob(mats, POS.filtS, "filtS", 0, 10, 0.9));
  add(makeKnob(mats, POS.loudA, "loudA", 0, 10, 0.9));
  add(makeKnob(mats, POS.loudD, "loudD", 0, 10, 0.9));
  add(makeKnob(mats, POS.loudS, "loudS", 0, 10, 0.9));
  /* OUTPUT */
  add(makeKnob(mats, POS.volume, "volume", 0, 10, 1.05));
  add(makePushButton(mats, POS.a440, "tunerOn"));
  add(makeSwitch(mats, POS.tunerOn, "tunerOn", "blue"));
  add(makeRocker(mats, POS.power, "power"));

  /* 指示灯 */
  const powerLed = makeLamp(mats, POS.powerLed, mats.led);
  const overloadLamp = makeLamp(mats, POS.overload, mats.overloadLamp);
  panel.add(powerLed.group, overloadLamp.group);

  /* ============ 键盘左侧边条 ============ */
  const side = new THREE.Group();
  side.position.set(0, DIM.keyTopY - 0.0015 + 0.003, 0);
  root.add(side);
  const sideSilk = new THREE.Mesh(
    new THREE.PlaneGeometry(SIDE.x1 - SIDE.x0, 0.15),
    new THREE.MeshStandardMaterial({
      map: sideStripSilkscreen(),
      transparent: true,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  sideSilk.rotation.x = -Math.PI / 2;
  sideSilk.position.set((SIDE.x0 + SIDE.x1) / 2, 0.0006, 0.105);
  side.add(sideSilk);
  addSide(makeKnob(mats, { x: SIDE.lfoRate.x, v: SIDE.lfoRate.z }, "lfoRate", 0, 10, 1.0));
  addSide(makeSwitch(mats, { x: SIDE.lfoWave.x, v: SIDE.lfoWave.z }, "lfoWave", "orange"));
  addSide(makeSwitch(mats, { x: SIDE.glide.x, v: SIDE.glide.z }, "glideOn", "orange"));
  addSide(makeSwitch(mats, { x: SIDE.decay.x, v: SIDE.decay.z }, "decayMode", "orange"));
  addSide(makeWheel(mats, { x: SIDE.pitchWheel.x, v: SIDE.pitchWheel.z }, "pitchWheel", 0, 100));
  addSide(makeWheel(mats, { x: SIDE.modWheel.x, v: SIDE.modWheel.z }, "modWheel", 0, 100));
  function addSide(h: ControlHandle) {
    side.add(h.group);
    const hit = h.group.children.find((c) => c.userData.pick);
    handles.set((hit!.userData.pick as { paramId: string }).paramId, h);
  }

  /* ============ 键盘 ============ */
  const keyboard = new KeyboardModel(mats);
  root.add(keyboard.group);

  /* ============ 引导锚点(3D 区域 → 屏幕投影) ============ */
  const anchors: Record<string, THREE.Object3D> = {};
  const anchor = (id: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    anchors[id] = o;
  };
  anchor("controllers", panel, -0.2245, 0.006, ROW.r2);
  anchor("oscillators", panel, -0.092, 0.006, ROW.r2);
  anchor("mixer", panel, 0.03, 0.006, ROW.r2);
  anchor("filter", panel, 0.147, 0.006, ROW.r1);
  anchor("filter-envelope", panel, 0.147, 0.006, ROW.r2);
  anchor("loudness-envelope", panel, 0.147, 0.006, ROW.r3);
  anchor("modulation", panel, -0.182, 0.006, ROW.r2);
  anchor("output", panel, 0.231, 0.006, ROW.r2);
  anchor("keyboard", root, 0.0, 0.075, 0.115);

  /* ============ 状态联动 ============ */
  for (const [id, h] of handles) h.update(store.get(id));
  powerLed.set(store.bool("power"));
  const unsubs = [
    store.subscribeAny((changed) => {
      for (const id of changed) {
        handles.get(id)?.update(store.get(id));
      }
      if (changed.includes("power")) {
        const on = store.bool("power");
        powerLed.set(on);
        setPoweredLook(on);
      }
    }),
  ];
  void SEC;

  function setPoweredLook(on: boolean) {
    mats.knobCap.color.setHex(on ? 0x0e0e10 : 0x08080a);
    mats.knobPointer.color.setHex(on ? 0xd8d2c2 : 0x6a655c);
  }

  return {
    root,
    panelPivot,
    keyboard,
    handles,
    panelLip,
    setPowerLed: (on) => powerLed.set(on),
    setOverloadLamp: (on) => overloadLamp.set(on),
    setPoweredLook,
    anchors,
    mats,
    dispose() {
      unsubs.forEach((u) => u());
    },
  };
}
