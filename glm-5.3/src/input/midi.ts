/**
 * Web MIDI 输入(PLAY-3):Note On/Off、Pitch Bend、CC1 = 调制轮;
 * 多设备并存;不支持时静默降级。
 */
import type { ParamStore } from "../state/paramStore";
import type { SynthEngine } from "../audio/engine";
import type { Interactions } from "../interaction/interactions";

/* 最小 MIDI 类型声明(避免依赖 @types/webmidi) */
interface MidiMessageEvent extends Event {
  data: Uint8Array<ArrayBuffer | ArrayBufferLike> | null;
}
interface MidiInputT extends EventTarget {
  id: string;
  name?: string | null;
}
interface MidiInputList {
  values(): IterableIterator<MidiInputT>;
}
interface MidiAccessT extends EventTarget {
  inputs: MidiInputList;
}

export class MidiInput {
  private store: ParamStore;
  private engine: SynthEngine;
  private interactions: Interactions;
  private access: MidiAccessT | null = null;
  private inputs = new Map<string, MidiInputT>();

  constructor(store: ParamStore, engine: SynthEngine, interactions: Interactions) {
    this.store = store;
    this.engine = engine;
    this.interactions = interactions;
    this.init();
  }

  private async init(): Promise<void> {
    const request = (navigator as unknown as {
      requestMIDIAccess?: () => Promise<MidiAccessT>;
    }).requestMIDIAccess;
    if (!request) return; // 静默降级
    try {
      this.access = await request.call(navigator);
      this.bindInputs();
      this.access.addEventListener("statechange", () => this.bindInputs());
    } catch {
      /* 拒绝授权或不可用:静默 */
    }
  }

  private bindInputs(): void {
    if (!this.access) return;
    const seen = new Set<string>();
    for (const input of this.access.inputs.values()) {
      seen.add(input.id);
      if (!this.inputs.has(input.id)) {
        this.inputs.set(input.id, input);
        input.addEventListener("midimessage", this.onMessage);
      }
    }
    for (const [id, input] of this.inputs) {
      if (!seen.has(id)) {
        input.removeEventListener("midimessage", this.onMessage);
        this.inputs.delete(id);
      }
    }
  }

  private onMessage = (e: Event): void => {
    const msg = e as MidiMessageEvent;
    const data = msg.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;
    switch (status) {
      case 0x90:
        if (d2 > 0) {
          this.engine.noteOn(d1);
          this.interactions.setKeyVisual(d1, true);
        } else {
          this.engine.noteOff(d1);
          this.interactions.setKeyVisual(d1, false);
        }
        break;
      case 0x80:
        this.engine.noteOff(d1);
        this.interactions.setKeyVisual(d1, false);
        break;
      case 0xe0: {
        // Pitch Bend:0..16383 → 0..100(50 = 中位)
        const raw = (d2 << 7) | d1;
        const wheel = Math.round(((raw - 8192) / 8191) * 50 + 50);
        this.store.set("pitchWheel", Math.max(0, Math.min(100, wheel)));
        break;
      }
      case 0xb0:
        if (d1 === 1) {
          // CC1 调制轮
          this.store.set("modWheel", Math.round((d2 / 127) * 100));
        }
        break;
      default:
        break;
    }
  };

  dispose(): void {
    for (const input of this.inputs.values()) {
      input.removeEventListener("midimessage", this.onMessage);
    }
    this.inputs.clear();
  }
}
