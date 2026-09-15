/**
 * 整机装配(model/synth.ts)
 * 琴体 + 铰链面板 + 44 键 + 全部面板控件 + 丝印;并把 ParamStore 的变化同步到 3D 姿态。
 */
import * as THREE from "three";
import { createMaterials, type MaterialLibrary } from "./materials";
import { createCabinet, type Cabinet } from "./cabinet";
import { createKeybed, type Keybed, KEY_START_MIDI } from "./keys";
import { createControl, type Control3D } from "./controls3d";
import { createPanelSilkscreenTexture, createSideSilkscreenTexture } from "./silkscreen";
import { DIM, PANEL_INNER_W, PLACEMENTS, type Placement } from "./layout";
import { CONTROL_BY_ID, params } from "../state/params";

export interface SynthModel {
  root: THREE.Group;
  cabinet: Cabinet;
  keybed: Keybed;
  materials: MaterialLibrary;
  controls: Map<string, Control3D>;
  /** raycast 目标集合 */
  pickables: THREE.Object3D[];
  /** 面板空间控件(跟随铰链面板旋转) */
  panel: THREE.Group;
  setPanelAngle(deg: number): void;
  getPanelAngle(): number;
  setPowerVisual(on: boolean): void;
  setOverload(on: boolean): void;
  setTunerActive(on: boolean): void;
  /** 世界坐标锚点(引导聚光用) */
  anchorOf(id: string, target: THREE.Vector3): THREE.Vector3 | null;
  setHighlight(id: string | null): void;
  syncAll(): void;
  dispose(): void;
}

const paramIdOf = (id: string): string => (id === "tunerButton" ? "tunerOn" : id);

function normalizedValue(id: string): number {
  const spec = CONTROL_BY_ID[id];
  if (!spec) return 0;
  if (spec.kind === "selector") {
    return spec.options.length > 1 ? params.get(id) / (spec.options.length - 1) : 0;
  }
  const s = spec as { min: number; max: number };
  return (params.get(id) - s.min) / (s.max - s.min);
}

