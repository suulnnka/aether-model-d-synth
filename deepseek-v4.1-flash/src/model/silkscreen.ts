/**
 * Panel silkscreen — everything printed on the instrument, painted into one
 * canvas that is then used as the panel's base colour map (PRD MDL-3, VIEW-5).
 *
 * Legal note (PRD 1.1, 11.8): this file contains the *only* text that ends up
 * on the instrument. It draws a self-authored "AETHER / Model D" mark and
 * generic control legends. No third-party brand name, wordmark or logo appears
 * anywhere in this module, and the build is grepped for those strings.
 *
 * Coordinate mapping
 * ------------------
 * Panel-local metres -> canvas pixels. x runs from the panel's left edge; z
 * runs from the REAR edge (z = 0) toward the hinge (z = PANEL_DEPTH), which is
 * the same top-to-bottom order a viewer reads the tilted panel in. Because
 * three.js samples a CanvasTexture with flipY on, canvas row 0 lands at the
 * rear of the panel with the default plane UVs used in instrument.ts.
 */

import {
  BRAND_STRIP,
  DIAL_SPAN_DEG,
  HINGE_MAX_DEG,
  LABEL_OFFSET,
  PANEL_DEPTH,
  PANEL_W,
  PLACEMENTS,
  SECTION_BANDS,
  SECTION_TITLE_Z,
  SILKSCREEN_HEIGHT,
  SILKSCREEN_WIDTH,
  type Placement,
} from './layout.ts';
import {
  SECTION_TITLES,
  type AnySpec,
  type SelectorSpec,
  type SwitchSpec,
} from '../state/specs.ts';

const W = SILKSCREEN_WIDTH;
const H = SILKSCREEN_HEIGHT;
/** Pixels per panel metre — the single scale factor for all canvas drawing. */
const PPM = W / PANEL_W;

/** Metres -> canvas x. */
function px(x: number): number {
  return (x + PANEL_W / 2) * PPM;
}
/** Metres -> canvas y. z = 0 (rear) is the top of the canvas. */
function py(z: number): number {
  return z * PPM;
}
/** Metres -> pixels. */
function pm(m: number): number {
  return m * PPM;
}

const INK = '#e9e6de';
const INK_DIM = '#a5a096';
const INK_FAINT = '#6b675f';
const ACCENT = '#ff9a4d';
const PANEL_BASE = '#16161a';

type Ctx = CanvasRenderingContext2D;

interface TextOptions {
  readonly size: number; // metres (cap height scale)
  readonly weight?: number;
  readonly color?: string;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
  /** Extra tracking in metres. Enforced manually so it works everywhere. */
  readonly tracking?: number;
  readonly font?: string;
}

/**
 * Draw text with manual letter tracking. Canvas `letterSpacing` is not
 * available in every target browser, so spacing is applied glyph by glyph when
 * a tracking value is requested.
 */
function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: TextOptions,
): void {
  const sizePx = pm(opts.size);
  const weight = opts.weight ?? 600;
  ctx.font = `${weight} ${sizePx}px ${opts.font ?? '"Inter","Helvetica Neue",Arial,sans-serif'}`;
  ctx.fillStyle = opts.color ?? INK;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';

  if (!opts.tracking) {
    ctx.fillText(text, x, y);
    return;
  }

  const gap = pm(opts.tracking);
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let cursor =
    ctx.textAlign === 'center'
      ? x - total / 2
      : ctx.textAlign === 'right'
        ? x - total
        : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cursor, y);
    cursor += widths[i] + gap;
  });
  ctx.textAlign = prevAlign;
}

/** Angle (radians, canvas space) for a normalised position on a dial. */
function dialAngle(pos: number): number {
  const span = (DIAL_SPAN_DEG * Math.PI) / 180;
  // 0 points down-left, 1 down-right, sweeping over the top.
  return -Math.PI / 2 + (pos - 0.5) * span + Math.PI;
}

/* ===========================================================================
 * Panel substrate
 * ========================================================================= */

function paintBase(ctx: Ctx): void {
  ctx.fillStyle = PANEL_BASE;
  ctx.fillRect(0, 0, W, H);

  // Very faint vertical gradient so a flat panel still catches the eye.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.035)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Fine speckle: paint on metal is never perfectly even.
  let seed = 0x1234;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 26000; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.028})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  // Inner bevel: a hairline highlight just inside the panel edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = pm(0.0012);
  ctx.strokeRect(pm(0.004), pm(0.004), W - pm(0.008), H - pm(0.008));
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(pm(0.0025), pm(0.0025), W - pm(0.005), H - pm(0.005));
}

/* ===========================================================================
 * Brand
 * ========================================================================= */

