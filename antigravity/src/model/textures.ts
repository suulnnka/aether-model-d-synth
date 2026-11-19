import * as THREE from "three";

export interface ProceduralTextures {
  walnutMap: THREE.CanvasTexture;
  walnutBump: THREE.CanvasTexture;
  brushedMetalBump: THREE.CanvasTexture;
  deskMap: THREE.CanvasTexture;
  feltBump: THREE.CanvasTexture;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeWalnutTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const w = 1024;
  const h = 512;
  const cMap = document.createElement("canvas");
  cMap.width = w;
  cMap.height = h;
  const ctx = cMap.getContext("2d")!;

  const cBump = document.createElement("canvas");
  cBump.width = w;
  cBump.height = h;
  const bCtx = cBump.getContext("2d")!;

  const img = ctx.createImageData(w, h);
  const bImg = bCtx.createImageData(w, h);
  const rand = seededRandom(4201);

  // Precompute subtle horizontal grain offsets
  const phaseOffsets = new Float32Array(w);
  let p = 0;
  for (let x = 0; x < w; x++) {
    p += (rand() - 0.5) * 0.12;
    phaseOffsets[x] = p;
  }

  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      // Multi-octave organic walnut wood rings & pores
      const wave =
        Math.sin((ny * 14 + Math.sin(nx * 5.2 + phaseOffsets[x] * 0.4) * 1.45) * Math.PI) * 0.5 +
        Math.sin((ny * 36 + nx * 3.1 + phaseOffsets[x] * 0.8) * Math.PI) * 0.3 +
        Math.sin((ny * 92 + phaseOffsets[x] * 1.3) * Math.PI) * 0.2;

      const ring = Math.pow(0.5 + 0.5 * wave, 1.35);
      const pore = rand() > 0.965 ? -0.18 : (rand() - 0.5) * 0.04;
      const shade = Math.max(0, Math.min(1, ring * 0.78 + 0.14 + pore));

      // Warm oiled American walnut RGB palette
      const r = Math.round(52 + shade * 68);
      const g = Math.round(28 + shade * 39);
      const b = Math.round(14 + shade * 20);

      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;

      const bv = Math.round(90 + shade * 140);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const bump = new THREE.CanvasTexture(cBump);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;

  return { map, bump };
}

function makeBrushedMetalBump(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = seededRandom(8812);

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y++) {
    const tone = Math.round(115 + rand() * 32);
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 600; i++) {
    const tone = Math.round(100 + rand() * 55);
    ctx.fillStyle = `rgba(${tone},${tone},${tone},0.35)`;
    ctx.fillRect(rand() * w, rand() * h, 40 + rand() * 140, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeDeskTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seededRandom(3319);

  ctx.fillStyle = "#16171b";
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 10;
    img.data[i] = Math.max(12, Math.min(40, 22 + n));
    img.data[i + 1] = Math.max(12, Math.min(42, 23 + n));
    img.data[i + 2] = Math.max(16, Math.min(46, 27 + n));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function makeFeltBump(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seededRandom(997);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(90 + rand() * 110);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  return tex;
}

export function createProceduralTextures(): ProceduralTextures {
  const walnut = makeWalnutTextures();
  return {
    walnutMap: walnut.map,
    walnutBump: walnut.bump,
    brushedMetalBump: makeBrushedMetalBump(),
    deskMap: makeDeskTexture(),
    feltBump: makeFeltBump(),
  };
}
