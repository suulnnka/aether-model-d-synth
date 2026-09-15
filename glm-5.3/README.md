# Aether Model D — 3D Web Synthesizer

按 `PRD.md`(v3.2)完整重写的实现:把参考实现的 2D 网页合成器**功能 1:1 照抄**搬进 3D ——
可环绕观察、可掀开铰链控制面板、可切换 2D/3D 视角的 44 键单音模拟合成器。
Three.js 渲染 + Web Audio API 实时合成,无任何装饰性控件。

> 法律口径:本产品为「致敬经典形态的自研合成器」。全产品(模型丝印、贴图、UI、代码、文档、
> title/og)不含任何第三方商标字样或图形;品牌为自绘「AETHER / Model D」。
> 预设名沿用参考实现原文(仅内部音色数据,非对外品牌文案)。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器(默认 http://localhost:5173)
npm run build      # 生产构建(首包 gzip ≈212KB,预算 700KB)
npm run preview    # 预览生产构建
npm test           # vitest 逻辑单测(25 项)
```

- 首次进入:任意点击 → 自动上电、启动音频;首访弹出 11 步引导(可跳过,只出现一次)。
- 浏览器内自检:`http://localhost:5173/?selftest` 运行 OfflineAudioContext 离线渲染断言(6 项)。

## 操作(§16,照抄参考实现)

| 输入 | 行为 |
|---|---|
| `A S D F G H J K L ; '` | 白键半音上行(基准 C4:A=C … '=F+1) |
| `W E T Y U O P` | 黑键(C#、D#、F#、G#、A#、C#2、D#2) |
| `Q` | 基准音下方大二度(B) |
| `Z` / `X` | 基准八度 下移 / 上移(MIDI 0–127 钳位) |
| `1` / `2` | 弯音 下 / 上(按住生效,松开回中,±2 半音) |
| `3`–`8` | 调制深度 0 / 20 / 40 / 60 / 80 / 100% |
| `V` / `H` | 视角切换 3D/2D / 面板立起-放平 |
| 鼠标 · 旋钮 | 按住垂直拖动;`Shift` 精调 ×0.1;滚轮微调;双击恢复默认 |
| 鼠标 · 档位旋钮 | 单击循环进档;按住左右拖动换档 |
| 鼠标 · 拨杆/跷板 | 单击翻转(≤100ms 动画) |
| 鼠标 · 琴键 | 按下发声、抬起停音;按住滑过 = 滑奏;支持触摸 |
| 鼠标 · 滑轮 | 弯音轮松手弹簧回中;调制轮保持 |
| 面板后缘(3D) | 拖拽调整面板角度 0–60°(向上拖 = 立起) |
| 相机(3D) | **仅右键**环绕;滚轮缩放;中键或 `Shift`+右键平移(左键永不旋转) |
| 触摸板(3D) | 双指滑动环绕;捏合缩放;`Shift`+双指平移 |
| MIDI | Note On/Off · Pitch Bend · CC1 调制轮,即插即用,多设备 |

## 声音引擎(§10)

信号流(常驻音频图 AUD-4,noteOn/off 只调度包络与音高自动化):

```
Osc-1/2/3 ─On/Off─ 电平 ─┐
Noise(白/粉) ─电平───────┼→ 混音 → 梯形低通 24dB/oct → VCA(响度包络)
Ext-In(麦克风) ─电平─────┘                        ↓
                          主音量 → 软饱和 → 电源总闸 → Out;A-440 独立支路
调制矩阵:源A = Osc.3 | Filter EG;源B = Noise | LFO(独立,三角/方波 0.2–20Hz)
  Mod Mix 线性混合 → Oscillator Mod ⇒ 三 VCO 音高 FM(深度=调制轮)
                   → Filter Mod ⇒ 截止 FM(Worklet a-rate 参数,八度)
```

- **梯形滤波器**:`public/audio/ladder-processor.js` —— 基于公开论文
  (Huovilainen 2004/2010)自行实现的四极非线性梯形:四级一极 + tanh 饱和 + 共振反馈 +
  半样本相位补偿 + 2 倍过采样;信号在 tanh 膝点归一化单位下运行,Emphasis=10 稳定自激;
  逐样参数平滑防爆音;滤波包络(Attack/Decay/Sustain + Decay 打击乐模式)在 Worklet 内
  样本级实现;Worklet 不可用时降级 4×Biquad 级联并 toast 提示「兼容模式」。
- **波形**:六档全部以 ≤128 谐波傅里叶系数构造 PeriodicWave(带限无混叠,AUD-4)。
- **包络**:0–10 分段非线性映射(0≈0ms、1≈10ms、2≈200ms、4≈600ms、6≈1s、8≈5s、10≈10s);
  松键固定短尾 70ms;全部自动化走 `setTargetAtTime`。
- **单音逻辑**:last-note priority,乱序松开回退仍按住的最末键(只滑音不重触发)。
- **Osc-3 Control**:OFF 时脱离键盘自由运行(LO 档即成 LFO);LO 档不接收音高 FM。
- **滑音**:0–10 → 5ms–2.5s 指数;回退音同样适用。

## 3D 与场景(§7 / §8)

- 摄影棚单一场景:深胡桃木台面 + Lathe 旋成无缝背景幕(渐变 + 颗粒消除色带)+ 极轻指数雾。
- IBL(RoomEnvironment PMREM)+ 三点布光(暖主光投影 / 冷补光 / 轮廓光)+ 半球光兜底;
  PCFSoft 软阴影(2048)。
- ACESFilmic + sRGB 输出、DPR ≤2、Bloom(仅 LED/Overload 起辉)+ 暗角/颗粒 + SMAA。
- 整机全程序化建模(无外部二进制资源):五分区面板 + 四条交界开关列(§8.2 逐项对位)、
  44 键(白/黑各一个 InstancedMesh)、键盘左侧边条、木侧板、后面板插孔;
  **铰链面板为厚箱体(8cm,铰链在面板前缘/键盘侧,向演奏者掀起),背腔放满元器件**:三块 PCB、电解电容/电阻/晶体管
  (InstancedMesh)、变压器、彩色排线(TubeGeometry)、支撑框架。
- 丝印 Canvas 程序化绘制(≥2048px + 各向异性过滤):分区标题、控件名、刻度环、
  六种波形图标、ON 标记;品牌为自绘 AETHER 字标。
- 视角:3D 轨道(阻尼)/ 2D 俯视(整机平铺:面板在上、键盘在下,窄 FOV 近似平行投影,
  键盘可直接点按演奏)平滑互切(约 0.8s,四元数 slerp 无奇点),2D 下面板自动放平、
  切回恢复记忆角度;开场运镜约 2s 可跳过(`prefers-reduced-motion` 直接落位)。

## 状态与 UI(§12 / §13)

- **ParamStore** 单一参数仓库:48 个控件规格(§15 全表:min/max/默认/档位/文案),
  3D 控件与音频引擎只与仓库通信;预设载入 = 一次批量赋值 + 变更集广播。
- **36 个出厂预设**逐一移植参考实现(名称、分类、参数完全一致,仅剔除效果器字段);
  下拉按分类分组,载入即整面板切换(3D 姿态 + 音频同步)。
- localStorage 持久化:面板状态、视角/面板角度、引导已读标记(键前缀 `aether.glm53.*`)。
- 工具栏仅 **Keymap** 与 **Presets**(无 Options/Effects/Copy URL);键位说明弹层;
  11 步首启引导(3D 锚点投影聚光灯);toast;「点击任意处开启声音」;
  窄屏 ≤760px 显示提示页;WebGL 上下文丢失显示刷新提示;`prefers-reduced-motion` 缩短动画。
- 电源联动:OFF 时引擎静音、LED 熄灭、面板控件禁用(置灰不可交互),跷板可再上电。

## 工程结构(§18)

```
src/
  state/      paramStore(§15 注册表)+ presets(36 出厂)+ persist(localStorage)
  audio/      engine(常驻音频图/调制矩阵/包络)、mapping(全部映射曲线)、
              waveforms(带限波表)、monoKeys(last-note priority)、
              selftest(?selftest 离线渲染断)、public/audio/ladder-processor.js(梯形 Worklet)
  model/      dimensions(布局坐标)、materials/textures(PBR 材质库/程序化纹理)、
              silkscreen(Canvas 丝印)、controls(控件工厂)、keys(44 键)、
              backroom(背腔元器件)、cabinet(机箱/木侧板)、synth(总装)
  scene/      stage(渲染器/布光/台面背景/后期)、cameraRig(3D/2D 状态机+运镜)、hinge
  interaction/interactions.ts(raycast 手势状态机 + hover 高亮 + tooltip)
  input/      qwerty(§16 映射)、midi(Web MIDI)
  ui/         overlay(工具栏/预设/键位说明/toast)、onboarding(11 步引导)
tests/logic.test.ts  单音逻辑/映射曲线/预设取值/ParamStore/QWERTY/键盘布局
```

## 质量验收

- `npm test`:25 项单测全绿(单音优先级与乱序回退、PRD 停靠点映射、cutoff 单调、
  36 预设取值校验、附录 A 默认口径、QWERTY 表、44 键布局)。
- `?selftest`(浏览器内 OfflineAudioContext 断言,6/6):
  锯齿波谐波 1/n(h2/h1=0.50)、滤波斜率 2.8k→5.6k ≈18.7dB(渐近 24dB/oct)、
  Emphasis=10 自激(纯正弦,邻带比 27×)、响度包络 1s@6 精确 0.50s、
  滑音 2.5s 轨迹、释放后底噪 −240dB。
- 浏览器实测:首次点击自动上电、QWERTY last-note priority(60→61→回退 60)、
  3D 拨杆点击翻转、旋钮垂直拖动(3.9→0.15)、2D 切换面板放平且丝印可读、
  预设载入参数逐项一致、电源关断禁用交互、localStorage 恢复。
- 窗口失焦 / 切标签 → 自动 All Notes Off,防挂音(INT-10)。

## 已知调音决策

- 梯形恒等极点级联的整体 −3dB ≈ 0.435 × 单极频率,Worklet 内做 ×2.3 转折点补偿
  使旋钮标称值与听感一致(自激频率相应落在 ≈2.2 × 标称值,`CUTOFF_COMP`)。
- 共振反馈上限 4.8(`RES_QUAD_MAX`):Emphasis=10 稳定自激,≈8.5 起进入临界区。
- 音高 FM 满深度 ±7 半音、滤波 FM 满深度 ±3 个八度(深度 = 调制轮);
  源 A = Osc.3 时 Osc-3 自身只接收源 B 份额(不自调制)。