function paintBrand(ctx: Ctx): void {
  const centreX = px(0);
  const y = py(BRAND_STRIP.z);

  drawText(ctx, 'AETHER', centreX, y, {
    size: BRAND_STRIP.titleSize,
    weight: 700,
    color: INK,
    tracking: 0.0032,
  });

  const subSize = 0.0042;
  drawText(ctx, 'MODEL D', centreX, y + pm(0.0165), {
    size: subSize,
    weight: 600,
    color: ACCENT,
    tracking: 0.0044,
  });

  // A small self-drawn waveform glyph either side of the mark — an abstract
  // saw+square motif, deliberately not a copy of any real logo.
  const glyphW = pm(0.03);
  const glyphH = pm(0.0075);
  for (const dir of [-1, 1] as const) {
    const x0 = centreX + dir * pm(0.082);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = pm(0.0009);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const gx = x0 - glyphW / 2 + t * glyphW;
      const gy = y + pm(0.004) - Math.sin(t * Math.PI * 2) * glyphH * 0.5;
      if (i === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    }
    ctx.stroke();
  }

  // Hairline rule under the whole brand block.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = pm(0.0007);
  ctx.beginPath();
  ctx.moveTo(px(-0.115), py(BRAND_STRIP.z + 0.0215));
  ctx.lineTo(px(0.115), py(BRAND_STRIP.z + 0.0215));
  ctx.stroke();
}

/* ===========================================================================
 * Section plates
 * ========================================================================= */

function paintSections(ctx: Ctx): void {
  for (const band of SECTION_BANDS) {
    const meta = SECTION_TITLES[band.id];
    const left = px(band.left - PANEL_W / 2);
    const right = px(band.right - PANEL_W / 2);
    const top = py(SECTION_TITLE_Z - 0.011);
    const bottom = py(0.238);

    // Engraved separation lines between sections.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = pm(0.0009);
    ctx.beginPath();
    for (const x of [left, right]) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    for (const x of [left + pm(0.0009), right + pm(0.0009)]) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();

    const centreX = px(band.centre - PANEL_W / 2);
    drawText(ctx, meta.label, centreX, py(SECTION_TITLE_Z), {
      size: 0.0046,
      weight: 700,
      color: INK,
      tracking: 0.0022,
    });
    drawText(ctx, meta.name, centreX, py(SECTION_TITLE_Z + 0.0095), {
      size: 0.0036,
      weight: 500,
      color: INK_FAINT,
      tracking: 0.0012,
      font: '"PingFang SC","Microsoft YaHei",sans-serif',
    });
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = pm(0.0008);
    ctx.beginPath();
    ctx.moveTo(centreX - pm(0.017), py(SECTION_TITLE_Z + 0.0155));
    ctx.lineTo(centreX + pm(0.017), py(SECTION_TITLE_Z + 0.0155));
    ctx.stroke();
  }
}

/* ===========================================================================
 * Controls
 * ========================================================================= */

function paintKnob(ctx: Ctx, p: Placement): void {
  const cx = px(p.x);
  const cy = py(p.z);
  const r = pm(0.0138);

  // Graduated dial: 11 ticks plus 0..10 numerals, matching a 270-degree sweep.
  ctx.lineCap = 'butt';
  for (let i = 0; i <= 10; i += 1) {
    const pos = i / 10;
    const a = dialAngle(pos);
    const major = i === 0 || i === 5 || i === 10;
    const inner = r * (major ? 0.83 : 0.88);
    const outer = r * 1.02;
    ctx.strokeStyle = major ? INK : INK_FAINT;
    ctx.lineWidth = pm(major ? 0.0011 : 0.0007);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
  for (let i = 0; i <= 10; i += 1) {
    const a = dialAngle(i / 10);
    const rr = r * 1.24;
    drawText(ctx, String(i), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, {
      size: 0.0021,
      weight: 600,
      color: INK_DIM,
    });
  }

  paintLabel(ctx, p);
}

function paintSelector(ctx: Ctx, p: Placement): void {
  const spec = p.spec as SelectorSpec;
  const cx = px(p.x);
  const cy = py(p.z);
  const tickR = pm(0.0128);
  const count = spec.options.length;

  // Detent ticks + short option names placed at their own angle.
  for (let i = 0; i < count; i += 1) {
    const pos = count === 1 ? 0.5 : i / (count - 1);
    const a = dialAngle(pos);
    ctx.strokeStyle = INK;
    ctx.lineWidth = pm(0.0009);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * tickR * 0.9, cy + Math.sin(a) * tickR * 0.9);
    ctx.lineTo(cx + Math.cos(a) * tickR * 1.08, cy + Math.sin(a) * tickR * 1.08);
    ctx.stroke();

    const lr = pm(0.0192);
    drawText(
      ctx,
      spec.options[i].short,
      cx + Math.cos(a) * lr,
      cy + Math.sin(a) * lr,
      { size: 0.0022, weight: 700, color: INK_DIM },
    );
  }

  paintLabel(ctx, p);
}

