/**
 * 面板背腔元器件(MDL-8):控制面背对的整面箱体内部放满电子元器件 ——
 * PCB(振荡器板/滤波器板/电源板)、电解电容、电阻、晶体管、线束排线、
 * 变压器与金属支撑框架;按功能分区程序化排布,InstancedMesh 实现重复件。
 * 坐标系:面板局部 —— 面内側 y=0,腔体向 y 负方向延伸 0.10。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { DIM, HALF_W } from "./dimensions";

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBackroom(mats: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  const rnd = mulberry(20260914);
  const cavityD = DIM.panelD - 0.012;
  const plateY = -DIM.panelThick + 0.008;

  /* 背板(腔体底面 = 面板立起时朝向观察者的一面) */
  const backplate = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_W * 2 - 0.008, 0.003, cavityD),
    mats.chassis,
  );
  backplate.position.set(0, plateY, DIM.panelD / 2);
  group.add(backplate);

  /* 金属支撑框架:两条横梁 */
  for (const z of [0.035, 0.165]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_W * 2 - 0.02, 0.005, 0.006),
      mats.metalPart,
    );
    bar.position.set(0, plateY + 0.012, z);
    group.add(bar);
  }

  /* 三块 PCB:振荡器板(绿)、滤波器板(绿)、电源板(蓝) */
  interface Board {
    x: number;
    w: number;
    d: number;
    mat: THREE.MeshStandardMaterial;
    name: "osc" | "filter" | "power";
  }
  const boards: Board[] = [
    { x: -0.15, w: 0.148, d: 0.15, mat: mats.pcbGreen, name: "osc" },
    { x: 0.02, w: 0.148, d: 0.15, mat: mats.pcbGreen, name: "filter" },
    { x: 0.158, w: 0.062, d: 0.15, mat: mats.pcbBlue, name: "power" },
  ];
  const boardY = plateY + 0.016;
  for (const b of boards) {
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.0022, b.d), b.mat);
    pcb.position.set(b.x, boardY, DIM.panelD / 2);
    group.add(pcb);
    // 四角铜柱支撑
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const standoff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0016, 0.0016, 0.014, 8),
        mats.metalPart,
      );
      standoff.position.set(
        b.x + (sx * (b.w / 2 - 0.008)),
        plateY + 0.007,
        DIM.panelD / 2 + sz * (b.d / 2 - 0.008),
      );
      group.add(standoff);
    }
  }

  /* 电解电容(InstancedMesh):蓝色大电容 + 深色中电容 */
  const capBig = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0062, 0.0062, 0.02, 12),
    mats.capBlue,
    26,
  );
  const capMed = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0038, 0.0038, 0.013, 10),
    mats.capBody,
    44,
  );
  /* 电阻(卧式,米色小圆柱) */
  const resistors = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0014, 0.0014, 0.0068, 8),
    mats.resistor,
    160,
  );
  /* 晶体管 / 小 IC(黑色小方块) */
  const transistors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.0045, 0.004, 0.0045),
    mats.componentBlack,
    90,
  );

  const dummy = new THREE.Object3D();
  let iBig = 0;
  let iMed = 0;
  let iRes = 0;
  let iTr = 0;
  const placeOnBoard = (b: Board) => {
    const halfW = b.w / 2 - 0.008;
    const halfD = b.d / 2 - 0.008;
    // 电源板:大电容密一些
    const bigCount = b.name === "power" ? 12 : 7;
    for (let i = 0; i < bigCount && iBig < 26; i++) {
      dummy.position.set(
        b.x + (rnd() * 2 - 1) * halfW * 0.85,
        boardY + 0.011,
        DIM.panelD / 2 + (rnd() * 2 - 1) * halfD * 0.85,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      capBig.setMatrixAt(iBig++, dummy.matrix);
    }
    for (let i = 0; i < 14 && iMed < 44; i++) {
      dummy.position.set(
        b.x + (rnd() * 2 - 1) * halfW,
        boardY + 0.0075,
        DIM.panelD / 2 + (rnd() * 2 - 1) * halfD,
      );
      dummy.updateMatrix();
      capMed.setMatrixAt(iMed++, dummy.matrix);
    }
    for (let i = 0; i < 52 && iRes < 160; i++) {
      dummy.position.set(
        b.x + (rnd() * 2 - 1) * halfW,
        boardY + 0.0022,
        DIM.panelD / 2 + (rnd() * 2 - 1) * halfD,
      );
      dummy.rotation.set(Math.PI / 2, rnd() * Math.PI, 0);
      dummy.updateMatrix();
      resistors.setMatrixAt(iRes++, dummy.matrix);
    }
    for (let i = 0; i < 30 && iTr < 90; i++) {
      dummy.position.set(
        b.x + (rnd() * 2 - 1) * halfW,
        boardY + 0.0032,
        DIM.panelD / 2 + (rnd() * 2 - 1) * halfD,
      );
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.updateMatrix();
      transistors.setMatrixAt(iTr++, dummy.matrix);
    }
  };
  for (const b of boards) placeOnBoard(b);
  capBig.count = iBig;
  capMed.count = iMed;
  resistors.count = iRes;
  transistors.count = iTr;
  group.add(capBig, capMed, resistors, transistors);

  /* 变压器(电源板旁)+ 铜带 */
  const transformer = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.036, 0.042),
    mats.transformer,
  );
  transformer.position.set(0.158, plateY + 0.024, DIM.panelD / 2 + 0.048);
  group.add(transformer);
  const copperBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.046, 0.008, 0.046),
    mats.copper,
  );
  copperBand.position.set(0.158, plateY + 0.03, DIM.panelD / 2 + 0.048);
  group.add(copperBand);

  /* 线束:沿贝塞尔曲线的排线 */
  const wireMats = [mats.wireRed, mats.wireYel, mats.wireBlue];
  const wirePaths: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-0.15, boardY + 0.004, 0.045),
      new THREE.Vector3(-0.08, boardY + 0.02, 0.07),
      new THREE.Vector3(0.0, boardY + 0.006, 0.09),
      new THREE.Vector3(0.06, boardY + 0.018, 0.12),
    ],
    [
      new THREE.Vector3(0.02, boardY + 0.004, 0.16),
      new THREE.Vector3(0.08, boardY + 0.022, 0.14),
      new THREE.Vector3(0.14, boardY + 0.01, 0.1),
      new THREE.Vector3(0.158, boardY + 0.006, 0.07),
    ],
    [
      new THREE.Vector3(-0.15, boardY + 0.004, 0.15),
      new THREE.Vector3(-0.2, boardY + 0.016, 0.11),
      new THREE.Vector3(-0.22, boardY + 0.008, 0.06),
      new THREE.Vector3(-0.18, boardY + 0.004, 0.03),
    ],
  ];
  wirePaths.forEach((pts, idx) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.0011, 6, false),
      wireMats[idx % 3],
    );
    group.add(wire);
    // 同路径的第二三根略微偏移成排线
    for (let k = 1; k <= 2; k++) {
      const offset = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.0011, 6, false),
        wireMats[(idx + k) % 3],
      );
      offset.position.y = 0;
      offset.position.x = k * 0.0028 * (idx % 2 === 0 ? 1 : -1);
      group.add(offset);
    }
  });

  return group;
}
