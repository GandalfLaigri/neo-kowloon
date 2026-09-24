import * as THREE from 'three';
import { CHUNK, FAR_CHUNK, RAIN_EXTENT, RAIN_RES, V, type RGB } from '../config';
import { CollisionWorld } from '../physics';

type TA = Float32Array | Int8Array | Uint8Array | Uint16Array | Uint32Array;

class Buf<T extends TA> {
  a: T;
  n = 0;
  constructor(private ctor: new (n: number) => T, cap = 4096) {
    this.a = new ctor(cap);
  }
  ensure(k: number) {
    if (this.n + k > this.a.length) {
      const b = new this.ctor(Math.max(this.a.length * 2, this.n + k));
      (b as any).set(this.a);
      this.a = b;
    }
  }
  view(): T {
    return this.a.slice(0, this.n) as T;
  }
}

// Faces : normale, axe U, axe V, coin de base (indices dans [x0,y0,z0,x1,y1,z1])
// U x V = normale -> triangles CCW vus de l'extérieur.
const FACES: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number]; base: [number, number, number]; bit: number }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], base: [3, 1, 5], bit: 1 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], base: [0, 1, 2], bit: 2 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], base: [0, 4, 5], bit: 4 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], base: [0, 1, 2], bit: 8 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], base: [0, 1, 5], bit: 16 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], base: [3, 1, 2], bit: 32 },
];

export const SKIP = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 };

/** Accumulateur de géométrie de boîtes (format compact). */
export class Accum {
  pos = new Buf(Float32Array);
  nrm = new Buf(Int8Array);
  col = new Buf(Uint8Array);
  par = new Buf(Uint8Array);
  face = new Buf(Uint16Array);
  idx = new Buf(Uint32Array);
  verts = 0;

