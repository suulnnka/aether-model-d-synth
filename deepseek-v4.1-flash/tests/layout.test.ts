/**
 * Geometry layout invariants (PRD 5.4 / 6.x / ST-1).
 *
 * `layout.ts` is the single factual source for where every control and key
 * lives: the mesh factory, the silkscreen painter and the raycast picker all
 * read it. If it drifts, a control can be drawn in one place, painted in
 * another and be clickable in a third — which is precisely the failure mode
 * PRD ST-1 exists to prevent. These tests pin the numbers down.
 *
 * Everything here is pure arithmetic, so there is no renderer and no DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  BODY_WIDTH,
  CASE_BASE_Y,
  CASE_WOOD_THICKNESS,
  DIAL_SPAN_DEG,
  HINGE_DEFAULT_DEG,
  HINGE_MAX_DEG,
  HINGE_MIN_DEG,
  INTERIOR_BOARD_TOP_Y,
  INTERIOR_CEILING_Y,
  INTERIOR_CHIPS,
  INTERIOR_FLOOR_Y,
  KEY_BED_WIDTH,
  KEY_BY_MIDI,
  KEY_DECK_Y,
  KEYS,
  KEY_TRAVEL,
  KNOB_RADIUS,
  LEFT_CHEEK_WIDTH,
  MOD_WHEEL_ID,
  MOD_WHEEL_X,
  PANEL_DEPTH,
  PANEL_W,
  PITCH_WHEEL_ID,
  PITCH_WHEEL_X,
  POWER_ID,
  PLACEMENTS,
  PLACEMENT_BY_ID,
  RIGHT_CHEEK_WIDTH,
  SECTION_BANDS,
  SELECTOR_RADIUS,
  STRUT_RADIUS,
  STRUT_TILT_RAD,
  WHEEL_CHANNEL,
  interiorChipTopY,
  interiorStrutExtentY,
  interiorStrutLength,
  interiorStrutY,
} from '../src/model/layout.ts';
import { CONTROL_SPECS, KEY_RANGE, OSC_COLUMN_ORDER, SECTION_ORDER } from '../src/state/specs.ts';

const EPS = 1e-9;

/** The three controls that live on the cabinet rather than the hinged panel. */
const OFF_PANEL: readonly string[] = [PITCH_WHEEL_ID, MOD_WHEEL_ID, POWER_ID];

describe('cabinet width', () => {
  it('adds up from the key bed and the two cheeks', () => {
    expect(BODY_WIDTH).toBeCloseTo(
      KEY_BED_WIDTH + LEFT_CHEEK_WIDTH + RIGHT_CHEEK_WIDTH,
      12,
    );
  });

  it('cannot be the PRD\u2019s 0.56 m (44 keys force ~0.72 m)', () => {
    // 26 white keys x 23.5 mm = 611 mm. See the header note in layout.ts.
    expect(KEY_BED_WIDTH).toBeCloseTo(26 * 0.0235, 12);
    expect(BODY_WIDTH).toBeGreaterThan(0.7);
  });

  it('leaves the panel narrower than the clear span between the cheeks', () => {
    expect(PANEL_W).toBeLessThanOrEqual(BODY_WIDTH - CASE_WOOD_THICKNESS * 2);
  });
});

describe('section bands', () => {
  it('runs left to right in PRD order', () => {
    expect(SECTION_BANDS.map((b) => b.id)).toEqual([...SECTION_ORDER]);
  });

  it('never overlaps and always progresses rightward', () => {
    for (let i = 1; i < SECTION_BANDS.length; i += 1) {
      const prev = SECTION_BANDS[i - 1]!;
      const cur = SECTION_BANDS[i]!;
      expect(cur.left).toBeGreaterThan(prev.right);
      expect(cur.width).toBeGreaterThan(0);
      expect(cur.right).toBeCloseTo(cur.left + cur.width, 12);
      expect(cur.centre).toBeCloseTo(cur.left + cur.width / 2, 12);
    }
  });

  it('fills the panel exactly once margins and gaps are counted', () => {
    // PANEL_W is derived from the band shares, so the two must agree.
    const first = SECTION_BANDS[0]!;
    const last = SECTION_BANDS[SECTION_BANDS.length - 1]!;
    const span = last.right - first.left;
    expect(span).toBeLessThan(PANEL_W);
    expect(span).toBeGreaterThan(PANEL_W * 0.9);
  });

  it('keeps the band centres inside the panel', () => {
    for (const band of SECTION_BANDS) {
      expect(band.left).toBeGreaterThanOrEqual(0);
      expect(band.right).toBeLessThanOrEqual(PANEL_W + EPS);
    }
  });
});

