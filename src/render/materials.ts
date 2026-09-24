import * as THREE from 'three';
import { CYCLE, GREEN, LUX_Y, NUM_PL } from '../config';

/** Uniformes partagés par tous les matériaux (mêmes objets => une seule mise à jour). */
export const shared = {
  uTime: { value: 0 },
  uPL: { value: Array.from({ length: NUM_PL }, () => new THREE.Vector4(0, -9999, 0, 1)) },
  uPLC: { value: Array.from({ length: NUM_PL }, () => new THREE.Vector3()) },
  uSkyAmb: { value: new THREE.Vector3(0.03, 0.03, 0.065) },
  uGroundAmb: { value: new THREE.Vector3(0.05, 0.022, 0.048) },
  uMoonDir: { value: new THREE.Vector3(0.35, 0.7, -0.6).normalize() },
  uMoonCol: { value: new THREE.Vector3(0.06, 0.08, 0.14) },
  uSkyRefl: { value: new THREE.Vector3(0.16, 0.09, 0.2) },
  uFlash: { value: 0 },                                   // éclair (0..1)
  uFlashCol: { value: new THREE.Vector3(0.55, 0.6, 0.85) },
};

export const GLSL_COMMON = /* glsl */ `
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h31(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 neonPal(float t){
  t = fract(t) * 6.0;
  if (t < 1.0) return vec3(1.0, 0.16, 0.62);
  if (t < 2.0) return vec3(0.0, 0.9, 1.0);
  if (t < 3.0) return vec3(0.65, 0.3, 1.0);
  if (t < 4.0) return vec3(1.0, 0.69, 0.0);
  if (t < 5.0) return vec3(0.42, 1.0, 0.31);
  return vec3(0.24, 0.48, 1.0);
}
`;

export const GLSL_LIGHTING = /* glsl */ `
uniform vec4 uPL[${NUM_PL}];
uniform vec3 uPLC[${NUM_PL}];
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform vec3 uSkyRefl;
uniform float uFlash;
uniform vec3 uFlashCol;
vec3 cityGlow(vec3 wp){
  float k = sin(wp.x * 0.0045 + 1.3) * cos(wp.z * 0.0052 - 0.4);
  return mix(vec3(1.0, 0.18, 0.55), vec3(0.1, 0.55, 1.0), smoothstep(-0.35, 0.35, k));
}
void shade(vec3 wp, vec3 N, vec3 V, float wet, out vec3 diff, out vec3 spec){
  diff = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
  diff += uMoonCol * max(dot(N, uMoonDir), 0.0);
  diff += uFlashCol * uFlash * (0.25 + 0.75 * max(N.y, 0.0));
  float h = max(wp.y, 0.0);
  diff += cityGlow(wp) * 0.13 * exp(-h / 38.0) * (1.0 - max(N.y, 0.0) * 0.7);
  spec = vec3(0.0);
  float shin = mix(10.0, 90.0, wet);
  for (int i = 0; i < ${NUM_PL}; i++) {
    vec3 L = uPL[i].xyz - wp;
    float d2 = dot(L, L);
    float r = uPL[i].w;
    if (d2 < r * r) {
      float d = sqrt(d2);
      L /= max(d, 1e-3);
      float att = 1.0 - d / r; att *= att;
      float nl = max(dot(N, L), 0.0);
      diff += uPLC[i] * att * (nl * 0.85 + 0.15);
      vec3 H = normalize(L + V);
      spec += uPLC[i] * att * pow(max(dot(N, H), 0.0), shin) * wet * 3.0 * nl;
    }
  }
}
`;

