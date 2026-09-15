/**
 * 首启引导(PRD UI-4):11 步(欢迎 → 振荡器 → 混音器 → 滤波器 → 滤波包络 →
 * 响度包络 → 控制器 → 调制 → 键盘 → 预设 → 完成)。
 * 每步以聚光灯高亮对应 3D 区域(锚点投影到屏幕)+ 标题与说明;
 * 可上一步/下一步/跳过;完成后自动上电;只出现一次。
 */
import * as THREE from "three";
import type { SynthModel } from "../model/synth";
import type { CameraRig } from "../scene/cameraRig";

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  /** 3D 锚点名或 DOM 元素 */
  anchor?: string;
  dom?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to the Aether Model D",
    body: "这是一台可在浏览器中把玩的单音模拟合成器:三个振荡器、梯形低通滤波器、可掀开的铰链控制面板。跟随快速导览开始演奏。",
  },
  {
    id: "oscillators",
    title: "Oscillators · 振荡器组",
    body: "三排对应 Osc-1/2/3:Range 选择音域(LO 为低频模式),Frequency 独立失谐,Waveform 在六种带限波形中选择 —— 声音的起点。",
    anchor: "oscillators",
  },
  {
    id: "mixer",
    title: "Mixer · 混音器",
    body: "蓝色拨杆接通各振荡器,旋钮控制电平;噪声(白/粉)与外部输入也在这里混合,进入滤波器。",
    anchor: "mixer",
  },
  {
    id: "filter",
    title: "Filter · 梯形滤波器",
    body: "标志性音色核心:Cutoff 控制明暗,Emphasis 拉满时滤波器自激。Keyboard Control 开关让音高跟踪截止频率。",
    anchor: "filter",
  },
  {
    id: "filter-envelope",
    title: "Filter Envelope · 滤波包络",
    body: "Attack / Decay / Sustain 塑造截止频率随时间的变化;Amount of Contour 决定包络深度 —— 铜管与打击乐音色的关键。",
    anchor: "filter-envelope",
  },
  {
    id: "loudness-envelope",
    title: "Loudness Contour · 响度包络",
    body: "同样三旋钮结构,控制音量随时间的形状。侧边条的 Decay 开关开启打击乐模式(忽略 Sustain)。",
    anchor: "loudness-envelope",
  },
  {
    id: "controllers",
    title: "Controllers · 控制器",
    body: "Tune 主音准(±12 半音),Glide 滑音时间,Modulation Mix 混合两个调制源(源 A / 源 B 拨杆选择)。",
    anchor: "controllers",
  },
  {
    id: "modulation",
    title: "Modulation · 调制",
    body: "橙色拨杆是调制开关:Oscillator Modulation 开启音高 FM,Filter Modulation 开启截止 FM;深度由左侧调制轮控制。",
    anchor: "modulation",
  },
  {
    id: "keyboard",
    title: "Keyboard · 键盘",
    body: "44 键,鼠标按住滑过可滑奏;电脑键盘(QWERTY)与 MIDI 键盘同样可演奏。左侧是弯音轮与调制轮。",
    anchor: "keyboard",
  },
  {
    id: "presets",
    title: "Presets · 预设",
    body: "工具栏的 Presets 下拉提供 36 个出厂音色,选择即整面板切换。键位说明在 Keymap 里。",
    dom: "preset",
  },
  {
    id: "done",
    title: "You're Ready! · 开始演奏",
    body: "右上角可切换 3D/2D 视角、立起或放平面板(快捷键 V / H)。祝你玩得开心!",
  },
];

export class Onboarding {
  private model: SynthModel;
  private rig: CameraRig;
  private root: HTMLDivElement;
  private spotlight: HTMLDivElement;
  private card: HTMLDivElement;
  private titleEl: HTMLHeadingElement;
  private bodyEl: HTMLParagraphElement;
  private stepDots: HTMLDivElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private step = 0;
  private active = false;
  onFinish?: () => void;
  onSkip?: () => void;

