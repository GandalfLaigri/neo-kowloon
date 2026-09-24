import * as THREE from 'three';
import { BLOCKS, CLOUD_Y, HALF, PITCH, STYLE, hex, type RGB } from './config';

const smoothstep01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Beams } from './render/beams';
import { GLSL_COMMON, shared } from './render/materials';
import { skyShared } from './render/sky';
import { RNG } from './rng';
import { Accum, type LightSrc, type Spot } from './world/builder';
import type { Bridge, Lane, Tower } from './world/city';

// ---------------------------------------------------------------------------
// Matériau hologramme : additif, lignes de balayage, scintillement, bords brillants
// ---------------------------------------------------------------------------
function holoMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uFog: { value: 0.004 }, uGain: { value: 0.5 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      varying vec3 vWP;
      varying vec3 vN;
      varying vec3 vCol;
      varying float vDepth;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 n = normal;
        vCol = aColor;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          n = mat3(instanceMatrix) * n;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol *= instanceColor;
        #endif
        vec4 wp = modelMatrix * lp;
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFog;
      uniform float uGain;
      varying vec3 vWP;
      varying vec3 vN;
      varying vec3 vCol;
      varying float vDepth;
      ${GLSL_COMMON}
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        float fres = 1.0 - abs(dot(normalize(vN), V));
        float scan = 0.45 + 0.55 * step(0.45, fract(vWP.y * 2.2 - uTime * 1.3));
        float band = 1.0 + 0.8 * smoothstep(0.03, 0.0, abs(fract(vWP.y * 0.04 - uTime * 0.25) - 0.5));
        float fl = h21(vec2(floor(uTime * 18.0), 3.0)) > 0.04 ? 1.0 : 0.3;
        float fog = exp(-uFog * uFog * vDepth * vDepth);
        vec3 c = vCol * uGain * scan * band * fl * (0.5 + 0.8 * fres) * fog;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Visage de geisha en pixel art (24 × 30) : H cheveux, s peau, e yeux, r lèvres, o or, p kimono
const FACE = [
  '........HHHHHHHH........',
  '.....HHHHHHHHHHHHHH.....',
  '...pHHHHHHHHHHHHHHHHo...',
  '..ppHHHHHHHHHHHHHHHHoo..',
  '..pHHHHHHHHHHHHHHHHHHo..',
  '.HHHHHHHHHHHHHHHHHHHHHH.',
  '.HHHHHHssssssssssHHHHHH.',
  'HHHHssssssssssssssssHHHH',
  'HHHHssssssssssssssssHHHH',
  'HHHsHHHHssssssssHHHHsHHH',
  'HHHssssssssssssssssssHHH',
  'HHHsseeesssssssseeessHHH',
  'HHHsseeesssssssseeessHHH',
  'HHHssssssssssssssssssHHH',
  'HHHssssssssssssssssssHHH',
  '.HHHssssssssssssssssHHH.',
  '.HHHssssssssssssssssHHH.',
  '.HHHssssssrrrrssssssHHH.',
  '..HHsssssrrrrrrsssssHH..',
  '..HHssssssrrrrssssssHH..',
  '...HssssssssssssssssH...',
  '....ssssssssssssssss....',
  '.....ssssssssssssss.....',
  '......ssssssssssss......',
  '........ssssssss........',
  '.........ssssss.........',
  '.........ssssss.........',
  '......oooooooooooo......',
  '....pppppppppppppppp....',
  '..pppppppppppppppppppp..',
];
const FACE_COLS: Record<string, RGB> = {
  H: hex(0x6a3aff), s: hex(0xffd0e4), e: hex(0x40ffff), r: hex(0xff2050), o: hex(0xffc040), p: hex(0xff60c0),
};

function faceGeometry(px: number) {
  const a = new Accum();
  const H = FACE.length, W = FACE[0].length;
  FACE.forEach((row, j) => {
    for (let i = 0; i < W; i++) {
      const c = FACE_COLS[row[i]];
      if (!c) continue;
      const x = (i - W / 2) * px, y = (H - 1 - j) * px;
      const d = row[i] === 's' ? px * 0.6 : px * 0.35;
      a.addBox(x, y, -d, x + px * 0.92, y + px * 0.92, d, c, STYLE.SOLID, 0, 0, 0);
    }
  });
  return a.build();
}

function logoGeometry(size: number, shape: number, col: RGB) {
  const a = new Accum();
  const t = size * 0.08;
  if (shape === 0) {
    // pyramide filaire
    const h = size * 1.4;
    const base: [number, number][] = [[-size, -size], [size, -size], [size, size], [-size, size]];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = base[i], [x1, z1] = base[(i + 1) % 4];
      a.addBox(Math.min(x0, x1) - t, -t, Math.min(z0, z1) - t, Math.max(x0, x1) + t, t, Math.max(z0, z1) + t, col, STYLE.SOLID, 0, 0, 0);
      // arêtes vers le sommet (en marches voxel)
      for (let k = 0; k < 10; k++) {
        const u = k / 10;
        a.addBox(x0 * (1 - u) - t, h * u - t, z0 * (1 - u) - t, x0 * (1 - u) + t, h * u + t + h / 10, z0 * (1 - u) + t, col, STYLE.SOLID, 0, 0, 0);
      }
    }
  } else {
    // anneau de blocs-glyphes
    for (let k = 0; k < 20; k++) {
      const ang = (k / 20) * Math.PI * 2;
      const x = Math.cos(ang) * size, z = Math.sin(ang) * size;
      const s = size * 0.12 * (k % 3 === 0 ? 1.4 : 1);
      a.addBox(x - s, -s * 1.6, z - s, x + s, s * 1.6, z + s, col, STYLE.SOLID, 0, 0, 0);
    }
    a.addBox(-size * 0.25, -size * 0.25, -size * 0.25, size * 0.25, size * 0.25, size * 0.25, col, STYLE.SOLID, 0, 0, 0);
  }
  return a.build();
}

