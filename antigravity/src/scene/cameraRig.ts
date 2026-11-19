import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewMode, ViewState } from "../state/types.ts";
import type { Stage } from "./stage.ts";

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const PRESET_POSES: Record<ViewState["cameraPreset"], Pose> = {
  overview: {
    pos: new THREE.Vector3(0.0, 0.47, 0.61),
    target: new THREE.Vector3(0.0, 0.08, 0.01),
  },
  panel: {
    pos: new THREE.Vector3(0.0, 0.28, 0.34),
    target: new THREE.Vector3(0.0, 0.14, -0.07),
  },
  keys: {
    pos: new THREE.Vector3(-0.11, 0.31, 0.5),
    target: new THREE.Vector3(-0.07, 0.055, 0.075),
  },
  rear: {
    pos: new THREE.Vector3(0.2, 0.34, -0.66),
    target: new THREE.Vector3(0.0, 0.11, -0.05),
  },
};

const POSE_2D: Pose = {
  pos: new THREE.Vector3(0.0, 0.85, 0.14),
  target: new THREE.Vector3(0.0, 0.06, -0.01),
};

export class CameraRig {
  readonly controls: OrbitControls;
  private mode: ViewMode = "3d";
  private transitioning = false;
  private goalPos = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();

  constructor(private readonly stage: Stage) {
    this.controls = new OrbitControls(stage.camera, stage.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 1.65;
    this.controls.maxPolarAngle = Math.PI * 0.475;
    this.controls.minPolarAngle = 0.05;

    // Cancel camera tween if user grabs OrbitControls manually
    this.controls.addEventListener("start", () => {
      this.transitioning = false;
    });

    this.snapToPose(PRESET_POSES.overview);
  }

  getMode(): ViewMode {
    return this.mode;
  }

  setMode(mode: ViewMode, preset: ViewState["cameraPreset"] = "overview", immediate = false): void {
    this.mode = mode;
    if (mode === "2d") {
      this.controls.enableRotate = false;
      this.controls.enablePan = true;
      // Avoid crossing through the zenith pole if coming from behind (-Z)
      const fromRear = this.stage.camera.position.z < 0;
      this.moveToPose(POSE_2D, immediate || fromRear);
    } else {
      this.controls.enableRotate = true;
      this.controls.enablePan = true;
      const fromRear = this.stage.camera.position.z < 0 && preset !== "rear";
      this.moveToPose(PRESET_POSES[preset], immediate || fromRear);
    }
  }

  goToPreset(preset: ViewState["cameraPreset"], immediate = false): void {
    if (this.mode === "2d") {
      this.setMode("3d", preset, immediate);
      return;
    }
    this.moveToPose(PRESET_POSES[preset], immediate);
  }

  private moveToPose(pose: Pose, immediate: boolean): void {
    if (immediate) {
      this.snapToPose(pose);
    } else {
      this.goalPos.copy(pose.pos);
      this.goalTarget.copy(pose.target);
      this.transitioning = true;
    }
  }

  private snapToPose(pose: Pose): void {
    this.transitioning = false;
    this.stage.camera.position.copy(pose.pos);
    this.controls.target.copy(pose.target);
    this.controls.update();
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  update(dt: number): void {
    if (this.transitioning) {
      const alpha = 1 - Math.exp(-8.5 * dt);
      this.stage.camera.position.lerp(this.goalPos, alpha);
      this.controls.target.lerp(this.goalTarget, alpha);
      if (
        this.stage.camera.position.distanceTo(this.goalPos) < 0.002 &&
        this.controls.target.distanceTo(this.goalTarget) < 0.002
      ) {
        this.stage.camera.position.copy(this.goalPos);
        this.controls.target.copy(this.goalTarget);
        this.transitioning = false;
      }
    }
    this.controls.update();
  }
}