function paintSwitch(ctx: Ctx, p: Placement): void {
  const spec = p.spec as SwitchSpec;
  const cx = px(p.x);
  const cy = py(p.z);
  const r = pm(0.0098);

  // Two detent marks with a small two-state arc; the filled dot follows the
  // lever, which is what makes a switch readable at a glance in 2D.
  const a0 = -Math.PI / 2 - 0.5;
  const a1 = -Math.PI / 2 + 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = pm(0.0008);
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();

  for (const [a, label] of [
    [a0, spec.offLabel],
    [a1, spec.onLabel],
  ] as const) {
    const mx = cx + Math.cos(a) * r;
    const my = cy + Math.sin(a) * r;
    ctx.fillStyle = INK_FAINT;
    ctx.beginPath();
    ctx.arc(mx, my, pm(0.0011), 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, label, mx + Math.cos(a) * pm(0.0058), my + Math.sin(a) * pm(0.0058), {
      size: 0.0019,
      weight: 600,
      color: INK_FAINT,
    });
  }

  paintLabel(ctx, p);
}

/** Shared label + optional secondary line under any control. */
function paintLabel(ctx: Ctx, p: Placement): void {
  const cx = px(p.x);
  const spec: AnySpec = p.spec;
  const baseZ = p.z + LABEL_OFFSET;

  drawText(ctx, spec.label, cx, py(baseZ), {
    size: labelSize(spec),
    weight: 600,
    color: INK_DIM,
    tracking: 0.0009,
  });

  // A second, dimmer line carries the unit / role where there is room.
  const sub = subLabel(spec);
  if (sub) {
    drawText(ctx, sub, cx, py(baseZ + 0.0072), {
      size: 0.0022,
      weight: 500,
      color: INK_FAINT,
      tracking: 0.0006,
    });
  }
}

function labelSize(spec: AnySpec): number {
  return spec.label.length > 9 ? 0.0026 : 0.003;
}

/** Tiny explanatory line for controls whose names are opaque in isolation. */
function subLabel(spec: AnySpec): string | null {
  switch (spec.id) {
    case 'fAttack':
      return '起音';
    case 'fDecay':
      return '衰减';
    case 'fRelease':
      return '释音';
    case 'lAttack':
      return '起音';
    case 'lDecay':
      return '衰减';
    case 'lRelease':
      return '释音';
    case 'fSustain':
    case 'lSustain':
      return null;
    default:
      return null;
  }
}

/* ===========================================================================
 * Group brackets: the two contour rows get a labelled brace
 * ========================================================================= */

function paintContourBraces(ctx: Ctx): void {
  const groups: readonly (readonly [string, string])[] = [
    ['FILTER CONTOUR', '滤波包络'],
    ['LOUDNESS CONTOUR', '响度包络'],
  ];
  const rows = PLACEMENTS.filter((p) => p.id === 'fAttack' || p.id === 'lAttack');
  rows.sort((a, b) => a.z - b.z);

  rows.forEach((anchor, i) => {
    const [en, zh] = groups[i] ?? groups[0];
    const band = SECTION_BANDS.find((b) => b.id === 'modifiers');
    if (!band) return;
    // Label above the first artifact of each row, tucked to the left edge.
    const left = px(band.left - PANEL_W / 2 + 0.002);
    drawText(ctx, en, left, py(anchor.z - 0.0185), {
      size: 0.0026,
      weight: 700,
      color: INK_DIM,
      align: 'left',
      tracking: 0.0011,
    });
    drawText(ctx, zh, left, py(anchor.z - 0.011), {
      size: 0.0022,
      weight: 500,
      color: INK_FAINT,
      align: 'left',
      font: '"PingFang SC","Microsoft YaHei",sans-serif',
    });
  });
}

/* ===========================================================================
 * Hinge travel scale along the front edge
 * ========================================================================= */

function paintHingeScale(ctx: Ctx): void {
  const y = py(PANEL_DEPTH - 0.0065);
  const x0 = px(-0.058);
  const x1 = px(0.058);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = pm(0.0007);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let deg = 0; deg <= HINGE_MAX_DEG; deg += 10) {
    const t = deg / HINGE_MAX_DEG;
    const x = x0 + (x1 - x0) * t;
    ctx.beginPath();
    ctx.moveTo(x, y - pm(0.0024));
    ctx.lineTo(x, y);
    ctx.stroke();
    drawText(ctx, String(deg), x, y - pm(0.0055), {
      size: 0.0019,
      weight: 600,
      color: INK_FAINT,
    });
  }
  drawText(ctx, 'PANEL ANGLE', (x0 + x1) / 2, y + pm(0.0042), {
    size: 0.0021,
    weight: 600,
    color: INK_FAINT,
    tracking: 0.0013,
  });
}

/* ===========================================================================
 * Entry point
 * ========================================================================= */

/** Paint the whole silkscreen and hand back a ready-to-use canvas. */
export function paintSilkscreen(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  paintBase(ctx);
  paintBrand(ctx);
  paintSections(ctx);
  paintContourBraces(ctx);

  for (const p of PLACEMENTS) {
    switch (p.spec.kind) {
      case 'knob':
        paintKnob(ctx, p);
        break;
      case 'selector':
        paintSelector(ctx, p);
        break;
      case 'switch':
        paintSwitch(ctx, p);
        break;
      default:
        break;
    }
  }

  paintHingeScale(ctx);
  return el;
}

/** Canvas dimensions, exported so the texture can be built with the same size. */
export const SILKSCREEN_SIZE = Object.freeze({ width: W, height: H });