function blimpGeometry() {
  const o = new Accum();
  const hull = hex(0x2a2c34), dk = hex(0x16171c);
  const L = 36, R = 11;
  for (let x = -L; x < L; x += 2.5) {
    const xm = x + 1.25;
    const r = R * Math.sqrt(Math.max(0.05, 1 - (xm / (L + 1)) ** 2));
    o.addBox(x, -r, -r * 0.7, x + 2.5, r, r * 0.7, hull, STYLE.SOLID, 40 + (x & 7), 0, 0);
    o.addBox(x, -r * 0.7, -r, x + 2.5, r * 0.7, r, hull, STYLE.SOLID, 41, 0, 0);
  }
  // écrans latéraux
  o.addBox(-20, -5.5, R + 0.05, 14, 5.5, R + 0.45, hex(0x111111), STYLE.SCREEN, 77, 2.4, 0);
  o.addBox(-20, -5.5, -R - 0.45, 14, 5.5, -R - 0.05, hex(0x111111), STYLE.SCREEN, 150, 2.4, 0);
  // nacelle
  o.addBox(-7, -R - 3.5, -3, 7, -R + 0.5, 3, dk, STYLE.SOLID, 42, 0, 0);
  o.addBox(-6.5, -R - 3, -3.05, 6.5, -R - 1.5, 3.05, hex(0xffc58a), STYLE.SHOP, 43, 1.4, 0);
  // empennage
  o.addBox(-L + 1, 3, -0.4, -L + 9, 15, 0.4, hull, STYLE.SOLID, 44, 0, 0);
  o.addBox(-L + 1, -0.4, 3, -L + 9, 0.4, 12, hull, STYLE.SOLID, 45, 0, 0);
  o.addBox(-L + 1, -0.4, -12, -L + 9, 0.4, -3, hull, STYLE.SOLID, 46, 0, 0);
  // feux de navigation
  o.addBox(-L + 1, -0.6, 11.6, -L + 2, 0.6, 12.4, hex(0x2aff5a), STYLE.EMISSIVE, 7, 6, 1);
  o.addBox(-L + 1, -0.6, -12.4, -L + 2, 0.6, -11.6, hex(0xff2a2a), STYLE.EMISSIVE, 99, 6, 1);
  o.addBox(-L + 4, 15, -0.5, -L + 5, 16, 0.5, hex(0xffffff), STYLE.EMISSIVE, 180, 7, 1);
  o.addBox(L - 2, -1, -1, L, 1, 1, hex(0xffffff), STYLE.EMISSIVE, 30, 5, 0);
  // liseré néon
  o.addBox(-L + 6, -0.3, R * 0.7 + 0.02, L - 6, 0.3, R * 0.7 + 0.3, hex(0xff2a9d), STYLE.EMISSIVE, 0, 3, 2);
  o.addBox(-L + 6, -0.3, -R * 0.7 - 0.3, L - 6, 0.3, -R * 0.7 - 0.02, hex(0x00e5ff), STYLE.EMISSIVE, 0, 3, 2);
  return o.build();
}

