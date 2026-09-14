import { describe, expect, it } from "vitest";
import { MonoKeyboard } from "../src/audio/monoKeys";
import { ParamStore } from "../src/state/paramStore";
import { glideSeconds, normToRaw, rawToNorm, PARAM_DEFS } from "../src/state/params";
import {
  TypewriterKeyboard,
  baseWithShift,
  keyToMidi,
} from "../src/interaction/keyboardMap";

describe("单音键盘逻辑(AUD-1 last-note priority)", () => {
  function collect() {
    const events: string[] = [];
    const kb = new MonoKeyboard((e) => {
      if (e.type === "press") events.push(`press:${e.midi}`);
      else if (e.type === "glideTo") events.push(`glide:${e.midi}`);
      else if (e.type === "release") events.push("release");
      else if (e.type === "panic") events.push("panic");
    });
    return { kb, events };
  }

  it("最后按下的键优先", () => {
    const { kb, events } = collect();
    kb.press(60);
    kb.press(64);
    expect(events).toEqual(["press:60", "press:64"]);
    expect(kb.current).toBe(64);
  });

  it("乱序松开回退到仍按住的最末键(只滑音,不重触发)", () => {
    const { kb, events } = collect();
    kb.press(60);
    kb.press(64);
    kb.press(67);
    kb.release(67);
    expect(events[events.length - 1]).toBe("glide:64");
    kb.release(60); // 松开的不是当前音
    expect(kb.current).toBe(64);
    kb.release(64);
    expect(events[events.length - 1]).toBe("release");
  });

  it("重复按下同一键安全", () => {
    const { kb, events } = collect();
    kb.press(60);
    kb.press(60);
    expect(events.filter((e) => e === "press:60").length).toBe(2);
    kb.release(60);
    expect(kb.current).toBeNull();
  });

  it("panic 清空", () => {
    const { kb, events } = collect();
    kb.press(60);
    kb.press(72);
    kb.allOff();
    expect(kb.current).toBeNull();
    expect(events[events.length - 1]).toBe("panic");
  });
});

describe("键盘演奏映射(§7)", () => {
  it("主行从基准 C4 半音上行", () => {
    expect(keyToMidi("a", 60)).toBe(60);
    expect(keyToMidi("w", 60)).toBe(61);
    expect(keyToMidi("s", 60)).toBe(62);
    expect(keyToMidi("'", 60)).toBe(77);
  });

  it("下排为低一个八度白键区", () => {
    expect(keyToMidi("z", 60)).toBe(48);
    expect(keyToMidi("x", 60)).toBe(50);
    expect(keyToMidi("m", 60)).toBe(59);
    expect(keyToMidi("/", 60)).toBe(64);
  });

  it("八度移动并钳位到 F2–C6", () => {
    expect(baseWithShift(60, 1)).toBe(72);
    expect(baseWithShift(60, -1)).toBe(48);
    expect(baseWithShift(48, -1)).toBe(48); // 钳位
    // 超出音域的键返回 null
    expect(keyToMidi("'", 48)).toBe(65);
    expect(keyToMidi("a", 48)).toBe(48);
  });

  it("打字机键盘按下/抬起配对、失焦全清", () => {
    const on: number[] = [];
    const off: number[] = [];
    const tk = new TypewriterKeyboard((m) => on.push(m), (m) => off.push(m));
    const mk = (key: string, code: string): KeyboardEvent =>
      ({ key, code, repeat: false, preventDefault: () => {} } as unknown as KeyboardEvent);
    expect(tk.handleKeyDown(mk("a", "KeyA"))).toBe(true);
    expect(tk.handleKeyDown(mk("k", "KeyK"))).toBe(true);
    tk.handleKeyUp(mk("a", "KeyA"));
    expect(off).toEqual([60]);
    tk.allOff();
    expect(off).toEqual([60, 72]);
    expect(tk.heldNotes).toEqual([]);
  });
});

describe("ParamStore(ST-1)", () => {
  it("全部 §6 控件注册且默认值正确", () => {
    const s = new ParamStore(null);
    expect(s.get("cutoff")).toBeCloseTo(2200, 0);
    expect(s.get("volume")).toBe(6);
    expect(s.get("osc1Wave")).toBe(1); // 锯齿
    expect(s.get("osc3Wave")).toBe(0); // 三角
    expect(s.get("loudSustain")).toBe(1);
    expect(s.get("power")).toBe(1);
    // §6 控件接入率 100%:每个定义都能读写
    for (const def of PARAM_DEFS) {
      s.set(def.id, def.max);
      expect(s.get(def.id)).toBe(def.max);
    }
  });

  it("档位步进循环", () => {
    const s = new ParamStore(null);
    s.set("osc1Range", 4); // 2'
    s.step("osc1Range", 1); // 回绕到 32'
    expect(s.get("osc1Range")).toBe(0);
    s.step("osc1Range", -1);
    expect(s.get("osc1Range")).toBe(4);
  });

  it("开关只有两档", () => {
    const s = new ParamStore(null);
    s.step("modSwitch", 1);
    expect(s.isOn("modSwitch")).toBe(true);
    s.step("modSwitch", 1);
    expect(s.isOn("modSwitch")).toBe(true);
    s.step("modSwitch", -1);
    expect(s.isOn("modSwitch")).toBe(false);
  });

  it("订阅发布", () => {
    const s = new ParamStore(null);
    const got: number[] = [];
    s.subscribe("cutoff", (_id, v) => got.push(v));
    s.set("cutoff", 5000);
    s.set("cutoff", 5000); // 不重复发布
    expect(got).toEqual([5000]);
  });

  it("localStorage 持久化与恢复", () => {
    const mem = new Map<string, string>();
    const fake = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const s1 = new ParamStore(fake);
    s1.set("cutoff", 3333);
    s1.saveNow();
    const s2 = new ParamStore(fake);
    expect(s2.loadPersisted()).toBe(true);
    expect(s2.get("cutoff")).toBe(3333);
  });
});

describe("映射曲线(§6)", () => {
  it("Glide 指数映射 5ms–2.5s", () => {
    expect(glideSeconds(0)).toBe(0);
    expect(glideSeconds(10)).toBeCloseTo(2.5, 1);
    // 5 → 半程 ≈ √500 × 5ms ≈ 0.112s
    expect(glideSeconds(5)).toBeCloseTo(0.005 * Math.sqrt(500), 3);
  });

  it("截止频率对数归一化往返", () => {
    const def = PARAM_DEFS.find((d) => d.id === "cutoff")!;
    const n = rawToNorm(def, 2200);
    expect(normToRaw(def, n)).toBeCloseTo(2200, 0);
    expect(rawToNorm(def, def.min)).toBeCloseTo(0, 5);
    expect(rawToNorm(def, def.max)).toBeCloseTo(1, 5);
  });

  it("包络时间对数归一化往返", () => {
    const def = PARAM_DEFS.find((d) => d.id === "loudA")!;
    expect(normToRaw(def, rawToNorm(def, 0.3))).toBeCloseTo(0.3, 4);
  });
});
