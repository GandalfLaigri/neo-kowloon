import * as THREE from 'three';
import { CLOUD_Y } from '../config';
import { GLSL_COMMON, shared } from './materials';

/** Uniformes partagés par les couches nuageuses (éclair, projecteurs). */
export const skyShared = {
  uFlashPos: { value: new THREE.Vector2() },
  uHits: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 1, 0)) },
};

export class Sky {
  group = new THREE.Group();
  private dome: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];

  constructor() {
    const domeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMoonDir: shared.uMoonDir, uAbove: { value: 0 }, uFlash: shared.uFlash },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform float uAbove;
        uniform float uFlash;
        varying vec3 vDir;
        ${GLSL_COMMON}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 horizon = mix(vec3(0.04, 0.018, 0.05), vec3(0.018, 0.024, 0.055), uAbove);
          vec3 zenith = vec3(0.004, 0.004, 0.012);
          vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
          col += vec3(0.09, 0.028, 0.07) * exp(-abs(h) * 9.0) * (1.0 - uAbove * 0.6);
          vec3 sd = floor(d * 380.0);
          float st = step(0.9982, h31(sd)) * (0.6 + 0.4 * sin(uTime * 2.0 + h31(sd + 1.0) * 30.0));
          col += st * vec3(0.7, 0.75, 1.0) * smoothstep(0.02, 0.3, h) * mix(0.25, 1.0, uAbove);
          float m = dot(d, uMoonDir);
          col += smoothstep(0.99955, 0.9997, m) * vec3(1.6, 1.5, 1.35);
          col += pow(max(m, 0.0), 300.0) * vec3(0.15, 0.17, 0.3) + pow(max(m, 0.0), 12.0) * vec3(0.02, 0.025, 0.05);
          col += vec3(0.28, 0.3, 0.45) * uFlash * smoothstep(-0.15, 0.4, h);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const cloudVert = /* glsl */ `
      varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `;
    const cloudFrag = /* glsl */ `
      uniform float uTime;
      uniform float uLayer;
      uniform float uFlash;
      uniform vec2 uFlashPos;
      uniform vec4 uHits[16];
      varying vec3 vWP;
      #include <fog_pars_fragment>
      ${GLSL_COMMON}
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return s;
      }
      void main(){
        vec2 p = vWP.xz * 0.0021 + uLayer * 3.7 + uTime * vec2(0.006, 0.0025) * (1.0 + uLayer * 0.3);
        float n = fbm(p);
        float dens = smoothstep(0.4 + uLayer * 0.03, 0.64, n);
        float r = length(vWP.xz);
        dens *= 1.0 - smoothstep(2600.0, 3400.0, r);
        bool below = cameraPosition.y < vWP.y;
        float k = sin(vWP.x * 0.0045 + 1.3) * cos(vWP.z * 0.0052 - 0.4);
        vec3 glow = mix(vec3(0.3, 0.07, 0.2), vec3(0.07, 0.17, 0.33), smoothstep(-0.35, 0.35, k));
        vec3 under = glow * (0.3 + 0.45 * (1.0 - dens));
        // vu du dessus : clair de lune + halo de la ville qui transperce les trouées
        float thin = 1.0 - dens;
        float relief = smoothstep(0.45, 0.85, n);
        vec3 over = vec3(0.02, 0.024, 0.045) + vec3(0.07, 0.08, 0.13) * relief + glow * 0.6 * thin * thin;
        vec3 col = below ? under : over;
        // éclair : illumination interne, plus forte près du point d'impact
        float fl = uFlash * (0.25 + 0.75 * exp(-length(vWP.xz - uFlashPos) / 500.0));
        col += vec3(0.55, 0.6, 0.9) * fl * (0.4 + 0.8 * dens);
        // taches des projecteurs sous la couche nuageuse
        for (int i = 0; i < 16; i++) {
          vec4 hh = uHits[i];
          float d = length(vWP.xz - hh.xy);
          col += vec3(0.8, 0.85, 1.0) * hh.w * exp(-d * d / (hh.z * hh.z)) * (0.3 + dens);
        }
        gl_FragColor = vec4(col, clamp(dens * (below ? 0.9 : 0.97), 0.0, 1.0));
        #include <fog_fragment>
      }
    `;
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: shared.uTime, uLayer: { value: i }, uFlash: shared.uFlash, uFlashPos: skyShared.uFlashPos, uHits: skyShared.uHits },
        vertexShader: cloudVert,
        fragmentShader: cloudFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = CLOUD_Y + i * 14;
      m.renderOrder = 4;
      this.clouds.push(m);
      this.group.add(m);
    }
  }

  update(cam: THREE.Camera) {
    this.dome.position.copy(cam.position);
    const above = THREE.MathUtils.smoothstep(cam.position.y, CLOUD_Y, CLOUD_Y + 60);
    (this.dome.material as THREE.ShaderMaterial).uniforms.uAbove.value = above;
    // tri des couches selon la position de la caméra
    for (const c of this.clouds) c.renderOrder = cam.position.y > c.position.y ? 4 + (c.position.y - CLOUD_Y) / 100 : 4 - (c.position.y - CLOUD_Y) / 100;
  }
}
