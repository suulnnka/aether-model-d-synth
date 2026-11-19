import type { SynthEngine } from "../audio/engine.ts";
import type { SynthModel } from "../model/synth.ts";
import type { ParamStore } from "../state/paramStore.ts";

export interface MidiCallbacks {
  onDeviceChange?: (deviceName: string | null) => void;
  onNoteActivity?: (midi: number | null) => void;
}

export class MidiInput {
  private access: MIDIAccess | null = null;

  constructor(
    private readonly store: ParamStore,
    private readonly engine: SynthEngine,
    private readonly model: SynthModel,
    private readonly cb: MidiCallbacks = {},
  ) {
    if (typeof navigator !== "undefined" && "requestMIDIAccess" in navigator) {
      void this.connect();
    }
  }

  private async connect(): Promise<void> {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.access = access;
      this.bindInputs();
      access.onstatechange = () => this.bindInputs();
    } catch {
      this.cb.onDeviceChange?.(null);
    }
  }

  private bindInputs(): void {
    if (!this.access) return;
    let firstName: string | null = null;
    for (const input of this.access.inputs.values()) {
      if (!firstName) firstName = input.name || "MIDI Keyboard";
      input.onmidimessage = this.onMessage;
    }
    this.cb.onDeviceChange?.(firstName);
  }

  private onMessage = (ev: MIDIMessageEvent): void => {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && d2 > 0) {
      void this.engine.ensureStarted();
      this.model.setKeyPressed(d1, true);
      this.engine.noteOn(d1);
      this.cb.onNoteActivity?.(d1);
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      this.model.setKeyPressed(d1, false);
      this.engine.noteOff(d1);
      const held = this.engine.getHeldNotes();
      this.cb.onNoteActivity?.(held.length > 0 ? held[held.length - 1] : null);
    } else if (status === 0xe0 && data.length >= 3) {
      // 14-bit pitch bend: 8192 = center -> 0..100
      const raw14 = (d2 << 7) | d1;
      this.store.set("pitchWheel", (raw14 / 16383) * 100);
    } else if (status === 0xb0 && data.length >= 3) {
      if (d1 === 1) {
        // CC#1 Modulation Wheel
        this.store.set("modWheel", (d2 / 127) * 100);
      } else if (d1 === 74) {
        // CC#74 Cutoff
        this.store.set("filterCutoff", -5 + (d2 / 127) * 10);
      } else if (d1 === 123) {
        this.engine.panic();
      }
    }
  };

  dispose(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = null;
    }
  }
}
