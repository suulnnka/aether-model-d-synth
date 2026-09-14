/**
 * Camera rig (PRD VIEW-1..5).
 *
 * One PerspectiveCamera, two authored poses:
 *
 *   3D — an orbit pose around the instrument, with damping and release inertia
 *   2D — directly above the instrument with the panel laid flat, narrow FOV,
 *        rotation and panning locked, zoom only
 *
 * Transitions interpolate the *spherical* orbit parameters rather than the
 * camera position, so the move swings along an arc instead of cutting straight
 * through the instrument, and the up-vector is interpolated separately so the
 * top-down pose lands with the panel at the top of the screen (matching the
 * layout diagram in PRD 5.4) rather than rolled by the surviving azimuth.
 */

import * as THREE from 'three';

export type ViewMode = '3d' | '2d';

interface Pose {
  /** Distance from the orbit target. */
  radius: number;
  /** Angle from +Y, radians. */
  polar: number;
  /** Angle within the XZ plane from +X toward +Z, radians. */
  azimuth: number;
  readonly target: THREE.Vector3;
  fov: number;
  readonly up: THREE.Vector3;
}

const DEG = Math.PI / 180;

/** Factory 3D framing: three-quarter front, slightly above the keys. */
const POSE_3D: Pose = {
  radius: 0.95,
  polar: 62 * DEG,
  azimuth: 74 * DEG,
  target: new THREE.Vector3(0, 0.105, 0),
  fov: 45,
  up: new THREE.Vector3(0, 1, 0),
};

/**
 * 2D framing: straight down, panel flat. The tiny polar offset keeps `lookAt`
 * away from its singularity, and up = -Z puts the rear of the instrument at the
 * top of the screen.
 */
const POSE_2D: Pose = {
  radius: 0.74,
  polar: 0.0009,
  azimuth: 90 * DEG,
  target: new THREE.Vector3(0, 0.09, -0.02),
  fov: 32,
  up: new THREE.Vector3(0, 0, -1),
};

const TRANSITION_SECONDS = 0.8;
const TRANSITION_REDUCED = 0.14;

const POLAR_MIN = 8 * DEG;
const POLAR_MAX = 88 * DEG;
const RADIUS_MIN = 0.42;
const RADIUS_MAX = 2.4;

/** Time constant of the smoothing that gives the orbit its damped feel. */
const DAMPING_TAU = 0.11;
/** How long a flick keeps gliding after the pointer is released. */
const MOMENTUM_TAU = 0.28;
/** Below this angular speed the glide is snapped to a stop. */
const MOMENTUM_FLOOR = 0.05;
/**
 * Ceiling on the angular speed the inertia is allowed to remember.
 *
 * The speed comes from one pointermove's delta divided by the time since the
 * previous one, and the browser is free to coalesce movement: a lagging main
 * thread can hand us 200 px in a single event whose `dt` floor is 1 ms. That
 * reads as 1000 rad/s, and at a 0.28 s time constant the glide would then spin
 * the instrument through several full turns on release. Bounding the estimate
 * costs nothing in normal dragging — a brisk drag is around 1-2 rad/s — and it
 * caps the coast at MOMENTUM_TAU x MAX_FLICK_SPEED, about 40 degrees, however
 * coarse the input turns out to be.
 */
const MAX_FLICK_SPEED = 2.5;

const ORBIT_SENSITIVITY = 0.0052; // radians per pixel
const DOLLY_SENSITIVITY = 0.0011;
const PAN_SENSITIVITY = 0.0016;

/**
 * FOV difference below which the projection matrix is left alone.
 *
 * `updateProjectionMatrix()` walk the frustum every time it runs, and the
 * damped follow converges asymptotically, so without a deadband the rig would
 * rebuild the projection matrix on every frame for a difference no one can
 * see. The cost is that the live fov may trail the authored value by up to this
 * much; the transitions below force an exact write when they land.
 */
const FOV_DEADBAND = 1e-4;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function copyPose(pose: Pose): Pose {
  return {
    radius: pose.radius,
    polar: pose.polar,
    azimuth: pose.azimuth,
    target: pose.target.clone(),
    fov: pose.fov,
    up: pose.up.clone(),
  };
}

export interface CameraRigOptions {
  readonly reducedMotion?: boolean;
  /** Called once a view transition finishes. */
  readonly onSettled?: (mode: ViewMode) => void;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private mode: ViewMode = '3d';
  /** The pose the user has settled on in 3D; restored when leaving 2D. */
  private readonly pose3d: Pose = copyPose(POSE_3D);
  /**
   * 2D pose. Kept separately so its zoom survives a trip to 3D without
   * contaminating the remembered orbit.
   */
  private readonly pose2d: Pose = copyPose(POSE_2D);
  /** Where the user last was, so a mode change interpolates from reality. */
  private readonly from: Pose = copyPose(POSE_3D);

