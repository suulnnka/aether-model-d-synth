/**
 * 材质库(VIS-1 / VIS-2)
 * 全部基于物理渲染(Metalness/Roughness 工作流),按材质分组集中创建与复用。
 * 纹理一律程序化生成,不依赖外部二进制资源(MDL-6)。
 */
import * as THREE from "three";

export interface MaterialLibrary {
  panelFace: THREE.MeshPhysicalMaterial;
  panelEdge: THREE.MeshStandardMaterial;
  wood: THREE.MeshPhysicalMaterial;
  woodDark: THREE.MeshStandardMaterial;
  knobCap: THREE.MeshPhysicalMaterial;
  knobSkirt: THREE.MeshStandardMaterial;
  knobPointer: THREE.MeshStandardMaterial;
  switchBase: THREE.MeshStandardMaterial;
  leverOrange: THREE.MeshStandardMaterial;
  leverBlue: THREE.MeshStandardMaterial;
  leverBlack: THREE.MeshStandardMaterial;
  keyWhite: THREE.MeshPhysicalMaterial;
  keyBlack: THREE.MeshPhysicalMaterial;
  sidePanelFace: THREE.MeshPhysicalMaterial;
  ledRed: THREE.MeshStandardMaterial;
  ledOff: THREE.MeshStandardMaterial;
  ledOverload: THREE.MeshStandardMaterial;
  wheel: THREE.MeshPhysicalMaterial;
  wheelFrame: THREE.MeshStandardMaterial;
  pcbGreen: THREE.MeshStandardMaterial;
  pcbBlue: THREE.MeshStandardMaterial;
  metalPart: THREE.MeshStandardMaterial;
  capacitor: THREE.MeshStandardMaterial;
  resistor: THREE.MeshStandardMaterial;
  transformer: THREE.MeshStandardMaterial;
  wire: THREE.MeshStandardMaterial;
  table: THREE.MeshStandardMaterial;
  backdrop: THREE.MeshBasicMaterial;
  hinge: THREE.MeshStandardMaterial;
  screw: THREE.MeshStandardMaterial;
  dispose(): void;
}

// ── 程序化纹理 ─────────────────────────────────────────────────────

/** 拉丝金属:细密横向条纹,用作粗糙度贴图 */
function brushedTexture(size = 1024): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const len = 40 + Math.random() * 260;
    const a = 0.02 + Math.random() * 0.06;
    const bright = Math.random() > 0.5;
    g.strokeStyle = bright ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.lineWidth = Math.random() < 0.8 ? 1 : 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (Math.random() - 0.5) * 1.5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 胡桃木纹:低频正弦木纹 + 湍流 + 细导管纹 */
