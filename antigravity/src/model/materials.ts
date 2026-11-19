import * as THREE from "three";
import type { ProceduralTextures } from "./textures.ts";

export interface SynthMaterials {
  walnut: THREE.MeshStandardMaterial;
  chassisMetal: THREE.MeshStandardMaterial;
  panelBackMetal: THREE.MeshStandardMaterial;
  brushedAluminum: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  whiteKey: THREE.MeshPhysicalMaterial;
  blackKey: THREE.MeshStandardMaterial;
  knobBody: THREE.MeshStandardMaterial;
  knobInsert: THREE.MeshStandardMaterial;
  knobPointer: THREE.MeshStandardMaterial;
  wheelBody: THREE.MeshStandardMaterial;
  wheelBezel: THREE.MeshStandardMaterial;
  rockerOrange: THREE.MeshStandardMaterial;
  rockerBlue: THREE.MeshStandardMaterial;
  rockerWhite: THREE.MeshStandardMaterial;
  rockerBlack: THREE.MeshStandardMaterial;
  rockerPower: THREE.MeshStandardMaterial;
  powerLed: THREE.MeshStandardMaterial;
  overloadLed: THREE.MeshStandardMaterial;
  rubberFoot: THREE.MeshStandardMaterial;
  table: THREE.MeshStandardMaterial;
}

export function createSynthMaterials(tex: ProceduralTextures): SynthMaterials {
  return {
    walnut: new THREE.MeshStandardMaterial({
      map: tex.walnutMap,
      bumpMap: tex.walnutBump,
      bumpScale: 0.0012,
      roughness: 0.42,
      metalness: 0.04,
    }),
    chassisMetal: new THREE.MeshStandardMaterial({
      color: 0x1a1b20,
      bumpMap: tex.brushedMetalBump,
      bumpScale: 0.0005,
      roughness: 0.56,
      metalness: 0.35,
    }),
    panelBackMetal: new THREE.MeshStandardMaterial({
      color: 0x202228,
      bumpMap: tex.brushedMetalBump,
      bumpScale: 0.0006,
      roughness: 0.48,
      metalness: 0.55,
    }),
    brushedAluminum: new THREE.MeshStandardMaterial({
      color: 0xc8ccd4,
      bumpMap: tex.brushedMetalBump,
      bumpScale: 0.0004,
      roughness: 0.28,
      metalness: 0.88,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xe2e5ec,
      roughness: 0.16,
      metalness: 0.94,
    }),
    darkSteel: new THREE.MeshStandardMaterial({
      color: 0x2a2d34,
      roughness: 0.4,
      metalness: 0.78,
    }),
    felt: new THREE.MeshStandardMaterial({
      color: 0x6b1721,
      bumpMap: tex.feltBump,
      bumpScale: 0.0015,
      roughness: 0.94,
      metalness: 0.0,
    }),
    whiteKey: new THREE.MeshPhysicalMaterial({
      color: 0xf4f0e6,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.18,
    }),
    blackKey: new THREE.MeshStandardMaterial({
      color: 0x18191d,
      roughness: 0.36,
      metalness: 0.05,
    }),
    knobBody: new THREE.MeshStandardMaterial({
      color: 0x15161a,
      roughness: 0.48,
      metalness: 0.12,
    }),
    knobInsert: new THREE.MeshStandardMaterial({
      color: 0xd0d4dc,
      bumpMap: tex.brushedMetalBump,
      bumpScale: 0.0002,
      roughness: 0.24,
      metalness: 0.9,
    }),
    knobPointer: new THREE.MeshStandardMaterial({
      color: 0xf6f3ea,
      roughness: 0.35,
      metalness: 0.05,
    }),
    wheelBody: new THREE.MeshStandardMaterial({
      color: 0x18191e,
      roughness: 0.44,
      metalness: 0.15,
    }),
    wheelBezel: new THREE.MeshStandardMaterial({
      color: 0x111216,
      roughness: 0.55,
      metalness: 0.3,
    }),
    rockerOrange: new THREE.MeshStandardMaterial({
      color: 0xd96126,
      roughness: 0.34,
      metalness: 0.05,
    }),
    rockerBlue: new THREE.MeshStandardMaterial({
      color: 0x2467a8,
      roughness: 0.34,
      metalness: 0.05,
    }),
    rockerWhite: new THREE.MeshStandardMaterial({
      color: 0xebe6da,
      roughness: 0.32,
      metalness: 0.04,
    }),
    rockerBlack: new THREE.MeshStandardMaterial({
      color: 0x22242a,
      roughness: 0.38,
      metalness: 0.1,
    }),
    rockerPower: new THREE.MeshStandardMaterial({
      color: 0xb52424,
      emissive: 0xd6281c,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.08,
    }),
    powerLed: new THREE.MeshStandardMaterial({
      color: 0xff3b28,
      emissive: 0xff3018,
      emissiveIntensity: 1.5,
      roughness: 0.18,
      metalness: 0.1,
    }),
    overloadLed: new THREE.MeshStandardMaterial({
      color: 0x451212,
      emissive: 0xff2414,
      emissiveIntensity: 0.0,
      roughness: 0.18,
      metalness: 0.1,
    }),
    rubberFoot: new THREE.MeshStandardMaterial({
      color: 0x101114,
      roughness: 0.88,
      metalness: 0.02,
    }),
    table: new THREE.MeshStandardMaterial({
      map: tex.deskMap,
      roughness: 0.82,
      metalness: 0.08,
    }),
  };
}
