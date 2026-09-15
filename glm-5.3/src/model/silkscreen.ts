/**
 * 面板丝印(MDL-3):Canvas 程序化绘制 —— 分区标题、控件名、刻度、波形图标。
 * 不含任何第三方商标;坐标全部来自 dimensions.ts 的布局表。
 */
import * as THREE from "three";
import { DIM, HALF_W, POS, ROW, SEC, SIDE } from "./dimensions";

const PPM = 3908; // 像素/米(2048 / 0.524)
const PANEL_W = 2048;
const PANEL_H = Math.ceil(DIM.panelD * PPM); // ≈ 801
const INK = "#d3ccbb";
const INK_DIM = "#9a958a";

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    align?: CanvasTextAlign;
    color?: string;
    weight?: string;
    spacing?: number;
    rotate?: number;
    family?: string;
  } = {},
): void {
  const {
    size = 20,
    align = "center",
    color = INK,
    weight = "600",
    spacing = 0,
    rotate = 0,
    family = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  } = opts;
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (spacing > 0) {
    // 手动字距
    const chars = [...str];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === "center" ? -total / 2 : align === "right" ? -total : 0;
    ctx.textAlign = "left";
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, 0);
      cx += widths[i] + spacing;
    }
  } else {
    ctx.fillText(str, 0, 0);
  }
  ctx.restore();
}

/** 面板局部坐标 → 画布像素 */
const px = (x: number) => (x + HALF_W) * PPM;
const py = (v: number) => v * PPM;

/** 控件下方的小标签 */
function label(ctx: CanvasRenderingContext2D, str: string, x: number, v: number, size = 17): void {
  text(ctx, str, px(x), py(v), { size, spacing: 0.6 });
}

/** 连续旋钮的刻度点(11 段) */
function tickRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  v: number,
  r: number,
  count = 11,
): void {
  const cx = px(x);
  const cy = py(v);
  ctx.save();
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (0.75 + (i / (count - 1)) * 1.5); // -135°..+135°
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx + c * r * PPM, cy + s * r * PPM);
    ctx.lineTo(cx + c * (r + 0.0032) * PPM, cy + s * (r + 0.0032) * PPM);
    ctx.stroke();
  }
  ctx.restore();
}

/** 档位旋钮周围的选项标记(角度均分,-150°..+150°) */
function stepRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  v: number,
  r: number,
  labels: string[],
  drawLabel: (ctx: CanvasRenderingContext2D, str: string, ax: number, ay: number, ang: number) => void,
): void {
  const cx = px(x);
  const cy = py(v);
  labels.forEach((str, i) => {
    const a = Math.PI * (0.75 - (i / (labels.length - 1)) * 1.5) - Math.PI / 2;
    // 从逆时针(左)到顺时针(右):面板上左 = 最小档
    const ang = Math.PI * 0.75 + (i / (labels.length - 1)) * 1.5;
    void a;
    const ax = cx + Math.cos(ang) * r * PPM;
    const ay = cy + Math.sin(ang) * r * PPM;
    drawLabel(ctx, str, ax, ay, ang);
  });
}

/** 波形小图标 */
function waveIcon(
  ctx: CanvasRenderingContext2D,
  kind: string,
  ax: number,
  ay: number,
): void {
  const w = 13;
  const h = 8;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (kind === "triangle") {
    ctx.moveTo(ax - w, ay + h / 2);
    ctx.lineTo(ax - w / 2, ay - h / 2);
    ctx.lineTo(ax + w / 2, ay + h / 2);
    ctx.lineTo(ax + w, ay - h / 2);
  } else if (kind === "sawtooth" || kind === "rev-saw") {
    const dir = kind === "sawtooth" ? 1 : -1;
    ctx.moveTo(ax - dir * w, ay + h / 2);
    ctx.lineTo(ax - dir * w / 2, ay - h / 2);
    ctx.lineTo(ax - dir * w / 2, ay + h / 2);
    ctx.lineTo(ax + dir * w / 2, ay - h / 2);
    ctx.lineTo(ax + dir * w / 2, ay + h / 2);
    ctx.lineTo(ax + dir * w, ay - h / 2);
  } else if (kind === "square") {
    ctx.moveTo(ax - w, ay + h / 2);
    ctx.lineTo(ax - w, ay - h / 2);
    ctx.lineTo(ax, ay - h / 2);
    ctx.lineTo(ax, ay + h / 2);
    ctx.lineTo(ax + w, ay + h / 2);
    ctx.lineTo(ax + w, ay - h / 2);
  } else {
    // pulse(宽/窄)
    const duty = kind === "pulse-wide" ? 0.5 : 0.22;
    const x1 = ax - w + (1 - duty) * w;
    ctx.moveTo(ax - w, ay + h / 2);
    ctx.lineTo(ax - w, ay - h / 2);
    ctx.lineTo(x1, ay - h / 2);
    ctx.lineTo(x1, ay + h / 2);
    ctx.lineTo(ax + w, ay + h / 2);
    ctx.lineTo(ax + w, ay - h / 2);
  }
  ctx.stroke();
  ctx.restore();
}

