/**
 * Camera rig maths (PRD VIEW-1..VIEW-6).
 *
 * The rig is the one piece of the scene that is pure arithmetic, so it is the
 * one piece that can be pinned down exactly. Three things matter and all three
 * are tested here:
 *
 *   - the two authored poses land where they say they do,
 *   - a view change interpolates along the *arc* rather than cutting straight
 *     through the instrument,
 *   - 2D locks the input that would break a flat, top-down read of the panel.
 */

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { CameraRig, type ViewMode } from '../src/scene/cameraRig.ts';

const DEG = Math.PI / 180;

/** Authored framing, mirrored from the module so the tests read as intent. */
const POSE_3D = {
  radius: 0.95,
  polar: 62 * DEG,
  azimuth: 74 * DEG,
  target: new THREE.Vector3(0, 0.105, 0),
  fov: 45,
} as const;

const POSE_2D = {
  radius: 0.74,
  polar: 0.0009,
  azimuth: 90 * DEG,
  target: new THREE.Vector3(0, 0.09, -0.02),
  fov: 32,
} as const;

interface Spherical {
  radius: number;
  polar: number;
  azimuth: number;
}

/** Read the camera back as spherical coordinates around a known target. */
function sphericalOf(camera: THREE.PerspectiveCamera, target: THREE.Vector3): Spherical {
  const d = camera.position.clone().sub(target);
  const radius = d.length();
  return {
    radius,
    polar: Math.acos(THREE.MathUtils.clamp(d.y / radius, -1, 1)),
    azimuth: Math.atan2(d.z, d.x),
  };
}

function makeRig(options: ConstructorParameters<typeof CameraRig>[1] = {}): {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
} {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 50);
  return { rig: new CameraRig(camera, options), camera };
}

/** Run the rig far enough that every smoothing term has converged. */
function settle(rig: CameraRig, seconds = 4, dt = 1 / 120): void {
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i += 1) rig.update(dt);
}

describe('authored poses', () => {
  it('boots into the 3D three-quarter pose', () => {
    const { rig, camera } = makeRig();
    expect(rig.viewMode).toBe('3d');
    expect(rig.transitioning).toBe(false);
    expect(camera.fov).toBeCloseTo(POSE_3D.fov, 6);
    expect(camera.up.x).toBeCloseTo(0, 9);
    expect(camera.up.y).toBeCloseTo(1, 9);
    expect(camera.up.z).toBeCloseTo(0, 9);

    const s = sphericalOf(camera, POSE_3D.target);
    expect(s.radius).toBeCloseTo(POSE_3D.radius, 9);
    expect(s.polar).toBeCloseTo(POSE_3D.polar, 9);
    expect(s.azimuth).toBeCloseTo(POSE_3D.azimuth, 9);
  });

  it('sits above the instrument looking down at it', () => {
    const { camera } = makeRig();
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.x).toBeGreaterThan(0);
  });

  it('reports its distance through the getter', () => {
    const { rig } = makeRig();
    expect(rig.distance).toBeCloseTo(POSE_3D.radius, 9);
  });
});

