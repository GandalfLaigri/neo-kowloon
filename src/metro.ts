import * as THREE from 'three';
import { STYLE, hex, type RGB } from './config';
import type { CollisionWorld, DynBox } from './physics';
import { Accum, type LightSrc } from './world/builder';
import { PLATFORM, PLATFORM_HALF, TRACK_T, platformTop, type MetroLine } from './world/metro';

const CAR_L = 15;
const GAP = 0.5;
const NCARS = 3;
const HALF_T = (NCARS * CAR_L + (NCARS - 1) * GAP) / 2; // 23.5
const CARS = [-(CAR_L + GAP), 0, CAR_L + GAP];
const DOORS: [number, number][] = CARS.flatMap((c) => [[c - 4.5, c - 3.0], [c + 3.0, c + 4.5]] as [number, number][]);
const VMAX = 20;
const ACC = 1.6;
const DWELL = 12;

type Box6 = [number, number, number, number, number, number];

interface Train {
  line: MetroLine;
  track: 1 | -1;
  p: number;
  v: number;
  dir: 1 | -1;
  idx: number;
  state: 'dwell' | 'run';
  timer: number;
  door: number;
  theta: number;
  group: THREE.Group;
  leafA: THREE.Object3D;
  leafB: THREE.Object3D;
  boxes: { local: Box6; dyn: DynBox; door: boolean }[];
  lights: LightSrc[];
}

export type MetroContext =
  | { kind: 'train'; line: MetroLine; station: string | null; next: string; terminus: string; doorsOpen: boolean }
  | { kind: 'platform'; line: MetroLine; station: string; eta: number | null }
  | null;

