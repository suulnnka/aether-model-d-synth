/**
 * 面板丝印绘制器(MDL-3)— Canvas 程序化绘制
 * 品牌:「AETHER」+ 小字「Model D」。全图不含任何第三方商标与字样。
 */
import { LABELS, OSC_COLUMN_U, PLACEMENT_MAP, SECTION_TITLES } from "./layout";

const PX_W = 2048;
const PX_H = 768;

export function drawSilkscreen(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PX_W;
  c.height = PX_H;
  const ctx = c.getContext("2d")!;

  // 底色:深炭黑带细噪点
  ctx.fillStyle = "#17181a";
  ctx.fillRect(0, 0, PX_W, PX_H);
  for (let i = 0; i < 9000; i++) {
    const g = 20 + Math.random() * 18;
    ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
    ctx.fillRect(Math.random() * PX_W, Math.random() * PX_H, 1.4, 1.4);
  }

  const X = (u: number) => u * PX_W;
  const Y = (v: number) => v * PX_H; // 画布底部 = v=1(铰链侧,面板立起时的下沿)

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 分区标题 + 下划线
  ctx.fillStyle = "#e6e2d8";
  ctx.font = "600 30px 'Arial Narrow', Arial, sans-serif";
  for (const s of SECTION_TITLES) {
    const cx = (X(s.u0) + X(s.u1)) / 2;
    ctx.fillText(s.title, cx, Y(0.985));
    ctx.strokeStyle = "#e6e2d8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(s.u0) + 8, Y(0.955));
    ctx.lineTo(X(s.u1) - 8, Y(0.955));
    ctx.stroke();
  }

  // 分区竖直分隔线
  ctx.strokeStyle = "rgba(220,216,205,0.35)";
  ctx.lineWidth = 2;
  for (const s of SECTION_TITLES.slice(0, -1)) {
    ctx.beginPath();
    ctx.moveTo(X(s.u1) + 8, Y(1.0));
    ctx.lineTo(X(s.u1) + 8, Y(0.02));
    ctx.stroke();
  }

  // 振荡器组:三列顶部标注 OSC-3 / OSC-2 / OSC-1
  ctx.font = "600 26px Arial, sans-serif";
  ctx.fillStyle = "#e6e2d8";
  OSC_COLUMN_U.forEach((u, i) => {
    ctx.fillText(`OSC-${3 - i}`, X(u), Y(0.905));
  });

  // 控件小字标签
  for (const l of LABELS) {
    ctx.fillStyle = "rgba(226,222,210,0.92)";
    ctx.font = `500 ${l.small ? 21 : 26}px Arial, sans-serif`;
    ctx.fillText(l.text, X(l.u), Y(l.v));
  }

  // 档位旋钮外圈刻度点
  for (const id of ["osc3Range", "osc2Range", "osc1Range", "osc3Wave", "osc2Wave", "osc1Wave"]) {
    const p = PLACEMENT_MAP.get(id);
    if (!p) continue;
    drawTicks(ctx, X(p.u), Y(p.v), 70, 6);
  }

  // 品牌区:自绘 AETHER 字标 + 小字 Model D(面板右下 = 铰链侧,立起时位于面板下沿)
  ctx.save();
  ctx.fillStyle = "#efece2";
  ctx.textAlign = "right";
  ctx.font = "300 52px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("A E T H E R", X(0.975), Y(0.94));
  ctx.font = "400 22px Arial, sans-serif";
  ctx.fillStyle = "#9a958a";
  ctx.fillText("Model D", X(0.975), Y(0.885));
  ctx.restore();

  // 左下装饰丝印(自由缘侧)
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "500 20px Arial, sans-serif";
  ctx.fillStyle = "rgba(226,222,210,0.55)";
  ctx.fillText("44 KEY · MONOPHONIC", X(0.02), Y(0.055));
  ctx.restore();

  return c;
}

/** 在档位旋钮外圈画刻度点(-135°..+135°,0° 朝上) */
function drawTicks(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number): void {
  ctx.fillStyle = "rgba(226,222,210,0.8)";
  const a0 = -Math.PI / 2 - (135 * Math.PI) / 180;
  const a1 = -Math.PI / 2 + (135 * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const SILKSCREEN_SIZE = { w: PX_W, h: PX_H };
