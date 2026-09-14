import * as THREE from "three";
import { brushedRoughness, knobKnurlBump, knurlBump, woodTexture } from "./textures";

/** 材质库(VIS-4):拉丝金属 / 塑料旋钮 / 织纹琴键 / 胡桃木侧板 / 哑光开关 */

export interface MaterialLib {
  brushed: THREE.MeshStandardMaterial; // 缎面金属(面板边框、铰链)
  panelSide: THREE.MeshStandardMaterial; // 面板侧缘
  knob: THREE.MeshPhysicalMaterial; // 塑料旋钮(微弱光泽)
  knobSkirt: THREE.MeshPhysicalMaterial; // 选择器裙边
  pointer: THREE.MeshStandardMaterial; // 旋钮刻线指针
  keyWhite: THREE.MeshPhysicalMaterial;
  keyBlack: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshPhysicalMaterial;
  switchBody: THREE.MeshPhysicalMaterial;
  switchCap: THREE.MeshPhysicalMaterial;
  wheel: THREE.MeshPhysicalMaterial;
  chassis: THREE.MeshStandardMaterial; // 机箱内层哑光黑
  bed: THREE.MeshStandardMaterial; // 键床
  ledOn: THREE.MeshStandardMaterial;
  ledOff: THREE.MeshStandardMaterial;
  pcb: THREE.MeshStandardMaterial;
  chip: THREE.MeshStandardMaterial;
}

export function createMaterials(): MaterialLib {
  const brushedRough = brushedRoughness();

  const woodTex = woodTexture();

  return {
    brushed: new THREE.MeshStandardMaterial({
      color: 0xb9bcc2,
      metalness: 0.88,
      roughness: 0.38,
      roughnessMap: brushedRough,
    }),
    panelSide: new THREE.MeshStandardMaterial({
      color: 0x2c2e33,
      metalness: 0.8,
      roughness: 0.45,
    }),
    knob: new THREE.MeshPhysicalMaterial({
      color: 0x191a1c,
      metalness: 0.15,
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      bumpMap: knobKnurlBump(),
      bumpScale: 0.6,
    }),
    knobSkirt: new THREE.MeshPhysicalMaterial({
      color: 0x242629,
      metalness: 0.2,
      roughness: 0.45,
      clearcoat: 0.3,
    }),
    pointer: new THREE.MeshStandardMaterial({
      color: 0xe8e5da,
      metalness: 0.1,
      roughness: 0.5,
    }),
    keyWhite: new THREE.MeshPhysicalMaterial({
      color: 0xdfdbcf,
      metalness: 0.02,
      roughness: 0.4,
      clearcoat: 0.3,
      clearcoatRoughness: 0.5,
    }),
    keyBlack: new THREE.MeshPhysicalMaterial({
      color: 0x131315,
      metalness: 0.05,
      roughness: 0.42,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
    }),
    wood: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: woodTex,
      metalness: 0.0,
      roughness: 0.5,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    }),
    switchBody: new THREE.MeshPhysicalMaterial({
      color: 0x0f1012,
      metalness: 0.1,
      roughness: 0.55,
    }),
    switchCap: new THREE.MeshPhysicalMaterial({
      color: 0x1b1c1f,
      metalness: 0.15,
      roughness: 0.45,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    }),
    wheel: new THREE.MeshPhysicalMaterial({
      color: 0x17181a,
      metalness: 0.1,
      roughness: 0.55,
      bumpMap: knurlBump(),
      bumpScale: 0.4,
    }),
    chassis: new THREE.MeshStandardMaterial({
      color: 0x1a1b1e,
      metalness: 0.6,
      roughness: 0.6,
    }),
    bed: new THREE.MeshStandardMaterial({
      color: 0x232428,
      metalness: 0.4,
      roughness: 0.7,
    }),
    ledOn: new THREE.MeshStandardMaterial({
      color: 0x331503,
      emissive: 0xff7a1e,
      emissiveIntensity: 2.4,
      roughness: 0.3,
    }),
    ledOff: new THREE.MeshStandardMaterial({
      color: 0x2a1206,
      emissive: 0x000000,
      roughness: 0.4,
    }),
    pcb: new THREE.MeshStandardMaterial({
      color: 0x1d3a28,
      metalness: 0.1,
      roughness: 0.7,
    }),
    chip: new THREE.MeshStandardMaterial({
      color: 0x0b0b0c,
      metalness: 0.3,
      roughness: 0.5,
    }),
  };
}
