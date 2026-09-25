import { STYLE, hex, type RGB } from '../config';
import { RNG } from '../rng';
import type { BoxOpts, World } from './builder';
import type { District, DistrictMap } from './districts';
import type { Rect } from './geom';

// --- Passants : définitions produites par la génération ----------------------
/** Boucle fermée parcourue en continu (trottoirs). pause : intervalle moyen (s) entre deux arrêts. */
export type Animal = 'cat' | 'rat' | 'dog';
export interface PedLoop { pts: [number, number][]; y: number; count: number; cat?: boolean; animal?: Animal; pause?: number }
/** Segment parcouru en aller-retour (passerelles, quais, allées de marché). */
export interface PedLine { x0: number; z0: number; x1: number; z1: number; y: number; count: number; pause?: number }
/**
 * Personnage immobile. pose : 0 debout · 1 assis (y = dessus du siège) · 2 discute · 3 fume
 * · 4 travaille · 5 téléphone · 6 danse · 7 assis au clavier · 8 assis, boit · 9 allongé · 10 mains devant.
 */
export interface PedIdle { x: number; y: number; z: number; yaw: number; umbrella?: boolean; pose?: number; cat?: boolean; animal?: Animal }
/** Passage piéton : les piétons attendent au bord du trottoir et traversent au feu (axis : sens de marche). */
export interface PedCross { cx: number; cz: number; axis: 0 | 1; n: number }
export interface PedDefs { loops: PedLoop[]; lines: PedLine[]; idle: PedIdle[]; cross: PedCross[] }

/** Point d'interaction : siège, distributeur, comptoir de nourriture. floor : niveau du sol devant (sièges). */
export interface InteractPoint { kind: 'seat' | 'vend' | 'food'; x: number; y: number; z: number; yaw: number; floor: number }

/** Escalator : volume où le joueur est entraîné (vx, vz en m/s). */
export interface Escalator { r: Rect; y0: number; y1: number; vx: number; vz: number }

/** Lieu secret du carnet d'exploration (découvert à moins de r mètres). */
export interface Secret { id: string; x: number; y: number; z: number; r: number }

/** Escalier de secours (pour la carte et le debug). */
export interface Escape { s: 0 | 1 | 2 | 3; F: number; a0: number; y0: number; y1: number }

/** Lieu remarquable, accessible depuis la carte (téléportation). */
export interface Dest { cat: string; name: string; x: number; y: number; z: number; yaw: number }

export interface Ctx {
  world: World;
  rng: RNG;
  districts: DistrictMap;
  /** Quartier d'un point. */
  D(x: number, z: number): District;
  peds: PedDefs;
  escapes: Escape[];
  dests: Dest[];
  box(r: Rect, y0: number, y1: number, o: BoxOpts): void;
  free(r: Rect, y0: number, y1: number): boolean;
  reserve(r: Rect, y0: number, y1: number): void;
  /** Collision seule (garde-corps invisibles). */
  wall(r: Rect, y0: number, y1: number): void;
  idle(x: number, y: number, z: number, yaw: number, umbrella?: boolean): void;
  /** Personnage assis ; y = dessus du siège (pose 1, 7 clavier ou 8 boisson). */
  sit(x: number, y: number, z: number, yaw: number, pose?: number): void;
  /** Siège : occupé par un passant, sinon libre pour le joueur (point d'interaction). */
  seat(occupied: boolean, x: number, y: number, z: number, yaw: number, pose?: number): void;
  /** Personnage dans une posture donnée (voir PedIdle). */
  pose(x: number, y: number, z: number, yaw: number, pose: number): void;
  /** Fumeur : cigarette incandescente et filet de fumée. */
  smoker(x: number, y: number, z: number, yaw: number): void;
  /** Petit groupe qui discute autour d'un point. */
  group(x: number, y: number, z: number, n: number): void;
  cat(x: number, y: number, z: number, yaw: number): void;
  /** Animal immobile (couché si lying) ou qui arpente un tracé fermé (pts). */
  animal(kind: Animal, x: number, y: number, z: number, yaw: number, lying?: boolean): void;
  animalLoop(kind: Animal, pts: [number, number][], y: number, count: number): void;
  dest(cat: string, name: string, x: number, y: number, z: number, yaw: number): void;
  points: InteractPoint[];
  secrets: Secret[];
  escalators: Escalator[];
  escalator(r: Rect, y0: number, y1: number, vx: number, vz: number): void;
  secret(id: string, x: number, y: number, z: number, r: number): void;
  /** Point d'interaction. Pour un siège, y = dessus de l'assise et floor = sol. */
  interact(kind: InteractPoint['kind'], x: number, y: number, z: number, yaw: number, floor?: number): void;
}