const VOXEL_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aParams;
attribute vec4 aFace;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vPar;
varying vec4 vFace;
#ifdef PED
uniform float uTime;
attribute vec2 aPart;    // x : partie (0 corps · 1/2 jambes · 3/4 bras), y : hauteur du pivot
attribute vec4 aInst;    // phase, marche (0..1), teinte néon, posture (voir ci-dessous)
vec3 pedPal(float t){
  t = fract(t) * 5.0;
  if (t < 1.0) return vec3(1.0, 0.16, 0.62);
  if (t < 2.0) return vec3(0.0, 0.9, 1.0);
  if (t < 3.0) return vec3(0.65, 0.3, 1.0);
  if (t < 4.0) return vec3(1.0, 0.69, 0.0);
  return vec3(0.42, 1.0, 0.31);
}
#endif
#include <fog_pars_vertex>
void main(){
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef PED
    // Postures : 0 debout/marche · 1 assis · 2 discute · 3 fume · 4 travaille (hache, remue)
    // 5 téléphone · 6 danse · 7 assis au clavier · 8 assis, boit · 9 allongé · 10 debout, mains devant
    // marche : rotation des membres autour de la hanche / de l'épaule (avant = +z local)
    float part = aPart.x, py = aPart.y, pose = aInst.w;
    float ph = uTime * 7.0 * (0.85 + 0.3 * fract(aInst.x * 7.3)) + aInst.x * 6.2831;
    float sw = sin(ph) * 0.55 * aInst.y;
    float T = uTime + aInst.x * 37.0;
    bool leg = part > 0.5 && part < 2.5;
    bool armL = part > 2.5 && part < 3.5;
    bool armR = part > 3.5;              // 5 : téléphone, porté par la main droite
    bool arm = armL || armR;
    bool seated = (pose > 0.5 && pose < 1.5) || (pose > 6.5 && pose < 8.5);
    bool lying = pose > 8.5 && pose < 9.5;
    float ang = 0.0;
    if (part > 0.5 && part < 1.5) ang = sw;
    else if (part > 1.5 && part < 2.5) ang = -sw;
    else if (armL) ang = -sw * 0.8;
    else if (armR) ang = sw * 0.8;
    if (seated && leg) ang = -1.5;
    if (pose > 0.5 && pose < 1.5) {
      if (arm) ang = -0.35;                                   // bras posés
    } else if (pose > 1.5 && pose < 2.5) {
      // en pleine discussion : gestes des mains
      float g = max(0.0, sin(uTime * 2.1 + aInst.x * 17.0));
      if (armR) ang = -0.3 - 0.9 * g * g;
      else if (armL) ang = -0.15 - 0.3 * max(0.0, sin(uTime * 1.7 + aInst.x * 9.0));
    } else if (pose > 2.5 && pose < 3.5) {
      // cigarette à la main
      if (armL) ang = -1.9 + 0.25 * max(0.0, sin(uTime * 0.5 + aInst.x * 13.0));
    } else if (pose > 3.5 && pose < 4.5) {
      // travail : une main tient, l'autre hache / remue
      if (armL) ang = -0.95;
      else if (armR) ang = -0.75 - 0.45 * abs(sin(T * 5.5)) * step(0.3, fract(T * 0.13));
    } else if (pose > 4.5 && pose < 5.5) {
      // téléphone tenu devant soi, pouce qui défile
      if (armL) ang = -1.05;
      else if (armR) ang = -1.15 + 0.04 * sin(T * 3.0);
    } else if (pose > 5.5 && pose < 6.5) {
      // danse
      float b = sin(T * 6.5);
      if (armL) ang = -2.2 - 0.7 * b;
      else if (armR) ang = -2.2 + 0.7 * b;
      else if (leg) ang = 0.3 * sin(T * 6.5 + (part > 1.5 ? 3.1416 : 0.0));
    } else if (pose > 6.5 && pose < 7.5) {
      if (arm) ang = -1.2 + 0.05 * sin(T * 19.0 + part * 2.0);   // frappe au clavier
    } else if (pose > 7.5 && pose < 8.5) {
      if (armL) ang = -0.4;
      else if (armR) { float c = fract(T * 0.12); ang = -0.55 - 1.5 * smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.2, 0.28, c)); }
    } else if (lying) {
      if (arm) ang = -0.1;
      else if (leg) ang = 0.0;
    } else if (pose > 9.5 && pose < 10.5) {
      if (arm) ang = -1.25 + 0.06 * sin(T * 15.0 + part * 2.0);
    }
    float cs = cos(ang), sn = sin(ang);
    vec3 q = lp.xyz - vec3(0.0, py, 0.0);
    lp.xyz = vec3(q.x, q.y * cs - q.z * sn, q.y * sn + q.z * cs) + vec3(0.0, py, 0.0);
    n = vec3(n.x, n.y * cs - n.z * sn, n.y * sn + n.z * cs);
    lp.y += abs(sin(ph)) * 0.035 * aInst.y;
    if (pose > 5.5 && pose < 6.5) { lp.y += abs(sin(T * 6.5)) * 0.06; lp.x += sin(T * 3.25) * 0.05 * lp.y; }
    // à l'arrêt : léger balancement
    else if (!seated && !lying) lp.x += sin(uTime * 1.3 + aInst.x * 20.0) * 0.02 * (1.0 - aInst.y) * lp.y;
    if (lying) {
      // allongé sur le dos (pieds à l'origine), respiration
      lp.xyz = vec3(lp.x, lp.z + 0.14 + (part < 0.5 ? 0.012 * sin(T * 1.4) : 0.0), -lp.y);
      n = vec3(n.x, n.z, -n.y);
    }
    // le téléphone n'existe que dans la posture 5
    if (part > 4.5 && (pose < 4.5 || pose > 5.5)) lp.xyz = vec3(0.0);
  #endif
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * lp;
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vCol = aColor;
  #ifdef USE_INSTANCING_COLOR
    if (aParams.w > 0.5 && aParams.w < 1.5) vCol *= instanceColor;
  #endif
  vPar = aParams;
  #ifdef PED
    if (aParams.w > 1.5 && aParams.w < 2.5) vCol *= pedPal(aInst.z);
    vPar.w = 0.0;
  #endif
  vFace = aFace;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const VOXEL_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vPar;