describe('control placements', () => {
  it('covers every panel-mounted control exactly once', () => {
    const panel = CONTROL_SPECS.filter((s) => !OFF_PANEL.includes(s.id));
    expect(PLACEMENTS).toHaveLength(panel.length);
    expect(new Set(PLACEMENTS.map((p) => p.id)).size).toBe(PLACEMENTS.length);
    for (const s of panel) {
      expect(PLACEMENT_BY_ID.has(s.id)).toBe(true);
    }
  });

  it('leaves exactly the three off-panel controls unplaced', () => {
    const placed = new Set(PLACEMENTS.map((p) => p.id));
    const unplaced = CONTROL_SPECS.filter((s) => !placed.has(s.id)).map((s) => s.id);
    expect(unplaced.sort()).toEqual([...OFF_PANEL].sort());
  });

  it('keeps every control inside the panel footprint', () => {
    for (const p of PLACEMENTS) {
      expect(p.x).toBeGreaterThanOrEqual(-PANEL_W / 2 - EPS);
      expect(p.x).toBeLessThanOrEqual(PANEL_W / 2 + EPS);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(PANEL_DEPTH + EPS);
    }
  });

  it('places controls inside their own section band', () => {
    for (const p of PLACEMENTS) {
      const band = SECTION_BANDS.find((b) => b.id === p.section)!;
      const lo = band.left - PANEL_W / 2;
      const hi = band.right - PANEL_W / 2;
      expect(p.x).toBeGreaterThanOrEqual(lo - EPS);
      expect(p.x).toBeLessThanOrEqual(hi + EPS);
    }
  });

  it('never lets two controls collide', () => {
    for (let i = 0; i < PLACEMENTS.length; i += 1) {
      for (let j = i + 1; j < PLACEMENTS.length; j += 1) {
        const a = PLACEMENTS[i]!;
        const b = PLACEMENTS[j]!;
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        // Two controls share a slot only if they are far apart in x or in z.
        expect(dx > KNOB_RADIUS * 2.2 || dz > KNOB_RADIUS * 2.2).toBe(true);
      }
    }
  });

  it('orders the oscillator columns Osc-3 / Osc-2 / Osc-1, left to right', () => {
    const columns = OSC_COLUMN_ORDER.map((n) => PLACEMENT_BY_ID.get(`osc${n}Frequency`)!);
    for (let i = 1; i < columns.length; i += 1) {
      expect(columns[i]!.x).toBeGreaterThan(columns[i - 1]!.x);
    }
  });

  it('puts the envelope trims in ADSR order, left to right', () => {
    const filter = ['fAttack', 'fDecay', 'fSustain', 'fRelease'].map(
      (id) => PLACEMENT_BY_ID.get(id)!,
    );
    for (let i = 1; i < filter.length; i += 1) {
      expect(filter[i]!.x).toBeGreaterThan(filter[i - 1]!.x);
      expect(filter[i]!.z).toBeCloseTo(filter[i - 1]!.z, 12);
    }
    const loud = ['lAttack', 'lDecay', 'lSustain', 'lRelease'].map(
      (id) => PLACEMENT_BY_ID.get(id)!,
    );
    // The loudness contour sits in front of the filter contour.
    expect(loud[0]!.z).toBeGreaterThan(filter[0]!.z);
  });

  it('gives the volume knob its own column clear of both contour rows', () => {
    const volume = PLACEMENT_BY_ID.get('volume');
    if (!volume) throw new Error('volume placement missing');
    const contour = ['fAttack', 'fRelease', 'lAttack', 'lRelease'].map(
      (id) => PLACEMENT_BY_ID.get(id)!,
    );
    for (const c of contour) {
      expect(volume.x).toBeGreaterThan(c.x + SELECTOR_RADIUS);
    }
  });

  it('is frozen, so nothing downstream can mutate the source of truth', () => {
    expect(Object.isFrozen(PLACEMENTS)).toBe(true);
    expect(Object.isFrozen(SECTION_BANDS)).toBe(true);
    expect(Object.isFrozen(KEYS)).toBe(true);
  });
});

