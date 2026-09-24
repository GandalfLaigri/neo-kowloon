import { STYLE, hex, type RGB } from '../config';
import { RNG } from '../rng';
import type { BoxOpts, World } from './builder';
import type { Rect } from './geom';

// --- Passants : définitions produites par la génération ----------------------
/** Boucle fermée parcourue en continu (trottoirs). pause : intervalle moyen (s) entre deux arrêts. */
export interface PedLoop { pts: [number, number][]; y: number; count: number; cat?: boolean; pause?: number }
/** Segment parcouru en aller-retour (passerelles, quais, allées de marché). */
export interface PedLine { x0: number; z0: number; x1: number; z1: number; y: number; count: number; pause?: number }
/**
 * Personnage immobile. pose : 0 debout · 1 assis (y = dessus du siège) · 2 discute · 3 fume
 * · 4 travaille · 5 téléphone · 6 danse · 7 assis au clavier · 8 assis, boit · 9 allongé · 10 mains devant.
 */
export interface PedIdle { x: number; y: number; z: number; yaw: number; umbrella?: boolean; pose?: number; cat?: boolean }
/** Passage piéton : les piétons attendent au bord du trottoir et traversent au feu (axis : sens de marche). */
export interface PedCross { cx: number; cz: number; axis: 0 | 1; n: number }
export interface PedDefs { loops: PedLoop[]; lines: PedLine[]; idle: PedIdle[]; cross: PedCross[] }

/** Escalier de secours (pour la carte et le debug). */
export interface Escape { s: 0 | 1 | 2 | 3; F: number; a0: number; y0: number; y1: number }

/** Lieu remarquable, accessible depuis la carte (téléportation). */
export interface Dest { cat: string; name: string; x: number; y: number; z: number; yaw: number }

export interface Ctx {
  world: World;
  rng: RNG;
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
  /** Personnage dans une posture donnée (voir PedIdle). */
  pose(x: number, y: number, z: number, yaw: number, pose: number): void;
  /** Fumeur : cigarette incandescente et filet de fumée. */
  smoker(x: number, y: number, z: number, yaw: number): void;
  /** Petit groupe qui discute autour d'un point. */
  group(x: number, y: number, z: number, n: number): void;
  cat(x: number, y: number, z: number, yaw: number): void;
  dest(cat: string, name: string, x: number, y: number, z: number, yaw: number): void;
}

export function makeCtx(world: World, rng: RNG): Ctx {
  const peds: PedDefs = { loops: [], lines: [], idle: [], cross: [] };
  const ctx: Ctx = {
    world,
    rng,
    peds,
    escapes: [],
    dests: [],
    box: (r, y0, y1, o) => world.box(r.x0, y0, r.z0, r.x1, y1, r.z1, o),
    free: (r, y0, y1) => world.isFree(r.x0, y0, r.z0, r.x1, y1, r.z1),
    reserve: (r, y0, y1) => world.reserve(r.x0, y0, r.z0, r.x1, y1, r.z1),
    wall: (r, y0, y1) => { world.col.add(r.x0, y0, r.z0, r.x1, y1, r.z1); },
    idle: (x, y, z, yaw, umbrella) => peds.idle.push({ x, y, z, yaw, umbrella }),
    sit: (x, y, z, yaw, pose = 1) => peds.idle.push({ x, y, z, yaw, pose, umbrella: false }),
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
    dest: (cat, name, x, y, z, yaw) => ctx.dests.push({ cat, name, x, y, z, yaw }),
  };
  return ctx;
}

export const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
