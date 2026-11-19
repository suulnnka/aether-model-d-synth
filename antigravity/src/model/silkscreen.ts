import * as THREE from "three";
import {
  CONTROL_PLACEMENTS,
  DIM,
  OVERLOAD_LED_POS,
  PHONES_JACK_POS,
  POWER_LED_POS,
  SECTIONS,
} from "./layout.ts";

const INK = "#e8e3d8";
const INK_DIM = "#a29d93";
const INK_FAINT = "rgba(232, 227, 216, 0.28)";
const AMBER = "#e8a33d";
const PANEL_BG = "#16171c";
const FONT = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

const PANEL_PX_W = 4096;
const PANEL_PX_H = Math.round((PANEL_PX_W * DIM.PANEL_D) / DIM.PANEL_W);
const PPM = PANEL_PX_W / DIM.PANEL_W;

function px(u: number): number {
  return (u + DIM.PANEL_W / 2) * PPM;
}

function py(v: number): number {
  return (1 - v / DIM.PANEL_D) * PANEL_PX_H;
}

function pm(m: number): number {
  return m * PPM;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    sizePx: number;
    weight?: number;
    color?: string;
    align?: CanvasTextAlign;
    trackingPx?: number;
  },
): void {
  const { sizePx, weight = 600, color = INK, align = "center", trackingPx = 0 } = opts;
  ctx.save();
  ctx.font = `${weight} ${sizePx}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";

  if (!trackingPx) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }

  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + trackingPx * Math.max(0, chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, y);
    cx += widths[i] + trackingPx;
  }
  ctx.restore();
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Converts normalized 0..1 dial value to canvas angle (225° start, 270° CW sweep). */
function dialCanvasAngle(t: number): number {
  // Canvas Y points down: 135° (bottom-left) clockwise +270° to 45° (bottom-right)
  return (135 * Math.PI) / 180 + t * ((270 * Math.PI) / 180);
}

function drawWaveGlyph(
  ctx: CanvasRenderingContext2D,
  kind: "triangle" | "tri_saw" | "sawtooth" | "rev_saw" | "pulse1" | "pulse2" | "pulse3",
  cx: number,
  cy: number,
  w: number,
): void {
  const h = w * 0.48;
  const l = cx - w / 2;
  const r = cx + w / 2;
  const t = cy - h / 2;
  const b = cy + h / 2;

  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  switch (kind) {
    case "triangle":
      ctx.moveTo(l, b);
      ctx.lineTo(cx, t);
      ctx.lineTo(r, b);
      break;
    case "tri_saw":
      ctx.moveTo(l, b);
      ctx.lineTo(cx - w * 0.14, t);
      ctx.lineTo(cx + w * 0.1, cy + h * 0.12);
      ctx.lineTo(r, t);
      ctx.lineTo(r, b);
      break;
    case "sawtooth":
      ctx.moveTo(l, b);
      ctx.lineTo(r, t);
      ctx.lineTo(r, b);
      break;
    case "rev_saw":
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(r, b);
      break;
    case "pulse1":
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(cx, t);
      ctx.lineTo(cx, b);
      ctx.lineTo(r, b);
      break;
    case "pulse2":
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(l + w * 0.28, t);
      ctx.lineTo(l + w * 0.28, b);
      ctx.lineTo(r, b);
      break;
    case "pulse3":
      ctx.moveTo(l, b);
      ctx.lineTo(l, t);
      ctx.lineTo(l + w * 0.14, t);
      ctx.lineTo(l + w * 0.14, b);
      ctx.lineTo(r, b);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function drawKnobTicks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusM: number,
  ticks: NonNullable<(typeof CONTROL_PLACEMENTS)[number]["ticks"]>,
): void {
  const innerR = pm(radiusM + 0.0022);
  const outerR = pm(radiusM + 0.0046);
  const labelR = pm(radiusM + 0.0076);

  ctx.save();
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = 2.4;

  if (ticks === "dial11") {
    for (let i = 0; i <= 10; i++) {
      const a = dialCanvasAngle(i / 10);
      const isMajor = i % 2 === 0;
      const r1 = innerR;
      const r2 = isMajor ? outerR + 3 : outerR - 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
      if (isMajor) {
        drawText(ctx, String(i), cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR, {
          sizePx: 15,
          weight: 500,
          color: INK_DIM,
        });
      }
    }
  } else if (ticks === "bipolar13") {
    const labels = [-5, -3, -1, 0, 1, 3, 5];
    for (let i = 0; i <= 10; i++) {
      const a = dialCanvasAngle(i / 10);
      const val = i - 5;
      const isMajor = val % 2 === 0 || Math.abs(val) === 5 || val === 0;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      ctx.lineTo(cx + Math.cos(a) * (isMajor ? outerR + 3 : outerR - 2), cy + Math.sin(a) * (isMajor ? outerR + 3 : outerR - 2));
      ctx.stroke();
      if (labels.includes(val) && val !== 0) {
        drawText(ctx, String(val), cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR, {
          sizePx: 14,
          weight: 500,
          color: INK_DIM,
        });
      } else if (val === 0) {
        drawText(ctx, "0", cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR, {
          sizePx: 15,
          weight: 700,
          color: AMBER,
        });
      }
    }
  } else if (ticks === "range6") {
    const items = ["LO", "32'", "16'", "8'", "4'", "2'"];
    for (let i = 0; i < items.length; i++) {
      const a = dialCanvasAngle(i / 5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      ctx.lineTo(cx + Math.cos(a) * (outerR + 2), cy + Math.sin(a) * (outerR + 2));
      ctx.stroke();
      drawText(ctx, items[i], cx + Math.cos(a) * (labelR + 5), cy + Math.sin(a) * (labelR + 5), {
        sizePx: 15,
        weight: 600,
        color: INK,
      });
    }
  } else if (ticks === "wave12" || ticks === "wave3") {
    const seq12: Array<"triangle" | "tri_saw" | "sawtooth" | "pulse1" | "pulse2" | "pulse3"> = [
      "triangle",
      "tri_saw",
      "sawtooth",
      "pulse1",
      "pulse2",
      "pulse3",
    ];
    const seq3: Array<"triangle" | "sawtooth" | "rev_saw" | "pulse1" | "pulse2" | "pulse3"> = [
      "triangle",
      "sawtooth",
      "rev_saw",
      "pulse1",
      "pulse2",
      "pulse3",
    ];
    const seq = ticks === "wave3" ? seq3 : seq12;
    for (let i = 0; i < seq.length; i++) {
      const a = dialCanvasAngle(i / 5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      ctx.lineTo(cx + Math.cos(a) * (outerR + 1), cy + Math.sin(a) * (outerR + 1));
      ctx.stroke();
      drawWaveGlyph(ctx, seq[i], cx + Math.cos(a) * (labelR + 7), cy + Math.sin(a) * (labelR + 7), 18);
    }
  }

  ctx.restore();
}

/**
 * Main Control Panel Silkscreen (4096px) — strictly AETHER · Model D,
 * zero third-party logos or trademarks.
 */
export function createPanelSilkscreenTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = PANEL_PX_W;
  canvas.height = PANEL_PX_H;
  const ctx = canvas.getContext("2d")!;

  // Base satin dark anodized faceplate
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, 0, PANEL_PX_W, PANEL_PX_H);

  // Subtle horizontal brushed texture lines
  ctx.strokeStyle = "rgba(255,255,255,0.015)";
  ctx.lineWidth = 1;
  for (let y = 0; y < PANEL_PX_H; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(PANEL_PX_W, y);
    ctx.stroke();
  }

  // Top header band + self-authored AETHER Model D geometric badge
  const bandY = py(0.164);
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(-0.264), py(0.153));
  ctx.lineTo(px(0.264), py(0.153));
  ctx.stroke();

  // Minimal geometric waveform crest (custom original emblem)
  const logoX = px(-0.252);
  ctx.save();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(logoX - 18, bandY + 10);
  ctx.lineTo(logoX - 6, bandY - 12);
  ctx.lineTo(logoX + 6, bandY + 12);
  ctx.lineTo(logoX + 18, bandY - 12);
  ctx.stroke();
  ctx.restore();

  drawText(ctx, "AETHER", px(-0.241), bandY, {
    sizePx: 34,
    weight: 800,
    color: INK,
    align: "left",
    trackingPx: 8,
  });
  drawText(ctx, "MODEL D", px(-0.181), bandY + 1, {
    sizePx: 22,
    weight: 600,
    color: AMBER,
    align: "left",
    trackingPx: 4,
  });
  drawText(ctx, "ANALOG MONOPHONIC SYNTHESIZER", px(-0.125), bandY + 1, {
    sizePx: 14,
    weight: 500,
    color: INK_DIM,
    align: "left",
    trackingPx: 3,
  });

  // Section divider lines and bottom titles
  for (let i = 0; i < SECTIONS.length; i++) {
    const sec = SECTIONS[i];
    if (i > 0) {
      ctx.strokeStyle = INK_FAINT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(sec.x0), py(0.151));
      ctx.lineTo(px(sec.x0), py(0.008));
      ctx.stroke();
    }
    if (sec.title) {
      drawText(ctx, sec.title, px(sec.center), py(0.011), {
        sizePx: 20,
        weight: 700,
        color: INK,
        trackingPx: 3.5,
      });
    }
  }

  // Modifiers recessed sub-frames: FILTER and LOUDNESS CONTOUR
  ctx.strokeStyle = "rgba(232,227,216,0.34)";
  ctx.lineWidth = 2;
  const fX = px(0.077);
  const fY = py(0.151);
  const fW = px(0.173) - fX;
  const fH = py(0.062) - fY;
  drawRoundRect(ctx, fX, fY, fW, fH, 10);
  ctx.stroke();

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(px(0.112), py(0.151) - 10, px(0.138) - px(0.112), 20);
  drawText(ctx, "FILTER", px(0.125), py(0.151), {
    sizePx: 14,
    weight: 700,
    color: AMBER,
    trackingPx: 2.5,
  });

  const lY = py(0.059);
  const lH = py(0.018) - lY;
  drawRoundRect(ctx, fX, lY, fW, lH, 10);
  ctx.stroke();

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(px(0.097), py(0.059) - 10, px(0.153) - px(0.097), 20);
  drawText(ctx, "LOUDNESS CONTOUR", px(0.125), py(0.059), {
    sizePx: 14,
    weight: 700,
    color: AMBER,
    trackingPx: 2,
  });

  // Static Oscillator 1 Frequency label (reference oscillator)
  drawText(ctx, "OSCILLATOR 1", px(-0.111), py(0.132) - 4, {
    sizePx: 17,
    weight: 700,
    color: INK,
    trackingPx: 1.5,
  });
  drawText(ctx, "REFERENCE", px(-0.111), py(0.132) + 18, {
    sizePx: 13,
    weight: 500,
    color: INK_DIM,
    trackingPx: 1.5,
  });

  // Draw all panel control ticks and labels
  for (const c of CONTROL_PLACEMENTS) {
    if (c.space !== "panel") continue;
    const cx = px(c.x);
    const cy = py(c.pos);

    if (c.ticks && c.radius) {
      drawKnobTicks(ctx, cx, cy, c.radius, c.ticks);
    }

    if (c.style.startsWith("rocker")) {
      drawText(ctx, c.silk, cx, cy - 38, {
        sizePx: 13,
        weight: 600,
        color: INK,
        trackingPx: 0.8,
      });
      if (c.subLabels) {
        if (c.style === "rocker-power") {
          drawText(ctx, c.subLabels[1], cx, cy + 38, {
            sizePx: 11,
            weight: 700,
            color: AMBER,
          });
        } else {
          drawText(ctx, c.subLabels[0], cx - 18, cy + 38, {
            sizePx: 10.5,
            weight: 500,
            color: INK_DIM,
            align: "right",
          });
          drawText(ctx, c.subLabels[1], cx + 18, cy + 38, {
            sizePx: 10.5,
            weight: 700,
            color: AMBER,
            align: "left",
          });
        }
      }
    } else {
      const labelOff = c.ticks === "wave12" || c.ticks === "wave3" || c.ticks === "range6" ? 98 : 88;
      drawText(ctx, c.silk, cx, cy + labelOff, {
        sizePx: 15,
        weight: 600,
        color: INK,
        trackingPx: 1,
      });
    }
  }

  // Jewel LEDs & Phones Jack legends
  drawText(ctx, "OVERLOAD", px(OVERLOAD_LED_POS.x), py(OVERLOAD_LED_POS.v) + 40, {
    sizePx: 13,
    weight: 700,
    color: "#e66b5b",
    trackingPx: 1.2,
  });
  drawText(ctx, "PILOT", px(POWER_LED_POS.x), py(POWER_LED_POS.v) + 38, {
    sizePx: 12,
    weight: 600,
    color: INK_DIM,
    trackingPx: 1,
  });
  drawText(ctx, "PHONES", px(PHONES_JACK_POS.x), py(PHONES_JACK_POS.v) + 44, {
    sizePx: 12,
    weight: 600,
    color: INK_DIM,
    trackingPx: 1,
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Left-hand controller strip silkscreen (LFO, Glide, Decay, Pitch & Mod Wheels).
 */
export function createSideStripSilkscreenTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 2048;
  const stripW = DIM.SIDE_X1 - DIM.SIDE_X0;
  const stripZ0 = 0.004;
  const stripZ1 = 0.168;
  const stripD = stripZ1 - stripZ0;

  const sx = (worldX: number) => ((worldX - DIM.SIDE_X0) / stripW) * w;
  const sy = (worldZ: number) => ((worldZ - stripZ0) / stripD) * h;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#17181d";
  ctx.fillRect(0, 0, w, h);

  // Border frame
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  for (const c of CONTROL_PLACEMENTS) {
    if (c.space !== "side") continue;
    const cx = sx(c.x);
    const cy = sy(c.pos);

    if (c.ticks && c.radius) {
      const rScale = w / stripW;
      const innerR = (c.radius + 0.0018) * rScale;
      const outerR = (c.radius + 0.0042) * rScale;
      ctx.strokeStyle = INK_DIM;
      ctx.lineWidth = 3;
      for (let i = 0; i <= 10; i++) {
        const a = dialCanvasAngle(i / 10);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
        ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
        ctx.stroke();
      }
      drawText(ctx, c.silk, cx, cy + outerR + 36, {
        sizePx: 30,
        weight: 600,
        color: INK,
        trackingPx: 2,
      });
    } else if (c.style.startsWith("rocker")) {
      drawText(ctx, c.silk, cx, cy - 68, {
        sizePx: 28,
        weight: 600,
        color: INK,
        trackingPx: 2,
      });
      if (c.subLabels) {
        drawText(ctx, c.subLabels[0], cx - 32, cy + 68, {
          sizePx: 22,
          weight: 500,
          color: INK_DIM,
          align: "right",
        });
        drawText(ctx, c.subLabels[1], cx + 32, cy + 68, {
          sizePx: 22,
          weight: 700,
          color: AMBER,
          align: "left",
        });
      }
    } else if (c.style === "wheel") {
      drawText(ctx, c.silk, cx, cy + 320, {
        sizePx: 32,
        weight: 700,
        color: INK,
        trackingPx: 3,
      });
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Rear brushed-aluminum jack plate silkscreen (visible when orbiting behind the synth!).
 */
export function createRearPlateTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 2048;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1b1c21";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(232,227,216,0.24)";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  drawText(ctx, "AETHER · MODEL D", 96, 98, {
    sizePx: 34,
    weight: 800,
    color: INK,
    align: "left",
    trackingPx: 6,
  });
  drawText(ctx, "SERIAL NO. AD-0427   ·   ANALOG SYNTHESIZER", 96, 152, {
    sizePx: 18,
    weight: 500,
    color: AMBER,
    align: "left",
    trackingPx: 2,
  });

  const jacks = [
    { x: 940, label: "MAIN OUT (HIGH)" },
    { x: 1135, label: "MAIN OUT (LOW)" },
    { x: 1330, label: "AUX FX SEND" },
    { x: 1525, label: "EXT AUDIO IN" },
    { x: 1720, label: "FILTER CV" },
    { x: 1900, label: "S-TRIG GATE" },
  ];
  for (const j of jacks) {
    drawText(ctx, j.label, j.x, 126, {
      sizePx: 16,
      weight: 600,
      color: INK_DIM,
      trackingPx: 1,
    });
  }

  drawText(ctx, "AC MAINS · 100-240V", 270, 316, {
    sizePx: 16,
    weight: 600,
    color: INK_DIM,
    trackingPx: 1.5,
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}
