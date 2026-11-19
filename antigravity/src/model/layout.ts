import type { ControlId } from "../state/types.ts";

/**
 * Physical dimensions (meters) for the Aether Model D 3D synthesizer.
 * Coordinate convention:
 *   +X = right (player's right)
 *   +Y = up
 *   +Z = front (toward the player)
 */
export const DIM = {
  W: 0.58,
  D: 0.365,
  CHEEK_T: 0.018,
  INNER_W: 0.544, // W - 2 * CHEEK_T
  CASE_H: 0.072,
  KEYBED_FLOOR_Y: 0.038,
  PANEL_W: 0.544,
  PANEL_D: 0.182,
  PANEL_THICK: 0.042,
  HINGE_Y: 0.078,
  HINGE_Z: -0.022,
  KEY_START_Z: 0.004,
  KEY_LEN: 0.158,
  KEY_TOP_Y: 0.064,
  SIDE_X0: -0.268,
  SIDE_X1: -0.19,
  KEY_X0: -0.184,
  KEY_X1: 0.264,
} as const;

export const KEY_MIDI_START = 48; // C3
export const KEY_COUNT = 44; // C3..G6 (26 white, 18 black)
export const WHITE_KEY_COUNT = 26;
export const WHITE_KEY_W = (DIM.KEY_X1 - DIM.KEY_X0) / WHITE_KEY_COUNT; // ~0.01723m
export const BLACK_KEY_W = WHITE_KEY_W * 0.58;
export const BLACK_KEY_LEN = DIM.KEY_LEN * 0.62;

export interface SectionBox {
  readonly id: string;
  readonly title?: string;
  readonly x0: number;
  readonly x1: number;
  readonly center: number;
}

const RAW_SECTIONS: Array<{ id: string; w: number; title?: string }> = [
  { id: "controllers", w: 0.072, title: "CONTROLLERS" },
  { id: "colAB", w: 0.02 },
  { id: "oscillators", w: 0.12, title: "OSCILLATOR BANK" },
  { id: "mixer", w: 0.106, title: "MIXER" },
  { id: "colD", w: 0.02 },
  { id: "modifiers", w: 0.102, title: "MODIFIERS" },
  { id: "output", w: 0.088, title: "OUTPUT" },
];

export const SECTIONS: readonly SectionBox[] = (() => {
  let cursor = -0.264;
  return RAW_SECTIONS.map((s) => {
    const box: SectionBox = {
      id: s.id,
      title: s.title,
      x0: cursor,
      x1: cursor + s.w,
      center: cursor + s.w / 2,
    };
    cursor += s.w;
    return box;
  });
})();