function trainGeometry(color: RGB) {
  const o = new Accum(), g = new Accum(), d = new Accum();
  const body = hex(0xb8bcc4), dk = hex(0x1a1c22), seat = hex(0x2a3a6a), white = hex(0xe8f4ff);
  const piecesPlus: [number, number][] = [];
  let x = -HALF_T;
  for (const [d0, d1] of DOORS) { piecesPlus.push([x, d0]); x = d1; }
  piecesPlus.push([x, HALF_T]);
  for (const c of CARS) {
    const a = c - CAR_L / 2, b = c + CAR_L / 2;
    o.addBox(a, -1.0, -1.5, b, 0, 1.5, dk, STYLE.SOLID, 21, 0, 0);
    o.addBox(a, 2.6, -1.5, b, 3.1, 1.5, body, STYLE.SOLID, 22, 0, 0);
    o.addBox(a, 2.1, 1.4, b, 2.6, 1.5, body, STYLE.SOLID, 23, 0, 0);
    o.addBox(a, 2.1, -1.5, b, 2.6, -1.4, body, STYLE.SOLID, 24, 0, 0);
    o.addBox(a, 0, -1.5, b, 0.9, -1.4, body, STYLE.SOLID, 25, 0, 0);
    o.addBox(a, 0.75, -1.53, b, 0.85, -1.5, color, STYLE.EMISSIVE, 0, 3, 0);
    o.addBox(a, 0.75, 1.5, b, 0.85, 1.53, color, STYLE.EMISSIVE, 0, 3, 0);
    o.addBox(a, 2.52, -0.6, b, 2.6, -0.4, white, STYLE.EMISSIVE, 0, 2.2, 0);
    o.addBox(a, 2.52, 0.4, b, 2.6, 0.6, white, STYLE.EMISSIVE, 0, 2.2, 0);
    // bancs longitudinaux et publicités lumineuses
    for (const [s0, s1] of [[a + 0.2, c - 4.7], [c - 2.8, c + 2.8], [c + 4.7, b - 0.2]]) {
      o.addBox(s0, 0, 1.0, s1, 0.45, 1.4, seat, STYLE.SOLID, 26, 0, 0);
      o.addBox(s0, 0, -1.4, s1, 0.45, -1.0, seat, STYLE.SOLID, 27, 0, 0);
      o.addBox(s0 + 0.3, 2.15, 1.37, s1 - 0.3, 2.45, 1.4, color, STYLE.EMISSIVE, 0, 1.2, 0);
    }
    for (const px of [c - 3.75, c + 3.75]) o.addBox(px - 0.04, 0, -0.04, px + 0.04, 2.6, 0.04, hex(0x9aa0a8), STYLE.SOLID, 0, 0, 0);
    // montants entre les baies (côté -z)
    for (let wx = a + 1.5; wx < b - 1; wx += 2) o.addBox(wx, 0.9, -1.5, wx + 0.15, 2.1, -1.4, body, STYLE.SOLID, 28, 0, 0);
    g.addBox(a, 0.9, -1.46, b, 2.1, -1.44, hex(0x9fd8ff), STYLE.SOLID, 0, 0, 0);
  }
  // côté quai (+z) : caisson et vitres entre les portes
  for (const [p0, p1] of piecesPlus) {
    o.addBox(p0, 0, 1.4, p1, 0.9, 1.5, body, STYLE.SOLID, 29, 0, 0);
    g.addBox(p0, 0.9, 1.44, p1, 2.1, 1.46, hex(0x9fd8ff), STYLE.SOLID, 0, 0, 0);
  }
  // soufflets entre voitures
  for (const j of [CARS[0] + CAR_L / 2, CARS[1] + CAR_L / 2]) {
    o.addBox(j - 0.1, 0, -1.5, j + GAP + 0.1, 2.6, -0.6, dk, STYLE.SOLID, 30, 0, 0);
    o.addBox(j - 0.1, 0, 0.6, j + GAP + 0.1, 2.6, 1.5, dk, STYLE.SOLID, 31, 0, 0);
    o.addBox(j, -0.3, -0.6, j + GAP, 0, 0.6, dk, STYLE.SOLID, 32, 0, 0);
  }
  // cabines aux deux extrémités : pare-brise, phares, feux
  for (const e of [-1, 1]) {
    const x0 = e > 0 ? HALF_T - 0.1 : -HALF_T, x1 = e > 0 ? HALF_T : -HALF_T + 0.1;
    o.addBox(x0, 0, -1.5, x1, 1.2, 1.5, body, STYLE.SOLID, 33, 0, 0);
    o.addBox(x0, 2.3, -1.5, x1, 2.6, 1.5, body, STYLE.SOLID, 34, 0, 0);
    o.addBox(x0, 1.2, -1.5, x1, 2.3, -1.2, body, STYLE.SOLID, 35, 0, 0);
    o.addBox(x0, 1.2, 1.2, x1, 2.3, 1.5, body, STYLE.SOLID, 36, 0, 0);
    g.addBox(x0, 1.2, -1.2, x1, 2.3, 1.2, hex(0x9fd8ff), STYLE.SOLID, 0, 0, 0);
    const xo = e > 0 ? HALF_T : -HALF_T - 0.06;
    o.addBox(xo, 0.35, -1.1, xo + 0.06, 0.6, -0.6, white, STYLE.EMISSIVE, 0, 6, 0);
    o.addBox(xo, 0.35, 0.6, xo + 0.06, 0.6, 1.1, white, STYLE.EMISSIVE, 0, 6, 0);
    o.addBox(xo, 0.35, -1.45, xo + 0.06, 0.6, -1.25, hex(0xff2020), STYLE.EMISSIVE, 0, 5, 0);
    o.addBox(xo, 0.35, 1.25, xo + 0.06, 0.6, 1.45, hex(0xff2020), STYLE.EMISSIVE, 0, 5, 0);
  }
  // vantaux de portes (côté quai), en deux groupes qui coulissent
  const a = new Accum(), b = new Accum();
  for (const [d0, d1] of DOORS) {
    const m = (d0 + d1) / 2;
    a.addBox(d0, 0, 1.5, m, 2.1, 1.56, hex(0x9fd8ff), STYLE.SOLID, 0, 0, 0);
    b.addBox(m, 0, 1.5, d1, 2.1, 1.56, hex(0x9fd8ff), STYLE.SOLID, 0, 0, 0);
  }
  void d;
  return { opaque: o.build(), glass: g.build(), leafA: a.build(), leafB: b.build() };
}

function collisionBoxes(): { local: Box6; door: boolean }[] {
  const out: { local: Box6; door: boolean }[] = [];
  const add = (b: Box6, door = false) => out.push({ local: b, door });
  add([-HALF_T, -0.5, -1.5, HALF_T, 0.02, 1.5]);
  add([-HALF_T, 2.6, -1.5, HALF_T, 3.1, 1.5]);
  add([-HALF_T, 0, -1.5, -HALF_T + 0.2, 2.6, 1.5]);
  add([HALF_T - 0.2, 0, -1.5, HALF_T, 2.6, 1.5]);
  add([-HALF_T, 0, -1.5, HALF_T, 2.6, -1.35]);
  let x = -HALF_T;
  for (const [d0, d1] of DOORS) {
    add([x, 0, 1.35, d0, 2.6, 1.5]);
    add([d0, 0, 1.35, d1, 2.6, 1.56], true);
    x = d1;
  }
  add([x, 0, 1.35, HALF_T, 2.6, 1.5]);
  for (const j of [CARS[0] + CAR_L / 2, CARS[1] + CAR_L / 2]) {
    add([j - 0.1, 0, -1.5, j + GAP + 0.1, 2.6, -0.6]);
    add([j - 0.1, 0, 0.6, j + GAP + 0.1, 2.6, 1.5]);
  }
  return out;
}

