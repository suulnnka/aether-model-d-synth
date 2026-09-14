/**
 * Geometry layout — the single factual source for *where everything is*.
 *
 * Nothing downstream invents a coordinate. The mesh factory, the silkscreen
 * painter and the raycast picker all read the placements computed here, so a
 * knob can never be drawn in one place, painted in another and be clickable in
 * a third (PRD ST-1 applied to geometry).
 *
 * Units are metres, and the instrument is modelled at true scale so perspective
 * and depth of field behave (PRD 5.4).
 *
 * ---------------------------------------------------------------------------
 * A note on the overall width
 * ---------------------------------------------------------------------------
 * PRD 5.4 states "整机宽约 0.56m". That figure cannot be reconciled with the
 * same section's "按真实乐器比例建模" plus §6.5's 44-key F2–C6 keyboard: 44 keys
 * from F2 to C6 contain 26 white keys, and a standard white key is 23.5 mm
 * wide, so the key bed alone measures 26 × 23.5 mm = 611 mm before any cheek.
 * Adding the left cheek that houses the pitch/mod wheels and the right cheek
 * gives ~724 mm, which is the real-world dimension of instruments of this
 * family. The physical constraint wins: we take "按真实乐器比例" as normative
 * and treat the 0.56 m figure as an error in the PRD. See BODY_WIDTH below.
 */

import {
  CONTROL_SPECS,
  OSC_COLUMN_ORDER,
  type AnySpec,
  type SectionId,
} from '../state/specs.ts';

/* ===========================================================================
 * Cabinet
 * ========================================================================= */

/** 26 white keys x 23.5 mm — forced by the F2..C6 keyboard. */
export const KEY_BED_WIDTH = 0.611;
/**
 * Front-left area of the deck. On instruments of this family it is the only
 * place the two performance wheels can live, so it is sized to hold them.
 */
export const LEFT_CHEEK_WIDTH = 0.074;
/** Right end margin beside the keyboard. */
export const RIGHT_CHEEK_WIDTH = 0.039;

export const BODY_WIDTH = KEY_BED_WIDTH + LEFT_CHEEK_WIDTH + RIGHT_CHEEK_WIDTH;

/** Thickness of the wooden end panels themselves (distinct from cheek width). */
export const CASE_WOOD_THICKNESS = 0.019;
/** Clear span between the two wooden ends — the widest the panel can be. */
export const CASE_INNER_WIDTH = BODY_WIDTH - CASE_WOOD_THICKNESS * 2;

/** Cabinet-local Z: 0 is the hinge line, +Z is toward the player. */
export const Z_HINGE = 0;
/** Front of the key bed (key length + a front lip). */
export const Z_KEY_FRONT = 0.158;
/** Rear of the cabinet, where the hinged panel ends. */
export const Z_BACK = -0.25;

export const BODY_DEPTH = Z_KEY_FRONT - Z_BACK;
/** Vertical middle of the body, used to centre the group in the scene. */
export const BODY_CENTRE_Z = (Z_KEY_FRONT + Z_BACK) / 2;

/** Top of the keyboard deck: the plane the panel is flush with at 0°. */
export const KEY_DECK_Y = 0.086;
/** Floor of the key recess — keys sit here, their tops level with the deck. */
export const KEY_RECESS_FLOOR_Y = 0.07;
/** Bottom slab of the cabinet. */
export const CASE_BASE_Y = 0.055;

/** Key recess bounds, inset from the key bed so a frame rail shows. */
export const KEY_RECESS_MARGIN = 0.005;

/* ===========================================================================
 * Hinged control panel
 * ========================================================================= */

/**
 * Panel is slightly narrower than the clear span between the wooden ends so it
 * never intersects the cheeks as it swings (PRD HINGE-1).
 */
export const PANEL_W = 0.682;
export const PANEL_DEPTH = 0.25;
export const PANEL_THICK = 0.018;

