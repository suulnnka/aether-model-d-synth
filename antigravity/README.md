# Aether Model D — Antigravity 3D Implementation

基于 Three.js + Web Audio API + AudioWorklet 构建的 3D 复古单音模拟合成器，采用纯自研 **AETHER · Model D** 视觉铭牌与丝印（不含任何第三方商标或 Logo）。

## 核心特性

- **3D 物理级建模**：美式胡桃木侧板与底框（程序化 PBR 木纹/凹凸贴图）、0°–75° 铰链式可调节拉丝金属控制面板、后置铝制音频插孔面板与电源线口、44 键琴键与酒红色毛毡垫条、可旋转调制轮与弹簧回中弯音轮。
- **模拟音色引擎**：
  - 3 路连续运行 VCO（LO / 32' / 16' / 8' / 4' / 2'、多种经典波形含 Tri-Saw / Reverse Saw / 双脉宽脉冲）、白/粉红噪声、外部音频输入。
  - 4 极 24dB/oct 2× 过采样非线性梯形低通滤波器（AudioWorklet），支持键盘 1/3 + 2/3 音高跟踪与高共振自激振荡。
  - 采样率级（a-rate）调制矩阵：Osc.3 / Filter EG 与 Noise / LFO 混合调制音高与滤波器。
  - 双包络（Filter & Loudness Contour）+ Release Decay 开关 + A-440 基准正弦校音器 + 实时过载宝石指示灯。
  - 内置磁带延迟（AudioWorklet）与程序化脉冲响应卷积混响（ConvolverNode + Tone 阻尼）。
- **完整交互与工作流**：
  - 3D 自由旋转 / 2D 俯视一键切换、相机视角预设、面板倾角实时滑杆。
  - 35 个原厂经典分类预设 + 自定义用户预设保存/删除 + URL 参数一键分享音色。
  - 学习模式悬停解说、旋钮放大镜 HUD、实时磷光示波器、13 步交互式 3D 引导导览、QWERTY 键盘与 Web MIDI 即插即弹。

## 命令

```bash
npm install
npm run dev      # 启动本地开发服务器
npm run test     # 运行 Vitest 单元测试与 DSP 校验
npm run build    # TypeScript 类型检查 + Vite 生产构建
```
