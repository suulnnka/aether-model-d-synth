/**
 * 44 键键盘(PLAY-1 / 附录 B):C3–B5 三个八度 + 高位延伸 8 键(C6–G6)。
 * 白键 / 黑键各一个 InstancedMesh,按下下沉行程由矩阵更新(INT-4 / INT-6)。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import {
  BLACK_KEY_LEN,
  BLACK_KEY_W,
  DIM,
  WHITE_KEY_W,
  keyLayout,
} from "./dimensions";

export interface KeyState {
  midi: number;
  pressed: boolean;
  /** 实例矩阵需要的世界位置 */
  x: number;
  black: boolean;
  whiteIndex: number;
  blackIndex: number;
}

export class KeyboardModel {
  group = new THREE.Group();
  whites: THREE.InstancedMesh;
  blacks: THREE.InstancedMesh;
  keys: KeyState[] = [];
  private whiteGeo: THREE.BoxGeometry;
  private blackGeo: THREE.BoxGeometry;
  private dummy = new THREE.Object3D();

  constructor(mats: MaterialLibrary) {
    // 白键:前端微斜(顶面比底面短一点,用普通盒子 + 前缘倒角近似)
    this.whiteGeo = new THREE.BoxGeometry(WHITE_KEY_W * 0.94, 0.0105, DIM.keyLen);
    this.blackGeo = new THREE.BoxGeometry(BLACK_KEY_W, 0.0115, BLACK_KEY_LEN);

    const layout = keyLayout();
    const whiteCount = layout.filter((k) => !k.black).length;
    const blackCount = layout.length - whiteCount;

    this.whites = new THREE.InstancedMesh(this.whiteGeo, mats.whiteKey, whiteCount);
    this.blacks = new THREE.InstancedMesh(this.blackGeo, mats.blackKey, blackCount);
    this.whites.castShadow = this.blacks.castShadow = true;
    this.whites.receiveShadow = this.blacks.receiveShadow = true;

    let wi = 0;
    let bi = 0;
    for (const k of layout) {
      const st: KeyState = {
        midi: k.midi,
        pressed: false,
        x: k.x,
        black: k.black,
        whiteIndex: wi,
        blackIndex: bi,
      };
      this.keys.push(st);
      if (k.black) bi++;
      else wi++;
    }
    this.syncAll();

    this.whites.userData.pickKeys = this;
    this.blacks.userData.pickKeys = this;
    this.group.add(this.whites, this.blacks);
  }

  keyByInstance(mesh: THREE.InstancedMesh, instanceId: number): KeyState {
    // 先校验该键属于命中的网格(白/黑各一个 InstancedMesh),再比对实例索引
    const st = this.keys.find(
      (k) =>
        (k.black ? this.blacks : this.whites) === mesh &&
        (k.black ? k.blackIndex === instanceId : k.whiteIndex === instanceId),
    );
    return st!;
  }

  keyByMidi(midi: number): KeyState | undefined {
    return this.keys.find((k) => k.midi === midi);
  }

  setPressed(midi: number, pressed: boolean): void {
    const k = this.keyByMidi(midi);
    if (!k || k.pressed === pressed) return;
    k.pressed = pressed;
    this.writeMatrix(k);
  }

  private writeMatrix(k: KeyState): void {
    const y = k.black
      ? DIM.keyTopY + 0.0098 - (k.pressed ? 0.0042 : 0)
      : DIM.keyTopY - 0.0052 - (k.pressed ? 0.0042 : 0);
    const z = k.black
      ? DIM.frontLip - BLACK_KEY_LEN / 2 - 0.012
      : DIM.frontLip - DIM.keyLen / 2 - 0.006;
    this.dummy.position.set(k.x, y, z);
    this.dummy.rotation.x = k.pressed ? 0.012 : 0;
    this.dummy.updateMatrix();
    if (k.black) {
      this.blacks.setMatrixAt(k.blackIndex, this.dummy.matrix);
      this.blacks.instanceMatrix.needsUpdate = true;
    } else {
      this.whites.setMatrixAt(k.whiteIndex, this.dummy.matrix);
      this.whites.instanceMatrix.needsUpdate = true;
    }
  }

  syncAll(): void {
    for (const k of this.keys) this.writeMatrix(k);
  }

  /** 供 raycast:键顶世界 Y(近似) */
  static keyTopY(black: boolean): number {
    return black ? DIM.keyTopY + 0.0098 : DIM.keyTopY + 0.005;
  }
}
