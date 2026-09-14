/**
 * 面板丝印绘制器(MDL-3):Canvas 程序化生成 4096px 贴图,
 * 含分区标题、控件名、刻度、波形图形符号与自绘品牌字标。
 * 不含任何第三方商标字样或图形(法律红线)。
 *
 * 画布方向:顶行 = 面板后缘(铰链侧),底行 = 前缘(近玩家)。
 * 面板立起时文字正立可读。
 */

import { DIVIDERS, ITEMS, PANEL, RANGE_TICKS, RANGE_TICKS_LO, SECTIONS, type PanelItem } from "./layout";

export const SILK_W = 4096;
export const SILK_H = Math.round((SILK_W * PANEL.h) / PANEL.w); // ≈1270

const INK = "#e7e4da";
const INK_DIM = "rgba(231,228,218,0.62)";
const TICK = "rgba(231,228,218,0.5)";
const ACCENT = "#d98a3f";

export function paintPanelSilk(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SILK_W;
  c.height = SILK_H;
  const ctx = c.getContext("2d")!;

  const px = (m: number) => (m / PANEL.w) * SILK_W; // 米 → px(x)
  const py = (m: number) => ((PANEL.h - m) / PANEL.h) * SILK_H; // 米 → px(y,顶=后缘)

  // 底色(轻微竖向渐变)
  const grad = ctx.createLinearGradient(0, 0, 0, SILK_H);
  grad.addColorStop(0, "#2e3138");
  grad.addColorStop(1, "#26282e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SILK_W, SILK_H);

  // 分区标题与分隔线
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(SILK_W * 0.0062)}px "Segoe UI", Arial, sans-serif`;
  for (const s of SECTIONS) {
    ctx.fillText(s.title, px((s.x0 + s.x1) / 2), py(0.009));
  }
  ctx.strokeStyle = "rgba(231,228,218,0.28)";
  ctx.lineWidth = 2;
  for (const dx of DIVIDERS) {
    ctx.beginPath();
    ctx.moveTo(px(dx), py(0.018));
    ctx.lineTo(px(dx), py(0.148));
    ctx.stroke();
  }

  // 各控件
  for (const item of ITEMS) {
    drawItem(ctx, item, px, py);
  }

  // 包络列表头
  ctx.fillStyle = INK_DIM;
  ctx.font = `600 ${Math.round(SILK_W * 0.0042)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("FILTER CONTOUR", px(0.436), py(0.148));
  ctx.fillText("LOUDNESS CONTOUR", px(0.472), py(0.148));

  // 品牌字标(自绘,面板左上角)
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.round(SILK_W * 0.0082)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("A E T H E R", px(0.039), py(0.146));
  ctx.fillStyle = ACCENT;
  ctx.font = `500 ${Math.round(SILK_W * 0.0042)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("M O D E L   D", px(0.039), py(0.135));
  ctx.restore();

  return c;
}

type PxFn = (m: number) => number;

function drawItem(ctx: CanvasRenderingContext2D, item: PanelItem, px: PxFn, py: PxFn): void {
  const cx = px(item.x);
  const cy = py(item.y);
  const scale = SILK_W / PANEL.w; // px per meter

  // 标签文字
  if (item.label) {
    ctx.fillStyle = INK_DIM;
    ctx.font = `600 ${Math.round(SILK_W * 0.0038)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    if (item.labelPos === "above") {
      ctx.fillText(item.label, cx, cy - item.d! * 0.5 * scale - SILK_W * 0.004);
    } else if (item.labelPos === "below") {
      ctx.fillText(item.label, cx, cy + item.d! * 0.5 * scale + SILK_W * 0.006);
    } else if (item.labelPos === "left") {
      ctx.textAlign = "right";
      ctx.fillText(item.label, cx - item.d! * 0.5 * scale - SILK_W * 0.002, cy);
    } else if (item.labelPos === "right") {
      ctx.textAlign = "left";
      ctx.fillText(item.label, cx + item.d! * 0.5 * scale + SILK_W * 0.002, cy);
    }
  }
  if (item.tag) {
    ctx.fillStyle = INK_DIM;
    ctx.font = `600 ${Math.round(SILK_W * 0.0032)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    if (item.type === "switch-v") {
      ctx.fillText(item.tag, cx, cy - item.h! * 0.62 * scale - SILK_W * 0.002);
    } else if (item.type === "switch-h") {
      ctx.fillText(item.tag, cx, cy - item.h! * 1.7 * scale);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(item.tag, cx - item.d! * 0.5 * scale - SILK_W * 0.0015, cy);
    }
  }

  if (item.type === "knob") {
    drawKnobTicks(ctx, cx, cy, item.d! * scale);
  } else if (item.type === "selector") {
    const isRange = item.id?.endsWith("Range");
    const isOsc3 = item.id === "osc3Range";
    if (isRange) {
      drawSelectorTicks(ctx, cx, cy, item.d! * scale, isOsc3 ? RANGE_TICKS_LO : RANGE_TICKS);
    } else {
      drawSelectorTicks(ctx, cx, cy, item.d! * scale, null);
    }
    if (item.id?.endsWith("Wave")) drawWaveGlyphs(ctx, cx, cy, item.d! * scale);
  } else if (item.type === "switch-v") {
    // 上下小字 ON / OFF
    ctx.fillStyle = TICK;
    ctx.font = `${Math.round(SILK_W * 0.0026)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("ON", cx, cy - item.h! * 0.75 * scale);
    ctx.fillText("OFF", cx, cy + item.h! * 0.75 * scale);
  } else if (item.type === "switch-h") {
    ctx.fillStyle = TICK;
    ctx.font = `${Math.round(SILK_W * 0.0026)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("OFF", cx - item.w! * 0.85 * scale, cy);
    ctx.fillText("ON", cx + item.w! * 0.85 * scale, cy);
  }
}

/** 连续旋钮:270° 行程刻度 */
function drawKnobTicks(ctx: CanvasRenderingContext2D, cx: number, cy: number, dPx: number): void {
  const r = dPx * 0.72;
  const a0 = -Math.PI * 0.75;
  const a1 = Math.PI * 0.75;
  ctx.strokeStyle = TICK;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r + dPx * 0.09);
    const y2 = cy + Math.sin(a) * (r + dPx * 0.09);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/** 档位选择器:刻度 + 可选档位文字 */
function drawSelectorTicks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dPx: number,
  labels: readonly string[] | null
): void {
  const n = labels ? labels.length : 6;
  const r = dPx * 0.78;
  const a0 = -Math.PI * 0.72;
  const a1 = Math.PI * 0.72;
  ctx.strokeStyle = TICK;
  ctx.fillStyle = INK_DIM;
  ctx.font = `600 ${Math.round(SILK_W * 0.003)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + cos * r, cy + sin * r);
    ctx.lineTo(cx + cos * (r + dPx * 0.1), cy + sin * (r + dPx * 0.1));
    ctx.stroke();
    if (labels) {
      const lr = r + dPx * 0.26;
      ctx.fillText(labels[i], cx + cos * lr, cy + sin * lr);
    }
  }
}

/** 波形选择器:6 档图形符号 */
function drawWaveGlyphs(ctx: CanvasRenderingContext2D, cx: number, cy: number, dPx: number): void {
  const n = 6;
  const r = dPx * 0.78 + dPx * 0.24;
  const a0 = -Math.PI * 0.72;
  const a1 = Math.PI * 0.72;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const gx = cx + Math.cos(a) * r;
    const gy = cy + Math.sin(a) * r;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.strokeStyle = INK_DIM;
    ctx.fillStyle = INK_DIM;
    ctx.lineWidth = 2.2;
    const s = SILK_W * 0.0034; // glyph 半宽
    ctx.beginPath();
    switch (i) {
      case 0: // 三角
        ctx.moveTo(-s, s * 0.5);
        ctx.lineTo(0, -s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.stroke();
        break;
      case 1: // 锯齿升
        ctx.moveTo(-s, s * 0.5);
        ctx.lineTo(s, -s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.stroke();
        break;
      case 2: // 反锯齿(降)
        ctx.moveTo(-s, -s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(-s, s * 0.5);
        ctx.stroke();
        break;
      case 3: // 方波
        ctx.moveTo(-s, s * 0.5);
        ctx.lineTo(-s, -s * 0.5);
        ctx.lineTo(0, -s * 0.5);
        ctx.lineTo(0, s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(s, -s * 0.5);
        ctx.stroke();
        break;
      case 4: // 宽脉冲
        ctx.rect(-s, -s * 0.5, s * 1.2, s);
        ctx.stroke();
        break;
      case 5: // 窄脉冲
        ctx.rect(-s * 0.4, -s * 0.5, s * 0.5, s);
        ctx.moveTo(-s, s * 0.5);
        ctx.lineTo(s, s * 0.5);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }
}

/** 前围板品牌牌:自绘 AETHER 字标 + Model D 小字(MDL-3 品牌区) */
export function paintApronBrand(): HTMLCanvasElement {
  const w = 2048;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#18191d";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(231,228,218,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 自绘 chevron 字标
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.335, h * 0.68);
  ctx.lineTo(w * 0.385, h * 0.3);
  ctx.lineTo(w * 0.435, h * 0.68);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.352, h * 0.56);
  ctx.lineTo(w * 0.418, h * 0.56);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `700 96px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("AETHER", w * 0.62, h * 0.42);
  ctx.fillStyle = ACCENT;
  ctx.font = `500 44px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("M O D E L  D", w * 0.62, h * 0.7);
  return c;
}
