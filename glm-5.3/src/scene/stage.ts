import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { studioBackground } from "../model/textures";

/**
 * 舞台(VIS-1/2/3/5):PBR + IBL、ACESFilmic、三点布光软阴影、
 * 摄影棚背景、轻微 Bloom(电源灯自发光)与暗角后期。
 */

export interface Stage {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  keyLight: THREE.SpotLight;
  resize(w: number, h: number): void;
  render(): void;
  setBloomEnabled(on: boolean): void;
}

export function createStage(canvasHost: HTMLElement, synthRoot: THREE.Object3D): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = studioBackground();

  // IBL 环境
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();

  // ---- 三点布光 ----
  // 主光:暖色,带软阴影
  const keyLight = new THREE.SpotLight(0xffe2bd, 13, 6, 0.55, 0.65, 1.2);
  keyLight.position.set(0.9, 1.5, 0.8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.006;
  keyLight.shadow.radius = 6;
  keyLight.shadow.camera.near = 0.2;
  keyLight.shadow.camera.far = 4;
  scene.add(keyLight);
  scene.add(keyLight.target);

  // 补光:冷色,低强度
  const fill = new THREE.DirectionalLight(0x8fb0e8, 0.3);
  fill.position.set(-1.2, 0.7, 0.5);
  scene.add(fill);

  // 轮廓光
  const rim = new THREE.SpotLight(0xd8e4ff, 4, 6, 0.7, 0.8, 1.5);
  rim.position.set(-0.6, 1.0, -1.4);
  scene.add(rim);

  // 极弱环境底光
  scene.add(new THREE.HemisphereLight(0x2a2c33, 0x0a0a0c, 0.35));

  // ---- 台面(VIS-3:哑光台面,接受投影与轻微反射感)----
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 48),
    new THREE.MeshStandardMaterial({
      color: 0x141519,
      metalness: 0.55,
      roughness: 0.42,
    })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.002;
  table.receiveShadow = true;
  scene.add(table);

  scene.add(synthRoot);

  // ---- 后期:Bloom(仅高亮自发光)+ 暗角 ----
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), {
    samples: 4,
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, null!));
  const bloom = new UnrealBloomPass(size.clone(), 0.2, 0.4, 1.05);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.15;
  vignette.uniforms.darkness.value = 1.05;
  composer.addPass(vignette);
  composer.addPass(new OutputPass());
  // RenderPass 的相机由 app 在相机就绪后注入
  const stage: Stage = {
    scene,
    renderer,
    composer,
    bloom,
    keyLight,
    resize(w, h) {
      renderer.setSize(w, h);
      composer.setSize(w, h);
    },
    render() {
      composer.render();
    },
    setBloomEnabled(on: boolean) {
      bloom.enabled = on;
    },
  };
  return stage;
}

/** 为 RenderPass 绑定相机 */
export function bindCamera(stage: Stage, camera: THREE.Camera): void {
  (stage.composer.passes[0] as RenderPass).camera = camera;
}
