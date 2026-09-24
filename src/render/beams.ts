import * as THREE from 'three';
import type { Cone } from '../world/builder';
import { GLSL_COMMON, shared } from './materials';

const VERT = /* glsl */ `
attribute float aFlick;
varying float vT;
varying vec3 vN;
varying vec3 vWP;
varying vec3 vC;
varying float vFlick;
varying float vDepth;
void main(){
  vT = -position.y;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vWP = wp.xyz;
  vC = instanceColor;
  vFlick = aFlick;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uFog;
varying float vT;
varying vec3 vN;
varying vec3 vWP;
varying vec3 vC;
varying float vFlick;
varying float vDepth;
${GLSL_COMMON}
void main(){
  vec3 V = normalize(cameraPosition - vWP);
  float edge = pow(abs(dot(normalize(vN), V)), 1.4);
  float along = pow(1.0 - clamp(vT, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vT);
  // gouttes de pluie et poussières qui scintillent dans le faisceau
  float streak = vnoise(vec2((vWP.x + vWP.z) * 2.5, vWP.y * 0.5 + uTime * 9.0));
  float dust = 0.7 + 0.6 * streak * streak;
  float k = 1.0;
  if (vFlick > 0.5) { float tt = floor(uTime * 14.0); k = h21(vec2(tt, vFlick)) > 0.1 ? 1.0 : 0.08; }
  float fog = exp(-uFog * uFog * vDepth * vDepth);
  gl_FragColor = vec4(vC * edge * along * dust * k * fog, 1.0);
}
`;

function coneGeometry() {
  const g = new THREE.CylinderGeometry(0.04, 1, 1, 24, 1, true);
  g.translate(0, -0.5, 0); // sommet en (0,0,0), base en y = -1
  return g;
}

/**
 * Cônes de lumière volumétriques (additifs) : statiques (lampadaires) et
 * dynamiques (projecteurs, drones, dirigeable, phares).
 */
export class Beams {
  group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private dyn: THREE.InstancedMesh;
  private dynFlick: THREE.InstancedBufferAttribute;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private down = new THREE.Vector3(0, -1, 0);

  constructor(cones: Cone[], maxDynamic = 160) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uFog: { value: 0.004 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const geo = coneGeometry();
    // statiques
    const sgeo = geo.clone();
    const flick = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cones.length)), 1);
    sgeo.setAttribute('aFlick', flick);
    const stat = new THREE.InstancedMesh(sgeo, this.mat, Math.max(1, cones.length));
    cones.forEach((k, i) => {
      this.compose(k.x, k.y, k.z, k.dx, k.dy, k.dz, k.len, k.radius);
      stat.setMatrixAt(i, this.m);
      stat.setColorAt(i, this.c.setRGB(k.color[0] * k.intensity, k.color[1] * k.intensity, k.color[2] * k.intensity));
      flick.setX(i, k.flicker ?? 0);
    });
    stat.count = cones.length;
    stat.frustumCulled = false;
    stat.renderOrder = 7;
    this.group.add(stat);
    // dynamiques
    const dgeo = geo.clone();
    this.dynFlick = new THREE.InstancedBufferAttribute(new Float32Array(maxDynamic), 1);
    dgeo.setAttribute('aFlick', this.dynFlick);
    this.dyn = new THREE.InstancedMesh(dgeo, this.mat, maxDynamic);
    this.dyn.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dyn.setColorAt(0, this.c.setRGB(0, 0, 0));
    this.dyn.count = 0;
    this.dyn.frustumCulled = false;
    this.dyn.renderOrder = 7;
    this.group.add(this.dyn);
  }

  private compose(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, radius: number) {
    this.v.set(dx, dy, dz).normalize();
    this.q.setFromUnitVectors(this.down, this.v);
    this.m.compose(this.s.set(x, y, z), this.q, new THREE.Vector3(radius, len, radius));
  }

  /** Début de frame : on réécrit les cônes dynamiques. */
  begin(fogDensity: number) {
    this.n = 0;
    this.mat.uniforms.uFog.value = fogDensity;
  }

  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, radius: number, r: number, g: number, b: number) {
    if (this.n >= this.dyn.instanceMatrix.count) return;
    this.compose(x, y, z, dx, dy, dz, len, radius);
    this.dyn.setMatrixAt(this.n, this.m);
    this.dyn.setColorAt(this.n, this.c.setRGB(r, g, b));
    this.n++;
  }

  end() {
    this.dyn.count = this.n;
    this.dyn.instanceMatrix.needsUpdate = true;
    if (this.dyn.instanceColor) this.dyn.instanceColor.needsUpdate = true;
  }
}
