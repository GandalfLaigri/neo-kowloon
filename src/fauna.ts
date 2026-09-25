import * as THREE from 'three';
import { STYLE, hex, type RGB } from './config';
import { RNG } from './rng';
import { Accum, type Spot } from './world/builder';

/** Géométrie d'oiseau : corps, tête, queue, deux ailes articulées (aPart.x = ±1). */
function birdGeometry(crow: boolean) {
  const a = new Accum();
  const parts: number[] = [];
  const W: RGB = [1, 1, 1];
  const s = crow ? 1.35 : 1;
  const add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB, wing = 0, style: number = STYLE.SOLID, emis = 0, extra = 1) => {
    const before = a.verts;
    a.addBox(x0 * s, y0 * s, z0 * s, x1 * s, y1 * s, z1 * s, c, style, 5, emis, extra);
    for (let i = before; i < a.verts; i++) parts.push(wing, 0.11 * s);
  };
  add(-0.07, 0.05, -0.14, 0.07, 0.16, 0.12, W);                      // corps
  add(-0.045, 0.14, 0.08, 0.045, 0.23, 0.18, crow ? W : hex(0x6a7a8a), 0, STYLE.SOLID, 0, crow ? 1 : 0); // tête
  add(-0.015, 0.16, 0.18, 0.015, 0.19, 0.23, crow ? hex(0x111111) : hex(0xc88a3a), 0, STYLE.SOLID, 0, 0); // bec
  add(-0.05, 0.09, -0.26, 0.05, 0.12, -0.13, W);                     // queue
  add(-0.03, 0, -0.01, -0.01, 0.05, 0.01, hex(0xb05a3a), 0, STYLE.SOLID, 0, 0); // pattes
  add(0.01, 0, -0.01, 0.03, 0.05, 0.01, hex(0xb05a3a), 0, STYLE.SOLID, 0, 0);
  add(0.06, 0.1, -0.08, 0.34, 0.12, 0.07, W, 1);                      // aile droite
  add(-0.34, 0.1, -0.08, -0.06, 0.12, 0.07, W, -1);                   // aile gauche
  const g = a.build();
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(parts), 2));
  return g;
}

interface Flock { x: number; y: number; z: number; r: number; crow: boolean; birds: Bird[] }
interface Bird {
  crow: boolean; i: number;
  home: number; roost: number;
  pos: THREE.Vector3; vel: THREE.Vector3; target: THREE.Vector3;
  state: 0 | 1;         // 0 posé · 1 en vol
  delay: number;        // délai avant l'envol
  stay: number;         // temps restant avant de rentrer au bercail
  yaw: number; phase: number; flap: number; peck: number;
}

/**
 * Pigeons et corbeaux : posés en groupes (places, trottoirs, toits, arbres morts),
 * ils s'envolent quand on approche et vont se poser ailleurs avant de revenir.
 */
export class Birds {
  group = new THREE.Group();
  /** Distance d'un envol survenu à cette image (-1 sinon) : bruit d'ailes. */
  flutter = -1;
  /** Un corbeau croasse près du joueur. */
  caw = false;
  private meshes: THREE.InstancedMesh[] = [];
  private inst: THREE.InstancedBufferAttribute[] = [];
  private flocks: Flock[] = [];
  private birds: Bird[] = [];
  private rng: RNG;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private one = new THREE.Vector3(1, 1, 1);
  private lastCaw = 0;

