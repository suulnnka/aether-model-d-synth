/**
 * 相机 rig(PRD §5):3D 轨道态 / 2D 正面态的插值状态机 + 开场运镜。
 * 3D:旋转 = 仅右键;缩放 = 滚轮;平移 = 中键 / Shift+右键(VIEW-2)。
 * 2D:正立面窄 FOV,锁定旋转与平移,仅缩放(VIEW-3)。
 */
import * as THREE from "three";
import type { Stage } from "./stage";

export type ViewMode = "3d" | "2d";

const TARGET = new THREE.Vector3(0, 0.1, 0.01);
const DEFAULT_3D = { azimuth: -0.62, polar: 1.12, radius: 0.66 };
const LIMITS = {
  radius: [0.34, 1.35],
  polar: [0.35, 1.5],
};

export class CameraRig {
  mode: ViewMode = "3d";
  private stage: Stage;
  /** 3D 轨道状态(含惯性) */
  private az = DEFAULT_3D.azimuth;
  private pol = DEFAULT_3D.polar;
  private rad = DEFAULT_3D.radius;
  private panOffset = new THREE.Vector3();
  private vAz = 0;
  private vPol = 0;
  /** 2D 状态 */
  private zoom2d = 1;
  /** 模式混合:0 = 3D,1 = 2D */
  private blend = 0;
  private blendTarget = 0;
  /** 开场运镜 */
  introT = -1; // -1 未开始;0..1 进行中;2 完成
  private introFrom = { azimuth: 2.35, polar: 0.78, radius: 1.3 };
  onModeChange?: (mode: ViewMode) => void;
  onIntroDone?: () => void;
  private reducedMotion = false;

