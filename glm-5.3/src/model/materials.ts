/**
 * 材质库(VIS-1 / VIS-2):全场景 PBR(Metalness/Roughness 工作流),
 * 分组建立可复用材质;整机无「默认白模」残留。
 */
import * as THREE from "three";
import { brushedMetalTexture, knurlTexture, woodTexture } from "./textures";

export interface MaterialLibrary {
  /** 控制面板:拉丝深色金属 */
  panelMetal: THREE.MeshPhysicalMaterial;
  /** 面板边框压铸件 */
  panelFrame: THREE.MeshStandardMaterial;
  /** 木侧板:胡桃木 + 清漆 */
  wood: THREE.MeshPhysicalMaterial;
  /** 机箱本体 */
  chassis: THREE.MeshStandardMaterial;
  /** 键盘井黑色面板(左侧边条同款) */
  blackPanel: THREE.MeshStandardMaterial;
  /** 旋钮帽(微光泽) */
  knobCap: THREE.MeshPhysicalMaterial;
  /** 档位旋钮裙边 */
  knobSkirt: THREE.MeshStandardMaterial;
  /** 旋钮指针 */
  knobPointer: THREE.MeshStandardMaterial;
  /** 拨杆:橙(调制类) */
  leverOrange: THREE.MeshStandardMaterial;
  /** 拨杆:蓝(混音类) */
  leverBlue: THREE.MeshStandardMaterial;
  /** 拨杆座 */
  switchBase: THREE.MeshStandardMaterial;
  /** 白键象牙 */
  whiteKey: THREE.MeshPhysicalMaterial;
  /** 黑键织纹 */
  blackKey: THREE.MeshPhysicalMaterial;
  /** 滑轮 */
  wheel: THREE.MeshPhysicalMaterial;
  /** 电源 LED(自发光) */
  led: THREE.MeshStandardMaterial;
  /** Overload 灯(自发光) */
  overloadLamp: THREE.MeshStandardMaterial;
  /** A-440 按钮 */
  pushButton: THREE.MeshStandardMaterial;
  /** 电源跷板 */
  rocker: THREE.MeshPhysicalMaterial;
  /* 背腔元器件(MDL-8) */
  pcbGreen: THREE.MeshStandardMaterial;
  pcbBlue: THREE.MeshStandardMaterial;
  componentBlack: THREE.MeshStandardMaterial;
  capBody: THREE.MeshStandardMaterial;
  capBlue: THREE.MeshStandardMaterial;
  resistor: THREE.MeshStandardMaterial;
  metalPart: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  wireRed: THREE.MeshStandardMaterial;
  wireYel: THREE.MeshStandardMaterial;
  wireBlue: THREE.MeshStandardMaterial;
  transformer: THREE.MeshStandardMaterial;
  /** 后面板装饰插孔 */
  jack: THREE.MeshStandardMaterial;
}

