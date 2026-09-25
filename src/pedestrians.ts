import * as THREE from 'three';
import { CLOUD_Y, CYCLE, STYLE, hex, type RGB } from './config';
import { RNG } from './rng';
import { Accum } from './world/builder';
import type { PedDefs } from './world/ctx';

// Parties animées : 0 corps, 1 jambe g., 2 jambe d., 3 bras g., 4 bras d., 5 téléphone (+ hauteur du pivot)
const HIP = 0.85, SHOULDER = 1.4, CAT_HIP = 0.22;

class PedBuilder {
  a = new Accum();
  parts: number[] = [];
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB, part: number, style: number = STYLE.SOLID, emis = 0, extra = 0, pivot = -1) {
    const before = this.a.verts;
    this.a.addBox(x0, y0, z0, x1, y1, z1, c, style, 3, emis, extra);
    const pv = pivot >= 0 ? pivot : part === 1 || part === 2 ? HIP : part >= 3 ? SHOULDER : 0;
    for (let i = before; i < this.a.verts; i++) this.parts.push(part, pv);
  }
  build() {
    const g = this.a.build();
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(this.parts), 2));
    return g;
  }
}

const SKIN = [hex(0xc8906a), hex(0x8a5a3a), hex(0xe0b090)];
const W: RGB = [1, 1, 1]; // teinté par instanceColor (extra = 1)

function body(b: PedBuilder, skin: RGB, pants: RGB, umbrellaArm: boolean) {
  b.box(-0.19, 0, -0.09, -0.03, 0.85, 0.09, pants, 1);
  b.box(-0.2, 0, -0.1, -0.02, 0.12, 0.14, hex(0x111111), 1);
  b.box(0.03, 0, -0.09, 0.19, 0.85, 0.09, pants, 2);
  b.box(0.02, 0, -0.1, 0.2, 0.12, 0.14, hex(0x111111), 2);
  b.box(-0.24, 0.8, -0.13, 0.24, 1.45, 0.13, W, 0, STYLE.SOLID, 0, 1);
  b.box(-0.34, 0.82, -0.07, -0.24, 1.42, 0.07, W, 3, STYLE.SOLID, 0, 1);
  b.box(-0.33, 0.74, -0.06, -0.25, 0.83, 0.06, skin, 3);
  if (umbrellaArm) {
    b.box(0.24, 1.15, -0.07, 0.34, 1.42, 0.22, W, 0, STYLE.SOLID, 0, 1);
    b.box(0.25, 1.1, 0.15, 0.33, 1.2, 0.25, skin, 0);
  } else {
    b.box(0.24, 0.82, -0.07, 0.34, 1.42, 0.07, W, 4, STYLE.SOLID, 0, 1);
    b.box(0.25, 0.74, -0.06, 0.33, 0.83, 0.06, skin, 4);
    // téléphone dans la main droite (visible seulement en posture 5)
    b.box(0.12, 0.64, 0.05, 0.3, 0.76, 0.09, hex(0xbfe8ff), 5, STYLE.EMISSIVE, 2.6);
  }
  b.box(-0.12, 1.47, -0.12, 0.12, 1.72, 0.12, skin, 0);
}

