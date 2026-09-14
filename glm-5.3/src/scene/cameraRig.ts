import * as THREE from "three";

/**
 * 相机 rig(PRD §5.1 / §10):单一 PerspectiveCamera。
 * 3D 态 = 球坐标轨道(阻尼、俯仰/缩放限制);2D 态 = 正立面 + 窄 FOV,仅缩放;
 * 切换 = 位置/朝向/FOV 插值(~0.8s ease-in-out),支持 reduced-motion 直接到位。
 */

export type ViewMode = "3d" | "2d";

const D3 = {
  theta: 0.0,
  phi: 1.08, // 俯角
  radius: 0.85,
  target: new THREE.Vector3(0, 0.1, 0.02),
  fov: 38,
};
const D2 = {
  theta: 0,
  phi: 0.62, // 正前上方俯视放平的面板(丝印可读)
  radius: 0.9,
  target: new THREE.Vector3(0, 0.05, -0.045),
  fov: 26, // 较窄 FOV 减轻透视变形
};

const PHI_MIN = 0.35;
const PHI_MAX = 1.52;
const R_MIN = 0.4;
const R_MAX = 2.0;
const R_MIN_2D = 0.55;
const R_MAX_2D = 2.2;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface RigState {
  theta: number;
  phi: number;
  radius: number;
  fov: number;
}

interface Tween {
  from: RigState;
  to: RigState;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  dur: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: ViewMode = "3d";

  // 目标态(阻尼追踪)
  private cur = { theta: D3.theta, phi: D3.phi, radius: D3.radius, fov: D3.fov };
  private goal = { theta: D3.theta, phi: D3.phi, radius: D3.radius, fov: D3.fov };
  private curTarget = D3.target.clone();
  private goalTarget = D3.target.clone();

  // 补间态
  private tween: Tween | null = null;

  reducedMotion: boolean;

  constructor(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.camera = new THREE.PerspectiveCamera(
      D3.fov,
      window.innerWidth / window.innerHeight,
      0.02,
      30
    );
    this.apply();
  }

  get isTweening(): boolean {
    return this.tween !== null;
  }

  /** 手势输入(3D 态) */
  orbit(dTheta: number, dPhi: number): void {
    if (this.mode !== "3d" || this.tween) return;
    this.goal.theta += dTheta;
    this.goal.phi = THREE.MathUtils.clamp(this.goal.phi + dPhi, PHI_MIN, PHI_MAX);
  }

  pan(dx: number, dz: number): void {
    if (this.tween) return;
    if (this.mode === "3d") {
      // 沿相机水平朝向平移
      const s = this.goal.radius * 0.0011;
      const sin = Math.sin(this.goal.theta);
      const cos = Math.cos(this.goal.theta);
      this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x + (dx * cos - dz * sin) * s, -0.6, 0.6);
      this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z + (dx * sin + dz * cos) * s, -0.6, 0.6);
    }
  }

  zoom(factor: number): void {
    if (this.tween) return;
    const [rmin, rmax] = this.mode === "3d" ? [R_MIN, R_MAX] : [R_MIN_2D, R_MAX_2D];
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, rmin, rmax);
  }

  setMode(mode: ViewMode, reducedMotion = this.reducedMotion): void {
    if (mode === this.mode && !this.tween) return;
    this.mode = mode;
    const to = mode === "3d" ? D3 : D2;
    if (reducedMotion) {
      this.tween = null;
      this.goal = { theta: to.theta, phi: to.phi, radius: to.radius, fov: to.fov };
      this.cur = { ...this.goal };
      this.goalTarget.copy(to.target);
      this.curTarget.copy(to.target);
      this.apply();
      return;
    }
    this.tween = {
      from: { ...this.cur },
      to: { theta: to.theta, phi: to.phi, radius: to.radius, fov: to.fov },
      fromTarget: this.curTarget.clone(),
      toTarget: to.target.clone(),
      t: 0,
      dur: 0.8,
    };
  }

  /** 开场运镜(P2):从侧后方缓推至默认机位 */
  playIntro(onDone?: () => void): void {
    if (this.reducedMotion) {
      onDone?.();
      return;
    }
    this.cur = { theta: 2.1, phi: 0.75, radius: 1.7, fov: D3.fov };
    this.curTarget.set(0, 0.18, 0);
    this.goal = { theta: D3.theta, phi: D3.phi, radius: D3.radius, fov: D3.fov };
    this.goalTarget.copy(D3.target);
    this.tween = {
      from: { ...this.cur },
      to: { ...this.goal },
      fromTarget: this.curTarget.clone(),
      toTarget: this.goalTarget.clone(),
      t: 0,
      dur: 2.0,
    };
    this.onIntroDone = onDone ?? null;
  }

  private onIntroDone: (() => void) | null = null;

  update(dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = easeInOut(tw.t);
      this.cur.theta = THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, k);
      this.cur.phi = THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, k);
      this.cur.radius = THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, k);
      this.cur.fov = THREE.MathUtils.lerp(tw.from.fov, tw.to.fov, k);
      this.curTarget.lerpVectors(tw.fromTarget, tw.toTarget, k);
      this.goal = { ...tw.to };
      this.goalTarget.copy(tw.toTarget);
      if (tw.t >= 1) {
        this.tween = null;
        const done = this.onIntroDone;
        this.onIntroDone = null;
        done?.();
      }
    } else {
      // 阻尼惯性(VIEW-2)
      const damp = 1 - Math.exp(-dt * 9);
      this.cur.theta += (this.goal.theta - this.cur.theta) * damp;
      this.cur.phi += (this.goal.phi - this.cur.phi) * damp;
      this.cur.radius += (this.goal.radius - this.cur.radius) * damp;
      this.cur.fov += (this.goal.fov - this.cur.fov) * damp;
      this.curTarget.lerp(this.goalTarget, damp);
    }
    this.apply();
  }

  private apply(): void {
    const { theta, phi, radius } = this.cur;
    const sp = Math.sin(phi);
    this.camera.position.set(
      this.curTarget.x + radius * sp * Math.sin(theta),
      this.curTarget.y + radius * Math.cos(phi),
      this.curTarget.z + radius * sp * Math.cos(theta)
    );
    this.camera.lookAt(this.curTarget);
    if (Math.abs(this.camera.fov - this.cur.fov) > 0.01) {
      this.camera.fov = this.cur.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
