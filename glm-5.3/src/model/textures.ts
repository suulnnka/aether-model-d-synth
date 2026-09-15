/**
 * 程序化纹理(MDL-6:不依赖外部二进制资源)。
 * 拉丝金属粗糙度、木纹、背景幕颗粒 —— 全部 Canvas 生成。
 */
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

/** 拉丝金属:横向细条纹噪声 → 灰度图(作 roughnessMap / bumpMap) */
export function brushedMetalTexture(repeatX = 4, repeatY = 2): THREE.Texture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * 512;
    const w = 40 + Math.random() * 300;
    const x = Math.random() * 512 - 150;
    const v = 110 + Math.floor(Math.random() * 90);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.20)`;
    ctx.lineWidth = Math.random() * 1.2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + (Math.random() - 0.5) * 0.8);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/** 深色胡桃木纹 */
export function woodTexture(dark = false): THREE.Texture {
  const [c, ctx] = canvas(512, 512);
  const base = dark ? "#2e1c10" : "#4a2c17";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // 纵向纹理
  for (let x = 0; x < 512; x += 1) {
    const n =
      Math.sin(x * 0.055) * 0.5 +
      Math.sin(x * 0.013 + 1.7) * 0.8 +
      Math.sin(x * 0.21 + 0.3) * 0.25 +
      (Math.random() - 0.5) * 0.3;
    const shade = Math.max(0, Math.min(1, 0.5 + n * 0.22));
    const r = Math.floor((dark ? 46 : 88) * (0.6 + shade * 0.7));
    const g = Math.floor((dark ? 28 : 56) * (0.6 + shade * 0.7));
    const b = Math.floor((dark ? 16 : 32) * (0.6 + shade * 0.7));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, 512);
  }
  // 木髓斑点
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rr = 1 + Math.random() * 3;
    ctx.fillStyle = `rgba(20,10,4,${0.15 + Math.random() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * (2 + Math.random() * 6), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 背景幕用细颗粒噪声(消除色带,VIS-14) */
export function grainTexture(): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(Math.random() * 30);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/** 滑轮防滑滚花(法线用灰度条纹) */
export function knurlTexture(): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? "#c8c8c8" : "#3c3c3c";
    ctx.fillRect(x, 0, 2, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  return tex;
}
