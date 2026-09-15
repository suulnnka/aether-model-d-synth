/**
 * 渲染舞台(PRD §7):摄影棚式单一场景 —— 台面 + 无缝弯折背景幕、
 * IBL(RoomEnvironment PMREM)、三点布光 + 软阴影、ACES 色调映射、
 * 后处理链(Bloom / 暗角+颗粒 / SMAA)。
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { grainTexture, woodTexture } from "../model/textures";

/** 暗角 + 细颗粒(VIS-9 / VIS-14;不改变材质色彩) */
const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0.42 },
    uGrain: { value: 0.028 },
    uTime: { value: 0 },
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
    uniform float uStrength;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = 1.0 - uStrength * dot(d, d) * 1.55;
      color.rgb *= clamp(vig, 0.0, 1.0);
      float g = (hash(vUv * 997.0 + fract(uTime) * 13.0) - 0.5) * uGrain;
      color.rgb += g;
      gl_FragColor = color;
    }
  `,
};

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  vignettePass: ShaderPass;
  resize(): void;
  render(timeSec: number): void;
  dispose(): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // VIS-8
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // VIS-7
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0b0f, 0.055); // VIS-15 极轻雾效

  const camera = new THREE.PerspectiveCamera(
    38,
    container.clientWidth / container.clientHeight,
    0.02,
    20,
  );

  /* ---- IBL(VIS-4 / VIS-5) ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envMap = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.30;
  pmrem.dispose();

  /* ---- 背景:无缝弯折幕(Lathe 旋成无限远背景墙)+ 台面 ---- */
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(1.35, -0.05),
    new THREE.Vector2(1.33, 0.02),
    new THREE.Vector2(1.28, 0.25),
    new THREE.Vector2(1.18, 0.55),
    new THREE.Vector2(1.04, 0.85),
    new THREE.Vector2(0.92, 1.15),
    new THREE.Vector2(0.86, 1.5),
  ];
  const cycGeo = new THREE.LatheGeometry(profile, 64);
  // 渐变 + 颗粒贴图
  const gradCanvas = document.createElement("canvas");
  gradCanvas.width = 4;
  gradCanvas.height = 256;
  const gctx = gradCanvas.getContext("2d")!;
  const grad = gctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#050608");
  grad.addColorStop(0.45, "#141821");
  grad.addColorStop(0.75, "#1c2230");
  grad.addColorStop(1, "#07080b");
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 4, 256);
  const gradTex = new THREE.CanvasTexture(gradCanvas);
  gradTex.colorSpace = THREE.SRGBColorSpace;
  const cycMat = new THREE.MeshStandardMaterial({
    map: gradTex,
    roughnessMap: grainTexture(),
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.15,
  });
  const cyclorama = new THREE.Mesh(cycGeo, cycMat);
  cyclorama.position.y = -0.045;
  scene.add(cyclorama);

  // 台面:深胡桃木桌(VIS-13)
  const tableTex = woodTexture(true);
  tableTex.repeat.set(2.2, 1.1);
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.32, 0.05, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x6b5138,
      map: tableTex,
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.22,
    }),
  );
  table.position.y = -0.037; // 顶面 y=-0.012,与底脚贴合
  table.receiveShadow = true;
  scene.add(table);

  /* ---- 三点布光(VIS-6) ---- */
  const key = new THREE.SpotLight(0xffdfb8, 42, 4.5, Math.PI / 5.2, 0.45, 1.6);
  key.position.set(-0.85, 1.35, 0.95);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.015;
  key.shadow.camera.near = 0.3;
  key.shadow.camera.far = 4;
  const keyTarget = new THREE.Object3D();
  keyTarget.position.set(0, 0.06, 0.02);
  scene.add(keyTarget);
  key.target = keyTarget;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa8c4ff, 0.85); // 冷补光,无阴影
  fill.position.set(0.9, 0.75, 0.55);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.35); // 轮廓光,后方高角度
  rim.position.set(0.15, 1.5, -1.1);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0x33383f, 0x0b0a09, 0.5));

  /* ---- 后处理链(VIS-9) ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.34, // strength:仅 LED / Overload 等高亮自发光起辉
    0.5,
    0.86,
  );
  composer.addPass(bloom);
  const vignettePass = new ShaderPass(VignetteGrainShader);
  composer.addPass(vignettePass);
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  window.addEventListener("resize", resize);

  return {
    scene,
    camera,
    renderer,
    composer,
    vignettePass,
    resize,
    render(timeSec) {
      vignettePass.uniforms.uTime.value = timeSec;
      composer.render();
    },
    dispose() {
      window.removeEventListener("resize", resize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
