import * as THREE from 'three';
import { STYLE, hex } from './config';
import type { CollisionWorld, DynBox } from './physics';
import { Accum, type LightSrc } from './world/builder';
import { SV, outOf, sideRect, type ElevatorDef } from './world/city';

type State = 'idle' | 'closing' | 'moving' | 'opening';

interface Elev {
  def: ElevatorDef;
  y: number;
  v: number;
  cur: number;
  target: number;
  queued: number;
  state: State;
  door: number[];
  floor: DynBox; ceil: DynBox; wl: DynBox; wr: DynBox; back: DynBox; front: DynBox;
  landing: DynBox[];
  light: LightSrc;
  angle: number;
  dirty: boolean;
  doorBase: number;
}

export type ElevContext =
  | { kind: 'inside'; e: Elev }
  | { kind: 'call'; e: Elev; stop: number }
  | null;

const VMAX = 24;
const ACC = 7;
const DOOR_SPEED = 1.7;

export class Elevators {
  list: Elev[] = [];
  group = new THREE.Group();
  private cabin: THREE.InstancedMesh;
  private cabinGlass: THREE.InstancedMesh;
  private doors: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(defs: ElevatorDef[], col: CollisionWorld, lights: LightSrc[], voxelMat: THREE.Material, glassMat: THREE.Material) {
    // Géométrie de cabine (repère local : porte vers -z, plancher à y=0)
    const a = new Accum();
    const metal = hex(0x2a2d35);
    const white: [number, number, number] = [1, 1, 1];
    a.addBox(-1.5, -0.5, -1.5, 1.5, 0, 1.5, metal, STYLE.SOLID, 11, 0, 0);
    a.addBox(-1.5, 3.0, -1.5, 1.5, 3.3, 1.5, metal, STYLE.SOLID, 12, 0, 0);
    a.addBox(-1.0, 2.92, -1.0, 1.0, 3.0, 1.0, hex(0xdde8ff), STYLE.EMISSIVE, 0, 2.2, 0);
    for (const x of [-1.5, 1.25]) for (const z of [-1.5, 1.25]) a.addBox(x, 0, z, x + 0.25, 3, z + 0.25, metal, STYLE.SOLID, 13, 0, 0);
    a.addBox(-1.4, 1.0, -1.2, -1.3, 1.1, 1.2, white, STYLE.EMISSIVE, 0, 2.5, 1);
    a.addBox(1.3, 1.0, -1.2, 1.4, 1.1, 1.2, white, STYLE.EMISSIVE, 0, 2.5, 1);
    a.addBox(-1.5, -0.12, -1.56, 1.5, 0, -1.5, white, STYLE.EMISSIVE, 0, 3, 1);
    a.addBox(-1.5, 3.0, -1.56, 1.5, 3.12, -1.5, white, STYLE.EMISSIVE, 0, 3, 1);
    a.addBox(1.3, 1.2, -1.2, 1.4, 1.8, -0.8, hex(0x40ffc0), STYLE.EMISSIVE, 0, 2, 0);
    const cabinGeo = a.build();

    const g = new Accum();
    const gl = hex(0x7fdfff);
    g.addBox(-1.5, 0, -1.25, -1.4, 3, 1.25, gl, STYLE.SOLID, 0, 0, 0);
    g.addBox(1.4, 0, -1.25, 1.5, 3, 1.25, gl, STYLE.SOLID, 0, 0, 0);
    g.addBox(-1.25, 0, 1.4, 1.25, 3, 1.5, gl, STYLE.SOLID, 0, 0, 0);
    const glassGeo = g.build();

    const d = new Accum();
    d.addBox(-0.75, 0, -0.07, 0.75, 3, 0.07, hex(0x9fe8ff), STYLE.SOLID, 0, 0, 0);
    const doorGeo = d.build();

    const N = defs.length;
    const nDoors = defs.reduce((s, e) => s + e.stops.length * 2, 0);
    this.cabin = new THREE.InstancedMesh(cabinGeo, voxelMat, Math.max(1, N));
    this.cabinGlass = new THREE.InstancedMesh(glassGeo, glassMat, Math.max(1, N));
    this.doors = new THREE.InstancedMesh(doorGeo, glassMat, Math.max(1, nDoors));
    for (const m of [this.cabin, this.cabinGlass, this.doors]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.cabinGlass.renderOrder = 3;
    this.doors.renderOrder = 3;
    this.cabin.count = N;
    this.cabinGlass.count = N;
    this.doors.count = nDoors;

    let doorBase = 0;
    const c = new THREE.Color();
    for (const def of defs) {
      const sv = SV[def.side];
      const e: Elev = {
        def,
        y: 0.5,
        v: 0,
        cur: 0,
        target: 0,
        queued: -1,
        state: 'idle',
        door: def.stops.map((_, i) => (i === 0 ? 1 : 0)),
        floor: col.addDyn(), ceil: col.addDyn(), wl: col.addDyn(), wr: col.addDyn(), back: col.addDyn(), front: col.addDyn(),
        landing: def.stops.map(() => col.addDyn()),
        light: { x: 0, y: 0, z: 0, r: def.accent[0] * 1.6, g: def.accent[1] * 1.6, b: def.accent[2] * 1.6, radius: 8 },
        angle: Math.atan2(sv[0], sv[1]),
        dirty: true,
        doorBase,
      };
      doorBase += def.stops.length * 2;
      lights.push(e.light);
      // portes palières
      def.stops.forEach((st, i) => {
        this.setAABB(e.landing[i], e, -1.5, 1.5, 3.1, 3.3, st.y, st.y + 3);
      });
      this.list.push(e);
      c.setRGB(def.accent[0], def.accent[1], def.accent[2]);
      this.cabin.setColorAt(this.list.length - 1, c);
    }
    this.updateAll(true);
  }

  private setAABB(b: DynBox, e: Elev, a0: number, a1: number, o0: number, o1: number, y0: number, y1: number) {
    const r = sideRect(e.def.side, e.def.F, e.def.along + a0, e.def.along + a1, o0, o1);
    b.min[0] = r.x0; b.min[1] = y0; b.min[2] = r.z0;
    b.max[0] = r.x1; b.max[1] = y1; b.max[2] = r.z1;
  }

  private place(e: Elev, a: number, o: number): [number, number] {
    const r = sideRect(e.def.side, e.def.F, e.def.along + a, e.def.along + a, o, o);
    return [r.x0, r.z0];
  }

  /** Demande un trajet vers l'arrêt i. */
  request(e: Elev, i: number) {
    if (i < 0 || i >= e.def.stops.length) return;
    if (e.state === 'idle' && e.cur === i) return;
    e.queued = i;
  }

  update(dt: number) {
    for (const e of this.list) {
      const oldY = e.y;
      switch (e.state) {
        case 'idle':
          if (e.queued >= 0 && e.queued !== e.cur) {
            e.target = e.queued;
            e.state = 'closing';
            e.dirty = true;
          }
          e.queued = -1;
          break;
        case 'closing':
          e.door[e.cur] = Math.max(0, e.door[e.cur] - dt * DOOR_SPEED);
          if (e.door[e.cur] <= 0) e.state = 'moving';
          e.dirty = true;
          break;
        case 'moving': {
          const ty = e.def.stops[e.target].y;
          const dist = ty - e.y;
          const ad = Math.abs(dist);
          e.v = Math.min(VMAX, Math.sqrt(2 * ACC * ad) + 0.3, e.v + ACC * dt);
          const step = Math.sign(dist) * e.v * dt;
          if (Math.abs(step) >= ad) {
            e.y = ty;
            e.v = 0;
            e.cur = e.target;
            e.state = 'opening';
          } else e.y += step;
          e.dirty = true;
          break;
        }
        case 'opening':
          e.door[e.cur] = Math.min(1, e.door[e.cur] + dt * DOOR_SPEED);
          if (e.door[e.cur] >= 1) e.state = 'idle';
          e.dirty = true;
          break;
      }
      const dy = e.y - oldY;
      for (const b of [e.floor, e.ceil, e.wl, e.wr, e.back, e.front]) b.dy = dy;
    }
    this.updateAll(false);
  }

  private updateAll(force: boolean) {
    let any = false;
    for (let idx = 0; idx < this.list.length; idx++) {
      const e = this.list[idx];
      if (!e.dirty && !force) continue;
      e.dirty = false;
      any = true;
      const Y = e.y;
      this.setAABB(e.floor, e, -1.5, 1.5, 3.5, 6.5, Y - 0.5, Y + 0.02);
      this.setAABB(e.ceil, e, -1.5, 1.5, 3.5, 6.5, Y + 3.02, Y + 3.32);
      this.setAABB(e.wl, e, -1.5, -1.4, 3.5, 6.5, Y, Y + 3.1);
      this.setAABB(e.wr, e, 1.4, 1.5, 3.5, 6.5, Y, Y + 3.1);
      this.setAABB(e.back, e, -1.5, 1.5, 6.4, 6.5, Y, Y + 3.1);
      this.setAABB(e.front, e, -1.5, 1.5, 3.45, 3.6, Y, Y + 3.1);
      for (const b of [e.floor, e.ceil, e.wl, e.wr, e.back]) b.enabled = true;
      e.front.enabled = e.state !== 'idle';
      e.def.stops.forEach((_, i) => (e.landing[i].enabled = e.door[i] < 0.85));

      const [cx, cz] = this.place(e, 0, 5);
      e.light.x = cx; e.light.y = Y + 2.6; e.light.z = cz;
      this.q.setFromAxisAngle(this.up, e.angle);
      this.m4.compose(this.v3.set(cx, Y + 0.02, cz), this.q, this.one);
      this.cabin.setMatrixAt(idx, this.m4);
      this.cabinGlass.setMatrixAt(idx, this.m4);

      const rotAlong = e.def.side === 0 || e.def.side === 2 ? 0 : Math.PI / 2;
      this.q.setFromAxisAngle(this.up, rotAlong);
      e.def.stops.forEach((st, i) => {
        const o = e.door[i];
        const off = 0.75 + 1.4 * smooth(o);
        for (let k = 0; k < 2; k++) {
          const [x, z] = this.place(e, k === 0 ? -off : off, 3.2);
          this.m4.compose(this.v3.set(x, st.y, z), this.q, this.one);
          this.doors.setMatrixAt(e.doorBase + i * 2 + k, this.m4);
        }
      });
    }
    if (any) {
      this.cabin.instanceMatrix.needsUpdate = true;
      this.cabinGlass.instanceMatrix.needsUpdate = true;
      this.doors.instanceMatrix.needsUpdate = true;
    }
  }

  /** Contexte d'interaction pour la position des pieds du joueur. */
  context(px: number, py: number, pz: number): ElevContext {
    for (const e of this.list) {
      const s = e.def.side;
      const a = (s === 0 || s === 2 ? px : pz) - e.def.along;
      if (a < -3 || a > 3) continue;
      const o = outOf(s, e.def.F, s === 0 || s === 2 ? pz : px);
      if (o < -2 || o > 7) continue;
      if (a > -1.5 && a < 1.5 && o > 3.4 && o < 6.5 && py > e.y - 0.6 && py < e.y + 2.5) return { kind: 'inside', e };
      if (o < 3.4) {
        for (let i = 0; i < e.def.stops.length; i++) {
          if (Math.abs(py - e.def.stops[i].y) < 1.3) {
            if (e.cur === i && e.state === 'idle') return null;
            return { kind: 'call', e, stop: i };
          }
        }
      }
    }
    return null;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
