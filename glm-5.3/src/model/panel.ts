import * as THREE from "three";
import { DIMS, HINGE_POS } from "./dimensions";
import type { MaterialLib } from "./materials";
import { paintPanelSilk } from "./silkscreen";

/**
 * 铰链控制面板(MDL-1/HINGE-1):面板金属板 + 边框 + 铰链轴细节 + 丝印贴图。
 * 组原点位于铰链轴(键盘段后缘):面板向局部 -z(机身后方)延伸,
 * rotation.x = +θ 时后缘抬升、控制面朝向玩家(与实物一致)。
 */

export interface PanelAssembly {
  group: THREE.Group; // 面板组(旋转)
  /** 面板前缘拖拽条带(HINGE-3 命中区,悬停高亮) */
  edgeStrip: THREE.Mesh;
  /** 布点转换:布局坐标 (x[米,自左], y[米,自前缘]) → 面板组局部坐标 */
  localPos(x: number, y: number, lift: number): THREE.Vector3;
}

export function createPanel(mats: MaterialLib): PanelAssembly {
  const group = new THREE.Group();
  group.position.set(HINGE_POS.x, HINGE_POS.y, HINGE_POS.z);

  const W = DIMS.panelW;
  const D = DIMS.panelD;
  const T = DIMS.panelT;

  // 边框(稍大的底板)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.008, D + 0.012), mats.brushed);
  frame.position.set(0, -T / 2 - 0.002, -D / 2);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // 面板金属板
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), mats.panelSide);
  plate.position.set(0, -T / 2, -D / 2);
  plate.castShadow = true;
  group.add(plate);

  // 丝印面(Plane:局部 +y(v=1)旋转后指向 -z 后缘,canvas 顶行 = 后缘,立起时文字正立)
  const silkCanvas = paintPanelSilk();
  const silkTex = new THREE.CanvasTexture(silkCanvas);
  silkTex.colorSpace = THREE.SRGBColorSpace;
  silkTex.anisotropy = 8;
  const silkMat = new THREE.MeshStandardMaterial({
    map: silkTex,
    metalness: 0.12,
    roughness: 0.62,
  });
  const silk = new THREE.Mesh(new THREE.PlaneGeometry(W, D), silkMat);
  silk.rotation.x = -Math.PI / 2;
  silk.position.set(0, 0.0004, -D / 2);
  group.add(silk);

  // 铰链轴细节:沿 x 的三段圆柱(位于铰链线处)
  const hingeGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 14);
  hingeGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.17, 0, 0.17]) {
    const h = new THREE.Mesh(hingeGeo, mats.brushed);
    h.position.set(x, -T / 2 + 0.001, 0.003);
    h.castShadow = true;
    group.add(h);
  }

  // 面板螺丝(四角,MDL-4)
  const screwGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 12);
  for (const [sx, sz] of [
    [-W / 2 + 0.012, -0.01],
    [W / 2 - 0.012, -0.01],
    [-W / 2 + 0.012, -(D - 0.01)],
    [W / 2 - 0.012, -(D - 0.01)],
  ]) {
    const s = new THREE.Mesh(screwGeo, mats.brushed);
    s.position.set(sx, 0.0006, sz);
    group.add(s);
  }

  // 前缘拖拽条带(HINGE-3,铰链侧边条)
  const edgeStrip = new THREE.Mesh(
    new THREE.BoxGeometry(W, T * 1.4, 0.012),
    new THREE.MeshStandardMaterial({
      color: 0x8a6a30,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 0.0,
    })
  );
  edgeStrip.position.set(0, -T / 2, 0.002);
  edgeStrip.name = "hinge-edge";
  group.add(edgeStrip);

  const localPos = (x: number, y: number, lift: number): THREE.Vector3 => {
    // 布局 y(自前缘=铰链侧)→ 局部 -z(向机身后方延伸)
    return new THREE.Vector3(x - W / 2, lift, -y);
  };

  return { group, edgeStrip, localPos };
}

/** 面板角度 → 组旋转(0°=放平,60°=最立;后缘抬升,控制面朝玩家) */
export function setPanelAngle(group: THREE.Group, deg: number): void {
  group.rotation.x = THREE.MathUtils.degToRad(deg);
}