export function getSection(id: string): SectionBox {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown section: ${id}`);
  return found;
}

/** Panel-local row v coordinates (distance from hinge edge v = 0 upward toward v = PANEL_D). */
export const PANEL_ROW_V = [0.132, 0.082, 0.036] as const;

export type ControlVisualStyle =
  | "knob-lg"
  | "knob-md"
  | "knob-sm"
  | "step-knob"
  | "rocker-orange"
  | "rocker-blue"
  | "rocker-white"
  | "rocker-black"
  | "rocker-power"
  | "wheel";

export interface ControlPlacement {
  readonly id: ControlId;
  readonly space: "panel" | "side";
  readonly style: ControlVisualStyle;
  /** Panel-local u (x) or side-strip world x */
  readonly x: number;
  /** Panel-local v (from hinge) when space === "panel"; world z when space === "side" */
  readonly pos: number;
  /** Printed silkscreen label */
  readonly silk: string;
  /** Optional sub-labels [left/bottom, right/top] for rockers */
  readonly subLabels?: readonly [string, string];
  /** Tick ring config for knobs */
  readonly ticks?: "dial11" | "bipolar13" | "range6" | "wave12" | "wave3";
  readonly radius?: number;
}

export const CONTROL_PLACEMENTS: readonly ControlPlacement[] = [
  // ── CONTROLLERS ──────────────────────────────────────────────────
  {
    id: "masterTune",
    space: "panel",
    style: "knob-lg",
    x: -0.228,
    pos: PANEL_ROW_V[0],
    silk: "TUNE",
    ticks: "bipolar13",
    radius: 0.0092,
  },
  {
    id: "glideTime",
    space: "panel",
    style: "knob-md",
    x: -0.246,
    pos: PANEL_ROW_V[1],
    silk: "GLIDE",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "modMix",
    space: "panel",
    style: "knob-md",
    x: -0.21,
    pos: PANEL_ROW_V[1],
    silk: "MOD MIX",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "osc3FilterEgSwitch",
    space: "panel",
    style: "rocker-orange",
    x: -0.246,
    pos: PANEL_ROW_V[2],
    silk: "MOD 1",
    subLabels: ["OSC.3", "F. EG"],
  },
  {
    id: "noiseLfoSwitch",
    space: "panel",
    style: "rocker-orange",
    x: -0.21,
    pos: PANEL_ROW_V[2],
    silk: "MOD 2",
    subLabels: ["NOISE", "LFO"],
  },

  // ── BOUNDARY COLUMN A/B ──────────────────────────────────────────
  {
    id: "oscillatorModulationOn",
    space: "panel",
    style: "rocker-orange",
    x: -0.182,
    pos: PANEL_ROW_V[0],
    silk: "OSC MOD",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "osc3Control",
    space: "panel",
    style: "rocker-orange",
    x: -0.182,
    pos: PANEL_ROW_V[2],
    silk: "OSC.3 CTRL",
    subLabels: ["FREE", "ON"],
  },

  // ── OSCILLATOR BANK ──────────────────────────────────────────────
  {
    id: "osc1Range",
    space: "panel",
    style: "step-knob",
    x: -0.15,
    pos: PANEL_ROW_V[0],
    silk: "RANGE",
    ticks: "range6",
    radius: 0.0092,
  },
  {
    id: "osc1Waveform",
    space: "panel",
    style: "step-knob",
    x: -0.072,
    pos: PANEL_ROW_V[0],
    silk: "WAVEFORM",
    ticks: "wave12",
    radius: 0.0092,
  },
  {
    id: "osc2Range",
    space: "panel",
    style: "step-knob",
    x: -0.15,
    pos: PANEL_ROW_V[1],
    silk: "RANGE",
    ticks: "range6",
    radius: 0.0092,
  },
  {
    id: "osc2Frequency",
    space: "panel",
    style: "knob-lg",
    x: -0.111,
    pos: PANEL_ROW_V[1],
    silk: "OSCILLATOR 2",
    ticks: "bipolar13",
    radius: 0.0092,
  },
  {
    id: "osc2Waveform",
    space: "panel",
    style: "step-knob",
    x: -0.072,
    pos: PANEL_ROW_V[1],
    silk: "WAVEFORM",
    ticks: "wave12",
    radius: 0.0092,
  },
  {
    id: "osc3Range",
    space: "panel",
    style: "step-knob",
    x: -0.15,
    pos: PANEL_ROW_V[2],
    silk: "RANGE",
    ticks: "range6",
    radius: 0.0092,
  },
  {
    id: "osc3Frequency",
    space: "panel",
    style: "knob-lg",
    x: -0.111,
    pos: PANEL_ROW_V[2],
    silk: "OSCILLATOR 3",
    ticks: "bipolar13",
    radius: 0.0092,
  },
  {
    id: "osc3Waveform",
    space: "panel",
    style: "step-knob",
    x: -0.072,
    pos: PANEL_ROW_V[2],
    silk: "WAVEFORM",
    ticks: "wave3",
    radius: 0.0092,
  },

  // ── MIXER ────────────────────────────────────────────────────────
  {
    id: "osc1Enabled",
    space: "panel",
    style: "rocker-blue",
    x: -0.04,
    pos: PANEL_ROW_V[0],
    silk: "OSC 1",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "osc1Volume",
    space: "panel",
    style: "knob-md",
    x: -0.011,
    pos: PANEL_ROW_V[0],
    silk: "VOLUME",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "osc2Enabled",
    space: "panel",
    style: "rocker-blue",
    x: -0.04,
    pos: PANEL_ROW_V[1],
    silk: "OSC 2",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "osc2Volume",
    space: "panel",
    style: "knob-md",
    x: -0.011,
    pos: PANEL_ROW_V[1],
    silk: "VOLUME",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "osc3Enabled",
    space: "panel",
    style: "rocker-blue",
    x: -0.04,
    pos: PANEL_ROW_V[2],
    silk: "OSC 3",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "osc3Volume",
    space: "panel",
    style: "knob-md",
    x: -0.011,
    pos: PANEL_ROW_V[2],
    silk: "VOLUME",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "extEnabled",
    space: "panel",
    style: "rocker-blue",
    x: 0.016,
    pos: PANEL_ROW_V[0],
    silk: "EXT IN",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "extVolume",
    space: "panel",
    style: "knob-md",
    x: 0.042,
    pos: PANEL_ROW_V[0],
    silk: "EXT VOL",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "noiseType",
    space: "panel",
    style: "rocker-black",
    x: 0.042,
    pos: PANEL_ROW_V[1],
    silk: "NOISE",
    subLabels: ["WHT", "PNK"],
  },
  {
    id: "noiseEnabled",
    space: "panel",
    style: "rocker-blue",
    x: 0.016,
    pos: PANEL_ROW_V[2],
    silk: "NOISE",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "noiseVolume",
    space: "panel",
    style: "knob-md",
    x: 0.042,
    pos: PANEL_ROW_V[2],
    silk: "NOISE VOL",
    ticks: "dial11",
    radius: 0.008,
  },

  // ── BOUNDARY COLUMN D ────────────────────────────────────────────
  {
    id: "filterModulationOn",
    space: "panel",
    style: "rocker-orange",
    x: 0.064,
    pos: PANEL_ROW_V[0],
    silk: "FILT MOD",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "keyboardControl1",
    space: "panel",
    style: "rocker-orange",
    x: 0.064,
    pos: PANEL_ROW_V[1],
    silk: "KBD 1",
    subLabels: ["OFF", "1/3"],
  },
  {
    id: "keyboardControl2",
    space: "panel",
    style: "rocker-orange",
    x: 0.064,
    pos: PANEL_ROW_V[2],
    silk: "KBD 2",
    subLabels: ["OFF", "2/3"],
  },

  // ── MODIFIERS (FILTER & LOUDNESS CONTOUR) ────────────────────────
  {
    id: "filterCutoff",
    space: "panel",
    style: "knob-md",
    x: 0.092,
    pos: PANEL_ROW_V[0],
    silk: "CUTOFF",
    ticks: "bipolar13",
    radius: 0.0082,
  },
  {
    id: "filterEmphasis",
    space: "panel",
    style: "knob-md",
    x: 0.125,
    pos: PANEL_ROW_V[0],
    silk: "EMPHASIS",
    ticks: "dial11",
    radius: 0.0082,
  },
  {
    id: "filterContourAmount",
    space: "panel",
    style: "knob-md",
    x: 0.158,
    pos: PANEL_ROW_V[0],
    silk: "CONTOUR",
    ticks: "dial11",
    radius: 0.0082,
  },
  {
    id: "filterAttack",
    space: "panel",
    style: "knob-md",
    x: 0.092,
    pos: PANEL_ROW_V[1],
    silk: "ATTACK",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "filterDecay",
    space: "panel",
    style: "knob-md",
    x: 0.125,
    pos: PANEL_ROW_V[1],
    silk: "DECAY",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "filterSustain",
    space: "panel",
    style: "knob-md",
    x: 0.158,
    pos: PANEL_ROW_V[1],
    silk: "SUSTAIN",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "loudnessAttack",
    space: "panel",
    style: "knob-md",
    x: 0.092,
    pos: PANEL_ROW_V[2],
    silk: "ATTACK",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "loudnessDecay",
    space: "panel",
    style: "knob-md",
    x: 0.125,
    pos: PANEL_ROW_V[2],
    silk: "DECAY",
    ticks: "dial11",
    radius: 0.008,
  },
  {
    id: "loudnessSustain",
    space: "panel",
    style: "knob-md",
    x: 0.158,
    pos: PANEL_ROW_V[2],
    silk: "SUSTAIN",
    ticks: "dial11",
    radius: 0.008,
  },

  // ── OUTPUT ───────────────────────────────────────────────────────
  {
    id: "mainVolume",
    space: "panel",
    style: "knob-md",
    x: 0.194,
    pos: PANEL_ROW_V[0],
    silk: "VOLUME",
    ticks: "dial11",
    radius: 0.0082,
  },
  {
    id: "isMainActive",
    space: "panel",
    style: "rocker-blue",
    x: 0.224,
    pos: PANEL_ROW_V[0],
    silk: "MAIN OUT",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "powerOn",
    space: "panel",
    style: "rocker-power",
    x: 0.251,
    pos: PANEL_ROW_V[0],
    silk: "POWER",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "tunerOn",
    space: "panel",
    style: "rocker-blue",
    x: 0.21,
    pos: PANEL_ROW_V[1],
    silk: "A-440",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "effectsVolume",
    space: "panel",
    style: "knob-md",
    x: 0.194,
    pos: PANEL_ROW_V[2],
    silk: "AUX VOL",
    ticks: "dial11",
    radius: 0.0082,
  },
  {
    id: "auxOutputOn",
    space: "panel",
    style: "rocker-blue",
    x: 0.224,
    pos: PANEL_ROW_V[2],
    silk: "AUX FX",
    subLabels: ["BYP", "ON"],
  },

  // ── LEFT-HAND CONTROLLER STRIP ───────────────────────────────────
  {
    id: "lfoRate",
    space: "side",
    style: "knob-sm",
    x: -0.246,
    pos: 0.03,
    silk: "RATE",
    ticks: "dial11",
    radius: 0.0068,
  },
  {
    id: "lfoWaveform",
    space: "side",
    style: "rocker-black",
    x: -0.212,
    pos: 0.03,
    silk: "LFO",
    subLabels: ["TRI", "SQR"],
  },
  {
    id: "glideOn",
    space: "side",
    style: "rocker-white",
    x: -0.246,
    pos: 0.068,
    silk: "GLIDE",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "decaySwitchOn",
    space: "side",
    style: "rocker-white",
    x: -0.212,
    pos: 0.068,
    silk: "DECAY",
    subLabels: ["OFF", "ON"],
  },
  {
    id: "pitchWheel",
    space: "side",
    style: "wheel",
    x: -0.246,
    pos: 0.125,
    silk: "PITCH",
  },
  {
    id: "modWheel",
    space: "side",
    style: "wheel",
    x: -0.212,
    pos: 0.125,
    silk: "MOD",
  },
];

export const OVERLOAD_LED_POS = { x: 0.042, v: 0.162 } as const;
export const POWER_LED_POS = { x: 0.251, v: 0.082 } as const;
export const PHONES_JACK_POS = { x: 0.251, v: 0.036 } as const;

export interface KeySpec {
  readonly midi: number;
  readonly isBlack: boolean;
  readonly x: number;
  readonly whiteIndex: number;
}

export const KEY_SPECS: readonly KeySpec[] = (() => {
  const blackSet = new Set([1, 3, 6, 8, 10]);
  const list: KeySpec[] = [];
  let whiteIdx = 0;
  for (let i = 0; i < KEY_COUNT; i++) {
    const midi = KEY_MIDI_START + i;
    const isBlack = blackSet.has(midi % 12);
    const x = isBlack
      ? DIM.KEY_X0 + whiteIdx * WHITE_KEY_W
      : DIM.KEY_X0 + (whiteIdx + 0.5) * WHITE_KEY_W;
    list.push({ midi, isBlack, x, whiteIndex: whiteIdx });
    if (!isBlack) whiteIdx++;
  }
  return list;
})();