describe('keyboard geometry', () => {
  const whites = KEYS.filter((k) => !k.black);
  const blacks = KEYS.filter((k) => k.black);

  it('spans F2 (41) to C6 (84) with 44 keys', () => {
    expect(KEYS).toHaveLength(KEY_RANGE.lastMidi - KEY_RANGE.firstMidi + 1);
    expect(KEYS[0]!.midi).toBe(41);
    expect(KEYS[KEYS.length - 1]!.midi).toBe(84);
  });

  it('is 26 white and 18 black keys, ascending with no gaps', () => {
    expect(whites).toHaveLength(26);
    expect(blacks).toHaveLength(18);
    KEYS.forEach((k, i) => {
      expect(k.midi).toBe(41 + i);
    });
  });

  it('spaces the white keys evenly across the key bed', () => {
    const step = whites[1]!.x - whites[0]!.x;
    expect(step).toBeCloseTo(KEY_BED_WIDTH / 26, 9);
    for (let i = 1; i < whites.length; i += 1) {
      expect(whites[i]!.x - whites[i - 1]!.x).toBeCloseTo(step, 9);
    }
  });

  it('covers exactly the key bed width from first to last white key', () => {
    const span = whites[whites.length - 1]!.x - whites[0]!.x;
    expect(span).toBeCloseTo(KEY_BED_WIDTH - KEY_BED_WIDTH / 26, 9);
  });

  it('narrows every white key by the anti-z-fight gap', () => {
    const step = KEY_BED_WIDTH / 26;
    for (const k of whites) {
      expect(k.width).toBeLessThan(step);
      expect(k.width).toBeGreaterThan(step * 0.9);
    }
  });

  it('straddles each black key across the seam between two white keys', () => {
    for (const black of blacks) {
      const left = whites.filter((w) => w.x < black.x).pop();
      const right = whites.find((w) => w.x > black.x);
      if (!left || !right) throw new Error(`black key ${black.midi} outside the bed`);
      // Between the neighbouring white key centres...
      expect(black.x).toBeGreaterThan(left.x);
      expect(black.x).toBeLessThan(right.x);
      // ...and close to the seam, not adrift in the middle of a white key.
      const seam = (left.x + right.x) / 2;
      const step = right.x - left.x;
      expect(Math.abs(black.x - seam)).toBeLessThan(step * 0.15);
    }
  });

  it('raises black keys above the white ones and shortens their reach', () => {
    const whiteTop = whites[0]!.topY;
    for (const k of blacks) {
      expect(k.topY).toBeGreaterThan(whiteTop);
      expect(k.zBack).toBeGreaterThanOrEqual(0);
      expect(k.zFront).toBeLessThan(whites[0]!.zFront);
    }
  });

  it('keeps the black keys narrower than the white keys', () => {
    const whiteWidth = whites[0]!.width;
    for (const k of blacks) {
      expect(k.width).toBeLessThan(whiteWidth * 0.75);
    }
  });

  it('round-trips through the MIDI lookup table', () => {
    expect(KEY_BY_MIDI.size).toBe(KEYS.length);
    for (const k of KEYS) {
      expect(KEY_BY_MIDI.get(k.midi)).toBe(k);
    }
    expect(KEY_BY_MIDI.has(40)).toBe(false);
    expect(KEY_BY_MIDI.has(85)).toBe(false);
  });

  it('sinks a key by a visible but small amount', () => {
    expect(KEY_TRAVEL).toBeGreaterThan(0);
    expect(KEY_TRAVEL).toBeLessThan(0.01);
  });
});

describe('performance wheels', () => {
  it('places pitch to the left of mod', () => {
    expect(PITCH_WHEEL_X).toBeLessThan(MOD_WHEEL_X);
  });

  it('keeps both wheels inside the left cheek channel', () => {
    expect(PITCH_WHEEL_X).toBeGreaterThan(WHEEL_CHANNEL.left);
    expect(MOD_WHEEL_X).toBeLessThan(WHEEL_CHANNEL.right);
  });

  it('names them the way the layout exports them', () => {
    expect(MOD_WHEEL_ID).toBe('modWheel');
    expect(PITCH_WHEEL_ID).toBe('pitchWheel');
    expect(POWER_ID).toBe('power');
    expect(OFF_PANEL).toContain('pitchWheel');
    expect(OFF_PANEL).toContain('modWheel');
  });
});

describe('hinge + dial conventions', () => {
  it('keeps the default hinge angle inside the allowed range', () => {
    expect(HINGE_MIN_DEG).toBeLessThanOrEqual(HINGE_DEFAULT_DEG);
    expect(HINGE_DEFAULT_DEG).toBeLessThanOrEqual(HINGE_MAX_DEG);
    expect(HINGE_MIN_DEG).toBe(0);
  });

  it('uses a 270-degree dial, the classic single-turn sweep', () => {
    expect(DIAL_SPAN_DEG).toBe(270);
  });
});

