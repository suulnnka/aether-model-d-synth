import * as THREE from "three";
import type { ParamStore } from "../state/paramStore.ts";
import { CONTROL_SPECS } from "../state/specs.ts";
import type { ControlId } from "../state/types.ts";
import { buildCabinet, type CabinetRefs } from "./cabinet.ts";
import { buildControls3D, type ControlHandle } from "./controls3d.ts";
import { buildKeyboard3D, type KeyHandle } from "./keys.ts";
import { DIM } from "./layout.ts";
import { createSynthMaterials, type SynthMaterials } from "./materials.ts";
import { createProceduralTextures } from "./textures.ts";

export interface SynthModel {
  readonly root: THREE.Group;
  readonly materials: SynthMaterials;
  readonly cabinet: CabinetRefs;
  readonly controls: Map<ControlId, ControlHandle>;
  readonly keys: Map<number, KeyHandle>;
  readonly interactiveMeshes: THREE.Object3D[];
  readonly keyMeshes: THREE.Object3D[];
  syncControl: (id: ControlId, immediate?: boolean) => void;
  syncAll: (immediate?: boolean) => void;
  setPanelAngle: (deg: number) => void;
  getPanelAngle: () => number;
  setKeyPressed: (midi: number, pressed: boolean) => void;
  setHovered: (id: ControlId | null) => void;
  setOverload: (overload: boolean, level: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

export function createSynthModel(
  store: ParamStore,
  maxAnisotropy: number,
): SynthModel {
  const textures = createProceduralTextures();
  const materials = createSynthMaterials(textures);
  const cabinet = buildCabinet(materials, maxAnisotropy);
  const { handles, hitMeshes, lamps } = buildControls3D(
    cabinet.panelPivot,
    cabinet.sideStripGroup,
    materials,
  );
  const { keys, hitMeshes: keyMeshes } = buildKeyboard3D(cabinet.root, materials);

  let panelAngleDeg = 52;
  let hoveredId: ControlId | null = null;
  let overloadTarget = 0;
  let overloadCurrent = 0;

  function applyPanelAngle(deg: number): void {
    panelAngleDeg = Math.max(0, Math.min(75, deg));
    const rad = THREE.MathUtils.degToRad(panelAngleDeg);
    cabinet.panelPivot.rotation.x = rad;

    // Position the mechanical rear struts dynamically to brace the lifted panel
    const anchorY = DIM.HINGE_Y + Math.sin(rad) * 0.145;
    const anchorZ = DIM.HINGE_Z - Math.cos(rad) * 0.145;
    const baseY = 0.042;
    const baseZ = -0.155;
    const midY = (anchorY + baseY) * 0.5;
    const midZ = (anchorZ + baseZ) * 0.5;
    const dx = anchorZ - baseZ;
    const dy = anchorY - baseY;
    const len = Math.max(0.02, Math.hypot(dx, dy));
    const tilt = Math.atan2(dx, dy);
    const vis = panelAngleDeg > 4;

    for (const strut of [cabinet.strutLeft, cabinet.strutRight]) {
      strut.visible = vis;
      strut.position.y = midY;
      strut.position.z = midZ;
      strut.scale.y = len / 0.11;
      strut.rotation.x = tilt;
    }
  }

  function updatePowerLamp(): void {
    const on = store.getBool("powerOn");
    lamps.powerLedMat.emissiveIntensity = on ? 1.65 : 0.05;
    lamps.powerLedMat.color.setHex(on ? 0xff3b28 : 0x451212);
    lamps.powerRockerMat.emissiveIntensity = on ? 0.72 : 0.06;
  }

  const syncControl = (id: ControlId, immediate = false) => {
    handles.get(id)?.applyValue(store.get(id), immediate);
    if (id === "powerOn") updatePowerLamp();
  };

  const syncAll = (immediate = false) => {
    for (const spec of CONTROL_SPECS) {
      handles.get(spec.id)?.applyValue(store.get(spec.id), immediate);
    }
    updatePowerLamp();
  };

  applyPanelAngle(panelAngleDeg);
  syncAll(true);

  return {
    root: cabinet.root,
    materials,
    cabinet,
    controls: handles,
    keys,
    interactiveMeshes: hitMeshes,
    keyMeshes,
    syncControl,
    syncAll,
    setPanelAngle: applyPanelAngle,
    getPanelAngle: () => panelAngleDeg,
    setKeyPressed(midi: number, pressed: boolean) {
      keys.get(midi)?.setPressed(pressed);
    },
    setHovered(id: ControlId | null) {
      if (hoveredId === id) return;
      if (hoveredId) handles.get(hoveredId)?.setHover(false);
      hoveredId = id;
      if (hoveredId) handles.get(hoveredId)?.setHover(true);
    },
    setOverload(overload: boolean, level: number) {
      const power = store.getBool("powerOn");
      if (!power) {
        overloadTarget = 0;
        return;
      }
      overloadTarget = overload ? 1.85 : Math.max(0, level - 0.55) * 0.6;
    },
    update(dt: number) {
      for (const h of handles.values()) h.updateAnimation(dt);
      for (const k of keys.values()) k.updateAnimation(dt);

      overloadCurrent += (overloadTarget - overloadCurrent) * Math.min(1, dt * 18);
      lamps.overloadLedMat.emissiveIntensity = overloadCurrent;
      lamps.overloadLedMat.color.setHex(overloadCurrent > 0.25 ? 0xff2f1c : 0x451212);
    },
    dispose() {
      cabinet.disposeTextures();
      textures.walnutMap.dispose();
      textures.walnutBump.dispose();
      textures.brushedMetalBump.dispose();
      textures.deskMap.dispose();
      textures.feltBump.dispose();
    },
  };
}