function variants(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  // 0 : manteau long, cheveux
  {
    const b = new PedBuilder();
    body(b, SKIN[0], hex(0x1c1c22), false);
    b.box(-0.25, 0.5, -0.14, 0.25, 0.82, 0.14, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.13, 1.66, -0.13, 0.13, 1.77, 0.13, hex(0x15110e), 0);
    b.box(-0.13, 1.5, -0.13, 0.13, 1.7, -0.1, hex(0x15110e), 0);
    out.push(b.build());
  }
  // 1 : parapluie à manche lumineux
  {
    const b = new PedBuilder();
    body(b, SKIN[1], hex(0x22242c), true);
    b.box(-0.13, 1.66, -0.13, 0.13, 1.76, 0.13, hex(0x0e0c0a), 0);
    const cx = 0.29, cz = 0.2;
    b.box(cx - 0.02, 1.15, cz - 0.02, cx + 0.02, 2.2, cz + 0.02, W, 0, STYLE.EMISSIVE, 3.5, 2);
    b.box(cx - 0.72, 2.18, cz - 0.72, cx + 0.72, 2.28, cz + 0.72, hex(0x14161c), 0);
    b.box(cx - 0.74, 2.12, cz - 0.74, cx + 0.74, 2.18, cz - 0.7, W, 0, STYLE.EMISSIVE, 3, 2);
    b.box(cx - 0.74, 2.12, cz + 0.7, cx + 0.74, 2.18, cz + 0.74, W, 0, STYLE.EMISSIVE, 3, 2);
    b.box(cx - 0.74, 2.12, cz - 0.7, cx - 0.7, 2.18, cz + 0.7, W, 0, STYLE.EMISSIVE, 3, 2);
    b.box(cx + 0.7, 2.12, cz - 0.7, cx + 0.74, 2.18, cz + 0.7, W, 0, STYLE.EMISSIVE, 3, 2);
    out.push(b.build());
  }
  // 2 : capuche et visière LED
  {
    const b = new PedBuilder();
    body(b, SKIN[2], hex(0x18181c), false);
    b.box(-0.14, 1.68, -0.14, 0.14, 1.8, 0.12, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.14, 1.46, -0.14, -0.12, 1.7, 0.1, W, 0, STYLE.SOLID, 0, 1);
    b.box(0.12, 1.46, -0.14, 0.14, 1.7, 0.1, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.14, 1.46, -0.14, 0.14, 1.7, -0.12, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.1, 1.56, 0.12, 0.1, 1.62, 0.135, W, 0, STYLE.EMISSIVE, 4, 2);
    out.push(b.build());
  }
  // 3 : chat errant (trot diagonal, yeux phosphorescents)
  {
    const b = new PedBuilder();
    b.box(-0.1, 0.2, -0.26, 0.1, 0.38, 0.24, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.09, 0.3, 0.2, 0.09, 0.47, 0.38, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.08, 0.47, 0.26, -0.03, 0.53, 0.31, W, 0, STYLE.SOLID, 0, 1);
    b.box(0.03, 0.47, 0.26, 0.08, 0.53, 0.31, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.06, 0.38, 0.38, -0.02, 0.41, 0.385, hex(0xc8ff4a), 0, STYLE.EMISSIVE, 5);
    b.box(0.02, 0.38, 0.38, 0.06, 0.41, 0.385, hex(0xc8ff4a), 0, STYLE.EMISSIVE, 5);
    b.box(-0.025, 0.34, -0.33, 0.025, 0.62, -0.27, W, 0, STYLE.SOLID, 0, 1);
    for (const [x, z, p] of [[-0.09, 0.14, 1], [0.04, 0.14, 2], [-0.09, -0.24, 2], [0.04, -0.24, 1]] as const)
      b.box(x, 0, z, x + 0.05, CAT_HIP, z + 0.06, W, p, STYLE.SOLID, 0, 1, CAT_HIP);
    out.push(b.build());
  }
  // 4 : rat (queue nue, yeux rouges)
  {
    const b = new PedBuilder();
    const pink = hex(0xb07a78);
    b.box(-0.05, 0.03, -0.1, 0.05, 0.11, 0.1, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.035, 0.05, 0.1, 0.035, 0.1, 0.17, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.012, 0.06, 0.17, 0.012, 0.08, 0.19, pink, 0);
    b.box(-0.045, 0.1, 0.11, -0.02, 0.13, 0.13, pink, 0);
    b.box(0.02, 0.1, 0.11, 0.045, 0.13, 0.13, pink, 0);
    b.box(-0.03, 0.085, 0.165, -0.016, 0.095, 0.172, hex(0xff2a2a), 0, STYLE.EMISSIVE, 2);
    b.box(0.016, 0.085, 0.165, 0.03, 0.095, 0.172, hex(0xff2a2a), 0, STYLE.EMISSIVE, 2);
    b.box(-0.008, 0.04, -0.34, 0.008, 0.055, -0.1, pink, 0);
    for (const [x, z, p] of [[-0.05, 0.05, 1], [0.03, 0.05, 2], [-0.05, -0.08, 2], [0.03, -0.08, 1]] as const)
      b.box(x, 0, z, x + 0.02, 0.05, z + 0.03, W, p, STYLE.SOLID, 0, 1, 0.05);
    out.push(b.build());
  }
  // 5 : chien errant
  {
    const b = new PedBuilder();
    b.box(-0.13, 0.36, -0.36, 0.13, 0.62, 0.3, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.12, 0.34, 0.2, 0.12, 0.64, 0.34, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.1, 0.55, 0.3, 0.1, 0.78, 0.5, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.06, 0.55, 0.5, 0.06, 0.66, 0.62, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.025, 0.62, 0.61, 0.025, 0.66, 0.635, hex(0x111111), 0);
    b.box(-0.1, 0.78, 0.33, -0.05, 0.86, 0.4, W, 0, STYLE.SOLID, 0, 1);
    b.box(0.05, 0.78, 0.33, 0.1, 0.86, 0.4, W, 0, STYLE.SOLID, 0, 1);
    b.box(-0.07, 0.69, 0.5, -0.04, 0.72, 0.505, hex(0xc8ff9a), 0, STYLE.EMISSIVE, 1.2);
    b.box(0.04, 0.69, 0.5, 0.07, 0.72, 0.505, hex(0xc8ff9a), 0, STYLE.EMISSIVE, 1.2);
    b.box(-0.025, 0.56, -0.52, 0.025, 0.62, -0.36, W, 0, STYLE.SOLID, 0, 1);
    for (const [x, z, p] of [[-0.11, 0.16, 1], [0.05, 0.16, 2], [-0.11, -0.3, 2], [0.05, -0.3, 1]] as const)
      b.box(x, 0, z, x + 0.06, 0.4, z + 0.07, W, p, STYLE.SOLID, 0, 1, 0.4);
    out.push(b.build());
  }
  return out;
}