export class Metro {
  group = new THREE.Group();
  trains: Train[] = [];
  lights: LightSrc[] = [];
  private v = new THREE.Vector3();

  constructor(private lines: MetroLine[], col: CollisionWorld, voxelMat: THREE.Material, glassMat: THREE.Material) {
    const colBoxes = collisionBoxes();
    for (const line of lines) {
      const geo = trainGeometry(line.color);
      const last = line.stations.length - 1;
      for (const track of [1, -1] as const) {
        const group = new THREE.Group();
        const opaque = new THREE.Mesh(geo.opaque, voxelMat);
        const glass = new THREE.Mesh(geo.glass, glassMat);
        glass.renderOrder = 2;
        const leafA = new THREE.Mesh(geo.leafA, glassMat);
        const leafB = new THREE.Mesh(geo.leafB, glassMat);
        leafA.renderOrder = leafB.renderOrder = 3;
        group.add(opaque, glass, leafA, leafB);
        this.group.add(group);
        const theta = line.axis === 0 ? (track > 0 ? 0 : Math.PI) : (track > 0 ? Math.PI / 2 : -Math.PI / 2);
        const idx = track > 0 ? 0 : last;
        const lights = CARS.map(() => ({ x: 0, y: -9999, z: 0, r: 0.85, g: 0.95, b: 1.1, radius: 8 }));
        this.lights.push(...lights);
        this.trains.push({
          line, track, p: line.stations[idx].p, v: 0, dir: track > 0 ? 1 : -1, idx,
          state: 'dwell', timer: track > 0 ? 0 : DWELL * 0.5, door: 0, theta, group, leafA, leafB,
          boxes: colBoxes.map((b) => ({ local: b.local, door: b.door, dyn: col.addDyn() })),
          lights,
        });
      }
    }
    for (const t of this.trains) this.place(t, 0);
  }

  private center(t: Train): [number, number, number] {
    const l = t.line;
    const y = platformTop(l);
    return l.axis === 0 ? [t.p, y, l.c + t.track * TRACK_T] : [l.c + t.track * TRACK_T, y, t.p];
  }

  private toWorld(t: Train, lx: number, lz: number): [number, number] {
    const [cx, , cz] = this.center(t);
    const c = Math.cos(t.theta), s = Math.sin(t.theta);
    return [cx + lx * c + lz * s, cz - lx * s + lz * c];
  }

  private toLocal(t: Train, x: number, z: number): [number, number] {
    const [cx, , cz] = this.center(t);
    const dx = x - cx, dz = z - cz;
    const c = Math.cos(t.theta), s = Math.sin(t.theta);
    return [dx * c - dz * s, dx * s + dz * c];
  }

  private place(t: Train, dp: number) {
    const [cx, cy, cz] = this.center(t);
    t.group.position.set(cx, cy, cz);
    t.group.rotation.y = t.theta;
    const slide = 0.72 * t.door * t.door * (3 - 2 * t.door);
    t.leafA.position.x = -slide;
    t.leafB.position.x = slide;
    const dx = t.line.axis === 0 ? dp : 0, dz = t.line.axis === 1 ? dp : 0;
    for (const b of t.boxes) {
      const [x0, y0, z0, x1, y1, z1] = b.local;
      const [ax, az] = this.toWorld(t, x0, z0);
      const [bx, bz] = this.toWorld(t, x1, z1);
      b.dyn.min[0] = Math.min(ax, bx); b.dyn.max[0] = Math.max(ax, bx);
      b.dyn.min[2] = Math.min(az, bz); b.dyn.max[2] = Math.max(az, bz);
      b.dyn.min[1] = cy + y0; b.dyn.max[1] = cy + y1;
      b.dyn.enabled = !b.door || t.door < 0.9;
      b.dyn.dy = 0;
      void dx; void dz;
    }
    CARS.forEach((c, i) => {
      const [x, z] = this.toWorld(t, c, 0);
      t.lights[i].x = x; t.lights[i].y = cy + 2.2; t.lights[i].z = z;
    });
  }

