import * as THREE from 'three';
import type { SteamEmitter } from '../world/builder';
import { GLSL_COMMON, shared } from './materials';

/** Volutes de vapeur (bouches d'égout, ventilations, fûts, cuisines…), animées sur le GPU. */
export class Steam {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(emitters: SteamEmitter[]) {
    const n = emitters.reduce((s, e) => s + e.n, 0);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    let k = 0;
    for (const e of emitters) {
      for (let i = 0; i < e.n; i++, k++) {
        pos.set([e.x + (Math.random() - 0.5) * 0.4, e.y, e.z + (Math.random() - 0.5) * 0.4], k * 3);
        seed.set([i / e.n + Math.random() * 0.05, e.size * (0.7 + Math.random() * 0.6), e.rise, 0.8 + Math.random() * 0.4], k * 4);
        tint.set(e.tint, k * 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: shared.uTime,
        uPixel: { value: 600 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixel;
        attribute vec4 aSeed;
        attribute vec3 aTint;
        varying float vA;
        varying vec3 vTint;
        varying float vRot;
        #include <fog_pars_vertex>
        void main(){
          float life = 5.5 * aSeed.w;
          float age = fract(uTime / life + aSeed.x);
          vec3 p = position;
          p.y += (age * 0.55 + age * age * 0.45) * aSeed.z;
          float sw = aSeed.x * 40.0;
          p.x += sin(uTime * 0.7 + sw) * age * 1.1 + age * 1.6;
          p.z += cos(uTime * 0.6 + sw * 1.3) * age * 1.1 + age * 0.7;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float size = (0.5 + 2.8 * age) * aSeed.y;
          gl_PointSize = min(size * uPixel / max(-mvPosition.z, 0.5), 900.0);
          vA = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.45, 1.0, age)) * 0.3;
          vTint = aTint;
          vRot = sw + uTime * 0.15;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying vec3 vTint;
        varying float vRot;
        #include <fog_pars_fragment>
        ${GLSL_COMMON}
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float cs = cos(vRot), sn = sin(vRot);
          vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
          float n = vnoise(r * 5.0 + vRot) * 0.6 + vnoise(r * 11.0 - vRot) * 0.4;
          float a = smoothstep(0.5, 0.05, d) * (0.45 + 0.75 * n) * vA;
          vec3 col = vTint + vec3(0.05, 0.045, 0.06);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  /** Facteur de conversion taille monde → pixels (hauteur du tampon / (2·tan(fov/2))). */
  setPixelScale(bufferHeight: number, fovDeg: number) {
    this.mat.uniforms.uPixel.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
