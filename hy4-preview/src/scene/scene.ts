/**
 * 场景层(scene/scene.ts)
 * ------------------------------------------------------------------
 * 负责:渲染器设置(VIS-8)、IBL 环境(VIS-4/5)、三点布光与阴影(VIS-6/7)、
 * 场景构成(台面 + 无缝弯折背景幕,VIS-3/13/14/15)、后处理链(VIS-9/10/11)、
 * 相机 rig 状态机(3D 轨道态 / 2D 正面态,VIEW-1..6)。
 *
 * 本模块不直接处理指针事件:它对外暴露 rotate / pan / dolly 三个意图接口,
 * 由 interaction 层在完成 raycast 命中判定后决定是否调用(左键永不旋转,VIEW-2)。
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type ViewMode = "2d" | "3d";

/** 相机 rig 的两个稳态姿态 */
interface RigPose {
  theta: number; // 方位角(0 = 正 +z 演奏者方向,向 +x 为正)
  phi: number; // 天顶角(0 = 正上方俯视,π/2 = 水平)
  radius: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

/** 3D 默认机位:略偏右、略俯视,整机占画面宽约 75%(VIS-16) */
const POSE_3D: RigPose = {
  theta: 0.42,
  phi: 1.14,
  radius: 0.86,
  tx: 0,
  ty: 0.075,
  tz: 0.0,
  fov: 32,
};

/** 2D 正面态:接近正上方俯视 + 窄 FOV 模拟平行投影;面板在 main 层放平至 0° */
const POSE_2D: RigPose = {
  theta: 0,
  phi: 0.16,
  radius: 1.62,
  tx: 0,
  ty: 0.06,
  tz: 0.012,
  fov: 15,
};

/** 开场运镜起幅:侧后方机位(VIEW-6) */
const POSE_INTRO: RigPose = {
  theta: 2.15,
  phi: 0.92,
  radius: 1.42,
  tx: 0.04,
  ty: 0.12,
  tz: -0.05,
  fov: 38,
};

/**
 * 光照标定值(VIS-5/8)。默认经亮度直方图标定:
 * 画面均值约 65、P95 约 225、近白像素 < 3%,符合 §7.2 的低饱和深调基调。
 * 可通过 URL `?light={...}` 覆盖(调优用,不影响正常使用)。
 */
const LIGHT = {
  exposure: 0.6,
  env: 0.55,
  key: 0.92,
  fill: 0.3,
  rim: 0.58,
  cavity: 0.17,
  hemi: 0.5,
};
if (typeof location !== "undefined") {
  const q = new URLSearchParams(location.search).get("light");
  if (q) {
    try {
      Object.assign(LIGHT, JSON.parse(q));
    } catch {
      /* 忽略非法参数 */
    }
  }
}

const PHI_MIN = 0.08;
const PHI_MAX = 1.46;
const RADIUS_MIN_3D = 0.42;
const RADIUS_MAX_3D = 2.2;
const RADIUS_MIN_2D = 0.9;
const RADIUS_MAX_2D = 3.0;
const PAN_LIMIT_X = 0.32;
const PAN_LIMIT_Y = 0.3;
const PAN_LIMIT_Z = 0.32;

const VIEW_TWEEN_MS = 800; // VIEW-1 视角切换
const INTRO_TWEEN_MS = 2000; // VIEW-6 开场运镜
const PANEL_TWEEN_MS = 500; // HINGE-2 面板立起/放平

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 背景幕/台面尺寸 */
const HALF_W = 3.0;
const TABLE_FRONT_Z = 3.0;
const TABLE_BACK_Z = -1.0;
const CURVE_R = 1.0;
const WALL_H = 2.4;

// ─────────────────────────────────────────────────────────────────────
// 程序化背景幕贴图(VIS-14):中低明度冷灰/深蓝灰 + 竖向渐变 + 细噪点
// ─────────────────────────────────────────────────────────────────────
function backdropTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#2c323b"); // 顶部(远离视线)
  grad.addColorStop(0.18, "#363d48");
  grad.addColorStop(0.42, "#4a5463"); // 与琴体同高:受主光照亮
  grad.addColorStop(0.62, "#424b58");
  grad.addColorStop(1.0, "#262b33"); // 与台面衔接处收黑
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 中心柔光(主光在背景上的落点)
  const radial = g.createRadialGradient(w * 0.56, h * 0.44, 10, w * 0.56, h * 0.44, w * 0.62);
  radial.addColorStop(0, "rgba(150,160,175,0.20)");
  radial.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = radial;
  g.fillRect(0, 0, w, h);