/** Géométrie d'une variante de personnage (défilés, événements). */
export function pedGeometry(v: number): THREE.BufferGeometry {
  return variants()[v];
}

const COATS = [0x1a1a1e, 0x2a2a30, 0x1a2238, 0x4a1a22, 0x3a3a24, 0x8a7a5a, 0x2a1a1a, 0x303848, 0xd0d0d0, 0xc8b020, 0xb03070];
const FURS = [0x111111, 0x1a1a1a, 0xb86a2a, 0x6a6a6a, 0xd8d0c0, 0x5a4030];
const RAT = [0x4a4440, 0x3a3430, 0x5a5048, 0x2e2a28];
const DOG = [0x8a6a3a, 0x2a2420, 0xc8b8a0, 0x5a4a3a, 0x1a1a1a, 0x9a8a70];
/** Variante de géométrie : 3 chat · 4 rat · 5 chien. */
const ANIMAL_V = { cat: 3, rat: 4, dog: 5 } as const;
const isAnimal = (v: number) => v >= 3;

interface Path { pts: [number, number][]; cum: number[]; len: number; closed: boolean; y: number }

interface Walker {
  v: number;       // variante
  i: number;       // index d'instance
  path: Path;
  s: number;
  dir: 1 | -1;
  speed: number;
  paused: boolean; // bloqué par le joueur
  scale: number;
  off: number;     // décalage latéral par rapport au tracé
  pose: number;    // 0 marche normale · 5 les yeux sur le téléphone
  pauseMean: number; // intervalle moyen entre deux arrêts (0 : jamais)
  next: number;    // temps avant le prochain arrêt
  hold: number;    // durée d'arrêt restante
  turn: number;    // orientation pendant l'arrêt (regarde un étal, une vitrine)
  look: number;    // rotation courante (lissée)
  flee: number;    // rat qui détale (temps restant)
}

interface Idle { v: number; i: number; x: number; y: number; z: number; yaw: number; cur: number; pose: number; scale: number; ph: number; turns: boolean }

