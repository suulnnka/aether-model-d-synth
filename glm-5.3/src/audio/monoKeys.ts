/**
 * 单音键盘逻辑(PRD AUD-1,last-note priority):
 *  - press:始终响应最后按下的键(重触发)
 *  - release:若仍有按住的键 → 滑回仍按住的最末键(不重触发);否则全部释放
 *  - 乱序松开、重复按下/抬起均安全
 */

export type MonoEvent =
  | { type: "press"; midi: number } // 新键按下:重触发
  | { type: "glideTo"; midi: number } // 松开后回退到仍按住的键:只滑音高
  | { type: "release" } // 全部释放:进入 Release
  | { type: "panic" };

export class MonoKeyboard {
  private held: number[] = []; // 按下顺序保持
  constructor(private emit: (e: MonoEvent) => void) {}

  get current(): number | null {
    return this.held.length ? this.held[this.held.length - 1] : null;
  }

  isHeld(midi: number): boolean {
    return this.held.includes(midi);
  }

  press(midi: number): void {
    this.held = this.held.filter((m) => m !== midi);
    this.held.push(midi);
    this.emit({ type: "press", midi });
  }

  release(midi: number): void {
    const idx = this.held.indexOf(midi);
    if (idx === -1) return;
    this.held.splice(idx, 1);
    if (this.held.length > 0) {
      this.emit({ type: "glideTo", midi: this.held[this.held.length - 1] });
    } else {
      this.emit({ type: "release" });
    }
  }

  allOff(): void {
    if (this.held.length === 0) return;
    this.held = [];
    this.emit({ type: "panic" });
  }

  heldNotes(): number[] {
    return [...this.held];
  }

  reset(): void {
    this.held = [];
  }
}
