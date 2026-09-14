/**
 * Aether Model D — control specification registry.
 *
 * This file is the transcription of PRD section 6 ("控件规格总表") into code.
 * Every panel control that exists on the instrument is declared here exactly
 * once, with its kind, range / detents, factory default, silkscreen label and
 * tooltip copy. `prdRef` points back at the PRD line item so the acceptance
 * checklist in PRD section 11 can be walked item by item.
 *
 * Nothing else in the codebase is allowed to invent a control. Geometry,
 * interaction and the audio engine all read from this table (PRD ST-1).
 */

import {
  RANGE_0_10,
  RANGE_CUTOFF,
  RANGE_ENV_TIME,
  centsRange,
  glideSeconds,
  formatValue,
  toValue,
  clamp01,
  PITCH_WHEEL_CENTS,
  MASTER_TUNE_CENTS,
  type RangeSpec,
} from './range.ts';

export type ControlKind = 'knob' | 'selector' | 'switch' | 'wheel';
export type SectionId =
  | 'controllers'
  | 'oscillatorBank'
  | 'mixer'
  | 'modifiers';
export type Priority = 'P0' | 'P1' | 'P2';

interface BaseSpec {
  readonly id: string;
  /** Silkscreen text drawn on the panel (upper case, no brand names). */
  readonly label: string;
  /** Human name used by tooltips / help tables (zh-CN). */
  readonly name: string;
  readonly section: SectionId;
  readonly priority: Priority;
  /** PRD acceptance reference, e.g. "6.2 #9-11". */
  readonly prdRef: string;
  readonly desc: string;
}

export interface KnobSpec extends BaseSpec {
  readonly kind: 'knob';
  readonly range: RangeSpec;
  readonly default: number;
  /** Extra tooltip line derived from the value (e.g. glide time in ms). */
  readonly secondary?: (value: number) => string;
}

export interface SelectorOption {
  readonly value: string;
  readonly label: string;
  readonly short: string;
}

export interface SelectorSpec extends BaseSpec {
  readonly kind: 'selector';
  readonly options: readonly SelectorOption[];
  readonly defaultIndex: number;
}

export interface SwitchSpec extends BaseSpec {
  readonly kind: 'switch';
  readonly default: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
}

export interface WheelSpec extends BaseSpec {
  readonly kind: 'wheel';
  /** Normalised position; 0.5 is centred. */
  readonly defaultPos: number;
  readonly spring: boolean;
  readonly text: (pos: number) => string;
  readonly secondary?: (pos: number) => string;
}

export type AnySpec = KnobSpec | SelectorSpec | SwitchSpec | WheelSpec;

/* ===========================================================================
 * Oscillator detents
 * ========================================================================= */

/** Osc-1 / Osc-2 range selector: five octave positions, no LO (PRD AUD-3). */
const RANGE_STEPS_MAIN: readonly SelectorOption[] = [
  { value: '32', label: "32'", short: "32'" },
  { value: '16', label: "16'", short: "16'" },
  { value: '8', label: "8'", short: "8'" },
  { value: '4', label: "4'", short: "4'" },
  { value: '2', label: "2'", short: "2'" },
];

/** Osc-3 additionally reaches the low-frequency mode used as an LFO. */
const RANGE_STEPS_OSC3: readonly SelectorOption[] = [
  { value: 'lo', label: 'LO', short: 'LO' },
  ...RANGE_STEPS_MAIN,
];

/** Octave multiplier applied to the key frequency for each range position. */
export const RANGE_MULTIPLIER: Readonly<Record<string, number>> = Object.freeze({
  '32': 0.25, // -2 octaves (PRD 6.2)
  '16': 0.5, // -1 octave
  '8': 1, // unison
  '4': 2, // +1 octave
  '2': 4, // +2 octaves
  lo: 1 / 64, // keyboard-tracked low-frequency mode
});

/** Six wave shapes in PRD 6.2 order (triangle -> narrow pulse). */
const WAVE_STEPS: readonly SelectorOption[] = [
  { value: 'triangle', label: 'Triangle', short: 'TRI' },
  { value: 'saw', label: 'Sawtooth', short: 'SAW' },
  { value: 'revsaw', label: 'Reverse Sawtooth', short: 'R-SAW' },
  { value: 'square', label: 'Square', short: 'SQR' },
  { value: 'widePulse', label: 'Wide Pulse', short: 'P.WIDE' },
  { value: 'narrowPulse', label: 'Narrow Pulse', short: 'P.NAR' },
];
const WAVE_SAW_INDEX = 1;
const WAVE_TRI_INDEX = 0;

