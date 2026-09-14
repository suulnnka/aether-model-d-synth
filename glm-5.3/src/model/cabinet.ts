import * as THREE from "three";
import { DIMS } from "./dimensions";
import type { MaterialLib } from "./materials";
import { paintApronBrand } from "./silkscreen";

/** 机箱(MDL-1):底箱 + 键床槽 + 前围板品牌牌 + 木侧板 + 后面板装饰插孔 + 内部结构(P2 HINGE-5) */

export interface Cabinet {
  root: THREE.Group;
  /** 面板掀起时可见的内部托盘组(可整体显隐) */
  interior: THREE.Group;
  /** 左侧板电源开关翘板(交互) */
  powerRocker: THREE.Object3D;
  /** 电源指示灯(暖橙自发光,VIS-6) */
  led: THREE.Mesh;
}

export function createCabinet(mats: MaterialLib): Cabinet {
  const root = new THREE.Group();

  const W = DIMS.innerW;
  const top = DIMS.bodyTop;
  const bot = DIMS.bodyBottom;
  const H = top - bot;

  // ---- 主箱体:仅覆盖键盘段(面板段为开放托盘,供面板翻起)----
  const frontSpan = DIMS.frontZ - DIMS.panelHingeZ;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, frontSpan), mats.chassis);
  shell.position.set(0, bot + H / 2, (DIMS.frontZ + DIMS.panelHingeZ) / 2);
  shell.castShadow = true;
  shell.receiveShadow = true;
  root.add(shell);

  // 后段托盘:底板 + 周缘薄壁(面板放平时搭在薄壁上)
  const traySpan = DIMS.panelHingeZ - DIMS.rearZ;
  const trayZ = (DIMS.panelHingeZ + DIMS.rearZ) / 2;
  const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(W - 0.004, 0.01, traySpan - 0.008), mats.chassis);
  trayFloor.position.set(0, bot + 0.095, trayZ);
  trayFloor.receiveShadow = true;
  root.add(trayFloor);
  const wallMat = mats.chassis;
  const wallTop = 0.1265;
  const wallH = wallTop - (bot + 0.1);
  for (const [wx, wz, ww, wd] of [
    [0, DIMS.rearZ + 0.005, W, 0.01],
    [0, DIMS.panelHingeZ - 0.005, W, 0.01],
    [-W / 2 + 0.005, trayZ, 0.01, traySpan],
    [W / 2 - 0.005, trayZ, 0.01, traySpan],
  ] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wallH, wd), wallMat);
    wall.position.set(wx, bot + 0.1 + wallH / 2, wz);
    root.add(wall);
  }

  // 后墙(装饰插孔安装面)
  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(W + 0.004, H + 0.002, 0.012), mats.chassis);
  rearWall.position.set(0, bot + H / 2, DIMS.rearZ + 0.006);
  rearWall.castShadow = true;
  root.add(rearWall);

  // 键床(凹陷槽)
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.004, 0.008, DIMS.keyBedFrontZ - DIMS.keyBedRearZ),
    mats.bed
  );
  bed.position.set(0, DIMS.keyBedTop - 0.004, (DIMS.keyBedFrontZ + DIMS.keyBedRearZ) / 2);
  bed.receiveShadow = true;
  root.add(bed);

  // 键床前唇(品牌前围板上沿)
  const lipFront = new THREE.Mesh(
    new THREE.BoxGeometry(W, top - DIMS.keyBedTop + 0.004, DIMS.frontZ - DIMS.keyBedFrontZ),
    mats.chassis
  );
  lipFront.position.set(
    0,
    (top + DIMS.keyBedTop - 0.004) / 2 + 0.002,
    (DIMS.frontZ + DIMS.keyBedFrontZ) / 2
  );
  root.add(lipFront);

  // ---- 前围板品牌牌(MDL-3 品牌区)----
  const brandCanvas = paintApronBrand();
  const brandTex = new THREE.CanvasTexture(brandCanvas);
  brandTex.colorSpace = THREE.SRGBColorSpace;
  brandTex.anisotropy = 8;
  const brand = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.02),
    new THREE.MeshStandardMaterial({ map: brandTex, roughness: 0.5, metalness: 0.3 })
  );
  brand.position.set(0.14, top - 0.012, DIMS.frontZ + 0.0006);
  root.add(brand);

  // ---- 面板凹腔内部(面板立起时可见,HINGE-5)----
  const interior = new THREE.Group();
  // PCB 板 + 芯片
  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.08, 0.003, traySpan - 0.06),
    mats.pcb
  );
  pcb.position.set(0, bot + 0.108, DIMS.panelHingeZ - traySpan / 2 - 0.01);
  pcb.rotation.x = 0.1;
  interior.add(pcb);
  const chipGeo = new THREE.BoxGeometry(0.03, 0.004, 0.012);
  for (let i = 0; i < 6; i++) {
    const chip = new THREE.Mesh(chipGeo, mats.chip);
    chip.position.set(-0.16 + i * 0.062, bot + 0.112, DIMS.panelHingeZ - 0.055 - (i % 2) * 0.045);
    chip.rotation.x = 0.1;
    chip.rotation.y = ((i % 3) - 1) * 0.06;
    interior.add(chip);
  }
  // 支撑杆(面板立起时可见,角度小于 15° 时隐藏)
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 12), mats.brushed);
  strut.position.set(-0.18, top + 0.03, DIMS.panelHingeZ - 0.075);
  strut.rotation.x = 0.9;
  strut.name = "interior-strut";
  strut.visible = false;
  interior.add(strut);
  root.add(interior);

  // ---- 左右木侧板(圆角轮廓,挤出;顶缘大致平行于立起的面板)----
  const cheekShape = new THREE.Shape();
  const fz = DIMS.frontZ;
  const rz = DIMS.rearZ - 0.008; // 侧板略长于箱体
  const hF = 0.15; // 前端顶
  const hR = 0.275; // 后端顶(约等于立起面板的上缘)
  cheekShape.moveTo(fz, 0);
  cheekShape.lineTo(fz, hF - 0.028);
  cheekShape.quadraticCurveTo(fz, hF, fz - 0.028, hF);
  cheekShape.lineTo(-0.02, hF + 0.045);
  cheekShape.lineTo(rz + 0.03, hR - 0.012);
  cheekShape.quadraticCurveTo(rz, hR, rz - 0.008, hR - 0.002);
  cheekShape.lineTo(rz, 0);
  cheekShape.closePath();
  // Shape 在 (x,y) 2D 定义:shape-x 代表世界 z,shape-y 代表世界 y;沿 z 挤出后旋转映射
  const cheekGeo = new THREE.ExtrudeGeometry(cheekShape, {
    depth: DIMS.cheekW,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 2,
    steps: 1,
  });
  cheekGeo.rotateY(-Math.PI / 2); // shape-x → 世界 z(不反转),挤出方向 → 世界 -x
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, mats.wood);
    if (side === 1) {
      cheek.position.set(W / 2 + DIMS.cheekW, 0, 0);
    } else {
      cheek.position.set(-W / 2, 0, 0);
    }
    cheek.castShadow = true;
    cheek.receiveShadow = true;
    cheek.name = side === 1 ? "cheek-right" : "cheek-left";
    root.add(cheek);
  }

  // ---- 后面板装饰插孔(MDL-1)----
  const jackGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.012, 16);
  jackGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const jack = new THREE.Mesh(jackGeo, i === 2 ? mats.brushed : mats.chassis);
    jack.position.set(-0.12 + i * 0.06, bot + 0.05, DIMS.rearZ + 0.002);
    root.add(jack);
  }
  // 电源插座
  const socket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.008), mats.chip);
  socket.position.set(0.2, bot + 0.05, DIMS.rearZ + 0.002);
  root.add(socket);

  // ---- 左侧板电源开关 + 指示灯 ----
  const powerGroup = new THREE.Group();
  powerGroup.position.set(-W / 2 - DIMS.cheekW - 0.001, 0.1, -0.02);
  const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.02), mats.switchBody);
  powerGroup.add(pBase);
  const powerRocker = new THREE.Group();
  const pCap = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.014), mats.switchCap);
  pCap.position.x = 0.002;
  powerRocker.add(pCap);
  powerGroup.add(powerRocker);
  root.add(powerGroup);

  const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 12), mats.ledOff);
  led.position.set(-W / 2 - DIMS.cheekW - 0.001, 0.1, 0.024);
  led.name = "power-led";
  root.add(led);

  return { root, interior, powerRocker, led };
}

/** 电源开关姿态 */
export function setPowerPose(rocker: THREE.Object3D, on: boolean): void {
  rocker.rotation.x = on ? 0.4 : -0.4;
}
