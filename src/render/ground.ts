import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { BLOCKS, HALF, PITCH, ROAD } from '../config';
import { GLSL_COMMON, GLSL_LIGHTING, shared } from './materials';

const RoadShader = {
  name: 'road',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    ...THREE.UniformsLib.fog,
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWP;
    #include <fog_pars_vertex>
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWP = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uReflOn;
    uniform float uRain;
    varying vec4 vUv;
    varying vec3 vWP;
    #include <fog_pars_fragment>
    ${GLSL_COMMON}
    ${GLSL_LIGHTING}
    void main(){
      vec2 w = vWP.xz;
      vec2 l = mod(w + ${(HALF + PITCH / 2).toFixed(1)}, ${PITCH.toFixed(1)}) - ${(PITCH / 2).toFixed(1)};
      vec2 ad = abs(l);
      float R = ${(ROAD / 2).toFixed(1)};
      bool rx = ad.x < R;
      bool rz = ad.y < R;
      bool inter = rx && rz;
      vec3 alb = vec3(0.03, 0.03, 0.036) * (0.75 + 0.5 * vnoise(w * 1.7));
      float paint = 0.0;
      vec3 paintCol = vec3(0.8);
      if (rx && !inter) {
        if (abs(ad.x - 0.3) < 0.1) { paint = 1.0; paintCol = vec3(0.9, 0.6, 0.05); }
        if (abs(ad.x - 4.5) < 0.09 && fract(w.y / 6.0) < 0.5) paint = 1.0;
        if (ad.y < R + 4.0 && ad.y > R + 0.6 && fract(w.x / 1.2) < 0.5 && ad.x < R - 0.5) paint = 1.0;
      }
      if (rz && !inter) {
        if (abs(ad.y - 0.3) < 0.1) { paint = 1.0; paintCol = vec3(0.9, 0.6, 0.05); }
        if (abs(ad.y - 4.5) < 0.09 && fract(w.x / 6.0) < 0.5) paint = 1.0;
        if (ad.x < R + 4.0 && ad.x > R + 0.6 && fract(w.y / 1.2) < 0.5 && ad.y < R - 0.5) paint = 1.0;
      }
      paint *= 0.55 + 0.45 * vnoise(w * 3.0);
      float pud = smoothstep(0.5, 0.66, vnoise(w * 0.12) * 0.65 + vnoise(w * 0.5) * 0.35);
      vec2 nrm = vec2(vnoise(w * 5.0 + uTime * vec2(0.0, 1.7)) - 0.5, vnoise(w * 5.0 + 17.0 - uTime * vec2(1.4, 0.0)) - 0.5) * mix(0.3, 1.0, min(uRain, 1.0));
      // gouttes : anneaux qui s'élargissent
      vec2 rp = w * 1.6;
      vec2 ci = floor(rp);
      vec2 cf = fract(rp) - 0.5 - (vec2(h21(ci + 3.1), h21(ci + 7.7)) - 0.5) * 0.6;
      float tt = fract(uTime * 1.3 + h21(ci));
      float ring = abs(length(cf) - tt * 0.45);
      float rip = (1.0 - smoothstep(0.0, 0.035, ring)) * (1.0 - tt) * step(h21(ci + floor(uTime * 1.3 + h21(ci)) * 0.37), uRain);
      nrm += normalize(cf + 1e-4) * rip * 0.8;
      vec2 ruv = vUv.xy / vUv.w + nrm * mix(0.025, 0.008, pud);
      float bias = mix(3.2, 0.2, pud);
      vec3 refl = texture2D(tDiffuse, ruv, bias).rgb * uReflOn;
      vec3 N = normalize(vec3(nrm.x * 0.3, 1.0, nrm.y * 0.3));
      vec3 V = normalize(cameraPosition - vWP);
      float fres = 0.05 + 0.95 * pow(1.0 - max(V.y, 0.0), 5.0);
      float reflK = mix(0.3, 0.95, pud) * mix(0.4, 1.0, fres) * (1.0 - paint * 0.5);
      alb = mix(alb, paintCol * 0.35, paint);
      alb *= 1.0 - pud * 0.6;
      float wet = mix(0.6, 1.0, pud);
      vec3 diff, spec;
      shade(vWP, N, V, wet, diff, spec);
      vec3 col = alb * diff + spec * 0.6 + refl * reflK + uSkyRefl * fres * 0.15 * (1.0 - uReflOn);
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }
  `,
};

/**
 * Géométrie des chaussées seules (bandes de rue), dans le plan local du réflecteur
 * (x → x monde, y → -z monde). Sous les îlots il n'y a rien : les trémies des
 * sous-sols ne laissent plus apparaître de "flaque".
 */
function roadGeometry() {
  const R = ROAD / 2;
  const lines: number[] = [];
  for (let i = -1; i <= BLOCKS + 1; i++) lines.push(-HALF + i * PITCH);
  const E = HALF + PITCH + R;
  const rects: [number, number, number, number][] = [];
  for (const c of lines) rects.push([c - R, -E, c + R, E]); // rues le long de z (pleine longueur)
  for (const c of lines) {
    // rues le long de x, découpées entre les précédentes (pas de recouvrement)
    let x = -E;
    for (const d of lines) { if (d - R > x) rects.push([x, c - R, d - R, c + R]); x = d + R; }
    if (E > x) rects.push([x, c - R, E, c + R]);
  }
  const pos: number[] = [], idx: number[] = [];
  for (const [x0, z0, x1, z1] of rects) {
    const v = pos.length / 3;
    pos.push(x0, -z0, 0, x1, -z0, 0, x1, -z1, 0, x0, -z1, 0);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function createRoad(w: number, h: number): Reflector {
  const refl = new Reflector(roadGeometry(), {
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.003,
    multisample: 0,
    shader: RoadShader,
  });
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0;
  const mat = refl.material as THREE.ShaderMaterial;
  Object.assign(mat.uniforms, shared, { uReflOn: { value: 1 }, uRain: { value: 1 } });
  mat.fog = true;
  const tex = refl.getRenderTarget().texture;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return refl;
}
