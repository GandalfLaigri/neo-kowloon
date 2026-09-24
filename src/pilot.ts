import * as THREE from 'three';
import { CLOUD_Y, HALF } from './config';
import type { CollisionWorld } from './physics';
import type { Input } from './player';
import type { Beams } from './render/beams';
import { carGeometry } from './traffic';
import type { LightSrc } from './world/builder';

export type PilotState = 'none' | 'arriving' | 'parked' | 'flying';

const R = 1.6;      // demi-emprise horizontale (indépendante du cap)
const H = 1.7;      // hauteur de la caisse
const CRUISE = 32, BOOST = 85;

/**
 * Voiture volante personnelle : appel (V), arrivée par le ciel, pilotage avec inertie,
 * collisions contre la ville, caméra de poursuite, sortie près du sol.
 */
export class Pilot {
  state: PilotState = 'none';
  mesh: THREE.InstancedMesh;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  lights: LightSrc[] = [];
  camYaw = 0;
  camPitch = -0.1;
  /** Horodatage du dernier choc (son, secousse). */
  bump = -10;
  sensitivity = 0.0022;

  private yaw = 0;          // cap de la caisse (convention véhicule : avant = +x local)
  private roll = 0;
  private pitch = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private t = 0;
  private head: LightSrc = { x: 0, y: -9999, z: 0, r: 0.95, g: 1.0, b: 1.1, radius: 24 };
  private glow: LightSrc = { x: 0, y: -9999, z: 0, r: 0.7, g: 0.15, b: 0.6, radius: 7 };
  private camPos = new THREE.Vector3();
  private camInit = false;
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private m = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private v = new THREE.Vector3();