/** Gesture copy shared by the tooltip layer (PRD INT-7). */
export const KNOB_GESTURE =
  '垂直拖动调节 · Shift 精调 · 双击复位 · 滚轮微调';
export const SELECTOR_GESTURE = '单击循环换档 · 按住沿圆弧拖动换档';
export const SWITCH_GESTURE = '单击切换';

/* ===========================================================================
 * 6.1 Controllers
 * ========================================================================= */

const controllers: readonly AnySpec[] = [
  {
    kind: 'knob',
    id: 'glide',
    label: 'GLIDE',
    name: 'Glide（滑音）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.1 #1',
    desc: '前后两个音高之间的过渡时间。0 = 关闭；向右增大至约 2.5s，指数映射。回退音（松开当前键回到仍按住的键）同样适用。',
    range: RANGE_0_10,
    default: 0,
    secondary: (value: number) => {
      const seconds = glideSeconds(value / 10);
      if (seconds <= 0) return '关闭';
      return seconds < 1
        ? `约 ${(seconds * 1000).toFixed(0)} ms`
        : `约 ${seconds.toFixed(2)} s`;
    },
  },
  {
    kind: 'knob',
    id: 'modMix',
    label: 'MODULATION MIX',
    name: 'Modulation Mix（调制混合）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.1 #2',
    desc: '调制总线的信号源混合：逆时针端为 Osc-3，顺时针端为 Noise，中间线性过渡。',
    range: RANGE_0_10,
    default: 0,
    secondary: (value: number) => {
      const noise = Math.round((value / 10) * 100);
      return `Osc-3 ${100 - noise}% / Noise ${noise}%`;
    },
  },
  {
    kind: 'knob',
    id: 'tune',
    label: 'TUNE',
    name: 'Tune（主音准）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.1 #3',
    desc: '三个振荡器的全局音准微调，±200 音分（默认 A = 440 Hz）。',
    range: centsRange(MASTER_TUNE_CENTS),
    default: 0,
  },
  {
    kind: 'switch',
    id: 'modulation',
    label: 'MODULATION',
    name: 'Modulation（调制总开关）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.1 #4',
    desc: '调制总线总开关。开启后，调制轮同时控制振荡器音高调制与已使能的滤波调制。',
    default: false,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
  {
    kind: 'switch',
    id: 'decay',
    label: 'DECAY',
    name: 'Decay（打击乐式衰减）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.1 #5',
    desc: '开启时两条包络忽略 Sustain 开关，强制走「Attack → 衰减到 0」的打击乐式曲线。',
    default: false,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
];

/* ===========================================================================
 * 6.2 Oscillator Bank — three identical columns, Osc-3 carries Control
 * ========================================================================= */

interface OscInput {
  readonly n: 1 | 2 | 3;
  readonly waveIndex: number;
  readonly freqDefault: number;
}

function oscillatorSpecs(input: OscInput): readonly AnySpec[] {
  const { n } = input;
  const isThird = n === 3;
  const volts = `Osc-${n}`;
  return [
    {
      kind: 'selector',
      id: `osc${n}Range`,
      label: 'RANGE',
      name: `${volts} Range（音域）`,
      section: 'oscillatorBank',
      priority: 'P0',
      prdRef: '6.2 #6-8',
      desc: isThird
        ? `${volts} 的音域选择：32'/16'/8'/4'/2' 决定八度，LO 档进入低频模式，可当作调制源使用。`
        : `${volts} 的音域选择：32' = 低两个八度，8' = 同度，2' = 高两个八度。`,
      options: isThird ? RANGE_STEPS_OSC3 : RANGE_STEPS_MAIN,
      defaultIndex: isThird ? 3 : 2,
    },
    {
      kind: 'selector',
      id: `osc${n}Wave`,
      label: 'WAVEFORM',
      name: `${volts} Waveform（波形）`,
      section: 'oscillatorBank',
      priority: 'P0',
      prdRef: '6.2 #9-11',
      desc: `${volts} 的波形档位。不同波形包含不同数量与强度的谐波，决定了音色性格；全部以带限方式合成，不会产生混叠。`,
      options: WAVE_STEPS,
      defaultIndex: input.waveIndex,
    },
    {
      kind: 'knob',
      id: `osc${n}Frequency`,
      label: 'FREQUENCY',
      name: `${volts} Frequency（微调）`,
      section: 'oscillatorBank',
      priority: 'P0',
      prdRef: '6.2 #12-14',
      desc: isThird
        ? `${volts} 的独立微调，±700 音分。轻微失谐可获得厚实的合唱感；也可调到音程关系上。`
        : `${volts} 的独立微调，±700 音分。与 Osc-1 轻微失谐即可获得拍频与厚度。`,
      range: centsRange(700),
      default: input.freqDefault,
    },
  ];
}

const oscColumns: readonly AnySpec[] = [
  ...oscillatorSpecs({ n: 3, waveIndex: WAVE_TRI_INDEX, freqDefault: -7 }),
  ...oscillatorSpecs({ n: 2, waveIndex: WAVE_SAW_INDEX, freqDefault: 7 }),
  ...oscillatorSpecs({ n: 1, waveIndex: WAVE_SAW_INDEX, freqDefault: 0 }),
];

const osc3Control: AnySpec = {
  kind: 'switch',
  id: 'osc3Control',
  label: 'OSC. 3 CONTROL',
  name: 'Osc-3 Control（键盘控制）',
  section: 'oscillatorBank',
  priority: 'P0',
  prdRef: '6.2 #15',
  desc: 'OFF 时 Osc-3 脱离键盘音高控制，按 Range / Frequency 自由运行，适合作为调制源。',
  default: true,
  onLabel: 'ON',
  offLabel: 'OFF',
};

/* ===========================================================================
 * 6.3 Mixer
 * ========================================================================= */

interface MixerInput {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly desc: string;
  readonly def: number;
  readonly prdRef: string;
  readonly priority: Priority;
}

const mixerChannels: readonly AnySpec[] = (
  [
    {
      id: 'osc1Vol',
      label: 'OSC. 1',
      name: 'Osc-1 Volume（电平）',
      desc: 'Osc-1 进入滤波器之前的电平。拧到 0 即为静音。',
      def: 8,
      prdRef: '6.3 #16',
      priority: 'P0',
    },
    {
      id: 'osc2Vol',
      label: 'OSC. 2',
      name: 'Osc-2 Volume（电平）',
      desc: 'Osc-2 进入滤波器之前的电平。与 Osc-1 同时开启可获得双振荡器厚度。',
      def: 8,
      prdRef: '6.3 #17',
      priority: 'P0',
    },
    {
      id: 'osc3Vol',
      label: 'OSC. 3',
      name: 'Osc-3 Volume（电平）',
      desc: 'Osc-3 进入滤波器之前的电平。出厂默认静音，可随时加入。',
      def: 0,
      prdRef: '6.3 #18',
      priority: 'P0',
    },
    {
      id: 'noiseVol',
      label: 'NOISE',
      name: 'Noise Volume（噪声电平）',
      desc: '白噪声电平。可单独作为音源，也可与振荡器混合。',
      def: 0,
      prdRef: '6.3 #19',
      priority: 'P0',
    },
    {
      id: 'extVol',
      label: 'EXTERNAL',
      name: 'Ext In Volume（外部输入电平）',
      desc: '外部输入电平。V1 无声源时此旋钮仅视觉存在；载入本地音频文件后经此通道进入混音器。',
      def: 0,
      prdRef: '6.3 #20',
      priority: 'P1',
    },
  ] satisfies readonly MixerInput[]
).map((channel) => ({
  kind: 'knob' as const,
  id: channel.id,
  label: channel.label,
  name: channel.name,
  section: 'mixer' as const,
  priority: channel.priority,
  prdRef: channel.prdRef,
  desc: channel.desc,
  range: RANGE_0_10,
  default: channel.def,
}));

/* ===========================================================================
 * 6.4 Modifiers
 * ========================================================================= */

const modifiers: readonly AnySpec[] = [
  {
    kind: 'knob',
    id: 'cutoff',
    label: 'FILTER',
    name: 'Filter（截止频率）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #21',
    desc: '梯形低通滤波器的截止频率，10 Hz – 18 kHz 对数分布。高于截止频率的谐波以 24 dB/oct 衰减。',
    range: RANGE_CUTOFF,
    default: 2200,
  },
  {
    kind: 'knob',
    id: 'emphasis',
    label: 'EMPHASIS',
    name: 'Emphasis（共振）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #22',
    desc: '把滤波器输出的一部分送回输入，在截止频率处形成共振峰。推过 9.5 后滤波器进入自激，输出近似正弦波。',
    range: RANGE_0_10,
    default: 3,
    secondary: (value: number) => (value >= 9.5 ? '自激' : ''),
  },
  {
    kind: 'knob',
    id: 'contourAmount',
    label: 'CONTOUR',
    name: 'Contour Amount（包络深度）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #23',
    desc: '滤波包络对截止频率的调制深度。0 = 包络不起作用。',
    range: RANGE_0_10,
    default: 5,
  },
  {
    kind: 'switch',
    id: 'filterMod',
    label: 'MODULATION',
    name: 'Modulation (Osc-3)',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #24',
    desc: '使能滤波截止频率的调制，调制源为 Osc-3，深度由调制轮决定。',
    default: false,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
  {
    kind: 'switch',
    id: 'kc1',
    label: 'KC 1',
    name: 'Keyboard Control 1（键盘跟踪 +100%）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #25',
    desc: '滤波截止频率跟随键盘，+100% / 八度。音域越高，截止频率越高。',
    default: false,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
  {
    kind: 'switch',
    id: 'kc2',
    label: 'KC 2',
    name: 'Keyboard Control 2（键盘跟踪 +50%）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #26',
    desc: '滤波截止频率跟随键盘，+50% / 八度。与 KC1 同时开启约为 +150%。',
    default: false,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
  ...envelopeSpecs('f', 'FILTER CONTOUR', '滤波包络', '6.4 #27-30'),
  ...envelopeSpecs('l', 'LOUDNESS CONTOUR', '响度包络', '6.4 #31-34'),
  {
    kind: 'knob',
    id: 'volume',
    label: 'VOLUME',
    name: 'Volume（主音量）',
    section: 'modifiers',
    priority: 'P0',
    prdRef: '6.4 #35',
    desc: '主输出增益。信号随后经过一级轻微软饱和，让峰值更接近模拟电路的手感。',
    range: RANGE_0_10,
    default: 6,
  },
];

function envelopeSpecs(
  prefix: 'f' | 'l',
  group: string,
  groupName: string,
  prdRef: string,
): readonly AnySpec[] {
  const stage = (letter: 'A' | 'D' | 'R', def: number, desc: string): AnySpec => ({
    kind: 'knob',
    id: `${prefix}${letter === 'A' ? 'Attack' : letter === 'D' ? 'Decay' : 'Release'}`,
    label: `${letter}`,
    name: `${groupName} ${letter === 'A' ? 'Attack' : letter === 'D' ? 'Decay' : 'Release'}（${letter === 'A' ? '起音' : letter === 'D' ? '衰减' : '释音'}时间）`,
    section: 'modifiers',
    priority: 'P0',
    prdRef,
    desc,
    range: RANGE_ENV_TIME,
    default: def,
  });

  return [
    stage(
      'A',
      0.005,
      `${group} 的起音时间：按下琴键后电平从当前值上升到峰值所需的时间。包络从当前电平起跳，重触发不会产生爆音。`,
    ),
    stage(
      'D',
      0.3,
      `${group} 的衰减时间：从峰值下降到保持电平所需的时间。Sustain 关闭或 Decay 开关开启时，衰减目标为 0。`,
    ),
    {
      kind: 'switch',
      id: `${prefix}Sustain`,
      label: 'S',
      name: `${groupName} Sustain（保持）`,
      section: 'modifiers',
      priority: 'P0',
      prdRef,
      desc: `ON = Attack 之后保持固定高电平；OFF = 按住琴键也会衰减到 0。`,
      default: true,
      onLabel: 'ON',
      offLabel: 'OFF',
    },
    stage(
      'R',
      0.4,
      `${group} 的释音时间：松开琴键后下降到静音所需的时间。`,
    ),
  ];
}

/* ===========================================================================
 * 6.5 Keyboard & performance controls
 * ========================================================================= */

const keyboardPanel: readonly AnySpec[] = [
  {
    kind: 'wheel',
    id: 'pitchWheel',
    label: 'PITCH',
    name: 'Pitch Wheel（音高轮）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.5 #37',
    desc: `即时弯音，行程 ±${PITCH_WHEEL_CENTS} 音分，作用于全部振荡器；松手后弹簧回中。`,
    defaultPos: 0.5,
    spring: true,
    text: (pos: number) => {
      const cents = (pos - 0.5) * 2 * PITCH_WHEEL_CENTS;
      return `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents`;
    },
  },
  {
    kind: 'wheel',
    id: 'modWheel',
    label: 'MOD',
    name: 'Modulation Wheel（调制轮）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.5 #38',
    desc: '调制深度 0–100%。无弹簧，松手保持在原位。深度作用于振荡器音高调制与已使能的滤波调制。',
    defaultPos: 0,
    spring: false,
    text: (pos: number) => `${(clamp01(pos) * 100).toFixed(0)} %`,
    secondary: () => '无弹簧 · 松手保持',
  },
  {
    kind: 'switch',
    id: 'power',
    label: 'POWER',
    name: 'Power（电源）',
    section: 'controllers',
    priority: 'P0',
    prdRef: '6.5 #39',
    desc: 'OFF = 引擎静音（不卸载音频图），指示灯熄灭。琴键仍可按动，但不出声。',
    default: true,
    onLabel: 'ON',
    offLabel: 'OFF',
  },
];

/* ===========================================================================
 * Assembly + lookups
 * ========================================================================= */

export const CONTROL_SPECS: readonly AnySpec[] = Object.freeze([
  ...controllers,
  ...oscColumns,
  osc3Control,
  ...mixerChannels,
  ...modifiers,
  ...keyboardPanel,
]);

export const SPEC_BY_ID: ReadonlyMap<string, AnySpec> = new Map(
  CONTROL_SPECS.map((spec) => [spec.id, spec]),
);

/** Panel order per PRD 5.4 MDL-5: Controllers -> Oscillator Bank -> Mixer -> Modifiers. */
export const SECTION_ORDER: readonly SectionId[] = Object.freeze([
  'controllers',
  'oscillatorBank',
  'mixer',
  'modifiers',
]);

export const SECTION_TITLES: Readonly<
  Record<SectionId, { readonly label: string; readonly name: string }>
> = Object.freeze({
  controllers: { label: 'CONTROLLERS', name: '控制器' },
  oscillatorBank: { label: 'OSCILLATOR BANK', name: '振荡器组' },
  mixer: { label: 'MIXER', name: '混音器' },
  modifiers: { label: 'MODIFIERS', name: '修饰器' },
});

/** Oscillator columns appear left-to-right as Osc-3 / Osc-2 / Osc-1 (MDL-5). */
export const OSC_COLUMN_ORDER: readonly (1 | 2 | 3)[] = Object.freeze([3, 2, 1]);

/** 44 keys, MIDI 41 (F2) .. 84 (C6) — see PRD 6.5 #36. */
export const KEY_RANGE = Object.freeze({ firstMidi: 41, lastMidi: 84 });
export const KEY_COUNT = KEY_RANGE.lastMidi - KEY_RANGE.firstMidi + 1;

export function spec(id: string): AnySpec {
  const found = SPEC_BY_ID.get(id);
  if (!found) throw new Error(`Unknown control id: ${id}`);
  return found;
}

export function knobSpec(id: string): KnobSpec {
  const found = spec(id);
  if (found.kind !== 'knob') throw new Error(`Control ${id} is not a knob`);
  return found;
}

export function selectorSpec(id: string): SelectorSpec {
  const found = spec(id);
  if (found.kind !== 'selector') {
    throw new Error(`Control ${id} is not a selector`);
  }
  return found;
}

/** Knob position (0..1) -> display string for tooltips and readouts. */
export function knobText(id: string, pos: number): string {
  const s = knobSpec(id);
  return formatValue(s.range, toValue(s.range, pos));
}

/** Factory default position for any continuous control. */
export function defaultPosOf(s: KnobSpec): number {
  const span = s.range.max - s.range.min;
  if (span === 0) return 0;
  if (s.range.curve === 'log') {
    return clamp01(
      Math.log(Math.max(s.default, s.range.min) / s.range.min) /
        Math.log(s.range.max / s.range.min),
    );
  }
  return clamp01((s.default - s.range.min) / span);
}
