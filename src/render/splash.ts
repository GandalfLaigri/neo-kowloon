import * as THREE from 'three';
import { HALF, PITCH, RAIN_EXTENT, ROAD } from '../config';
import { shared } from './materials';

const N = 2600;
const BOX = 36;

/**
 * Éclaboussures de pluie au sol : petites couronnes qui s'ouvrent autour du joueur,
 * posées sur la chaussée, les trottoirs, ou le dessus des abris (carte d'abri de la pluie).
 */
export class Splashes {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(shelter: THREE.DataTexture) {
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([Math.random(), Math.random(), Math.random()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uCam: { value: new THREE.Vector3() },
        uShelter: { value: shelter },
        uAmount: { value: 1 },
        uScale: { value: 600 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform sampler2D uShelter;
        uniform float uAmount;
        uniform float uScale;
        varying float vU;
        varying float vA;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float id = position.x * 1000.0 + position.y * 17.0;
          float T = 0.55 + 0.4 * position.z;
          float cyc = uTime / T + position.x * 13.0;
          float k = floor(cyc);
          vU = fract(cyc);
          // position tirée à chaque cycle, fixe dans le monde, repliée autour du joueur
          vec2 r = vec2(h(id + k * 1.37), h(id * 1.9 + k * 2.71)) * ${BOX.toFixed(1)};
          vec2 base = floor(uCam.xz / ${BOX.toFixed(1)}) * ${BOX.toFixed(1)};
          vec2 p = base + r;
          p += ${BOX.toFixed(1)} * (step(p, uCam.xz - ${(BOX / 2).toFixed(1)}) - step(uCam.xz + ${(BOX / 2).toFixed(1)}, p));
          // sol : chaussée (0) ou dalle (0,5), sinon dessus de l'abri le plus haut
          vec2 l = mod(p + ${(HALF + PITCH / 2).toFixed(1)}, ${PITCH.toFixed(1)}) - ${(PITCH / 2).toFixed(1)};
          bool road = min(abs(l.x), abs(l.y)) < ${(ROAD / 2).toFixed(1)} || max(abs(p.x), abs(p.y)) > ${(HALF + 4).toFixed(1)};
          float y = road ? 0.02 : 0.52;
          vec2 suv = (p + ${(RAIN_EXTENT / 2).toFixed(1)}) / ${RAIN_EXTENT.toFixed(1)};
          if (suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0) y = max(y, texture2D(uShelter, suv).r + 0.02);
          vec3 wp = vec3(p.x, y, p.y);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float d = length(wp - uCam);
          vA = step(h(id * 3.3), uAmount) * step(vU, 0.45) * (1.0 - smoothstep(10.0, 22.0, d)) * smoothstep(0.5, 1.5, d);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vA > 0.0 ? uScale * 0.18 / max(-mv.z, 0.1) : 0.0;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vU;
        varying float vA;
        void main(){
          vec2 q = gl_PointCoord - 0.5;
          q.y *= 2.4;                       // couronne vue en perspective rasante
          float d = length(q) * 2.0;
          float r = vU / 0.45;
          float ring = 1.0 - smoothstep(0.06, 0.2, abs(d - r * 0.9));
          float drop = (1.0 - smoothstep(0.0, 0.25, length(gl_PointCoord - vec2(0.5, 0.5 - 0.35 * r)))) * step(r, 0.35);
          float a = max(ring * (1.0 - r), drop) * vA * 0.38;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.7, 0.74, 0.9, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setPixelScale(heightPx: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(cam: THREE.Vector3, amount: number) {
    this.mat.uniforms.uCam.value.copy(cam);
    this.mat.uniforms.uAmount.value = amount;
    this.points.visible = amount > 0.01;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
