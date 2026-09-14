import type { SynthModel } from "../model/synth";
import { DIMS } from "../model/dimensions";

/**
 * 铰链面板控制器(HINGE-1/2/4/6):
 * 0–60°,3D 默认 ~50°,0.5s 缓动切换;2D 自动放平,回 3D 恢复记忆角度。
 * 拖拽调角由 interaction 直接调用 setDeg(无动画)。
 */

export class HingeController {
  deg: number = DIMS.panelDefaultDeg; // 当前角度
  private anim: { from: number; to: number; t: number; dur: number; onDone?: () => void } | null = null;
  /** 3D 模式下用户记忆的角度 */
  memorized: number = DIMS.panelDefaultDeg;
  reducedMotion: boolean;

  constructor(private model: SynthModel, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
  }

  get isAnimating(): boolean {
    return this.anim !== null;
  }

  /** 立起/放平切换(H 键 / 按钮) */
  toggle(onDone?: () => void): void {
    const target = this.deg > (DIMS.panelMaxDeg / 2) ? 0 : DIMS.panelDefaultDeg;
    this.animateTo(target, onDone);
  }

  raise(onDone?: () => void): void {
    this.animateTo(this.memorized > 1 ? this.memorized : DIMS.panelDefaultDeg, onDone);
  }

  flatten(onDone?: () => void): void {
    this.animateTo(0, onDone);
  }

  animateTo(target: number, onDone?: () => void): void {
    target = Math.min(DIMS.panelMaxDeg, Math.max(0, target));
    if (this.reducedMotion) {
      this.anim = null;
      this.setDeg(target);
      onDone?.();
      return;
    }
    this.anim = { from: this.deg, to: target, t: 0, dur: 0.5, onDone };
  }

  /** 拖拽直接设角(HINGE-3) */
  setDeg(deg: number): void {
    this.anim = null;
    this.deg = Math.min(DIMS.panelMaxDeg, Math.max(0, deg));
    this.model.setHingeDeg(this.deg);
  }

  update(dt: number): void {
    if (!this.anim) return;
    const a = this.anim;
    a.t = Math.min(1, a.t + dt / a.dur);
    const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2; // easeInOutQuad
    this.deg = a.from + (a.to - a.from) * k;
    this.model.setHingeDeg(this.deg);
    if (a.t >= 1) {
      this.anim = null;
      a.onDone?.();
    }
  }
}