/** Hinge travel (PRD HINGE-1). */
export const HINGE_MIN_DEG = 0;
export const HINGE_MAX_DEG = 60;
export const HINGE_DEFAULT_DEG = 50;

/* ===========================================================================
 * Interior cavity (PRD HINGE-5)
 * ========================================================================= */

/**
 * Ceiling for every part inside the cavity behind the hinge.
 *
 * At 0° the panel lies flat on the deck, so its top face is exactly KEY_DECK_Y
 * and the silkscreen plane floats 0.8 mm above that. Anything inside the cavity
 * that rises past this line therefore pokes through the closed panel and gets
 * drawn on the panel face as a bare patch of its own material. A 19 mm chip and
 * the board standoffs both used to do exactly that: the chip showed up as a
 * 72 px grey square in the 2D panel view, and 41 mm of chrome stood proud of the
 * panel whenever a user dragged the hinge shut. The headroom is what keeps the
 * panel opaque from every angle, including a low camera with the panel closed.
 */
export const INTERIOR_CEILING_Y = KEY_DECK_Y - 0.0015;
/** Top of the interior floor slab; board standoffs stand on it. */
export const INTERIOR_FLOOR_Y = CASE_BASE_Y + 0.004;
/** Upper face of the interior board; the chips sit on it. */
export const INTERIOR_BOARD_TOP_Y = CASE_BASE_Y + 0.018;

/** Decorative chips on the interior board: [cx, cz, width, depth, height]. */
export const INTERIOR_CHIPS = [
  [-0.15, -0.09, 0.05, 0.028, 0.013],
  [0.11, -0.13, 0.034, 0.034, 0.019],
  [0.02, -0.055, 0.062, 0.021, 0.009],
] as const;

/** Top face of an interior chip, capped so the closed panel always hides it. */
export function interiorChipTopY(authoredHeight: number): number {
  return Math.min(INTERIOR_BOARD_TOP_Y + authoredHeight, INTERIOR_CEILING_Y);
}

/** Decorative board standoffs (the P2 "struts"): positions, section and tilt. */
export const STRUT_XS = [-0.25, 0.25] as const;
export const STRUT_RADIUS = 0.0034;
/** Tilt about x, in radians. */
export const STRUT_TILT_RAD = -0.72;
/** Standoff z, relative to the hinge line. */
export const STRUT_Z = -0.155;

/** Vertical extent of a tilted standoff of the given length. */
export function interiorStrutExtentY(length: number): number {
  return (
    length * Math.abs(Math.cos(STRUT_TILT_RAD)) +
    2 * STRUT_RADIUS * Math.abs(Math.sin(STRUT_TILT_RAD))
  );
}

/**
 * Longest standoff that still fits between the cavity floor and the ceiling.
 *
 * A rigid strut cannot both prop the raised panel and hide under the closed one
 * — shutting the panel sweeps the entire cavity — so the standoffs are derived
 * from the headroom instead of authored: move INTERIOR_CEILING_Y and they re-fit
 * themselves.
 */
export function interiorStrutLength(): number {
  return (
    (INTERIOR_CEILING_Y -
      INTERIOR_FLOOR_Y -
      2 * STRUT_RADIUS * Math.abs(Math.sin(STRUT_TILT_RAD))) /
    Math.abs(Math.cos(STRUT_TILT_RAD))
  );
}

/** Centre height that seats a standoff of `length` on the cavity floor. */
export function interiorStrutY(length: number = interiorStrutLength()): number {
  return INTERIOR_FLOOR_Y + interiorStrutExtentY(length) / 2;
}

/* ===========================================================================
 * Control footprint
 * ========================================================================= */

