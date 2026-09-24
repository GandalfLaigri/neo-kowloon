import * as THREE from 'three';
import { RAIN_EXTENT, RAIN_RES } from '../config';
import { shared } from './materials';

const N = 26000;

export class Rain {
  mesh: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;
  /** Carte d'abri (hauteur du plus haut couvert), partagée avec les éclaboussures. */
  readonly tex: THREE.DataTexture;

  constructor(shelter: Float32Array) {
    const pos = new Float32Array(N * 6);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.tex = new THREE.DataTexture(shelter, RAIN_RES, RAIN_RES, THREE.RedFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: shared.uTime,
        uCam: { value: new THREE.Vector3() },
        uShelter: { value: this.tex },
        uFade: { value: 1 },
        uAmount: { value: 1 },
        uHideMin: { value: new THREE.Vector3(0, -9999, 0) },
        uHideMax: { value: new THREE.Vector3(0, -9998, 0) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform sampler2D uShelter;
        uniform float uFade;
        uniform float uAmount;
        uniform vec3 uHideMin;
        uniform vec3 uHideMax;
        attribute float aEnd;
        varying float vA;
        #include <fog_pars_vertex>
        const vec3 BOX = vec3(64.0, 44.0, 64.0);
        void main(){
          vec3 vel = vec3(3.5, -34.0, 1.4) * (0.85 + 0.3 * fract(position.x * 37.0));
          vec3 p = position * BOX + vel * uTime;
          vec3 org = uCam - BOX * 0.5;
          p = mod(p - org, BOX) + org;
          // pluie légère : moins de gouttes, traînées plus courtes ; averse d'orage : plus visibles
          p -= vel * 0.03 * aEnd * mix(0.55, 1.0, clamp(uAmount, 0.0, 1.0));
          vec2 suv = (p.xz + ${(RAIN_EXTENT / 2).toFixed(1)}) / ${RAIN_EXTENT.toFixed(1)};
          float h = (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) ? 0.0 : texture2D(uShelter, suv).r;
          float d = length(p - uCam);
          vA = step(h, p.y) * step(fract(position.y * 71.3 + position.x * 3.1), uAmount) * uFade * max(1.0, uAmount) * (0.07 + 0.13 * fract(position.z * 91.0)) * (1.0 - smoothstep(16.0, 32.0, d)) * smoothstep(0.8, 3.0, d);
          // pas de pluie à l'intérieur du véhicule où se trouve le joueur
          if (all(greaterThan(p, uHideMin)) && all(lessThan(p, uHideMax))) vA = 0.0;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        #include <fog_pars_fragment>
        void main(){
          gl_FragColor = vec4(0.62, 0.66, 0.85, vA);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** fade : atténuation (altitude) · amount : intensité (0 aucune · 0,4 légère · 1 battante, jusqu'à 1,3 sous l'orage). */
  update(cam: THREE.Vector3, fade: number, hide: THREE.Box3 | null = null, amount = 1) {
    this.mat.uniforms.uCam.value.copy(cam);
    this.mat.uniforms.uFade.value = fade;
    this.mat.uniforms.uAmount.value = amount;
    if (hide) {
      this.mat.uniforms.uHideMin.value.copy(hide.min);
      this.mat.uniforms.uHideMax.value.copy(hide.max);
    } else this.mat.uniforms.uHideMin.value.set(0, -9999, 0), this.mat.uniforms.uHideMax.value.set(0, -9998, 0);
    this.mesh.visible = fade > 0.01 && amount > 0.01;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
