import type { ViewState } from "../state/types.ts";

export interface OnboardingStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly cameraPreset?: ViewState["cameraPreset"];
  readonly panelAngleDeg?: number;
  readonly hudTarget?: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "welcome",
    title: "欢迎来到 Aether Model D (3D)",
    body: "这是一台基于 Three.js 与 AudioWorklet 打造的全 3D 复古单音模拟合成器。拖拽空白处旋转视角，点击或上下拖动 3D 旋钮与拨杆即可实时塑音。",
    cameraPreset: "overview",
    panelAngleDeg: 52,
  },
  {
    id: "oscillators",
    title: "1. 三路模拟振荡器组 (Oscillator Bank)",
    body: "合成器的声音核心。Osc 1-3 各自支持 LO–2' 倍频程档位、多种经典模拟波形（三角/锯齿/脉冲/反向锯齿），Osc 2/3 还能进行半音偏移与失谐加厚。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "mixer",
    title: "2. 五通道混音台与过载灯 (Mixer)",
    body: "使用蓝色拨杆开关与音量旋钮混合三路振荡器、白/粉红噪声以及外部音频输入。推高总电平让晶体管梯形滤波器饱和，红色 OVERLOAD 宝石灯会随之闪亮。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "filter",
    title: "3. 24dB/oct 梯形低通滤波器 (Ladder Filter)",
    body: "经典 4 极非线性梯形滤波：Cutoff 控制明暗，Emphasis 推高会产生强烈共振直至自激振荡，Keyboard Control 1/2 让高音区自动更明亮。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "filter-envelope",
    title: "4. 滤波轮廓包络 (Filter Contour)",
    body: "通过 Attack、Decay、Sustain 与 Amount of Contour 塑造每次按键瞬间的滤波扫频动态，做出弹性 Bass 或铜管感 Lead。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "loudness-envelope",
    title: "5. 响度包络 (Loudness Contour)",
    body: "决定音符音量随时间的包络曲线，配合左侧边条的 Decay 开关控制松手后是否保持尾音释放。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "controllers",
    title: "6. 控制器与调制路由 (Controllers)",
    body: "调节 Master Tune 全局校音、Glide 滑音速度与 Modulation Mix 调制混合比；橙色拨杆在 Osc.3/Filter EG 与 Noise/LFO 间自由切换调制源。",
    cameraPreset: "panel",
    panelAngleDeg: 56,
  },
  {
    id: "left-hand",
    title: "7. 左侧演奏控制条 (Left-Hand Wheels & LFO)",
    body: "包含 LFO 速率与三角/方波切换、Glide 与 Decay 开关，以及物理可拖拽的弹簧回中弯音轮 (Pitch) 与调制轮 (Mod)。",
    cameraPreset: "keys",
    panelAngleDeg: 45,
  },
  {
    id: "keyboard",
    title: "8. 44 键单音键盘与 MIDI/QWERTY",
    body: "可直接点击或在 3D 琴键上滑动滑奏，也能使用电脑键盘（Z–M / Q–U）或连接外接 MIDI 键盘即插即弹！",
    cameraPreset: "keys",
    panelAngleDeg: 45,
  },
  {
    id: "output-tuner",
    title: "9. 输出区与 A-440 校音器 (Output & Hinge)",
    body: "右侧集成了 Main Output 主音量、A-440 基准正弦校音开关、Aux 效果总线与电源指示灯；顶部还可以像真机一样调节铰链面板倾角或切换 2D 俯视。",
    cameraPreset: "rear",
    panelAngleDeg: 62,
  },
  {
    id: "presets",
    title: "10. 35 个经典音色预设 (Presets)",
    body: "打开顶部 Presets 面板即可一键加载 Lead、Bass、Pad 与 Experimental 音色，也能将自己调试的音色保存为自定义预设。",
    cameraPreset: "overview",
    panelAngleDeg: 52,
    hudTarget: "[data-hud='presets']",
  },
  {
    id: "effects",
    title: "11. 磁带延迟与卷积混响 (Delay & Reverb)",
    body: "点击顶部 Effects 按钮可展开可拖拽的模拟磁带延迟与卷积空间混响面板，与琴体 Aux Output 开关实时联动。",
    cameraPreset: "overview",
    panelAngleDeg: 52,
    hudTarget: "[data-hud='effects']",
  },
  {
    id: "options-share",
    title: "12. 学习模式、旋钮放大镜与 URL 分享",
    body: "在 Options 中可开启「学习模式」悬停查看每个部件原理，开启「旋钮放大镜」辅助精确调音；点击 Share Patch 可复制当前完整参数链接分享给朋友。",
    cameraPreset: "overview",
    panelAngleDeg: 52,
    hudTarget: "[data-hud='share']",
  },
];