  constructor(model: SynthModel, rig: CameraRig) {
    this.model = model;
    this.rig = rig;

    this.root = document.createElement("div");
    this.root.className = "onboarding";
    this.root.style.display = "none";

    this.spotlight = document.createElement("div");
    this.spotlight.className = "ob-spot";

    this.card = document.createElement("div");
    this.card.className = "ob-card";
    this.titleEl = document.createElement("h2");
    this.bodyEl = document.createElement("p");
    this.stepDots = document.createElement("div");
    this.stepDots.className = "ob-dots";
    const nav = document.createElement("div");
    nav.className = "ob-nav";
    this.prevBtn = document.createElement("button");
    this.prevBtn.className = "tb-btn";
    this.prevBtn.textContent = "← 上一步";
    this.nextBtn = document.createElement("button");
    this.nextBtn.className = "tb-btn primary";
    this.nextBtn.textContent = "下一步 →";
    this.skipBtn = document.createElement("button");
    this.skipBtn.className = "tb-btn ghost";
    this.skipBtn.textContent = "跳过导览";
    nav.append(this.prevBtn, this.nextBtn);
    this.card.append(this.titleEl, this.bodyEl, this.stepDots, nav, this.skipBtn);
    this.root.append(this.spotlight, this.card);
    document.body.appendChild(this.root);

    this.prevBtn.addEventListener("click", () => this.go(this.step - 1));
    this.nextBtn.addEventListener("click", () => {
      if (this.step >= ONBOARDING_STEPS.length - 1) this.finish();
      else this.go(this.step + 1);
    });
    this.skipBtn.addEventListener("click", () => this.finish(true));
  }

  start(): void {
    this.active = true;
    this.root.style.display = "block";
    this.go(0);
  }

  get isActive(): boolean {
    return this.active;
  }

  private go(step: number): void {
    this.step = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, step));
    const s = ONBOARDING_STEPS[this.step];
    this.titleEl.textContent = s.title;
    this.bodyEl.textContent = s.body;
    this.prevBtn.style.visibility = this.step === 0 ? "hidden" : "visible";
    this.nextBtn.textContent =
      this.step >= ONBOARDING_STEPS.length - 1 ? "完成 ✓" : "下一步 →";
    this.stepDots.innerHTML = ONBOARDING_STEPS.map(
      (_, i) => `<i class="${i === this.step ? "on" : ""}"></i>`,
    ).join("");
  }

  private finish(skipped = false): void {
    this.active = false;
    this.root.style.display = "none";
    if (skipped) this.onSkip?.();
    this.onFinish?.();
  }

  /** 每帧:把当前步骤的 3D 锚点投影到屏幕并布置聚光灯 */
  update(): void {
    if (!this.active) return;
    const s = ONBOARDING_STEPS[this.step];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (s.anchor && this.model.anchors[s.anchor]) {
      const world = new THREE.Vector3();
      this.model.anchors[s.anchor].getWorldPosition(world);
      const p = this.rig.project(world);
      const cx = p.x * vw;
      const cy = p.y * vh;
      // 聚光半径:按世界尺度 0.09m 估算(投影近似)
      const r = Math.max(90, Math.min(230, vh * 0.22));
      this.spotlight.style.display = "block";
      this.spotlight.style.left = `${cx - r}px`;
      this.spotlight.style.top = `${cy - r}px`;
      this.spotlight.style.width = `${r * 2}px`;
      this.spotlight.style.height = `${r * 2}px`;
      this.spotlight.style.borderRadius = `${r}px`;
      this.spotlight.style.opacity = p.visible ? "1" : "0";
      this.placeCard(cx + r + 24, cy - 40);
    } else if (s.dom === "preset") {
      const btn = document.querySelector<HTMLButtonElement>("#ui-root .preset-wrap");
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const r = 70;
        this.spotlight.style.display = "block";
        this.spotlight.style.left = `${rect.left + rect.width / 2 - r}px`;
        this.spotlight.style.top = `${rect.top + rect.height / 2 - r}px`;
        this.spotlight.style.width = `${r * 2}px`;
        this.spotlight.style.height = `${r * 2}px`;
        this.spotlight.style.borderRadius = `${r}px`;
        this.spotlight.style.opacity = "1";
        this.placeCard(rect.left - 140, rect.bottom + 26);
      }
    } else {
      this.spotlight.style.display = "none";
      this.placeCard(vw / 2, vh / 2);
    }
  }

  private placeCard(x: number, y: number): void {
    const cw = 340;
    const ch = this.card.offsetHeight || 210;
    let px = x;
    let py = y;
    if (px + cw > window.innerWidth - 16) px = window.innerWidth - cw - 16;
    if (px < 16) px = 16;
    if (py + ch > window.innerHeight - 16) py = window.innerHeight - ch - 16;
    if (py < 16) py = 16;
    this.card.style.left = `${px}px`;
    this.card.style.top = `${py}px`;
  }

  dispose(): void {
    this.root.remove();
  }
}
