/**
 * 琴体建模(MDL-1 / MDL-8 / HINGE-1..6)
 * 底箱、木侧板、键盘槽、后腔、铰链、键盘左侧边条,
 * 以及铰链控制面板厚箱体(控制面 + 元器件背腔)。
 *
 * 铰链说明:铰链轴位于「键盘段后缘 / 面板前缘」,面板向机身后方延伸;
 * 0° 时面板放平并与键盘段顶面齐平,立起 α 时控制面转向演奏者(与真机检修姿态一致)。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { DIM, PANEL_INNER_W } from "./layout";

const W = DIM.W;
const D = DIM.D;

/** 确定性伪随机(保证每次刷新元器件排布一致) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 圆角矩形挤出体(木侧板) */
function roundedSlab(width: number, height: number, depth: number, rTop: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hw = width / 2;
  s.moveTo(-hw + 0.006, 0.006);
  s.lineTo(-hw, 0.006);
  s.quadraticCurveTo(-hw, 0, -hw + 0.006, 0);
  s.lineTo(hw - 0.006, 0);
  s.quadraticCurveTo(hw, 0, hw, 0.006);
  s.lineTo(hw, height - rTop);
  s.quadraticCurveTo(hw, height, hw - rTop, height);
  s.lineTo(-hw + rTop, height);
  s.quadraticCurveTo(-hw, height, -hw, height - rTop);
  s.lineTo(-hw, 0.006);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.computeVertexNormals();
  return g;
}

export interface Cabinet {
  root: THREE.Group;
  /** 铰链面板(绕 x 轴旋转,角度以弧度表示) */
  panel: THREE.Group;
  panelFaceMesh: THREE.Mesh;
  sideFaceMesh: THREE.Mesh;
  /** 断电置灰遮罩 */
  scrimPanel: THREE.Mesh;
  scrimSide: THREE.Mesh;
}