  private current: Pose = copyPose(POSE_3D);

  private transitionT = 1;
  private transitionDuration = TRANSITION_SECONDS;
  private targetMode: ViewMode = '3d';

  private reducedMotion: boolean;
  private readonly onSettled: ((mode: ViewMode) => void) | undefined;

  private dragging = false;
  private azimuthVelocity = 0;
  private polarVelocity = 0;

  private readonly scratch = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, options: CameraRigOptions = {}) {
    this.camera = camera;
    this.reducedMotion = options.reducedMotion ?? false;
    this.onSettled = options.onSettled;
    this.applyPose(this.current);
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  get transitioning(): boolean {
    return this.transitionT < 1;
  }

  /** Switch view. Idempotent, and safe to call mid-transition. */
  setMode(next: ViewMode): void {
    if (next === this.mode && this.transitionT >= 1) return;

    // Freeze wherever we actually are, so a mid-flight change does not snap.
    copyPoseInto(this.current, this.from);

    this.mode = next;
    this.targetMode = next;
    this.dragging = false;
    this.azimuthVelocity = 0;
    this.polarVelocity = 0;
    this.transitionDuration = this.reducedMotion
      ? TRANSITION_REDUCED
      : TRANSITION_SECONDS;
    this.transitionT = 0;
  }

  /* ------------------------------------------------------------ 3D input */

  beginOrbit(): void {
    this.dragging = true;
    this.azimuthVelocity = 0;
    this.polarVelocity = 0;
  }

  /** `dt` is seconds since the previous orbit event, used for flick inertia. */
  orbitBy(dx: number, dy: number, dt: number): void {
    if (this.mode !== '3d' || this.transitioning) return;
    const dAz = dx * ORBIT_SENSITIVITY;
    const dPolar = dy * ORBIT_SENSITIVITY;

    this.pose3d.azimuth += dAz;
    this.pose3d.polar = clamp(this.pose3d.polar - dPolar, POLAR_MIN, POLAR_MAX);

    if (dt > 1e-4) {
      // Exponential smoothing keeps a fast flick from spiking the glide, and
      // the clamp keeps a coalesced pointermove from spiking it past reason.
      const k = 0.6;
      const azSpeed = clamp(dAz / dt, -MAX_FLICK_SPEED, MAX_FLICK_SPEED);
      const polarSpeed = clamp(-dPolar / dt, -MAX_FLICK_SPEED, MAX_FLICK_SPEED);
      this.azimuthVelocity = this.azimuthVelocity * (1 - k) + azSpeed * k;
      this.polarVelocity = this.polarVelocity * (1 - k) + polarSpeed * k;
    }
  }

  endOrbit(): void {
    this.dragging = false;
  }

  panBy(dx: number, dy: number): void {
    if (this.mode !== '3d' || this.transitioning) return;
    this.camera.matrixWorld.extractBasis(this.right, this.upVec, this.scratch);
    const scale = this.pose3d.radius * PAN_SENSITIVITY;
    this.pose3d.target.addScaledVector(this.right, -dx * scale);
    this.pose3d.target.addScaledVector(this.upVec, dy * scale);
    // Never let the instrument slide out of frame.
    this.pose3d.target.x = clamp(this.pose3d.target.x, -0.5, 0.5);
    this.pose3d.target.y = clamp(this.pose3d.target.y, -0.1, 0.5);
    this.pose3d.target.z = clamp(this.pose3d.target.z, -0.45, 0.45);
    this.copyPose3dIntoCurrent();
  }

  /** `factor` > 1 moves away. Allowed in both modes (PRD VIEW-3 keeps zoom). */
  dolly(factor: number): void {
    const pose = this.activePose();
    pose.radius = clamp(pose.radius * factor, RADIUS_MIN, RADIUS_MAX);
  }

  /** Convert a wheel delta in pixels into a dolly factor. */
  wheelZoomFactor(deltaY: number): number {
    // Clamped so a trackpad's momentum tail cannot fire a huge jump.
    return Math.exp(clamp(deltaY, -220, 220) * DOLLY_SENSITIVITY);
  }

  resetView(): void {
    const pose = this.activePose();
    const source = this.mode === '2d' ? POSE_2D : POSE_3D;
    pose.radius = source.radius;
    if (this.mode === '3d') {
      pose.polar = source.polar;
      pose.azimuth = source.azimuth;
      pose.target.copy(source.target);
    }
  }

  /** Slow display rotation for the idle showcase (PRD VIEW-6, P2). */
  nudgeAzimuth(delta: number): void {
    if (this.mode !== '3d' || this.transitioning) return;
    this.pose3d.azimuth += delta;
  }

  /** True when the camera is close enough that the 2D detail matters. */
  get distance(): number {
    return this.current.radius;
  }

  /**
   * The pose the rig is heading for. While a transition is in flight that is the
   * destination, so a zoom during the move is not thrown away.
   */
  private activePose(): Pose {
    if (this.transitioning) {
      return this.targetMode === '2d' ? this.pose2d : this.pose3d;
    }
    return this.mode === '2d' ? this.pose2d : this.pose3d;
  }

  private copyPose3dIntoCurrent(): void {
    if (this.mode !== '3d' || this.transitioning) return;
    copyPoseInto(this.pose3d, this.current);
  }

  /* -------------------------------------------------------------- update */

  update(dt: number): void {
    if (this.transitioning) {
      this.transitionT = Math.min(1, this.transitionT + dt / this.transitionDuration);
      const t = easeInOut(this.transitionT);
      copyPoseInto(this.from, this.current);
      // Head for the *live* pose, not the authored constant: a zoom the user
      // applies mid-flight lands on the pose they zoomed, and the remembered
      // 2D framing is restored rather than reset on the way in.
      const to = this.activePose();
      lerpPose(this.current, to, t);
      const landed = this.transitionT >= 1;
      if (landed) copyPoseInto(to, this.current);
      // Forcing the last write lands the authored pose *exactly*, instead of
      // leaving the fov stranded inside the deadband above.
      this.applyPose(this.current, landed);
      if (landed) this.onSettled?.(this.mode);
      return;
    }

    if (this.mode === '3d') {
      // Inertial glide after a flick (PRD VIEW-2).
      if (!this.dragging) {
        if (Math.abs(this.azimuthVelocity) > MOMENTUM_FLOOR) {
          this.pose3d.azimuth += this.azimuthVelocity * dt;
          this.pose3d.polar = clamp(
            this.pose3d.polar - this.polarVelocity * dt,
            POLAR_MIN,
            POLAR_MAX,
          );
          const decay = Math.exp(-dt / MOMENTUM_TAU);
          this.azimuthVelocity *= decay;
          this.polarVelocity *= decay;
        } else {
          this.azimuthVelocity = 0;
          this.polarVelocity = 0;
        }
      }
      this.dampedFollow(this.pose3d, dt);
    } else {
      this.dampedFollow(this.pose2d, dt);
    }

    this.applyPose(this.current);
  }

  /** Move `current` toward `want` with a fixed time constant. */
  private dampedFollow(want: Pose, dt: number): void {
    const k = 1 - Math.exp(-dt / DAMPING_TAU);
    this.current.radius += (want.radius - this.current.radius) * k;
    this.current.polar += (want.polar - this.current.polar) * k;
    this.current.azimuth += (want.azimuth - this.current.azimuth) * k;
    this.current.target.lerp(want.target, k);
    this.current.fov += (want.fov - this.current.fov) * k;
    this.current.up.lerp(want.up, k).normalize();
  }

  /** Write a pose onto the camera: position from spherical, then aim it. */
  private applyPose(pose: Pose, force = false): void {
    const sinPolar = Math.sin(pose.polar);
    this.camera.position.set(
      pose.target.x + pose.radius * sinPolar * Math.cos(pose.azimuth),
      pose.target.y + pose.radius * Math.cos(pose.polar),
      pose.target.z + pose.radius * sinPolar * Math.sin(pose.azimuth),
    );

    if (force || Math.abs(this.camera.fov - pose.fov) > FOV_DEADBAND) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.up.copy(pose.up);
    this.camera.lookAt(pose.target);
    this.camera.updateMatrixWorld();
  }
}

function copyPoseInto(from: Pose, into: Pose): void {
  into.radius = from.radius;
  into.polar = from.polar;
  into.azimuth = from.azimuth;
  into.target.copy(from.target);
  into.fov = from.fov;
  into.up.copy(from.up);
}

function lerpPose(into: Pose, to: Pose, t: number): void {
  into.radius += (to.radius - into.radius) * t;
  into.polar += (to.polar - into.polar) * t;
  into.azimuth += (to.azimuth - into.azimuth) * t;
  into.target.lerp(to.target, t);
  into.fov += (to.fov - into.fov) * t;
  into.up.lerp(to.up, t).normalize();
}