/** Flèche de grue (origine : sommet du mât ; avant = +x). */
function craneJib(L: number): THREE.BufferGeometry {
  const a = new Accum();
  const y = hex(0xc8a020), dk = hex(0x2a2c30), red = hex(0xff2020);
  a.addBox(-1.2, 0, -1.2, 1.2, 1.4, 1.2, y, STYLE.SOLID, 1, 0, 0);
  a.addBox(1.2, 1.2, -0.7, L, 2.5, 0.7, y, STYLE.FENCE, 2, 0, 0);
  a.addBox(-10, 1.2, -0.9, -1.2, 2.2, 0.9, y, STYLE.FENCE, 3, 0, 0);
  a.addBox(-10, 0.1, -1.1, -7.5, 2.1, 1.1, hex(0x6a6a66), STYLE.SOLID, 4, 0, 0);
  a.addBox(-0.4, 1.4, -0.4, 0.4, 7.5, 0.4, y, STYLE.FENCE, 5, 0, 0);
  a.addBox(1.0, -0.4, 1.0, 2.8, 1.4, 2.6, hex(0x8a8a86), STYLE.SOLID, 6, 0, 0);
  a.addBox(2.8, 0.2, 1.2, 2.85, 1.2, 2.4, hex(0xbfe0ff), STYLE.EMISSIVE, 0, 0.8, 0);
  // haubans en escalier vers la pointe et la contre-flèche
  for (let k = 0; k < 8; k++) {
    const u = k / 8;
    a.addBox(0.4 + u * (L * 0.7), 7.3 - u * 4.8, -0.05, 0.4 + (u + 1 / 8) * (L * 0.7), 7.4 - u * 4.8, 0.05, dk, STYLE.SOLID, 0, 0, 0);
    a.addBox(-0.4 - (u + 1 / 8) * 9, 7.3 - u * 5.1, -0.05, -0.4 - u * 9, 7.4 - u * 5.1, 0.05, dk, STYLE.SOLID, 0, 0, 0);
  }
  const tx = L * 0.62, hook = 22;
  a.addBox(tx - 0.6, 0.8, -0.8, tx + 0.6, 1.2, 0.8, dk, STYLE.SOLID, 0, 0, 0);
  a.addBox(tx - 0.03, -hook, -0.03, tx + 0.03, 0.8, 0.03, dk, STYLE.SOLID, 0, 0, 0);
  a.addBox(tx - 0.35, -hook - 0.7, -0.35, tx + 0.35, -hook, 0.35, y, STYLE.SOLID, 7, 0, 0);
  a.addBox(L - 0.4, 2.5, -0.25, L, 2.9, 0.25, red, STYLE.EMISSIVE, 11, 6, 1);
  a.addBox(-10, 2.2, -0.25, -9.6, 2.6, 0.25, red, STYLE.EMISSIVE, 37, 6, 1);
  a.addBox(-0.3, 7.5, -0.3, 0.3, 7.9, 0.3, red, STYLE.EMISSIVE, 73, 6, 1);
  return a.build();
}

