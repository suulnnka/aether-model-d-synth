/**
 * 44 键键盘(PLAY-1 / MDL-1)
 * C3(MIDI 48)起,共 44 键:三个八度 C3–B5 + 高位延伸 8 键(C6–G6)。
 * 白键 26 / 黑键 18,各用一个 InstancedMesh 渲染以控制 draw call。
 */
import * as THREE from "three";
import type { MaterialLibrary } from "./materials";
import { DIM } from "./layout";

export const KEY_COUNT = 44;
export const KEY_START_MIDI = 48; // C3

const BLACK_PC = new Set([1, 3, 6, 8, 10]);
/** 黑键中心相对本八度 C 左边缘的偏移(单位:白键宽度);两黑键组与三黑键组各自对称 */
const BLACK_OFFSET: Record<number, number> = {
  1: 0.82, // C#
  3: 2.18, // D#
  6: 3.78, // F#
  8: 5.0, // G#
  10: 6.22, // A#
};

const WHITE_W = (DIM.KEY_RIGHT - DIM.KEY_LEFT) / 26;
const BLACK_W = WHITE_W * 0.6;
const WHITE_D = DIM.KEY_FRONT_Z - DIM.KEY_BACK_Z;
const BLACK_D = 0.085;
const WHITE_H = 0.014;
const BLACK_H = 0.02;
const WHITE_TOP_Y = 0.104;
const PRESS_ANGLE = 0.045;

export interface Keybed {
  group: THREE.Group;
  white: THREE.InstancedMesh;
  black: THREE.InstancedMesh;
  hits: THREE.Object3D[];
  /** 按下 / 抬起(MIDI 音符号) */
  setPressed(midi: number, on: boolean): void;
  /** InstancedMesh + instanceId → MIDI 音符号 */
  midiOf(mesh: THREE.Object3D, instanceId: number): number | null;
  /** 该音是否为黑键 */
  isBlack(midi: number): boolean;
  /** 屏幕锚点:某个音的世界坐标(用于引导聚光与 tooltip) */
  worldPosition(midi: number, target: THREE.Vector3): THREE.Vector3;
}

interface KeyInfo {
  midi: number;
  black: boolean;
  index: number; // 在白/黑数组中的实例下标
  x: number;
}

export function createKeybed(lib: MaterialLibrary): Keybed {
  const group = new THREE.Group();
  const infos: KeyInfo[] = [];
  const whiteCountAt: number[] = [];
  let whiteN = 0;
  let blackN = 0;

  for (let i = 0; i < KEY_COUNT; i++) {
    const midi = KEY_START_MIDI + i;
    const pc = midi % 12;
    const black = BLACK_PC.has(pc);
    whiteCountAt[i] = whiteN;
    if (!black) {
      infos.push({ midi, black: false, index: whiteN, x: DIM.KEY_LEFT + (whiteN + 0.5) * WHITE_W });
      whiteN++;
    } else {
      const cIdx = i - pc;
      const wIdx = whiteCountAt[cIdx] ?? 0;
      const x = DIM.KEY_LEFT + (wIdx + BLACK_OFFSET[pc]) * WHITE_W;
      infos.push({ midi, black: true, index: blackN, x });
      blackN++;
    }
  }

  // 白键:主体 + 前裙边(合并为单个实例几何)
  const whiteGeo = new THREE.BoxGeometry(WHITE_W - 0.0009, WHITE_H, WHITE_D);
  const blackGeo = new THREE.BoxGeometry(BLACK_W, BLACK_H, BLACK_D);

  const white = new THREE.InstancedMesh(whiteGeo, lib.keyWhite, whiteN);
  const black = new THREE.InstancedMesh(blackGeo, lib.keyBlack, blackN);
  white.castShadow = black.castShadow = true;
  white.receiveShadow = black.receiveShadow = true;
  white.frustumCulled = black.frustumCulled = false;

  const infoByMidi = new Map<number, KeyInfo>();
  const midiByLookup = new Map<string, number>();

  const tmpMatrix = new THREE.Matrix4();
  const pivotY = WHITE_TOP_Y;

  /** 绕后缘下沿旋转:正向角度使前端下沉 */
  const writeMatrix = (mesh: THREE.InstancedMesh, info: KeyInfo, pressed: boolean): void => {
    const h = info.black ? BLACK_H : WHITE_H;
    const d = info.black ? BLACK_D : WHITE_D;
    const cy = info.black ? 0.112 + h / 2 : WHITE_TOP_Y + h / 2;
    const cz = DIM.KEY_BACK_Z + d / 2;
    const t1 = new THREE.Matrix4().makeTranslation(info.x, pivotY, DIM.KEY_BACK_Z);
    const r = new THREE.Matrix4().makeRotationX(pressed ? PRESS_ANGLE : 0);
    const t2 = new THREE.Matrix4().makeTranslation(0, cy - pivotY, cz - DIM.KEY_BACK_Z);
    tmpMatrix.multiplyMatrices(t1, r).multiply(t2);
    mesh.setMatrixAt(info.index, tmpMatrix);
  };

  const pressedSet = new Set<number>();
  for (const info of infos) {
    infoByMidi.set(info.midi, info);
    midiByLookup.set(`${info.black ? "b" : "w"}:${info.index}`, info.midi);
    writeMatrix(info.black ? black : white, info, false);
  }
  white.instanceMatrix.needsUpdate = true;
  black.instanceMatrix.needsUpdate = true;

  group.add(white, black);

  return {
    group,
    white,
    black,
    hits: [white, black],
    setPressed(midi, on) {
      const info = infoByMidi.get(midi);
      if (!info) return;
      if (on) pressedSet.add(midi);
      else pressedSet.delete(midi);
      writeMatrix(info.black ? black : white, info, on);
      (info.black ? black : white).instanceMatrix.needsUpdate = true;
    },
    midiOf(mesh, instanceId) {
      const key = mesh === black ? `b:${instanceId}` : mesh === white ? `w:${instanceId}` : "";
      if (!key) return null;
      return midiByLookup.get(key) ?? null;
    },
    isBlack(midi) {
      return BLACK_PC.has(((midi % 12) + 12) % 12);
    },
    worldPosition(midi, target) {
      const info = infoByMidi.get(midi);
      if (!info) return target.set(0, 0, 0);
      const d = info.black ? BLACK_D : WHITE_D;
      return target.set(info.x, info.black ? 0.132 : WHITE_TOP_Y + WHITE_H, DIM.KEY_BACK_Z + d * 0.75);
    },
  };
}