describe('interior cavity stays under the closed panel', () => {
  // At 0° the panel is flush with the deck, so its top face is exactly
  // KEY_DECK_Y and the silkscreen plane floats just above that. Anything in the
  // cavity that rises past the ceiling is therefore drawn on the *panel* face as
  // a bare patch of its own material — a 19 mm chip once showed up as a 72 px
  // grey square in the 2D panel view. See INTERIOR_CEILING_Y.

  it('puts the ceiling below the closed panel face, and above the board', () => {
    expect(INTERIOR_CEILING_Y).toBeLessThan(KEY_DECK_Y);
    expect(INTERIOR_CEILING_Y).toBeGreaterThan(INTERIOR_BOARD_TOP_Y);
    expect(INTERIOR_BOARD_TOP_Y).toBeGreaterThan(INTERIOR_FLOOR_Y);
    expect(CASE_BASE_Y).toBeLessThanOrEqual(INTERIOR_FLOOR_Y);
  });

  it('caps every authored chip below the closed panel', () => {
    for (const chip of INTERIOR_CHIPS) {
      const topY = interiorChipTopY(chip[4]);
      expect(topY).toBeLessThanOrEqual(INTERIOR_CEILING_Y);
      expect(topY).toBeLessThan(KEY_DECK_Y);
    }
  });

  it('leaves the chips resting on the board, never under it', () => {
    for (const chip of INTERIOR_CHIPS) {
      expect(interiorChipTopY(chip[4])).toBeGreaterThan(INTERIOR_BOARD_TOP_Y);
    }
  });

  it('actually bites: the tallest authored chip exceeds the cap', () => {
    const tallest = Math.max(...INTERIOR_CHIPS.map((chip) => chip[4]));
    expect(INTERIOR_BOARD_TOP_Y + tallest).toBeGreaterThan(INTERIOR_CEILING_Y);
    expect(interiorChipTopY(tallest)).toBe(INTERIOR_CEILING_Y);
  });

  it('never lets an absurd chip through, whatever is authored', () => {
    expect(interiorChipTopY(10)).toBe(INTERIOR_CEILING_Y);
    expect(interiorChipTopY(0)).toBe(INTERIOR_BOARD_TOP_Y);
  });

  it('would have failed the old 19 mm chip', () => {
    // The geometry that produced the grey square: uncapped height, so the chip
    // topped out at 0.092 m against a deck at 0.086 m.
    expect(INTERIOR_BOARD_TOP_Y + 0.019).toBeGreaterThan(KEY_DECK_Y);
  });
});

describe('interior board standoffs', () => {
  const headroom = INTERIOR_CEILING_Y - INTERIOR_FLOOR_Y;

  it('fits inside the cavity once tilted', () => {
    const extent = interiorStrutExtentY(interiorStrutLength());
    const centre = interiorStrutY();
    expect(centre - extent / 2).toBeGreaterThanOrEqual(INTERIOR_FLOOR_Y - EPS);
    expect(centre + extent / 2).toBeLessThanOrEqual(INTERIOR_CEILING_Y + EPS);
  });

  it('stays clear of the closed panel face', () => {
    const top = interiorStrutY() + interiorStrutExtentY(interiorStrutLength()) / 2;
    expect(top).toBeLessThan(KEY_DECK_Y);
  });

  it('subtracts the end caps from the headroom', () => {
    const cos = Math.abs(Math.cos(STRUT_TILT_RAD));
    const sin = Math.abs(Math.sin(STRUT_TILT_RAD));
    const length = interiorStrutLength();
    expect(interiorStrutExtentY(length)).toBeCloseTo(length * cos + 2 * STRUT_RADIUS * sin, 12);
    // Fitting the shaft alone (L * |cos| = headroom) leaves the end caps proud,
    // which is why the length is solved rather than authored.
    expect(interiorStrutExtentY(headroom / cos)).toBeGreaterThan(headroom);
  });

  it('would have failed the old authored strut', () => {
    // The old geometry: a 115 mm rod centred at 0.082 m, tilted the same way.
    // It stood 41 mm proud of the closed panel.
    const oldTop = 0.082 + interiorStrutExtentY(0.115) / 2;
    expect(oldTop - KEY_DECK_Y).toBeGreaterThan(0.03);
  });
});