// ---------------------------------------------------------------------------
interface Koi { spot: Spot; k: number; phase: number; radius: number; dy: number; speed: number; base: number }

export class Spectacle {
  group = new THREE.Group();
  lights: LightSrc[] = [];
  /** Appelé à chaque coup de foudre (distance au joueur en mètres). */
  onThunder: ((dist: number) => void) | null = null;
  /** Intensité de la pluie (modulée par l'orage). */
  rain = 1;

  private holo = holoMaterial();
  get blimpPosition() { return this.blimp.position; }
  setResolution(w: number, h: number) { this.boltMat.resolution.set(w, h); }
  private kois: Koi[] = [];
  private koiMesh: THREE.InstancedMesh;
  private faces: { mesh: THREE.Mesh; spot: Spot }[] = [];
  private logos: { mesh: THREE.Mesh; spot: Spot }[] = [];
  private blimp: THREE.Mesh;
  /** Le dirigeable remonte une avenue entre les tours, puis fait demi-tour hors du quartier. */
  route = { axis: 0 as 0 | 1, c: 0, y: 180, L: HALF + 150 };
  private blimpLights: LightSrc[] = [];
  private cranes: { mesh: THREE.Mesh; spot: Spot }[] = [];
  private flares: { spot: Spot; light: LightSrc }[] = [];
  private searches: Spot[];
  private rng: RNG;
  // orage
  private nextStrike = 6;
  private strike = -10;
  private strikePulses: number[] = [];
  private bolt: LineSegments2;
  private boltMat: LineMaterial;
  private rods: [number, number, number][] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(spots: Spot[], towers: Tower[], bridges: Bridge[], lanes: Lane[], voxelMat: THREE.Material, seed: number) {
    this.rng = new RNG(seed ^ 0x7f4a7c15);
    const rng = this.rng;
    // --- Carpes koï (instances de cubes) ---
    const unit = new Accum();
    unit.addBox(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1], STYLE.SOLID, 0, 0, 0);
    const koiSpots = spots.filter((s) => s.kind === 'koi');
    for (const sp of koiSpots)
      for (let k = 0; k < 3; k++)
        this.kois.push({ spot: sp, k, phase: rng.next() * Math.PI * 2, radius: sp.a * rng.range(0.6, 1), dy: rng.range(-4, 4), speed: rng.range(0.12, 0.2) * (rng.chance(0.5) ? 1 : -1), base: this.kois.length * 16 });
    this.koiMesh = new THREE.InstancedMesh(unit.build(), this.holo, Math.max(1, this.kois.length * 16));
    this.koiMesh.frustumCulled = false;
    this.koiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const koiCols = [hex(0xffffff), hex(0xff7a20), hex(0xff2a2a), hex(0xffe0c0)];
    for (const k of this.kois)
      for (let i = 0; i < 16; i++) {
        const c = i >= 12 ? hex(0xff9a50) : rng.pick(koiCols);
        this.koiMesh.setColorAt(k.base + i, this.c.setRGB(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6));
      }
    this.koiMesh.count = this.kois.length * 16;
    this.koiMesh.renderOrder = 8;
    this.group.add(this.koiMesh);
    for (const sp of koiSpots) this.lights.push({ x: sp.x, y: sp.y, z: sp.z, r: 0.9, g: 0.45, b: 0.3, radius: 30 });

