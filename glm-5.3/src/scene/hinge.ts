/**
 * 铰链面板控制(PRD §6):0°(放平)~ 60°;3D 默认立起约 50°;
 * 约 0.5s 缓动动画;2D 视角强制放平并记忆角度(HINGE-1/2/4)。
 */
import * as THREE from "three";
import type { SynthModel } from "../model/synth";

const MAX_DEG = 60;
const DEFAULT_3D_DEG = 50;

export class HingeController {
  private pivot: THREE.Object3D;
  current = DEFAULT_3D_DEG;
  private target = DEFAULT_3D_DEG;
  /** 2D 模式进入前记住的角度 */
  remembered = DEFAULT_3D_DEG;
  private reducedMotion: boolean;
  /** 拖拽调角(HINGE-3)直接写入 */
  onAngleChange?: (deg: number) => void;

  constructor(model: SynthModel) {
    this.pivot = model.panelPivot;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.apply();
  }

  setTarget(deg: number, animate = true): void {
    this.target = THREE.MathUtils.clamp(deg, 0, MAX_DEG);
    if (!animate || this.reducedMotion) {
      this.current = this.target;
      this.apply();
    }
  }

  /** 连续拖拽调角 */
  dragTo(deg: number): void {
    this.target = THREE.MathUtils.clamp(deg, 0, MAX_DEG);
    this.current = this.target;
    this.apply();
    this.onAngleChange?.(this.current);
  }

  toggle(): number {
    const next = this.target > 5 ? 0 : DEFAULT_3D_DEG;
    this.setTarget(next);
    return next;
  }

  enter2d(): void {
    if (this.target > 0) this.remembered = this.target;
    this.setTarget(0);
  }

  exit2d(): void {
    this.setTarget(this.remembered);
  }

  update(dt: number): void {
    if (Math.abs(this.target - this.current) < 0.01) return;
    const speed = this.reducedMotion ? 1 : dt / 0.5;
    this.current += (this.target - this.current) * Math.min(1, speed * 3.2);
    if (Math.abs(this.target - this.current) < 0.05) this.current = this.target;
    this.apply();
  }

  private apply(): void {
    // +θ:面板后缘(自由边)向上、向演奏者方向掀起(铰链在面板前缘/键盘侧)
    this.pivot.rotation.x = THREE.MathUtils.degToRad(this.current);
  }
}