export const KNOB_RADIUS = 0.0085;
export const KNOB_HEIGHT = 0.0115;
export const SELECTOR_RADIUS = 0.0105;
export const SELECTOR_HEIGHT = 0.0105;
/** Lever switch: a small chrome bat on a collared base. */
export const SWITCH_BASE_RADIUS = 0.0052;
export const SWITCH_BASE_HEIGHT = 0.0038;
export const SWITCH_LEVER_LENGTH = 0.0115;
export const SWITCH_TILT_DEG = 21;
/** Distance from a control's centre to the baseline of its silkscreen label. */
export const LABEL_OFFSET = 0.0165;

/**
 * How far a knob or selector turns across its full travel, and the sweep the
 * silkscreen dial is drawn over. Shared so the printed scale and the 3D pose
 * can never disagree (PRD ST-1).
 */
export const DIAL_SPAN_DEG = 270;

/** Wheel geometry (PRD 6.5 #37/#38). The disc lies in the ZY plane. */
export const WHEEL_RADIUS = 0.021;
export const WHEEL_THICKNESS = 0.016;
/** Total roll for a full travel of either wheel. */
export const WHEEL_SWEEP_RAD = 1.25;

/* ===========================================================================
 * Silkscreen canvas resolution (PRD VIEW-5 wants >= 2048 px)
 * ========================================================================= */

export const SILKSCREEN_WIDTH = 4096;
export const SILKSCREEN_HEIGHT = Math.round(
  (SILKSCREEN_WIDTH * PANEL_DEPTH) / PANEL_W,
);

/* ===========================================================================
 * Panel section bands
 * ========================================================================= */

const PANEL_MARGIN = 0.011;
const SECTION_GAP = 0.007;

/**
 * Column shares inside the panel. The oscillator bank and the modifiers take
 * the lion's share because they carry the density; Controllers is a single
 * column and Mixer is a single column (PRD 5.4 layout sketch).
 */
const SECTION_SHARES: Readonly<Record<SectionId, number>> = Object.freeze({
  controllers: 0.1145,
  oscillatorBank: 0.222,
  mixer: 0.0925,
  modifiers: 0.21,
});

export interface SectionBand {
  readonly id: SectionId;
  /** Panel-local x of the left edge, measured from the panel's left edge. */
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly centre: number;
}

function buildSectionBands(): readonly SectionBand[] {
  const order: readonly SectionId[] = [
    'controllers',
    'oscillatorBank',
    'mixer',
    'modifiers',
  ];
  const bands: SectionBand[] = [];
  let x = PANEL_MARGIN;
  for (const id of order) {
    const width = SECTION_SHARES[id];
    bands.push({ id, left: x, right: x + width, width, centre: x + width / 2 });
    x += width + SECTION_GAP;
  }
  return Object.freeze(bands);
}

export const SECTION_BANDS: readonly SectionBand[] = buildSectionBands();

export const SECTION_BAND_BY_ID: ReadonlyMap<SectionId, SectionBand> = new Map(
  SECTION_BANDS.map((band) => [band.id, band]),
);

/* ===========================================================================
 * Rows
 * ========================================================================= */

/** First control row, just behind the section titles. */
const ROW_Z_FIRST = 0.07;
/** Last control row, leaving a margin before the hinge barrel. */
const ROW_Z_LAST = 0.222;

/** Evenly spaced row positions across the panel's usable depth. */
function rowPositions(count: number): readonly number[] {
  if (count <= 1) return Object.freeze([(ROW_Z_FIRST + ROW_Z_LAST) / 2]);
  const step = (ROW_Z_LAST - ROW_Z_FIRST) / (count - 1);
  return Object.freeze(
    Array.from({ length: count }, (_, i) => ROW_Z_FIRST + i * step),
  );
}

/* ===========================================================================
 * Placement table
 * ========================================================================= */

export type LabelSide = 'above' | 'below' | 'none';

