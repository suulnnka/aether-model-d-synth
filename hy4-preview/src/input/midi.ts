/**
 * Web MIDI 输入(input/midi.ts)
 * PLAY-3:即插即用;Note On/Off、Pitch Bend、CC1 = 调制轮;多设备并存;
 * 不支持时静默降级。
 */
import { params } from "../state/params";

export interface MidiInputHooks {
  noteOn(midi: number): void;
  noteOff(midi: number): void;
  onGesture(): void;
}

/** 未内置 Web MIDI 类型时的最小结构描述 */
interface MIDIAccessLike {
  inputs: Map<string, MIDIInput>;
  onstatechange: ((e: Event) => void) | null;
}

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccessLike | MIDIAccess>;
};

export interface MidiInput {
  available: boolean;
  deviceNames(): string[];
  dispose(): void;
}

const pitchBendToWheel = (lsb: number, msb: number): number => {
  const v14 = (msb << 7) | lsb; // 0..16383,8192 为中位
  return Math.max(0, Math.min(100, (v14 / 16383) * 100));
};

export async function createMidiInput(hooks: MidiInputHooks): Promise<MidiInput> {
  const nav = navigator as NavigatorWithMidi;
  const names: string[] = [];

  if (!nav.requestMIDIAccess) {
    return { available: false, deviceNames: () => [], dispose() {} };
  }

  let access: MIDIAccessLike;
  try {
    access = (await nav.requestMIDIAccess!({ sysex: false })) as unknown as MIDIAccessLike;
  } catch {
    return { available: false, deviceNames: () => [], dispose() {} };
  }

  const attached = new Set<MIDIInput>();

  const onMessage = (ev: Event): void => {
    const e = ev as MIDIMessageEvent;
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    const a = d[1];
    const b = d.length > 2 ? d[2] : 0;
    switch (status) {
      case 0x90: // Note On
        if (b > 0) {
          hooks.onGesture();
          hooks.noteOn(a);
        } else {
          hooks.noteOff(a);
        }
        break;
      case 0x80: // Note Off
        hooks.noteOff(a);
        break;
      case 0xb0: // CC
        if (a === 1) params.set("modWheel", (b / 127) * 100); // CC1 = 调制轮
        else if (a === 123 || a === 120) params.set("modWheel", 0);
        break;
      case 0xe0: // Pitch Bend
        params.set("pitchWheel", pitchBendToWheel(a, b));
        break;
      default:
        break;
    }
  };

  const attach = (): void => {
    names.length = 0;
    access.inputs.forEach((input) => {
      names.push(input.name || input.id);
      if (attached.has(input)) return;
      attached.add(input);
      input.addEventListener("midimessage", onMessage);
    });
  };

  attach();
  access.onstatechange = () => attach();

  return {
    available: true,
    deviceNames: () => [...names],
    dispose() {
      access.onstatechange = null;
      for (const input of attached) input.removeEventListener("midimessage", onMessage);
      attached.clear();
    },
  };
}
