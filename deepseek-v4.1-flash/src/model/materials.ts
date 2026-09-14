/**
 * Material library (PRD VIS-4).
 *
 * Everything is procedural — no texture files ship with the project and nothing
 * is fetched at runtime (PRD MDL-6, PRD 9 "资源全部本地"). Surface detail is
 * painted into small canvases and uploaded as textures, which keeps the whole
 * instrument inside a handful of draw calls and a few hundred kilobytes.
 *
 * All maps are generated once and cached by key, because a build-time random
 * texture would otherwise differ between the panel and its spares.
 */

import * as THREE from 'three';

/* ===========================================================================
 * Deterministic noise
 * ========================================================================= */

/** Small mulberry32 PRNG so a given texture is identical on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width: number, height: number): {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { el, ctx };
}

function texture(el: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dataTexture(el: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = texture(el, repeat);
  // Roughness / metalness maps are linear data, not colour.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* ===========================================================================
 * Texture painters
 * ========================================================================= */

/** Fine horizontal brushing, used as a roughness map for the satin panel. */
function brushedRoughness(size = 512): THREE.CanvasTexture {
  const { el, ctx } = canvas(size, size);
  const rand = rng(0x51ed);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * 5; i += 1) {
    const y = rand() * size;
    const len = 30 + rand() * (size * 0.9);
    const x = rand() * size;
    const tone = 118 + Math.floor(rand() * 60);
    ctx.strokeStyle = `rgba(${tone},${tone},${tone},${0.1 + rand() * 0.22})`;
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 1.4);
    ctx.stroke();
  }
  return dataTexture(el, 1);
}

/** Matte moulding micro-texture for the plastic knobs. */
function plasticRoughness(size = 256): THREE.CanvasTexture {
  const { el, ctx } = canvas(size, size);
  const rand = rng(0x2f17);
  ctx.fillStyle = '#5c5c5c';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 46;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return dataTexture(el, 1);
}

/**
 * Dark walnut for the side cheeks: a warm base, low-frequency colour banding
 * and fine dark grain lines following the long axis.
 */
function walnutMaps(size = 1024): {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const { el, ctx } = canvas(size, size);
  const { el: rEl, ctx: rCtx } = canvas(size, size);
  const rand = rng(0x9c31);

  ctx.fillStyle = '#3b2416';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#6e6e6e';
  rCtx.fillRect(0, 0, size, size);

  // Broad heartwood banding along the grain.
  for (let i = 0; i < 44; i += 1) {
    const y = rand() * size;
    const h = 6 + rand() * 48;
    const warm = 30 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgba(${58 + warm},${34 + warm * 0.6},${20 + warm * 0.35},0.5)`;
    ctx.fillRect(0, y, size, h);
  }

  // Fine grain lines, slightly wavy so they read as figure rather than stripes.
  for (let i = 0; i < 900; i += 1) {
    const y = rand() * size;
    const alpha = 0.06 + rand() * 0.5;
    ctx.strokeStyle = `rgba(20,10,4,${alpha})`;
    rCtx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
    ctx.lineWidth = 0.5 + rand() * 2.1;
    rCtx.lineWidth = ctx.lineWidth;
    const amp = 1 + rand() * 5;
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    rCtx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const yy = y + Math.sin((x / size) * Math.PI * 3 + phase) * amp;
      if (x === 0) {
        ctx.moveTo(x, yy);
        rCtx.moveTo(x, yy);
      } else {
        ctx.lineTo(x, yy);
        rCtx.lineTo(x, yy);
      }
    }
    ctx.stroke();
    rCtx.stroke();
  }

  return { map: texture(el, 1), roughness: dataTexture(rEl, 1) };
}

/** Directional weave for the black key tops (PRD VIS-4). */
function keyTopMaps(size = 512): {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const { el, ctx } = canvas(size, size);
  const { el: rEl, ctx: rCtx } = canvas(size, size);
  const rand = rng(0x77ab);

  ctx.fillStyle = '#d9d3c6';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#4a4a4a';
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * 0.09;
    ctx.fillStyle = `rgba(120,112,96,${a})`;
    rCtx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    const h = 1 + rand() * 5;
    ctx.fillRect(x, y, 1, h);
    rCtx.fillRect(x, y, 1, h);
  }
  return { map: texture(el, 1), roughness: dataTexture(rEl, 1) };
}

/** Slightly mottled matte surface for the studio table (PRD VIS-3). */
function tableMaps(size = 512): {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const { el, ctx } = canvas(size, size);
  const { el: rEl, ctx: rCtx } = canvas(size, size);
  const rand = rng(0x4d02);

  ctx.fillStyle = '#17181b';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#b4b4b4';
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5000; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 2.6;
    const a = rand() * 0.06;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    rCtx.fillStyle = `rgba(90,90,90,${a * 3})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    rCtx.beginPath();
    rCtx.arc(x, y, r, 0, Math.PI * 2);
    rCtx.fill();
  }
  return { map: texture(el, 6), roughness: dataTexture(rEl, 6) };
}

/* ===========================================================================
 * Cache
 * ========================================================================= */

const cache = new Map<string, unknown>();

function once<T>(key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const value = build();
  cache.set(key, value);
  return value;
}

/* ===========================================================================
 * Palette
 * ========================================================================= */