export function makeCtx(world: World, rng: RNG, districts: DistrictMap): Ctx {
  const peds: PedDefs = { loops: [], lines: [], idle: [], cross: [] };
  const ctx: Ctx = {
    world,
    rng,
    districts,
    D: (x, z) => districts.at(x, z),
    peds,
    escapes: [],
    dests: [],
    box: (r, y0, y1, o) => world.box(r.x0, y0, r.z0, r.x1, y1, r.z1, o),
    free: (r, y0, y1) => world.isFree(r.x0, y0, r.z0, r.x1, y1, r.z1),
    reserve: (r, y0, y1) => world.reserve(r.x0, y0, r.z0, r.x1, y1, r.z1),
    wall: (r, y0, y1) => { world.col.add(r.x0, y0, r.z0, r.x1, y1, r.z1); },
    idle: (x, y, z, yaw, umbrella) => peds.idle.push({ x, y, z, yaw, umbrella }),
    sit: (x, y, z, yaw, pose = 1) => peds.idle.push({ x, y, z, yaw, pose, umbrella: false }),
    seat: (occupied, x, y, z, yaw, pose = 1) => { if (occupied) peds.idle.push({ x, y, z, yaw, pose, umbrella: false }); else ctx.points.push({ kind: 'seat', x, y, z, yaw, floor: y - 0.4 }); },
    pose: (x, y, z, yaw, pose) => peds.idle.push({ x, y, z, yaw, pose, umbrella: false }),
    smoker: (x, y, z, yaw) => {
      peds.idle.push({ x, y, z, yaw, pose: 3, umbrella: false });
      // main levée devant le visage (bras gauche, cf. shader des passants)
      const lx = -0.29, ly = 1.6, lz = 0.59;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const hx = x + lx * c + lz * s, hz = z - lx * s + lz * c;
      world.box(hx - 0.03, y + ly - 0.03, hz - 0.03, hx + 0.03, y + ly + 0.03, hz + 0.03, { color: hex(0xff5a1a), style: STYLE.EMISSIVE, emis: 6, extra: 2, seed: rng.byte(), solid: false, noRain: true });
      world.emitSteam(hx, y + ly + 0.05, hz, 0.25, 1.6, 5, hex(0x4a4650));
    },
    group: (x, y, z, n) => {
      const a0 = rng.range(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
        const px = x + Math.sin(a) * 0.7, pz = z + Math.cos(a) * 0.7;
        peds.idle.push({ x: px, y, z: pz, yaw: a + Math.PI, pose: rng.chance(0.7) ? 2 : 0 });
      }
    },
    cat: (x, y, z, yaw) => peds.idle.push({ x, y, z, yaw, cat: true, pose: rng.chance(0.6) ? 1 : 0 }),
    animal: (kind, x, y, z, yaw, lying) => peds.idle.push({ x, y, z, yaw, animal: kind, pose: lying ?? rng.chance(0.5) ? 1 : 0 }),
    animalLoop: (kind, pts, y, count) => peds.loops.push({ pts, y, count, animal: kind }),
    dest: (cat, name, x, y, z, yaw) => ctx.dests.push({ cat, name, x, y, z, yaw }),
    points: [],
    secrets: [],
    escalators: [],
    escalator: (r, y0, y1, vx, vz) => ctx.escalators.push({ r, y0, y1, vx, vz }),
    secret: (id, x, y, z, r) => ctx.secrets.push({ id, x, y, z, r }),
    interact: (kind, x, y, z, yaw, floor) => ctx.points.push({ kind, x, y, z, yaw, floor: floor ?? y }),
  };
  return ctx;
}

export const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