function woodTexture(size = 1024, dark = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const base = dark ? [44, 26, 18] : [86, 52, 32];
  const hi = dark ? [80, 48, 30] : [138, 88, 54];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 木纹沿 x 方向延伸(侧板纹理竖向)
      const turb = Math.sin(v * 34 + Math.sin(u * 6) * 2.2) * 0.5 + 0.5;
      const rings = Math.pow(Math.sin((v * 9 + Math.sin(u * 3.1) * 0.5) * Math.PI), 2);
      const grain = Math.pow(turb, 2) * 0.35 + rings * 0.55;
      const fine = (Math.sin(v * 260 + Math.sin(u * 12) * 6) * 0.5 + 0.5) * 0.12;
      const k = Math.min(1, grain * 0.9 + fine);
      const i = (y * size + x) * 4;
      d[i] = base[0] + (hi[0] - base[0]) * k;
      d[i + 1] = base[1] + (hi[1] - base[1]) * k;
      d[i + 2] = base[2] + (hi[2] - base[2]) * k;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 黑键织纹:细密哑光颗粒 */
function keyTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#141416";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`;
    g.fillRect(x, y, 1, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 台面:深灰哑光 + 极细颗粒 */
function tableTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2724";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    g.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── 材质库 ─────────────────────────────────────────────────────────

export function createMaterials(maxAnisotropy = 8): MaterialLibrary {
  const brushed = brushedTexture();
  brushed.anisotropy = maxAnisotropy;
  brushed.repeat.set(3, 1);

  const wood = woodTexture();
  wood.anisotropy = maxAnisotropy;
  const woodDark = woodTexture(512, true);
  woodDark.anisotropy = maxAnisotropy;

  const keyTex = keyTexture();
  keyTex.anisotropy = maxAnisotropy;

  const tableTex = tableTexture();
  tableTex.anisotropy = maxAnisotropy;
  tableTex.repeat.set(4, 4);

  const lib: MaterialLibrary = {
    // ① 控制面板:拉丝/缎面铝
    panelFace: new THREE.MeshPhysicalMaterial({
      color: 0x8f9295,
      metalness: 0.92,
      roughness: 0.34,
      roughnessMap: brushed,
      anisotropy: 0.6,
      anisotropyRotation: Math.PI / 2,
      clearcoat: 0.22,
      clearcoatRoughness: 0.5,
      envMapIntensity: 1.0,
    }),
    panelEdge: new THREE.MeshStandardMaterial({ color: 0x6f7275, metalness: 0.9, roughness: 0.45 }),

    // ② 外框与侧板:深色胡桃木 + 清漆
    wood: new THREE.MeshPhysicalMaterial({
      map: wood,
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.42,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.9,
    }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.6, metalness: 0 }),

    // ③ 旋钮与拨杆
    knobCap: new THREE.MeshPhysicalMaterial({
      color: 0x2b2d31,
      metalness: 0.55,
      roughness: 0.28,
      clearcoat: 0.75,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.15,
    }),
    knobSkirt: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.25, roughness: 0.55 }),
    knobPointer: new THREE.MeshStandardMaterial({ color: 0xf2efe6, metalness: 0.0, roughness: 0.4 }),
    switchBase: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.15, roughness: 0.72 }),
    leverOrange: new THREE.MeshStandardMaterial({ color: 0xd8641c, metalness: 0.1, roughness: 0.45 }),
    leverBlue: new THREE.MeshStandardMaterial({ color: 0x2f6fb5, metalness: 0.1, roughness: 0.45 }),
    leverBlack: new THREE.MeshStandardMaterial({ color: 0x232326, metalness: 0.2, roughness: 0.5 }),

    // ④ 琴键
    keyWhite: new THREE.MeshPhysicalMaterial({
      color: 0xf3ede0,
      metalness: 0.0,
      roughness: 0.36,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.8,
    }),
    keyBlack: new THREE.MeshPhysicalMaterial({
      map: keyTex,
      color: 0x1a1a1d,
      metalness: 0.0,
      roughness: 0.66,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
    }),

    // 侧边条(黑色面板)
    sidePanelFace: new THREE.MeshPhysicalMaterial({
      color: 0x222326,
      metalness: 0.55,
      roughness: 0.42,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
    }),

    // ⑤ 指示灯
    ledRed: new THREE.MeshStandardMaterial({
      color: 0xff3b1f,
      emissive: 0xff2a10,
      emissiveIntensity: 3.2,
      roughness: 0.25,
      metalness: 0.0,
    }),
    ledOff: new THREE.MeshStandardMaterial({ color: 0x4a1512, roughness: 0.3, metalness: 0.1 }),
    ledOverload: new THREE.MeshStandardMaterial({
      color: 0xff2a12,
      emissive: 0xff1a08,
      emissiveIntensity: 3.6,
      roughness: 0.25,
    }),

    // 滑轮
    wheel: new THREE.MeshPhysicalMaterial({
      color: 0x33353a,
      metalness: 0.6,
      roughness: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    }),
    wheelFrame: new THREE.MeshStandardMaterial({ color: 0x111113, metalness: 0.3, roughness: 0.6 }),

    // ⑥ 背腔元器件
    pcbGreen: new THREE.MeshStandardMaterial({ color: 0x1f5c3a, metalness: 0.1, roughness: 0.62 }),
    pcbBlue: new THREE.MeshStandardMaterial({ color: 0x1b3f78, metalness: 0.1, roughness: 0.62 }),
    metalPart: new THREE.MeshStandardMaterial({ color: 0xa8adb3, metalness: 0.95, roughness: 0.32 }),
    capacitor: new THREE.MeshStandardMaterial({ color: 0x1c2a55, metalness: 0.35, roughness: 0.4 }),
    resistor: new THREE.MeshStandardMaterial({ color: 0xc9a05a, metalness: 0.05, roughness: 0.7 }),
    transformer: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.85, roughness: 0.45 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x8a2b2b, metalness: 0.0, roughness: 0.8 }),

    // 场景
    table: new THREE.MeshStandardMaterial({ map: tableTex, color: 0xffffff, roughness: 0.82, metalness: 0.05 }),
    backdrop: new THREE.MeshBasicMaterial({ color: 0x2a2e34, side: THREE.DoubleSide }),

    hinge: new THREE.MeshStandardMaterial({ color: 0x8b8f94, metalness: 0.95, roughness: 0.3 }),
    screw: new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.95, roughness: 0.25 }),

    dispose() {
      for (const v of Object.values(this)) {
        if (v && typeof v === "object" && "dispose" in v) (v as THREE.Material).dispose();
      }
    },
  };

  return lib;
}