const WAVE_ORDER = ["triangle", "sawtooth", "rev-saw", "square", "pulse-wide", "pulse-narrow"];
const RANGE_LABELS = ["LO", "32", "16", "8", "4", "2"];

/** 控制面板主丝印贴图 */
export function panelSilkscreen(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = PANEL_W;
  c.height = PANEL_H;
  const ctx = c.getContext("2d")!;

  /* ---- 分区标题(底部标题带) ---- */
  const titleY = py(ROW.title);
  const secTitle = (str: string, x0: number, x1: number) =>
    text(ctx, str, (px(x0) + px(x1)) / 2, titleY, { size: 22, spacing: 2.4 });
  secTitle("CONTROLLERS", SEC.controllers[0], SEC.controllers[1]);
  secTitle("OSCILLATOR BANK", SEC.osc[0], SEC.osc[1]);
  secTitle("MIXER", SEC.colC_mixer[0] + 0.012, SEC.colC_mixer[1]);
  secTitle("MODIFIERS", SEC.colD_mod[0] + 0.012, SEC.colD_mod[1]);
  secTitle("OUTPUT", SEC.output[0] + 0.004, SEC.output[1]);

  /* ---- MODIFIERS 两个丝印子框 ---- */
  const box = (x0: number, v0: number, x1: number, v1: number) => {
    ctx.save();
    ctx.strokeStyle = INK_DIM;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px(x0), py(v0), (x1 - x0) * PPM, (v1 - v0) * PPM);
    ctx.restore();
  };
  // FILTER 框:6 旋钮
  box(0.098, 0.014, 0.196, 0.126);
  text(ctx, "FILTER", (px(0.098) + px(0.196)) / 2, py(0.0255), { size: 19, spacing: 3 });
  // LOUDNESS CONTOUR 框:3 旋钮
  box(0.1, 0.132, 0.194, 0.174);
  text(ctx, "LOUDNESS CONTOUR", (px(0.1) + px(0.194)) / 2, py(0.1415), { size: 16, spacing: 1.6 });

  /* ---- CONTROLLERS ---- */
  label(ctx, "TUNE", POS.tune.x, ROW.r1 + 0.021);
  tickRing(ctx, POS.tune.x, ROW.r1, 0.0155);
  label(ctx, "GLIDE", POS.glideTime.x, ROW.r2 + 0.021, 15);
  tickRing(ctx, POS.glideTime.x, ROW.r2, 0.0145);
  label(ctx, "MOD. MIX", POS.modMix.x, ROW.r2 + 0.021, 15);
  tickRing(ctx, POS.modMix.x, ROW.r2, 0.0145);
  // 源 A/B 拨杆的两档丝印
  text(ctx, "OSC.3", px(POS.srcA.x) - 16, py(ROW.r3 + 0.012), { size: 13 });
  text(ctx, "FILT. EG", px(POS.srcA.x) + 24, py(ROW.r3 + 0.012), { size: 13 });
  text(ctx, "NOISE", px(POS.srcB.x) - 16, py(ROW.r3 + 0.012), { size: 13 });
  text(ctx, "LFO", px(POS.srcB.x) + 16, py(ROW.r3 + 0.012), { size: 13 });

  /* ---- 交界柱 A/B ---- */
  text(ctx, "OSC. MOD", px(SEC.colAB[0] + 0.01), py(ROW.r1 - 0.019), {
    size: 13, rotate: -Math.PI / 2, spacing: 1,
  });
  text(ctx, "ON", px(POS.oscMod.x), py(ROW.r1 + 0.017), { size: 13 });
  text(ctx, "OSC-3", px(SEC.colAB[0] + 0.01), py(ROW.r3 - 0.019), {
    size: 13, rotate: -Math.PI / 2, spacing: 1,
  });
  text(ctx, "CTL", px(SEC.colAB[0] + 0.0175), py(ROW.r3 - 0.019), {
    size: 13, rotate: -Math.PI / 2, spacing: 1,
  });
  text(ctx, "ON", px(POS.osc3Control.x), py(ROW.r3 + 0.017), { size: 13 });

  /* ---- OSCILLATOR BANK ---- */
  for (let n = 1; n <= 3; n++) {
    const v = n === 1 ? ROW.r1 : n === 2 ? ROW.r2 : ROW.r3;
    text(ctx, `OSCILLATOR-${n}`, px(SEC.osc[0] + 0.004), py(v - 0.0185), {
      size: 13, align: "left", spacing: 0.8,
    });
    // Range 档位环
    stepRing(ctx, POS.oscRange(n).x, v, 0.0235, RANGE_LABELS, (g, str, ax, ay, ang) => {
      text(g, str, ax, ay, { size: 14 });
      void ang;
    });
    // Frequency 刻度
    tickRing(ctx, POS.oscFreq(n).x, v, 0.0155);
    // Waveform 波形图标环
    stepRing(ctx, POS.oscWave(n).x, v, 0.0235, WAVE_ORDER, (g, str, ax, ay) => {
      waveIcon(g, str, ax, ay);
    });
  }

  /* ---- MIXER ---- */
  for (let n = 1; n <= 3; n++) {
    const v = n === 1 ? ROW.r1 : n === 2 ? ROW.r2 : ROW.r3;
    text(ctx, "ON", px(POS.oscOn(n).x), py(v + 0.016), { size: 12 });
    tickRing(ctx, POS.oscVol(n).x, v, 0.0145);
  }
  label(ctx, "EXT IN", POS.extVol.x, ROW.r1 + 0.021, 14);
  tickRing(ctx, POS.extVol.x, ROW.r1, 0.0145);
  text(ctx, "ON", px(POS.extOn.x), py(ROW.r1 + 0.016), { size: 12 });
  label(ctx, "NOISE", POS.noiseVol.x, ROW.r3 + 0.021, 14);
  tickRing(ctx, POS.noiseVol.x, ROW.r3, 0.0145);
  text(ctx, "ON", px(POS.noiseOn.x), py(ROW.r3 + 0.016), { size: 12 });
  text(ctx, "W", px(POS.noiseType.x) - 9, py(ROW.r2 - 0.011), { size: 12 });
  text(ctx, "P", px(POS.noiseType.x) + 9, py(ROW.r2 - 0.011), { size: 12 });
  text(ctx, "WHITE / PINK", px(POS.noiseType.x), py(ROW.r2 + 0.016), { size: 11 });
  text(ctx, "OVERLOAD", px(POS.overload.x + 0.002), py(ROW.v0 - 0.001), { size: 11, color: "#d86a55" });

  /* ---- 交界柱 D ---- */
  text(ctx, "FILTER MOD", px(SEC.colD_mod[0] + 0.008), py(ROW.r1 - 0.019), {
    size: 12, rotate: -Math.PI / 2, spacing: 0.8,
  });
  text(ctx, "ON", px(POS.filterMod.x), py(ROW.r1 + 0.017), { size: 13 });
  text(ctx, "KEYBOARD CONTROL", px(SEC.colD_mod[0] + 0.008), py(ROW.r2 + 0.014), {
    size: 12, rotate: -Math.PI / 2, spacing: 0.8,
  });
  text(ctx, "1", px(POS.kc1.x), py(ROW.r2 + 0.017), { size: 14 });
  text(ctx, "ON", px(POS.kc1.x) - 15, py(ROW.r2 + 0.017), { size: 11 });
  text(ctx, "2", px(POS.kc2.x), py(ROW.r3 + 0.017), { size: 14 });
  text(ctx, "ON", px(POS.kc2.x) - 15, py(ROW.r3 + 0.017), { size: 11 });

  /* ---- MODIFIERS 旋钮标签 ---- */
  label(ctx, "CUTOFF FREQ.", POS.cutoff.x, ROW.r1 - 0.024, 13);
  label(ctx, "EMPHASIS", POS.emphasis.x, ROW.r1 - 0.024, 13);
  label(ctx, "CONTOUR AMT.", POS.contour.x, ROW.r1 - 0.024, 13);
  label(ctx, "ATTACK", POS.filtA.x, ROW.r2 + 0.024, 12);
  label(ctx, "DECAY", POS.filtD.x, ROW.r2 + 0.024, 12);
  label(ctx, "SUSTAIN", POS.filtS.x, ROW.r2 + 0.024, 12);
  label(ctx, "ATTACK", POS.loudA.x, ROW.r3 + 0.024, 12);
  label(ctx, "DECAY", POS.loudD.x, ROW.r3 + 0.024, 12);
  label(ctx, "SUSTAIN", POS.loudS.x, ROW.r3 + 0.024, 12);
  tickRing(ctx, POS.cutoff.x, ROW.r1, 0.0155);
  tickRing(ctx, POS.emphasis.x, ROW.r1, 0.0155);
  tickRing(ctx, POS.contour.x, ROW.r1, 0.0155);
  tickRing(ctx, POS.filtA.x, ROW.r2, 0.0155);
  tickRing(ctx, POS.filtD.x, ROW.r2, 0.0155);
  tickRing(ctx, POS.filtS.x, ROW.r2, 0.0155);
  tickRing(ctx, POS.loudA.x, ROW.r3, 0.0155);
  tickRing(ctx, POS.loudD.x, ROW.r3, 0.0155);
  tickRing(ctx, POS.loudS.x, ROW.r3, 0.0155);

  /* ---- OUTPUT ---- */
  label(ctx, "MAIN OUTPUT", POS.volume.x, ROW.r1 - 0.024, 13);
  tickRing(ctx, POS.volume.x, ROW.r1, 0.0155);
  text(ctx, "A-440", px(POS.a440.x), py(ROW.r2 - 0.019), { size: 12 });
  text(ctx, "ON", px(POS.tunerOn.x), py(ROW.r2 + 0.016), { size: 12 });
  text(ctx, "POWER", px(POS.power.x), py(ROW.r2 + 0.016), { size: 11, rotate: -Math.PI / 2 });
  text(ctx, "ON", px(POS.powerLed.x), py(ROW.r2 + 0.016), { size: 10 });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 键盘左侧边条丝印(黑色条:LFO Rate / 波形开关 / Glide / Decay / 双轮) */
