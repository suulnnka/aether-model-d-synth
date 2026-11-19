import * as THREE from "three";
import { DIM, PHONES_JACK_POS } from "./layout.ts";
import type { SynthMaterials } from "./materials.ts";
import {
  createPanelSilkscreenTexture,
  createRearPlateTexture,
  createSideStripSilkscreenTexture,
} from "./silkscreen.ts";

export interface CabinetRefs {
  root: THREE.Group;
  panelPivot: THREE.Group;
  strutLeft: THREE.Mesh;
  strutRight: THREE.Mesh;
  sideStripGroup: THREE.Group;
  disposeTextures: () => void;
}

function createCheekGeometry(): THREE.ExtrudeGeometry {
  // Side profile in ZY plane (x = depth z, y = height y), extruded along X
  const zBack = -DIM.D / 2; // -0.1825
  const zFront = DIM.D / 2; // +0.1825
  const shape = new THREE.Shape();
  shape.moveTo(zFront, 0.004);
  shape.lineTo(zFront, 0.078);
  shape.lineTo(0.015, 0.082);
  shape.lineTo(-0.028, 0.106);
  shape.lineTo(zBack + 0.015, 0.168);
  shape.lineTo(zBack, 0.162);
  shape.lineTo(zBack, 0.004);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DIM.CHEEK_T,
    bevelEnabled: true,
    bevelThickness: 0.0024,
    bevelSize: 0.002,
    bevelSegments: 3,
  });
  // Rotate so shape's X maps to -Z or +Z, and extrusion depth maps to X
  // ExtrudeGeometry extrudes along +Z from shape in XY.
  // Rotate +90 deg around Y: shape X -> -Z, shape Y -> Y, extrude Z -> +X.
  // So negate shape X or rotate -PI/2 around Y: shape X -> +Z, extrude Z -> -X.
  geo.rotateY(-Math.PI / 2);
  geo.translate(DIM.CHEEK_T / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function createPanelEnclosureGeometry(): THREE.ExtrudeGeometry {
  // Profile in ZY plane: hinge origin at (z=0, y=0)
  // Faceplate sits at y=0 from z=0 (hinge) to z=-PANEL_D (top)
  const d = DIM.PANEL_D;
  const t = DIM.PANEL_THICK;
  const shape = new THREE.Shape();
  // In XY before rotateY(-PI/2): shape X -> +Z, shape Y -> Y
  shape.moveTo(0, -0.004);
  shape.lineTo(-d, -0.004);
  shape.lineTo(-d, -t);
  shape.lineTo(-0.028, -t);
  shape.lineTo(0, -0.01);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DIM.PANEL_W - 0.004,
    bevelEnabled: true,
    bevelThickness: 0.0018,
    bevelSize: 0.0016,
    bevelSegments: 2,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate((DIM.PANEL_W - 0.004) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function makeScrew(mats: SynthMaterials): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0028, 0.0028, 0.0014, 14),
    mats.chrome,
  );
  head.position.y = 0.0007;
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.0007, 0.0008),
    mats.darkSteel,
  );
  slot.position.y = 0.0013;
  g.add(head, slot);
  return g;
}

function makeTrsJack(mats: SynthMaterials): THREE.Group {
  const g = new THREE.Group();
  const nut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.0024, 6),
    mats.chrome,
  );
  nut.rotation.x = Math.PI / 2;
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 16),
    mats.chrome,
  );
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.0015;
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0026, 0.0026, 0.0045, 16),
    mats.rubberFoot,
  );
  hole.rotation.x = Math.PI / 2;
  hole.position.z = 0.0016;
  g.add(nut, sleeve, hole);
  return g;
}

