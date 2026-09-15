/**
 * 面板丝印(MDL-3)
 * ------------------------------------------------------------------
 * 全部文字与刻度用 Canvas 程序化绘制(≥2048px + 各向异性过滤,VIEW-5)。
 * 品牌区为自绘「AETHER」字标 + 小字「Model D」;
 * 不含任何第三方商标字样或 Logo(§1.2 法律红线)。
 */
import * as THREE from "three";
import {
  BRAND_V,
  DIM,
  PANEL_INNER_W,
  PLACEMENTS,
  ROW_V,
  SECTIONS,
  SUB_FRAMES,
  TITLE_V,
  type Placement,
} from "./layout";

const INK = "#1d2026";
const INK_SOFT = "rgba(29,32,38,0.5)";
const FONT = '"Helvetica Neue", Helvetica, Arial, "PingFang SC", sans-serif';

const PANEL_W = 4096;
const PANEL_H = Math.round((PANEL_W * DIM.PANEL_D) / PANEL_INNER_W);

/** 面板面内坐标 (u, v) → 画布像素 */
function toPx(u: number, v: number): [number, number] {
  return [
    ((u + PANEL_INNER_W / 2) / PANEL_INNER_W) * PANEL_W,
    (1 - v / DIM.PANEL_D) * PANEL_H,
  ];
}

