/**
 * Cabinet: case, wooden ends, keyboard deck, wheel channel, back wall,
 * interior and the power hardware on the left end (PRD MDL-1, VIS-4, VIS-6).
 *
 * Shape of the box
 * ----------------
 * The case is a wedge. Its top is a flat deck at KEY_DECK_Y across the keyboard
 * section, and from the hinge line backward the wooden ends climb along the
 * control panel's factory incline, so at the default 50° pose the panel sits
 * *inside* the woodwork rather than floating above it. Lifting the panel exposes
 * a real cavity with a board and support struts inside (PRD HINGE-5).
 *
 * The deck is sunk in two places: a recess for the keys, and a channel in the
 * front-left for the two performance wheels, which is how the wheels end up
 * protruding only their top third above the surface.
 */

import * as THREE from 'three';
import {
  BODY_WIDTH,
  CASE_BASE_Y,
  CASE_INNER_WIDTH,
  CASE_WOOD_THICKNESS,
  HINGE_BARREL_RADIUS,
  HINGE_DEFAULT_DEG,
  INTERIOR_BOARD_TOP_Y,
  INTERIOR_CHIPS,
  KEY_DECK_Y,
  KEY_RECESS_FLOOR_Y,
  LEFT_CHEEK_WIDTH,
  PANEL_DEPTH,
  PILOT_LAMP_POS,
  POWER_SWITCH_POS,
  STRUT_RADIUS,
  STRUT_TILT_RAD,
  STRUT_XS,
  STRUT_Z,
  WHEEL_CHANNEL,
  Z_BACK,
  Z_HINGE,
  Z_KEY_FRONT,
  interiorChipTopY,
  interiorStrutLength,
  interiorStrutY,
} from './layout.ts';
import {
  chassisMaterial,
  chromeMaterial,
  collarMaterial,
  lampMaterial,
  pcbMaterial,
  woodMaterial,
} from './materials.ts';
import { buildSwitch, type ControlView } from './controls.ts';

/** How far the wooden ends rise above the deck at the front. */
const CHEEK_LIP = 0.004;
/** Floor of the wheel channel, below the wheel axles. */
const WHEEL_CHANNEL_FLOOR_Y = 0.058;

/** Key recess: keeps a rail of deck visible in front of and behind the keys. */
export const RECESS_BACK = Z_HINGE + 0.0015;
export const RECESS_FRONT = Z_HINGE + 0.142;

const INNER_LEFT = -BODY_WIDTH / 2 + CASE_WOOD_THICKNESS;
const INNER_RIGHT = BODY_WIDTH / 2 - CASE_WOOD_THICKNESS;
const KEY_LEFT = -BODY_WIDTH / 2 + LEFT_CHEEK_WIDTH;
const KEY_RIGHT = KEY_LEFT + 0.611;

/** Top of the cabinet's back edge, following the panel's factory incline. */
export const BACK_TOP_Y =
  KEY_DECK_Y +
  PANEL_DEPTH * Math.sin((HINGE_DEFAULT_DEG * Math.PI) / 180);

export interface CabinetParts {
  readonly root: THREE.Group;
  readonly powerView: ControlView;
  readonly lampMaterial: THREE.MeshStandardMaterial;
}

function box(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)),
    material,
  );
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build the wedge-shaped wooden end.
 *
 * The 2D profile is authored in (z, y) and extruded along X. ExtrudeGeometry
 * extrudes along +Z and the shape's x becomes geometry x, so the geometry is
 * rotated 90° about Y — which maps geometry x to world −z — and the profile is
 * therefore authored with x = −z.
 */
