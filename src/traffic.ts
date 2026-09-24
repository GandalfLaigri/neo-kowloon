import * as THREE from 'three';
import { HALF, STYLE, hex } from './config';
import { RNG } from './rng';
import { Accum, type LightSrc } from './world/builder';
import type { Lane } from './world/city';

/** Kind 0 : voiture · 1 : navette · 2 : police */
interface Car { lane: Lane; s: number; kind: number; idx: number; bob: number }

/** Source sonore mobile exposée au moteur audio. */
export interface Mover { x: number; y: number; z: number; vx: number; vy: number; vz: number; kind: string; d2: number }

const SPAN = HALF + 420;
const W: [number, number, number] = [1, 1, 1];

export function carGeometry(police = false): THREE.BufferGeometry {
  const a = new Accum();
  // avant = +x
  a.addBox(-2.25, 0, -1, 2.0, 0.9, 1, W, STYLE.SOLID, 1, 0, 1);
  a.addBox(2.0, 0.15, -0.9, 2.5, 0.7, 0.9, W, STYLE.SOLID, 2, 0, 1);
  a.addBox(-1.0, 0.9, -0.85, 1.25, 1.55, 0.85, hex(0x0a0c12), STYLE.SOLID, 3, 0, 0);
  a.addBox(-2.1, 0.9, -0.95, -1.0, 1.1, 0.95, W, STYLE.SOLID, 4, 0, 1);
  a.addBox(2.5, 0.35, -0.85, 2.6, 0.6, -0.35, hex(0xeaf4ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(2.5, 0.35, 0.35, 2.6, 0.6, 0.85, hex(0xeaf4ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(-2.35, 0.45, -0.95, -2.25, 0.75, 0.95, hex(0xff1a1a), STYLE.EMISSIVE, 0, 6, 0);
  a.addBox(-1.8, -0.15, -0.8, -0.9, 0, 0.8, hex(0x39c8ff), STYLE.EMISSIVE, 0, 4, 0);
  a.addBox(0.9, -0.15, -0.8, 1.8, 0, 0.8, hex(0x39c8ff), STYLE.EMISSIVE, 0, 4, 0);
  if (police) {
    // rampe de gyrophares + bandeau "POLICE"
    a.addBox(-0.4, 1.55, -0.8, 0.4, 1.75, -0.05, hex(0xff1a2a), STYLE.EMISSIVE, 0, 7, 4);
    a.addBox(-0.4, 1.55, 0.05, 0.4, 1.75, 0.8, hex(0x2a5aff), STYLE.EMISSIVE, 0, 7, 5);
    a.addBox(-2.0, 0.35, 1.0, 1.8, 0.6, 1.05, hex(0x40d0ff), STYLE.EMISSIVE, 0, 2, 0);
    a.addBox(-2.0, 0.35, -1.05, 1.8, 0.6, -1.0, hex(0x40d0ff), STYLE.EMISSIVE, 0, 2, 0);
  }
  return a.build();
}

function busGeometry(): THREE.BufferGeometry {
  const a = new Accum();
  a.addBox(-4.5, 0, -1.3, 4.0, 2.5, 1.3, W, STYLE.SOLID, 5, 0, 1);
  a.addBox(4.0, 0.3, -1.2, 4.75, 2.1, 1.2, hex(0x0a0c12), STYLE.SOLID, 6, 0, 0);
  a.addBox(-3.5, 0.5, 1.3, 3.0, 2.0, 1.4, hex(0x111111), STYLE.SCREEN, 17, 2.4, 0);
  a.addBox(-3.5, 0.5, -1.4, 3.0, 2.0, -1.3, hex(0x111111), STYLE.SCREEN, 42, 2.4, 0);
  a.addBox(4.75, 0.4, -1.1, 4.85, 0.8, -0.5, hex(0xeaf4ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(4.75, 0.4, 0.5, 4.85, 0.8, 1.1, hex(0xeaf4ff), STYLE.EMISSIVE, 0, 7, 0);
  a.addBox(-4.6, 0.5, -1.25, -4.5, 1.0, 1.25, hex(0xff1a1a), STYLE.EMISSIVE, 0, 6, 0);
  a.addBox(-4.0, -0.2, -1.1, 3.5, 0, 1.1, hex(0xff3fb0), STYLE.EMISSIVE, 0, 3, 0);
  a.addBox(-4.5, 2.5, -0.25, 4.0, 2.6, 0.25, hex(0xff3fb0), STYLE.EMISSIVE, 0, 3, 0);
  return a.build();
}

const BODY = [0xd8d8e0, 0x1b1d24, 0xb01842, 0x1d5fbf, 0xe0a020, 0x2a2a2a, 0x7a1fd0, 0x0f7f6f, 0xc0c4cc];

export class Traffic {
  group = new THREE.Group();
  private cars: Car[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  /** Lumières dynamiques (phares des véhicules les plus proches, gyrophares). */
  lights: LightSrc[] = [];
  /** Véhicules les plus proches du joueur (pour le son). */
  nearest: Mover[] = [];

  constructor(lanes: Lane[], mat: THREE.Material, seed: number) {
    const rng = new RNG(seed ^ 0x5bd1e995);
    const n = [0, 0, 0];
    for (const lane of lanes) {
      for (let i = 0; i < lane.count; i++) {
        const kind = rng.chance(0.08) ? 2 : rng.chance(0.15) ? 1 : 0;
        this.cars.push({ lane, s: rng.range(-SPAN, SPAN), kind, idx: n[kind]++, bob: rng.range(0, 10) });
      }
    }
    const geos = [carGeometry(), busGeometry(), carGeometry(true)];
    const c = new THREE.Color();
    geos.forEach((g, k) => {
      const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, n[k]));
      mesh.count = n[k];
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
    for (const car of this.cars) {
      c.setHex(car.kind === 1 ? rng.pick([0x1b1d24, 0x2a2a38, 0xd0d0d8]) : car.kind === 2 ? rng.pick([0x10182a, 0xd8dce4]) : rng.pick(BODY));
      this.meshes[car.kind].setColorAt(car.idx, c);
    }
    for (let i = 0; i < 4; i++) this.lights.push({ x: 0, y: -9999, z: 0, r: 0.9, g: 0.95, b: 1.0, radius: 22 });
    this.lights.push({ x: 0, y: -9999, z: 0, r: 0, g: 0, b: 0, radius: 30 }); // gyrophare le plus proche
  }

  update(dt: number, t: number, cam: THREE.Vector3) {
    const near: Mover[] = [];
    let cop: Mover | null = null;
    for (const car of this.cars) {
      const L = car.lane;
      car.s += L.dir * L.speed * dt;
      if (car.s > SPAN) car.s -= 2 * SPAN;
      if (car.s < -SPAN) car.s += 2 * SPAN;
      const y = L.y + Math.sin(t * 0.9 + car.bob) * 0.35;
      const x = L.axis === 0 ? car.s : L.coord;
      const z = L.axis === 0 ? L.coord : car.s;
      const yaw = L.axis === 0 ? (L.dir > 0 ? 0 : Math.PI) : L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.e.set(Math.sin(t * 0.7 + car.bob) * 0.03, yaw, Math.sin(t * 1.1 + car.bob) * 0.02);
      this.q.setFromEuler(this.e);
      this.p.set(x, y, z);
      this.m.compose(this.p, this.q, this.one);
      this.meshes[car.kind].setMatrixAt(car.idx, this.m);
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 160 * 160) {
        const vx = L.axis === 0 ? L.dir * L.speed : 0, vz = L.axis === 1 ? L.dir * L.speed : 0;
        const mv: Mover = { x, y, z, vx, vy: 0, vz, kind: car.kind === 2 ? 'police' : 'flyer', d2 };
        near.push(mv);
        if (car.kind === 2 && (!cop || d2 < cop.d2)) cop = mv;
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    near.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < 4; i++) {
      const l = this.lights[i];
      const n = near[i];
      if (n && n.d2 < 90 * 90) {
        const f = Math.hypot(n.vx, n.vz) || 1;
        l.x = n.x + (n.vx / f) * 6; l.y = n.y + 0.3; l.z = n.z + (n.vz / f) * 6;
      } else l.y = -9999;
    }
    const g = this.lights[4];
    if (cop && cop.d2 < 120 * 120) {
      const c = (t * 1.6) % 1;
      const red = c < 0.12 || (c > 0.2 && c < 0.32);
      const blue = (c > 0.5 && c < 0.62) || (c > 0.7 && c < 0.82);
      g.x = cop.x; g.y = cop.y + 1; g.z = cop.z;
      g.r = red ? 2.2 : 0; g.g = 0; g.b = blue ? 2.4 : 0;
    } else g.y = -9999;
    this.nearest = near.slice(0, 6);
  }
}
