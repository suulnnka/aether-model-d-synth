/**
 * 单音键盘逻辑(AUD-1 / AUD-2 / AUD-11):last-note priority。
 * 纯逻辑类,与音频图解耦,QWERTY / 鼠标 / MIDI 共用同一通道。
 */

export interface KeyboardEvents {
  /** 新音高触发(新按键,或松键回退到仍按住的最末键) */
  onPitch(midi: number, retrigger: boolean): void;
  /** 全部松开 → 进入释放段 */
  onRelease(): void;
}

export class MonoKeyboard {
  private stack: number[] = [];
  private events: KeyboardEvents;

  constructor(events: KeyboardEvents) {
    this.events = events;
  }

  get currentNote(): number | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  get heldNotes(): readonly number[] {
    return this.stack;
  }

  /** 按下:始终响应最后按下的键;每次新按键都重新触发两条包络(AUD-2) */
  noteOn(midi: number): void {
    midi = Math.round(midi);
    // 去重:同一键重复按下视为一次
    if (this.stack[this.stack.length - 1] === midi) return;
    this.stack = this.stack.filter((m) => m !== midi);
    this.stack.push(midi);
    this.events.onPitch(midi, true);
  }

  /** 抬起:移除;若抬起的是当前音,回退到仍按住的最末键(滑音,不重触发) */
  noteOff(midi: number): void {
    midi = Math.round(midi);
    const idx = this.stack.indexOf(midi);
    if (idx === -1) return;
    const wasTop = idx === this.stack.length - 1;
    this.stack.splice(idx, 1);
    if (this.stack.length === 0) {
      this.events.onRelease();
      return;
    }
    if (wasTop) {
      this.events.onPitch(this.stack[this.stack.length - 1], false);
    }
  }

  allOff(): void {
    if (this.stack.length === 0) return;
    this.stack = [];
    this.events.onRelease();
  }
}