export function createCabinet(lib: MaterialLibrary): Cabinet {
  const root = new THREE.Group();
  const innerW = PANEL_INNER_W;
  const cheekH = 0.132;

  // ── 木侧板(圆角) ──
  const cheekGeo = roundedSlab(D, cheekH, DIM.CHEEK, 0.028);
  for (const sign of [-1, 1]) {
    const m = new THREE.Mesh(cheekGeo, lib.wood);
    m.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.position.x = (sign * W) / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }

  // ── 键盘段(前部实心箱体) ──
  const frontDepth = D / 2 - DIM.HINGE_Z;
  const front = new THREE.Mesh(new THREE.BoxGeometry(innerW, DIM.CASE_H, frontDepth), lib.woodDark);
  front.position.set(0, DIM.CASE_H / 2, DIM.HINGE_Z + frontDepth / 2);
  front.castShadow = true;
  front.receiveShadow = true;
  root.add(front);

  // 琴键槽两侧与前沿的装饰条
  const rail = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.008, 0.03), lib.wood);
  rail.position.set(0, DIM.CASE_H + 0.004, D / 2 - 0.015);
  rail.castShadow = true;
  root.add(rail);

  // ── 后腔(面板放平时盖住的部分) ──
  const rearD = DIM.HINGE_Z - -D / 2;
  const rearZ = (-D / 2 + DIM.HINGE_Z) / 2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.01, rearD), lib.woodDark);
  floor.position.set(0, 0.05, rearZ);
  floor.receiveShadow = true;
  root.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.055, 0.01), lib.woodDark);
  back.position.set(0, 0.0775, -D / 2 + 0.005);
  back.castShadow = true;
  root.add(back);

  // 后面板装饰插孔
  const jackGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 14);
  for (let i = 0; i < 5; i++) {
    const j = new THREE.Mesh(jackGeo, lib.metalPart);
    j.rotation.x = Math.PI / 2;
    j.position.set(-0.14 + i * 0.07, 0.085, -D / 2 - 0.001);
    root.add(j);
  }

  // ── 铰链 ──
  for (const x of [-0.19, 0, 0.19]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 16), lib.hinge);
    h.rotation.z = Math.PI / 2;
    h.position.set(x, DIM.HINGE_Y - 0.012, DIM.HINGE_Z);
    root.add(h);
  }

  // ── 键盘左侧边条 ──
  const sideW = DIM.SIDE_X1 - DIM.SIDE_X0;
  const sideD = DIM.KEY_FRONT_Z - DIM.KEY_BACK_Z;
  const sideBase = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.008, sideD), lib.sidePanelFace);
  sideBase.position.set((DIM.SIDE_X0 + DIM.SIDE_X1) / 2, DIM.CASE_H + 0.004, (DIM.KEY_BACK_Z + DIM.KEY_FRONT_Z) / 2);
  sideBase.castShadow = true;
  sideBase.receiveShadow = true;
  root.add(sideBase);

  const sideFaceMesh = sideBase;

  // ── 铰链面板(厚箱体) ──
  const panel = new THREE.Group();
  panel.position.set(0, DIM.HINGE_Y, DIM.HINGE_Z);
  root.add(panel);

  const PD = DIM.PANEL_D;
  const PT = DIM.PANEL_T;
  const faceT = 0.005;

  // 控制面(金属板)
  const face = new THREE.Mesh(new THREE.BoxGeometry(innerW, faceT, PD), lib.panelFace);
  face.position.set(0, -faceT / 2, -PD / 2);
  face.castShadow = true;
  face.receiveShadow = true;
  panel.add(face);

  // 腔体四壁(向 -y 开口 = 元器件背腔)
  const wallH = PT - faceT;
  const wallY = -faceT - wallH / 2;
  const walls: THREE.Mesh[] = [];
  const mkWall = (sx: number, sz: number, x: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, wallH, sz), lib.panelEdge);
    m.position.set(x, wallY, z);
    m.castShadow = true;
    m.receiveShadow = true;
    walls.push(m);
    panel.add(m);
  };
  mkWall(innerW, 0.006, 0, -PD + 0.003); // 后壁
  mkWall(innerW, 0.006, 0, -0.003); // 前壁(靠铰链)
  mkWall(0.006, PD, -innerW / 2 + 0.003, -PD / 2); // 左壁
  mkWall(0.006, PD, innerW / 2 - 0.003, -PD / 2); // 右壁

  // 腔内金属支撑框架
  const frame = new THREE.Mesh(new THREE.BoxGeometry(innerW - 0.02, 0.004, 0.01), lib.metalPart);
  frame.position.set(0, -PT + 0.008, -PD * 0.5);
  panel.add(frame);
  for (const x of [-0.12, 0.12]) {
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, PD - 0.02), lib.metalPart);
    rail2.position.set(x, -PT + 0.008, -PD / 2);
    panel.add(rail2);
  }

  // 变压器
  const tr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.042), lib.transformer);
  tr.position.set(-0.17, -PT + 0.023, -0.03);
  tr.castShadow = true;
  panel.add(tr);

  // ── 元器件:PCB + 分立元件(InstancedMesh) ──
  const rand = rng(20260914);
  const cavY = -PT + 0.012;

  // PCB 板(绿 / 蓝各一块以上)
  type Pcb = { x: number; z: number; w: number; d: number; blue: boolean };
  const pcbs: Pcb[] = [
    { x: 0.09, z: -0.032, w: 0.19, d: 0.042, blue: true }, // 振荡器板
    { x: -0.05, z: -0.082, w: 0.17, d: 0.038, blue: true }, // 滤波板
    { x: 0.13, z: -0.092, w: 0.1, d: 0.034, blue: false }, // 电源板
    { x: -0.16, z: -0.09, w: 0.08, d: 0.03, blue: false },
  ];
  for (const p of pcbs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(p.w, 0.0022, p.d),
      p.blue ? lib.pcbBlue : lib.pcbGreen
    );
    mesh.position.set(p.x, cavY, p.z);
    mesh.receiveShadow = true;
    panel.add(mesh);
  }

  // 分立元件:电容(圆柱)/ 电阻(小盒)/ 晶体管(小盒)
  const capGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.011, 12);
  const resGeo = new THREE.BoxGeometry(0.0016, 0.0016, 0.006);
  const icGeo = new THREE.BoxGeometry(0.012, 0.003, 0.005);

  const caps: THREE.Matrix4[] = [];
  const ress: THREE.Matrix4[] = [];
  const ics: THREE.Matrix4[] = [];

  for (const p of pcbs) {
    const nx = Math.max(2, Math.floor(p.w / 0.022));
    const nz = Math.max(1, Math.floor(p.d / 0.018));
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = p.x - p.w / 2 + ((ix + 0.5) / nx) * p.w + (rand() - 0.5) * 0.004;
        const z = p.z - p.d / 2 + ((iz + 0.5) / nz) * p.d + (rand() - 0.5) * 0.004;
        const roll = rand();
        if (roll < 0.32) {
          caps.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, cavY + 0.0065, z),
              new THREE.Quaternion(),
              new THREE.Vector3(1, 1, 1)
            )
          );
        } else if (roll < 0.78) {
          ress.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, cavY + 0.0022, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0)),
              new THREE.Vector3(1, 1, 1)
            )
          );
        } else {
          ics.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, cavY + 0.0026, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0)),
              new THREE.Vector3(1, 1, 1)
            )
          );
        }
      }
    }
  }

  const mkInstanced = (
    g: THREE.BufferGeometry,
    mat: THREE.Material,
    list: THREE.Matrix4[]
  ): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(g, mat, Math.max(1, list.length));
    im.count = list.length;
    for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.frustumCulled = false;
    panel.add(im);
    return im;
  };
  mkInstanced(capGeo, lib.capacitor, caps);
  mkInstanced(resGeo, lib.resistor, ress);
  mkInstanced(icGeo, lib.metalPart, ics);

  // 线束(几根跨越腔体的排线)
  for (let i = 0; i < 4; i++) {
    const len = 0.06 + rand() * 0.08;
    const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.0022, 0.006), lib.wire);
    wire.position.set((rand() - 0.5) * 0.24, cavY + 0.004, -0.03 - rand() * 0.05);
    wire.rotation.y = (rand() - 0.5) * 1.2;
    panel.add(wire);
  }

  // ── 面板螺丝(InstancedMesh) ──
  const screwGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.0012, 10);
  const screwM: THREE.Matrix4[] = [];
  for (const [sx, sz] of [
    [-innerW / 2 + 0.007, -0.007],
    [innerW / 2 - 0.007, -0.007],
    [-innerW / 2 + 0.007, -PD + 0.007],
    [innerW / 2 - 0.007, -PD + 0.007],
    [-0.02, -PD / 2],
    [0.16, -PD / 2],
  ] as Array<[number, number]>) {
    screwM.push(new THREE.Matrix4().setPosition(sx, 0.0006, sz));
  }
  mkInstanced(screwGeo, lib.screw, screwM);

  // ── 断电置灰遮罩 ──
  const scrimMat = new THREE.MeshBasicMaterial({
    color: 0x0a0b0d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const scrimPanel = new THREE.Mesh(new THREE.PlaneGeometry(innerW, PD), scrimMat);
  scrimPanel.rotation.x = -Math.PI / 2;
  scrimPanel.position.set(0, 0.0012, -PD / 2);
  scrimPanel.visible = false;
  panel.add(scrimPanel);

  const scrimSide = new THREE.Mesh(new THREE.PlaneGeometry(sideW, sideD), scrimMat.clone());
  scrimSide.rotation.x = -Math.PI / 2;
  scrimSide.position.set((DIM.SIDE_X0 + DIM.SIDE_X1) / 2, DIM.CASE_H + 0.0085, (DIM.KEY_BACK_Z + DIM.KEY_FRONT_Z) / 2);
  scrimSide.visible = false;
  root.add(scrimSide);

  return { root, panel, panelFaceMesh: face, sideFaceMesh, scrimPanel, scrimSide };
}