export interface Placement {
  readonly id: string;
  readonly spec: AnySpec;
  readonly section: SectionId;
  /** Panel-local x, 0 = panel centre. */
  readonly x: number;
  /** Panel-local z, 0 = rear edge, PANEL_DEPTH = hinge. */
  readonly z: number;
  /** Which side of the control its silkscreen text sits on. */
  readonly labelSide: LabelSide;
  /** Draw a graduated tick arc around this control. */
  readonly dial: boolean;
  /** Draw a small legend pair (on/off) rather than a value scale. */
  readonly legend: boolean;
}

/** Spread `count` items evenly across a band, returning panel-local x. */
function spread(band: SectionBand, count: number): readonly number[] {
  const step = band.width / count;
  return Array.from(
    { length: count },
    (_, i) => band.left + step * (i + 0.5) - PANEL_W / 2,
  );
}

interface RowPlan {
  /** Control ids, left to right. A null leaves an empty slot. */
  readonly ids: readonly (string | null)[];
  /** Index of the row, used to pick its z. */
  readonly row: number;
  /** Section-local tweaks: restrict the row to a sub-span of the band. */
  readonly span?: { readonly from: number; readonly width: number };
}

function bandFor(section: SectionId): SectionBand {
  const band = SECTION_BAND_BY_ID.get(section);
  if (!band) throw new Error(`No band for section ${section}`);
  return band;
}

/** Build the row plan for every panel-mounted control. */
function buildRowPlans(): readonly { section: SectionId; rows: readonly RowPlan[] }[] {
  const oscColumns = OSC_COLUMN_ORDER; // [3, 2, 1], left to right (PRD MDL-5)

  const oscillatorRows: RowPlan[] = [
    // Range selectors, one per column.
    { row: 0, ids: oscColumns.map((n) => `osc${n}Range`) },
    // Waveform selectors, one per column.
    { row: 1, ids: oscColumns.map((n) => `osc${n}Wave`) },
    // Frequency trims, one per column.
    { row: 2, ids: oscColumns.map((n) => `osc${n}Frequency`) },
    // Osc-3's Control switch sits under its own column (PRD 6.2 #15).
    { row: 3, ids: ['osc3Control', null, null] },
  ];

  const modifierRows: RowPlan[] = [
    { row: 0, ids: ['cutoff', 'emphasis', 'contourAmount'] },
    { row: 1, ids: ['filterMod', 'kc1', 'kc2'] },
    // The two contour rows share the left sub-span so the Volume column has a
    // slot of its own on the right (PRD 6.4 #35).
    {
      row: 2,
      ids: ['fAttack', 'fDecay', 'fSustain', 'fRelease'],
      span: { from: 0, width: MODIFIER_CONTOUR_WIDTH },
    },
    {
      row: 3,
      ids: ['lAttack', 'lDecay', 'lSustain', 'lRelease'],
      span: { from: 0, width: MODIFIER_CONTOUR_WIDTH },
    },
  ];

  return [
    {
      section: 'controllers',
      rows: [
        { row: 0, ids: ['glide'] },
        { row: 1, ids: ['modMix'] },
        { row: 2, ids: ['tune'] },
        { row: 3, ids: ['modulation', 'decay'] },
      ],
    },
    { section: 'oscillatorBank', rows: oscillatorRows },
    {
      section: 'mixer',
      rows: (['osc1Vol', 'osc2Vol', 'osc3Vol', 'noiseVol', 'extVol'] as const).map(
        (id, row) => ({ row, ids: [id] }),
      ),
    },
    { section: 'modifiers', rows: modifierRows },
  ];
}

/** Volume sits in its own right-hand slot beside the two contour rows. */
const VOLUME_ID = 'volume';
const MODIFIER_CONTOUR_WIDTH = 0.148;

