/**
 * 出厂预设 36 个 —— 逐一移植参考实现 presets.ts
 * (名称、分类与参数取值完全一致;仅剔除效果器字段,ST-2 / 附录 C)。
 */
import type { Val } from "./paramStore";
import { WAVE_ALIAS } from "./paramStore";

/** 参考实现音域名 → 本产品档位 */
const RANGE_ALIAS: Record<string, string> = {
  lo: "LO",
  "32": "32'",
  "16": "16'",
  "8": "8'",
  "4": "4'",
  "2": "2'",
};

export interface Preset {
  id: string;
  name: string;
  category: string;
  description: string;
  assigns: Record<string, Val>;
}

interface OscDef {
  w: string; // 波形(参考实现命名)
  f: number; // Frequency ±12 半音
  r: string; // Range
  on: boolean;
  v: number; // Volume
}

interface PresetDef {
  id: string;
  name: string;
  cat: string;
  desc: string;
  /** controllers */
  t?: number; // tune
  g: number; // glideTime
  m: number; // modMix
  a: boolean; // osc3FilterEgSwitch
  b: boolean; // noiseLfoSwitch
  om: boolean; // oscillatorModulationOn
  o3c: boolean; // osc3Control
  k1: boolean;
  k2: boolean;
  /** filter */
  fc: number;
  fe: number;
  fa2: number; // contour amount
  fA: number;
  fD: number;
  fS: number;
  fm: boolean;
  /** loudness */
  lA: number;
  lD: number;
  lS: number;
  /** oscillators */
  o1: OscDef;
  o2: OscDef;
  o3: OscDef;
  /** mixer extras */
  nOn?: boolean;
  nV?: number;
  nPink?: boolean;
  eV?: number;
  /** side */
  glide: boolean;
  decay: boolean;
  lfoR: number;
  lfoSq?: boolean;
  mw: number;
  vol: number;
}

function build(d: PresetDef): Preset {
  const osc = (n: number, o: OscDef): Record<string, Val> => ({
    [`osc${n}Wave`]: WAVE_ALIAS[o.w] ?? o.w,
    [`osc${n}Tune`]: o.f,
    [`osc${n}Range`]: RANGE_ALIAS[o.r] ?? o.r,
    [`osc${n}On`]: o.on,
    [`osc${n}Vol`]: o.v,
  });
  return {
    id: d.id,
    name: d.name,
    category: d.cat,
    description: d.desc,
    assigns: {
      tune: d.t ?? 0,
      glideTime: d.g,
      modMix: d.m,
      srcAFilterEg: d.a,
      srcBLfo: d.b,
      oscMod: d.om,
      osc3Control: d.o3c,
      kc1: d.k1,
      kc2: d.k2,
      cutoff: d.fc,
      emphasis: d.fe,
      contour: d.fa2,
      filtA: d.fA,
      filtD: d.fD,
      filtS: d.fS,
      filterMod: d.fm,
      loudA: d.lA,
      loudD: d.lD,
      loudS: d.lS,
      ...osc(1, d.o1),
      ...osc(2, d.o2),
      ...osc(3, d.o3),
      noiseOn: d.nOn ?? false,
      noiseVol: d.nV ?? 0,
      noiseType: d.nPink ?? false,
      extOn: false,
      extVol: d.eV ?? 0,
      glideOn: d.glide,
      decayMode: d.decay,
      lfoRate: d.lfoR,
      lfoWave: d.lfoSq ?? false,
      modWheel: d.mw,
      volume: d.vol,
    },
  };
}

