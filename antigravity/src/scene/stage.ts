import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly maxAnisotropy: number;
  attachTable: (mat: THREE.Material) => void;
  resize: () => void;
  dispose: () => void;
}

export function createStage(container: HTMLElement): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0e12);
  scene.fog = new THREE.FogExp2(0x0d0e12, 0.32);

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.04, 15);
  camera.position.set(0, 0.48, 0.56);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // Procedural studio softbox reflection environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.62;

  // Warm key light from upper front-left
  const keyLight = new THREE.DirectionalLight(0xfff3e2, 2.3);
  keyLight.position.set(-0.65, 1.15, 0.85);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.2;
  keyLight.shadow.camera.far = 3.2;
  const d = 0.55;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.00035;
  scene.add(keyLight);

  // Subtle cool fill light from right
  const fillLight = new THREE.DirectionalLight(0xcdd9f0, 0.85);
  fillLight.position.set(0.85, 0.65, 0.55);
  scene.add(fillLight);

  // Rear rim light to highlight walnut cheeks & brushed rear jack plate
  const rimLight = new THREE.DirectionalLight(0xffe1b8, 1.05);
  rimLight.position.set(0.25, 0.72, -0.95);
  scene.add(rimLight);

  // Ambient hemisphere bounce
  const hemi = new THREE.HemisphereLight(0xd8d2c6, 0x1a1816, 0.42);
  scene.add(hemi);

  let tableMesh: THREE.Mesh | null = null;
  const attachTable = (mat: THREE.Material) => {
    if (tableMesh) return;
    tableMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.y = 0;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);
  };

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", resize);

  return {
    scene,
    camera,
    renderer,
    maxAnisotropy,
    attachTable,
    resize,
    dispose() {
      window.removeEventListener("resize", resize);
      pmrem.dispose();
      envTex.dispose();
      renderer.dispose();
    },
  };
}