export function sideStripSilkscreen(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // 局部映射:x ∈ [SIDE.x0, SIDE.x1], z ∈ [SIDE.z0, SIDE.z1](铰链侧在上)
  const sx = (x: number) => ((x - SIDE.x0) / (SIDE.x1 - SIDE.x0)) * w;
  const sy = (z: number) => ((z - SIDE.z0) / (SIDE.z1 - SIDE.z0)) * h;

  text(ctx, "LFO RATE", sx(SIDE.lfoRate.x), sy(SIDE.lfoRate.z + 0.02), { size: 21, spacing: 1.4 });
  text(ctx, "LFO", sx(-0.262 + 0.011), sy(SIDE.lfoWave.z), { size: 16, rotate: -Math.PI / 2 });
  text(ctx, "ON", sx(SIDE.glide.x), sy(SIDE.glide.z + 0.016), { size: 14 });
  text(ctx, "GLIDE", sx(SIDE.glide.x - 0.019), sy(SIDE.glide.z), { size: 15, rotate: -Math.PI / 2 });
  text(ctx, "ON", sx(SIDE.decay.x), sy(SIDE.decay.z + 0.016), { size: 14 });
  text(ctx, "DECAY", sx(SIDE.decay.x + 0.021), sy(SIDE.decay.z), { size: 15, rotate: -Math.PI / 2 });
  text(ctx, "PITCH", sx(SIDE.pitchWheel.x), sy(SIDE.pitchWheel.z + 0.024), { size: 13 });
  text(ctx, "MOD.", sx(SIDE.modWheel.x), sy(SIDE.modWheel.z + 0.024), { size: 13 });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