  addBox(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    c: RGB, style: number, seed: number, emis: number, extra: number, skip = 0,
  ) {
    const b = [x0, y0, z0, x1, y1, z1];
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const cr = Math.round(Math.min(1, c[0]) * 255), cg = Math.round(Math.min(1, c[1]) * 255), cb = Math.round(Math.min(1, c[2]) * 255);
    const em = Math.max(0, Math.min(255, Math.round((emis / 8) * 255)));
    for (const f of FACES) {
      if (skip & f.bit) continue;
      const bx = b[f.base[0]], by = b[f.base[1]], bz = b[f.base[2]];
      const w = Math.abs(f.u[0]) * sx + Math.abs(f.u[1]) * sy + Math.abs(f.u[2]) * sz;
      const h = Math.abs(f.v[0]) * sx + Math.abs(f.v[1]) * sy + Math.abs(f.v[2]) * sz;
      const uw = Math.max(1, Math.round(w / V)), vh = Math.max(1, Math.round(h / V));
      this.pos.ensure(12); this.nrm.ensure(12); this.col.ensure(12); this.par.ensure(16); this.face.ensure(16); this.idx.ensure(6);
      for (let k = 0; k < 4; k++) {
        const du = k === 1 || k === 2 ? w : 0;
        const dv = k >= 2 ? h : 0;
        this.pos.a[this.pos.n++] = bx + f.u[0] * du + f.v[0] * dv;
        this.pos.a[this.pos.n++] = by + f.u[1] * du + f.v[1] * dv;
        this.pos.a[this.pos.n++] = bz + f.u[2] * du + f.v[2] * dv;
        this.nrm.a[this.nrm.n++] = f.n[0] * 127;
        this.nrm.a[this.nrm.n++] = f.n[1] * 127;
        this.nrm.a[this.nrm.n++] = f.n[2] * 127;
        this.col.a[this.col.n++] = cr;
        this.col.a[this.col.n++] = cg;
        this.col.a[this.col.n++] = cb;
        this.par.a[this.par.n++] = style;
        this.par.a[this.par.n++] = seed & 255;
        this.par.a[this.par.n++] = em;
        this.par.a[this.par.n++] = extra & 255;
        this.face.a[this.face.n++] = du > 0 ? uw : 0;
        this.face.a[this.face.n++] = dv > 0 ? vh : 0;
        this.face.a[this.face.n++] = uw;
        this.face.a[this.face.n++] = vh;
      }
      const v = this.verts;
      const I = this.idx;
      I.a[I.n++] = v; I.a[I.n++] = v + 1; I.a[I.n++] = v + 2;
      I.a[I.n++] = v; I.a[I.n++] = v + 2; I.a[I.n++] = v + 3;
      this.verts += 4;
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.view(), 3, true));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col.view(), 3, true));
    g.setAttribute('aParams', new THREE.BufferAttribute(this.par.view(), 4, false));
    g.setAttribute('aFace', new THREE.BufferAttribute(this.face.view(), 4, false));
    g.setIndex(new THREE.BufferAttribute(this.idx.view(), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export interface BoxOpts {
  color: RGB;
  style?: number;
  seed?: number;
  emis?: number;
  extra?: number;
  solid?: boolean; // défaut : true
  glass?: boolean;
  skip?: number;
  far?: boolean; // décor lointain (gros chunks, sans collision)
  noRain?: boolean;
}

export interface LightSrc {
  x: number; y: number; z: number;
  r: number; g: number; b: number; // couleur * intensité
  radius: number;
  flicker?: number; // graine : lumière défaillante qui grésille
}

/** Cône de lumière statique (sommet, direction, longueur, rayon de base). */
export interface Cone {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  len: number; radius: number;
  color: RGB; intensity: number;
  flicker?: number;
}

/** Point d'ancrage d'un élément animé du décor (projecteur, hologramme, aire d'atterrissage…). */
export interface Spot { kind: string; x: number; y: number; z: number; a: number; b: number; color: RGB; data?: number[] }

export interface SteamEmitter {
  x: number; y: number; z: number;
  size: number;   // taille des volutes
  rise: number;   // hauteur de montée
  n: number;      // nombre de particules
  tint: RGB;
}

/** Monde en construction : géométrie par chunks, collisions, lumières, carte d'abri pluie. */
export class World {
  opaque = new Map<number, Accum>();
  glass = new Map<number, Accum>();
  far = new Map<number, Accum>();
  col = new CollisionWorld();
  lights: LightSrc[] = [];
  steam: SteamEmitter[] = [];
  cones: Cone[] = [];
  spots: Spot[] = [];
  rain = new Float32Array(RAIN_RES * RAIN_RES);
  boxes = 0;
  /** Volumes réservés (sans géométrie) que le décor ne doit pas envahir : trémies, passages… */
  private reserved: number[][] = [];

  private chunk(map: Map<number, Accum>, x: number, z: number, size: number): Accum {
    const k = (Math.floor(x / size) + 512) * 1024 + (Math.floor(z / size) + 512);
    let a = map.get(k);
    if (!a) map.set(k, (a = new Accum()));
    return a;
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.boxes++;
    let skip = o.skip ?? 0;
    // face inférieure invisible si la boîte repose sur la chaussée ou un trottoir
    if (y0 >= -0.001 && y0 <= 0.5001 && !o.glass) skip |= SKIP.NY;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const acc = o.far
      ? this.chunk(this.far, cx, cz, FAR_CHUNK)
      : this.chunk(o.glass ? this.glass : this.opaque, cx, cz, CHUNK);
    acc.addBox(x0, y0, z0, x1, y1, z1, o.color, o.style ?? 0, o.seed ?? 0, o.emis ?? 0, o.extra ?? 0, skip);
    if (!o.far && o.solid !== false) this.col.add(x0, y0, z0, x1, y1, z1);
    if (!o.far && !o.noRain && y1 > 1) this.rainCover(x0, z0, x1, z1, y1);
  }

  private rainCover(x0: number, z0: number, x1: number, z1: number, y: number) {
    const s = RAIN_RES / RAIN_EXTENT;
    const h = RAIN_EXTENT / 2;
    const i0 = Math.max(0, Math.floor((x0 + h) * s)), i1 = Math.min(RAIN_RES - 1, Math.floor((x1 + h) * s - 1e-3));
    const j0 = Math.max(0, Math.floor((z0 + h) * s)), j1 = Math.min(RAIN_RES - 1, Math.floor((z1 + h) * s - 1e-3));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * RAIN_RES + i;
        if (this.rain[k] < y) this.rain[k] = y;
      }
  }

  isFree(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const ax0 = Math.min(x0, x1), ay0 = Math.min(y0, y1), az0 = Math.min(z0, z1);
    const ax1 = Math.max(x0, x1), ay1 = Math.max(y0, y1), az1 = Math.max(z0, z1);
    for (const r of this.reserved)
      if (r[0] < ax1 && r[3] > ax0 && r[1] < ay1 && r[4] > ay0 && r[2] < az1 && r[5] > az0) return false;
    return !this.col.any(ax0, ay0, az0, ax1, ay1, az1);
  }

  reserve(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.reserved.push([x0, y0, z0, x1, y1, z1]);
  }

  light(x: number, y: number, z: number, c: RGB, intensity: number, radius: number, flicker?: number) {
    this.lights.push({ x, y, z, r: c[0] * intensity, g: c[1] * intensity, b: c[2] * intensity, radius, flicker });
  }

  cone(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, radius: number, color: RGB, intensity: number, flicker?: number) {
    this.cones.push({ x, y, z, dx, dy, dz, len, radius, color, intensity, flicker });
  }

  spot(kind: string, x: number, y: number, z: number, a: number, b: number, color: RGB, data?: number[]) {
    this.spots.push({ kind, x, y, z, a, b, color, data });
  }

  emitSteam(x: number, y: number, z: number, size: number, rise: number, n: number, tint: RGB) {
    this.steam.push({ x, y, z, size, rise, n, tint });
  }

  buildMeshes(opaqueMat: THREE.Material, glassMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    for (const a of this.opaque.values()) {
      if (!a.verts) continue;
      const m = new THREE.Mesh(a.build(), opaqueMat);
      m.matrixAutoUpdate = false;
      g.add(m);
    }
    for (const a of this.far.values()) {
      if (!a.verts) continue;
      const m = new THREE.Mesh(a.build(), opaqueMat);
      m.matrixAutoUpdate = false;
      g.add(m);
    }
    for (const a of this.glass.values()) {
      if (!a.verts) continue;
      const m = new THREE.Mesh(a.build(), glassMat);
      m.matrixAutoUpdate = false;
      m.renderOrder = 2;
      g.add(m);
    }
    return g;
  }
}
