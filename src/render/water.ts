import * as THREE from 'three';
import type { Reflector } from 'three/addons/objects/Reflector.js';
import type { Rect } from '../world/geom';
import { GLSL_COMMON, GLSL_LIGHTING, shared } from './materials';

/**
 * Plan d'eau (mer, port, canal). La réflexion réutilise la texture miroir de la
 * chaussée (plan y = 0) : l'eau étant 1,5 m plus bas, le léger décalage est
 * noyé dans les vagues. Aucun rendu supplémentaire de la scène.
 */
export function createWater(rects: Rect[], y: number, road: Reflector): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [];
  for (const r of rects) {
    const v = pos.length / 3;
    pos.push(r.x0, y, r.z0, r.x1, y, r.z0, r.x1, y, r.z1, r.x0, y, r.z1);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const ru = (road.material as THREE.ShaderMaterial).uniforms;
  const mat = new THREE.ShaderMaterial({
    name: 'water',
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...shared,
      tDiffuse: ru.tDiffuse,
      textureMatrix: ru.textureMatrix,
      uReflOn: ru.uReflOn,
      uRain: ru.uRain,
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){
        vWP = position;
        // repère local du réflecteur (plan tourné de -90° autour de x, en y = 0)
        vUv = textureMatrix * vec4(position.x, -position.z, 0.0, 1.0);
        vec4 mvPosition = viewMatrix * vec4(position, 1.0);
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
        // houle : deux couches de bruit qui dérivent en sens contraires
        vec2 n1 = vec2(vnoise(w * 0.35 + uTime * vec2(0.18, 0.05)), vnoise(w * 0.35 + 31.0 - uTime * vec2(0.04, 0.16))) - 0.5;
        vec2 n2 = vec2(vnoise(w * 1.3 - uTime * vec2(0.5, 0.2)), vnoise(w * 1.3 + 7.0 + uTime * vec2(0.15, 0.45))) - 0.5;
        vec2 nrm = n1 * 0.9 + n2 * 0.45;
        // impacts de pluie
        vec2 rp = w * 1.3;
        vec2 ci = floor(rp);
        vec2 cf = fract(rp) - 0.5 - (vec2(h21(ci + 3.1), h21(ci + 7.7)) - 0.5) * 0.6;
        float tt = fract(uTime * 1.2 + h21(ci));
        float ring = abs(length(cf) - tt * 0.45);
        float rip = (1.0 - smoothstep(0.0, 0.04, ring)) * (1.0 - tt) * step(h21(ci + floor(uTime * 1.2 + h21(ci)) * 0.37), uRain);
        nrm += normalize(cf + 1e-4) * rip * 0.6;
        vec3 V = normalize(cameraPosition - vWP);
        float dist = length(cameraPosition - vWP);
        vec2 ruv = vUv.xy / vUv.w + nrm * 0.035 * (1.0 - smoothstep(60.0, 600.0, dist) * 0.6);
        vec3 refl = texture2D(tDiffuse, ruv, 1.5).rgb * uReflOn;
        vec3 N = normalize(vec3(nrm.x * 0.35, 1.0, nrm.y * 0.35));
        float fres = 0.08 + 0.92 * pow(1.0 - max(V.y, 0.0), 4.0);
        vec3 diff, spec;
        shade(vWP, N, V, 1.0, diff, spec);
        vec3 deep = vec3(0.004, 0.012, 0.016);
        vec3 col = deep * diff + spec * 0.8 + refl * mix(0.55, 1.0, fres) + uSkyRefl * fres * (0.25 + 0.4 * (1.0 - uReflOn));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1; // après la chaussée, dont le rendu miroir met à jour la texture
  return mesh;
}