function buildPlacements(): readonly Placement[] {
  const out: Placement[] = [];
  const seen = new Set<string>();

  const push = (
    spec: AnySpec,
    x: number,
    z: number,
    labelSide: LabelSide,
    dial: boolean,
    legend: boolean,
  ): void => {
    if (seen.has(spec.id)) throw new Error(`Duplicate placement: ${spec.id}`);
    seen.add(spec.id);
    out.push({ id: spec.id, spec, section: spec.section, x, z, labelSide, dial, legend });
  };

  for (const { section, rows } of buildRowPlans()) {
    const band = bandFor(section);
    const zs = rowPositions(rows.length);
    for (const plan of rows) {
      // A row may occupy a narrower sub-span of its band (the contour rows
      // leave room for the Volume column); otherwise it uses the whole band.
      const span = plan.span;
      const rowBand: SectionBand = span
        ? {
            id: band.id,
            left: band.left + span.from,
            right: band.left + span.from + span.width,
            width: span.width,
            centre: band.left + span.from + span.width / 2,
          }
        : band;

      // Empty slots keep their column so the remaining controls do not shuffle.
      const xs = spread(rowBand, plan.ids.length);

      plan.ids.forEach((id, i) => {
        if (id === null) return;
        const spec = CONTROL_SPECS.find((s) => s.id === id);
        if (!spec) throw new Error(`Unknown control in row plan: ${id}`);
        push(
          spec,
          xs[i],
          zs[plan.row],
          'below',
          spec.kind === 'knob' || spec.kind === 'selector',
          spec.kind === 'switch',
        );
      });
    }
  }

  // Volume gets the right-hand slot beside the contour rows.
  const modifiers = bandFor('modifiers');
  const volumeSpec = CONTROL_SPECS.find((s) => s.id === VOLUME_ID);
  if (!volumeSpec) throw new Error('Volume spec missing');
  const volumeX = modifiers.right - 0.03 - PANEL_W / 2;
  const modifierZs = rowPositions(4);
  push(
    volumeSpec,
    volumeX,
    (modifierZs[2] + modifierZs[3]) / 2,
    'below',
    true,
    false,
  );

  return Object.freeze(out);
}

/**
 * The panel-mounted placements. Order follows the section/row plan; lookups by
 * id go through PLACEMENT_BY_ID.
 */
export const PLACEMENTS: readonly Placement[] = buildPlacements();

export const PLACEMENT_BY_ID: ReadonlyMap<string, Placement> = new Map(
  PLACEMENTS.map((p) => [p.id, p]),
);

function placement(id: string): Placement {
  const found = PLACEMENT_BY_ID.get(id);
  if (!found) throw new Error(`No placement for control: ${id}`);
  return found;
}

/** Row z positions for the modifiers section, reused by the contour legend. */
export const MODIFIER_CONTOUR_SPAN = {
  left: bandFor('modifiers').left,
  width: MODIFIER_CONTOUR_WIDTH,
} as const;

export { placement };

/* ===========================================================================
 * Keyboard
 * ========================================================================= */

const PITCH_CLASS_WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);

/**
 * Offset of a black key's centre from the left edge of the white key it sits
 * after, in white-key widths. The classic asymmetric offsets — C# and F# lean
 * left of the seam, D# and A# lean right, G# is centred.
 */
const BLACK_KEY_OFFSET: Readonly<Record<number, number>> = Object.freeze({
  1: 0.95, // C#
  3: 1.05, // D#
  6: 0.9, // F#
  8: 1.0, // G#
  10: 1.1, // A#
});

export interface KeyPlacement {
  readonly midi: number;
  readonly black: boolean;
  /** Body-local x of the key centre. */
  readonly x: number;
  readonly width: number;
  /** Z extent, and its centre. */
  readonly zFront: number;
  readonly zBack: number;
  readonly zCentre: number;
  /** Top of the key at rest, in body-local Y. */
  readonly topY: number;
}

/** Half a semitone of slack so neighbouring keys never z-fight. */
const KEY_GAP = 0.0006;