  // 噪点消除色带
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 无缝弯折背景幕几何(VIS-3/14)
 * 剖面:(z=-1, y=0) 起四分之一圆弧向上弯折到 (z=-1-R, y=R),再垂直上升到墙顶。
 */
function cycloramaGeometry(seg = 40): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  // 圆弧段
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 2);
    profile.push([TABLE_BACK_Z - CURVE_R * Math.sin(a), CURVE_R - CURVE_R * Math.cos(a)]);
  }
  // 垂直墙段
  const wallSteps = 12;
  for (let i = 1; i <= wallSteps; i++) {
    profile.push([TABLE_BACK_Z - CURVE_R, CURVE_R + (WALL_H * i) / wallSteps]);
  }

  const rows = profile.length;
  const cols = 2; // 横向只需两端(平面,无弯曲)
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const idx: number[] = [];

  const totalLen = (() => {
    let s = 0;
    for (let i = 1; i < rows; i++) {
      const dz = profile[i][0] - profile[i - 1][0];
      const dy = profile[i][1] - profile[i - 1][1];
      s += Math.hypot(dz, dy);
    }
    return s;
  })();

  let acc = 0;
  for (let i = 0; i < rows; i++) {
    if (i > 0) {
      const dz = profile[i][0] - profile[i - 1][0];
      const dy = profile[i][1] - profile[i - 1][1];
      acc += Math.hypot(dz, dy);
    }
    const v = acc / totalLen;
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j;
      pos[k * 3] = j === 0 ? -HALF_W : HALF_W;
      pos[k * 3 + 1] = profile[i][1];
      pos[k * 3 + 2] = profile[i][0];
      uv[k * 2] = j;
      uv[k * 2 + 1] = 1 - v; // 画布顶部 = 墙顶
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    const a = i * cols;
    const b = i * cols + 1;
    const c = (i + 1) * cols;
    const e = (i + 1) * cols + 1;
    idx.push(a, b, c, b, e, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ─────────────────────────────────────────────────────────────────────
// 暗角 + 颗粒(VIS-9 / VIS-14)
// ─────────────────────────────────────────────────────────────────────
const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    darkness: { value: 1.05 },
    offset: { value: 1.02 },
    grain: { value: 0.012 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * offset * 2.0;
      float vig = clamp(1.0 - dot(p, p) * darkness * 0.32, 0.0, 1.0);
      vig = pow(vig, 1.35);
      vec3 col = texel.rgb * vig;
      float n = fract(sin(dot(vUv * 512.0 + time, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

// ─────────────────────────────────────────────────────────────────────
// 场景
// ─────────────────────────────────────────────────────────────────────
export interface SceneView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** 每帧调用 */
  render(dt: number): void;
  resize(): void;
  /** 相机意图接口(供 interaction 层调用) */
  rotate(dxPx: number, dyPx: number): void;
  pan(dxPx: number, dyPx: number): void;
  dolly(wheelDelta: number): void;
  /** 视角 */
  setView(mode: ViewMode, animate?: boolean): void;
  getView(): ViewMode;
  /** 开场运镜 */
  playIntro(): void;
  skipIntro(): void;
  isIntroPlaying(): boolean;
  onIntroEnd(fn: () => void): void;
  /** 2D 态是否锁定旋转/平移 */
  isLocked(): boolean;
  /** 世界坐标 → 画布 CSS 像素(引导聚光灯用) */
  project(world: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void;
  /** 面板角度(由场景统一缓动,HINGE-2/4) */
  setPanelAngle(deg: number, animate?: boolean): void;
  getPanelAngle(): number;
  /** 记忆的 3D 面板角度:切回 3D 时恢复(HINGE-4) */
  setPreferredPanelAngle(deg: number): void;
  /**
   * 调试用:相机 rig 的球坐标与焦点。
   * `cur` 是阻尼后的当前值(逐帧逼近 `dst`),`dst` 是手势直接写入的目标值。
   */
  pose(): {
    cur: { theta: number; phi: number; radius: number; tx: number; ty: number; tz: number };
    dst: { theta: number; phi: number; radius: number; tx: number; ty: number; tz: number };
    fov: number;
    mode: ViewMode;
    tweening: boolean;
  };
  onPanelAngleChange(fn: (deg: number) => void): void;
  onViewChange(fn: (mode: ViewMode) => void): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}

export interface SceneOptions {
  container: HTMLElement;
  /** 台面材质(取自 model 材质库) */
  tableMaterial: THREE.Material;
  initialView?: ViewMode;
  initialPanelAngle?: number;
  reducedMotion?: boolean;
}

export function createScene(opts: SceneOptions): SceneView {
  const { container, tableMaterial } = opts;
  const reducedMotion =
    opts.reducedMotion ??
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ── 渲染器(VIS-8) ──
  const renderer = new THREE.WebGLRenderer({
    antialias: false, // 由 SMAA 承担抗锯齿(VIS-9)
    powerPreference: "high-performance",
    alpha: false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x14171c, 1);

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1e25, 0.1); // VIS-15 极低密度指数雾

  const camera = new THREE.PerspectiveCamera(
    POSE_3D.fov,
    (container.clientWidth || 1) / (container.clientHeight || 1),
    0.02,
    60
  );

  // ── IBL(VIS-4/5) ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envRT = pmrem.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = LIGHT.env;
  roomEnv.dispose?.();
  pmrem.dispose();

  // ── 三点布光(VIS-6/7) ──
  const hemi = new THREE.HemisphereLight(0xa9c2dc, 0x241c17, LIGHT.hemi);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffd9ab, LIGHT.key);
  keyLight.position.set(0.85, 1.35, 1.05);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.15;
  keyLight.shadow.camera.far = 5.0;
  keyLight.shadow.camera.left = -0.62;
  keyLight.shadow.camera.right = 0.62;
  keyLight.shadow.camera.top = 0.62;
  keyLight.shadow.camera.bottom = -0.62;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.008;
  keyLight.shadow.radius = 3.5;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0x93b7ff, LIGHT.fill);
  fillLight.position.set(-1.25, 0.62, 0.95);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xcfe0ff, LIGHT.rim);
  rimLight.position.set(-0.55, 1.15, -1.35);
  scene.add(rimLight);

  // 面板立起后背腔的微弱补光,避免元器件死黑
  const cavityLight = new THREE.DirectionalLight(0xbcd0ff, LIGHT.cavity);
  cavityLight.position.set(0.2, 0.9, -1.1);
  scene.add(cavityLight);

  // ── 台面 + 无缝背景幕(VIS-3/13/14) ──
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, TABLE_FRONT_Z - TABLE_BACK_Z),
    tableMaterial
  );
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, 0, (TABLE_FRONT_Z + TABLE_BACK_Z) / 2);
  table.receiveShadow = true;
  scene.add(table);

  const backdropMat = new THREE.MeshStandardMaterial({
    map: backdropTexture(),
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.5,
  });
  const backdrop = new THREE.Mesh(cycloramaGeometry(), backdropMat);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  // ── 后处理(VIS-9/10/11) ──
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth || 1, container.clientHeight || 1),
    0.72, // strength
    0.5, // radius
    1.05 // threshold:仅 LED 等自发光溢出
  );
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteGrainShader);
  composer.addPass(vignette);

  composer.addPass(new OutputPass());

  const smaa = new SMAAPass(
    (container.clientWidth || 1) * renderer.getPixelRatio(),
    (container.clientHeight || 1) * renderer.getPixelRatio()
  );
  composer.addPass(smaa);

  // ── 相机 rig 状态机 ──
  const cur: RigPose = { ...POSE_3D };
  const dst: RigPose = { ...POSE_3D };
  let mode: ViewMode = opts.initialView ?? "3d";
  let reduced = reducedMotion;

  let tweenFrom: RigPose | null = null;
  let tweenTo: RigPose | null = null;
  let tweenT = 0;
  let tweenMs = 0;
  let tweenKind: "view" | "intro" = "view";
  const introEndFns: Array<() => void> = [];
  const viewChangeFns: Array<(m: ViewMode) => void> = [];
  const panelFns: Array<(d: number) => void> = [];

  if (mode === "2d") {
    Object.assign(cur, POSE_2D);
    Object.assign(dst, POSE_2D);
  }

  const clampPose = (p: RigPose): void => {
    const rMin = mode === "2d" ? RADIUS_MIN_2D : RADIUS_MIN_3D;
    const rMax = mode === "2d" ? RADIUS_MAX_2D : RADIUS_MAX_3D;
    p.radius = Math.min(rMax, Math.max(rMin, p.radius));
    p.phi = Math.min(PHI_MAX, Math.max(PHI_MIN, p.phi));
    p.tx = Math.min(PAN_LIMIT_X, Math.max(-PAN_LIMIT_X, p.tx));
    p.ty = Math.min(PAN_LIMIT_Y, Math.max(-PAN_LIMIT_Y, p.ty));
    p.tz = Math.min(PAN_LIMIT_Z, Math.max(-PAN_LIMIT_Z, p.tz));
  };

  const applyCur = (): void => {
    const sp = Math.sin(cur.phi);
    camera.position.set(
      cur.tx + cur.radius * sp * Math.sin(cur.theta),
      cur.ty + cur.radius * Math.cos(cur.phi),
      cur.tz + cur.radius * sp * Math.cos(cur.theta)
    );
    camera.lookAt(cur.tx, cur.ty, cur.tz);
    if (Math.abs(camera.fov - cur.fov) > 1e-4) {
      camera.fov = cur.fov;
      camera.updateProjectionMatrix();
    }
    // 阴影相机跟随目标,保证面板立起/放平时阴影正确(VIS-7)
    keyLight.target.position.set(cur.tx, cur.ty, cur.tz);
    keyLight.target.updateMatrixWorld();
    keyLight.position.set(cur.tx + 0.85, cur.ty + 1.28, cur.tz + 1.0);
  };

  const startTween = (to: RigPose, ms: number, kind: "view" | "intro"): void => {
    if (reduced) {
      Object.assign(cur, to);
      Object.assign(dst, to);
      clampPose(cur);
      clampPose(dst);
      tweenFrom = null;
      tweenTo = null;
      if (kind === "intro") for (const f of introEndFns) f();
      return;
    }
    tweenFrom = { ...cur };
    tweenTo = { ...to };
    tweenT = 0;
    tweenMs = ms;
    tweenKind = kind;
  };

  // 面板角度缓动(HINGE-2/4)
  let panelAngle = opts.initialPanelAngle ?? 50;
  let preferredPanelAngle = panelAngle;
  let panelFrom = panelAngle;
  let panelTo = panelAngle;
  let panelT = 1;

  const setPanelAngle = (deg: number, animate = true): void => {
    const v = Math.min(60, Math.max(0, deg));
    if (Math.abs(v - panelTo) < 1e-3 && panelT >= 1) return;
    panelFrom = panelAngle;
    panelTo = v;
    panelT = animate && !reduced ? 0 : 1;
    if (panelT >= 1) {
      panelAngle = v;
      for (const f of panelFns) f(panelAngle);
    }
  };

  // ── 对外意图接口 ──
  const rotate = (dxPx: number, dyPx: number): void => {
    if (mode === "2d") return; // VIEW-3 锁定旋转
    tweenFrom = null;
    tweenTo = null;
    dst.theta -= dxPx * 0.0062;
    dst.phi -= dyPx * 0.0052;
    clampPose(dst);
  };

  const pan = (dxPx: number, dyPx: number): void => {
    if (mode === "2d") return; // VIEW-3 锁定平移
    tweenFrom = null;
    tweenTo = null;
    const scale = dst.radius * 0.0016;
    const right = new THREE.Vector3(Math.cos(dst.theta), 0, -Math.sin(dst.theta));
    const up = new THREE.Vector3(0, 1, 0);
    dst.tx -= right.x * dxPx * scale;
    dst.tz -= right.z * dxPx * scale;
    dst.ty += up.y * dyPx * scale;
    clampPose(dst);
  };

  const dolly = (wheelDelta: number): void => {
    tweenFrom = null;
    tweenTo = null;
    const k = Math.exp(wheelDelta * 0.0011);
    dst.radius *= k;
    clampPose(dst);
  };

  // ── 视角切换 ──
  const setView = (m: ViewMode, animate = true): void => {
    if (m === mode) return;
    mode = m;
    const to: RigPose =
      m === "2d"
        ? { ...POSE_2D, tz: POSE_2D.tz }
        : { ...POSE_3D, theta: cur.theta === 0 ? POSE_3D.theta : cur.theta };
    Object.assign(dst, to);
    startTween(to, animate ? VIEW_TWEEN_MS : 0, "view");
    // HINGE-4:2D 强制放平,3D 恢复记忆角度
    setPanelAngle(m === "2d" ? 0 : preferredPanelAngle, animate);
    for (const f of viewChangeFns) f(mode);
  };

  const playIntro = (): void => {
    Object.assign(cur, POSE_INTRO);
    Object.assign(dst, mode === "2d" ? POSE_2D : POSE_3D);
    clampPose(cur);
    if (reduced) {
      Object.assign(cur, dst);
      for (const f of introEndFns) f();
      return;
    }
    startTween({ ...dst }, INTRO_TWEEN_MS, "intro");
  };

  const skipIntro = (): void => {
    if (tweenTo && tweenKind === "intro") {
      Object.assign(cur, tweenTo);
      Object.assign(dst, tweenTo);
      tweenFrom = null;
      tweenTo = null;
      for (const f of introEndFns) f();
    }
  };

  // ── 主循环 ──
  let elapsed = 0;
  const render = (dt: number): void => {
    elapsed += dt;
    vignette.uniforms.time.value = elapsed * 0.37;

    // 视角/运镜补间
    if (tweenFrom && tweenTo) {
      tweenT += (dt * 1000) / tweenMs;
      const t = Math.min(1, tweenT);
      const e = easeInOut(t);
      cur.theta = lerp(tweenFrom.theta, tweenTo.theta, e);
      cur.phi = lerp(tweenFrom.phi, tweenTo.phi, e);
      cur.radius = lerp(tweenFrom.radius, tweenTo.radius, e);
      cur.tx = lerp(tweenFrom.tx, tweenTo.tx, e);
      cur.ty = lerp(tweenFrom.ty, tweenTo.ty, e);
      cur.tz = lerp(tweenFrom.tz, tweenTo.tz, e);
      cur.fov = lerp(tweenFrom.fov, tweenTo.fov, e);
      if (t >= 1) {
        Object.assign(dst, cur);
        tweenFrom = null;
        tweenTo = null;
        if (tweenKind === "intro") for (const f of introEndFns) f();
      }
    } else {
      // 阻尼惯性(VIEW-2)
      const k = 1 - Math.exp(-dt * 9.5);
      cur.theta += (dst.theta - cur.theta) * k;
      cur.phi += (dst.phi - cur.phi) * k;
      cur.radius += (dst.radius - cur.radius) * k;
      cur.tx += (dst.tx - cur.tx) * k;
      cur.ty += (dst.ty - cur.ty) * k;
      cur.tz += (dst.tz - cur.tz) * k;
      cur.fov += (dst.fov - cur.fov) * k;
    }

    // 面板角度缓动
    if (panelT < 1) {
      panelT = Math.min(1, panelT + (dt * 1000) / PANEL_TWEEN_MS);
      const e = easeInOut(panelT);
      panelAngle = lerp(panelFrom, panelTo, e);
      for (const f of panelFns) f(panelAngle);
      if (panelT >= 1) panelAngle = panelTo;
    }

    applyCur();
    composer.render(dt);
  };

  const resize = (): void => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bloom.setSize(w, h);
    smaa.setSize(w * dpr, h * dpr);
  };

  const tmpV = new THREE.Vector3();
  const project = (
    world: THREE.Vector3,
    out: { x: number; y: number; visible: boolean }
  ): void => {
    tmpV.copy(world).project(camera);
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    out.x = (tmpV.x * 0.5 + 0.5) * w;
    out.y = (-tmpV.y * 0.5 + 0.5) * h;
    out.visible = tmpV.z < 1 && tmpV.z > -1;
  };

  applyCur();

  return {
    renderer,
    scene,
    camera,
    canvas,
    render,
    resize,
    rotate,
    pan,
    dolly,
    setView,
    getView: () => mode,
    playIntro,
    skipIntro,
    isIntroPlaying: () => !!tweenTo && tweenKind === "intro",
    onIntroEnd(fn) {
      introEndFns.push(fn);
    },
    isLocked: () => mode === "2d",
    project,
    setPanelAngle,
    getPanelAngle: () => panelAngle,
    setPreferredPanelAngle(deg) {
      preferredPanelAngle = Math.min(60, Math.max(0, deg));
    },
    pose: () => ({
      cur: {
        theta: cur.theta,
        phi: cur.phi,
        radius: cur.radius,
        tx: cur.tx,
        ty: cur.ty,
        tz: cur.tz,
      },
      dst: {
        theta: dst.theta,
        phi: dst.phi,
        radius: dst.radius,
        tx: dst.tx,
        ty: dst.ty,
        tz: dst.tz,
      },
      fov: cur.fov,
      mode,
      tweening: !!tweenTo,
    }),
    onPanelAngleChange(fn) {
      panelFns.push(fn);
    },
    onViewChange(fn) {
      viewChangeFns.push(fn);
    },
    setReducedMotion(on) {
      reduced = on;
    },
    dispose() {
      envRT.dispose();
      backdropMat.map?.dispose();
      backdropMat.dispose();
      backdrop.geometry.dispose();
      table.geometry.dispose();
      composer.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export { POSE_3D, POSE_2D, POSE_INTRO };