  /** Le joueur (pieds en p) est-il dans la rame ? */
  private inside(t: Train, p: THREE.Vector3) {
    const [lx, lz] = this.toLocal(t, p.x, p.z);
    const ly = p.y - platformTop(t.line);
    return Math.abs(lx) < HALF_T - 0.2 && Math.abs(lz) < 1.5 && ly > -0.4 && ly < 2.4;
  }

  /** Avance les rames ; renvoie le déplacement à appliquer au joueur s'il est à bord. */
  update(dt: number, player: THREE.Vector3): THREE.Vector3 | null {
    let carry: THREE.Vector3 | null = null;
    for (const t of this.trains) {
      const onboard = this.inside(t, player);
      const st = t.line.stations;
      let dp = 0;
      if (t.state === 'dwell') {
        t.timer += dt;
        const tt = t.timer;
        t.door = tt < 1 ? 0 : tt < 2.5 ? (tt - 1) / 1.5 : tt < DWELL - 3 ? 1 : tt < DWELL - 1.5 ? (DWELL - 1.5 - tt) / 1.5 : 0;
        if (tt >= DWELL) {
          if (t.idx + t.dir < 0 || t.idx + t.dir >= st.length) t.dir = (t.dir * -1) as 1 | -1;
          t.idx += t.dir;
          t.state = 'run';
          t.door = 0;
        }
      } else {
        const target = st[t.idx].p;
        const dist = (target - t.p) * t.dir;
        t.v = Math.min(VMAX, Math.sqrt(2 * ACC * Math.max(dist, 0)) + 0.2, t.v + ACC * dt);
        let step = t.v * dt;
        if (step >= dist) {
          step = Math.max(dist, 0);
          t.state = 'dwell';
          t.timer = 0;
          t.v = 0;
        }
        dp = step * t.dir;
        t.p += dp;
      }
      this.place(t, dp);
      if (onboard && dp !== 0) {
        carry = this.v.set(t.line.axis === 0 ? dp : 0, 0, t.line.axis === 1 ? dp : 0);
      }
    }
    return carry;
  }

  /** Volume intérieur (monde) de la rame où se trouve le joueur, sinon null. */
  interior(p: THREE.Vector3, out: THREE.Box3): THREE.Box3 | null {
    for (const t of this.trains) {
      if (!this.inside(t, p)) continue;
      const [ax, az] = this.toWorld(t, -HALF_T, -1.55);
      const [bx, bz] = this.toWorld(t, HALF_T, 1.6);
      const y = platformTop(t.line);
      out.min.set(Math.min(ax, bx), y - 0.2, Math.min(az, bz));
      out.max.set(Math.max(ax, bx), y + 3.1, Math.max(az, bz));
      return out;
    }
    return null;
  }

  context(p: THREE.Vector3): MetroContext {
    for (const t of this.trains) {
      if (!this.inside(t, p)) continue;
      const st = t.line.stations;
      const at = t.state === 'dwell' ? st[t.idx].name : null;
      let nextIdx = t.state === 'dwell' ? t.idx + t.dir : t.idx;
      if (nextIdx < 0 || nextIdx >= st.length) nextIdx = t.idx - t.dir;
      const term = t.dir > 0 ? st[st.length - 1].name : st[0].name;
      return { kind: 'train', line: t.line, station: at, next: st[nextIdx].name, terminus: term, doorsOpen: t.door > 0.5 };
    }
    for (const l of this.lines) {
      const PT = platformTop(l);
      if (Math.abs(p.y - PT) > 1.5) continue;
      const along = l.axis === 0 ? p.x : p.z;
      const tt = Math.abs((l.axis === 0 ? p.z : p.x) - l.c);
      if (tt < PLATFORM[0] - 0.5 || tt > PLATFORM[1] + 2) continue;
      for (const s of l.stations) {
        if (Math.abs(along - s.p) > PLATFORM_HALF + 4) continue;
        // prochaine rame desservant ce quai
        const track = Math.sign((l.axis === 0 ? p.z : p.x) - l.c) as 1 | -1;
        const tr = this.trains.find((t) => t.line === l && t.track === track);
        let eta: number | null = null;
        if (tr) {
          if (tr.state === 'dwell' && tr.line.stations[tr.idx] === s) eta = 0;
          else eta = Math.abs(s.p - tr.p) / 14 + (tr.state === 'dwell' ? DWELL - tr.timer : 0);
        }
        return { kind: 'platform', line: l, station: s.name, eta };
      }
    }
    return null;
  }
}