varying vec4 vFace;
#include <fog_pars_fragment>
${GLSL_COMMON}
${GLSL_LIGHTING}

vec3 winPal(float h){
  if (h < 0.40) return vec3(1.0, 0.7, 0.4);
  if (h < 0.64) return vec3(0.75, 0.88, 1.0);
  if (h < 0.76) return vec3(0.2, 0.85, 1.0);
  if (h < 0.87) return vec3(1.0, 0.3, 0.75);
  if (h < 0.95) return vec3(0.55, 1.0, 0.55);
  return vec3(1.0, 0.25, 0.2);
}

float glyphPx(vec2 gi, vec2 gp, float s){
  float row = step(0.55, h31(vec3(gi, s + gp.y * 7.1 + 1.0)));
  float col = step(0.62, h31(vec3(gi, s + gp.x * 5.3 + 50.0)));
  float r2 = row * step(0.22, h31(vec3(gi, s + gp.x * 1.7 + gp.y * 9.1)));
  float c2 = col * step(0.3, h31(vec3(gi, s + gp.y * 2.3 + gp.x * 4.9 + 7.0)));
  float dt = step(0.84, h31(vec3(gi + gp * 0.37, s + 99.0)));
  return max(max(r2, c2), dt);
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  // les varyings "constants" sont arrondis : l'interpolation introduit des erreurs
  // infimes que les fonctions de hash amplifient en bruit/zébrures
  vec4 par = floor(vPar + 0.5);
  float style = par.x;
  float seed = par.y;
  float emis = par.z * (8.0 / 255.0) * 0.75;
  float extra = par.w;
  vec2 uv = vFace.xy;
  vec2 fs = floor(vFace.zw + 0.5);
  vec2 cell = floor(uv);
  vec2 f = uv - cell;
  vec2 fw = fwidth(uv);
  float px = max(fw.x, fw.y);
  float far = smoothstep(0.35, 1.3, px);
  float faceId = dot(floor(N + 0.5), vec3(1.0, 2.0, 4.0));
  vec2 eg = smoothstep(vec2(0.0), fw * 1.5 + 0.03, f) * smoothstep(vec2(0.0), fw * 1.5 + 0.03, 1.0 - f);
  float edge = mix(0.74, 1.0, min(eg.x, eg.y));
  float vn = 0.84 + 0.32 * h31(vec3(cell, seed * 1.37 + faceId * 11.0));
  vec3 albedo = vCol * mix(edge * vn, 0.93, far);
  vec3 emission = vec3(0.0);
  float wet = N.y > 0.5 ? 0.6 : 0.12;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  bool puddles = true; // surface horizontale concernée par les flaques

  bool facade = (style > 0.5 && style < 4.5) || (style > 12.5 && style < 16.5);
  if (style < 0.5) {
    // béton / métal nu
  } else if (facade) {
    if (abs(N.y) < 0.5) {
      // gabarit des baies : hauteur d'étage, pas des travées, lignes/colonnes vitrées (en voxels)
      float fh = 7.0, cp = 3.0, r0 = 2.0, r1 = 5.0, c0 = 0.0, c1 = 1.0, litK = 1.0;
      bool heritage = style > 12.5 && style < 13.5;
      bool curtain = style > 13.5 && style < 14.5;
      bool indus = style > 14.5 && style < 15.5;
      bool capsule = style > 15.5;
      if (style > 1.5 && style < 2.5) { fh = 8.0; cp = 6.0; r0 = 2.0; r1 = 6.0; c0 = 0.0; c1 = 4.0; }
      else if (style > 2.5 && style < 3.5) { fh = 6.0; cp = 4.0; r0 = 2.0; r1 = 4.0; c0 = 1.0; c1 = 2.0; }
      else if (style > 3.5 && style < 4.5) { fh = 7.0; cp = 2.0; r0 = 1.0; r1 = 5.0; c0 = 1.0; c1 = 1.0; }
      else if (heritage) { fh = 8.0; cp = 4.0; r0 = 2.0; r1 = 6.0; c0 = 1.0; c1 = 2.0; litK = 1.35; }
      else if (curtain) { fh = 8.0; cp = 3.0; r0 = 1.0; r1 = 7.0; c0 = 0.0; c1 = 2.0; litK = 0.75; }
      else if (indus) { fh = 10.0; cp = 8.0; r0 = 7.0; r1 = 8.0; c0 = 1.0; c1 = 6.0; litK = 0.55; }
      else if (capsule) { fh = 4.0; cp = 4.0; r0 = 1.0; r1 = 2.0; c0 = 1.0; c1 = 2.0; litK = 1.9; }
      float off = floor(mod(fs.x, cp) * 0.5);
      float cx = cell.x - off;
      float ci = floor(cx / cp); float cl = cx - ci * cp;
      float fi = floor(cell.y / fh); float rl = cell.y - fi * fh;
      bool inside = cell.x >= 1.0 && cell.x <= fs.x - 2.0 && cell.y >= 1.0 && cell.y <= fs.y - 2.0;
      bool win = inside && rl >= r0 && rl <= r1 && cl >= c0 && cl <= c1;
      // hublots des capsules : disque de 1 m dans une baie de 2 x 2 voxels
      if (win && capsule) { vec2 pq = vec2(cl - c0 + f.x, rl - r0 + f.y) - 1.0; win = dot(pq, pq) < 0.85; }
      // meneaux fins du mur-rideau
      bool mull = curtain && win && (f.x < 0.06 || (rl > r1 - 0.5 && f.y > 0.9));
      if (rl < 0.5) albedo *= 0.72;
      if (style > 3.5 && style < 4.5 && cl < 0.5) albedo *= 1.3;
      vec2 tq0 = vec2(dot(vWP.xz, vec2(-N.z, N.x)), vWP.y);
      if (heritage) {
        // brique appareillée (estompée au loin), linteaux et appuis en pierre claire, corniche
        vec2 bq = vec2(tq0.x / 0.25 + 0.5 * mod(floor(tq0.y / 0.125), 2.0), tq0.y / 0.125);
        vec2 bf = fract(bq);
        float bfade = smoothstep(0.25, 0.7, max(fwidth(bq.x), fwidth(bq.y)));
        float mortar = mix(step(0.1, bf.x) * step(0.14, bf.y), 1.0, bfade);
        albedo *= mix(0.62, 1.0, mortar) * (0.85 + 0.3 * h21(floor(bq)));
        bool stone = cl >= c0 && cl <= c1 && (abs(rl - r1 - 1.0) < 0.5 || abs(rl - r0 + 1.0) < 0.5);
        if (stone || rl < 0.5) albedo = vec3(0.42, 0.39, 0.34) * (0.8 + 0.3 * vn);
      } else if (indus) {
        // tôle ondulée, coulures de rouille
        float rib = 0.78 + 0.3 * smoothstep(0.2, 0.5, abs(fract(uv.x * 3.0) - 0.5));
        albedo *= mix(rib, 0.93, far);
        float rust = smoothstep(0.45, 0.8, vnoise(vec2(tq0.x * 1.3, tq0.y * 0.18))) * (0.5 + 0.5 * vnoise(tq0 * 0.7));
        albedo = mix(albedo, vec3(0.3, 0.14, 0.06), rust * 0.7);
      } else if (capsule) {
        if (cl < 0.5 || rl < 0.5) albedo *= 0.55; // joints entre modules
      } else if (curtain) {
        albedo = mix(vCol * 0.5, vec3(0.05, 0.06, 0.08), 0.5);
      }
      float lux = smoothstep(${(LUX_Y - 20).toFixed(1)}, ${(LUX_Y + 140).toFixed(1)}, vWP.y);
      float litP = (0.12 + 0.3 * (extra / 255.0) + 0.2 * lux) * litK;
      float wFrac = ((r1 - r0 + 1.0) / fh) * ((c1 - c0 + 1.0) / cp);
      vec3 avgEm = vec3(0.95, 0.75, 0.62) * litP * wFrac * 0.6;
      if (curtain) avgEm = vec3(0.7, 0.8, 0.95) * litP * 0.35 + uSkyRefl * 0.15;
      vec3 winEm = vec3(0.0);
      if (win && !mull) {
        float wid = h31(vec3(ci, fi, seed * 7.13 + faceId * 3.1));
        float floorLit = step(curtain ? 0.8 : 0.95, h21(vec2(fi, seed * 3.7 + faceId)));
        float lit = max(step(1.0 - litP, wid), floorLit);
        vec3 wc = mix(winPal(h11(wid * 91.7 + seed)), vec3(1.0, 0.8, 0.55), lux * 0.6);
        if (heritage) wc = mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.85, 0.6), h11(wid * 5.1));
        else if (curtain) wc = mix(vec3(0.78, 0.9, 1.0), vec3(1.0, 0.9, 0.75), step(0.8, h11(wid * 5.1)));
        else if (indus) wc = vec3(0.65, 1.0, 0.75);
        else if (capsule) wc = h11(wid * 5.1) > 0.55 ? neonPal(wid * 3.0) : vec3(1.0, 0.75, 0.5);
        float br = 0.18 + 0.75 * pow(h11(wid * 17.3), 1.6) + 0.25 * lux;
        if (indus) br *= 0.6;
        if (h11(wid * 33.1) > 0.965) br *= 0.55 + 0.45 * sin(uTime * (4.0 + 9.0 * wid) + wid * 40.0);
        float gy = (rl - r0 + f.y) / (r1 - r0 + 1.0);
        winEm = wc * br * lit * (0.7 + 0.4 * gy);
        // vitre éteinte : reflet du ciel (bien plus marqué sur le mur-rideau)
        float rk = curtain ? 0.25 + 1.3 * fres : 0.06 + 0.9 * fres;
        winEm += uSkyRefl * rk * (1.0 - lit) * (curtain ? 0.8 + 0.4 * vnoise(vec2(ci * 3.0, fi) + seed) : 1.0);
        albedo = curtain ? vec3(0.02, 0.03, 0.04) : vec3(0.012, 0.014, 0.02);
        wet = 0.85;
      } else if (mull) {
        albedo = vec3(0.16, 0.17, 0.2);
      }
      emission = mix(winEm, avgEm, far * 0.85);
      albedo = mix(albedo, vCol * 0.6, far * 0.5);
    } else {
      vec2 t = floor(cell / 2.0);
      albedo *= 0.8 + 0.25 * h21(t + seed);
    }
  } else if (style < 5.5) {
    float k = 1.0;
    if (extra > 0.5 && extra < 1.5) k = step(0.6, fract(uTime * 0.55 + seed / 255.0));
    else if (extra > 1.5 && extra < 2.5) k = 0.65 + 0.35 * sin(uTime * 2.0 + seed);
    else if (extra > 2.5 && extra < 3.5) { float tt = floor(uTime * 14.0); k = h21(vec2(tt, seed)) > 0.07 ? 1.0 : 0.12; }
    else if (extra > 3.5 && extra < 5.5) {
      // gyrophares : double éclat, rouge et bleu en alternance
      float c = fract(uTime * 1.6 + (extra > 4.5 ? 0.5 : 0.0));
      k = (c < 0.12 || (c > 0.2 && c < 0.32)) ? 1.0 : 0.04;
    } else if (extra > 5.5 && extra < 11.5) {
      // feux tricolores synchronisés avec le trafic au sol
      float ax = extra > 8.5 ? 1.0 : 0.0;
      float lamp = extra - 6.0 - ax * 3.0; // 0 rouge · 1 orange · 2 vert
      float t2 = mod(uTime + ax * ${(CYCLE / 2).toFixed(1)}, ${CYCLE.toFixed(1)});
      float state = t2 < ${GREEN.toFixed(1)} ? 2.0 : (t2 < ${(CYCLE / 2).toFixed(1)} ? 1.0 : 0.0);
      k = abs(state - lamp) < 0.5 ? 1.0 : 0.05;
    } else if (extra > 11.5 && extra < 15.5) {
      // feux piétons (12/13 : traversée le long de x · 14/15 : le long de z ; pair = bonhomme vert)
      float ax = extra > 13.5 ? 1.0 : 0.0;
      float walkLamp = 1.0 - (extra - 12.0 - ax * 2.0);
      float t2 = mod(uTime - ax * ${(CYCLE / 2).toFixed(1)}, ${CYCLE.toFixed(1)});
      float go = step(0.5, t2) * step(t2, 8.5);
      float blink = step(8.5, t2) * step(t2, 11.0);
      float on = walkLamp > 0.5 ? max(go, blink * step(0.5, fract(uTime * 2.0))) : 1.0 - max(go, blink);
      k = on > 0.5 ? 1.0 : 0.06;
    }
    emission = vCol * emis * k;
    albedo = vCol * 0.1;
    puddles = false;
  } else if (style < 6.5) {
    // Enseigne à glyphes pseudo-kanji
    puddles = false;
    bool vert = fs.y >= fs.x;
    vec2 g = vert ? cell : cell.yx;
    vec2 gs = vert ? fs : fs.yx;
    g.y = gs.y - 1.0 - g.y;
    bool border = cell.x < 1.0 || cell.y < 1.0 || cell.x > fs.x - 2.0 || cell.y > fs.y - 2.0;
    vec3 c1 = vCol;
    vec3 c2 = neonPal(seed / 255.0 * 3.0 + 0.37);
    float k = 1.0;
    if (h11(seed * 0.71) > 0.82) k = h21(vec2(floor(uTime * 11.0), seed)) > 0.1 ? 1.0 : 0.15;
    float nA = floor((gs.x - 1.0) / 5.0);
    float nL = floor((gs.y - 1.0) / 5.0);
    float offA = 1.0 + floor(((gs.x - 2.0) - (5.0 * nA - 1.0)) * 0.5);
    float offL = 1.0 + floor(((gs.y - 2.0) - (5.0 * nL - 1.0)) * 0.5);
    vec2 q = g - vec2(offA, offL);
    vec2 gi = floor(q / 5.0);
    vec2 gp = q - gi * 5.0;
    bool inG = gp.x < 3.5 && gp.y < 3.5 && gi.x >= 0.0 && gi.x < nA && gi.y >= 0.0 && gi.y < nL;
    float on = inG ? glyphPx(gi, gp, seed * 3.17) : 0.0;
    // révélation séquentielle des glyphes pour certaines enseignes
    if (extra > 1.5 && extra < 2.5) {
      float n = max(nL, 1.0);
      float cyc = mod(uTime * 1.2 + seed, n + 3.0);
      on *= step(gi.y, cyc);
    }
    albedo = vec3(0.025, 0.02, 0.03);
    if (border) {
      float m = 1.0;
      if (extra > 0.5 && extra < 1.5) m = 0.3 + 0.7 * step(0.5, fract((cell.x + cell.y) * 0.25 - uTime * 1.6));
      emission = c2 * emis * 0.6 * m * k;
    } else {
      emission = c1 * emis * on * k + c1 * emis * 0.04;
    }
    emission = mix(emission, c1 * emis * 0.3 * k, far * 0.7);
  } else if (style < 7.5) {
    // Écran géant animé (pixels = voxels)
    puddles = false;
    if (fs.x < 3.0 || fs.y < 3.0 || abs(N.y) > 0.5) {
      albedo = vec3(0.03);
    } else {
      vec2 p = (cell + 0.5) / fs;
      float t = uTime;
      float mode = mod(seed, 4.0);
      float gl = step(0.94, h21(vec2(floor(t * 3.0), seed)));
      p.x += gl * (h21(vec2(cell.y, floor(t * 20.0))) - 0.5) * 0.12;
      vec3 col;
      if (mode < 1.0) {
        float v = sin(p.x * 9.0 + t) + sin(p.y * 7.0 - t * 1.3) + sin((p.x + p.y) * 6.0 + t * 0.7) + sin(length(p - 0.5) * 12.0 - t * 2.0);
        col = neonPal(v * 0.1 + t * 0.03 + seed * 0.01) * (0.55 + 0.45 * sin(v * 2.0));
      } else if (mode < 2.0) {
        float sc = max(1.0, floor(fs.y / 7.0));
        vec2 q = floor(cell / sc);
        q.x += floor(t * 5.0);
        q.y -= 1.0;
        vec2 gi = floor(q / 5.0);
        vec2 gp = q - gi * 5.0;
        float on = (gp.x < 3.5 && gp.y < 3.5 && gi.y > -0.5 && gi.y < 0.5) ? glyphPx(vec2(gi.x, 0.0), gp, seed) : 0.0;
        vec3 base = neonPal(seed * 0.013);
        col = mix(base * 0.12 + neonPal(seed * 0.013 + 0.5) * 0.08 * p.y, neonPal(seed * 0.013 + 0.33), on);
      } else if (mode < 3.0) {
        float d = length((p - 0.5) * vec2(fs.x / fs.y, 1.0));
        float r = fract(d * 3.0 - t * 0.5);
        col = mix(neonPal(seed * 0.02), neonPal(seed * 0.02 + 0.5), step(0.5, r)) * (0.25 + 0.75 * smoothstep(0.7, 1.0, r));
        col += neonPal(seed * 0.02 + 0.2) * step(d, 0.12 + 0.03 * sin(t * 4.0));
      } else {
        float b = floor(p.x * 14.0);
        float hh = 0.15 + 0.8 * abs(sin(t * (1.5 + h11(b + seed)) + b * 1.7));
        col = p.y < hh ? neonPal(p.y * 0.5 + seed * 0.01) : vec3(0.02, 0.01, 0.04);
        col *= step(0.2, fract(p.x * 14.0));
      }
      col *= 0.8 + 0.2 * mod(cell.y, 2.0);
      emission = col * emis;
      albedo = vec3(0.02);
    }
  } else if (style < 8.5) {
    // Dalles de trottoir
    if (N.y > 0.5) {
      vec2 t = floor(cell / 2.0);
      vec2 tf = (uv - t * 2.0) / 2.0;
      float grout = step(0.05, tf.x) * step(0.05, tf.y);
      albedo = vCol * (0.75 + 0.3 * h21(t + seed)) * mix(0.55, 1.0, mix(grout, 1.0, far));
    }
  } else if (style < 9.5) {
    // Devanture éclairée
    puddles = false;
    if (abs(N.y) < 0.5) {
      float mull = step(1.0, mod(cell.x, 5.0)) * step(1.0, cell.y) * step(cell.y, fs.y - 2.0);
      float shop = h21(vec2(floor(cell.x / 5.0), seed));
      vec3 inside = vCol * vCol * (0.4 + 0.6 * shop) * (0.55 + 0.45 * (uv.y / fs.y));
      emission = inside * emis * mull * 0.6;
      albedo = vec3(0.03);
    }
  } else if (style < 10.5) {
    // Feuillage : voxels de tons variés, quelques trous sombres, reflets mouillés
    puddles = false;
    float hv = h31(vec3(cell, seed + faceId * 5.0));
    albedo = vCol * mix(0.75 + 0.95 * hv, 1.2, far);
    if (hv < 0.12) albedo *= 0.35;
    if (N.y > 0.5) albedo *= 1.15;
    wet = 0.45;
  } else if (style < 11.5) {
    // Eau de piscine : caustiques pixelisées lumineuses
    puddles = false;
    vec2 wq = floor(vWP.xz / 0.25) * 0.25;
    float c = sin(wq.x * 1.7 + uTime * 1.1) * sin(wq.y * 2.1 - uTime * 0.9) + sin((wq.x + wq.y) * 1.3 + uTime * 1.5);
    float caus = pow(abs(c) * 0.5, 0.8);
    emission = vCol * emis * (0.25 + 0.75 * caus) + vec3(0.5, 0.9, 1.0) * emis * 0.5 * smoothstep(0.75, 1.0, caus) + uSkyRefl * fres * 0.6;
    albedo = vCol * 0.1;
    wet = 1.0;
  } else if (style > 16.5 && style < 17.5) {
    // Rayonnages de livres : une tablette par voxel, dos de 7 cm aux couleurs et hauteurs variées
    puddles = false;
    albedo = vec3(0.2, 0.12, 0.07);
    if (abs(N.y) < 0.5) {
      float row = floor(uv.y);
      float fy = fract(uv.y);
      float bx = uv.x * 7.0;
      float bi = floor(bx);
      float hb = h21(vec2(bi, row * 7.1 + seed * 3.1));
      float bh = 0.55 + 0.33 * hb;
      bool board = fy < 0.1;
      bool book = !board && fy < 0.1 + bh * 0.88 && fract(bx) > 0.1 && h21(vec2(bi * 1.7, row + 0.3)) > 0.06;
      vec3 bc = mix(vec3(0.45, 0.1, 0.07), vec3(0.08, 0.16, 0.32), step(0.5, hb));
      bc = mix(bc, vec3(0.5, 0.4, 0.18), step(0.8, fract(hb * 7.3)));
      bc = mix(bc, vec3(0.1, 0.26, 0.13), step(0.86, fract(hb * 13.7)));
      albedo = board ? vec3(0.24, 0.15, 0.08) : book ? bc * (0.7 + 0.5 * h11(bi * 3.3 + row)) : vec3(0.02, 0.014, 0.01);
      if (book && abs(fy - 0.1 - bh * 0.45) < 0.035 && h11(bi * 9.1 + row) > 0.45) albedo = vec3(0.62, 0.46, 0.14);
      albedo = mix(albedo, vec3(0.16, 0.1, 0.07), smoothstep(0.1, 0.4, px));
    }
  } else if (style > 17.5 && style < 18.5) {
    // Grillage en losanges (découpé) ; au loin, tramé à 50 %
    puddles = false;
    vec2 gq = uv * 0.5;
    vec2 dg = vec2(gq.x + gq.y, gq.x - gq.y) / 0.16;
    vec2 gw = fwidth(dg);
    if (max(gw.x, gw.y) < 0.45) {
      vec2 fd = abs(fract(dg) - 0.5);
      if (max(fd.x, fd.y) < 0.5 - max(0.07, max(gw.x, gw.y) * 0.6)) discard;
    } else if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    albedo = vCol * 0.9;
    wet = 0.5;
  } else {
    // Platelage bois
    if (N.y > 0.5) {
      vec2 w = vWP.xz / 0.5;
      float row = floor(w.y);
      float plank = floor((w.x + h11(row) * 6.0) / 6.0);
      albedo = vec3(0.3, 0.19, 0.11) * (0.75 + 0.4 * h21(vec2(row, plank))) * mix(0.7, 1.0, smoothstep(0.0, 0.08, fract(w.y)));
      wet = 0.7;
    }
  }

  // --- Ambiance selon l'altitude --------------------------------------------
  bool mineral = style < 4.5 || (style > 7.5 && style < 8.5) || (style > 12.5 && style < 16.5);
  if (style < 0.5 && abs(extra - 9.0) < 0.5) mineral = false; // surfaces "propres" (sanctuaire)
  if (mineral && abs(N.y) < 0.5) {
    // crasse et coulures près du sol (et dans les sous-sols), propreté en hauteur
    float gh = 1.0 - smoothstep(3.0, 30.0, vWP.y);
    vec2 tq = vec2(dot(vWP.xz, vec2(-N.z, N.x)), vWP.y);
    float dirt = gh * (0.35 + 0.6 * vnoise(tq * vec2(0.6, 0.15)));
    float drip = smoothstep(0.55, 0.85, vnoise(vec2(tq.x * 3.0, tq.y * 0.25))) * (1.0 - smoothstep(10.0, 60.0, vWP.y));
    albedo *= 1.0 - dirt * 0.55 - drip * 0.3;
    albedo = mix(albedo, albedo * vec3(0.85, 0.78, 0.62), dirt);
    // graffitis pixelisés au pied des murs (rue et sous-sols)
    bool band = (vWP.y > 0.9 && vWP.y < 3.2) || (vWP.y > -5.6 && vWP.y < -3.3);
    if (band && far < 0.5) {
      vec2 gq = floor(tq / 0.25) * 0.25;
      float zone = h21(floor(gq / vec2(9.0, 40.0)) + 3.7);
      if (zone > 0.45) {
        float g = vnoise(gq * vec2(0.9, 1.3) + zone * 13.0) * 0.65 + vnoise(gq * 2.6) * 0.35;
        vec3 paint = neonPal(h21(floor(gq / 5.0)) * 2.0 + zone);
        if (g > 0.6) albedo = mix(albedo, paint * 0.55, 0.85);
        else if (g > 0.56) albedo = vec3(0.02);
      }
      // affiches collées, à moitié arrachées
      vec2 pc = floor(tq / vec2(1.3, 1.9));
      float pz = h21(pc + vec2(71.3, seed));
      if (pz > 0.83 && vWP.y > 1.0 && vWP.y < 3.0) {
        vec2 pf = fract(tq / vec2(1.3, 1.9));
        vec2 m = abs(pf - 0.5);
        float torn = vnoise(tq * 7.0 + pz * 40.0);
        if (m.x < 0.4 && m.y < 0.42 && torn > 0.28 + 0.5 * smoothstep(0.1, 0.42, m.y) * step(0.5, h11(pz * 9.0))) {
          vec3 pap = mix(vec3(0.75, 0.7, 0.6), neonPal(pz * 5.0) * 0.8, step(0.5, h11(pz * 3.0)));
          float print = step(0.5, vnoise(floor(tq / 0.12) * 0.9 + pz * 13.0));
          albedo = pap * (0.35 + 0.25 * print) * (0.8 + 0.3 * torn);
        }
      }
    }
  }
  // ombre de contact au pied des surfaces verticales
  if (abs(N.y) < 0.5 && (style < 4.5 || (style > 7.5 && style < 8.5) || style > 9.5)) {
    albedo *= mix(0.45, 1.0, smoothstep(0.0, 2.6, uv.y));
  }
  if (facade && N.y > 0.5 && vWP.y > ${LUX_Y.toFixed(1)}) {
    // toits et terrasses de luxe : platelage bois
    vec2 w = vWP.xz / 0.5;
    float row = floor(w.y);
    float plank = floor((w.x + h11(row) * 6.0) / 6.0);
    albedo = vec3(0.3, 0.19, 0.11) * (0.75 + 0.4 * h21(vec2(row, plank))) * mix(0.7, 1.0, smoothstep(0.0, 0.08, fract(w.y)));
    wet = 0.7;
  }

  if (puddles && N.y > 0.5) {
    float pud = smoothstep(0.52, 0.66, vnoise(vWP.xz * 0.18) * 0.7 + vnoise(vWP.xz * 0.6) * 0.3);
    wet = mix(wet, 1.0, pud);
    albedo *= 1.0 - 0.55 * pud;
    emission += uSkyRefl * (0.04 + 0.6 * fres) * wet * 0.5;
  }

  vec3 diff, spec;
  shade(vWP, N, V, wet, diff, spec);
  vec3 col = albedo * diff + spec * (1.0 - far * 0.5) + emission;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

