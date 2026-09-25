import * as THREE from 'three';
import { BLOCKS, HALF, PITCH, STYLE, hex, type RGB } from './config';
import { pedGeometry } from './pedestrians';
import type { Beams } from './render/beams';
import type { LightPool } from './render/lightpool';
import { shared } from './render/materials';
import { RNG } from './rng';
import { carGeometry, type Mover } from './traffic';
import { Accum, type LightSrc } from './world/builder';
import type { City } from './world/city';
import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './world/districts';

/** Événement signalé au joueur (bandeau), et à noter dans le carnet s'il en est témoin. */
export interface EventNotice { text: string; id: 'chase' | 'blackout' | 'drones' | 'dragon' }

// ---------------------------------------------------------------------------
// Formes du spectacle de drones (N points, repère local : x largeur, y hauteur, z profondeur)
// ---------------------------------------------------------------------------
const N_DRONES = 360;
const FONT: Record<string, string[]> = {
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
};
function fill(pts: THREE.Vector3[], n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.floor((i * pts.length) / n)].clone());
  return out;
}
function shapes(): { name: string; pts: THREE.Vector3[]; col: (i: number, n: number, t: number) => RGB }[] {
  const N = N_DRONES;
  const grid: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) grid.push(new THREE.Vector3(((i % 20) - 9.5) * 3, Math.floor(i / 20) * 3 - 26, 0));
  const sphere: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    sphere.push(new THREE.Vector3(Math.cos(a) * r * 30, y * 30, Math.sin(a) * r * 30));
  }
  const heart: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, k = 1 - Math.floor((i % 3)) * 0.18;
    heart.push(new THREE.Vector3(16 * Math.pow(Math.sin(t), 3) * 2.1 * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 2.1 * k, 0));
  }
  const koi: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / N;
    if (u < 0.75) {
      const a = (u / 0.75) * Math.PI * 2, r = Math.sqrt(((i * 7919) % 97) / 97);
      koi.push(new THREE.Vector3(Math.cos(a) * 26 * r, Math.sin(a) * 11 * r, 0));
    } else {
      const v = (u - 0.75) / 0.25, s = ((i * 31) % 17) / 17 - 0.5;
      koi.push(new THREE.Vector3(-26 - v * 16, s * v * 30, 0));
    }
  }
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 * 3, b = (i / N) * Math.PI * 2;
    ring.push(new THREE.Vector3(Math.cos(b) * (30 + Math.cos(a * 4) * 6), Math.sin(a * 4) * 6, Math.sin(b) * (30 + Math.cos(a * 4) * 6)));
  }
  const text: THREE.Vector3[] = [];
  const word = 'NEOK';
  word.split('').forEach((ch, ci) => FONT[ch].forEach((row, r) => row.split('').forEach((c, cc) => {
    if (c === '1') text.push(new THREE.Vector3((ci * 6 + cc - 11.5) * 3.2, (3 - r) * 3.2, 0));
  })));
  const pyr: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const lvl = Math.floor(Math.sqrt(i / N) * 8), side = 8 - lvl;
    const a = ((i * 13) % 97) / 97 * Math.PI * 2;
    pyr.push(new THREE.Vector3(Math.cos(a) * side * 3.6, lvl * 5 - 18, Math.sin(a) * side * 3.6));
  }
  const pal = (a: RGB, b: RGB) => (i: number, n: number, t: number): RGB => {
    const u = (i / n + t * 0.05) % 1, w = 0.5 + 0.5 * Math.sin(u * Math.PI * 2);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  };
  return [
    { name: 'grille', pts: grid, col: pal(hex(0xffffff), hex(0x9ae8ff)) },
    { name: 'sphère', pts: sphere, col: pal(hex(0x00e5ff), hex(0xa64dff)) },
    { name: 'koï', pts: fill(koi, N), col: (i) => (i % 5 === 0 ? hex(0xffffff) : i % 3 === 0 ? hex(0xff3a20) : hex(0xff9a30)) },
    { name: 'cœur', pts: heart, col: pal(hex(0xff2a9d), hex(0xff6ac8)) },
    { name: 'anneau', pts: ring, col: pal(hex(0xffb000), hex(0xff2a2a)) },
    { name: 'texte', pts: fill(text, N), col: pal(hex(0x00e5ff), hex(0xffffff)) },
    { name: 'pyramide', pts: pyr, col: pal(hex(0xffb000), hex(0xffe8a0)) },
  ];
}