    // --- Visages ---
    for (const sp of spots.filter((s) => s.kind === 'face')) {
      const mesh = new THREE.Mesh(faceGeometry(sp.a), this.holo);
      mesh.position.set(sp.x, sp.y, sp.z);
      mesh.renderOrder = 8;
      mesh.frustumCulled = false;
      this.faces.push({ mesh, spot: sp });
      this.group.add(mesh);
      this.lights.push({ x: sp.x, y: sp.y + 8, z: sp.z, r: 1.0, g: 0.5, b: 1.1, radius: 40 });
    }
    // --- Logos ---
    for (const sp of spots.filter((s) => s.kind === 'logo')) {
      const mesh = new THREE.Mesh(logoGeometry(sp.a, sp.b, sp.color), this.holo);
      mesh.position.set(sp.x, sp.y, sp.z);
      mesh.renderOrder = 8;
      this.logos.push({ mesh, spot: sp });
      this.group.add(mesh);
    }

    // --- Dirigeable : route circulaire validée contre les tours ---
    this.blimp = new THREE.Mesh(blimpGeometry(), voxelMat);
    this.group.add(this.blimp);
    // avenue sans passerelle à l'altitude choisie, loin des couloirs de trafic aérien
    const cands: { axis: 0 | 1; c: number; y: number; score: number }[] = [];
    for (const axis of [0, 1] as const)
      for (let i = 2; i <= BLOCKS - 2; i++) {
        const c = -HALF + i * PITCH;
        for (let y = 150; y <= 240; y += 6) {
          const clash = bridges.some((b) => (axis === 0 ? b.z0 < c + 16 && b.z1 > c - 16 : b.x0 < c + 16 && b.x1 > c - 16) && Math.abs(b.y - y) < 20);
          const lane = lanes.some((l) => l.axis === axis && Math.abs(l.coord - c) < 8 && Math.abs(l.y - y) < 14);
          if (!clash && !lane) cands.push({ axis, c, y, score: Math.abs(c) + Math.abs(y - 190) * 2 + this.rng.next() * 60 });
        }
      }
    cands.sort((a, b) => a.score - b.score);
    if (cands.length) this.route = { axis: cands[0].axis, c: cands[0].c, y: cands[0].y, L: HALF + 150 };
    for (let i = 0; i < 2; i++) this.blimpLights.push({ x: 0, y: -9999, z: 0, r: 1.2, g: 0.35, b: 0.9, radius: 70 });
    for (let i = 0; i < 2; i++) this.blimpLights.push({ x: 0, y: -9999, z: 0, r: 1.0, g: 1.05, b: 1.2, radius: 26 });
    this.lights.push(...this.blimpLights);

    // --- Grue du chantier abandonné, torchères de l'arcologie ---
    for (const sp of spots.filter((s) => s.kind === 'crane')) {
      const mesh = new THREE.Mesh(craneJib(sp.a), voxelMat);
      mesh.position.set(sp.x, sp.y, sp.z);
      this.cranes.push({ mesh, spot: sp });
      this.group.add(mesh);
    }
    for (const sp of spots.filter((s) => s.kind === 'flare')) {
      const light: LightSrc = { x: sp.x, y: sp.y + 4, z: sp.z, r: 0, g: 0, b: 0, radius: 55 };
      this.flares.push({ spot: sp, light });
      this.lights.push(light);
    }

    // --- Projecteurs, paratonnerres ---
    this.searches = spots.filter((s) => s.kind === 'search');
    this.rods = towers.filter((t) => t.H > 300).map((t) => {
      const top = t.segs[t.segs.length - 1];
      return [(top.x0 + top.x1) / 2, t.H + (t.H > 400 ? 60 : 10), (top.z0 + top.z1) / 2] as [number, number, number];
    });

