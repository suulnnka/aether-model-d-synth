/**
 * 控件说明文案(PRD INT-7 / §18 data/)
 * ------------------------------------------------------------------
 * 悬停 tooltip 显示「控件名 · 当前值/档位 · 功能说明」。
 * 文案按参考实现的控件说明自撰,遵守 §1.2 法律红线:不含任何第三方商标字样。
 */

export const TOOLTIPS: Record<string, string> = {
  // CONTROLLERS
  tune: "整机音准,±12 个半音。0 位为 A-440 标准音高,同时作用于三个振荡器。",
  glideTime:
    "滑音时间。从一个音滑到下一个音所需的时间,指数映射约 5ms–2.5s;需配合左侧边条的 GLIDE 开关。",
  modMix:
    "调制源混合。逆时针端为源 A(OSC. 3 / FILTER EG),顺时针端为源 B(NOISE / LFO),中间线性过渡。",
  osc3FilterEgSwitch:
    "调制源 A 选择。OSC. 3 位用第三振荡器作调制源;FILTER EG 位用滤波包络的形状作调制源,适合铜管与打击音色。",
  noiseLfoSwitch:
    "调制源 B 选择。LFO 位用左侧边条的低频振荡器,适合做颤音;NOISE 位用噪声作调制源。",
  oscillatorModulationOn:
    "音高调制总开关。打开后,调制源按调制轮深度去调制三个振荡器的音高(产生颤音或噪声调制)。",

  // OSCILLATOR BANK
  osc1Range: "振荡器 1 音域。32' 低两个八度,16' 低一个八度,8' 同度,4' 高一个,2' 高两个;LO 为低频模式,可作调制源。",
  osc2Range: "振荡器 2 音域。32' 低两个八度,16' 低一个八度,8' 同度,4' 高一个,2' 高两个;LO 为低频模式,可作调制源。",
  osc3Range: "振荡器 3 音域。LO 档配合 OSC. 3 CONTROL 关闭,可当作独立的低频调制源使用。",
  osc1Waveform:
    "振荡器 1 波形。六个档位谐波含量各不相同:三角最柔和,锯齿最饱满,反锯齿偏窄,方波空灵,宽/窄脉冲可调宽度感。",
  osc2Waveform: "振荡器 2 波形。与振荡器 1 略微失谐可获得厚实的合唱感。",
  osc3Waveform: "振荡器 3 波形。默认三角波,常用来为低八度加厚。",
  osc1Frequency: "振荡器 1 相对音高的微调,±12 半音。",
  osc2Frequency: "振荡器 2 失谐量,±12 半音。调到纯五度或纯四度可以得到厚实的叠加音色。",
  osc3Frequency: "振荡器 3 失谐量,±12 半音。",
  osc3Control:
    "振荡器 3 键盘控制。关闭后振荡器 3 脱离键盘与弯音轮的音高控制,按其自身音域与频率自由运行,可作调制源。",

  // MIXER
  osc1On: "振荡器 1 是否送入混音 bus。",
  osc2On: "振荡器 2 是否送入混音 bus。",
  osc3On: "振荡器 3 是否送入混音 bus。",
  osc1Volume: "振荡器 1 进入滤波器前的电平。",
  osc2Volume: "振荡器 2 进入滤波器前的电平。",
  osc3Volume: "振荡器 3 进入滤波器前的电平。",
  externalOn: "外部输入开关。开启后把麦克风采集的声音送进混音器。",
  externalVolume: "外部输入电平。电平过高时右上角红色 OVERLOAD 灯会点亮。",
  noiseOn: "噪声源开关。噪声既能单独发声,也可混入其它声源做气声与打击感。",
  noiseVolume: "噪声电平。",
  noiseType: "噪声类型。WHITE 每个频率能量相等;PINK 每个八度能量相等,听感低频更足。",
  filterModulationOn:
    "滤波调制开关。打开后调制源会去调制滤波器的截止频率,深度由调制轮决定。",
  keyboardControl1: "滤波键盘跟踪 1。打开后截止频率随演奏音高每升高一个八度增加 100%。",
  keyboardControl2: "滤波键盘跟踪 2。打开后截止频率随演奏音高每升高一个八度再增加 50%,与 KC1 同开约 150%。",

  // MODIFIERS / FILTER
  filterCutoff:
    "截止频率。高于该频率的谐波以 24dB/oct 的斜率被衰减,低于它的部分几乎不受影响。",
  filterEmphasis:
    "共振(Emphasis)。把一部分输出送回输入形成谐振峰;把共振拉高并降低截止频率,滤波器会进入自激状态,发出正弦音。",
  filterContourAmount: "包络量。决定滤波包络能在多大程度上改变截止频率。",
  filterAttack: "滤波包络起音时间:按下琴键后截止频率升到最高点所需的时间。",
  filterDecay: "滤波包络衰减时间:从起音最高点落到延音电平所需的时间。",
  filterSustain: "滤波包络延音电平:按住琴键期间截止频率维持的高度。",

  // MODIFIERS / LOUDNESS CONTOUR
  loudnessAttack: "响度包络起音时间:按下琴键后音量从零升到最大所需的时间。",
  loudnessDecay: "响度包络衰减时间:从最大音量落到延音电平所需的时间。",
  loudnessSustain: "响度包络延音电平:按住琴键期间音量维持的高度。",

  // OUTPUT
  mainVolume: "主输出音量。后接一级轻微软饱和,增添模拟味。",
  tunerOn: "A-440 调音参考音。打开后播放 440Hz 正弦音,用于与其它乐器对音。",
  power: "电源。关闭时引擎静音、电源灯熄灭、面板控件不可操作。",

  // SIDE PANEL
  lfoRate: "LFO 频率,0–10 对数映射 0.2–20Hz。",
  lfoWaveform: "LFO 波形:三角波平滑,方波用于 trill 与硬切换效果。",
  glideOn: "滑音开关。打开后换音时音高从上一音滑入,时间由 GLIDE TIME 决定。",
  decaySwitchOn:
    "打击模式开关。打开后两条包络强制走「起音 → 衰减到零」的打击乐曲线,忽略延音电平。",
  pitchWheel: "弯音轮,±2 个半音,松手自动回中。",
  modWheel: "调制轮,0–100%,松手保持原位。决定调制矩阵的总深度。",
};