  constructor(private col: CollisionWorld, mat: THREE.Material, private shelter: (x: number, z: number) => number) {
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, 1);
    this.mesh.setColorAt(0, new THREE.Color(0x9a1f78));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.lights.push(this.head, this.glow);
  }

  get speed() { return this.vel.length(); }
  distTo(p: THREE.Vector3) { return this.state === 'none' ? Infinity : Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z); }

  private blocked(x: number, y: number, z: number) {
    return this.col.any(x - R, y, z - R, x + R, y + H, z + R);
  }

  /** Appelle la voiture à côté du joueur (emplacement libre et ciel dégagé). Renvoie false sinon. */
  summon(p: THREE.Vector3, yaw: number): boolean {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const cands: [number, number][] = [[rx * 3.5, rz * 3.5], [-rx * 3.5, -rz * 3.5], [fx * 4.5, fz * 4.5], [-fx * 4.5, -fz * 4.5], [rx * 3.5 + fx * 3.5, rz * 3.5 + fz * 3.5], [-rx * 3.5 + fx * 3.5, -rz * 3.5 + fz * 3.5], [fx * 8, fz * 8], [rx * 6, rz * 6], [-rx * 6, -rz * 6]];
    for (const [dx, dz] of cands) {
      const x = p.x + dx, z = p.z + dz, y = p.y + 0.6;
      if (this.blocked(x, y, z) || this.shelter(x, z) > y + 2) continue;
      this.to.set(x, y, z);
      this.from.set(x - fx * 40, Math.min(CLOUD_Y - 10, y + 70), z - fz * 40);
      this.pos.copy(this.from);
      this.vel.set(0, 0, 0);
      this.yaw = yaw + Math.PI / 2;
      this.t = 0;
      this.state = 'arriving';
      this.mesh.visible = true;
      return true;
    }
    return false;
  }

  enter(camYaw: number, camPitch: number) {
    this.state = 'flying';
    this.camYaw = camYaw;
    this.camPitch = Math.max(-0.6, Math.min(0.5, camPitch));
    this.camInit = false;
  }

  /** La voiture a-t-elle un appui à moins de 5 m sous elle ? */
  nearGround() {
    const p = this.pos;
    return p.y < 5.2 || this.col.any(p.x - 0.8, p.y - 5, p.z - 0.8, p.x + 0.8, p.y - 0.05, p.z + 0.8);
  }

  /** Point de sortie du conducteur (côtés, arrière, puis toit). */
  exitPoint(out: THREE.Vector3, playerFree: (x: number, y: number, z: number) => boolean): boolean {
    if (!this.nearGround() || this.speed > 14) return false;
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);
    const sx = -fz, sz = fx;
    const y = this.pos.y + 0.05;
    for (const [dx, dz] of [[sx * 2.6, sz * 2.6], [-sx * 2.6, -sz * 2.6], [-fx * 3.6, -fz * 3.6], [fx * 3.8, fz * 3.8]]) {
      if (playerFree(this.pos.x + dx, y, this.pos.z + dz)) { out.set(this.pos.x + dx, y, this.pos.z + dz); return true; }
    }
    out.set(this.pos.x, this.pos.y + H + 0.1, this.pos.z);
    return true;
  }

  park() {
    if (this.state === 'flying') this.state = 'parked';
    this.vel.set(0, 0, 0);
  }

  update(dt: number, time: number, input: Input | null) {
    if (this.state === 'none') { this.head.y = this.glow.y = -9999; return; }
    const hover = Math.sin(time * 1.7) * 0.12;
    let bank = 0;
    if (this.state === 'arriving') {
      this.t += dt / 4;
      const u = Math.min(1, this.t);
      const e = 1 - Math.pow(1 - u, 3);
      this.pos.lerpVectors(this.from, this.to, e);
      this.pitch = -0.25 * (1 - u);
      if (u >= 1) this.state = 'parked';
    } else if (this.state === 'parked') {
      this.pitch *= 0.9;
    } else if (input) {
      // caméra à la souris
      this.camYaw -= input.dx * this.sensitivity;
      this.camPitch = Math.max(-1.2, Math.min(0.9, this.camPitch - input.dy * this.sensitivity));
      const cp = Math.cos(this.camPitch), spc = Math.sin(this.camPitch);
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
      let tx = 0, ty = 0, tz = 0;
      if (input.down('KeyW') || input.down('ArrowUp')) { tx += fx * cp; ty += spc; tz += fz * cp; }
      if (input.down('KeyS') || input.down('ArrowDown')) { tx -= fx * cp * 0.6; ty -= spc * 0.6; tz -= fz * cp * 0.6; }
      if (input.down('KeyD') || input.down('ArrowRight')) { tx += rx * 0.7; tz += rz * 0.7; }
      if (input.down('KeyA') || input.down('ArrowLeft')) { tx -= rx * 0.7; tz -= rz * 0.7; }
      if (input.down('Space')) ty += 0.8;
      if (input.down('KeyC') || input.down('ControlLeft')) ty -= 0.8;
      const boost = input.down('ShiftLeft') || input.down('ShiftRight');
      const max = boost ? BOOST : CRUISE;
      const thrust = Math.hypot(tx, ty, tz) > 0.01;
      const k = 1 - Math.exp(-dt * (thrust ? (boost ? 1.1 : 1.6) : 0.9));
      const lateralBefore = this.vel.x * rx + this.vel.z * rz;
      this.vel.x += (tx * max - this.vel.x) * k;
      this.vel.y += (ty * max * 0.7 - this.vel.y) * k;
      this.vel.z += (tz * max - this.vel.z) * k;
      // la caisse s'aligne sur le regard, s'incline dans les virages
      const target = this.camYaw + Math.PI / 2;
      let dy = target - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = dy * Math.min(1, dt * 3.5);
      this.yaw += turn;
      const lateral = this.vel.x * rx + this.vel.z * rz;
      bank = Math.max(-0.6, Math.min(0.6, -(turn / Math.max(dt, 1e-3)) * 0.12 + lateral * 0.012 + (lateral - lateralBefore) * 0.02));
      this.pitch += (Math.max(-0.35, Math.min(0.35, this.vel.y * 0.012)) - this.pitch) * Math.min(1, dt * 4);
      // déplacement par sous-pas, axe par axe, avec rebond sur les obstacles
      const n = Math.max(1, Math.ceil((this.speed * dt) / 0.4));
      const h = dt / n;
      let hit = false;
      for (let i = 0; i < n; i++) {
        for (const ax of ['x', 'y', 'z'] as const) {
          const d = this.vel[ax] * h;
          if (d === 0) continue;
          this.pos[ax] += d;
          if (this.blocked(this.pos.x, this.pos.y, this.pos.z)) {
            this.pos[ax] -= d;
            if (Math.abs(this.vel[ax]) > 6) hit = true;
            this.vel[ax] *= -0.25;
          }
        }
      }
      if (hit) this.bump = time;
      const L = HALF + 300;
      this.pos.x = Math.max(-L, Math.min(L, this.pos.x));
      this.pos.z = Math.max(-L, Math.min(L, this.pos.z));
      if (this.pos.y > CLOUD_Y + 500) { this.pos.y = CLOUD_Y + 500; this.vel.y = Math.min(0, this.vel.y); }
      if (this.pos.y < 0.05) { this.pos.y = 0.05; this.vel.y = Math.max(0, this.vel.y); }
    }
    this.roll += (bank - this.roll) * Math.min(1, dt * 3);
    const y = this.pos.y + (this.state === 'flying' ? hover * Math.max(0, 1 - this.speed / 6) : hover) + 0.15;
    this.e.set(this.roll, this.yaw, this.pitch, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(this.pos.x, y, this.pos.z), this.q, this.one);
    this.mesh.setMatrixAt(0, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    // phares, lueur du bas de caisse
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);
    this.head.x = this.pos.x + fx * 8; this.head.y = y + 0.8; this.head.z = this.pos.z + fz * 8;
    this.glow.x = this.pos.x; this.glow.y = y - 0.4; this.glow.z = this.pos.z;
  }

  /** Faisceaux des phares (entre beams.begin et beams.end). */
  drawBeams(beams: Beams) {
    if (this.state === 'none') return;
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);
    beams.add(this.pos.x + fx * 2.6, this.pos.y + 0.65, this.pos.z + fz * 2.6, fx, -0.1 + Math.sin(this.pitch) * 0.8, fz, 24, 3.4, 0.05, 0.053, 0.06);
  }

  /** Caméra de poursuite, rapprochée si un mur s'interpose. */
  applyCamera(cam: THREE.PerspectiveCamera, dt: number) {
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fx = -Math.sin(this.camYaw) * cp, fy = sp, fz = -Math.cos(this.camYaw) * cp;
    const cx = this.pos.x, cy = this.pos.y + 1.4, cz = this.pos.z;
    const dist = 9 + Math.min(6, this.speed * 0.08);
    const wx = cx - fx * dist, wy = cy - fy * dist + 2.2, wz = cz - fz * dist;
    // recul progressif jusqu'au premier obstacle
    let k = 1;
    for (let i = 1; i <= 16; i++) {
      const u = i / 16;
      const x = cx + (wx - cx) * u, y = cy + (wy - cy) * u, z = cz + (wz - cz) * u;
      if (this.col.any(x - 0.3, y - 0.3, z - 0.3, x + 0.3, y + 0.3, z + 0.3)) { k = Math.max(0.12, (i - 1.5) / 16); break; }
    }
    const tx = cx + (wx - cx) * k, ty = cy + (wy - cy) * k, tz = cz + (wz - cz) * k;
    if (!this.camInit) { this.camPos.set(tx, ty, tz); this.camInit = true; }
    const a = 1 - Math.exp(-dt * 12);
    this.camPos.x += (tx - this.camPos.x) * a;
    this.camPos.y += (ty - this.camPos.y) * a;
    this.camPos.z += (tz - this.camPos.z) * a;
    cam.position.copy(this.camPos);
    cam.lookAt(cx + fx * 8, cy + fy * 8, cz + fz * 8);
    cam.rotateZ(-this.roll * 0.25);
  }
}