    // --- Éclair (ligne brisée HDR) ---
    this.boltMat = new LineMaterial({ color: 0xffffff, linewidth: 3.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
    this.boltMat.color.setRGB(5, 5.4, 8);
    this.boltMat.toneMapped = false;
    this.bolt = new LineSegments2(new LineSegmentsGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.group.add(this.bolt);
  }

  private buildBolt(x0: number, z0: number, x1: number, y1: number, z1: number) {
    const rng = this.rng;
    const pts: number[] = [];
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, depth: number, n: number) => {
      let px = ax, py = ay, pz = az;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const jit = (1 - u) * 18 * (depth ? 0.6 : 1);
        const x = ax + (bx - ax) * u + (i < n ? rng.range(-jit, jit) : 0);
        const y = ay + (by - ay) * u;
        const z = az + (bz - az) * u + (i < n ? rng.range(-jit, jit) : 0);
        pts.push(px, py, pz, x, y, z);
        if (depth < 1 && rng.chance(0.18)) seg(x, y, z, x + rng.range(-60, 60), y - rng.range(30, 90), z + rng.range(-60, 60), depth + 1, 6);
        px = x; py = y; pz = z;
      }
    };
    seg(x0, CLOUD_Y + 5, z0, x1, y1, z1, 0, 22);
    this.bolt.geometry.dispose();
    const g = new LineSegmentsGeometry();
    g.setPositions(pts);
    this.bolt.geometry = g;
  }