function dragonGeometry(part: 'head' | 'body' | 'tail') {
  const a = new Accum();
  const red = hex(0xc0201a), gold = hex(0xffc030), dk = hex(0x3a0a08);
  const pole = (z: number) => a.addBox(-0.05, -1.1, z - 0.05, 0.05, -0.2, z + 0.05, hex(0x3a2a1a), STYLE.SOLID, 0, 0, 0);
  if (part === 'body') {
    a.addBox(-0.55, -0.45, -0.85, 0.55, 0.45, 0.85, red, STYLE.SOLID, 4, 0, 0);
    a.addBox(-0.57, -0.1, -0.8, 0.57, 0.05, 0.8, gold, STYLE.EMISSIVE, 0, 1.6, 0);
    a.addBox(-0.12, 0.45, -0.7, 0.12, 0.75, 0.7, hex(0xff8a20), STYLE.SOLID, 6, 0, 0);
    a.addBox(-0.5, -0.5, -0.7, 0.5, -0.45, 0.7, hex(0xffe080), STYLE.SOLID, 0, 0, 0);
    pole(0);
  } else if (part === 'head') {
    a.addBox(-0.7, -0.55, -0.6, 0.7, 0.6, 0.9, red, STYLE.SOLID, 8, 0, 0);
    a.addBox(-0.6, -0.75, 0.4, 0.6, -0.35, 1.5, dk, STYLE.SOLID, 0, 0, 0);            // mâchoire
    a.addBox(-0.55, -0.35, 0.9, 0.55, 0.25, 1.45, red, STYLE.SOLID, 9, 0, 0);          // museau
    a.addBox(-0.45, 0.15, 0.75, -0.2, 0.4, 0.95, hex(0xfff060), STYLE.EMISSIVE, 0, 5, 0);
    a.addBox(0.2, 0.15, 0.75, 0.45, 0.4, 0.95, hex(0xfff060), STYLE.EMISSIVE, 0, 5, 0);
    a.addBox(-0.5, 0.6, -0.3, -0.35, 1.3, -0.15, gold, STYLE.SOLID, 0, 0, 0);           // cornes
    a.addBox(0.35, 0.6, -0.3, 0.5, 1.3, -0.15, gold, STYLE.SOLID, 0, 0, 0);
    a.addBox(-0.8, -0.3, -0.7, 0.8, 0.8, -0.3, hex(0xff8a20), STYLE.SOLID, 7, 0, 0);    // crinière
    for (const s of [-1, 1]) a.addBox(s * 0.55, -0.1, 1.3, s * 1.3, -0.05, 1.35, gold, STYLE.EMISSIVE, 0, 2, 0); // moustaches
    a.addBox(-0.4, -0.7, 1.1, 0.4, -0.55, 1.4, hex(0xffffff), STYLE.SOLID, 0, 0, 0);    // crocs
    pole(0);
  } else {
    a.addBox(-0.35, -0.3, -0.8, 0.35, 0.3, 0.8, red, STYLE.SOLID, 4, 0, 0);
    a.addBox(-0.6, -0.1, -1.4, 0.6, 0.4, -0.8, hex(0xff8a20), STYLE.SOLID, 0, 0, 0);
    a.addBox(-0.37, -0.05, -0.75, 0.37, 0.05, 0.75, gold, STYLE.EMISSIVE, 0, 1.6, 0);
    pole(0);
  }
  return a.build();
}

// ---------------------------------------------------------------------------
export class Events {
  group = new THREE.Group();
  lights: LightSrc[] = [];
  /** Sources sonores (sirènes de la poursuite, fugitif). */
  nearest: Mover[] = [];
  notice: EventNotice | null = null;
  /** Événements dont le joueur est témoin à cette image (carnet). */
  witnessed: EventNotice['id'][] = [];
  /** Bruits ponctuels : tambour, pétards, coupure, retour du courant, essaim (volume 0..1). */
  sfx = { drum: -1, cracker: -1, blackOn: false, blackOff: false, swarm: 0 };