const GLASS_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWP;
varying vec3 vN;
varying vec3 vCol;
varying vec4 vPar;
varying vec4 vFace;
#include <fog_pars_fragment>
${GLSL_COMMON}
uniform vec3 uSkyRefl;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  vec2 uv = vFace.xy; vec2 fs = vFace.zw;
  vec2 fw = fwidth(uv) * 1.5 + 0.02;
  float bx = 1.0 - smoothstep(0.0, fw.x + 0.15, min(uv.x, fs.x - uv.x));
  float by = 1.0 - smoothstep(0.0, fw.y + 0.15, min(uv.y, fs.y - uv.y));
  float border = max(bx, by);
  // coulures de pluie sur la vitre
  float col_ = floor(vWP.x * 7.0 + vWP.z * 7.0);
  float streak = step(0.93, h11(col_)) * step(0.7, fract(vWP.y * 0.3 + uTime * (0.4 + h11(col_ * 3.1)) ));
  vec3 c = vCol * 0.06 + uSkyRefl * (0.25 + fres * 1.4) + vCol * border * 1.6 + vec3(0.25, 0.3, 0.4) * streak * 0.3;
  float a = 0.1 + 0.55 * fres + border * 0.6 + streak * 0.15;
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.9));
  #include <fog_fragment>
}
`;

function makeUniforms() {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...shared,
  };
}

export function createVoxelMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: 'voxel',
    uniforms: makeUniforms(),
    vertexShader: VOXEL_VERT,
    fragmentShader: VOXEL_FRAG,
    fog: true,
  });
  return m;
}

/** Variante animée pour les passants (membres articulés dans le vertex shader). */
export function createPedMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'ped',
    uniforms: makeUniforms(),
    vertexShader: VOXEL_VERT,
    fragmentShader: VOXEL_FRAG,
    defines: { PED: '' },
    fog: true,
  });
}

export function createGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'glass',
    uniforms: makeUniforms(),
    vertexShader: VOXEL_VERT,
    fragmentShader: GLASS_FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}
