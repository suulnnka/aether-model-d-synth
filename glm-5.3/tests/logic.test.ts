/**
 * 逻辑单元测试(Vitest,Node 环境):
 * 单音优先级、映射曲线、36 预设取值、ParamStore 语义、QWERTY 映射。
 */
import { describe, expect, it } from "vitest";
import { MonoKeyboard } from "../src/audio/monoKeys";
import {
  contourOctaves,
  cutoffHz,
  envSeconds,
  glideSeconds,
  kcOctaves,
  lfoHz,
  resonance,
} from "../src/audio/mapping";
import { harmonicSeries, sampleWave } from "../src/audio/waveforms";
import { PRESETS } from "../src/state/presets";
import { ParamStore, SPECS, SPEC_BY_ID, WAVE_ALIAS } from "../src/state/paramStore";
import { KEY_TO_SEMITONE } from "../src/input/qwerty";
import { keyLayout } from "../src/model/dimensions";

describe("MonoKeyboard 单音逻辑(AUD-1)", () => {
  it("响应最后按下的键", () => {
    const events: Array<[number, boolean]> = [];
    const kb = new MonoKeyboard({
      onPitch: (midi, retrigger) => events.push([midi, retrigger]),
      onRelease: () => events.push([-1, false]),
    });
    kb.noteOn(60);
    kb.noteOn(64);
    kb.noteOn(67);
    expect(kb.currentNote).toBe(67);
    expect(events.map((e) => e[0])).toEqual([60, 64, 67]);
    expect(events.every((e) => e[1])).toBe(true); // 每次新按键都重触发
  });

  it("乱序松开:回退到仍按住的最末键(滑音,不重触发)", () => {
    const events: Array<[number, boolean]> = [];
    const kb = new MonoKeyboard({
      onPitch: (midi, retrigger) => events.push([midi, retrigger]),
      onRelease: () => events.push([-1, false]),
    });
    kb.noteOn(60);
    kb.noteOn(64);
    kb.noteOn(67);
    events.length = 0;
    kb.noteOff(60); // 松开非当前键:无事件
    expect(events).toEqual([]);
    kb.noteOff(67); // 松开当前键:回退到 64,不重触发
    expect(events).toEqual([[64, false]]);
    kb.noteOff(64); // 全部松开:释放
    expect(events[1]).toEqual([-1, false]);
  });

  it("重复按下同一键去重", () => {
    const kb = new MonoKeyboard({ onPitch: () => {}, onRelease: () => {} });
    kb.noteOn(60);
    kb.noteOn(60);
    expect(kb.heldNotes).toEqual([60]);
  });

  it("allOff 触发释放", () => {
    let released = 0;
    const kb = new MonoKeyboard({ onPitch: () => {}, onRelease: () => released++ });
    kb.noteOn(60);
    kb.noteOn(62);
    kb.allOff();
    expect(released).toBe(1);
    expect(kb.currentNote).toBeNull();
  });
});