export function buildCabinet(
  mats: SynthMaterials,
  maxAnisotropy: number,
): CabinetRefs {
  const root = new THREE.Group();

  // ── 1. Walnut Side Cheeks ─────────────────────────────────────────
  const cheekGeo = createCheekGeometry();
  const leftCheek = new THREE.Mesh(cheekGeo, mats.walnut);
  leftCheek.position.x = -DIM.W / 2 + DIM.CHEEK_T / 2;
  leftCheek.castShadow = true;
  leftCheek.receiveShadow = true;

  const rightCheek = new THREE.Mesh(cheekGeo, mats.walnut);
  rightCheek.position.x = DIM.W / 2 - DIM.CHEEK_T / 2;
  rightCheek.castShadow = true;
  rightCheek.receiveShadow = true;
  root.add(leftCheek, rightCheek);

  // ── 2. Lower Base Plinth, Keybed & Front Walnut Rail ─────────────
  const bottomDeck = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.INNER_W, 0.032, DIM.D - 0.008),
    mats.chassisMetal,
  );
  bottomDeck.position.set(0, 0.02, 0);
  bottomDeck.castShadow = true;
  bottomDeck.receiveShadow = true;
  root.add(bottomDeck);

  // Front walnut trim rail in front of the keyboard
  const frontLip = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.INNER_W, 0.044, 0.016),
    mats.walnut,
  );
  frontLip.position.set(0, 0.026, DIM.D / 2 - 0.008);
  frontLip.castShadow = true;
  frontLip.receiveShadow = true;
  root.add(frontLip);

  // Rear walnut housing bay wall
  const rearWall = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.INNER_W, 0.095, 0.016),
    mats.walnut,
  );
  rearWall.position.set(0, 0.052, -DIM.D / 2 + 0.008);
  rearWall.castShadow = true;
  rearWall.receiveShadow = true;
  root.add(rearWall);

  // Rear internal metal floor shelf inside the bay
  const rearBayFloor = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.INNER_W, 0.012, 0.165),
    mats.chassisMetal,
  );
  rearBayFloor.position.set(0, 0.038, -0.095);
  rearBayFloor.receiveShadow = true;
  root.add(rearBayFloor);

  // Keybed dark floor + iconic crimson felt strip behind the keys
  const keybed = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.KEY_X1 - DIM.KEY_X0 + 0.01, 0.01, DIM.KEY_LEN + 0.012),
    mats.chassisMetal,
  );
  keybed.position.set(
    (DIM.KEY_X0 + DIM.KEY_X1) / 2,
    DIM.KEYBED_FLOOR_Y - 0.004,
    DIM.KEY_START_Z + DIM.KEY_LEN / 2,
  );
  keybed.receiveShadow = true;
  root.add(keybed);

  const feltStrip = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.KEY_X1 - DIM.KEY_X0 + 0.004, 0.006, 0.014),
    mats.felt,
  );
  feltStrip.position.set(
    (DIM.KEY_X0 + DIM.KEY_X1) / 2,
    DIM.KEY_TOP_Y - 0.003,
    DIM.KEY_START_Z - 0.006,
  );
  root.add(feltStrip);

  // Key cheek inner trim divider between left-hand strip and C3 key
  const innerDivider = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.038, 0.168),
    mats.walnut,
  );
  innerDivider.position.set(-0.187, 0.053, 0.086);
  innerDivider.castShadow = true;
  root.add(innerDivider);

  // 4 Rubber feet
  const footGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.006, 16);
  for (const fx of [-0.24, 0.24]) {
    for (const fz of [-0.14, 0.14]) {
      const foot = new THREE.Mesh(footGeo, mats.rubberFoot);
      foot.position.set(fx, 0.003, fz);
      root.add(foot);
    }
  }

  // ── 3. Left-Hand Controller Strip ─────────────────────────────────
  const sideStripGroup = new THREE.Group();
  const stripW = DIM.SIDE_X1 - DIM.SIDE_X0;
  const stripD = 0.164;
  const stripCenterX = (DIM.SIDE_X0 + DIM.SIDE_X1) / 2;
  const stripCenterZ = 0.086;

  const sideBase = new THREE.Mesh(
    new THREE.BoxGeometry(stripW, 0.036, stripD),
    mats.chassisMetal,
  );
  sideBase.position.set(stripCenterX, 0.052, stripCenterZ);
  sideBase.castShadow = true;
  sideBase.receiveShadow = true;
  sideStripGroup.add(sideBase);

  const sideTex = createSideStripSilkscreenTexture(maxAnisotropy);
  const sideFaceMat = new THREE.MeshStandardMaterial({
    map: sideTex,
    roughness: 0.42,
    metalness: 0.25,
  });
  const sideFace = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripD), sideFaceMat);
  sideFace.rotation.x = -Math.PI / 2;
  sideFace.position.set(stripCenterX, 0.0704, stripCenterZ);
  sideFace.receiveShadow = true;
  sideStripGroup.add(sideFace);

  // Recessed dark slots for Pitch & Mod wheels
  for (const wx of [-0.246, -0.212]) {
    const slotRim = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.004, 0.044),
      mats.wheelBezel,
    );
    slotRim.position.set(wx, 0.069, 0.125);
    sideStripGroup.add(slotRim);
  }

  for (const sx of [DIM.SIDE_X0 + 0.006, DIM.SIDE_X1 - 0.006]) {
    for (const sz of [0.01, 0.16]) {
      const screw = makeScrew(mats);
      screw.position.set(sx, 0.0705, sz);
      sideStripGroup.add(screw);
    }
  }
  root.add(sideStripGroup);

  // ── 4. Hinged Control Panel Enclosure ─────────────────────────────
  const panelPivot = new THREE.Group();
  panelPivot.position.set(0, DIM.HINGE_Y, DIM.HINGE_Z);
  root.add(panelPivot);

  // Enclosure body
  const enclosure = new THREE.Mesh(createPanelEnclosureGeometry(), mats.panelBackMetal);
  enclosure.castShadow = true;
  enclosure.receiveShadow = true;
  panelPivot.add(enclosure);

  // Main front control silkscreen faceplate
  const panelTex = createPanelSilkscreenTexture(maxAnisotropy);
  const panelMat = new THREE.MeshStandardMaterial({
    map: panelTex,
    roughness: 0.44,
    metalness: 0.28,
  });
  const faceplate = new THREE.Mesh(
    new THREE.PlaneGeometry(DIM.PANEL_W, DIM.PANEL_D),
    panelMat,
  );
  faceplate.rotation.x = -Math.PI / 2;
  faceplate.position.set(0, 0.0004, -DIM.PANEL_D / 2);
  faceplate.receiveShadow = true;
  panelPivot.add(faceplate);

  // Brushed aluminum hinge bar + dark matte hinge dust-seal strip
  const hingeRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0032, 0.0032, DIM.PANEL_W - 0.01, 14),
    mats.chrome,
  );
  hingeRod.rotation.z = Math.PI / 2;
  hingeRod.position.set(0, -0.002, 0);
  panelPivot.add(hingeRod);

  const hingeSeal = new THREE.Mesh(
    new THREE.BoxGeometry(DIM.INNER_W, 0.024, 0.024),
    mats.rubberFoot,
  );
  hingeSeal.position.set(0, DIM.HINGE_Y - 0.014, DIM.HINGE_Z - 0.006);
  root.add(hingeSeal);

  // Corner mounting screws on faceplate
  for (const sx of [-DIM.PANEL_W / 2 + 0.008, DIM.PANEL_W / 2 - 0.008]) {
    for (const sz of [-0.008, -DIM.PANEL_D + 0.008]) {
      const screw = makeScrew(mats);
      screw.position.set(sx, 0.0005, sz);
      panelPivot.add(screw);
    }
  }

  // Front PHONES 1/4" jack in Output section
  const phonesJack = makeTrsJack(mats);
  phonesJack.rotation.x = -Math.PI / 2;
  phonesJack.position.set(PHONES_JACK_POS.x, 0.001, -PHONES_JACK_POS.v);
  panelPivot.add(phonesJack);

  // Rear aluminum jack plate on back of hinged enclosure
  const rearTex = createRearPlateTexture(maxAnisotropy);
  const rearPlateMat = new THREE.MeshStandardMaterial({
    map: rearTex,
    roughness: 0.42,
    metalness: 0.55,
  });
  const rearPlateW = DIM.PANEL_W - 0.04;
  const rearPlateH = DIM.PANEL_THICK - 0.008;
  const rearPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(rearPlateW, rearPlateH),
    rearPlateMat,
  );
  rearPlate.rotation.y = Math.PI; // facing -Z (flips canvas X -> -worldX)
  rearPlate.position.set(0, -DIM.PANEL_THICK / 2 - 0.001, -DIM.PANEL_D - 0.0019);
  panelPivot.add(rearPlate);

  // 3D TRS jacks aligned directly beneath the rear plate silkscreen labels
  const rearJackCanvasX = [940, 1135, 1330, 1525, 1720, 1900];
  const jackY = -DIM.PANEL_THICK / 2 - 0.001 + (0.5 - 235 / 384) * rearPlateH;
  for (const cx of rearJackCanvasX) {
    const j = makeTrsJack(mats);
    j.rotation.y = Math.PI;
    const wx = (0.5 - cx / 2048) * rearPlateW;
    j.position.set(wx, jackY, -DIM.PANEL_D - 0.002);
    panelPivot.add(j);
  }

  // Power cord grommet on rear-left of backplate (canvas X = 270 -> right side when viewed from rear)
  const grommet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0065, 0.0075, 0.012, 16),
    mats.rubberFoot,
  );
  grommet.rotation.x = Math.PI / 2;
  const grommetX = (0.5 - 270 / 2048) * rearPlateW;
  const grommetY = -DIM.PANEL_THICK / 2 - 0.001 + (0.5 - 230 / 384) * rearPlateH;
  grommet.position.set(grommetX, grommetY, -DIM.PANEL_D - 0.005);
  panelPivot.add(grommet);

  // Mechanical tilt support struts (left & right behind panel)
  const strutGeo = new THREE.BoxGeometry(0.005, 0.11, 0.008);
  const strutLeft = new THREE.Mesh(strutGeo, mats.brushedAluminum);
  strutLeft.position.set(-0.258, 0.09, -0.145);
  const strutRight = new THREE.Mesh(strutGeo, mats.brushedAluminum);
  strutRight.position.set(0.258, 0.09, -0.145);
  root.add(strutLeft, strutRight);

  return {
    root,
    panelPivot,
    strutLeft,
    strutRight,
    sideStripGroup,
    disposeTextures: () => {
      panelTex.dispose();
      sideTex.dispose();
      rearTex.dispose();
    },
  };
}