function buildKeys(firstMidi: number, lastMidi: number): readonly KeyPlacement[] {
  const bedLeft = -BODY_WIDTH / 2 + LEFT_CHEEK_WIDTH;
  const whiteWidth = KEY_BED_WIDTH / 26;

  const keys: KeyPlacement[] = [];
  let whiteIndex = 0;

  for (let midi = firstMidi; midi <= lastMidi; midi += 1) {
    const pc = midi % 12;
    const isWhite = PITCH_CLASS_WHITE.has(pc);
    if (isWhite) {
      const x = bedLeft + whiteIndex * whiteWidth + whiteWidth / 2;
      keys.push({
        midi,
        black: false,
        x,
        width: whiteWidth - KEY_GAP,
        zFront: Z_HINGE + 0.137,
        zBack: Z_HINGE + 0.003,
        zCentre: Z_HINGE + 0.07,
        topY: KEY_DECK_Y,
      });
      whiteIndex += 1;
      continue;
    }

    // A black key sits after the white key at index whiteIndex - 1.
    const offset = BLACK_KEY_OFFSET[pc] ?? 1;
    const x = bedLeft + (whiteIndex - 1 + offset) * whiteWidth;
    keys.push({
      midi,
      black: true,
      x,
      width: 0.0137 - KEY_GAP,
      zFront: Z_HINGE + 0.091,
      // Kept clear of the hinge line so a black key never fouls the panel edge.
      zBack: Z_HINGE + 0.001,
      zCentre: Z_HINGE + 0.046,
      topY: KEY_DECK_Y + 0.0095,
    });
  }

  return Object.freeze(keys);
}

export const KEYS: readonly KeyPlacement[] = buildKeys(41, 84);

export const KEY_BY_MIDI: ReadonlyMap<number, KeyPlacement> = new Map(
  KEYS.map((k) => [k.midi, k]),
);

/** How far a key sinks when pressed (PRD MDL-2). */
export const KEY_TRAVEL = 0.0055;

/* ===========================================================================
 * Performance wheels + power
 * ========================================================================= */

export const PITCH_WHEEL_ID = 'pitchWheel';
export const MOD_WHEEL_ID = 'modWheel';
export const POWER_ID = 'power';

/** Wheels live in the front-left channel of the deck, ahead of the keys. */
const WHEEL_CHEEK_LEFT = -BODY_WIDTH / 2;
export const PITCH_WHEEL_X = WHEEL_CHEEK_LEFT + 0.03;
export const MOD_WHEEL_X = WHEEL_CHEEK_LEFT + 0.06;
/** The channel sunk into the deck to house them. */
export const WHEEL_CHANNEL = Object.freeze({
  left: WHEEL_CHEEK_LEFT + CASE_WOOD_THICKNESS,
  right: WHEEL_CHEEK_LEFT + LEFT_CHEEK_WIDTH,
  back: Z_HINGE + 0.006,
  front: Z_HINGE + 0.143,
});
/** Wheel axes sit low so only the top third shows above the deck. */
export const WHEEL_AXIS_Y = KEY_DECK_Y - 0.0075;
export const WHEEL_AXIS_Z = Z_HINGE + 0.05;

/** Power rocker + pilot lamp on the left end cheek (PRD VIS-6, 6.5 #39). */
export const POWER_SWITCH_POS = {
  x: WHEEL_CHEEK_LEFT - 0.001,
  y: 0.03,
  z: Z_HINGE + 0.115,
} as const;
export const PILOT_LAMP_POS = {
  x: WHEEL_CHEEK_LEFT + 0.001,
  y: 0.045,
  z: Z_HINGE - 0.08,
} as const;

/** Brand plate sits on the rear strip of the panel, clear of the controls. */
export const BRAND_STRIP = {
  /** Panel-local z of the brand baseline, near the rear edge. */
  z: 0.032,
  titleSize: 0.0125,
} as const;

/** Section titles line the row just behind the first control row. */
export const SECTION_TITLE_Z = 0.05;

/** Hinge barrel radius, drawn across the panel's front edge. */
export const HINGE_BARREL_RADIUS = 0.005;
