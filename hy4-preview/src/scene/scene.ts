/**
 * 场景 / 光照 / 背景(VIS-1~3)与相机 rig(VIEW-1~5)
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ViewMode = "3d" | "2d";

export interface SceneRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  setView(mode: ViewMode): void;
  toggleView(): ViewMode;
  update(dt: number): void;
  mode(): ViewMode;
  /** 相机动画中(禁止重入) */
  transitioning: boolean;
}

const TARGET = new THREE.Vector3(0, 0.08, 0.02);

export function setupScene(canvas: HTMLCanvasElement): SceneRig {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c0d10, 2.2, 6);

  // IBL 环境(VIS-1)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  // 背景:低饱和摄影棚渐变 + 噪点(VIS-3)
  scene.background = makeBackdrop();

  // 台面:哑光深色,接受投影
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.25 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.001;
  table.receiveShadow = true;
  scene.add(table);

  // 三点布光(VIS-2):主光在演奏者一侧(+z),照亮面板与琴键
  const key = new THREE.DirectionalLight(0xffdcae, 3.2);
  key.position.set(0.7, 1.5, 0.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 4;
  key.shadow.camera.left = key.shadow.camera.bottom = -0.8;
  key.shadow.camera.right = key.shadow.camera.top = 0.8;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9db4ff, 0.8);
  fill.position.set(-1.1, 0.6, 0.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xcfd8ff, 1.8);
  rim.position.set(-0.2, 0.9, -1.2);
  scene.add(rim);

  scene.add(new THREE.AmbientLight(0x30343c, 0.7));

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.02, 20);
  // 键盘朝向 +z,默认机位在演奏者一侧
  camera.position.set(0.5, 0.42, 0.75);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 1.8;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.update();

  /* --- 视角状态机:2D = 正立面 + 窄 FOV(VIEW-3) --- */
  let current: ViewMode = "3d";
  const rig: SceneRig = {
    renderer,
    scene,
    camera,
    controls,
    transitioning: false,
    setView(mode: ViewMode) {
      if (mode === current || rig.transitioning) return;
      current = mode;
      animateTo(mode);
    },
    toggleView() {
      rig.setView(current === "3d" ? "2d" : "3d");
      return current;
    },
    mode: () => current,
    update(dt: number) {
      tickTween(dt);
      controls.update();
    },
  };

  // 2D 机位:面板放平后从演奏者侧(+z)正上方俯视(丝印可读,VIEW-5)
  const POS_2D = new THREE.Vector3(0, 1.08, 0.34);
  const TGT_2D = new THREE.Vector3(0, 0.1, 0.0);
  const FOV_2D = 17;
  const FOV_3D = 40;

  let tween: {
    t: number; dur: number;
    p0: THREE.Vector3; p1: THREE.Vector3;
    g0: THREE.Vector3; g1: THREE.Vector3;
    f0: number; f1: number;
    onDone?: () => void;
  } | null = null;

  function animateTo(mode: ViewMode) {
    rig.transitioning = true;
    if (mode === "2d") {
      controls.enableRotate = false;
      controls.enablePan = false;
      // 放平面板在外部处理
    } else {
      // 回到当前轨道姿态:从 2D 机位反向插值,旋转保持禁用直至动画结束
      controls.enableRotate = false;
      controls.enablePan = false;
    }
    tween = {
      t: 0,
      dur: 0.8,
      p0: camera.position.clone(),
      p1: mode === "2d" ? POS_2D.clone() : camera.position.clone().sub(controls.target).setLength(0.62).add(TARGET),
      g0: controls.target.clone(),
      g1: mode === "2d" ? TGT_2D.clone() : TARGET.clone(),
      f0: camera.fov,
      f1: mode === "2d" ? FOV_2D : FOV_3D,
      onDone: () => {
        rig.transitioning = false;
        controls.enableRotate = mode === "3d";
        controls.enablePan = mode === "3d";
      },
    };
  }

  function tickTween(dt: number) {
    if (!tween) return;
    tween.t = Math.min(tween.dur, tween.t + dt);
    // ease-in-out cubic(VIEW-1:约 0.8s 平滑)
    const k = tween.t / tween.dur;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.g0, tween.g1, e);
    camera.fov = tween.f0 + (tween.f1 - tween.f0) * e;
    camera.updateProjectionMatrix();
    if (tween.t >= tween.dur) {
      const done = tween.onDone;
      tween = null;
      done?.();
    }
  }

  return rig;
}

function makeBackdrop(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#101115");
  g.addColorStop(0.55, "#191a1f");
  g.addColorStop(1, "#0a0b0d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 512);
  // 细腻噪点
  for (let i = 0; i < 2600; i++) {
    const v = Math.random() * 22;
    ctx.fillStyle = `rgba(${v + 18},${v + 18},${v + 22},0.08)`;
    ctx.fillRect(Math.random() * 32, Math.random() * 512, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