describe('view transitions', () => {
  it('starts a transition rather than snapping', () => {
    const { rig, camera } = makeRig();
    const before = camera.position.clone();
    rig.setMode('2d');
    expect(rig.transitioning).toBe(true);
    expect(rig.viewMode).toBe('2d');
    // Nothing has moved yet: only update() advances the clock.
    expect(camera.position.distanceTo(before)).toBeCloseTo(0, 12);
  });

  it('lands on the top-down pose', () => {
    const { rig, camera } = makeRig();
    rig.setMode('2d');
    settle(rig);
    expect(rig.transitioning).toBe(false);
    expect(camera.fov).toBeCloseTo(POSE_2D.fov, 6);
    expect(camera.up.x).toBeCloseTo(0, 6);
    expect(camera.up.y).toBeCloseTo(0, 6);
    expect(camera.up.z).toBeCloseTo(-1, 6);

    const s = sphericalOf(camera, POSE_2D.target);
    expect(s.radius).toBeCloseTo(POSE_2D.radius, 6);
    expect(s.polar).toBeLessThan(1 * DEG);
    expect(s.azimuth).toBeCloseTo(POSE_2D.azimuth, 6);
  });

  it('takes the PRD\u2019s 0.8 s and is half done at half time', () => {
    const { rig } = makeRig();
    rig.setMode('2d');

    rig.update(0.4);
    expect(rig.transitioning).toBe(true);
    // easeInOut(0.5) === 0.5, so the radius is exactly halfway across.
    expect(rig.distance).toBeCloseTo((POSE_3D.radius + POSE_2D.radius) / 2, 6);

    rig.update(0.4);
    expect(rig.transitioning).toBe(false);
    expect(rig.distance).toBeCloseTo(POSE_2D.radius, 6);
  });

  it('swings along an arc instead of through the instrument', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    rig.update(0.4);
    const mid = sphericalOf(rig.camera, new THREE.Vector3(0, 0.0975, -0.01));
    // Azimuth is interpolated too, so the camera travels a path around the
    // target; a straight-line cut would leave it at exactly 74 degrees.
    expect(mid.azimuth).toBeGreaterThan(POSE_3D.azimuth + 2 * DEG);
    expect(mid.azimuth).toBeLessThan(POSE_2D.azimuth - 2 * DEG);
  });

  it('interpolates the up vector, so the panel never rolls in', () => {
    const { rig, camera } = makeRig();
    rig.setMode('2d');
    rig.update(0.4);
    expect(camera.up.y).toBeGreaterThan(0);
    expect(camera.up.z).toBeLessThan(0);
    expect(camera.up.length()).toBeCloseTo(1, 6);
  });

  it('settles in a fraction of the time under reduced motion', () => {
    const { rig } = makeRig({ reducedMotion: true });
    rig.setMode('2d');
    rig.update(0.07);
    expect(rig.transitioning).toBe(true);
    rig.update(0.07);
    expect(rig.transitioning).toBe(false);
  });

  it('notifies once, with the mode that was reached', () => {
    const onSettled = vi.fn();
    const { rig } = makeRig({ onSettled });
    rig.setMode('2d');
    settle(rig);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith<[ViewMode]>('2d');
  });

  it('is idempotent when the target mode is already active', () => {
    const { rig } = makeRig();
    rig.setMode('3d');
    expect(rig.transitioning).toBe(false);
    settle(rig);
    rig.setMode('3d');
    expect(rig.transitioning).toBe(false);
  });

  it('freezes the current framing when redirected mid-flight', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    rig.update(0.3);
    const frozen = rig.distance;
    expect(frozen).toBeGreaterThan(POSE_2D.radius);
    expect(frozen).toBeLessThan(POSE_3D.radius);

    rig.setMode('3d');
    // The new transition restarts from where the camera actually is.
    expect(rig.distance).toBeCloseTo(frozen, 6);
    settle(rig);
    const s = sphericalOf(rig.camera, POSE_3D.target);
    expect(s.radius).toBeCloseTo(POSE_3D.radius, 6);
    expect(s.polar).toBeCloseTo(POSE_3D.polar, 6);
  });

  it('remembers the 3D orbit across a trip to 2D', () => {
    const { rig, camera } = makeRig();
    rig.orbitBy(120, 0, 1 / 60);
    settle(rig);
    const azimuth = sphericalOf(camera, POSE_3D.target).azimuth;

    rig.setMode('2d');
    settle(rig);
    rig.setMode('3d');
    settle(rig);

    const back = sphericalOf(camera, POSE_3D.target);
    expect(back.azimuth).toBeCloseTo(azimuth, 6);
    expect(back.radius).toBeCloseTo(POSE_3D.radius, 6);
  });
});

describe('orbit input', () => {
  it('moves the camera while the pointer is still down', () => {
    const { rig, camera } = makeRig();
    rig.beginOrbit();
    rig.orbitBy(100, 0, 1 / 60);
    // Still dragging: no glide is added, so the response is the drag alone.
    settle(rig);
    const s = sphericalOf(camera, POSE_3D.target);
    expect(s.azimuth).toBeGreaterThan(POSE_3D.azimuth + 20 * DEG);
    expect(s.azimuth).toBeLessThan(POSE_3D.azimuth + 40 * DEG);
    expect(s.radius).toBeCloseTo(POSE_3D.radius, 4);
  });

  it('bounds the glide so a coalesced pointermove cannot spin the rig', () => {
    // 200 px delivered in a single event, as a stalled main thread can do.
    const { rig, camera } = makeRig();
    rig.beginOrbit();
    rig.orbitBy(200, 0, 0.001);
    rig.endOrbit();
    settle(rig, 6);
    const s = sphericalOf(camera, POSE_3D.target);
    // Direct response is 1.04 rad; the glide must not multiply it into turns.
    const travel = s.azimuth - POSE_3D.azimuth;
    expect(travel).toBeGreaterThan(1.04);
    expect(travel).toBeLessThan(1.04 + 0.75);
  });

  it('clamps the polar angle at both ends', () => {
    const down = makeRig();
    down.rig.orbitBy(0, -1e6, 1 / 60);
    settle(down.rig);
    const low = sphericalOf(down.camera, POSE_3D.target).polar;
    expect(low).toBeCloseTo(88 * DEG, 4);

    const up = makeRig();
    up.rig.orbitBy(0, 1e6, 1 / 60);
    settle(up.rig);
    const high = sphericalOf(up.camera, POSE_3D.target).polar;
    expect(high).toBeCloseTo(8 * DEG, 4);
  });

  it('keeps gliding after a flick, then comes to rest', () => {
    const { rig, camera } = makeRig();
    rig.beginOrbit();
    rig.orbitBy(60, 0, 1 / 60);
    rig.endOrbit();

    rig.update(0.15);
    const early = camera.position.clone();
    rig.update(0.15);
    const glide = camera.position.distanceTo(early);
    expect(glide).toBeGreaterThan(1e-4);

    settle(rig, 5);
    const rest = camera.position.clone();
    rig.update(1 / 60);
    expect(camera.position.distanceTo(rest)).toBeLessThan(1e-6);
  });

  it('ignores orbit, pan and idle rotation in 2D', () => {
    const { rig, camera } = makeRig();
    rig.setMode('2d');
    settle(rig);
    const settled = camera.position.clone();

    rig.beginOrbit();
    rig.orbitBy(500, 250, 1 / 60);
    rig.endOrbit();
    rig.panBy(500, 500);
    rig.nudgeAzimuth(1);
    settle(rig);

    expect(camera.position.distanceTo(settled)).toBeLessThan(1e-9);
  });

  it('ignores orbit while a transition is in flight', () => {
    const { rig, camera } = makeRig();
    rig.setMode('2d');
    // A drag that starts during the flight must not reach the 3D pose.
    rig.orbitBy(1000, 400, 1 / 60);
    settle(rig);
    rig.setMode('3d');
    settle(rig);
    const s = sphericalOf(camera, POSE_3D.target);
    expect(s.azimuth).toBeCloseTo(POSE_3D.azimuth, 6);
    expect(s.polar).toBeCloseTo(POSE_3D.polar, 6);
  });
});

