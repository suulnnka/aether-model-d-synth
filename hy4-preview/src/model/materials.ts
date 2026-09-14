/**
 * 材质库(VIS-4)— 全部程序化生成,无外部二进制资源(MDL-6)
 */
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** 深色胡桃木纹(侧板) */
export function makeWoodTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  ctx.fillStyle = "#4a2e1c";
  ctx.fillRect(0, 0, 1024, 512);
  // 纵向木纹条纹
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 1024;
    const w = 1 + Math.random() * 3;
    const hue = 18 + Math.random() * 10;
    const light = 12 + Math.random() * 16;
    ctx.strokeStyle = `hsla(${hue}, 45%, ${light}%, ${0.25 + Math.random() * 0.3})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    let y = -20;
    let cx = x;
    ctx.moveTo(cx, y);
    while (y < 532) {
      y += 24 + Math.random() * 30;
      cx += (Math.random() - 0.5) * 8;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }
  // 细密噪声
  const img = ctx.getImageData(0, 0, 1024, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 拉丝金属粗糙度贴图(面板) */
export function makeBrushedRoughness(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2400; i++) {
    const y = Math.random() * 512;
    const g = 110 + Math.floor(Math.random() * 90);
    ctx.strokeStyle = `rgba(${g},${g},${g},0.16)`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const x0 = Math.random() * 512;
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 60 + Math.random() * 300, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 黑色织纹(琴键面 / 开关) */
export function makeGrainBump(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const g = 100 + Math.floor(Math.random() * 110);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface MaterialLib {
  panel: THREE.MeshStandardMaterial;
  cabinet: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  knob: THREE.MeshStandardMaterial;
  knobCap: THREE.MeshStandardMaterial;
  skirt: THREE.MeshStandardMaterial;
  switchBase: THREE.MeshStandardMaterial;
  switchLever: THREE.MeshStandardMaterial;
  keyWhite: THREE.MeshStandardMaterial;
  keyBlack: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  wheelKnurl: THREE.MeshStandardMaterial;
  hinge: THREE.MeshStandardMaterial;
  jack: THREE.MeshStandardMaterial;
}

export function buildMaterials(): MaterialLib {
  const woodTex = makeWoodTexture();
  const brushed = makeBrushedRoughness();
  const grain = makeGrainBump();

  return {
    // 面板:缎面深灰金属
    panel: new THREE.MeshStandardMaterial({
      color: 0x1b1c1e,
      metalness: 0.85,
      roughness: 0.42,
      roughnessMap: brushed,
    }),
    // 机箱:黑色哑光金属
    cabinet: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.55 }),
    // 木侧板
    wood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.42, metalness: 0.05 }),
    // 旋钮本体:深色塑料微光泽
    knob: new THREE.MeshStandardMaterial({ color: 0x232326, metalness: 0.1, roughness: 0.38 }),
    // 旋钮指针刻线帽:银色
    knobCap: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.9, roughness: 0.25 }),
    // 档位旋钮裙边
    skirt: new THREE.MeshStandardMaterial({ color: 0x1d1d20, metalness: 0.15, roughness: 0.5 }),
    switchBase: new THREE.MeshStandardMaterial({ color: 0x101012, metalness: 0.3, roughness: 0.6 }),
    switchLever: new THREE.MeshStandardMaterial({ color: 0xe8e4da, metalness: 0.2, roughness: 0.35, bumpMap: grain, bumpScale: 0.15 }),
    keyWhite: new THREE.MeshStandardMaterial({ color: 0xf2efe6, metalness: 0.02, roughness: 0.32 }),
    keyBlack: new THREE.MeshStandardMaterial({ color: 0x121214, metalness: 0.05, roughness: 0.42, bumpMap: grain, bumpScale: 0.08 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.2, roughness: 0.45 }),
    wheelKnurl: new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.3, roughness: 0.4 }),
    hinge: new THREE.MeshStandardMaterial({ color: 0x8f8f92, metalness: 0.95, roughness: 0.3 }),
    jack: new THREE.MeshStandardMaterial({ color: 0x0e0e10, metalness: 0.7, roughness: 0.35 }),
  };
}
