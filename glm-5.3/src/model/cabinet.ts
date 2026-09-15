/**
 * 机箱与木侧板(MDL-1):底箱(键盘井 + 后坡)、左右胡桃木侧板(圆角)、
 * 后面板装饰插孔、铰链轴、前面板 AETHER 品牌铭牌(MDL-3)。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { DIM, HALF_W, SIDE } from "./dimensions";

/** 前面板品牌铭牌(自绘 AETHER 字标 + 小字 Model D) */
function brandPlate(): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 128);
  // 字标:衬线大写字距拉开
  ctx.font = "600 64px Georgia, 'Times New Roman', serif";
  ctx.fillStyle = "#c8b98e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const letters = "AETHER";
  const spacing = 14;
  const widths = [...letters].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
  let x = 256 - total / 2;
  for (let i = 0; i < letters.length; i++) {
    ctx.textAlign = "left";
    ctx.fillText(letters[i], x, 52);
    x += widths[i] + spacing;
  }
  ctx.font = "500 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#8d8474";
  ctx.fillText("M O D E L   D", 256, 104);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.0212),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return mesh;
}

export function buildCabinet(mats: MaterialLibrary): {
  group: THREE.Group;
  hingeBarrels: THREE.Group;
} {
  const g = new THREE.Group();
  const W = HALF_W * 2;

  /* 底板 */
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, 0.006, DIM.depth), mats.chassis);
  bottom.position.set(0, 0.003, 0);
  bottom.receiveShadow = true;
  g.add(bottom);

  /* 前墙(键盘下方,品牌铭牌贴其上) */
  const front = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.008), mats.chassis);
  front.position.set(0, 0.031, DIM.frontLip + 0.002);
  g.add(front);
  const brand = brandPlate();
  brand.position.set(0.155, 0.042, DIM.frontLip + 0.0065);
  g.add(brand);

  /* 键盘井:键床 + 红呢条 */
  const keybed = new THREE.Mesh(
    new THREE.BoxGeometry(0.47, 0.005, 0.15),
    mats.chassis,
  );
  keybed.position.set(0.03, DIM.keyWellFloor, 0.105);
  g.add(keybed);
  const felt = new THREE.Mesh(
    new THREE.BoxGeometry(0.47, 0.006, 0.006),
    new THREE.MeshStandardMaterial({ color: 0x5a1620, roughness: 0.9 }),
  );
  felt.position.set(0.03, DIM.keyTopY - 0.002, DIM.keyBayStart + 0.009);
  g.add(felt);

  /* 左侧边条面板(黑色,承载 LFO/开关/滑轮) */
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(SIDE.x1 - SIDE.x0, 0.006, 0.15),
    mats.blackPanel,
  );
  strip.position.set((SIDE.x0 + SIDE.x1) / 2, DIM.keyTopY - 0.0015, 0.105);
  strip.receiveShadow = true;
  g.add(strip);

  /* 后墙(放平时与面板后缘衔接) */
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 0.062, 0.008), mats.chassis);
  back.position.set(0, 0.036, -0.172);
  g.add(back);
  /* 后面板装饰插孔 ×4 + 电源插座 */
  for (let i = 0; i < 4; i++) {
    const jack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 12),
      mats.jack,
    );
    jack.rotation.x = Math.PI / 2;
    jack.position.set(-0.12 + i * 0.05, 0.048, -0.1765);
    g.add(jack);
  }
  const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.006), mats.componentBlack);
  inlet.position.set(0.14, 0.046, -0.175);
  g.add(inlet);

  /* 铰链轴(静态,固定在面板前缘/键盘一侧;面板向前掀起时绕其旋转)。
     不设内腔地板:面板厚箱体立起时旋入机箱内腔,需要让开扫掠路径 */
  const hingeBarrels = new THREE.Group();
  for (const hx of [-0.185, 0, 0.185]) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0042, 0.028, 12),
      mats.metalPart,
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(hx, DIM.hingeY - 0.004, DIM.hingeZ + 0.0045);
    hingeBarrels.add(barrel);
  }
  g.add(hingeBarrels);

  /* 左右木侧板:圆角外形 */
  const sideShape = new THREE.Shape();
  const sw = 0.019;
  const sh = 0.086;
  const r = 0.012;
  sideShape.moveTo(0, r);
  sideShape.lineTo(0, sh - r);
  sideShape.quadraticCurveTo(0, sh, r, sh);
  sideShape.lineTo(sw - r, sh);
  sideShape.quadraticCurveTo(sw, sh, sw, sh - r);
  sideShape.lineTo(sw, r);
  sideShape.quadraticCurveTo(sw, 0, sw - r, 0);
  sideShape.lineTo(r, 0);
  sideShape.quadraticCurveTo(0, 0, 0, r);
  const sideGeo = new THREE.ExtrudeGeometry(sideShape, {
    depth: DIM.depth,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  sideGeo.translate(0, 0, -DIM.depth / 2);
  const woodL = new THREE.Mesh(sideGeo, mats.wood);
  woodL.position.set(-HALF_W - sw + 0.002, 0.0, 0);
  const woodR = new THREE.Mesh(sideGeo, mats.wood);
  woodR.position.set(HALF_W - 0.002, 0.0, 0);
  woodR.rotation.y = Math.PI;
  for (const w of [woodL, woodR]) {
    w.castShadow = true;
    w.receiveShadow = true;
    g.add(w);
  }

  /* 底脚 */
  for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.009, 0.012, 12),
      mats.componentBlack,
    );
    foot.position.set(fx * (HALF_W - 0.03), -0.006, fz * (DIM.depth / 2 - 0.035));
    g.add(foot);
  }

  return { group: g, hingeBarrels };
}