  update(dt: number, t: number, cam: THREE.Vector3, beams: Beams, fogDensity: number, stormOn: boolean) {
    this.holo.uniforms.uFog.value = fogDensity;
    // ---- Carpes ----
    for (const k of this.kois) {
      const sp = k.spot;
      const head = k.phase + t * k.speed;
      const R = k.radius;
      const bob = Math.sin(t * 0.6 + k.phase) * 2 + k.dy;
      const segLen = 1.05, n = 12;
      for (let i = 0; i < 16; i++) {
        const si = Math.min(i, n - 1);
        const ang = head - Math.sign(k.speed) * (si * segLen) / R;
        const wig = Math.sin(t * 4 - si * 0.6) * 0.45 * (si / n);
        const rr = R + wig;
        const x = sp.x + Math.cos(ang) * rr, z = sp.z + Math.sin(ang) * rr;
        const y = sp.y + bob + Math.sin(t * 1.3 - si * 0.4) * 0.3;
        const tx = -Math.sin(ang) * Math.sign(k.speed), tz = Math.cos(ang) * Math.sign(k.speed);
        const yaw = Math.atan2(tx, tz);
        const prof = Math.pow(Math.sin(Math.PI * (si + 0.8) / (n + 0.6)), 0.7);
        if (i < n) {
          this.e.set(0, yaw, 0);
          this.s.set(1.9 * prof + 0.2, 1.3 * prof + 0.15, 1.2);
          this.p.set(x, y, z);
        } else if (i < 14) {
          // nageoires pectorales
          const side = i === 12 ? 1 : -1;
          const nx = Math.cos(yaw) * side, nz = -Math.sin(yaw) * side;
          const hx = sp.x + Math.cos(head - Math.sign(k.speed) * 2.2 / R) * R, hz = sp.z + Math.sin(head - Math.sign(k.speed) * 2.2 / R) * R;
          this.p.set(hx + nx * 1.4, y - 0.3, hz + nz * 1.4);
          this.e.set(0, yaw, side * (0.4 + 0.3 * Math.sin(t * 3 + k.phase)));
          this.s.set(1.2, 0.12, 0.9);
        } else {
          // queue
          const side = i === 14 ? 1 : -1;
          const tail = head - Math.sign(k.speed) * (n * segLen + 0.6) / R;
          const hx = sp.x + Math.cos(tail) * R, hz = sp.z + Math.sin(tail) * R;
          this.p.set(hx, y + side * 0.55, hz);
          this.e.set(side * 0.5, yaw + Math.sin(t * 4 - 7) * 0.4, 0);
          this.s.set(0.15, 1.4, 1.3);
        }
        this.q.setFromEuler(this.e);
        this.m.compose(this.p, this.q, this.s);
        this.koiMesh.setMatrixAt(k.base + i, this.m);
      }
    }
    this.koiMesh.instanceMatrix.needsUpdate = true;
    // ---- Visages : rotation lente, glitch ----
    for (const f of this.faces) {
      const g = Math.sin(t * 13.7 + f.spot.b) > 0.985 ? (Math.random() - 0.5) * 3 : 0;
      f.mesh.rotation.y = t * 0.12 + f.spot.b;
      f.mesh.position.set(f.spot.x + g, f.spot.y + Math.sin(t * 0.5 + f.spot.b) * 1.2, f.spot.z);
    }
    for (const l of this.logos) {
      l.mesh.rotation.set(Math.sin(t * 0.3 + l.spot.a) * 0.25, t * 0.4, 0);
      l.mesh.position.y = l.spot.y + Math.sin(t * 0.8) * 1.5;
    }

    // ---- Dirigeable : aller le long de l'avenue, demi-tour, retour ----
    const r = this.route;
    const v = 7, legT = (2 * r.L) / v, turnT = 24, cyc = 2 * (legT + turnT);
    const u = (t + 40) % cyc;
    let p: number, heading: number;
    if (u < legT) { p = -r.L + v * u; heading = 0; }
    else if (u < legT + turnT) { p = r.L; heading = Math.PI * smoothstep01((u - legT) / turnT); }
    else if (u < 2 * legT + turnT) { p = r.L - v * (u - legT - turnT); heading = Math.PI; }
    else { p = -r.L; heading = Math.PI + Math.PI * smoothstep01((u - 2 * legT - turnT) / turnT); }
    const base = r.axis === 0 ? 0 : -Math.PI / 2; // avant local +x → +p
    const yaw = base + heading;
    const tx = Math.cos(yaw), tz = -Math.sin(yaw);   // direction de marche
    const nx = -tz, nz = tx;                           // flanc
    const bx = r.axis === 0 ? p : r.c, bz = r.axis === 0 ? r.c : p;
    this.blimp.position.set(bx, r.y + Math.sin(t * 0.2) * 2, bz);
    this.blimp.rotation.set(0, yaw, Math.sin(t * 0.3) * 0.02);
    this.blimpLights[0].x = bx + nx * 26; this.blimpLights[0].y = r.y; this.blimpLights[0].z = bz + nz * 26;
    this.blimpLights[1].x = bx - nx * 26; this.blimpLights[1].y = r.y; this.blimpLights[1].z = bz - nz * 26;
    for (let i = 0; i < 2; i++) {
      // deux projecteurs qui balaient l'avenue et les trottoirs
      const sw = Math.sin(t * 0.35 + i * 2.1);
      const dx = tx * 0.3 + nx * sw * 0.08, dz = tz * 0.3 + nz * sw * 0.08;
      const len = r.y - 13;
      const gx = bx + dx * len, gz = bz + dz * len;
      beams.add(bx + tx * (i ? -3 : 3), r.y - 14, bz + tz * (i ? -3 : 3), dx, -1, dz, len * Math.hypot(dx, 1, dz), 12, 0.05, 0.05, 0.06);
      const L = this.blimpLights[2 + i];
      L.x = gx; L.y = 6; L.z = gz;
    }

    // ---- Grue qui oscille au vent ----
    for (const c of this.cranes) {
      const yaw = c.spot.b + 0.32 * Math.sin(t * 0.045 + c.spot.a) + 0.08 * Math.sin(t * 0.17);
      c.mesh.rotation.y = yaw;
      const tx = c.spot.a * 0.62;
      beams.add(c.spot.x + Math.cos(yaw) * tx, c.spot.y + 0.7, c.spot.z - Math.sin(yaw) * tx, 0, -1, 0, 26, 4.5, 0.05, 0.047, 0.035);
    }
    // ---- Torchères : jets de flammes périodiques ----
    for (const f of this.flares) {
      const sp = f.spot;
      const u = (t + sp.b) % sp.a;
      let k = 0;
      if (u < 3.2) k = smoothstep01(u / 0.35) * (1 - smoothstep01((u - 2.4) / 0.8)) * (0.75 + 0.25 * Math.sin(t * 23 + sp.b * 7) * Math.sin(t * 9.1));
      f.light.r = 3.2 * k; f.light.g = 1.3 * k; f.light.b = 0.25 * k;
      if (k > 0.01) {
        const len = 7 + 4 * k + Math.sin(t * 17 + sp.b) * 0.8;
        beams.add(sp.x, sp.y + len, sp.z, Math.sin(t * 3.1) * 0.05, -1, Math.cos(t * 2.7) * 0.05, len, 1.5, 0.9 * k, 0.38 * k, 0.08 * k);
        beams.add(sp.x, sp.y + len * 0.55, sp.z, 0, -1, 0, len * 0.55, 0.7, 0.9 * k, 0.75 * k, 0.4 * k);
      }
    }

    // ---- Projecteurs de toit ----
    const hits = skyShared.uHits.value;
    let h = 0;
    for (const sp of this.searches) {
      const yaw = sp.a + t * sp.b;
      const pitch = 1.0 + 0.35 * Math.sin(t * 0.27 + sp.a);
      const dx = Math.cos(pitch) * Math.cos(yaw), dy = Math.sin(pitch), dz = Math.cos(pitch) * Math.sin(yaw);
      beams.add(sp.x, sp.y, sp.z, dx, dy, dz, 900, 34, sp.color[0] * 0.045, sp.color[1] * 0.045, sp.color[2] * 0.045);
      if (h < 16 && sp.y < CLOUD_Y) {
        const k = (CLOUD_Y - sp.y) / dy;
        hits[h++].set(sp.x + dx * k, sp.z + dz * k, 18 + k * 0.03, 0.35);
      }
    }
    for (; h < 16; h++) hits[h].set(0, 0, 1, 0);

    // ---- Orage ----
    let flash = 0;
    if (stormOn && t > this.nextStrike) {
      this.strike = t;
      this.nextStrike = t + this.rng.range(7, 22);
      this.strikePulses = [0, this.rng.range(0.08, 0.14), this.rng.range(0.22, 0.4)].slice(0, this.rng.int(2, 3));
      // impact : un paratonnerre de mégatour, ou un point au loin
      let x1: number, y1: number, z1: number;
      if (this.rods.length && this.rng.chance(0.6)) [x1, y1, z1] = this.rng.pick(this.rods);
      else {
        const ang = this.rng.range(0, Math.PI * 2), d = this.rng.range(300, 900);
        x1 = cam.x + Math.cos(ang) * d; y1 = 0; z1 = cam.z + Math.sin(ang) * d;
      }
      this.buildBolt(x1 + this.rng.range(-80, 80), z1 + this.rng.range(-80, 80), x1, y1, z1);
      skyShared.uFlashPos.value.set(x1, z1);
      this.rain = Math.min(1.3, this.rain + 0.25);
      const dist = Math.hypot(x1 - cam.x, y1 - cam.y, z1 - cam.z);
      this.onThunder?.(dist);
    }
    const since = t - this.strike;
    for (const p0 of this.strikePulses) {
      const u = since - p0;
      if (u >= 0 && u < 0.35) flash = Math.max(flash, Math.exp(-u * 14) * (p0 === 0 ? 1 : 0.7));
    }
    this.bolt.visible = since < 0.45;
    this.boltMat.opacity = flash > 0.05 ? 1 : 0.25 * Math.max(0, 1 - since / 0.45);
    shared.uFlash.value = flash * 1.4;
    this.rain += (1 - this.rain) * dt * 0.05 + Math.sin(t * 0.05) * 0.0005;
    return flash;
  }
}