/** 数值 0..1 → 旋钮指针角度(弧度);225° 起,顺时针扫过 270° */
export function knobAngle(t: number): number {
  return 1.25 * Math.PI - 1.5 * Math.PI * Math.min(1, Math.max(0, t));
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 500, spacing = 0): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  // letterSpacing 在部分浏览器不可用,失败时静默忽略
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  } catch {
    /* noop */
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 波形图标(0 三角 / 1 锯齿 / 2 反锯齿 / 3 方波 / 4 宽脉冲 / 5 窄脉冲) */
function drawWaveGlyph(ctx: CanvasRenderingContext2D, index: number, w: number): void {
  const h = w * 0.42;
  const l = -w / 2;
  const r = w / 2;
  const t = -h / 2;
  const b = h / 2;
  ctx.beginPath();
  switch (index) {
    case 0: // 三角
      ctx.moveTo(l, b);
      ctx.lineTo(0, t);
      ctx.lineTo(r, b);
      break;
    case 1: // 锯齿
      ctx.moveTo(l, b);
      ctx.lineTo(r, t);
      ctx.lineTo(r, b);
      break;
    case 2: // 反锯齿
      ctx.moveTo(l, t);
      ctx.lineTo(r, b);
      ctx.lineTo(r, t);
      break;
    case 3: // 方波
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(0, t);
      ctx.lineTo(0, b);
      ctx.lineTo(r, b);
      ctx.lineTo(r, t);
      break;
    case 4: // 宽脉冲
    case 5: {
      const duty = index === 4 ? 0.36 : 0.16;
      const cut = l + w * duty;
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(cut, t);
      ctx.lineTo(cut, b);
      ctx.lineTo(r, b);
      ctx.lineTo(r, t);
      break;
    }
    default:
      break;
  }
  ctx.stroke();
}

function drawPanelCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PANEL_W;
  c.height = PANEL_H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, PANEL_W, PANEL_H);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.textBaseline = "middle";

  // 每米对应的像素数(用于把「米」单位的偏移换算成像素)
  const pxPerM = PANEL_W / PANEL_INNER_W;

  // ── 分区分隔细线 ──
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 3;
  for (const id of ["gab", "colC", "colD"]) {
    const s = SECTIONS.find((b) => b.id === id)!;
    const [x, yTop] = toPx(s.center, 0.101);
    const [, yBot] = toPx(s.center, 0.014);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }

  // ── MODIFIERS 两个子框 ──
  for (const f of SUB_FRAMES) {
    const [x0, y0] = toPx(f.x0, f.v1);
    const [x1, y1] = toPx(f.x1, f.v0);
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 3;
    roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 14);
    ctx.stroke();
    setFont(ctx, 26, 700, 3);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(f.label, x0 + 14, y0 + 24);
  }

  // ── 品牌区(自绘字标,无第三方商标) ──
  const [brandX] = toPx(-PANEL_INNER_W / 2 + 0.012, 0);
  const [, brandY] = toPx(0, BRAND_V + 0.004);
  setFont(ctx, 74, 700, 16);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText("AETHER", brandX, brandY);
  const [, brandY2] = toPx(0, BRAND_V - 0.0045);
  setFont(ctx, 30, 400, 6);
  ctx.fillStyle = INK;
  ctx.fillText("Model D", brandX + 6, brandY2);

  // ── 分区标题(底部) ──
  setFont(ctx, 27, 700, 4);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  for (const s of SECTIONS) {
    if (!s.title) continue;
    const [x, y] = toPx(s.center, TITLE_V);
    ctx.fillText(s.title, x, y);
  }

  // ── 控件标签与刻度 ──
  for (const p of PLACEMENTS) {
    if (p.space !== "panel" || !p.silk) continue;
    const [cx, cy] = toPx(p.u, p.v);

    if (p.vertical) {
      const [vx, vy] = toPx(p.u, p.v + (p.silkOffset ?? -0.018));
      ctx.save();
      ctx.translate(vx, vy);
      ctx.rotate(-Math.PI / 2);
      setFont(ctx, p.silkSize ?? 20, 600, 1.5);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.fillText(p.silk, 0, 0);
      ctx.restore();
      void cx;
      void cy;
      continue;
    }

    const [lx, ly] = toPx(p.u, p.v + (p.silkOffset ?? -0.0155));
    setFont(ctx, p.silkSize ?? 22, 600, 1);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText(p.silk, lx, ly);
  }

  // ── 拨杆下方的小字(ON / 1·ON / 2·ON) ──
  for (const p of PLACEMENTS) {
    if (p.space !== "panel" || !p.sub) continue;
    const [lx, ly] = toPx(p.u, p.v - 0.0105);
    setFont(ctx, 17, 700, 1);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText(p.sub, lx, ly);
  }

  // ── 旋钮刻度点 / 档位刻度与图标 ──
  for (const p of PLACEMENTS) {
    if (p.space !== "panel") continue;
    if (p.kind === "knob" && p.ticks) {
      const r = (p.radius ?? 0.0105) + 0.0042;
      for (let i = 0; i < p.ticks; i++) {
        const t = i / (p.ticks - 1);
        const a = knobAngle(t);
        const [dx, dy] = toPx(p.u + Math.cos(a) * r, p.v + Math.sin(a) * r);
        ctx.beginPath();
        ctx.fillStyle = INK_SOFT;
        ctx.arc(dx, dy, i === 0 || i === p.ticks - 1 ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (p.kind === "selector") {
      const r = (p.radius ?? 0.0125) + 0.0052;
      const n = 6;
      if (p.waveformTicks) {
        for (let i = 0; i < n; i++) {
          const a = knobAngle(i / (n - 1));
          const [dx, dy] = toPx(p.u + Math.cos(a) * r, p.v + Math.sin(a) * r);
          ctx.save();
          ctx.translate(dx, dy);
          ctx.rotate(Math.PI / 2 - a);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3.2;
          drawWaveGlyph(ctx, i, 30);
          ctx.restore();
        }
      } else {
        for (let i = 0; i < n; i++) {
          const a = knobAngle(i / (n - 1));
          const [x0, y0] = toPx(p.u + Math.cos(a) * (r - 0.0022), p.v + Math.sin(a) * (r - 0.0022));
          const [x1, y1] = toPx(p.u + Math.cos(a) * (r + 0.0022), p.v + Math.sin(a) * (r + 0.0022));
          ctx.strokeStyle = INK_SOFT;
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }
  }

  // ── 面板四角螺丝(视觉细节) ──
  ctx.fillStyle = "rgba(29,32,38,0.35)";
  for (const [su, sv] of [
    [-PANEL_INNER_W / 2 + 0.007, 0.108],
    [PANEL_INNER_W / 2 - 0.007, 0.108],
    [-PANEL_INNER_W / 2 + 0.007, 0.007],
    [PANEL_INNER_W / 2 - 0.007, 0.007],
  ] as Array<[number, number]>) {
    const [x, y] = toPx(su, sv);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  void pxPerM;
  return c;
}

// ── 键盘左侧边条丝印 ────────────────────────────────────────────────

const SIDE_W = 1024;
const SIDE_SPAN_Z = DIM.KEY_FRONT_Z - DIM.KEY_BACK_Z;
const SIDE_SPAN_X = DIM.SIDE_X1 - DIM.SIDE_X0;
const SIDE_H = Math.round((SIDE_W * SIDE_SPAN_Z) / SIDE_SPAN_X);

function sideToPx(x: number, z: number): [number, number] {
  const t = (DIM.KEY_FRONT_Z - z) / SIDE_SPAN_Z;
  return [((x - DIM.SIDE_X0) / SIDE_SPAN_X) * SIDE_W, (1 - t) * SIDE_H];
}

function drawSideCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIDE_W;
  c.height = SIDE_H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, SIDE_W, SIDE_H);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const INK_L = "#dcd9d2";

  for (const p of PLACEMENTS) {
    if (p.space !== "side") continue;
    const [x, y] = sideToPx(p.x!, p.z!);
    if (!p.silk) continue;
    setFont(ctx, (p.silkSize ?? 20) * 1.6, 600, 2);
    ctx.fillStyle = INK_L;
    // 标签统一放在控件上方(侧边条为深色面板,浅色字)
    ctx.fillText(p.silk, x, y - 58);
    if (p.sub) {
      setFont(ctx, 26, 700, 2);
      ctx.fillText(p.sub, x, y + 46);
    }
  }
  return c;
}

// ── 对外接口 ────────────────────────────────────────────────────────

export function createPanelSilkscreenTexture(anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(drawPanelCanvas());
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export function createSideSilkscreenTexture(anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(drawSideCanvas());
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/** tooltip / 引导需要用到的「控件在面板上的屏幕锚点」由 3D 对象提供,此处仅导出尺寸常量 */
export const SILK_SIZE = { PANEL_W, PANEL_H, SIDE_W, SIDE_H, ROW_V };
export type { Placement };
