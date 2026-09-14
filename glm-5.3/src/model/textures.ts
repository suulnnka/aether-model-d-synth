import * as THREE from "three";

/** 程序化纹理(全程序化生成,无外部二进制资源,PRD MDL-6) */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

/** 深色胡桃木纹(侧板) */
export function woodTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  ctx.fillStyle = "#4a2f1b";
  ctx.fillRect(0, 0, 1024, 512);
  // 纵向木纹条带
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 1024;
    const w = 2 + Math.random() * 14;
    const hue = 18 + Math.random() * 14;
    const light = 14 + Math.random() * 16;
    ctx.fillStyle = `hsla(${hue}, 45%, ${light}%, ${0.16 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) {
      ctx.lineTo(x + Math.sin(y * 0.01 + i) * 6 + (Math.random() - 0.5) * 3, y);
    }
    for (let y = 512; y >= 0; y -= 32) {
      ctx.lineTo(x + w + Math.sin(y * 0.012 + i * 2) * 6, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 细密噪点
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
  tex.anisotropy = 8;
  return tex;
}

/** 拉丝金属粗糙度贴图(面板/边框) */
export function brushedRoughness(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * 512;
    const l = 30 + Math.random() * 160;
    const g = 110 + Math.random() * 90;
    ctx.strokeStyle = `rgba(${g},${g},${g},0.12)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, y);
    ctx.lineTo(Math.random() * 512 + l, y + (Math.random() - 0.5) * 1.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** 轮子滚花凹凸贴图 */
export function knurlBump(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 8) {
    const g = ctx.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, "#b0b0b0");
    g.addColorStop(0.5, "#606060");
    g.addColorStop(1, "#b0b0b0");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 8, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

/** 旋钮侧面细滚花 */
export function knobKnurlBump(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = "#909090";
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 5) {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, 0, 1.6, 64);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x + 2.5, 0, 1.6, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/** 摄影棚背景:深色低饱和径向渐变 + 细腻噪点(VIS-3) */
export function studioBackground(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  const g = ctx.createRadialGradient(512, 300, 60, 512, 300, 620);
  g.addColorStop(0, "#26282e");
  g.addColorStop(0.55, "#17181d");
  g.addColorStop(1, "#0a0b0e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const img = ctx.getImageData(0, 0, 1024, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