const DEFS: PresetDef[] = [
  {
    id: "starter-preset", name: "Starter Preset", cat: "Starter", desc: "Starter preset for testing",
    g: 1, m: 0, a: false, b: true, om: false, o3c: true, k1: false, k2: false,
    fc: 3.9, fe: 0, fa2: 4.71, fA: 0.3, fD: 0, fS: 4.5, fm: true,
    lA: 0, lD: 0, lS: 10,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "sawtooth", f: 0, r: "8", on: false, v: 0 },
    o3: { w: "triangle", f: 0, r: "8", on: false, v: 0 },
    glide: true, decay: false, lfoR: 3.5, mw: 50, vol: 5,
  },
  {
    id: "solo-lead", name: "Solo Lead", cat: "Lead",
    desc: "Expressive solo lead with sawtooth and triangle blend, perfect for melodic solos",
    g: 1.5, m: 8, a: true, b: false, om: true, o3c: true, k1: true, k2: true,
    fc: 1.2, fe: 7.5, fa2: 9.2, fA: 2.5, fD: 4.5, fS: 7.5, fm: true,
    lA: 0.5, lD: 5.5, lS: 8.5,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "sawtooth", f: 0, r: "8", on: true, v: 7 },
    o3: { w: "triangle", f: 0, r: "8", on: true, v: 5 },
    glide: true, decay: false, lfoR: 4.2, mw: 25, vol: 6.5,
  },
  {
    id: "warm-pad", name: "Warm Pad", cat: "Pad",
    desc: "Rich, warm pad with pulse waves and gentle LFO modulation",
    g: 6, m: 2, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 2.8, fe: 2.5, fa2: 5.5, fA: 4.5, fD: 8.5, fS: 8.5, fm: true,
    lA: 3.5, lD: 8.5, lS: 9.0,
    o1: { w: "pulse1", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "pulse2", f: -7, r: "8", on: true, v: 6 },
    o3: { w: "triangle", f: -12, r: "8", on: true, v: 4 },
    glide: true, decay: true, lfoR: 0.6, mw: 20, vol: 5.5,
  },
  {
    id: "atmospheric-pad", name: "Atmospheric Pad", cat: "Pad",
    desc: "Evolving atmospheric pad with rich noise textures and wide stereo spread",
    g: 6, m: 5, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 3.5, fe: 4, fa2: 6, fA: 5, fD: 9, fS: 8, fm: true,
    lA: 4, lD: 8, lS: 9,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 5 },
    o2: { w: "triangle", f: 5, r: "8", on: true, v: 5 },
    o3: { w: "sawtooth", f: -5, r: "8", on: true, v: 3 },
    nOn: true, nV: 2, nPink: true,
    glide: true, decay: true, lfoR: 0.3, mw: 15, vol: 5,
  },
  {
    id: "space-mod", name: "Space Mod", cat: "Pad",
    desc: "Space mod with sawtooth blend and expressive filter modulation",
    g: 2.9, m: 0, a: false, b: true, om: true, o3c: false, k1: false, k2: true,
    fc: -0.06, fe: 7.5, fa2: 9.08, fA: 3, fD: 6, fS: 0, fm: false,
    lA: 0, lD: 4, lS: 6.02,
    o1: { w: "sawtooth", f: 0, r: "16", on: true, v: 9.5 },
    o2: { w: "sawtooth", f: 0, r: "32", on: true, v: 5.5 },
    o3: { w: "pulse1", f: 1.38, r: "32", on: true, v: 6 },
    eV: 0.001,
    glide: true, decay: false, lfoR: 4.88, lfoSq: true, mw: 78, vol: 5,
  },
  {
    id: "modern-lead", name: "Modern Lead", cat: "Lead",
    desc: "Cutting modern lead with rich harmonics and dynamic filter modulation",
    g: 1.2, m: 8, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 2.5, fe: 8.5, fa2: 9.8, fA: 0.01, fD: 1.2, fS: 3, fm: true,
    lA: 0.01, lD: 1.0, lS: 5,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "4", on: true, v: 8 },
    o3: { w: "sawtooth", f: -7, r: "8", on: true, v: 6 },
    nOn: true, nV: 1,
    glide: true, decay: false, lfoR: 3.2, mw: 45, vol: 6,
  },
  {
    id: "crystal-pad", name: "Crystal Pad", cat: "Pad",
    desc: "Bright, crystalline pad with ethereal shimmer and sparkling high frequencies",
    g: 3.5, m: 4.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 4.5, fe: 4.5, fa2: 6.5, fA: 2.5, fD: 6.5, fS: 9.5, fm: true,
    lA: 2.5, lD: 7.5, lS: 9.0,
    o1: { w: "triangle", f: 0, r: "4", on: true, v: 8.5 },
    o2: { w: "triangle", f: 7, r: "2", on: true, v: 6.5 },
    o3: { w: "triangle", f: 12, r: "2", on: true, v: 4.5 },
    nOn: true, nV: 0.5,
    glide: true, decay: false, lfoR: 2.5, mw: 35, vol: 5.5,
  },
  {
    id: "easy-lead", name: "Easy Lead", cat: "Lead",
    desc: "Rich sawtooth lead with glide and expressive filter contour",
    g: 1, m: 8.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 1.93, fe: 5.56, fa2: 7.16, fA: 3, fD: 0.9, fS: 2.5, fm: false,
    lA: 0.01, lD: 0.9, lS: 4.5,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "sawtooth", f: 0, r: "4", on: true, v: 9.5 },
    o3: { w: "pulse1", f: 0, r: "8", on: true, v: 8 },
    glide: true, decay: false, lfoR: 7, mw: 0, vol: 6.5,
  },
  {
    id: "screaming-lead", name: "Screaming Lead", cat: "Lead",
    desc: "Aggressive screaming lead with unison detuning and filter sweep",
    g: 1, m: 8.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 1.2, fe: 9, fa2: 9.8, fA: 0.01, fD: 0.9, fS: 2.5, fm: false,
    lA: 0.01, lD: 0.9, lS: 4.5,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "sawtooth", f: 0, r: "4", on: true, v: 9.5 },
    o3: { w: "pulse1", f: 0, r: "8", on: true, v: 8 },
    glide: true, decay: false, lfoR: 7, mw: 85, vol: 6.5,
  },
  {
    id: "dream-pad", name: "Dream Pad", cat: "Pad",
    desc: "Soft, dreamy pad with gentle pulse waves and floating modulation",
    g: 7, m: 4, a: true, b: false, om: false, o3c: false, k1: false, k2: false,
    fc: 3.8, fe: 2, fa2: 3, fA: 6, fD: 9, fS: 9, fm: true,
    lA: 5, lD: 8, lS: 9,
    o1: { w: "pulse1", f: 0, r: "16", on: true, v: 5 },
    o2: { w: "triangle", f: 3, r: "16", on: true, v: 4 },
    o3: { w: "pulse2", f: -4, r: "16", on: true, v: 3 },
    glide: true, decay: true, lfoR: 0.2, mw: 10, vol: 5,
  },
  {
    id: "classic-minimoog-lead", name: "Classic Minimoog Lead", cat: "Lead",
    desc: "Authentic Minimoog lead with sawtooth layers and classic filter contour",
    g: 2.9, m: 0, a: false, b: true, om: false, o3c: true, k1: true, k2: true,
    fc: 0.15, fe: 8.04, fa2: 6.38, fA: 1, fD: 3, fS: 4, fm: false,
    lA: 0, lD: 0, lS: 10,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 9.5 },
    o2: { w: "sawtooth", f: 0, r: "4", on: true, v: 5.5 },
    o3: { w: "triangle", f: 0, r: "8", on: true, v: 6 },
    eV: 0.001,
    glide: true, decay: false, lfoR: 3.5, mw: 0, vol: 5,
  },
  {
    id: "taurus-bass", name: "Taurus Bass", cat: "Bass",
    desc: "Deep, resonant Taurus pedal bass with sawtooth and pulse layers",
    g: 0, m: 2, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 2.8, fe: 7.5, fa2: 8.5, fA: 0.05, fD: 4.5, fS: 6.5, fm: false,
    lA: 0.05, lD: 4.0, lS: 8.5,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 8 },
    o3: { w: "triangle", f: 0, r: "32", on: true, v: 6 },
    glide: false, decay: false, lfoR: 2.5, mw: 35, vol: 7.0,
  },
  {
    id: "analog-lead", name: "Analog Lead", cat: "Lead",
    desc: "Warm analog lead with vintage character and rich modulation",
    g: 2.8, m: 3, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 2.8, fe: 6.8, fa2: 7.5, fA: 0.15, fD: 2.8, fS: 6, fm: true,
    lA: 0.15, lD: 2.8, lS: 7.5,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse2", f: 0, r: "8", on: true, v: 8 },
    o3: { w: "triangle", f: -12, r: "8", on: true, v: 6.5 },
    glide: true, decay: false, lfoR: 5.08, mw: 87, vol: 5,
  },
  {
    id: "unison-lead", name: "Unison Lead", cat: "Lead",
    desc: "Ultra-thick unison lead with micro-detuning for massive width",
    g: 2, m: 5.5, a: false, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 3.2, fe: 5.5, fa2: 7.8, fA: 0.12, fD: 2.2, fS: 6.8, fm: true,
    lA: 0.12, lD: 2.2, lS: 8.2,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "sawtooth", f: 0.5, r: "8", on: true, v: 9.8 },
    o3: { w: "sawtooth", f: -0.3, r: "8", on: true, v: 9.5 },
    glide: true, decay: false, lfoR: 4.8, mw: 55, vol: 7,
  },
  {
    id: "thick-bass", name: "Thick Bass", cat: "Bass",
    desc: "Thick, harmonically rich bass with sawtooth and pulse layers",
    g: 1.64, m: 1.5, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 1.87, fe: 2.56, fa2: 7.23, fA: 0.01, fD: 0.8, fS: 3.5, fm: false,
    lA: 0.01, lD: 1.2, lS: 6,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 6 },
    o3: { w: "triangle", f: 0, r: "32", on: true, v: 4 },
    glide: true, decay: false, lfoR: 4.5, mw: 20, vol: 6.5,
  },
  {
    id: "funk-bass", name: "Funk Bass", cat: "Bass",
    desc: "Punchy funk bass with tight attack and keyboard tracking",
    g: 1.64, m: 1.5, a: true, b: false, om: false, o3c: true, k1: true, k2: true,
    fc: -1.58, fe: 7.68, fa2: 7.23, fA: 0.01, fD: 0.8, fS: 3.5, fm: false,
    lA: 0.01, lD: 1.2, lS: 6,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 6 },
    o3: { w: "triangle", f: 0, r: "32", on: true, v: 4 },
    glide: true, decay: false, lfoR: 4.5, mw: 20, vol: 6.5,
  },
  {
    id: "easy-pad", name: "Easy Pad", cat: "Pad",
    desc: "Warm pad with triangle waves and gentle modulation",
    g: 4.5, m: 1.8, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 3.2, fe: 1.5, fa2: 3.8, fA: 1.2, fD: 4.2, fS: 8.5, fm: true,
    lA: 1.0, lD: 4.5, lS: 8.8,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 7 },
    o2: { w: "triangle", f: 0, r: "4", on: true, v: 5 },
    o3: { w: "triangle", f: 0, r: "2", on: true, v: 3 },
    glide: true, decay: false, lfoR: 1.8, mw: 15, vol: 6.0,
  },
  {
    id: "analog-bass", name: "Analog Bass", cat: "Bass",
    desc: "Deep, warm analog bass with rich harmonics",
    g: 1.5, m: 1.8, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 1.8, fe: 4.8, fa2: 6.2, fA: 0.01, fD: 0.7, fS: 7.8, fm: false,
    lA: 0.01, lD: 0.9, lS: 8.2,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 7 },
    o3: { w: "triangle", f: 0, r: "16", on: true, v: 5 },
    glide: true, decay: false, lfoR: 2.2, mw: 20, vol: 7.0,
  },
  {
    id: "vintage-lead", name: "Vintage Lead", cat: "Lead",
    desc: "Classic vintage lead with warm, rounded character",
    g: 2.2, m: 3.5, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 3.5, fe: 2.2, fa2: 6.8, fA: 0.05, fD: 1.8, fS: 6.5, fm: false,
    lA: 0.05, lD: 2.0, lS: 6.8,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 9 },
    o2: { w: "pulse2", f: 0, r: "8", on: true, v: 7 },
    o3: { w: "triangle", f: -12, r: "8", on: true, v: 4 },
    glide: true, decay: false, lfoR: 4.8, mw: 15, vol: 6.8,
  },
  {
    id: "percussive-bass", name: "Percussive Bass", cat: "Bass",
    desc: "Tight, percussive bass with quick attack and decay",
    g: 0.8, m: 1.2, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 1.2, fe: 5.2, fa2: 7.8, fA: 0.01, fD: 0.3, fS: 2.5, fm: false,
    lA: 0.01, lD: 0.4, lS: 3.8,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 6 },
    o3: { w: "triangle", f: 0, r: "16", on: true, v: 3 },
    glide: true, decay: false, lfoR: 1.8, mw: 15, vol: 7.5,
  },
  {
    id: "lucky-man", name: "Lucky Man", cat: "Lead",
    desc: "Keith Emerson's iconic Minimoog lead from 'Lucky Man'",
    g: 2.0, m: 4.5, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 3.2, fe: 3.5, fa2: 7.8, fA: 0.01, fD: 1.8, fS: 6.5, fm: false,
    lA: 0.01, lD: 2.0, lS: 7.0,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "8", on: true, v: 8.5 },
    o3: { w: "triangle", f: 0, r: "8", on: true, v: 6 },
    glide: true, decay: false, lfoR: 5.5, mw: 0, vol: 7.5,
  },
  {
    id: "watery-lead", name: "Watery Lead", cat: "Lead",
    desc: "Key tracked lead with sawtooth blend and expressive filter modulation",
    g: 2.7, m: 0, a: false, b: true, om: false, o3c: false, k1: true, k2: true,
    fc: 1.27, fe: 8.6, fa2: 6.59, fA: 4, fD: 3, fS: 8, fm: true,
    lA: 0, lD: 4, lS: 10,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 9.5 },
    o2: { w: "triangle", f: 0, r: "2", on: true, v: 7.16 },
    o3: { w: "rev_saw", f: -1.79, r: "8", on: true, v: 7.37 },
    glide: false, decay: false, lfoR: 5.77, mw: 45, vol: 6.5,
  },
  {
    id: "vintage-minimoog-pad", name: "Vintage Minimoog Pad", cat: "Pad",
    desc: "Classic Minimoog pad sound from 70s progressive rock",
    g: 4.8, m: 2.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 2.8, fe: 2.2, fa2: 4.5, fA: 2.2, fD: 6.8, fS: 8.5, fm: true,
    lA: 1.8, lD: 6.5, lS: 9.0,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "triangle", f: -7, r: "8", on: true, v: 6 },
    o3: { w: "triangle", f: -12, r: "4", on: true, v: 4 },
    glide: true, decay: false, lfoR: 1.2, mw: 18, vol: 6.0,
  },
  {
    id: "authentic-minimoog-bass", name: "Authentic Minimoog Bass", cat: "Bass",
    desc: "True Minimoog bass sound as heard on classic records",
    g: 1.2, m: 2.2, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 2.2, fe: 4.5, fa2: 6.8, fA: 0.01, fD: 0.9, fS: 7.2, fm: false,
    lA: 0.01, lD: 1.1, lS: 7.8,
    o1: { w: "sawtooth", f: 0, r: "16", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "16", on: true, v: 7 },
    o3: { w: "triangle", f: 0, r: "32", on: true, v: 4.5 },
    glide: true, decay: false, lfoR: 2.8, mw: 22, vol: 7.2,
  },
  {
    id: "progressive-rock-lead", name: "Progressive Rock Lead", cat: "Lead",
    desc: "Progressive rock lead with sawtooth blend and expressive filter modulation",
    g: 2.2, m: 5.8, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 3.2, fe: 5.2, fa2: 7.8, fA: 0.02, fD: 1.8, fS: 6.0, fm: false,
    lA: 0.02, lD: 2.2, lS: 6.8,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse2", f: 0, r: "8", on: true, v: 8.5 },
    o3: { w: "sawtooth", f: -12, r: "8", on: true, v: 6.5 },
    glide: true, decay: false, lfoR: 5.5, mw: 40, vol: 7.0,
  },
  {
    id: "space-echo", name: "Space Echo", cat: "Lead",
    desc: "Classic tape echo lead with sawtooth blend and warm delay",
    g: 2.5, m: 4.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 3.2, fe: 4.8, fa2: 7.2, fA: 0.02, fD: 1.5, fS: 6.5, fm: false,
    lA: 0.02, lD: 2.0, lS: 7.0,
    o1: { w: "sawtooth", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "8", on: true, v: 8 },
    o3: { w: "triangle", f: -12, r: "8", on: true, v: 5 },
    glide: true, decay: false, lfoR: 4.2, mw: 35, vol: 6.5,
  },
  {
    id: "cathedral-pad", name: "Cathedral Pad", cat: "Pad",
    desc: "Massive cathedral-like pad with long reverb tail",
    g: 3.5, m: 2.0, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 2.5, fe: 1.5, fa2: 3.0, fA: 4.0, fD: 9.5, fS: 9.5, fm: true,
    lA: 3.0, lD: 9.0, lS: 9.5,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 7 },
    o2: { w: "triangle", f: -7, r: "4", on: true, v: 6 },
    o3: { w: "triangle", f: -12, r: "2", on: true, v: 4 },
    glide: true, decay: true, lfoR: 0.5, mw: 15, vol: 5.5,
  },
  {
    id: "dub-bass", name: "Dub Bass", cat: "Bass",
    desc: "Deep dub bass with sawtooth layers and warm echo delay",
    g: 0.5, m: 1.5, a: true, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 1.8, fe: 5.5, fa2: 7.5, fA: 0.01, fD: 0.8, fS: 7.0, fm: false,
    lA: 0.01, lD: 1.0, lS: 8.0,
    o1: { w: "sawtooth", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "pulse1", f: 0, r: "32", on: true, v: 7 },
    o3: { w: "triangle", f: 0, r: "16", on: true, v: 5 },
    glide: true, decay: false, lfoR: 2.5, mw: 25, vol: 7.0,
  },
  {
    id: "alien-landscape", name: "Alien Landscape", cat: "Experimental",
    desc: "Otherworldly texture with slow-evolving modulation and noise",
    g: 8.5, m: 3.5, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 1.8, fe: 2.5, fa2: 4.2, fA: 6.5, fD: 9.5, fS: 9.8, fm: true,
    lA: 4.5, lD: 9.0, lS: 9.5,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 6 },
    o2: { w: "triangle", f: 7, r: "4", on: true, v: 4 },
    o3: { w: "sawtooth", f: -5, r: "2", on: true, v: 3 },
    nOn: true, nV: 3, nPink: true,
    glide: true, decay: true, lfoR: 0.3, mw: 20, vol: 4.5,
  },
  {
    id: "glass-harmonica", name: "Glass Harmonica", cat: "Experimental",
    desc: "Ethereal glass harmonica with pure sine-like tones and long sustain",
    g: 0.5, m: 1.0, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 3.8, fe: 1.2, fa2: 2.8, fA: 2.5, fD: 8.5, fS: 9.5, fm: true,
    lA: 1.8, lD: 8.8, lS: 9.8,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "triangle", f: 12, r: "4", on: true, v: 6 },
    o3: { w: "triangle", f: 12, r: "2", on: true, v: 4 },
    glide: true, decay: true, lfoR: 0.8, mw: 15, vol: 5.5,
  },
  {
    id: "wind-chimes", name: "Wind Chimes", cat: "Experimental",
    desc: "Delicate wind chimes with random-like modulation and bright decay",
    g: 0.2, m: 2.0, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 4.0, fe: 6.8, fa2: 8.5, fA: 0.01, fD: 1.5, fS: 0, fm: true,
    lA: 0.01, lD: 2.0, lS: 0,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 7 },
    o2: { w: "triangle", f: 7, r: "4", on: true, v: 5 },
    o3: { w: "triangle", f: 12, r: "2", on: true, v: 3 },
    nOn: true, nV: 2,
    glide: false, decay: false, lfoR: 8.5, lfoSq: true, mw: 60, vol: 5.0,
  },
  {
    id: "submarine-sonar", name: "Submarine Sonar", cat: "Experimental",
    desc: "Deep underwater sonar ping with long delay and reverb",
    g: 0.1, m: 0, a: false, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 2.8, fe: 7.5, fa2: 8.8, fA: 0.01, fD: 0.5, fS: 0, fm: false,
    lA: 0.01, lD: 0.8, lS: 0,
    o1: { w: "triangle", f: 0, r: "32", on: true, v: 10 },
    o2: { w: "triangle", f: 0, r: "32", on: true, v: 8 },
    o3: { w: "triangle", f: 0, r: "32", on: true, v: 6 },
    glide: false, decay: false, lfoR: 0, mw: 0, vol: 6.0,
  },
  {
    id: "crystal-bells", name: "Crystal Bells", cat: "Experimental",
    desc: "Bright crystalline bells with shimmer and sparkle",
    g: 0.3, m: 1.5, a: true, b: false, om: true, o3c: true, k1: false, k2: false,
    fc: 4.0, fe: 7.2, fa2: 8.8, fA: 0.01, fD: 1.8, fS: 0, fm: true,
    lA: 0.01, lD: 2.2, lS: 0,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "triangle", f: 12, r: "4", on: true, v: 6 },
    o3: { w: "triangle", f: 12, r: "2", on: true, v: 4 },
    glide: false, decay: false, lfoR: 6.5, mw: 45, vol: 5.5,
  },
  {
    id: "thunder-storm", name: "Thunder Storm", cat: "Experimental",
    desc: "Atmospheric thunder with noise and slow filter sweeps",
    g: 6.0, m: 2.5, a: true, b: true, om: false, o3c: true, k1: false, k2: false,
    fc: 1.5, fe: 3.8, fa2: 6.5, fA: 4.5, fD: 9.0, fS: 8.5, fm: true,
    lA: 3.5, lD: 8.5, lS: 8.8,
    o1: { w: "triangle", f: 0, r: "32", on: true, v: 5 },
    o2: { w: "triangle", f: -12, r: "16", on: true, v: 3 },
    o3: { w: "triangle", f: -12, r: "8", on: true, v: 2 },
    nOn: true, nV: 6,
    glide: true, decay: true, lfoR: 0.5, mw: 25, vol: 4.5,
  },
  {
    id: "digital-rain", name: "Digital Rain", cat: "Experimental",
    desc: "Matrix-style digital rain with staccato pulses and reverb",
    g: 0.1, m: 0, a: false, b: false, om: false, o3c: true, k1: true, k2: false,
    fc: 3.5, fe: 8.8, fa2: 9.5, fA: 0.01, fD: 0.2, fS: 0, fm: false,
    lA: 0.01, lD: 0.3, lS: 0,
    o1: { w: "pulse1", f: 0, r: "8", on: true, v: 10 },
    o2: { w: "pulse2", f: 0, r: "8", on: true, v: 8 },
    o3: { w: "sawtooth", f: 0, r: "8", on: true, v: 6 },
    glide: false, decay: false, lfoR: 0, mw: 0, vol: 6.0,
  },
  {
    id: "cosmic-drone", name: "Cosmic Drone", cat: "Experimental",
    desc: "Deep space drone with evolving harmonics and infinite sustain",
    g: 9.0, m: 4.0, a: true, b: true, om: true, o3c: true, k1: false, k2: false,
    fc: 1.2, fe: 2.0, fa2: 3.5, fA: 8.0, fD: 9.8, fS: 10.0, fm: true,
    lA: 6.0, lD: 9.5, lS: 10.0,
    o1: { w: "triangle", f: 0, r: "8", on: true, v: 8 },
    o2: { w: "triangle", f: -7, r: "4", on: true, v: 6 },
    o3: { w: "triangle", f: -12, r: "2", on: true, v: 4 },
    nOn: true, nV: 2, nPink: true,
    glide: true, decay: true, lfoR: 0.2, mw: 15, vol: 4.0,
  },
];

export const PRESETS: Preset[] = DEFS.map(build);

export function getPresetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function presetCategories(): string[] {
  return [...new Set(PRESETS.map((p) => p.category))];
}