function cheekGeometry(): THREE.ExtrudeGeometry {
  const profile: readonly (readonly [number, number])[] = [
    [-Z_KEY_FRONT, 0],
    [-Z_BACK, 0],
    [-Z_BACK, BACK_TOP_Y],
    [-Z_HINGE, KEY_DECK_Y + CHEEK_LIP],
    [-Z_KEY_FRONT, KEY_DECK_Y + CHEEK_LIP],
  ];

  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i += 1) {
    shape.lineTo(profile[i][0], profile[i][1]);
  }
  shape.closePath();

  const bevel = 0.002;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: CASE_WOOD_THICKNESS - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export function buildCabinet(): CabinetParts {
  const root = new THREE.Group();
  root.name = 'cabinet';

  const chassis = chassisMaterial();
  const wood = woodMaterial();
  const deckY0 = CASE_BASE_Y;
  const deckY1 = KEY_DECK_Y;

  /* ------------------------------------------------------------ base slab */

  root.add(
    box(
      -BODY_WIDTH / 2,
      BODY_WIDTH / 2,
      0,
      CASE_BASE_Y,
      Z_KEY_FRONT,
      Z_BACK,
      chassis,
    ),
  );

  /* ---------------------------------------------------------------- deck */

  // Wheel channel: floor plus rails fore and aft.
  root.add(
    box(
      INNER_LEFT,
      KEY_LEFT,
      deckY0,
      WHEEL_CHANNEL_FLOOR_Y,
      WHEEL_CHANNEL.front,
      WHEEL_CHANNEL.back,
      chassis,
    ),
  );
  root.add(
    box(INNER_LEFT, KEY_LEFT, deckY0, deckY1, Z_KEY_FRONT, WHEEL_CHANNEL.front, chassis),
  );
  root.add(
    box(INNER_LEFT, KEY_LEFT, deckY0, deckY1, WHEEL_CHANNEL.back, Z_HINGE, chassis),
  );

  // Key recess: solid mass under the keys, rails in front and behind.
  root.add(
    box(
      KEY_LEFT,
      KEY_RIGHT,
      deckY0,
      KEY_RECESS_FLOOR_Y,
      RECESS_FRONT,
      RECESS_BACK,
      chassis,
    ),
  );
  root.add(box(KEY_LEFT, KEY_RIGHT, deckY0, deckY1, Z_KEY_FRONT, RECESS_FRONT, chassis));
  root.add(box(KEY_LEFT, KEY_RIGHT, deckY0, deckY1, RECESS_BACK, Z_HINGE, chassis));

  // Plain margin between the last key and the right wooden end.
  root.add(box(KEY_RIGHT, INNER_RIGHT, deckY0, deckY1, Z_KEY_FRONT, Z_HINGE, chassis));

  /* ------------------------------------------------------------- back wall */

  root.add(
    box(
      -BODY_WIDTH / 2,
      BODY_WIDTH / 2,
      CASE_BASE_Y,
      BACK_TOP_Y,
      Z_BACK,
      Z_BACK + 0.012,
      chassis,
    ),
  );

  /* ------------------------------------------------ interior (PRD HINGE-5) */

  root.add(
    box(
      INNER_LEFT,
      INNER_RIGHT,
      CASE_BASE_Y,
      CASE_BASE_Y + 0.004,
      Z_HINGE - PANEL_DEPTH - 0.004,
      Z_HINGE - 0.008,
      chassis,
    ),
  );

  root.add(
    box(
      INNER_LEFT + 0.03,
      INNER_RIGHT - 0.03,
      CASE_BASE_Y + 0.016,
      CASE_BASE_Y + 0.0182,
      Z_HINGE - PANEL_DEPTH - 0.008,
      Z_HINGE - 0.055,
      pcbMaterial(),
    ),
  );

  const chipMaterial = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.7,
    metalness: 0.1,
  });
  for (const [cx, cz, cw, cd, ch] of INTERIOR_CHIPS) {
    // The height is capped rather than authored so the closed panel always
    // hides the cavity. See INTERIOR_CEILING_Y for what a taller chip costs.
    root.add(
      box(
        cx - cw / 2,
        cx + cw / 2,
        INTERIOR_BOARD_TOP_Y,
        interiorChipTopY(ch),
        cz - cd / 2,
        cz + cd / 2,
        chipMaterial,
      ),
    );
  }

  // Board standoffs, sized so a closed panel hides them too (PRD HINGE-5, P2).
  const strutMaterial = chromeMaterial();
  const strutLength = interiorStrutLength();
  const strutY = interiorStrutY(strutLength);
  for (const sx of STRUT_XS) {
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(STRUT_RADIUS, STRUT_RADIUS, strutLength, 12),
      strutMaterial,
    );
    strut.position.set(sx, strutY, Z_HINGE + STRUT_Z);
    strut.rotation.x = STRUT_TILT_RAD;
    strut.castShadow = true;
    root.add(strut);
  }

  /* ------------------------------------------------------------ wooden ends */

  const cheek = cheekGeometry();
  for (const centreX of [
    -BODY_WIDTH / 2 + CASE_WOOD_THICKNESS / 2,
    BODY_WIDTH / 2 - CASE_WOOD_THICKNESS / 2,
  ] as const) {
    const mesh = new THREE.Mesh(cheek, wood);
    mesh.position.set(centreX, 0, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---------------------------------------------------------- hinge barrel */

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      HINGE_BARREL_RADIUS,
      HINGE_BARREL_RADIUS,
      CASE_INNER_WIDTH,
      20,
    ),
    chromeMaterial(),
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, KEY_DECK_Y - 0.0015, Z_HINGE);
  barrel.castShadow = true;
  root.add(barrel);

  for (const knuckleX of [-0.21, 0, 0.21] as const) {
    const knuckle = new THREE.Mesh(
      new THREE.CylinderGeometry(
        HINGE_BARREL_RADIUS * 1.8,
        HINGE_BARREL_RADIUS * 1.8,
        0.024,
        18,
      ),
      chassis,
    );
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.set(knuckleX, KEY_DECK_Y - 0.003, Z_HINGE);
    knuckle.castShadow = true;
    root.add(knuckle);
  }

  /* ------------------------------------------------- rear jacks (decor, P1) */

  for (const jackX of [-0.2, -0.164, 0.164, 0.2] as const) {
    const jack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 16),
      chromeMaterial(),
    );
    jack.rotation.x = Math.PI / 2;
    jack.position.set(jackX, CASE_BASE_Y + 0.02, Z_BACK - 0.002);
    root.add(jack);
  }

  /* ------------------------------------------- power rocker + pilot lamp */

  const powerView = buildSwitch('power');
  powerView.root.rotation.z = Math.PI / 2; // lever points out of the left end
  powerView.root.position.set(
    -BODY_WIDTH / 2 - 0.0008,
    POWER_SWITCH_POS.y,
    POWER_SWITCH_POS.z,
  );
  root.add(powerView.root);

  const bezel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0054, 0.0058, 0.0026, 20),
    collarMaterial(),
  );
  bezel.rotation.z = Math.PI / 2;
  bezel.position.set(-BODY_WIDTH / 2 + 0.0008, PILOT_LAMP_POS.y, PILOT_LAMP_POS.z);
  root.add(bezel);

  const lampMaterialInstance = lampMaterial();
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.0038, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    lampMaterialInstance,
  );
  lamp.rotation.z = Math.PI / 2; // dome faces -X
  lamp.position.set(-BODY_WIDTH / 2 - 0.0004, PILOT_LAMP_POS.y, PILOT_LAMP_POS.z);
  root.add(lamp);

  return { root, powerView, lampMaterial: lampMaterialInstance };
}