  constructor(spots: Spot[], mat: THREE.Material, seed: number) {
    const rng = (this.rng = new RNG(seed ^ 0x51ed270b));
    const counts = [0, 0];
    for (const sp of spots.filter((s) => s.kind === 'flock')) {
      const crow = sp.b > 0.5;
      const f: Flock = { x: sp.x, y: sp.y, z: sp.z, r: sp.data?.[0] ?? 2.5, crow, birds: [] };
      const fi = this.flocks.length;
      this.flocks.push(f);
      for (let k = 0; k < sp.a; k++) {
        const b: Bird = {
          crow, i: counts[crow ? 1 : 0]++, home: fi, roost: fi,
          pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(),
          state: 0, delay: 0, stay: 0, yaw: rng.range(-Math.PI, Math.PI), phase: rng.next(), flap: 0, peck: rng.range(0, 5),
        };
        this.perch(b, f);
        b.pos.copy(b.target);
        f.birds.push(b);
        this.birds.push(b);
      }
    }
    for (const crow of [false, true]) {
      const n = Math.max(1, counts[crow ? 1 : 0]);
      const g = birdGeometry(crow);
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aInst', attr);
      const mesh = new THREE.InstancedMesh(g, mat, n);
      mesh.count = counts[crow ? 1 : 0];
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setHex(crow ? rng.pick([0x16161a, 0x1a1c24, 0x121216]) : rng.pick([0x7a808a, 0x8a8e96, 0x5a5e66, 0x9a9690, 0x4a4c52])));
      this.meshes.push(mesh);
      this.inst.push(attr);
      this.group.add(mesh);
    }
    for (const b of this.birds) this.inst[b.crow ? 1 : 0].setXYZW(b.i, b.phase, 0, 0, 0);
  }

  private perch(b: Bird, f: Flock) {
    const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0, f.r);
    b.target.set(f.x + Math.cos(a) * r, f.y, f.z + Math.sin(a) * r);
  }

  update(dt: number, t: number, player: THREE.Vector3) {
    const rng = this.rng;
    this.flutter = -1;
    this.caw = false;
    // alerte : le joueur s'approche d'un groupe posé
    for (const f of this.flocks) {
      const dx = player.x - f.x, dy = player.y - f.y, dz = player.z - f.z;
      const d = Math.hypot(dx, dz);
      const R = (f.crow ? 9 : 4.5) + f.r;
      if (d > R || Math.abs(dy) > 5) continue;
      for (const b of this.birds) {
        if (b.roost !== this.flocks.indexOf(f) || b.state !== 0 || b.delay > 0) continue;
        if (Math.hypot(player.x - b.pos.x, player.z - b.pos.z) > R) continue;
        b.delay = rng.range(0.01, 0.45);
      }
      if (f.crow && t - this.lastCaw > 3 && d < 30) { this.caw = true; this.lastCaw = t + rng.range(0, 4); }
    }
    for (const b of this.birds) {
      if (b.state === 0) {
        if (b.delay > 0) {
          b.delay -= dt;
          if (b.delay <= 0) {
            // envol : vers un autre groupe de la même espèce, ou retour au bercail
            b.state = 1;
            let dest = b.home;
            if (b.roost === b.home) {
              const others = this.flocks.map((f, i) => ({ f, i })).filter(({ f, i }) => i !== b.home && f.crow === b.crow && Math.hypot(f.x - b.pos.x, f.z - b.pos.z) < 220);
              dest = others.length ? rng.pick(others).i : b.home;
            }
            b.roost = dest;
            this.perch(b, this.flocks[dest]);
            b.stay = rng.range(25, 70);
            const ax = b.pos.x - player.x, az = b.pos.z - player.z, al = Math.hypot(ax, az) || 1;
            b.vel.set((ax / al) * 3, rng.range(4.5, 6.5), (az / al) * 3);
            const d = Math.hypot(player.x - b.pos.x, player.y - b.pos.y, player.z - b.pos.z);
            if (this.flutter < 0 || d < this.flutter) this.flutter = d;
          }
        } else {
          // posé : picore, se retourne ; retour au bercail au bout d'un moment
          b.peck -= dt;
          if (b.peck < 0) { b.peck = rng.range(0.6, 4); b.yaw += rng.range(-1.2, 1.2); }
          if (b.roost !== b.home) { b.stay -= dt; if (b.stay < 0) b.delay = rng.range(0.1, 2); }
        }
      } else {
        const tx = b.target.x - b.pos.x, ty = b.target.y - b.pos.y, tz = b.target.z - b.pos.z;
        const dh = Math.hypot(tx, tz);
        const speed = b.crow ? 7.5 : 9.5;
        // arc : on vole plus haut que la cible tant qu'on en est loin
        const lift = Math.min(18, dh * 0.35);
        const aimY = ty + (dh > 6 ? lift : 0);
        const L = Math.hypot(tx, aimY, tz) || 1;
        const k = Math.min(1, dt * (dh < 8 ? 4 : 1.6));
        b.vel.x += ((tx / L) * speed - b.vel.x) * k;
        b.vel.y += ((aimY / L) * speed - b.vel.y) * k;
        b.vel.z += ((tz / L) * speed - b.vel.z) * k;
        b.pos.addScaledVector(b.vel, dt);
        if (Math.hypot(b.vel.x, b.vel.z) > 0.3) b.yaw = Math.atan2(b.vel.x, b.vel.z);
        if (dh < 0.5 && Math.abs(ty) < 0.6) { b.state = 0; b.pos.copy(b.target); b.vel.set(0, 0, 0); b.peck = 1; }
      }
      const flap = b.state === 1 ? (b.vel.y < -1.5 && b.crow ? 0.35 : 1) : 0;
      if (flap !== b.flap) { b.flap = flap; this.inst[b.crow ? 1 : 0].setY(b.i, flap); this.inst[b.crow ? 1 : 0].needsUpdate = true; }
      const bob = b.state === 0 && b.peck < 0.25 ? -0.04 : 0;
      const pitch = b.state === 1 ? Math.atan2(-b.vel.y, Math.hypot(b.vel.x, b.vel.z) + 0.01) * 0.6 : 0;
      this.e.set(pitch, b.yaw, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(b.pos.x, b.pos.y + bob, b.pos.z), this.q, this.one);
      this.meshes[b.crow ? 1 : 0].setMatrixAt(b.i, this.m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
  private v = new THREE.Vector3();
}