  constructor(stage: Stage) {
    this.stage = stage;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** 页面加载完成后调用(VIEW-6) */
  startIntro(): void {
    if (this.reducedMotion) {
      this.introT = 2;
      this.onIntroDone?.();
      return;
    }
    this.az = this.introFrom.azimuth;
    this.pol = this.introFrom.polar;
    this.rad = this.introFrom.radius;
    this.introT = 0;
  }

  skipIntro(): void {
    if (this.introT >= 0 && this.introT < 2) {
      this.introT = 2;
      this.az = DEFAULT_3D.azimuth;
      this.pol = DEFAULT_3D.polar;
      this.rad = DEFAULT_3D.radius;
      this.onIntroDone?.();
    }
  }

  get introRunning(): boolean {
    return this.introT >= 0 && this.introT < 2;
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.blendTarget = mode === "2d" ? 1 : 0;
    this.onModeChange?.(mode);
  }

  /** 恢复会话时直接落位(无过渡) */
  setModeImmediate(): void {
    this.blend = this.blendTarget;
    this.update(0);
  }

  toggleMode(): void {
    this.setMode(this.mode === "3d" ? "2d" : "3d");
  }

  get blend2d(): number {
    return this.blend;
  }

  /** QA 调试:轨道内部状态 */
  debugState(): { az: number; pol: number; rad: number; zoom2d: number } {
    return { az: this.az, pol: this.pol, rad: this.rad, zoom2d: this.zoom2d };
  }

  /** 3D 轨道旋转(右键拖拽 / 触摸板双指滑动) */
  rotate(dx: number, dy: number): void {
    if (this.mode !== "3d" || this.blend > 0.02) return;
    this.vAz -= dx * 0.0032;
    this.vPol -= dy * 0.0028;
  }

  /* 触摸板/鼠标滚轮手势状态(区分设备) */
  private lastWheelAt = 0;
  private lastWheelTrackpad = false;

  /**
   * 滚轮手势分流(VIEW-2 的触摸板扩展):
   *  - 捏合(ctrl+wheel)→ 缩放
   *  - 触摸板双指滑动 → 环绕旋转(Shift+双指 = 平移)
   *  - 鼠标滚轮(行模式 / 整数档位 / 孤立事件)→ 缩放
   * 触摸板识别:deltaMode=像素 且(带横向分量 deltaX / 小数增量 / 连续事件流)。
   */
  wheelGesture(e: WheelEvent): void {
    const now = performance.now();
    const burst = now - this.lastWheelAt < 60 && this.lastWheelTrackpad;
    this.lastWheelAt = now;

    if (e.ctrlKey) {
      // 触摸板捏合(浏览器约定 ctrl+wheel = pinch)
      this.zoom(e.deltaY);
      this.lastWheelTrackpad = true;
      return;
    }
    if (this.mode !== "3d" || this.blend > 0.02) {
      // 2D 视角:仅缩放
      this.zoom(e.deltaY);
      this.lastWheelTrackpad = e.deltaMode === 0 && !Number.isInteger(e.deltaY);
      return;
    }
    const trackpad =
      e.deltaMode === 0 &&
      (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || burst);
    this.lastWheelTrackpad = trackpad;
    if (trackpad) {
      if (e.shiftKey) {
        this.pan(e.deltaX, e.deltaY);
      } else {
        // 两指滑动 = 环绕旋转:直接驱动(1:1 跟手,无惯性尾巴;惯性仅保留给右键甩动)
        if (this.mode === "3d" && this.blend <= 0.02) {
          this.vAz = 0;
          this.vPol = 0;
          this.az -= e.deltaX * 0.0032;
          this.pol = THREE.MathUtils.clamp(
            this.pol - e.deltaY * 0.0028 * 0.9,
            LIMITS.polar[0],
            LIMITS.polar[1],
          );
        }
      }
    } else {
      this.zoom(e.deltaY);
    }
  }

  /** 平移(中键 / Shift+右键) */
  pan(dx: number, dy: number): void {
    if (this.mode !== "3d" || this.blend > 0.02) return;
    const scale = this.rad * 0.0011;
    const right = new THREE.Vector3().setFromMatrixColumn(this.stage.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.stage.camera.matrix, 1);
    this.panOffset.addScaledVector(right, -dx * scale);
    this.panOffset.addScaledVector(up, dy * scale);
    this.panOffset.clampLength(0, 0.55);
  }

  /** 缩放(滚轮 / 触摸板;两种视角都可用) */
  zoom(delta: number): void {
    if (this.mode === "2d" || this.blendTarget === 1) {
      this.zoom2d = THREE.MathUtils.clamp(this.zoom2d * (1 + delta * 0.0011), 0.55, 2.2);
    } else {
      this.rad = THREE.MathUtils.clamp(this.rad * (1 + delta * 0.0011), LIMITS.radius[0], LIMITS.radius[1]);
    }
  }

  update(dt: number): void {
    /* 开场运镜:约 2s ease-in-out 环绕推进 */
    if (this.introT >= 0 && this.introT < 2) {
      const speed = dt / 2.0;
      this.introT = Math.min(1, this.introT + speed);
      const t = easeInOutCubic(this.introT);
      const wrap = (from: number, to: number) => {
        // 从 2.35 rad 逆时针绕到 -0.62 rad(连续路径)
        let d = to - from;
        while (d < -Math.PI) d += Math.PI * 2;
        return from + d * t;
      };
      this.az = wrap(this.introFrom.azimuth, DEFAULT_3D.azimuth);
      this.pol = THREE.MathUtils.lerp(this.introFrom.polar, DEFAULT_3D.polar, t);
      this.rad = THREE.MathUtils.lerp(this.introFrom.radius, DEFAULT_3D.radius, t);
      if (this.introT >= 1) {
        this.introT = 2;
        this.onIntroDone?.();
      }
    }

    /* 模式切换平滑(VIEW-1:约 0.8s) */
    const bt = this.blendTarget;
    const step = dt / (this.reducedMotion ? 0.05 : 0.8);
    if (this.blend < bt) this.blend = Math.min(bt, this.blend + step);
    else if (this.blend > bt) this.blend = Math.max(bt, this.blend - step);
    const b = easeInOutCubic(this.blend);

    /* 阻尼惯性 */
    this.az += this.vAz;
    this.pol += this.vPol;
    this.vAz *= Math.pow(0.0001, dt);
    this.vPol *= Math.pow(0.0001, dt);
    this.pol = THREE.MathUtils.clamp(this.pol, LIMITS.polar[0], LIMITS.polar[1]);

    /* 3D 位姿 */
    const target = TARGET.clone().add(this.panOffset);
    const pos3d = new THREE.Vector3(
      target.x + this.rad * Math.sin(this.pol) * Math.sin(this.az),
      target.y + this.rad * Math.cos(this.pol),
      target.z + this.rad * Math.sin(this.pol) * Math.cos(this.az),
    );
    const q3d = quatLookAt(pos3d, target, UP_Y);

    /* 2D 位姿:俯视整机(面板在上、键盘在下),窄 FOV 近似平行投影。
       屏幕上方 = 机身后方(up = −z),与参考实现的 2D 界面一致 */
    const dist2 = 1.1 * this.zoom2d;
    const target2d = new THREE.Vector3(0, 0.03, 0.0);
    const pos2d = new THREE.Vector3(0, dist2 + 0.06, 0.0);
    const q2d = quatLookAt(pos2d, target2d, UP_REAR);

    const camera = this.stage.camera;
    camera.position.copy(pos3d.lerp(pos2d, b));
    camera.quaternion.slerpQuaternions(q3d, q2d, b);
    camera.fov = THREE.MathUtils.lerp(38, 22, b);
    camera.updateProjectionMatrix();
  }

  /** 把世界坐标投影到屏幕(0..1),供引导聚光灯与 tooltip 用 */
  project(world: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const camera = this.stage.camera;
    const v = world.clone().project(camera);
    return {
      x: (v.x + 1) / 2,
      y: (1 - v.y) / 2,
      visible: v.z > -1 && v.z < 1,
    };
  }

  resetView(): void {
    this.az = DEFAULT_3D.azimuth;
    this.pol = DEFAULT_3D.polar;
    this.rad = DEFAULT_3D.radius;
    this.panOffset.set(0, 0, 0);
    this.zoom2d = 1;
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const UP_Y = new THREE.Vector3(0, 1, 0);
const UP_REAR = new THREE.Vector3(0, 0, -1); // 俯视时屏幕上方 = 机身后方

/** 由 eye/target/up 构造朝向四元数(3D↔2D 位姿之间做 slerp) */
function quatLookAt(eye: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(eye, target, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
