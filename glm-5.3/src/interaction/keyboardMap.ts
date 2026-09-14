/**
 * 电脑键盘演奏映射(PRD §7):
 * 主行 A W S E D F T G Y H U J K O L P ; ' → 基准音起半音上行(基准默认 C4)
 * 下排 Z X C V B N M , . / → 基准音低一个八度的白键区
 * - / = 基准八度下移/上移(F2–C6 内钳位);空格 panic;V 视角;H 面板;? 帮助
 */

export const MAIN_ROW: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10,
  j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17,
};

// 基准音低一个八度的白键区
export const LOWER_ROW: Record<string, number> = {
  z: -12, x: -10, c: -8, v: -7, b: -5, n: -3, m: -1, ",": 0, ".": 2, "/": 4,
};

export const KEY_LOW = 41; // F2
export const KEY_HIGH = 84; // C6

export const BASE_DEFAULT = 60; // C4
const BASE_MIN = 48; // C3(保证下排键仍在音域内)
const BASE_MAX = 72;

export function baseWithShift(base: number, dir: 1 | -1): number {
  return Math.min(BASE_MAX, Math.max(BASE_MIN, base + dir * 12));
}

export function keyToMidi(key: string, base: number): number | null {
  const k = key.toLowerCase();
  const main = MAIN_ROW[k];
  if (main !== undefined) {
    const midi = base + main;
    return midi >= KEY_LOW && midi <= KEY_HIGH ? midi : null;
  }
  const lower = LOWER_ROW[k];
  if (lower !== undefined) {
    const midi = base + lower;
    return midi >= KEY_LOW && midi <= KEY_HIGH ? midi : null;
  }
  return null;
}

/** 键盘演奏控制器:防 repeat、滑奏、乱序松开 */
export class TypewriterKeyboard {
  private heldByKey = new Map<string, number>(); // 物理键 → midi
  private held: number[] = [];
  base = BASE_DEFAULT;

  constructor(
    private noteOn: (m: number) => void,
    private noteOff: (m: number) => void
  ) {}

  get heldNotes(): number[] {
    return [...this.held];
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return false;
    const midi = keyToMidi(e.key, this.base);
    if (midi === null) return false;
    e.preventDefault();
    if (this.heldByKey.has(e.code + e.key)) return true;
    this.heldByKey.set(e.code + e.key, midi);
    this.held = this.held.filter((m) => m !== midi);
    this.held.push(midi);
    this.noteOn(midi);
    return true;
  }

  handleKeyUp(e: KeyboardEvent): boolean {
    const id = e.code + e.key;
    const midi = this.heldByKey.get(id);
    if (midi === undefined) return false;
    this.heldByKey.delete(id);
    this.held = this.held.filter((m) => m !== midi);
    this.noteOff(midi);
    return true;
  }

  /** 失焦/panic:清空全部映射 */
  allOff(): void {
    for (const midi of this.heldByKey.values()) this.noteOff(midi);
    this.heldByKey.clear();
    this.held = [];
  }

  /** 移动基准八度后,仍按着的键释放时按原 midi 释放(映射快照已保存)✓ */
}