export function createMaterials(): MaterialLibrary {
  const brushed = brushedMetalTexture(5, 2);
  const brushedFine = brushedMetalTexture(3, 1);
  const woodMap = woodTexture(false);
  const woodDark = woodTexture(true);

  return {
    panelMetal: new THREE.MeshPhysicalMaterial({
      color: 0x33343a,
      metalness: 0.9,
      roughness: 0.42,
      roughnessMap: brushed,
      bumpMap: brushed,
      bumpScale: 0.02,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    }),
    panelFrame: new THREE.MeshStandardMaterial({
      color: 0x1f2024,
      metalness: 0.75,
      roughness: 0.5,
      roughnessMap: brushedFine,
    }),
    wood: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: woodMap,
      metalness: 0.0,
      roughness: 0.42,
      clearcoat: 0.65,
      clearcoatRoughness: 0.28,
    }),
    chassis: new THREE.MeshStandardMaterial({
      color: 0x232326,
      metalness: 0.6,
      roughness: 0.62,
      map: woodDark,
      roughnessMap: woodDark,
    }),
    blackPanel: new THREE.MeshStandardMaterial({
      color: 0x121316,
      metalness: 0.35,
      roughness: 0.55,
    }),
    knobCap: new THREE.MeshPhysicalMaterial({
      color: 0x0e0e10,
      metalness: 0.35,
      roughness: 0.32,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
    }),
    knobSkirt: new THREE.MeshStandardMaterial({
      color: 0x3a3325,
      metalness: 0.8,
      roughness: 0.38,
    }),
    knobPointer: new THREE.MeshStandardMaterial({
      color: 0xd8d2c2,
      metalness: 0.6,
      roughness: 0.3,
    }),
    leverOrange: new THREE.MeshStandardMaterial({
      color: 0xe8701a,
      metalness: 0.1,
      roughness: 0.42,
    }),
    leverBlue: new THREE.MeshStandardMaterial({
      color: 0x2f6fc4,
      metalness: 0.1,
      roughness: 0.42,
    }),
    switchBase: new THREE.MeshStandardMaterial({
      color: 0x0a0a0b,
      metalness: 0.2,
      roughness: 0.7,
    }),
    whiteKey: new THREE.MeshPhysicalMaterial({
      color: 0xf1e9d6,
      metalness: 0.0,
      roughness: 0.34,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
    }),
    blackKey: new THREE.MeshPhysicalMaterial({
      color: 0x161413,
      metalness: 0.05,
      roughness: 0.62,
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
    }),
    wheel: new THREE.MeshPhysicalMaterial({
      color: 0x141416,
      metalness: 0.25,
      roughness: 0.5,
      clearcoat: 0.35,
      roughnessMap: knurlTexture(),
      bumpMap: knurlTexture(),
      bumpScale: 0.35,
    }),
    led: new THREE.MeshStandardMaterial({
      color: 0x2a0806,
      emissive: 0xff2a12,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.1,
    }),
    overloadLamp: new THREE.MeshStandardMaterial({
      color: 0x2a0806,
      emissive: 0xff3a1a,
      emissiveIntensity: 0,
      roughness: 0.25,
    }),
    pushButton: new THREE.MeshStandardMaterial({
      color: 0x8f8a7c,
      metalness: 0.7,
      roughness: 0.35,
    }),
    rocker: new THREE.MeshPhysicalMaterial({
      color: 0x101012,
      metalness: 0.2,
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    }),
    pcbGreen: new THREE.MeshStandardMaterial({
      color: 0x155232,
      metalness: 0.15,
      roughness: 0.6,
    }),
    pcbBlue: new THREE.MeshStandardMaterial({
      color: 0x1a3a6e,
      metalness: 0.15,
      roughness: 0.6,
    }),
    componentBlack: new THREE.MeshStandardMaterial({
      color: 0x141414,
      metalness: 0.1,
      roughness: 0.55,
    }),
    capBody: new THREE.MeshStandardMaterial({
      color: 0x1c1e24,
      metalness: 0.3,
      roughness: 0.4,
    }),
    capBlue: new THREE.MeshStandardMaterial({
      color: 0x243a8e,
      metalness: 0.25,
      roughness: 0.4,
    }),
    resistor: new THREE.MeshStandardMaterial({
      color: 0xc2a173,
      metalness: 0.1,
      roughness: 0.65,
    }),
    metalPart: new THREE.MeshStandardMaterial({
      color: 0x9aa0a8,
      metalness: 0.9,
      roughness: 0.35,
    }),
    copper: new THREE.MeshStandardMaterial({
      color: 0xb0703a,
      metalness: 0.95,
      roughness: 0.3,
    }),
    wireRed: new THREE.MeshStandardMaterial({ color: 0xa32222, roughness: 0.7 }),
    wireYel: new THREE.MeshStandardMaterial({ color: 0xc9a832, roughness: 0.7 }),
    wireBlue: new THREE.MeshStandardMaterial({ color: 0x2a4a9a, roughness: 0.7 }),
    transformer: new THREE.MeshStandardMaterial({
      color: 0x3c3a38,
      metalness: 0.7,
      roughness: 0.55,
    }),
    jack: new THREE.MeshStandardMaterial({
      color: 0x6f7278,
      metalness: 0.9,
      roughness: 0.3,
    }),
  };
}