export const PALETTE = Object.freeze({
  /** Panel face: near-black charcoal with a faint warm cast. */
  panel: 0x141417,
  /** Painted metal inside the case. */
  chassis: 0x0a0a0c,
  /** Wood side cheeks. */
  wood: 0xffffff, // tinted by the walnut map
  /** Moulded plastic knobs. */
  knob: 0x121215,
  /** Chrome: switch levers, hinge barrel, jack surrounds. */
  chrome: 0xd9dde2,
  /**
   * White key tops. Ivory rather than paper-white: an albedo of 1.0 under a
   * four-light studio rig clips to pure white and the bloom smears it into a
   * glowing blob, and real key tops of this era were cream anyway.
   */
  keyWhite: 0xe6e1d5,
  /** Black key tops. */
  keyBlack: 0x0b0b0d,
  /** Matte switch collars. */
  switchCollar: 0x0e0e11,
  /**
   * Studio table. Pulled off pure white for the same reason as the keys — a
   * white table under the key light was the brightest thing in frame and drew
   * the eye away from the instrument.
   */
  table: 0xd6d1c8,
  /** Pilot lamp when lit. */
  lamp: 0xff7a2e,
});

/* ===========================================================================
 * Builders
 * ========================================================================= */

/** Satin brushed panel face. Expects the caller to supply the silkscreen map. */
export function panelFace(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.52,
    roughnessMap: once('brush', () => brushedRoughness()),
    metalness: 0.28,
    envMapIntensity: 0.85,
  });
}

/** Painted metal for the case, hinge and rear panel. */
export function chassisMaterial(): THREE.MeshStandardMaterial {
  return once(
    'chassis',
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.chassis,
        roughness: 0.44,
        roughnessMap: once('brush2', () => brushedRoughness(256)),
        metalness: 0.34,
        envMapIntensity: 0.7,
      }),
  );
}

/** Dark walnut side cheeks. */
export function woodMaterial(): THREE.MeshStandardMaterial {
  return once('wood', () => {
    const { map, roughness } = walnutMaps();
    return new THREE.MeshStandardMaterial({
      map,
      color: PALETTE.wood,
      roughness: 0.62,
      roughnessMap: roughness,
      metalness: 0.0,
      envMapIntensity: 0.5,
    });
  });
}

/** Moulded plastic knob body. */
export function knobMaterial(): THREE.MeshStandardMaterial {
  return once(
    'knob',
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.knob,
        roughness: 0.42,
        roughnessMap: once('plastic', () => plasticRoughness()),
        metalness: 0.05,
        envMapIntensity: 0.9,
      }),
  );
}

/** Polished metal parts. */
export function chromeMaterial(): THREE.MeshStandardMaterial {
  return once(
    'chrome',
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.chrome,
        // Polished, but not a mirror. A fully polished metal turns the hinge
        // barrel into a single blown white line that the bloom pass then
        // smears across the panel; 0.34 keeps the highlight reading as chrome
        // while spreading it over enough pixels that it stops clipping.
        roughness: 0.34,
        metalness: 1,
        envMapIntensity: 0.95,
      }),
  );
}

/** Matte switch collar. */
export function collarMaterial(): THREE.MeshStandardMaterial {
  return once(
    'collar',
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.switchCollar,
        roughness: 0.66,
        metalness: 0.08,
        envMapIntensity: 0.7,
      }),
  );
}

/** Ivory key tops with a faint grain. */
export function whiteKeyMaterial(): THREE.MeshStandardMaterial {
  return once('keyWhite', () => {
    const { map, roughness } = keyTopMaps();
    return new THREE.MeshStandardMaterial({
      map,
      color: PALETTE.keyWhite,
      roughness: 0.48,
      roughnessMap: roughness,
      metalness: 0.0,
      envMapIntensity: 0.55,
    });
  });
}

/** Black key tops — same weave, near-black. */
export function blackKeyMaterial(): THREE.MeshStandardMaterial {
  return once('keyBlack', () => {
    const { map, roughness } = keyTopMaps();
    return new THREE.MeshStandardMaterial({
      map,
      color: PALETTE.keyBlack,
      roughness: 0.34,
      roughnessMap: roughness,
      metalness: 0.02,
      envMapIntensity: 0.9,
    });
  });
}

/** Matte studio table (PRD VIS-3). */
export function tableMaterial(): THREE.MeshStandardMaterial {
  return once('table', () => {
    const { map, roughness } = tableMaps();
    return new THREE.MeshStandardMaterial({
      map,
      color: PALETTE.table,
      roughness: 0.88,
      roughnessMap: roughness,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
  });
}

/** Knurled rubber for the performance wheels. */
export function wheelMaterial(): THREE.MeshStandardMaterial {
  return once(
    'wheel',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x141417,
        roughness: 0.55,
        metalness: 0.06,
        envMapIntensity: 0.75,
      }),
  );
}

/** Self-illuminated pilot lamp (PRD VIS-6); callers fade `emissiveIntensity`. */
export function lampMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a1206,
    emissive: new THREE.Color(PALETTE.lamp),
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.0,
    toneMapped: true,
  });
}

/** Green fibreglass PCB used as the P2 "simplified internals" (PRD HINGE-5). */
export function pcbMaterial(): THREE.MeshStandardMaterial {
  return once(
    'pcb',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x14432c,
        roughness: 0.66,
        metalness: 0.1,
        envMapIntensity: 0.4,
      }),
  );
}

/** Dispose every cached texture — used when tearing the scene down. */
export function disposeMaterialCache(): void {
  for (const value of cache.values()) {
    if (value instanceof THREE.Texture) value.dispose();
    else if (value && typeof value === 'object' && 'dispose' in value) {
      const d = (value as { dispose?: unknown }).dispose;
      if (typeof d === 'function') (d as () => void).call(value);
    }
  }
  cache.clear();
}

export { canvas as createCanvas, rng };
