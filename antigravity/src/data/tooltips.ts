import type { ControlId } from "../state/types.ts";

export interface ControlTooltip {
  readonly title: string;
  readonly body: string;
}

export const CONTROL_TOOLTIPS: Record<ControlId, ControlTooltip> = {
  powerOn: {
    title: "POWER",
    body: "主电源开关。开启后点亮面板宝石指示灯并激活 3D 音频引擎。",
  },
  masterTune: {
    title: "MASTER TUNE",
    body: "全局主调音旋钮（±12 半音），与 Output 区的 A-440 基准音配合，可对三路振荡器进行整体校音。",
  },
  glideTime: {
    title: "GLIDE TIME",
    body: "滑音时间（Portamento）。当左侧 GLIDE 开关开启时，控制相邻音符之间的连续滑音过渡速度。",
  },
  modMix: {
    title: "MODULATION MIX",
    body: "调制混合器。在调制源 1（Osc.3 / Filter EG）与调制源 2（Noise / LFO）之间连续混合比例。",
  },
  osc3FilterEgSwitch: {
    title: "MOD SOURCE 1: OSC.3 / FILTER EG",
    body: "选择调制源 1 的输入：拨向左侧使用 Oscillator 3 波形（音频速率 FM 或低频调制），拨向右侧使用滤波轮廓包络。",
  },
  noiseLfoSwitch: {
    title: "MOD SOURCE 2: NOISE / LFO",
    body: "选择调制源 2 的输入：拨向左侧使用随机噪声（适合制造随机颤音/沙哑质感），拨向右侧使用独立 LFO。",
  },
  oscillatorModulationOn: {
    title: "OSCILLATOR MODULATION",
    body: "将调制总线路由至三路振荡器音高，配合左侧调制轮（Mod Wheel）产生颤音、FM 或音高震荡效果。",
  },
  osc3Control: {
    title: "OSC. 3 CONTROL",
    body: "控制 Oscillator 3 是否跟随键盘音高演奏。关闭后 Osc.3 脱离键盘控制，可作为自由振荡器或专用低频调制源。",
  },
  osc1Range: {
    title: "OSCILLATOR 1 RANGE",
    body: "主振荡器倍频程档位（LO / 32' / 16' / 8' / 4' / 2'）。数字越小音高越低，32' 为厚重低音，LO 为超低频。",
  },
  osc1Waveform: {
    title: "OSCILLATOR 1 WAVEFORM",
    body: "选择 Osc.1 波形：三角波、混合三角锯齿、锯齿波、方波、宽脉冲（25%）与窄脉冲（10%）。",
  },
  osc2Range: {
    title: "OSCILLATOR 2 RANGE",
    body: "选择 Osc.2 音区倍频程（LO 到 2'），可与 Osc.1 形成八度叠加。",
  },
  osc2Frequency: {
    title: "OSCILLATOR 2 FREQUENCY",
    body: "相对于 Osc.1 的音高微调与音程偏移（±12 半音）。微调几音分即可产生经典的模拟合唱厚度。",
  },
  osc2Waveform: {
    title: "OSCILLATOR 2 WAVEFORM",
    body: "选择 Osc.2 波形：三角波、混合三角锯齿、锯齿波、方波、宽脉冲与窄脉冲。",
  },
  osc3Range: {
    title: "OSCILLATOR 3 RANGE",
    body: "选择 Osc.3 音区倍频程（LO 到 2'）。配合 Osc.3 Control 关闭，可作为极慢速或音频速率调制源。",
  },
  osc3Frequency: {
    title: "OSCILLATOR 3 FREQUENCY",
    body: "调整 Osc.3 相对音高偏移或调制频率（±12 半音）。",
  },
  osc3Waveform: {
    title: "OSCILLATOR 3 WAVEFORM",
    body: "选择 Osc.3 波形，包含三角波、正向锯齿波、反向锯齿波、方波及双脉宽脉冲波。",
  },
  osc1Enabled: {
    title: "MIXER: OSC 1 ON",
    body: "开启或静音 Oscillator 1 送入混音器与梯形滤波器的信号通路。",
  },
  osc1Volume: {
    title: "MIXER: OSC 1 VOLUME",
    body: "调节 Osc.1 进入滤波器的电平；推高多路音量可让梯形滤波器饱和并点亮 OVERLOAD 灯。",
  },
  osc2Enabled: {
    title: "MIXER: OSC 2 ON",
    body: "开启或静音 Oscillator 2 进入混音器。",
  },
  osc2Volume: {
    title: "MIXER: OSC 2 VOLUME",
    body: "调节 Oscillator 2 混合音量。",
  },
  osc3Enabled: {
    title: "MIXER: OSC 3 ON",
    body: "开启或静音 Oscillator 3 进入混音器（仅作调制源时通常关闭此开关以免发声）。",
  },
  osc3Volume: {
    title: "MIXER: OSC 3 VOLUME",
    body: "调节 Oscillator 3 混合音量。",
  },
  extEnabled: {
    title: "EXTERNAL INPUT ON",
    body: "启用外部音频输入（麦克风/线路信号）经由梯形滤波器处理；首次开启将请求浏览器麦克风权限。",
  },
  extVolume: {
    title: "EXTERNAL INPUT VOLUME",
    body: "调节外部输入信号的混音增益。",
  },
  noiseEnabled: {
    title: "NOISE SOURCE ON",
    body: "启用模拟白噪声 / 粉红噪声发生器，为打击乐瞬态、风声或扫频增加空气感。",
  },
  noiseVolume: {
    title: "NOISE VOLUME",
    body: "调节噪声信号送入梯形滤波器的混合音量。",
  },
  noiseType: {
    title: "WHITE / PINK NOISE",
    body: "切换噪声频谱特性：White（白噪声，高频明亮）或 Pink（粉红噪声，低中频更温暖）。",
  },
  filterModulationOn: {
    title: "FILTER MODULATION",
    body: "将调制总线路由至梯形滤波器截止频率，配合调制轮产生自动哇音（Auto-Wah）或滤波颤音。",
  },
  keyboardControl1: {
    title: "KEYBOARD CONTROL 1 (1/3)",
    body: "开启 1/3 键盘音高跟踪：演奏越高音区时，滤波器截止频率自动随音高按比例抬升。",
  },
  keyboardControl2: {
    title: "KEYBOARD CONTROL 2 (2/3)",
    body: "开启 2/3 键盘跟踪；与 Keyboard Control 1 同时开启时形成完整的 1:1 八度跟踪。",
  },
  filterCutoff: {
    title: "FILTER CUTOFF FREQUENCY",
    body: "4 极 24dB/oct 非线性梯形低通滤波器截止频率（14 Hz – 22 kHz），决定声音明暗核心。",
  },
  filterEmphasis: {
    title: "FILTER EMPHASIS (RESONANCE)",
    body: "调节滤波器共振反馈量。推至 8.5 以上将接近并进入纯粹的晶体管梯形自激正弦振荡。",
  },
  filterContourAmount: {
    title: "AMOUNT OF CONTOUR",
    body: "滤波包络对截止频率的调制深度，决定每次按键瞬间的扫频幅度。",
  },
  filterAttack: {
    title: "FILTER ATTACK TIME",
    body: "滤波包络起音时间（2 ms – 10 s）：决定滤波器打开达到峰值所需时间。",
  },
  filterDecay: {
    title: "FILTER DECAY TIME",
    body: "滤波包络衰减时间：决定从峰值回落到 Sustain 维持电平（以及开启 Decay 开关时的释放）速度。",
  },
  filterSustain: {
    title: "FILTER SUSTAIN LEVEL",
    body: "滤波包络持续阶段停留的截止频率维持高度。",
  },
  loudnessAttack: {
    title: "LOUDNESS ATTACK TIME",
    body: "音量包络起音时间（2 ms – 10 s），决定音头是清脆打击还是缓慢淡入的 Pad。",
  },
  loudnessDecay: {
    title: "LOUDNESS DECAY TIME",
    body: "音量包络衰减时间；当左侧 DECAY 开关开启时，也决定松手后的余音释音时间。",
  },
  loudnessSustain: {
    title: "LOUDNESS SUSTAIN LEVEL",
    body: "按住琴键期间维持的音量电平（0 为打击乐型自然衰减至零）。",
  },
  mainVolume: {
    title: "MAIN OUTPUT VOLUME",
    body: "控制主立体声输出总线电平。",
  },
  isMainActive: {
    title: "MAIN OUTPUT ON",
    body: "主输出静音/启用开关，便于现场演奏快速切断输出。",
  },
  tunerOn: {
    title: "A-440 REFERENCE TUNER",
    body: "开启内置 440 Hz 标准正弦基准校音音调，用于辅助手工校准各振荡器音高。",
  },
  effectsVolume: {
    title: "AUX OUTPUT (EFFECTS) VOLUME",
    body: "控制发送至内置磁带延迟与卷积混响效果器的输出电平。",
  },
  auxOutputOn: {
    title: "AUX OUTPUT (EFFECTS) ON",
    body: "一键旁通或启用内置延迟与混响效果器总线。",
  },
  lfoRate: {
    title: "LFO RATE",
    body: "独立低频振荡器频率（0.2 Hz – 20 Hz），驱动颤音、自动滤波器摆动等周期调制。",
  },
  lfoWaveform: {
    title: "LFO WAVEFORM",
    body: "切换 LFO 波形：Tri（平滑三角波，适合自然颤音）或 Sqr（方波，适合阶梯跳变音效）。",
  },
  glideOn: {
    title: "GLIDE ON/OFF",
    body: "开启或关闭单音滑音功能（滑音速度由面板 GLIDE 旋钮决定）。",
  },
  decaySwitchOn: {
    title: "DECAY ON/OFF",
    body: "开启后，松开琴键时音符与滤波不会立刻截断，而是按各自的 Decay 时间平滑淡出。",
  },
  pitchWheel: {
    title: "PITCH BEND WHEEL",
    body: "弹簧回中弯音轮（±5 半音）。向上或向下推拨实现演奏滑音，松手自动平滑回中。",
  },
  modWheel: {
    title: "MODULATION WHEEL",
    body: "调制强度轮（0% – 100%）。实时控制调制总线送往振荡器与滤波器的调制深度。",
  },
  delayEnabled: {
    title: "TAPE DELAY ON",
    body: "开启模拟磁带延迟效果器，调节 Time 时可听到自然的磁带变速滑音。",
  },
  delayMix: {
    title: "DELAY MIX",
    body: "调整延迟回声与干声之间的湿声混合比例。",
  },
  delayTime: {
    title: "DELAY TIME",
    body: "设置延迟回声间隔时间（20 ms – 1200 ms）。",
  },
  delayFeedback: {
    title: "DELAY FEEDBACK",
    body: "设置回声重复次数与磁带饱和反馈强度。",
  },
  reverbEnabled: {
    title: "STUDIO REVERB ON",
    body: "开启实时程序化脉冲响应（IR）工作室板式/厅堂混响。",
  },
  reverbMix: {
    title: "REVERB AMOUNT",
    body: "控制混响空间湿声的混入比例。",
  },
  reverbTone: {
    title: "REVERB TONE",
    body: "调节混响尾音明暗度（低通阻尼滤波，从温暖暗色调到清亮空间）。",
  },
};