describe("映射曲线(PRD §10 / §15)", () => {
  it("包络分段映射(AUD-8 停靠点)", () => {
    expect(envSeconds(0)).toBe(0);
    expect(envSeconds(1)).toBeCloseTo(0.01, 5);
    expect(envSeconds(2)).toBeCloseTo(0.2, 5);
    expect(envSeconds(4)).toBeCloseTo(0.6, 5);
    expect(envSeconds(6)).toBeCloseTo(1.0, 5);
    expect(envSeconds(8)).toBeCloseTo(5.0, 5);
    expect(envSeconds(10)).toBeCloseTo(10.0, 5);
  });

  it("cutoff −5..+5 → 10Hz–32kHz 单调", () => {
    expect(cutoffHz(-5)).toBeCloseTo(10, 3);
    expect(cutoffHz(5)).toBeCloseTo(32000, -2);
    let prev = 0;
    for (let v = -5; v <= 5; v += 0.25) {
      const hz = cutoffHz(v);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
  });

  it("resonance 0–1,高端进入自激区", () => {
    expect(resonance(0)).toBe(0);
    expect(resonance(10)).toBeCloseTo(1, 5);
    expect(resonance(8)).toBeGreaterThan(0.6);
  });

  it("glide 5ms–2.5s 指数(AUD-11)", () => {
    expect(glideSeconds(0)).toBeCloseTo(0.005, 5);
    expect(glideSeconds(10)).toBeCloseTo(2.5, 5);
    expect(glideSeconds(5)).toBeGreaterThan(0.1);
    expect(glideSeconds(5)).toBeLessThan(0.3);
  });

  it("LFO 0.2–20Hz 对数", () => {
    expect(lfoHz(0)).toBeCloseTo(0.2, 5);
    expect(lfoHz(10)).toBeCloseTo(20, 5);
    expect(lfoHz(5)).toBeCloseTo(0.2 * 10, 5);
  });

  it("键盘跟踪 KC1 +100% / KC2 +50%(AUD-7)", () => {
    expect(kcOctaves(false, false)).toBe(0);
    expect(kcOctaves(true, false)).toBe(1);
    expect(kcOctaves(false, true)).toBe(0.5);
    expect(kcOctaves(true, true)).toBeCloseTo(1.5, 10);
  });

  it("contour 深度单调有界", () => {
    expect(contourOctaves(0)).toBe(0);
    expect(contourOctaves(10)).toBeCloseTo(5.5, 5);
    expect(contourOctaves(5)).toBeLessThan(contourOctaves(6));
  });
});

describe("带限波表(AUD-4)", () => {
  it("锯齿波谐波近似 1/n", () => {
    const { real, imag } = harmonicSeries("sawtooth");
    expect(Math.abs(real[1])).toBeLessThan(1e-6);
    const h1 = Math.abs(imag[1]);
    const h2 = Math.abs(imag[2]);
    const h3 = Math.abs(imag[3]);
    expect(h2 / h1).toBeGreaterThan(0.4);
    expect(h2 / h1).toBeLessThan(0.6);
    expect(h3 / h1).toBeGreaterThan(0.25);
    expect(h3 / h1).toBeLessThan(0.42);
  });

  it("采样波形幅度有限且无直流", () => {
    const s = sampleWave("square", 4096);
    let peak = 0;
    let mean = 0;
    for (const v of s) {
      peak = Math.max(peak, Math.abs(v));
      mean += v;
    }
    mean /= s.length;
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(30);
    expect(Math.abs(mean)).toBeLessThan(peak * 0.05);
  });
});

describe("出厂预设(ST-2 / 附录 C)", () => {
  it("共 36 个,id 唯一,含默认预设", () => {
    expect(PRESETS.length).toBe(36);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(36);
    expect(PRESETS.some((p) => p.id === "classic-minimoog-lead")).toBe(true);
    expect(PRESETS.some((p) => p.id === "starter-preset")).toBe(true);
  });

  it("全部 assigns 命中合法参数且数值在范围内", () => {
    for (const preset of PRESETS) {
      for (const [id, value] of Object.entries(preset.assigns)) {
        const spec = SPEC_BY_ID[id];
        expect(spec, `${preset.id}:${id}`).toBeDefined();
        if (!spec) continue;
        if (spec.kind === "knob") {
          expect(
            Number(value),
            `${preset.id}:${id}=${value}`,
          ).toBeGreaterThanOrEqual(spec.min! - 1e-9);
          expect(Number(value)).toBeLessThanOrEqual(spec.max! + 1e-9);
        } else if (spec.kind === "selector") {
          expect(spec.steps, `${preset.id}:${id}=${value}`).toContain(String(value));
        }
      }
    }
  });

  it("classic-minimoog-lead 取值与参考实现一致", () => {
    const p = PRESETS.find((x) => x.id === "classic-minimoog-lead")!;
    expect(p.assigns.cutoff).toBeCloseTo(0.15, 5);
    expect(p.assigns.emphasis).toBeCloseTo(8.04, 5);
    expect(p.assigns.glideTime).toBeCloseTo(2.9, 5);
    expect(p.assigns.modMix).toBe(0);
    expect(p.assigns.osc1Vol).toBe(9.5);
    expect(p.assigns.osc2Vol).toBe(5.5);
    expect(p.assigns.osc3Vol).toBe(6);
    expect(p.assigns.osc2Range).toBe("4'");
    expect(p.assigns.srcAFilterEg).toBe(false);
    expect(p.assigns.srcBLfo).toBe(true);
    expect(p.assigns.volume).toBe(5);
  });

  it("波形别名全部落在六档内", () => {
    const valid = new Set(Object.values(WAVE_ALIAS));
    for (const preset of PRESETS) {
      for (const id of ["osc1Wave", "osc2Wave", "osc3Wave"]) {
        expect(valid, `${preset.id}:${id}`).toContain(preset.assigns[id]);
      }
    }
  });
});

describe("ParamStore(ST-1)", () => {
  it("默认值 = 附录 A 口径", () => {
    const s = new ParamStore();
    expect(s.num("cutoff")).toBe(3.9);
    expect(s.num("contour")).toBe(4.7);
    expect(s.num("modMix")).toBe(10);
    expect(s.bool("osc1On")).toBe(true);
    expect(s.bool("osc2On")).toBe(false);
    expect(s.bool("osc3On")).toBe(false);
    expect(s.num("osc1Vol")).toBe(9.5);
    expect(s.num("volume")).toBe(5);
    expect(s.bool("kc1")).toBe(true);
    expect(s.bool("kc2")).toBe(true);
    expect(s.bool("filterMod")).toBe(true);
    expect(s.bool("oscMod")).toBe(false);
    expect(s.bool("glideOn")).toBe(true);
    expect(s.bool("decayMode")).toBe(false);
    expect(s.num("lfoRate")).toBe(3.5);
    expect(s.str("osc3Wave")).toBe("triangle");
  });

  it("set 钳位与非法档位回退", () => {
    const s = new ParamStore();
    s.set("cutoff", 99);
    expect(s.num("cutoff")).toBe(5);
    s.set("cutoff", -99);
    expect(s.num("cutoff")).toBe(-5);
    s.set("osc1Wave", "bogus");
    expect(s.str("osc1Wave")).toBe("sawtooth");
  });

  it("applyAssigns 批量载入后广播一次", () => {
    const s = new ParamStore();
    const seen: string[] = [];
    s.subscribeAny((changed) => seen.push(...changed));
    s.applyAssigns({ cutoff: 1, emphasis: 5, osc1Vol: 3 });
    expect(seen.sort()).toEqual(["cutoff", "emphasis", "osc1Vol"]);
    expect(s.num("cutoff")).toBe(1);
  });

  it("面板快照不含 NO_PERSIST 参数", () => {
    const s = new ParamStore();
    s.set("power", true);
    s.set("modWheel", 80);
    s.set("pitchWheel", 90);
    const snap = s.panelSnapshot();
    expect(snap.power).toBeUndefined();
    expect(snap.modWheel).toBeUndefined();
    expect(snap.pitchWheel).toBeUndefined();
    expect(snap.cutoff).toBe(3.9);
  });

  it("快照 → 新仓库 恢复一致", () => {
    const a = new ParamStore();
    a.set("cutoff", -2.5);
    a.set("osc1Wave", "square");
    a.set("glideOn", false);
    const b = new ParamStore();
    b.applyAssigns(a.panelSnapshot());
    expect(b.num("cutoff")).toBe(-2.5);
    expect(b.str("osc1Wave")).toBe("square");
    expect(b.bool("glideOn")).toBe(false);
  });

  it("§15 控件清单完整(面板参数 + 演奏轮)", () => {
    expect(SPECS.length).toBe(48);
    for (const id of [
      "tune", "glideTime", "modMix", "srcAFilterEg", "srcBLfo", "oscMod",
      "osc3Control",
      "osc1Range", "osc1Tune", "osc1Wave", "osc2Range", "osc2Tune", "osc2Wave",
      "osc3Range", "osc3Tune", "osc3Wave",
      "osc1On", "osc1Vol", "osc2On", "osc2Vol", "osc3On", "osc3Vol",
      "extOn", "extVol", "noiseOn", "noiseVol", "noiseType",
      "filterMod", "kc1", "kc2",
      "cutoff", "emphasis", "contour", "filtA", "filtD", "filtS",
      "loudA", "loudD", "loudS",
      "volume", "tunerOn", "power",
      "lfoRate", "lfoWave", "glideOn", "decayMode",
      "pitchWheel", "modWheel",
    ]) {
      expect(SPEC_BY_ID[id], id).toBeDefined();
    }
  });
});

describe("QWERTY 映射(§16 照抄参考实现)", () => {
  it("白键半音上行,黑键对应(PRD 表)", () => {
    expect(KEY_TO_SEMITONE["a"]).toBe(0); // C4
    expect(KEY_TO_SEMITONE["s"]).toBe(2);
    expect(KEY_TO_SEMITONE["d"]).toBe(4);
    expect(KEY_TO_SEMITONE["f"]).toBe(5);
    expect(KEY_TO_SEMITONE["g"]).toBe(7);
    expect(KEY_TO_SEMITONE["h"]).toBe(9);
    expect(KEY_TO_SEMITONE["j"]).toBe(11);
    expect(KEY_TO_SEMITONE["k"]).toBe(12);
    expect(KEY_TO_SEMITONE["l"]).toBe(14);
    expect(KEY_TO_SEMITONE[";"]).toBe(16);
    expect(KEY_TO_SEMITONE["'"]).toBe(17);
    expect(KEY_TO_SEMITONE["w"]).toBe(1);
    expect(KEY_TO_SEMITONE["e"]).toBe(3);
    expect(KEY_TO_SEMITONE["t"]).toBe(6);
    expect(KEY_TO_SEMITONE["y"]).toBe(8);
    expect(KEY_TO_SEMITONE["u"]).toBe(10);
    expect(KEY_TO_SEMITONE["o"]).toBe(13);
    expect(KEY_TO_SEMITONE["p"]).toBe(15);
    expect(KEY_TO_SEMITONE["q"]).toBe(-1);
  });
});

describe("键盘布局(PLAY-1 / 附录 B)", () => {
  it("44 键:C3 起,高位延伸至 G6", () => {
    const keys = keyLayout();
    expect(keys.length).toBe(44);
    expect(keys[0].midi).toBe(48); // C3
    expect(keys[keys.length - 1].midi).toBe(91); // G6
    const whites = keys.filter((k) => !k.black).length;
    const blacks = keys.filter((k) => k.black).length;
    expect(whites).toBe(26);
    expect(blacks).toBe(18);
    expect(keys.every((k) => k.x > -0.27 && k.x < 0.27)).toBe(true);
  });
});

describe("键盘实例命中(黑键/白键 InstancedMesh 映射)", () => {
  it("keyByInstance 按网格归属返回正确的键", async () => {
    const THREE = await import("three");
    const { KeyboardModel } = await import("../src/model/keys");
    const mats = {
      whiteKey: new THREE.MeshStandardMaterial(),
      blackKey: new THREE.MeshStandardMaterial(),
    } as unknown as import("../src/model/materials").MaterialLibrary;
    const kb = new KeyboardModel(mats);
    // 白键网格:C4 是第 7 个白键
    expect(kb.keyByInstance(kb.whites, 7).midi).toBe(60);
    // 黑键网格:C#4 是第 5 个黑键(此前会错误返回第 5 个白键 A3)
    expect(kb.keyByInstance(kb.blacks, 5).midi).toBe(61);
    expect(kb.keyByInstance(kb.blacks, 7).midi).toBe(66); // F#4
    expect(kb.keyByInstance(kb.blacks, 10).midi).toBe(73); // C#5
    expect(kb.keyByInstance(kb.blacks, 17).midi).toBe(90); // F#6
  });
});