/** Piéton qui traverse au feu vert, puis attend de l'autre côté le cycle suivant. */
interface Crosser {
  v: number; i: number;
  cx: number; cz: number; axis: 0 | 1;
  lat: number;     // position dans la largeur du passage
  side: 1 | -1;    // trottoir où il attend
  wait: [number, number]; // distance au centre de la chaussée de chaque côté
  delay: number;   // réaction après le feu vert piéton
  speed: number;
  walking: boolean;
  u: number;
  cycle: number;
  pose: number;
  scale: number;
}

/** Voyageurs attachés à un objet mobile (rame de métro) : repère local de l'objet. */
export interface RiderGroup { obj: THREE.Object3D; specs: { x: number; y: number; z: number; yaw: number; pose: number }[] }

const SEATED = (p: number) => p === 1 || p === 7 || p === 8;
/** Postures debout qui peuvent regarder autour d'elles. */
const TURNS = (p: number) => p === 0 || p === 2 || p === 3 || p === 5;
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class Pedestrians {
  group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private inst: THREE.InstancedBufferAttribute[] = [];
  private walkers: Walker[] = [];
  private idles: Idle[] = [];
  private crossers: Crosser[] = [];
  private riders: { v: number; i: number; obj: THREE.Object3D; local: THREE.Matrix4; pose: number }[] = [];
  private rng: RNG;
  /** Distance au chien le plus proche du joueur (aboiements). */
  dogNear = 99;
  /** Un rat vient de détaler près du joueur (couinement). */
  ratScared = false;
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(defs: PedDefs, mat: THREE.Material, seed: number, riderGroups: RiderGroup[] = []) {
    const rng = (this.rng = new RNG(seed ^ 0x2545f491));
    const geos = variants();
    const pickVariant = (y: number, umbrella?: boolean) => {
      if (umbrella === true) return 1;
      if (umbrella === false) return rng.chance(0.3) ? 2 : 0;
      if (y < CLOUD_Y - 10 && y > -1 && rng.chance(0.45)) return 1;
      return rng.chance(0.3) ? 2 : 0;
    };
    const mkPath = (pts: [number, number][], closed: boolean, y: number): Path => {
      const cum = [0];
      const n = closed ? pts.length : pts.length - 1;
      for (let k = 0; k < n; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        cum.push(cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      return { pts, cum, len: cum[cum.length - 1], closed, y };
    };
    const counts = [0, 0, 0, 0, 0, 0];
    const addWalker = (path: Path, v: number, pauseMean = 0) => {
      const cat = isAnimal(v);
      // un passant sur huit marche les yeux rivés sur son téléphone (jamais avec un parapluie)
      const phone = !cat && v !== 1 && rng.chance(0.14);
      this.walkers.push({
        v, i: counts[v]++, path, s: rng.range(0, path.len * (path.closed ? 1 : 2)),
        dir: rng.chance(0.5) ? 1 : -1,
        speed: v === 4 ? rng.range(1.2, 2.2) : v === 5 ? rng.range(0.9, 1.4) : cat ? rng.range(0.5, 1.1) : phone ? rng.range(0.8, 1.15) : rng.range(1.0, 1.6), paused: false,
        scale: cat ? rng.range(0.85, 1.15) : rng.range(0.92, 1.08), off: cat ? rng.range(-0.15, 0.15) : rng.range(-0.6, 0.6),
        pose: phone ? 5 : 0, pauseMean, next: pauseMean * rng.range(0.2, 1.5), hold: 0, turn: 0, look: 0, flee: 0,
      });
    };
    for (const l of defs.loops) {
      const path = mkPath(l.pts, true, l.y);
      const an = l.animal ?? (l.cat ? 'cat' : null);
      for (let k = 0; k < l.count; k++) addWalker(path, an ? ANIMAL_V[an] : pickVariant(l.y), an === 'rat' ? 2.5 : an === 'dog' ? 9 : an ? 0 : l.pause ?? 0);
    }
    for (const l of defs.lines) {
      const path = mkPath([[l.x0, l.z0], [l.x1, l.z1]], false, l.y);
      for (let k = 0; k < l.count; k++) addWalker(path, pickVariant(l.y, l.pause ? rng.chance(0.35) : undefined), l.pause ?? 0);
    }
    for (const d of defs.idle) {
      const an = d.animal ?? (d.cat ? 'cat' : null);
      const v = an ? ANIMAL_V[an] : pickVariant(d.y, d.pose ? false : d.umbrella);
      const pose = d.pose ?? 0;
      const y = SEATED(pose) ? (an === 'cat' ? d.y - 0.17 : an === 'dog' ? d.y - 0.3 : an === 'rat' ? d.y - 0.04 : d.y - 0.76) : d.y;
      this.idles.push({
        v, i: counts[v]++, x: d.x, y, z: d.z, yaw: d.yaw, cur: d.yaw, pose, ph: rng.range(0, 100),
        scale: an ? rng.range(0.85, 1.15) : rng.range(0.94, 1.06), turns: TURNS(pose) || pose === 4,
      });
    }
    for (const c of defs.cross) {
      for (let k = 0; k < c.n; k++) {
        const v = rng.chance(0.3) ? 1 : rng.chance(0.3) ? 2 : 0;
        this.crossers.push({
          v, i: counts[v]++, cx: c.cx, cz: c.cz, axis: c.axis, lat: rng.range(-1.3, 1.3),
          side: rng.chance(0.5) ? 1 : -1, wait: [rng.range(10.1, 11.4), rng.range(10.1, 11.4)],
          // départ entre 0,5 et 3,5 s après le bonhomme vert, chaussée libérée avant que les voitures ne repartent (13 s)
          delay: rng.range(0.5, 2.0), speed: rng.range(2.2, 2.7), walking: false, u: 0, cycle: -1,
          pose: v !== 1 && rng.chance(0.3) ? 5 : 0, scale: rng.range(0.92, 1.08),
        });
      }
    }
    for (const g of riderGroups)
      for (const s of g.specs) {
        const v = rng.chance(0.3) ? 2 : 0;
        const pose = s.pose === 0 && rng.chance(0.4) ? 5 : s.pose;
        const y = SEATED(pose) ? s.y - 0.76 : s.y;
        const local = new THREE.Matrix4().compose(new THREE.Vector3(s.x, y, s.z), new THREE.Quaternion().setFromAxisAngle(this.up, s.yaw), new THREE.Vector3(1, 1, 1));
        this.riders.push({ v, i: counts[v]++, obj: g.obj, local, pose });
      }

    const c = new THREE.Color();
    geos.forEach((g, v) => {
      const n = Math.max(1, counts[v]);
      const mesh = new THREE.InstancedMesh(g, mat, n);
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aInst', attr);
      for (let i = 0; i < n; i++) {
        attr.setXYZW(i, rng.next(), 1, rng.next(), 0);
        c.setHex(v === 3 ? rng.pick(FURS) : v === 4 ? rng.pick(RAT) : v === 5 ? rng.pick(DOG) : rng.chance(0.85) ? rng.pick(COATS.slice(0, 8)) : rng.pick(COATS));
        mesh.setColorAt(i, c);
      }
      mesh.count = counts[v];
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.inst.push(attr);
      this.group.add(mesh);
    });
    for (const w of this.walkers) this.inst[w.v].setW(w.i, w.pose);
    // personnages immobiles : placés une fois (ceux qui regardent autour d'eux sont repris près du joueur)
    for (const s of this.idles) {
      this.inst[s.v].setY(s.i, 0);
      this.inst[s.v].setW(s.i, s.pose);
      this.placeIdle(s);
    }
    for (const r of this.riders) {
      this.inst[r.v].setY(r.i, 0);
      this.inst[r.v].setW(r.i, r.pose);
    }
    for (const k of this.crossers) this.inst[k.v].setW(k.i, k.pose);
    this.update(0, new THREE.Vector3(0, -1000, 0), 0);
  }

  get total() {
    return this.meshes.reduce((n, m) => n + m.count, 0);
  }

  private placeIdle(s: Idle) {
    this.q.setFromAxisAngle(this.up, s.cur);
    this.m.compose(this.p.set(s.x, s.y, s.z), this.q, this.sc.setScalar(s.scale));
    this.meshes[s.v].setMatrixAt(s.i, this.m);
  }

  /** Positions des marcheurs (pour l'ambiance sonore : densité de foule). */
  crowdNear(p: THREE.Vector3, r: number): number {
    let n = 0;
    const r2 = r * r;
    for (const w of this.walkers) {
      if (isAnimal(w.v)) continue;
      this.meshes[w.v].getMatrixAt(w.i, this.m);
      const e = this.m.elements;
      const dx = e[12] - p.x, dy = e[13] - p.y, dz = e[14] - p.z;
      if (dx * dx + dy * dy + dz * dz < r2) n++;
    }
    return n;
  }

  private setWalk(v: number, i: number, on: boolean) {
    const a = this.inst[v];
    if ((a.getY(i) > 0.5) !== on) {
      a.setY(i, on ? 1 : 0);
      a.needsUpdate = true;
    }
  }

  update(dt: number, player: THREE.Vector3, t: number) {
    const rng = this.rng;
    this.dogNear = 99;
    this.ratScared = false;
    // ---- Marcheurs : trottoirs, ruelles, passerelles, allées de marché ----
    for (const w of this.walkers) {
      const P = w.path;
      const period = P.closed ? P.len : P.len * 2;
      let d = ((w.s % period) + period) % period;
      let back = false;
      if (!P.closed && d > P.len) { d = period - d; back = true; }
      let k = 0;
      while (k < P.cum.length - 2 && P.cum[k + 1] < d) k++;
      const a = P.pts[k], b = P.pts[(k + 1) % P.pts.length];
      const segLen = P.cum[k + 1] - P.cum[k] || 1;
      const u = (d - P.cum[k]) / segLen;
      let hx = (b[0] - a[0]) / segLen, hz = (b[1] - a[1]) / segLen;
      const x = a[0] + (b[0] - a[0]) * u + hz * w.off, z = a[1] + (b[1] - a[1]) * u - hx * w.off;
      const sgn = (back ? -1 : 1) * w.dir;
      hx *= sgn; hz *= sgn;
      // s'arrête si le joueur lui barre la route
      const px = player.x - x, pz = player.z - z;
      const ahead = px * hx + pz * hz;
      let blocked = Math.abs(player.y - P.y) < 1.5 && ahead > 0 && ahead < 1.4 && Math.abs(px * hz - pz * hx) < 0.7;
      const near = Math.abs(player.y - P.y) < 2.5 ? Math.hypot(px, pz) : 99;
      if (w.v === 4) {
        // rat : détale à l'approche du joueur, dans la direction opposée
        if (near < 3.5 && w.flee <= 0) {
          w.flee = 2;
          w.hold = 0;
          if (ahead > 0) w.dir = w.dir > 0 ? -1 : 1;
          if (near < 5) this.ratScared = true;
        }
        blocked = false;
      } else if (w.v === 5) {
        // chien : s'arrête et fixe le joueur qui s'approche
        if (near < this.dogNear) this.dogNear = near;
        if (near < 5) { w.hold = Math.max(w.hold, 0.8); let a = Math.atan2(px, pz) - Math.atan2(hx, hz); w.turn = Math.atan2(Math.sin(a), Math.cos(a)); }
      }
      if (w.flee > 0) w.flee -= dt;
      w.paused = blocked;
      // arrêts spontanés : regarder un étal, une vitrine, puis repartir (parfois en sens inverse)
      if (w.pauseMean > 0) {
        if (w.hold > 0) {
          w.hold -= dt;
          if (w.hold <= 0) {
            w.next = w.pauseMean * rng.range(0.5, 1.5);
            if (!P.closed && rng.chance(0.3)) w.dir = w.dir > 0 ? -1 : 1;
          }
        } else if ((w.next -= dt) <= 0) {
          w.hold = rng.range(2, 6);
          w.turn = (rng.chance(0.5) ? 1 : -1) * rng.range(1.2, 1.8);
        }
      }
      const holding = w.hold > 0;
      this.setWalk(w.v, w.i, !blocked && !holding);
      if (!blocked && !holding) w.s += w.dir * w.speed * (w.flee > 0 ? 3 : 1) * dt;
      w.look += ((holding ? w.turn : 0) - w.look) * Math.min(1, dt * 3);
      this.q.setFromAxisAngle(this.up, Math.atan2(hx, hz) + w.look);
      this.m.compose(this.p.set(x, P.y, z), this.q, this.sc.setScalar(w.scale));
      this.meshes[w.v].setMatrixAt(w.i, this.m);
    }

    // ---- Immobiles proches : regardent autour d'eux, se tournent vers le joueur ----
    for (const s of this.idles) {
      if (!s.turns) continue;
      const dx = player.x - s.x, dz = player.z - s.z, dy = player.y - s.y;
      const d2 = dx * dx + dz * dz;
      if (d2 > 45 * 45 || Math.abs(dy) > 6) continue;
      const sway = s.pose === 4 ? 0.55 * Math.sin(t * 0.17 + s.ph) + 0.25 * Math.sin(t * 0.43 + s.ph * 2) : 0.3 * Math.sin(t * 0.21 + s.ph) + 0.18 * Math.sin(t * 0.57 + s.ph * 3);
      let target = s.yaw + sway;
      if (s.v === 5 && d2 < this.dogNear * this.dogNear) this.dogNear = Math.sqrt(d2);
      if (d2 < 16 && (s.v < 3 || s.v === 5)) {
        // le joueur approche : on le dévisage
        const toP = Math.atan2(dx, dz);
        let dd = toP - target;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        target += dd * (1 - Math.sqrt(d2) / 4);
      }
      let delta = target - s.cur;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      s.cur += delta * Math.min(1, dt * 2.5);
      this.placeIdle(s);
    }

    // ---- Passages piétons : attente au bord du trottoir, traversée au bonhomme vert ----
    for (const c of this.crossers) {
      const shift = c.axis === 0 ? 0 : CYCLE / 2;
      const ph = (((t - shift) % CYCLE) + CYCLE) % CYCLE;
      const cyc = Math.floor((t - shift) / CYCLE);
      if (!c.walking && ph >= c.delay && ph < c.delay + 1.5 && c.cycle !== cyc) {
        c.cycle = cyc;
        // une fois sur quatre, on laisse passer ce feu (téléphone, hésitation…)
        if (hash(cyc, c.i + c.v * 7919) > 0.25) { c.walking = true; c.u = 0; }
      }
      const L = c.wait[0] + c.wait[1];
      const from = c.side > 0 ? c.wait[0] : -c.wait[1];
      const to = c.side > 0 ? -c.wait[1] : c.wait[0];
      if (c.walking) {
        c.u += (c.speed * dt) / L;
        if (c.u >= 1) { c.walking = false; c.u = 0; c.side = c.side > 0 ? -1 : 1; }
      }
      const along = c.walking ? from + (to - from) * c.u : c.side > 0 ? c.wait[0] : -c.wait[1];
      const x = c.axis === 0 ? c.cx + along : c.cx + c.lat;
      const z = c.axis === 0 ? c.cz + c.lat : c.cz + along;
      const y = Math.abs(along) < 9 ? 0 : 0.5;
      const dir = c.walking ? Math.sign(to - from) : -Math.sign(along); // en attente : face à la chaussée
      const yaw = c.axis === 0 ? Math.atan2(dir, 0) : Math.atan2(0, dir);
      this.setWalk(c.v, c.i, c.walking);
      this.q.setFromAxisAngle(this.up, yaw);
      this.m.compose(this.p.set(x, y, z), this.q, this.sc.setScalar(c.scale));
      this.meshes[c.v].setMatrixAt(c.i, this.m);
    }

    for (const r of this.riders) {
      const o = r.obj;
      this.q.setFromEuler(o.rotation);
      this.m2.compose(o.position, this.q, this.sc.setScalar(1));
      this.m.multiplyMatrices(this.m2, r.local);
      this.meshes[r.v].setMatrixAt(r.i, this.m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