describe('pan', () => {
  it('shifts the orbit target in the camera\u2019s own frame', () => {
    const { rig, camera } = makeRig();
    const before = camera.position.clone();
    rig.panBy(100, 0);
    settle(rig);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(1e-3);
  });

  it('clamps the target so the instrument cannot leave the frame', () => {
    const { rig } = makeRig();
    rig.panBy(1e6, 1e6);
    settle(rig);
    const p = rig.camera.position;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.length()).toBeLessThan(5);
  });
});

describe('zoom', () => {
  it('maps a wheel delta to an exponential dolly factor', () => {
    const { rig } = makeRig();
    expect(rig.wheelZoomFactor(0)).toBeCloseTo(1, 12);
    expect(rig.wheelZoomFactor(100)).toBeGreaterThan(1);
    expect(rig.wheelZoomFactor(-100)).toBeLessThan(1);
  });

  it('clamps the factor so a trackpad tail cannot fire a jump', () => {
    const { rig } = makeRig();
    expect(rig.wheelZoomFactor(1e6)).toBeCloseTo(rig.wheelZoomFactor(220), 12);
    expect(rig.wheelZoomFactor(-1e6)).toBeCloseTo(rig.wheelZoomFactor(-220), 12);
  });

  it('clamps the radius within the authored limits', () => {
    const far = makeRig();
    far.rig.dolly(1e6);
    settle(far.rig);
    expect(far.rig.distance).toBeCloseTo(2.4, 6);

    const near = makeRig();
    near.rig.dolly(1e-9);
    settle(near.rig);
    expect(near.rig.distance).toBeCloseTo(0.42, 6);
  });

  it('zooms in 2D as well (PRD VIEW-3 keeps zoom)', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    settle(rig);
    // 0.74 x 0.8 = 0.592, comfortably inside the 0.42..2.4 radius limits.
    rig.dolly(0.8);
    settle(rig);
    expect(rig.distance).toBeCloseTo(POSE_2D.radius * 0.8, 6);
  });

  it('does not lose a zoom issued mid-transition', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    rig.update(0.1);
    rig.dolly(0.8);
    settle(rig);
    expect(rig.distance).toBeCloseTo(POSE_2D.radius * 0.8, 6);
  });

  it('remembers the 2D zoom across a trip to 3D', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    settle(rig);
    rig.dolly(0.8);
    settle(rig);

    rig.setMode('3d');
    settle(rig);
    rig.setMode('2d');
    settle(rig);
    expect(rig.distance).toBeCloseTo(POSE_2D.radius * 0.8, 6);
  });
});

describe('reset', () => {
  it('restores the whole 3D framing after an orbit, pan and zoom', () => {
    const { rig } = makeRig();
    rig.orbitBy(300, 120, 1 / 60);
    rig.panBy(120, -80);
    rig.dolly(1.6);
    settle(rig);

    rig.resetView();
    settle(rig);

    const s = sphericalOf(rig.camera, POSE_3D.target);
    expect(s.radius).toBeCloseTo(POSE_3D.radius, 6);
    expect(s.polar).toBeCloseTo(POSE_3D.polar, 6);
    expect(s.azimuth).toBeCloseTo(POSE_3D.azimuth, 6);
  });

  it('in 2D only restores the distance, leaving the framing flat', () => {
    const { rig } = makeRig();
    rig.setMode('2d');
    settle(rig);
    rig.dolly(1.6);
    settle(rig);
    rig.resetView();
    settle(rig);

    expect(rig.distance).toBeCloseTo(POSE_2D.radius, 6);
    expect(rig.viewMode).toBe('2d');
    expect(rig.camera.up.z).toBeCloseTo(-1, 6);
  });
});