  private rng: RNG;
  private city: City;
  private pool: LightPool;
  // poursuite
  private chase = { t: -1, next: 55, axis: 0 as 0 | 1, c: 0, y: 100, dir: 1 as 1 | -1, notified: false };
  private chaseMesh: THREE.InstancedMesh;
  private copMesh: THREE.InstancedMesh;
  private chaseLights: LightSrc[] = [];
  // coupure de courant
  private black = { t: -1, next: 150, id: 0, dur: 24, on: false };
  // drones
  private drones = { t: -1, next: 95, x: 0, z: 0, y: 140, yaw: 0, from: [] as THREE.Vector3[], cur: [] as THREE.Vector3[] };
  private droneMesh: THREE.InstancedMesh;
  private droneLight: LightSrc = { x: 0, y: -9999, z: 0, r: 0, g: 0, b: 0, radius: 140 };
  private shapeList = shapes();
  // dragon
  private dragon = { t: -1, next: 70, path: [] as [number, number][], cum: [] as number[], len: 0, nextDrum: 0, nextCrack: 0, lastCrack: -9 };
  private dragonHead: THREE.Mesh;
  private dragonTail: THREE.Mesh;
  private dragonBody: THREE.InstancedMesh;
  private carriers: THREE.InstancedMesh;
  private crackers: THREE.InstancedMesh;
  private dragonLight: LightSrc = { x: 0, y: -9999, z: 0, r: 2.2, g: 0.6, b: 0.2, radius: 16 };
  private crackLight: LightSrc = { x: 0, y: -9999, z: 0, r: 0, g: 0, b: 0, radius: 14 };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(city: City, pool: LightPool, dynMat: THREE.Material, pedMat: THREE.Material, seed: number) {
    this.city = city;
    this.pool = pool;
    this.rng = new RNG(seed ^ 0x3c6ef372);
    const rng = this.rng;
    // poursuite : fugitif + deux voitures de police
    this.chaseMesh = new THREE.InstancedMesh(carGeometry(false), dynMat, 1);
    this.chaseMesh.setColorAt(0, this.c.setHex(0xffd000));
    this.copMesh = new THREE.InstancedMesh(carGeometry(true), dynMat, 2);
    for (let i = 0; i < 2; i++) this.copMesh.setColorAt(i, this.c.setHex(i ? 0xd8dce4 : 0x10182a));
    for (const m of [this.chaseMesh, this.copMesh]) { m.frustumCulled = false; m.visible = false; this.group.add(m); }
    for (let i = 0; i < 3; i++) this.chaseLights.push({ x: 0, y: -9999, z: 0, r: 0, g: 0, b: 0, radius: 30 });
    // drones : cubes lumineux (HDR)
    const dmat = new THREE.MeshBasicMaterial({ fog: true });
    dmat.color.setRGB(3.2, 3.2, 3.2);
    this.droneMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), dmat, N_DRONES);
    this.droneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N_DRONES; i++) this.droneMesh.setColorAt(i, this.c.setRGB(1, 1, 1));
    this.droneMesh.frustumCulled = false;
    this.droneMesh.visible = false;
    this.group.add(this.droneMesh);
    for (let i = 0; i < N_DRONES; i++) { this.drones.from.push(new THREE.Vector3()); this.drones.cur.push(new THREE.Vector3()); }
    // lieu du spectacle : au-dessus du quartier riche (ou du centre)
    const at = (id: DistrictId) => {
      let sx = 0, sz = 0, n = 0;
      for (let bi = 0; bi < BLOCKS; bi++) for (let bj = 0; bj < BLOCKS; bj++) if (city.districts.grid[bi * BLOCKS + bj] === id) { sx += -HALF + (bi + 0.5) * PITCH; sz += -HALF + (bj + 0.5) * PITCH; n++; }
      return n ? [sx / n, sz / n] : null;
    };
    const dp = at('riche') ?? at('centre') ?? [0, 0];
    this.drones.x = dp[0]; this.drones.z = dp[1];
    // dragon : îlot du quartier de Jade le plus central
    const asia = at('asia');
    this.dragonBody = new THREE.InstancedMesh(dragonGeometry('body'), dynMat, 10);
    this.dragonHead = new THREE.Mesh(dragonGeometry('head'), dynMat);
    this.dragonTail = new THREE.Mesh(dragonGeometry('tail'), dynMat);
    this.dragonBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cg = pedGeometry(0);
    const ca = new THREE.InstancedBufferAttribute(new Float32Array(15 * 4), 4);
    cg.setAttribute('aInst', ca);
    for (let i = 0; i < 15; i++) ca.setXYZW(i, rng.next(), 1, rng.next(), i < 12 ? 11 : 4);
    this.carriers = new THREE.InstancedMesh(cg, pedMat, 15);
    for (let i = 0; i < 15; i++) this.carriers.setColorAt(i, this.c.setHex(i < 12 ? (i % 2 ? 0xd8a020 : 0xb01818) : 0x1a1a1a));
    this.carriers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cmat = new THREE.MeshBasicMaterial({ fog: true });
    cmat.color.setRGB(4, 3, 1.5);
    this.crackers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), cmat, 24);
    this.crackers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const o of [this.dragonBody, this.dragonHead, this.dragonTail, this.carriers, this.crackers]) { o.frustumCulled = false; o.visible = false; this.group.add(o); }
    if (asia) {
      const [bi, bj] = [Math.floor((asia[0] + HALF) / PITCH), Math.floor((asia[1] + HALF) / PITCH)];
      const x0 = -HALF + bi * PITCH + 9 + 2, z0 = -HALF + bj * PITCH + 9 + 2, x1 = x0 + 74, z1 = z0 + 74;
      this.dragon.path = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
      this.dragon.cum = [0];
      for (let i = 1; i < this.dragon.path.length; i++) this.dragon.cum.push(this.dragon.cum[i - 1] + Math.hypot(this.dragon.path[i][0] - this.dragon.path[i - 1][0], this.dragon.path[i][1] - this.dragon.path[i - 1][1]));
      this.dragon.len = this.dragon.cum[this.dragon.cum.length - 1];
    }
    this.lights.push(...this.chaseLights, this.droneLight, this.dragonLight, this.crackLight);
  }

  private pathAt(s: number): [number, number, number, number] {
    const D = this.dragon;
    s = ((s % D.len) + D.len) % D.len;
    let k = 0;
    while (k < D.cum.length - 2 && D.cum[k + 1] < s) k++;
    const a = D.path[k], b = D.path[k + 1];
    const L = D.cum[k + 1] - D.cum[k];
    const u = (s - D.cum[k]) / L;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  }

  update(dt: number, t: number, cam: THREE.Vector3, player: THREE.Vector3, beams: Beams) {
    const rng = this.rng;
    this.notice = null;
    this.witnessed = [];
    this.nearest = [];
    this.sfx.drum = -1; this.sfx.cracker = -1; this.sfx.blackOn = false; this.sfx.blackOff = false; this.sfx.swarm = 0;

    // ---- course-poursuite dans le ciel ----
    const C = this.chase;
    if (C.t < 0 && t > C.next && this.city.lanes.length) {
      const ln = rng.pick(this.city.lanes);
      C.t = 0; C.axis = ln.axis; C.c = ln.coord; C.y = ln.y + 6; C.dir = rng.chance(0.5) ? 1 : -1; C.notified = false;
    }
    if (C.t >= 0) {
      C.t += dt;
      const L = HALF + 380, speed = 58;
      const head = -L + C.t * speed;
      if (head > L + 120) { C.t = -1; C.next = t + rng.range(140, 240); this.chaseMesh.visible = this.copMesh.visible = false; for (const l of this.chaseLights) l.y = -9999; }
      else {
        this.chaseMesh.visible = this.copMesh.visible = true;
        const pos = (p: number, k: number): [number, number, number] => {
          const w = Math.sin(t * 0.9 + k) * 7, h = Math.sin(t * 0.7 + k * 2) * 4;
          const pp = p * C.dir;
          return C.axis === 0 ? [pp, C.y + h, C.c + w] : [C.c + w, C.y + h, pp];
        };
        const yaw = C.axis === 0 ? (C.dir > 0 ? 0 : Math.PI) : C.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        const f = pos(head, 0);
        this.place(this.chaseMesh, 0, f, yaw, Math.sin(t * 1.3) * 0.35);
        for (let i = 0; i < 2; i++) {
          const pc = pos(head - 28 - i * 20, 1.5 + i);
          this.place(this.copMesh, i, pc, yaw, Math.sin(t * 1.1 + i) * 0.3);
          beams.add(pc[0], pc[1] - 0.2, pc[2], f[0] - pc[0], f[1] - pc[1] - 1, f[2] - pc[2], 30 + i * 18, 2.2, 0.08, 0.085, 0.1);
          const cyc = (t * 1.6 + i * 0.5) % 1;
          const L2 = this.chaseLights[i + 1];
          L2.x = pc[0]; L2.y = pc[1] + 1; L2.z = pc[2];
          L2.r = cyc < 0.25 ? 3 : 0; L2.g = 0; L2.b = cyc > 0.5 && cyc < 0.75 ? 3.2 : 0;
          const d2 = (pc[0] - cam.x) ** 2 + (pc[1] - cam.y) ** 2 + (pc[2] - cam.z) ** 2;
          const vv = C.dir * speed;
          this.nearest.push({ x: pc[0], y: pc[1], z: pc[2], vx: C.axis === 0 ? vv : 0, vy: 0, vz: C.axis === 1 ? vv : 0, kind: 'police', d2 });
        }
        const L0 = this.chaseLights[0];
        L0.x = f[0]; L0.y = f[1]; L0.z = f[2]; L0.r = 1.4; L0.g = 1.3; L0.b = 0.8;
        const d = Math.hypot(f[0] - player.x, f[1] - player.y, f[2] - player.z);
        this.nearest.push({ x: f[0], y: f[1], z: f[2], vx: C.axis === 0 ? C.dir * speed : 0, vy: 0, vz: C.axis === 1 ? C.dir * speed : 0, kind: 'flyer', d2: d * d });
        if (!C.notified && d < 450) { C.notified = true; this.notice = { id: 'chase', text: 'ALERTE · COURSE-POURSUITE EN COURS' }; }
        if (d < 250) this.witnessed.push('chase');
        this.copMesh.instanceMatrix.needsUpdate = this.chaseMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // ---- coupure de courant dans un quartier ----
    const B = this.black;
    const here = this.city.districts.idAt(player.x, player.z);
    if (B.t < 0 && t > B.next) {
      const id: DistrictId = rng.chance(0.6) && here !== 'port' ? here : rng.pick(DISTRICT_IDS.filter((d) => d !== 'port'));
      B.t = 0; B.id = DISTRICT_IDS.indexOf(id); B.dur = rng.range(20, 30); B.on = true;
      this.sfx.blackOn = id === here;
      if (id === here) this.notice = { id: 'blackout', text: `COUPURE DE COURANT · ${DISTRICTS[id].name.toUpperCase()}` };
    }
    let k = 1;
    if (B.t >= 0) {
      B.t += dt;
      const u = B.t;
      if (u < 1.8) k = rng.chance(0.5) ? 0.1 : 1;
      else if (u < B.dur - 3) k = rng.chance(0.012) ? 0.5 : 0.035;
      else if (u < B.dur) k = rng.chance((u - (B.dur - 3)) / 3) ? 1 : 0.1;
      else { B.t = -1; B.next = t + rng.range(240, 420); k = 1; if (DISTRICT_IDS[B.id] === here) this.sfx.blackOff = true; }
      if (DISTRICT_IDS[B.id] === here && B.t >= 0) this.witnessed.push('blackout');
    }
    const active = B.t >= 0;
    shared.uBlackId.value = active ? B.id : -1;
    shared.uBlackK.value = k;
    this.pool.blackId = active ? B.id : -1;
    this.pool.blackK = k;

    // ---- spectacle de drones ----
    const Dn = this.drones;
    if (Dn.t < 0 && t > Dn.next) {
      Dn.t = 0;
      Dn.yaw = Math.atan2(player.x - Dn.x, player.z - Dn.z);
      for (let i = 0; i < N_DRONES; i++) Dn.cur[i].set(Dn.x + ((i % 20) - 9.5) * 1.5, 1, Dn.z + (Math.floor(i / 20) - 9) * 1.5);
      const d = Math.hypot(player.x - Dn.x, player.z - Dn.z);
      if (d < 900) this.notice = { id: 'drones', text: 'SPECTACLE DE DRONES DANS LE CIEL' };
    }
    if (Dn.t >= 0) {
      Dn.t += dt;
      const HOLD = 10, MORPH = 4, n = this.shapeList.length;
      const total = 8 + n * HOLD + 8;
      if (Dn.t > total) { Dn.t = -1; Dn.next = t + rng.range(220, 320); this.droneMesh.visible = false; this.droneLight.y = -9999; }
      else {
        this.droneMesh.visible = true;
        const cy = Math.cos(Dn.yaw), sy = Math.sin(Dn.yaw);
        const toWorld = (p: THREE.Vector3, out: THREE.Vector3) => out.set(Dn.x + p.x * cy + p.z * sy, Dn.y + p.y, Dn.z - p.x * sy + p.z * cy);
        let si: number, w: number;
        if (Dn.t < 8) { si = 0; w = Dn.t / 8; }
        else if (Dn.t > total - 8) { si = -1; w = (Dn.t - (total - 8)) / 8; }
        else { const u = Dn.t - 8; si = Math.min(n - 1, Math.floor(u / HOLD)); w = Math.min(1, (u - si * HOLD) / MORPH); }
        const e = w * w * (3 - 2 * w);
        const shape = si >= 0 ? this.shapeList[si] : null;
        let ar = 0, ag = 0, ab = 0;
        for (let i = 0; i < N_DRONES; i++) {
          const target = this.v;
          if (shape) toWorld(shape.pts[i], target);
          else target.set(Dn.x + ((i % 20) - 9.5) * 1.5, 1, Dn.z + (Math.floor(i / 20) - 9) * 1.5);
          // on part de la position courante vers la cible (transition douce)
          const cur = Dn.cur[i];
          if (w < 0.02) Dn.from[i].copy(cur);
          cur.lerpVectors(Dn.from[i], target, e);
          cur.y += Math.sin(t * 2 + i) * 0.15;
          this.m.makeTranslation(cur.x, cur.y, cur.z);
          this.droneMesh.setMatrixAt(i, this.m);
          const col = shape ? shape.col(i, N_DRONES, t) : [1, 1, 1];
          const tw = 0.75 + 0.25 * Math.sin(t * 6 + i * 1.7);
          this.droneMesh.setColorAt(i, this.c.setRGB(col[0] * tw, col[1] * tw, col[2] * tw));
          ar += col[0]; ag += col[1]; ab += col[2];
        }
        this.droneMesh.instanceMatrix.needsUpdate = true;
        if (this.droneMesh.instanceColor) this.droneMesh.instanceColor.needsUpdate = true;
        const L = this.droneLight;
        L.x = Dn.x; L.y = Dn.y - 20; L.z = Dn.z;
        L.r = (ar / N_DRONES) * 2.2; L.g = (ag / N_DRONES) * 2.2; L.b = (ab / N_DRONES) * 2.2;
        const d = Math.hypot(player.x - Dn.x, player.y - Dn.y, player.z - Dn.z);
        if (d < 700) this.witnessed.push('drones');
        this.sfx.swarm = Math.max(0, 1 - d / 350);
      }
    }

    // ---- défilé du dragon (quartier de Jade) ----
    const G = this.dragon;
    if (G.len > 0) {
      if (G.t < 0 && t > G.next) {
        G.t = 0; G.nextDrum = 0; G.nextCrack = 2;
        if (Math.hypot(player.x - G.path[0][0], player.z - G.path[0][1]) < 350) this.notice = { id: 'dragon', text: 'DÉFILÉ DU DRAGON · QUARTIER DE JADE' };
      }
      if (G.t >= 0) {
        G.t += dt;
        const speed = 1.35, dur = G.len / speed;
        if (G.t > dur) { G.t = -1; G.next = t + rng.range(120, 200); for (const o of [this.dragonBody, this.dragonHead, this.dragonTail, this.carriers, this.crackers]) o.visible = false; this.dragonLight.y = -9999; this.crackLight.y = -9999; }
        else {
          for (const o of [this.dragonBody, this.dragonHead, this.dragonTail, this.carriers]) o.visible = true;
          const s0 = G.t * speed + 22;
          const seg = (k: number) => {
            const s = s0 - k * 1.75;
            const [x, z, hx, hz] = this.pathAt(s);
            const nx = hz, nz = -hx;
            const sway = Math.sin(t * 2.2 - k * 0.6) * 0.35;
            const y = 2.5 + 0.45 * Math.sin(t * 3.4 - k * 0.7);
            return { x: x + nx * sway, y, z: z + nz * sway, yaw: Math.atan2(hx, hz), dy: Math.cos(t * 3.4 - k * 0.7) * 0.25, px: x + nx * sway * 0.5, pz: z + nz * sway * 0.5 };
          };
          const h = seg(0);
          this.e.set(-h.dy, h.yaw, 0, 'YXZ');
          this.dragonHead.position.set(h.x, h.y + 0.2, h.z);
          this.dragonHead.quaternion.setFromEuler(this.e);
          for (let k2 = 1; k2 <= 10; k2++) {
            const p = seg(k2);
            this.e.set(-p.dy, p.yaw, 0, 'YXZ');
            this.q.setFromEuler(this.e);
            this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(1, 1, 1));
            this.dragonBody.setMatrixAt(k2 - 1, this.m);
          }
          const tl = seg(11);
          this.e.set(-tl.dy, tl.yaw, 0, 'YXZ');
          this.dragonTail.position.set(tl.x, tl.y, tl.z);
          this.dragonTail.quaternion.setFromEuler(this.e);
          // porteurs sous chaque segment, puis tambours
          for (let i = 0; i < 15; i++) {
            const p = seg(i < 12 ? i : 12.5 + (i - 12) * 1.2);
            this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.yaw);
            this.m.compose(this.s.set(p.px, 0.5, p.pz), this.q, this.v.set(1, 1, 1));
            this.carriers.setMatrixAt(i, this.m);
          }
          this.dragonBody.instanceMatrix.needsUpdate = this.carriers.instanceMatrix.needsUpdate = true;
          this.dragonLight.x = h.x; this.dragonLight.y = h.y + 1; this.dragonLight.z = h.z;
          const d = Math.hypot(player.x - h.x, player.z - h.z);
          if (d < 60) this.witnessed.push('dragon');
          // tambours (rythme) et pétards (salves)
          if (t > G.nextDrum) { G.nextDrum = t + (Math.floor(t * 2) % 4 === 3 ? 0.25 : 0.5); this.sfx.drum = d; }
          this.crackers.visible = false;
          this.crackLight.y = -9999;
          if (t > G.nextCrack) {
            G.nextCrack = t + rng.range(3, 9);
            G.lastCrack = t;
            this.sfx.cracker = d;
          }
          if (t - G.lastCrack < 0.6) {
            // éclairs de pétards pendant ~0,6 s après une salve
            this.crackers.visible = true;
            const [fx, fz] = this.pathAt(s0 + 4);
            for (let i = 0; i < 24; i++) {
              this.m.makeTranslation(fx + rng.range(-1.5, 1.5), 0.6 + rng.range(0, 1.2), fz + rng.range(-1.5, 1.5));
              this.crackers.setMatrixAt(i, this.m);
            }
            this.crackers.instanceMatrix.needsUpdate = true;
            this.crackLight.x = fx; this.crackLight.y = 1.5; this.crackLight.z = fz;
            const fl = rng.range(0.5, 1);
            this.crackLight.r = 3 * fl; this.crackLight.g = 2.2 * fl; this.crackLight.b = 1 * fl;
          }
        }
      }
    }
  }

  private place(mesh: THREE.InstancedMesh, i: number, p: [number, number, number], yaw: number, roll: number) {
    this.e.set(roll, yaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(p[0], p[1], p[2]), this.q, this.s.set(1, 1, 1));
    mesh.setMatrixAt(i, this.m);
  }
}
