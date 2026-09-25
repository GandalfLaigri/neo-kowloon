import * as THREE from 'three';
import { BLOCKS, CYCLE, GREEN, HALF, PITCH, STYLE, hex, type RGB } from './config';
import type { Beams } from './render/beams';
import { RNG } from './rng';
import { carGeometry, type Mover } from './traffic';
import { Accum, type LightSrc, type Spot } from './world/builder';
import type { MetroLine } from './world/metro';

const W: RGB = [1, 1, 1];

// ---------------------------------------------------------------------------
// Géométries (avant = +x, roues au sol à y = 0)
// ---------------------------------------------------------------------------
function wheels(a: Accum, xs: number[], zw: number) {
  for (const x of xs) for (const z of [-zw, zw]) a.addBox(x - 0.35, 0, z - 0.12, x + 0.35, 0.7, z + 0.12, hex(0x0c0c0e), STYLE.SOLID, 0, 0, 0);
}
function lights(a: Accum, xf: number, xb: number, y: number, zw: number, taxi = false) {
  a.addBox(xf, y, -zw, xf + 0.08, y + 0.25, -zw + 0.4, hex(0xf4f8ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(xf, y, zw - 0.4, xf + 0.08, y + 0.25, zw, hex(0xf4f8ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(xb - 0.08, y, -zw, xb, y + 0.25, zw, hex(0xff1a1a), STYLE.EMISSIVE, 0, 5, 0);
  if (taxi) a.addBox(-0.4, 1.55, -0.3, 0.4, 1.8, 0.3, hex(0xffe14a), STYLE.EMISSIVE, 0, 3, 0);
}
function sedan(taxi: boolean) {
  const a = new Accum();
  const body: RGB = taxi ? hex(0xe0b020) : W;
  a.addBox(-2.2, 0.35, -0.9, 2.2, 1.0, 0.9, body, STYLE.SOLID, 1, 0, taxi ? 0 : 1);
  a.addBox(-1.2, 1.0, -0.8, 1.0, 1.55, 0.8, hex(0x0a0c12), STYLE.SOLID, 2, 0, 0);
  if (taxi) a.addBox(-2.2, 0.6, -0.92, 2.2, 0.75, 0.92, hex(0x111111), STYLE.SOLID, 0, 0, 0);
  wheels(a, [-1.4, 1.4], 0.82);
  lights(a, 2.2, -2.2, 0.65, 0.85, taxi);
  a.addBox(-1.6, 0.1, -0.7, 1.6, 0.2, 0.7, hex(0xff3fb0), STYLE.EMISSIVE, 0, taxi ? 0 : 2, 0);
  return a.build();
}
function van() {
  const a = new Accum();
  a.addBox(-3.2, 0.4, -1.1, 1.6, 3.0, 1.1, W, STYLE.SOLID, 3, 0, 1);
  a.addBox(1.6, 0.4, -1.1, 3.2, 2.2, 1.1, hex(0x2a2c34), STYLE.SOLID, 4, 0, 0);
  a.addBox(2.6, 1.3, -1.0, 3.22, 2.1, 1.0, hex(0x0a0c12), STYLE.SOLID, 0, 0, 0);
  a.addBox(-3.0, 0.9, 1.1, 1.4, 2.8, 1.18, hex(0x111111), STYLE.SCREEN, 88, 2, 0);
  a.addBox(-3.0, 0.9, -1.18, 1.4, 2.8, -1.1, hex(0x111111), STYLE.SCREEN, 201, 2, 0);
  wheels(a, [-2.2, 0.2, 2.3], 1.0);
  lights(a, 3.2, -3.2, 0.7, 1.0);
  a.addBox(-3.2, 2.95, -1.1, 1.6, 3.05, 1.1, hex(0xffa000), STYLE.EMISSIVE, 0, 1.5, 1);
  return a.build();
}
function moto() {
  const a = new Accum();
  a.addBox(-1.0, 0.45, -0.15, 0.9, 0.85, 0.15, W, STYLE.SOLID, 5, 0, 1);
  a.addBox(-1.05, 0, -0.08, -0.55, 0.6, 0.08, hex(0x0c0c0e), STYLE.SOLID, 0, 0, 0);
  a.addBox(0.55, 0, -0.08, 1.05, 0.6, 0.08, hex(0x0c0c0e), STYLE.SOLID, 0, 0, 0);
  // pilote
  a.addBox(-0.45, 0.85, -0.22, 0.05, 1.45, 0.22, hex(0x1a1a20), STYLE.SOLID, 6, 0, 0);
  a.addBox(-0.35, 1.45, -0.14, -0.07, 1.72, 0.14, hex(0x111114), STYLE.SOLID, 0, 0, 0);
  a.addBox(-0.08, 1.52, -0.12, -0.05, 1.62, 0.12, hex(0x40ffff), STYLE.EMISSIVE, 0, 5, 0);
  a.addBox(0.9, 0.7, -0.12, 0.98, 0.9, 0.12, hex(0xf4f8ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(-1.08, 0.6, -0.1, -1.0, 0.75, 0.1, hex(0xff1a1a), STYLE.EMISSIVE, 0, 5, 0);
  a.addBox(-0.9, 0.35, -0.16, 0.8, 0.42, 0.16, hex(0x00e5ff), STYLE.EMISSIVE, 0, 3, 0);
  return a.build();
}
function drone(kind: number) {
  const a = new Accum();
  const dk = hex(0x1a1c22);
  a.addBox(-0.35, -0.1, -0.35, 0.35, 0.1, 0.35, dk, STYLE.SOLID, 0, 0, 0);
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    a.addBox(Math.min(0, x) - 0.03, 0.02, Math.min(0, z) - 0.03, Math.max(0, x) + 0.03, 0.08, Math.max(0, z) + 0.03, dk, STYLE.SOLID, 0, 0, 0);
    a.addBox(x - 0.28, 0.1, z - 0.28, x + 0.28, 0.13, z + 0.28, hex(0x2a2c34), STYLE.SOLID, 0, 0, 0);
  }
  a.addBox(0.55, -0.02, -0.62, 0.62, 0.05, -0.48, hex(0xff2a2a), STYLE.EMISSIVE, 9, 5, 1);
  a.addBox(-0.62, -0.02, 0.48, -0.55, 0.05, 0.62, hex(0x2aff5a), STYLE.EMISSIVE, 99, 5, 1);
  a.addBox(-0.12, -0.14, -0.12, 0.12, -0.1, 0.12, hex(0xf0f6ff), STYLE.EMISSIVE, 0, kind === 2 ? 7 : 2, 0);
  if (kind === 1) a.addBox(-0.3, -0.62, -0.3, 0.3, -0.15, 0.3, hex(0xc86a2a), STYLE.SOLID, 0, 0, 0);
  if (kind === 2) {
    a.addBox(-0.3, 0.1, -0.2, -0.05, 0.2, 0.2, hex(0xff1a2a), STYLE.EMISSIVE, 0, 6, 4);
    a.addBox(0.05, 0.1, -0.2, 0.3, 0.2, 0.2, hex(0x2a5aff), STYLE.EMISSIVE, 0, 6, 5);
  }
  return a.build();
}

// ---------------------------------------------------------------------------
interface GV { lane: number; s: number; v: number; vmax: number; kind: number; idx: number; len: number; stopped: number }
interface GLane { axis: 0 | 1; t: number; dir: 1 | -1; ids: number[]; lo: number; hi: number }
interface Drone { kind: number; idx: number; axis: 0 | 1; c: number; p0: number; p1: number; y: number; speed: number; ph: number }
interface Pad { spot: Spot; idx: number; T: number; phase: number }

const L0 = -HALF - 40, L1 = HALF + 40, LEN = L1 - L0;
const CROSS = Array.from({ length: BLOCKS + 1 }, (_, j) => -HALF + j * PITCH);
const lightState = (t: number, axis: number) => {
  const t2 = (((t + axis * CYCLE / 2) % CYCLE) + CYCLE) % CYCLE;
  return t2 < GREEN ? 2 : t2 < CYCLE / 2 ? 1 : 0;
};

export class Vehicles {
  group = new THREE.Group();
  lights: LightSrc[] = [];
  /** Sources sonores proches (moteurs, klaxons, drones). */
  nearest: Mover[] = [];
  honk = 0; // horodatage du dernier coup de klaxon (joueur sur la chaussée)

  private meshes: THREE.InstancedMesh[] = [];
  private gv: GV[] = [];
  private lanes: GLane[] = [];
  private drones: Drone[] = [];
  private droneMeshes: THREE.InstancedMesh[] = [];
  private police: { spot: Spot; i: number }[] = [];
  private pads: Pad[] = [];
  private padMesh: THREE.InstancedMesh;
  private copMesh: THREE.InstancedMesh;
  private headLights: LightSrc[] = [];
  private scene: LightSrc[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(metro: MetroLine[], spots: Spot[], mat: THREE.Material, seed: number, sea = -1) {
    const rng = new RNG(seed ^ 0x1234567);
    // --- Trafic au sol ---
    const geos = [sedan(false), sedan(true), van(), moto()];
    const counts = [0, 0, 0, 0];
    for (let i = 0; i <= BLOCKS; i++) {
      const c = -HALF + i * PITCH;
      for (const axis of [0, 1] as const) {
        const onMetro = metro.some((l) => l.axis === axis && Math.abs(l.c - c) < 1);
        for (const dir of [1, -1] as const) {
          const right = axis === 0 ? dir : -dir; // conduite à droite
          for (const off of onMetro ? [5.5] : [2.5, 5.5]) {
            // côté mer : la rue s'arrête à la route côtière (sea : 0 -z · 1 +x · 2 +z · 3 -x)
            const perp = (sea === 1 || sea === 3) ? axis === 0 : (sea === 0 || sea === 2) ? axis === 1 : false;
            const lo = perp && (sea === 3 || sea === 0) ? -HALF + 12 : L0;
            const hi = perp && (sea === 1 || sea === 2) ? HALF - 12 : L1;
            const lane: GLane = { axis, t: c + right * off, dir, ids: [], lo, hi };
            const n = rng.int(3, 6);
            const base = rng.range(0, LEN);
            for (let k = 0; k < n; k++) {
              const kind = off > 5 && rng.chance(0.25) ? 2 : rng.chance(0.18) ? 1 : rng.chance(0.15) ? 3 : 0;
              const len = kind === 2 ? 6.4 : kind === 3 ? 2.1 : 4.4;
              lane.ids.push(this.gv.length);
              this.gv.push({ lane: this.lanes.length, s: lo + ((base + (k * (hi - lo)) / n) % (hi - lo)), v: 0, vmax: rng.range(9, 15), kind, idx: counts[kind]++, len, stopped: 0 });
            }
            // ordre de la file : du premier au dernier dans le sens de marche
            lane.ids.sort((a, b) => (this.gv[b].s - this.gv[a].s) * dir);
            this.lanes.push(lane);
          }
        }
      }
    }
    const c = new THREE.Color();
    geos.forEach((g, k) => {
      const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, counts[k]));
      mesh.count = counts[k];
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
    for (const v of this.gv) this.meshes[v.kind].setColorAt(v.idx, c.setHex(rng.pick([0xd8d8e0, 0x1b1d24, 0x8a1030, 0x1d4fa0, 0x2a2a2a, 0x5a5f66, 0x3a2a4a, 0xe0e0e8])));

    // --- Drones ---
    const dn = [0, 0, 0];
    for (let k = 0; k < 90; k++) {
      const kind = rng.chance(0.3) ? 2 : rng.chance(0.5) ? 1 : 0;
      const axis = rng.int(0, 1) as 0 | 1;
      const c0 = -HALF + rng.int(0, BLOCKS) * PITCH + rng.range(-6, 6);
      const p0 = rng.range(-HALF, HALF - 200);
      this.drones.push({ kind, idx: dn[kind]++, axis, c: c0, p0, p1: p0 + rng.range(120, 380), y: rng.range(kind === 2 ? 14 : 10, 36), speed: rng.range(5, 11), ph: rng.range(0, 100) });
    }
    [0, 1, 2].forEach((k) => {
      const mesh = new THREE.InstancedMesh(drone(k), mat, Math.max(1, dn[k]));
      mesh.count = dn[k];
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.droneMeshes.push(mesh);
      this.group.add(mesh);
    });

    // --- Police en vol stationnaire (scènes d'intervention) ---
    const pol = spots.filter((s) => s.kind === 'police');
    this.copMesh = new THREE.InstancedMesh(carGeometry(true), mat, Math.max(1, pol.length * 2));
    this.copMesh.count = pol.length * 2;
    this.copMesh.frustumCulled = false;
    this.copMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < pol.length * 2; i++) this.copMesh.setColorAt(i, c.setHex(i % 2 ? 0xd8dce4 : 0x10182a));
    this.group.add(this.copMesh);
    pol.forEach((spot, i) => {
      this.police.push({ spot, i });
      this.scene.push({ x: spot.x, y: 4, z: spot.z, r: 0, g: 0, b: 0, radius: 26 });
    });

    // --- Navettes des aires d'atterrissage ---
    const pads = spots.filter((s) => s.kind === 'pad');
    this.padMesh = new THREE.InstancedMesh(carGeometry(), mat, Math.max(1, pads.length));
    this.padMesh.count = pads.length;
    this.padMesh.frustumCulled = false;
    this.padMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pads.forEach((spot, i) => {
      this.pads.push({ spot, idx: i, T: 84, phase: rng.range(0, 84) });
      this.padMesh.setColorAt(i, c.setHex(rng.pick([0xd8d8e0, 0x111111, 0xb01842, 0xe0a020])));
    });
    this.group.add(this.padMesh);

    for (let i = 0; i < 6; i++) this.headLights.push({ x: 0, y: -9999, z: 0, r: 0.9, g: 0.95, b: 1.0, radius: 16 });
    this.lights.push(...this.headLights, ...this.scene);
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, roll = 0, pitch = 0) {
    this.e.set(roll, yaw, pitch, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.one);
    mesh.setMatrixAt(i, this.m);
  }

  update(dt: number, t: number, cam: THREE.Vector3, player: THREE.Vector3, beams: Beams, camFwd?: THREE.Vector3) {
    /** Point visible depuis la caméra (pour escamoter les voitures hors champ seulement). */
    const seen = (x: number, z: number) => {
      const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz);
      if (d > 220) return false;
      if (d < 25 || !camFwd) return true;
      return (dx * camFwd.x + dz * camFwd.z) / d > 0.2;
    };
    const near: Mover[] = [];
    // ---- Trafic au sol : files, feux, distance de sécurité ----
    for (const lane of this.lanes) {
      const ids = lane.ids;
      for (let k = 0; k < ids.length; k++) {
        const v = this.gv[ids[k]];
        const lead = this.gv[ids[(k - 1 + ids.length) % ids.length]];
        let limit = v.vmax;
        if (lead !== v) {
          const span = lane.hi - lane.lo;
        const gap = ((((lead.s - v.s) * lane.dir) % span) + span) % span - (lead.len + v.len) / 2 - 2.5;
          limit = Math.min(limit, Math.sqrt(2 * 5 * Math.max(0, gap)));
        }
        // feux : prochaine ligne d'arrêt
        const st = lightState(t, lane.axis);
        if (st !== 2) {
          for (const q of CROSS) {
            const stop = q - lane.dir * 14.5; // en retrait du passage piéton
            const d = (stop - v.s) * lane.dir - v.len / 2;
            if (d < -0.5 || d > 70) continue;
            if (st === 0 || d > 8) limit = Math.min(limit, Math.sqrt(2 * 5 * Math.max(0, d - 0.5)));
            break;
          }
        }
        // le joueur sur la chaussée devant le véhicule
        const px = lane.axis === 0 ? player.x : player.z, pt = lane.axis === 0 ? player.z : player.x;
        if (player.y < 2 && Math.abs(pt - lane.t) < 1.6) {
          const d = (px - v.s) * lane.dir - v.len / 2;
          if (d > 0 && d < 14) {
            limit = Math.min(limit, Math.sqrt(2 * 6 * Math.max(0, d - 2)));
            if (d < 9 && t - this.honk > 2.5) this.honk = t;
          }
        }
        const a = limit > v.v ? 3 : -7;
        v.v = Math.max(0, Math.min(limit, v.v + a * dt));
        v.s += lane.dir * v.v * dt;
        const P = (s: number): [number, number] => (lane.axis === 0 ? [s, lane.t] : [lane.t, s]);
        if (v.s > lane.hi || v.s < lane.lo) {
          // bout de rue : on ne fait réapparaître la voiture à l'autre bout que hors de la vue
          const out = v.s > lane.hi ? lane.hi : lane.lo;
          const back = v.s > lane.hi ? lane.lo : lane.hi;
          if (seen(...P(out)) || seen(...P(back))) { v.s = out; v.v = 0; }
          else v.s = back + (v.s - out);
        }
        const x = lane.axis === 0 ? v.s : lane.t, z = lane.axis === 0 ? lane.t : v.s;
        const yaw = lane.axis === 0 ? (lane.dir > 0 ? 0 : Math.PI) : lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        const lean = v.kind === 3 ? Math.sin(t * 0.8 + v.idx) * 0.05 : 0;
        this.place(this.meshes[v.kind], v.idx, x, 0, z, yaw, lean);
        const dx = x - cam.x, dy = -cam.y, dz = z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 120 * 120) {
          const vx = lane.axis === 0 ? lane.dir * v.v : 0, vz = lane.axis === 1 ? lane.dir * v.v : 0;
          near.push({ x, y: 0.8, z, vx, vy: 0, vz, kind: v.kind === 3 ? 'moto' : v.kind === 2 ? 'truck' : 'car', d2 });
        }
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    near.sort((a, b) => a.d2 - b.d2);
    // phares des plus proches (lumière + faisceau)
    for (let i = 0; i < this.headLights.length; i++) {
      const l = this.headLights[i];
      const n = near[i];
      if (n && n.d2 < 80 * 80) {
        const s = Math.hypot(n.vx, n.vz);
        const fx = s > 0.1 ? n.vx / s : 0, fz = s > 0.1 ? n.vz / s : 0;
        if (s < 0.1) { l.y = -9999; continue; }
        l.x = n.x + fx * 7; l.y = 0.9; l.z = n.z + fz * 7;
        beams.add(n.x + fx * 2.2, 0.7, n.z + fz * 2.2, fx, -0.08, fz, 16, 2.6, 0.05, 0.052, 0.058);
      } else l.y = -9999;
    }

    // ---- Drones ----
    for (const d of this.drones) {
      const span = d.p1 - d.p0;
      const per = (2 * span) / d.speed;
      const u = ((t + d.ph) % per) / per;
      const back = u > 0.5;
      const w = back ? 2 - u * 2 : u * 2;
      const e = w * w * (3 - 2 * w);
      const p = d.p0 + span * e;
      const bob = Math.sin(t * 1.7 + d.ph) * 0.25;
      const x = d.axis === 0 ? p : d.c, z = d.axis === 0 ? d.c : p;
      const y = d.y + bob;
      const yaw = d.axis === 0 ? (back ? Math.PI : 0) : back ? Math.PI / 2 : -Math.PI / 2;
      this.place(this.droneMeshes[d.kind], d.idx, x, y, z, yaw, Math.sin(t * 2 + d.ph) * 0.05);
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d.kind === 2 && d2 < 250 * 250) {
        const sx = Math.sin(t * 0.6 + d.ph) * 0.25, sz = Math.cos(t * 0.5 + d.ph) * 0.25;
        beams.add(x, y - 0.15, z, sx, -1, sz, y * 1.05, 3.2, 0.07, 0.075, 0.085);
      }
      if (d2 < 40 * 40) near.push({ x, y, z, vx: 0, vy: 0, vz: 0, kind: 'drone', d2 });
    }
    for (const m of this.droneMeshes) m.instanceMatrix.needsUpdate = true;

    // ---- Police en vol stationnaire ----
    const cyc = (t * 1.6) % 1;
    const red = cyc < 0.12 || (cyc > 0.2 && cyc < 0.32);
    const blue = (cyc > 0.5 && cyc < 0.62) || (cyc > 0.7 && cyc < 0.82);
    for (const { spot, i } of this.police) {
      const axis = spot.a, sg = spot.b;
      const along = axis === 0 ? spot.x : spot.z;
      for (let k = 0; k < 2; k++) {
        const off = (k ? 6 : -6) + Math.sin(t * 0.4 + k) * 0.8;
        const x = axis === 0 ? along + off : spot.x + Math.sin(t * 0.3 + k) * 0.5;
        const z = axis === 0 ? spot.z + Math.sin(t * 0.3 + k) * 0.5 : along + off;
        const y = spot.y + k * 2.5 + Math.sin(t * 0.9 + k * 2) * 0.3;
        const face = axis === 0 ? (k ? Math.PI : 0) : k ? Math.PI / 2 : -Math.PI / 2;
        this.place(this.copMesh, i * 2 + k, x, y, z, face + Math.sin(t * 0.2 + k) * 0.15, Math.sin(t * 0.7) * 0.04);
        const [gx, gz] = spot.data ?? [spot.x, spot.z];
        const dx = gx - x, dy = 0.5 - y, dz = gz - z;
        beams.add(x, y - 0.2, z, dx + Math.sin(t * 0.5 + k) * 1.5, dy, dz + Math.cos(t * 0.4 + k) * 1.5, Math.hypot(dx, dy, dz) * 1.05, 2.6, 0.09, 0.095, 0.11);
      }
      const L = this.scene[i];
      L.x = spot.x; L.y = spot.y; L.z = spot.z;
      L.r = red ? 2.6 : 0; L.g = 0; L.b = blue ? 2.8 : 0;
      void sg;
      const dx = spot.x - cam.x, dy = spot.y - cam.y, dz = spot.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 150 * 150) near.push({ x: spot.x, y: spot.y, z: spot.z, vx: 0, vy: 0, vz: 0, kind: 'siren', d2 });
    }
    this.copMesh.instanceMatrix.needsUpdate = true;

    // ---- Navettes : approche par la rue, atterrissage, attente, décollage ----
    for (const pd of this.pads) {
      const sp = pd.spot;
      const [sx, sz, fx, fz] = sp.data!;
      const A = sp.a;
      const legs: [number, number, number, number][] = [
        [fx, A, fz, 14], [sx, A, sz, 4], [sp.x, A, sp.z, 6], [sp.x, sp.y + 0.2, sp.z, 18],
        [sp.x, sp.y + 0.2, sp.z, 6], [sp.x, A, sp.z, 4], [sx, A, sz, 14], [fx, A, fz, 18],
      ];
      // positions clés : far → rue → au-dessus → posé → (attente) → au-dessus → rue → far → (caché)
      const keys: [number, number, number][] = [[fx, A, fz], [sx, A, sz], [sp.x, A, sp.z], [sp.x, sp.y + 0.2, sp.z], [sp.x, sp.y + 0.2, sp.z], [sp.x, A, sp.z], [sx, A, sz], [fx, A, fz]];
      const total = legs.reduce((s, l) => s + l[3], 0);
      let u = (t + pd.phase) % total;
      let i = 0;
      while (u > legs[i][3]) { u -= legs[i][3]; i++; }
      const a = keys[i], b = keys[(i + 1) % keys.length];
      const w = u / legs[i][3];
      const e = w * w * (3 - 2 * w);
      const x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e, z = a[2] + (b[2] - a[2]) * e;
      const hx = b[0] - a[0], hz = b[2] - a[2];
      // cap : direction du mouvement ; sur l'aire, la navette pivote pour repartir vers la rue
      const arrive = Math.atan2(-(sp.z - sz), sp.x - sx);
      const yaw = i === 2 ? arrive : i === 3 ? arrive + Math.PI * e : i === 4 ? arrive + Math.PI : Math.atan2(-hz, hx);
      const hidden = i === 7;
      this.place(this.padMesh, pd.idx, x, hidden ? -500 : y, z, yaw, 0, Math.sin(t * 0.8) * 0.03);
    }
    this.padMesh.instanceMatrix.needsUpdate = true;
    near.sort((a, b) => a.d2 - b.d2);
    this.nearest = near.slice(0, 8);
  }
}
