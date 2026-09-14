# Aether Model D — 3D Web Synthesizer

在浏览器中把玩的高保真 3D 复古单音模拟合成器:致敬经典 1970 年代形态的**完全自研**实现。
44 键可演奏键盘、铰链式可掀控制面板、全部旋钮/开关/档位 100% 接入真实音频引擎
(Three.js 渲染 + Web Audio API 发声),无任何装饰性控件。

> 法律口径:本产品为「致敬经典形态的自研合成器」,全产品(模型丝印、贴图、UI、代码、文档)
> 不含任何第三方商标字样或图形;品牌为自绘「AETHER / Model D」。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器(默认 http://localhost:5173)
npm run build      # 生产构建(主包 gzip ≈163KB,远低于 700KB 预算)
npm run preview    # 预览生产构建
npm test           # vitest 逻辑测试(16 项)
```

- 首次进入页面点击任意处开启声音(浏览器要求音频由用户手势启动)。
- 可选自检:`http://localhost:5173/?selftest` 运行 OfflineAudioContext 离线渲染断言(8 项)。

## 操作说明

| 输入 | 行为 |
|---|---|
| 鼠标 + 旋钮 | 按住上下拖动;`Shift` 精调(×0.1);双击恢复默认;滚轮微调 |
| 档位旋钮(波形/音域) | 单击进档;按住沿圆弧方向拖动换档 |
| 翘板开关 | 单击切换(约 80ms 翻转动画) |
| 琴键 | 按下发声、抬起停音;按住滑动 = 滑奏 |
| 音高轮 / 调制轮 | 垂直拖动;音高轮松手弹簧回中,调制轮保持 |
| 面板前缘(3D 视角) | 拖拽调整面板角度 0–60° |
| 背景空白处 | 左键环绕 / 右键平移 / 滚轮缩放(3D 视角) |

电脑键盘演奏:`A W S E D F T G Y H U J K O L P ; '` 为基准音(C4)起半音上行;
`Z X C V B N M , . /` 为低一个八度白键;`-` / `=` 基准八度移位(音域内钳位)。
快捷键:`空格` All Notes Off;`V` 视角切换;`H` 面板立起/放平;`?` 帮助。

## 声音引擎

信号流(常驻音频图,noteOn/off 只调度包络与音高):

```
Osc-1/2/3 ─电平─┐
Noise ─电平─────┼→ 混音 → 梯形低通 24dB/oct → VCA(响度包络)→ Volume → 软饱和 → Out
Ext In ─电平────┘              ▲ cutoff = 旋钮 ×(KC1/KC2 键盘跟踪)+ 滤波包络×Contour
                               ▲ 调制(Osc-3 开关使能,深度 ×Mod 轮)
调制总线:Mod Mix(Osc-3 ↔ Noise)× Mod 开关 × Mod 轮 → 音高 FM(±300¢)/ 滤波 FM
```

- **梯形滤波器**:AudioWorklet 内实现公有领域的四极 compromise-poles 非线性模型
  (tanh 饱和反馈),截止/共振逐样平滑插值,Emphasis 拉满可自激;
  不可用时自动降级为 4 极 Biquad 级联(页面显示「过滤器:兼容模式」)。
- **波形**:6 档波形全部以 256 谐波傅里叶系数构造 PeriodicWave(带限,无混叠)。
- **包络**:A/D/R 1ms–10s 对数映射;Sustain 开关语义 + 全局 Decay 开关;
  重触发从当前电平起跳;全部自动化走 `setTargetAtTime`,杜绝 zipper 噪声。
- **单音逻辑**:last-note priority,松键回退仍按住的最末键(只滑音、不重触发)。
- **滑音**:Glide 0–10 → 5ms–2.5s 指数时间常数。

## 工程结构

```
src/
  state/    ParamStore(§6 控件注册表,单一事实来源)+ localStorage 持久化 + 出厂预设
  audio/    引擎(常驻音频图)、单音键盘逻辑、波形表、离线渲染自检
  model/    程序化建模(机箱/木侧板/铰链面板/44 键/控件工厂)、Canvas 丝印绘制器
  scene/    渲染舞台(PBR+IBL、三点布光、Bloom+暗角)、相机 rig(3D/2D 状态机)、铰链控制器
  interaction/ raycast 手势状态机、电脑键盘演奏映射
  ui/       DOM 覆盖层(工具栏/帮助/引导/加载/解锁/toast)
public/audio/ladder-worklet.js   梯形滤波器 AudioWorklet 处理器
tests/logic.test.ts              单音逻辑/键盘映射/ParamStore/映射曲线 单元测试
```

## 质量验收

- `npm test`:单音优先级、乱序松开回退、panic、键盘映射、ParamStore 持久化、映射曲线。
- `?selftest`(浏览器内 OfflineAudioContext 渲染断言):
  锯齿波频谱(谐波 1/n、无杂散)、滤波斜率(渐近 24dB/oct,3k→12k 实测 −22dB/oct)、
  自激振荡(Emphasis=10)、响度包络 A/D/S/R 语义、滑音 2.5s@τ、滤波包络扫频、
  单音优先级回退、Release 后底噪 ≤ −80dB。
- 窗口失焦 / 切换标签 / `空格` → 自动 All Notes Off,防挂音。
- WebGL 上下文丢失显示刷新提示;`prefers-reduced-motion` 缩短全部动画。

## 已知调音决策

- 旋钮刻度 Cutoff 10Hz–18kHz(对数);引擎内对 compromise-poles 结构的转折点
  做了 ×2.5 听感补音(`engine.ts` 的 `CUTOFF_COMP`),使旋钮行程与听感一致。
- 梯形结构的高频抑制渐近达到 24dB/oct(距转折点 3 个八度以上约 −22dB/oct);
  需要精确 24dB/oct 的场合使用兼容模式(4 极 Biquad 巴特沃斯级联)。
- 滤波调制(截止 FM)深度 ≈ ±1 个八度 @ Mod 轮满深;音高 FM 满深 ±300 音分。
