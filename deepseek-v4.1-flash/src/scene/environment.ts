/**
 * Image-based lighting (PRD VIS-1).
 *
 * A PMREM-filtered `RoomEnvironment` gives every PBR surface something to
 * reflect, which is what separates "plastic-looking" from "photographed". It is
 * generated procedurally at boot, so nothing is fetched (PRD 9) and the
 * environment adapts to whichever renderer we ended up with.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface EnvironmentHandle {
  readonly texture: THREE.Texture;
  dispose(): void;
}

export function createEnvironment(renderer: THREE.WebGLRenderer): EnvironmentHandle {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);

  // The room scene's own geometry is only needed to bake the cube map.
  room.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  pmrem.dispose();

  return {
    texture: target.texture,
    dispose(): void {
      target.dispose();
    },
  };
}

/**
 * Studio backdrop gradient, drawn as an inverted dome so the instrument always
 * has a horizon behind it whatever the camera does (PRD VIS-3).
 */
export function createBackdrop(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(12, 32, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x1b1c21) },
      uBottom: { value: new THREE.Color(0x050507) },
      uGlow: { value: new THREE.Color(0x2a2b33) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uGlow;
      varying vec3 vWorld;

      void main() {
        // Vertical gradient with a soft pool of light behind the instrument.
        float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
        vec3 base = mix(uBottom, uTop, smoothstep(0.35, 0.95, h));

        float d = length(normalize(vWorld).xz - vec2(0.0, 0.55));
        base += uGlow * exp(-d * d * 2.4) * 0.55;

        // Fine dither kills the banding a smooth gradient shows on 8-bit.
        float dither = fract(sin(dot(vWorld.xz, vec2(12.9898, 78.233))) * 43758.5453);
        base += (dither - 0.5) / 255.0;

        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'backdrop';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Matte table under the instrument. Kept slightly reflective-free so the
 * contact shadow does the work (PRD VIS-3).
 */
export function createTable(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(6, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0x0c0d10,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.28,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.002;
  mesh.receiveShadow = true;
  mesh.name = 'table';
  return mesh;
}

/** Soft elliptical contact shadow, drawn just above the table. */
export function createContactShadow(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(0.95, 0.62);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(0x000000) },
      uStrength: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p * vec2(1.0, 1.25));
        float a = smoothstep(1.0, 0.15, r);
        gl_FragColor = vec4(uColor, a * uStrength);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0012;
  mesh.renderOrder = 1;
  mesh.name = 'contact-shadow';
  return mesh;
}