export function createSynth(maxAnisotropy = 8): SynthModel {
  const root = new THREE.Group();
  const materials = createMaterials(maxAnisotropy);
  const cabinet = createCabinet(materials);
  root.add(cabinet.root);

  // ── 丝印 ──
  const panelSilk = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_INNER_W, DIM.PANEL_D),
    new THREE.MeshPhysicalMaterial({
      map: createPanelSilkscreenTexture(maxAnisotropy),
      transparent: true,
      metalness: 0.05,
      roughness: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      envMapIntensity: 0.6,
    })
  );
  panelSilk.rotation.x = -Math.PI / 2;
  panelSilk.position.set(0, 0.0009, -DIM.PANEL_D / 2);
  cabinet.panel.add(panelSilk);

  const sideW = DIM.SIDE_X1 - DIM.SIDE_X0;
  const sideD = DIM.KEY_FRONT_Z - DIM.KEY_BACK_Z;
  const sideSilk = new THREE.Mesh(
    new THREE.PlaneGeometry(sideW, sideD),
    new THREE.MeshPhysicalMaterial({
      map: createSideSilkscreenTexture(maxAnisotropy),
      transparent: true,
      metalness: 0.05,
      roughness: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
  );
  sideSilk.rotation.x = -Math.PI / 2;
  sideSilk.position.set(
    (DIM.SIDE_X0 + DIM.SIDE_X1) / 2,
    DIM.CASE_H + 0.0084,
    (DIM.KEY_BACK_Z + DIM.KEY_FRONT_Z) / 2
  );
  cabinet.root.add(sideSilk);

  // ── 琴键 ──
  const keybed = createKeybed(materials);
  cabinet.root.add(keybed.group);

  // ── 控件 ──
  const controls = new Map<string, Control3D>();
  const pickables: THREE.Object3D[] = [];

  for (const p of PLACEMENTS) {
    const spec = CONTROL_BY_ID[p.id];
    const kind = p.kind;
    const ctl = createControl(materials, p.id, kind, {
      color: p.color ?? (spec && "color" in spec ? (spec.color as "orange" | "blue" | "black") : "orange"),
      overload: p.id === "overload",
    });

    if (p.space === "panel") {
      ctl.root.position.set(p.u, 0, -p.v);
      cabinet.panel.add(ctl.root);
    } else {
      ctl.root.position.set(p.x ?? 0, DIM.CASE_H + 0.008, p.z ?? 0);
      cabinet.root.add(ctl.root);
    }

    for (const h of ctl.hits) {
      h.userData.controlId = p.id;
      pickables.push(h);
    }
    ctl.root.userData.controlId = p.id;
    (ctl.root.userData as { placement?: Placement }).placement = p;
    controls.set(p.id, ctl);
  }

  // ── 悬停高亮环 ──
  const highlight = new THREE.Mesh(
    new THREE.RingGeometry(0.0142, 0.0168, 44),
    new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  highlight.rotation.x = -Math.PI / 2;
  highlight.visible = false;
  highlight.renderOrder = 5;
  root.add(highlight);

  // ── 参数 → 3D ──
  const syncOne = (id: string): void => {
    const ctl = controls.get(id);
    if (!ctl) return;
    if (id === "overload" || id === "powerLed") return;
    ctl.setValue(normalizedValue(paramIdOf(id)));
  };

  const syncAll = (): void => {
    for (const id of controls.keys()) syncOne(id);
    controls.get("powerLed")?.setActive?.(params.getBool("power"));
    controls.get("tunerButton")?.setValue(params.getBool("tunerOn") ? 1 : 0);
  };

  params.subscribe((id) => {
    syncOne(id);
    // A-440 按钮 / 电源灯跟随
    if (id === "tunerOn") syncOne("tunerButton");
    if (id === "power") {
      syncOne("power");
      controls.get("powerLed")?.setActive?.(params.getBool("power"));
      setPowerVisual(params.getBool("power"));
    }
  });
  params.subscribeBulk(syncAll);

  let panelAngle = 50;
  const setPanelAngle = (deg: number): void => {
    panelAngle = Math.min(60, Math.max(0, deg));
    cabinet.panel.rotation.x = (panelAngle * Math.PI) / 180;
  };
  setPanelAngle(panelAngle);

  const scrimMats = [cabinet.scrimPanel.material as THREE.MeshBasicMaterial, cabinet.scrimSide.material as THREE.MeshBasicMaterial];
  function setPowerVisual(on: boolean): void {
    for (const m of scrimMats) {
      m.opacity = on ? 0 : 0.5;
      m.visible = !on;
    }
    cabinet.scrimPanel.visible = !on;
    cabinet.scrimSide.visible = !on;
    controls.get("powerLed")?.setActive?.(on);
  }

  syncAll();
  setPowerVisual(params.getBool("power"));

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  return {
    root,
    cabinet,
    keybed,
    materials,
    controls,
    pickables,
    panel: cabinet.panel,
    setPanelAngle,
    getPanelAngle: () => panelAngle,
    setPowerVisual,
    setOverload(on) {
      controls.get("overload")?.setActive?.(on);
    },
    setTunerActive(on) {
      controls.get("tunerButton")?.setValue(on ? 1 : 0);
    },
    anchorOf(id, target) {
      if (id.startsWith("key:")) {
        const midi = parseInt(id.slice(4), 10);
        keybed.worldPosition(midi, target);
        return root.localToWorld(target);
      }
      const ctl = controls.get(id);
      if (!ctl) return null;
      ctl.root.getWorldPosition(target);
      target.y += 0.02;
      return target;
    },
    setHighlight(id) {
      const ctl = id ? controls.get(id) : null;
      if (!ctl) {
        highlight.visible = false;
        return;
      }
      ctl.root.getWorldPosition(tmpV);
      ctl.root.getWorldQuaternion(tmpQ);
      highlight.position.copy(tmpV);
      highlight.position.y += 0.001;
      highlight.quaternion.copy(tmpQ);
      highlight.rotateX(-Math.PI / 2);
      highlight.scale.setScalar(ctl.kind === "wheel" ? 1.5 : 1);
      highlight.visible = true;
    },
    syncAll,
    dispose() {
      materials.dispose();
    },
  };
}

export { KEY_START_MIDI };
