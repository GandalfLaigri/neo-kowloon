import * as THREE from 'three';
import { HALF } from './config';
import type { CollisionWorld, DynBox } from './physics';

const HW = 0.3;       // demi-largeur
const HEIGHT = 1.8;
const EYE = 1.62;
const STEP = 0.55;
const GRAV = 18;
const JUMP = 5.4;
const EPS = 1e-3;

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  /** Caractères pressés (raccourcis lettres indépendants de la disposition du clavier). */
  chars = new Set<string>();
  dx = 0;
  dy = 0;
  /** listen = false : entrée neutre (menus, carte), qui n'accumule jamais rien. */
  constructor(listen = true) {
    if (!listen) return;
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        this.chars.add(e.key.toLowerCase());
      }
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
  }
  down(c: string) { return this.keys.has(c); }
  hit(c: string) { return this.pressed.has(c); }
  hitChar(ch: string) { return this.chars.has(ch); }
  endFrame() { this.pressed.clear(); this.chars.clear(); this.dx = 0; this.dy = 0; }
}

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  fly = false;
  grounded = false;
  ground: DynBox | null = null;
  sensitivity = 0.0022;
  private bob = 0;
  private bobAmp = 0;

  constructor(private col: CollisionWorld) {}

  spawn(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.ground = null;
    this.grounded = false;
    this.yaw = yaw;
    this.pitch = pitch;
  }

  toggleFly() {
    this.fly = !this.fly;
    this.vel.set(0, 0, 0);
    if (!this.fly) {
      // sortir d'un éventuel volume solide en remontant
      let guard = 0;
      while (this.overlaps(this.pos.x, this.pos.y, this.pos.z) && guard++ < 2000) this.pos.y += 0.5;
    }
  }

  private overlaps(x: number, y: number, z: number): boolean {
    return this.col.any(x - HW, y, z - HW, x + HW, y + HEIGHT, z + HW);
  }

  update(dt: number, input: Input) {
    this.yaw -= input.dx * this.sensitivity;
    this.pitch -= input.dy * this.sensitivity;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) { mx += fx; mz += fz; }
    if (input.down('KeyS') || input.down('ArrowDown')) { mx -= fx; mz -= fz; }
    if (input.down('KeyD') || input.down('ArrowRight')) { mx += rx; mz += rz; }
    if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= rx; mz -= rz; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const run = input.down('ShiftLeft') || input.down('ShiftRight');

    if (this.fly) {
      const sp = run ? 90 : 22;
      let my = 0;
      if (input.down('Space')) my += 1;
      if (input.down('KeyC') || input.down('ControlLeft')) my -= 1;
      // en vol, avancer suit le regard
      const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
      let tx = 0, ty = 0, tz = 0;
      if (input.down('KeyW') || input.down('ArrowUp')) { tx += fx * cp; ty += sp2; tz += fz * cp; }
      if (input.down('KeyS') || input.down('ArrowDown')) { tx -= fx * cp; ty -= sp2; tz -= fz * cp; }
      if (input.down('KeyD') || input.down('ArrowRight')) { tx += rx; tz += rz; }
      if (input.down('KeyA') || input.down('ArrowLeft')) { tx -= rx; tz -= rz; }
      ty += my;
      const k = 1 - Math.exp(-dt * 5);
      this.vel.x += (tx * sp - this.vel.x) * k;
      this.vel.y += (ty * sp - this.vel.y) * k;
      this.vel.z += (tz * sp - this.vel.z) * k;
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = Math.max(0.6, Math.min(1400, this.pos.y));
      this.grounded = false;
      this.ground = null;
      this.bobAmp = 0;
      return;
    }

    // Plateforme mobile : suivre la cabine
    if (this.ground && this.ground.enabled) this.pos.y += this.ground.dy;

    const speed = run ? 8.5 : 4.3;
    const k = 1 - Math.exp(-dt * (this.grounded ? 12 : 2.5));
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    this.vel.y -= GRAV * dt;
    if (this.vel.y < -60) this.vel.y = -60;
    if (this.grounded && input.down('Space')) {
      this.vel.y = JUMP;
      this.grounded = false;
    }

    const wasGrounded = this.grounded;
    const disp = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const n = Math.max(1, Math.ceil(disp / 0.2));
    const h = dt / n;
    this.grounded = false;
    this.ground = null;
    for (let i = 0; i < n; i++) {
      this.moveY(this.vel.y * h);
      this.moveH(0, this.vel.x * h, wasGrounded || this.grounded);
      this.moveH(2, this.vel.z * h, wasGrounded || this.grounded);
    }

    // limites du quartier
    const L = HALF + 8;
    this.pos.x = Math.max(-L, Math.min(L, this.pos.x));
    this.pos.z = Math.max(-L, Math.min(L, this.pos.z));
    if (this.pos.y < -30) this.pos.y = 60;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const target = this.grounded && hs > 0.5 ? Math.min(1, hs / 6) : 0;
    this.bobAmp += (target - this.bobAmp) * (1 - Math.exp(-dt * 8));
    this.bob += dt * hs * 1.9;
  }

  private moveY(d: number) {
    if (d === 0) return;
    const p = this.pos;
    const y0 = p.y;
    p.y += d;
    let hit = false;
    this.col.query(p.x - HW, p.y, p.z - HW, p.x + HW, p.y + HEIGHT, p.z + HW, (min, max, dyn) => {
      // déjà en recouvrement avant le déplacement : on laisse s'échapper (sauf planchers mobiles)
      const already = min[1] < y0 + HEIGHT && max[1] > y0;
      if (already && !(dyn && max[1] - min[1] < 1)) return;
      const boxMid = (min[1] + max[1]) / 2;
      if (p.y + HEIGHT / 2 > boxMid) {
        if (max[1] + EPS > p.y) {
          p.y = max[1] + EPS;
          this.grounded = true;
          this.ground = dyn;
          hit = true;
        }
      } else if (min[1] - HEIGHT - EPS < p.y) {
        p.y = min[1] - HEIGHT - EPS;
        hit = true;
      }
    });
    if (hit) this.vel.y = 0;
  }

  private moveH(axis: 0 | 2, d: number, canStep: boolean) {
    if (d === 0) return;
    const p = this.pos;
    const start = axis === 0 ? p.x : p.z;
    const target = start + d;
    if (axis === 0) p.x = target; else p.z = target;
    let blocked = false;
    let stepTop = -Infinity;
    let clamp = target;
    this.col.query(p.x - HW, p.y, p.z - HW, p.x + HW, p.y + HEIGHT, p.z + HW, (min, max) => {
      if (min[axis] < start + HW && max[axis] > start - HW) return; // déjà en recouvrement
      blocked = true;
      stepTop = Math.max(stepTop, max[1]);
      if (d > 0) clamp = Math.min(clamp, min[axis] - HW - EPS);
      else clamp = Math.max(clamp, max[axis] + HW + EPS);
    });
    if (!blocked) return;
    // tentative de montée de marche
    if (canStep && stepTop - p.y <= STEP && stepTop > p.y) {
      const ny = stepTop + EPS;
      if (!this.overlaps(p.x, ny, p.z)) {
        p.y = ny;
        return;
      }
    }
    const v = d > 0 ? Math.max(start, Math.min(target, clamp)) : Math.min(start, Math.max(target, clamp));
    if (axis === 0) { p.x = v; this.vel.x = 0; } else { p.z = v; this.vel.z = 0; }
  }

  applyCamera(cam: THREE.PerspectiveCamera) {
    const bobY = Math.sin(this.bob) * 0.045 * this.bobAmp;
    const bobX = Math.cos(this.bob * 0.5) * 0.03 * this.bobAmp;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.pos.y + (this.fly ? 0 : EYE) + bobY, this.pos.z - Math.sin(this.yaw) * bobX);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** Compteur de pas (un par demi-oscillation du balancement de marche). */
  get stepCount() {
    return Math.floor(this.bob / Math.PI);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.y, this.vel.z);
  }

  get eyeY() {
    return this.pos.y + (this.fly ? 0 : EYE);
  }
}
