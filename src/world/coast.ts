import { BLOCKS, CONCRETE, HALF, NEON, PITCH, ROAD, SIDEWALK, STYLE, hex, type RGB } from '../config';
import { snap, type RNG } from '../rng';
import type { Tower } from './city';
import type { Ctx } from './ctx';
import type { DistrictMap } from './districts';
import { faceCoord, sidePoint, sideRect, type Rect, type Side } from './geom';

/** Niveau de l'eau (port, canal, mer). */
export const WATER_Y = -1.5;
/** Bord extérieur de la route côtière, bord du quai (distances vers le large depuis la limite du secteur). */
export const QUAY0 = ROAD / 2, QUAY1 = ROAD / 2 + 14;
const CANAL_W = 8;

export interface Canal { a0: number; a1: number; o0: number; o1: number; bi: number; bj: number }

export interface Coast {
  sea: Side;
  F: number;
  canal: Canal | null;
  /** Surfaces d'eau (monde). */
  water: Rect[];
  /** Trous à percer dans les dalles d'îlot (canal). */
  holes: Rect[];
  /** Portion de quai occupée par le port (le long de la côte). */
  port: [number, number];
}

/** Repère côtier : a le long de la côte, o vers le large (0 : limite du secteur). */
export function coastFrame(sea: Side) {
  const F = faceCoord({ x0: -HALF, z0: -HALF, x1: HALF, z1: HALF }, sea);
  const R = (a0: number, a1: number, o0: number, o1: number): Rect => sideRect(sea, F, Math.min(a0, a1), Math.max(a0, a1), Math.min(o0, o1), Math.max(o0, o1));
  const P = (a: number, o: number) => sidePoint(sea, F, a, o);
  const o = (x: number, z: number) => (sea === 0 ? F - z : sea === 1 ? x - F : sea === 2 ? z - F : F - x);
  const a = (x: number, z: number) => (sea === 0 || sea === 2 ? x : z);
  /** cap (convention passants, atan2(dx, dz)) pour regarder vers le large */
  const seaward = Math.atan2(sea === 1 ? 1 : sea === 3 ? -1 : 0, sea === 2 ? 1 : sea === 0 ? -1 : 0);
  return { F, R, P, o, a, seaward };
}

/** Choisit le côté de la mer (celui de la carte des quartiers) et l'îlot traversé par le canal. */
export function planCoast(rng: RNG, dm: DistrictMap): Coast {
  const sea = dm.sea;
  const { F, R, a: aOf } = coastFrame(sea);
  const port: number[] = [];
  const cands: [number, number][] = [];
  for (let bi = 0; bi < BLOCKS; bi++)
    for (let bj = 0; bj < BLOCKS; bj++) {
      if (dm.seaRank(bi, bj) !== 0) continue;
      const cx = -HALF + bi * PITCH + PITCH / 2, cz = -HALF + bj * PITCH + PITCH / 2;
      if (dm.grid[bi * BLOCKS + bj] === 'port') {
        port.push(aOf(cx, cz));
        cands.push([bi, bj]);
      }
    }
  const pa: [number, number] = port.length ? [Math.min(...port) - PITCH / 2, Math.max(...port) + PITCH / 2] : [0, 0];
  let canal: Canal | null = null;
  const holes: Rect[] = [];
  const water: Rect[] = [R(-3000, 3000, QUAY1 - 0.5, 3000)];
  if (cands.length > 2) {
    const [bi, bj] = cands[1 + rng.int(0, cands.length - 3)];
    const cx = -HALF + bi * PITCH + PITCH / 2, cz = -HALF + bj * PITCH + PITCH / 2;
    const ac = snap(aOf(cx, cz));
    // l'îlot va de o = -(9 + 78) à -9 ; l'intérieur (hors trottoirs) de -83 à -13
    canal = { a0: ac - CANAL_W / 2, a1: ac + CANAL_W / 2, o0: -(ROAD / 2 + 78 - SIDEWALK), o1: QUAY1, bi, bj };
    water.push(R(canal.a0, canal.a1, canal.o0, QUAY1));
    holes.push(R(canal.a0, canal.a1, canal.o0, -ROAD / 2));
  }
  void F;
  return { sea, F: coastFrame(sea).F, canal, water, holes, port: pa };
}

/** Coupe un îlot en deux lots de part et d'autre du canal (retourne les lots). */
export function canalLots(coast: Coast, I: Rect): Rect[] {
  const c = coast.canal!;
  const { R, a } = coastFrame(coast.sea);
  const ia0 = a(I.x0, I.z0), ia1 = a(I.x1, I.z1);
  const A0 = Math.min(ia0, ia1), A1 = Math.max(ia0, ia1);
  const O0 = c.o0, O1 = -(ROAD / 2 + SIDEWALK);
  return [R(A0, c.a0, O0, O1), R(c.a1, A1, O0, O1)];
}

/** Garde le rectangle du côté terre de la route côtière (routes perpendiculaires à la côte). */
export function clipToLand(coast: Coast, r: Rect): Rect | null {
  const lim = HALF + QUAY0;
  const out = { ...r };
  if (coast.sea === 1) out.x1 = Math.min(out.x1, lim);
  else if (coast.sea === 3) out.x0 = Math.max(out.x0, -lim);
  else if (coast.sea === 2) out.z1 = Math.min(out.z1, lim);
  else out.z0 = Math.max(out.z0, -lim);
  return out.x1 - out.x0 > 0.01 && out.z1 - out.z0 > 0.01 ? out : null;
}

/** Réserve le volume du canal avant la pose du mobilier. */
export function reserveCanal(ctx: Ctx, coast: Coast) {
  const c = coast.canal;
  if (!c) return;
  const { R } = coastFrame(coast.sea);
  ctx.reserve(R(c.a0 - 0.2, c.a1 + 0.2, c.o0 - 0.2, QUAY1), -4, 30);
}

// ---------------------------------------------------------------------------
// Construction : quai, canal, port, bateaux amarrés, phare, horizon marin
// ---------------------------------------------------------------------------
export function buildCoast(ctx: Ctx, coast: Coast, towers: Tower[]) {
  const { rng, world } = ctx;
  const { R, P, seaward } = coastFrame(coast.sea);
  const c = coast.canal;
  const W = WATER_Y;
  const ext = HALF + PITCH + 20;
  const concrete = hex(0x3a3a40), stone = hex(0x2e2c30);
  let quayLamps = () => {};
  const cut = (a0: number, a1: number): [number, number][] => (c ? [[a0, c.a0], [c.a1, a1]].filter(([p, q]) => q - p > 0.01) as [number, number][] : [[a0, a1]]);

  // ---- quai : dalle, mur de quai, fond de l'eau (collision) ----
  for (const [a0, a1] of cut(-ext, ext)) {
    ctx.box(R(a0, a1, QUAY0, QUAY1), 0, 0.5, { color: concrete, style: STYLE.GROUND, seed: rng.byte() });
    ctx.box(R(a0, a1, QUAY1 - 0.5, QUAY1), -3.5, 0, { color: stone, seed: rng.byte() });
  }
  for (const s of [-1, 1]) {
    const a0 = s < 0 ? -2400 : ext, a1 = s < 0 ? -ext : 2400;
    world.box(...boxArgs(R(a0, a1, QUAY0, QUAY1), -1, 0.5), { color: concrete, style: STYLE.GROUND, far: true });
  }
  ctx.wall(R(-ext, ext, QUAY1, QUAY1 + 400), -3.5, W - 0.1);
  // ---- canal : murs, passerelles, pont routier, culée ----
  if (c) {
    ctx.wall(R(c.a0, c.a1, c.o0, QUAY1), -3.5, W - 0.1);
    for (const [p0, p1] of [[c.a0 - 0.5, c.a0], [c.a1, c.a1 + 0.5]]) ctx.box(R(p0, p1, c.o0, QUAY1), -3.5, 0, { color: stone, seed: rng.byte() });
    ctx.box(R(c.a0 - 0.5, c.a1 + 0.5, c.o0 - 0.5, c.o0), -3.5, 0.5, { color: stone, seed: rng.byte() });
    ctx.box(R(c.a0 + 2, c.a1 - 2, c.o0, c.o0 + 0.05), -1.4, 0.2, { color: hex(0x050505) });
    world.emitSteam(...P((c.a0 + c.a1) / 2, c.o0 + 1), -1.2, 1.2, 4, 10, hex(0x3a4048));
    ctx.box(R(c.a0, c.a1, -ROAD / 2 - SIDEWALK, -ROAD / 2), 0.1, 0.5, { color: concrete, style: STYLE.GROUND, seed: rng.byte() });
    ctx.box(R(c.a0, c.a1, -ROAD / 2, ROAD / 2), -0.8, -0.02, { color: stone });
    ctx.box(R(c.a0, c.a1, QUAY0, QUAY1), 0.1, 0.5, { color: concrete, style: STYLE.GROUND, seed: rng.byte() });
    // passerelles en dos d'âne
    for (const o of [c.o0 + 18, c.o0 + 44]) {
      const steps: [number, number, number][] = [[-1.2, 0, 0.9], [0, 1.6, 1.3], [1.6, CANAL_W - 1.6, 1.7], [CANAL_W - 1.6, CANAL_W, 1.3], [CANAL_W, CANAL_W + 1.2, 0.9]];
      for (const [p0, p1, y] of steps) ctx.box(R(c.a0 + p0, c.a0 + p1, o, o + 2.4), y - 0.3, y, { color: hex(0x6a2a1e), extra: 9 });
      for (const oo of [o - 0.1, o + 2.4]) ctx.box(R(c.a0 + 0.2, c.a1 - 0.2, oo, oo + 0.1), 1.7, 2.6, { color: hex(0x8a3a24), solid: false });
      ctx.wall(R(c.a0, c.a1, o - 0.15, o), 1.4, 2.8);
      ctx.wall(R(c.a0, c.a1, o + 2.4, o + 2.55), 1.4, 2.8);
    }
    // sampans amarrés le long des murs, guirlandes de lanternes
    for (let o = c.o0 + 4; o < -16; o += rng.range(9, 14)) {
      const left = rng.chance(0.5);
      const b0 = left ? c.a0 + 0.2 : c.a1 - 2.3;
      sampan(ctx, R(b0, b0 + 2.1, o, o + 5.5), rng.chance(0.7));
    }
    for (const o of [c.o0 + 10, c.o0 + 31, c.o0 + 58]) {
      for (let a = c.a0; a <= c.a1; a += 1.2) {
        const u = (a - c.a0) / CANAL_W;
        const y = 4.2 - Math.sin(u * Math.PI) * 0.7;
        const [x, z] = P(a, o);
        ctx.box({ x0: x - 0.18, x1: x + 0.18, z0: z - 0.18, z1: z + 0.18 }, y - 0.45, y, { color: rng.chance(0.8) ? hex(0xff3020) : hex(0xffb000), style: STYLE.EMISSIVE, emis: 2.4, extra: 2, seed: rng.byte(), solid: false, noRain: true });
      }
      const [lx, lz] = P((c.a0 + c.a1) / 2, o);
      world.light(lx, 3, lz, hex(0xff5a30), 1.3, 14);
    }
    // promeneurs sur les berges
    for (const a of [c.a0 - 0.8, c.a1 + 0.8]) {
      const [x0, z0] = P(a, c.o0 + 3), [x1, z1] = P(a, -16);
      ctx.peds.lines.push({ x0, z0, x1, z1, y: 0.5, count: rng.int(1, 3), pause: 12 });
    }
    const [dx, dz] = P((c.a0 + c.a1) / 2 + CANAL_W / 2 + 1.2, -30);
    ctx.dest('Port', 'Canal des Lanternes', dx, 0.52, dz, seaward + Math.PI);
  }

  // ---- mobilier de quai : bittes, chaîne, lampadaires, escaliers de débarquement ----
  const stairs: number[] = [];
  for (let a = -HALF + 60; a < HALF - 40; a += 150) if (!c || a < c.a0 - 12 || a > c.a1 + 12) stairs.push(a);
  for (const [a0, a1] of cut(-ext, ext)) {
    for (let a = a0 + 1; a < a1 - 1; a += 2.5) {
      if (stairs.some((s) => a > s - 1.5 && a < s + 5)) continue;
      ctx.box(R(a, a + 0.15, QUAY1 - 0.45, QUAY1 - 0.3), 0.5, 1.4, { color: hex(0x1d1f24), solid: false });
      ctx.box(R(a, a + 2.5, QUAY1 - 0.4, QUAY1 - 0.35), 1.15, 1.22, { color: hex(0x3a3c40), solid: false, noRain: true });
    }
    for (let a = a0 + 8; a < a1 - 4; a += 8) ctx.box(R(a, a + 0.5, QUAY1 - 1.5, QUAY1 - 1.0), 0.5, 1.0, { color: hex(0x22242a) });
  }
  for (const [a0, a1] of cut(-ext, ext)) {
    let a = a0 + 2;
    while (a < a1 - 2) {
      const gap = stairs.find((s) => s + 5 > a && s - 1.5 < a + 0.1);
      if (gap !== undefined) { a = gap + 5; continue; }
      const next = stairs.filter((s) => s - 1.5 > a).sort((p, q) => p - q)[0];
      const end = Math.min(a1 - 0.5, next !== undefined ? next - 1.5 : a1 - 0.5);
      if (end > a) ctx.wall(R(a, end, QUAY1 - 0.45, QUAY1 - 0.3), 0.5, 1.6);
      a = end + 0.01;
      if (next === undefined) break;
    }
  }
  for (const s of stairs) {
    for (let i = 0; i < 4; i++) ctx.box(R(s + i * 0.8, s + (i + 1) * 0.8, QUAY1, QUAY1 + 1.6), -3.5, 0.5 - (i + 1) * 0.5, { color: stone });
    ctx.box(R(s + 3.2, s + 5, QUAY1, QUAY1 + 1.6), -3.5, W, { color: stone });
  }
  quayLamps = () => { for (let a = -HALF + 16; a < HALF; a += 32) {
    if (c && a > c.a0 - 3 && a < c.a1 + 3) continue;
    const [x, z] = P(a, QUAY1 - 2.2);
    if (!ctx.free({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 }, 0.6, 8.5)) continue;
    const D = ctx.D(...P(a, -20));
    const col = D.lamp[0];
    ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, 0.5, 8, { color: hex(0x1c1e24) });
    ctx.box({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 }, 7.6, 8, { color: col, style: STYLE.EMISSIVE, emis: 3.5, solid: false });
    world.light(x, 7, z, col, 1.6, 20);
    world.cone(x, 7.6, z, 0, -1, 0, 7.1, 3, col, 0.06);
  } };
  // promeneurs et pêcheurs sur le quai
  {
    const [x0, z0] = P(-HALF + 10, QUAY0 + 5), [x1, z1] = P(HALF - 10, QUAY0 + 5);
    ctx.peds.lines.push({ x0, z0, x1, z1, y: 0.5, count: rng.int(10, 16), pause: 20 });
  }
  for (let i = 0; i < 14; i++) {
    const a = rng.range(-HALF + 20, HALF - 20);
    if (c && a > c.a0 - 4 && a < c.a1 + 4) continue;
    const [x, z] = P(a, QUAY1 - 1.1);
    if (!ctx.free({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, 0.6, 2)) continue;
    ctx.pose(x, 0.5, z, seaward + rng.range(-0.4, 0.4), rng.chance(0.4) ? 3 : 0);
    if (rng.chance(0.5)) {
      // canne à pêche
      const [tx, tz] = P(a, QUAY1 + 2.2);
      ctx.box({ x0: Math.min(x, tx) - 0.02, x1: Math.max(x, tx) + 0.02, z0: Math.min(z, tz) - 0.02, z1: Math.max(z, tz) + 0.02 }, 1.5, 1.55, { color: hex(0x2a2a2a), solid: false, noRain: true });
    }
  }

  // ---- le port : portiques, porte-conteneurs à quai, conteneurs ----
  const [p0, p1] = coast.port;
  if (p1 > p0) {
    const avoid = (a: number, w: number) => !!c && a + w > c.a0 - 20 && a < c.a1 + 20;
    let ships = 0;
    for (let a = p0 + 20; a < p1 - 100 && ships < 2; a += rng.range(120, 180)) {
      if (avoid(a, 95)) continue;
      cargoShip(ctx, R, P, a, 92);
      ships++;
      for (let k = 0; k < 2; k++) gantry(ctx, R, P, a + 20 + k * 38);
    }
    for (let a = p0 + 6; a < p1 - 14; a += rng.range(16, 30)) {
      if (avoid(a, 14)) continue;
      const len = rng.chance(0.5) ? 12 : 6;
      const r = R(a, a + len, QUAY0 + 1, QUAY0 + 3.5);
      for (let k = 0; k < rng.int(1, 3); k++) {
        if (!ctx.free(r, 0.5 + k * 2.6 + 0.05, 0.5 + (k + 1) * 2.6)) break;
        ctx.box(r, 0.5 + k * 2.6, 0.5 + (k + 1) * 2.6 - 0.05, { color: rng.pick(CONTAINER), style: STYLE.INDUSTRIAL, seed: rng.byte() });
      }
    }
    const [dx, dz] = P((p0 + p1) / 2, QUAY0 + 6);
    ctx.dest('Port', 'Quai des porte-conteneurs', dx, 0.52, dz, seaward + Math.PI);
  }

  quayLamps();

  // ---- ailleurs : palais flottant (quartier de Jade), village sur pilotis (bas-fonds), yacht (quartier riche) ----
  const seen = new Set<string>();
  for (let a = -HALF + 48; a < HALF; a += PITCH) {
    const id = ctx.districts.idAt(...P(a, -40));
    if (seen.has(id)) continue;
    if (id === 'asia') { floatingPalace(ctx, R, P, a - 20, seaward); seen.add(id); }
    else if (id === 'fonds') { stiltVillage(ctx, R, P, a - 30); seen.add(id); }
    else if (id === 'riche') { yacht(ctx, R, a - 22); seen.add(id); }
  }

  // ---- phare au bout d'une jetée, plateforme pétrolière, îles lointaines ----
  const la = snap(rng.range(-HALF * 0.4, HALF * 0.4));
  const jl = 240;
  if (!c || Math.abs(la - (c.a0 + c.a1) / 2) > 40) {
    ctx.box(R(la - 3, la + 3, QUAY1, QUAY1 + jl), -3.5, 0.8, { color: hex(0x3a3a3e), style: STYLE.GROUND, seed: rng.byte() });
    for (let o = QUAY1 + 20; o < QUAY1 + jl - 10; o += 20) {
      const [x, z] = P(la + 2.6, o);
      ctx.box({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15 }, 0.8, 1.8, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 4, extra: 1, seed: rng.byte(), solid: false });
    }
    const [lx, lz] = P(la, QUAY1 + jl - 6);
    let r = 3, y = 0.8;
    for (let k = 0; k < 6; k++) {
      ctx.box({ x0: lx - r, x1: lx + r, z0: lz - r, z1: lz + r }, y, y + 4, { color: k % 2 ? hex(0xb82a1e) : hex(0xd8d4cc), extra: 9 });
      y += 4; r = Math.max(1.6, r - 0.25);
    }
    ctx.box({ x0: lx - 1.6, x1: lx + 1.6, z0: lz - 1.6, z1: lz + 1.6 }, y, y + 2.5, { color: hex(0xfff4d8), style: STYLE.EMISSIVE, emis: 3.5 });
    ctx.box({ x0: lx - 2, x1: lx + 2, z0: lz - 2, z1: lz + 2 }, y + 2.5, y + 3.2, { color: hex(0x1a1a1a) });
    world.light(lx, y + 1.2, lz, hex(0xfff0c8), 2.5, 40);
    world.spot('lighthouse', lx, y + 1.25, lz, 0, 0.6, hex(0xfff0c8));
    const [dx, dz] = P(la, QUAY1 + jl - 14);
    ctx.dest('Port', 'Le vieux phare', dx, 0.82, dz, seaward + Math.PI);
    ctx.secret('phare', lx, 1, lz, 22);
  }
  // plateforme pétrolière et torchère au large
  {
    const [x, z] = P(rng.range(-400, 400), 900);
    world.box(x - 30, -3, z - 30, x + 30, 24, z + 30, { color: hex(0x2a2c30), style: STYLE.INDUSTRIAL, seed: 7, far: true });
    for (const [dx, dz] of [[-28, -28], [24, -28], [-28, 24], [24, 24]]) world.box(x + dx, -3, z + dz, x + dx + 4, 0, z + dz + 4, { color: hex(0x1a1a1e), far: true });
    world.box(x - 4, 24, z - 4, x + 4, 60, z + 4, { color: hex(0x3a3c40), style: STYLE.FENCE, far: true });
    world.box(x + 18, 24, z + 18, x + 20, 70, z + 20, { color: hex(0x2a2a2e), far: true });
    world.box(x - 31, 20, z - 31, x + 31, 20.6, z + 31, { color: hex(0xffa040), style: STYLE.EMISSIVE, emis: 3, far: true });
    world.spot('flare', x + 19, 70, z + 19, 7, rng.range(0, 10), hex(0xff7a20));
  }
  // îles couvertes de tours à l'horizon
  for (let k = 0; k < 7; k++) {
    const a0 = rng.range(-1800, 1400), o0 = rng.range(1300, 2100);
    const w = rng.range(120, 320);
    const r = R(a0, a0 + w, o0, o0 + rng.range(80, 200));
    world.box(r.x0, -2, r.z0, r.x1, 1, r.z1, { color: hex(0x1a1a22), far: true });
    for (let i = 0; i < w / 18; i++) {
      const a = a0 + rng.range(0, w - 20), o = o0 + rng.range(10, 60);
      const rr = R(a, a + rng.range(12, 26), o, o + rng.range(12, 26));
      const h = rng.range(30, 220);
      world.box(rr.x0, 1, rr.z0, rr.x1, h, rr.z1, { color: rng.pick(CONCRETE), style: rng.pick([1, 2, 3, 14]), seed: rng.byte(), extra: rng.byte(), far: true });
      if (rng.chance(0.4)) world.box(rr.x0 - 0.3, h - 1, rr.z0 - 0.3, rr.x1 + 0.3, h - 0.5, rr.z1 + 0.3, { color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 3, far: true });
    }
  }
  // bouées clignotantes
  for (let i = 0; i < 12; i++) {
    const [x, z] = P(rng.range(-HALF, HALF), rng.range(QUAY1 + 60, QUAY1 + 400));
    ctx.box({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 }, W - 0.5, W + 1.2, { color: rng.chance(0.5) ? hex(0xb82a1e) : hex(0x2a8a3a), solid: false });
    ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, W + 1.2, W + 1.6, { color: rng.chance(0.5) ? hex(0xff3020) : hex(0x40ff70), style: STYLE.EMISSIVE, emis: 5, extra: 1, seed: rng.byte(), solid: false });
  }
  void towers;
}

const CONTAINER: RGB[] = [hex(0x8a3a24), hex(0x2a5a7a), hex(0x3a6a3a), hex(0x8a7a2a), hex(0x6a2a4a), hex(0x3a3a3e), hex(0xb05a1a), hex(0x2a3a6a)];

const boxArgs = (r: Rect, y0: number, y1: number): [number, number, number, number, number, number] => [r.x0, y0, r.z0, r.x1, y1, r.z1];

type RFn = (a0: number, a1: number, o0: number, o1: number) => Rect;
type PFn = (a: number, o: number) => [number, number];

function sampan(ctx: Ctx, r: Rect, lit: boolean) {
  const { rng } = ctx;
  const W = WATER_Y;
  ctx.box(r, W - 0.6, W + 0.5, { color: rng.pick([hex(0x4a3020), hex(0x3a2a1e), hex(0x2a3a4a)]) });
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const hw = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
  const long = r.x1 - r.x0 > r.z1 - r.z0;
  const cab: Rect = long ? { x0: cx - 1.2, x1: cx + 1.2, z0: cz - hw + 0.1, z1: cz + hw - 0.1 } : { x0: cx - hw + 0.1, x1: cx + hw - 0.1, z0: cz - 1.2, z1: cz + 1.2 };
  ctx.box(cab, W + 0.5, W + 1.6, { color: hex(0x6a4a2a), solid: false });
  ctx.box({ x0: cab.x0 - 0.2, x1: cab.x1 + 0.2, z0: cab.z0 - 0.2, z1: cab.z1 + 0.2 }, W + 1.6, W + 1.75, { color: rng.pick([hex(0x2a4a8a), hex(0x8a3a24), hex(0x3a5a3a)]), solid: false });
  if (lit) {
    ctx.box({ x0: cx - 0.15, x1: cx + 0.15, z0: cz - 0.15, z1: cz + 0.15 }, W + 1.75, W + 2.2, { color: hex(0xff4020), style: STYLE.EMISSIVE, emis: 3, extra: 2, seed: rng.byte(), solid: false });
    ctx.world.light(cx, W + 2.4, cz, hex(0xff6030), 0.9, 8);
  }
}

function gantry(ctx: Ctx, R: RFn, P: PFn, a: number) {
  const { rng, world } = ctx;
  const blue = hex(0x2a5a8a), dk = hex(0x1a1c22);
  const oL = QUAY0 + 1.5, oS = QUAY1 - 1.5;
  for (const o of [oL, oS]) for (const da of [0, 9]) ctx.box(R(a + da, a + da + 1, o - 0.5, o + 0.5), 0.5, 38, { color: blue, style: STYLE.FENCE });
  for (const o of [oL, oS]) ctx.box(R(a, a + 10, o - 0.6, o + 0.6), 36, 38, { color: blue });
  ctx.box(R(a + 1, a + 9, oL, oS), 36, 38, { color: blue, style: STYLE.FENCE });
  // flèche au-dessus de l'eau, machinerie, pylônes
  ctx.box(R(a + 3, a + 7, -8, QUAY1 + 42), 38, 40, { color: blue, style: STYLE.FENCE });
  ctx.box(R(a + 2.5, a + 7.5, oL - 2, oL + 5), 40, 44, { color: hex(0xd8d8dc), style: STYLE.INDUSTRIAL, seed: rng.byte() });
  ctx.box(R(a + 4, a + 6, oL, oL + 1.5), 44, 56, { color: blue, style: STYLE.FENCE });
  ctx.box(R(a + 4.2, a + 5.8, QUAY1 + 40, QUAY1 + 42), 40, 40.6, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 5, extra: 1, seed: rng.byte(), solid: false });
  ctx.box(R(a + 4.4, a + 5.6, oL + 0.2, oL + 1.3), 56, 56.6, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 6, extra: 1, seed: rng.byte(), solid: false });
  // chariot et spreader au-dessus du navire
  const ot = QUAY1 + 10;
  ctx.box(R(a + 3.2, a + 6.8, ot - 1.5, ot + 1.5), 37, 38, { color: dk });
  ctx.box(R(a + 4.9, a + 5.1, ot - 0.1, ot + 0.1), 14, 37, { color: dk, solid: false });
  ctx.box(R(a + 3, a + 7, ot - 1.3, ot + 1.3), 13.5, 14, { color: hex(0xffb000), solid: false });
  for (const o of [QUAY1 + 4, QUAY1 + 22]) {
    const [x, z] = P(a + 5, o);
    world.cone(x, 37.5, z, 0, -1, 0, 30, 7, hex(0xfff0d8), 0.05);
    world.light(x, 20, z, hex(0xfff0d8), 1.4, 30);
  }
}

function cargoShip(ctx: Ctx, R: RFn, P: PFn, a: number, L: number) {
  const { rng, world } = ctx;
  const W = WATER_Y;
  const o0 = QUAY1 + 1.5, o1 = QUAY1 + 17.5;
  const hull = rng.pick([hex(0x3a1a18), hex(0x1a2430), hex(0x2a2a2e)]);
  ctx.box(R(a + 8, a + L - 8, o0, o1), W - 3, 5, { color: hull, seed: rng.byte() });
  // proue effilée, poupe
  for (let k = 0; k < 4; k++) ctx.box(R(a + L - 8 + k * 2, a + L - 6 + k * 2, o0 + k * 1.8, o1 - k * 1.8), W - 3, 5 + k * 0.4, { color: hull, seed: rng.byte() });
  ctx.box(R(a + 2, a + 8, o0 + 1, o1 - 1), W - 3, 5, { color: hull, seed: rng.byte() });
  ctx.box(R(a + 8, a + L - 8, o0 - 0.05, o1 + 0.05), 3.5, 3.8, { color: hex(0xd8d4cc), solid: false });
  // château arrière : passerelle de commandement éclairée
  ctx.box(R(a + 3, a + 15, o0 + 1.5, o1 - 1.5), 5, 21, { color: hex(0xd8d4cc), style: STYLE.GRID, seed: rng.byte(), extra: 180 });
  ctx.box(R(a + 2, a + 16, o0 - 0.5, o1 + 0.5), 21, 23, { color: hex(0xd8d4cc), style: STYLE.CURTAIN, seed: rng.byte(), extra: 220 });
  ctx.box(R(a + 6, a + 10, o0 + 5, o0 + 9), 23, 29, { color: hex(0xb82a1e) });
  ctx.box(R(a + 7.5, a + 8.5, o0 + 7.2, o0 + 7.8), 29, 34, { color: hex(0x2a2a2e), solid: false });
  ctx.box(R(a + 7.6, a + 8.4, o0 + 7.1, o0 + 7.9), 34, 34.5, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 6, extra: 1, seed: rng.byte(), solid: false });
  // piles de conteneurs sur le pont
  for (let aa = a + 17; aa < a + L - 12; aa += 12.5)
    for (let oo = o0 + 0.5; oo < o1 - 2.4; oo += 2.55) {
      const n = rng.int(2, 5);
      for (let k = 0; k < n; k++) ctx.box(R(aa, aa + 12.2, oo, oo + 2.45), 5 + k * 2.6, 5 + (k + 1) * 2.6 - 0.05, { color: rng.pick(CONTAINER), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    }
  const [cx, cz] = P(a + L / 2, (o0 + o1) / 2);
  world.light(cx, 12, cz, hex(0xfff0d8), 1.2, 30);
  const [dx, dz] = P(a + 16, (o0 + o1) / 2);
  ctx.dest('Port', 'Porte-conteneurs à quai', dx, 5.02, dz, 0);
}

function floatingPalace(ctx: Ctx, R: RFn, P: PFn, a: number, seaward: number) {
  const { rng, world } = ctx;
  const W = WATER_Y;
  const o0 = QUAY1 + 8, o1 = QUAY1 + 26, L = 44;
  const red = hex(0xa8281a), gold = hex(0xd8a030), green = hex(0x1e3a30);
  ctx.box(R(a, a + L, o0, o1), W - 1.5, 0.5, { color: hex(0x2a1a14), extra: 9 });
  // passerelle vers le quai
  ctx.box(R(a + L / 2 - 1.5, a + L / 2 + 1.5, QUAY1 - 0.3, o0), 0.2, 0.5, { color: hex(0x5a3a22), extra: 9 });
  let lvl = 0.5;
  for (let k = 0; k < 3; k++) {
    const inA = 3 + k * 5, inO = 1.5 + k * 2.5, h = k === 2 ? 5 : 4.5;
    const body = R(a + inA, a + L - inA, o0 + inO, o1 - inO);
    ctx.box(body, lvl, lvl + h, { color: red, style: STYLE.SHOP, emis: 1.4, seed: rng.byte() });
    const roof = R(a + inA - 1.6, a + L - inA + 1.6, o0 + inO - 1.6, o1 - inO + 1.6);
    ctx.box(roof, lvl + h, lvl + h + 0.5, { color: green, extra: 9 });
    ctx.box(R(a + inA - 1.8, a + L - inA + 1.8, o0 + inO - 1.8, o1 - inO + 1.8), lvl + h - 0.15, lvl + h, { color: gold, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
    for (const aa of [a + inA - 1.6, a + L - inA + 1.1]) for (const oo of [o0 + inO - 1.6, o1 - inO + 1.1]) ctx.box(R(aa, aa + 0.5, oo, oo + 0.5), lvl + h + 0.5, lvl + h + 1, { color: green, extra: 9 });
    lvl += h + 0.5;
  }
  ctx.box(R(a + L / 2 - 4, a + L / 2 + 4, o0 - 0.2, o0), 6, 9, { color: gold, style: STYLE.SIGN, emis: 2.6, seed: rng.byte(), extra: 2 });
  for (let aa = a + 1; aa < a + L; aa += 2.5) {
    const [x, z] = P(aa, o0 - 0.6);
    ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, 3.2, 3.7, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 3, extra: 2, seed: rng.byte(), solid: false });
  }
  const c = P(a + L / 2, (o0 + o1) / 2);
  world.light(c[0], 6, c[1], hex(0xffa050), 2.6, 40);
  const [qx, qz] = P(a + L / 2, o0 - 3);
  world.light(qx, 2, qz, hex(0xff4020), 2, 24);
  const [dx, dz] = P(a + L / 2, QUAY1 - 2);
  ctx.dest('Lieux uniques', 'Palais flottant du Dragon', dx, 0.52, dz, seaward + Math.PI);
  for (let i = 0; i < 6; i++) { const [x, z] = P(a + rng.range(4, L - 4), o0 + 1); ctx.pose(x, 0.5, z, seaward + Math.PI, rng.chance(0.5) ? 5 : 0); }
}

function yacht(ctx: Ctx, R: RFn, a: number) {
  const { rng, world } = ctx;
  const W = WATER_Y;
  const o0 = QUAY1 + 3, o1 = QUAY1 + 11;
  ctx.box(R(a, a + 34, o0, o1), W - 1, 1.5, { color: hex(0xe8e8ec), extra: 9 });
  for (let k = 0; k < 3; k++) ctx.box(R(a + 34 + k * 2, a + 36 + k * 2, o0 + 1 + k * 1.2, o1 - 1 - k * 1.2), W - 1, 1.5, { color: hex(0xe8e8ec), extra: 9 });
  ctx.box(R(a + 6, a + 26, o0 + 1, o1 - 1), 1.5, 4.5, { color: hex(0x1a2430), style: STYLE.CURTAIN, seed: rng.byte(), extra: 230 });
  ctx.box(R(a + 10, a + 22, o0 + 1.5, o1 - 1.5), 4.5, 6.5, { color: hex(0x1a2430), style: STYLE.CURTAIN, seed: rng.byte(), extra: 230 });
  ctx.box(R(a, a + 34, o0 - 0.05, o1 + 0.05), 0.6, 0.75, { color: hex(0x40d8ff), style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
  const c = R(a + 16, a + 16, (o0 + o1) / 2, (o0 + o1) / 2);
  world.light(c.x0, 7, c.z0, hex(0x9ae8ff), 1.6, 20);
}

function stiltVillage(ctx: Ctx, R: RFn, P: PFn, a: number) {
  const { rng, world } = ctx;
  const W = WATER_Y;
  // passerelle de planches sur pilotis et cabanes au-dessus de l'eau
  ctx.box(R(a, a + 60, QUAY1, QUAY1 + 2), 0.2, 0.5, { color: hex(0x4a3422) });
  for (let k = 0; k < 6; k++) {
    const aa = a + 2 + k * 10;
    const r = R(aa, aa + rng.range(5, 8), QUAY1 + 2, QUAY1 + rng.range(6, 9));
    for (const [px, pz] of [[r.x0, r.z0], [r.x1 - 0.3, r.z0], [r.x0, r.z1 - 0.3], [r.x1 - 0.3, r.z1 - 0.3]])
      ctx.box({ x0: px, x1: px + 0.3, z0: pz, z1: pz + 0.3 }, W - 1, 0.5, { color: hex(0x3a2a1e), solid: false });
    ctx.box(r, 0.2, 0.5, { color: hex(0x4a3422) });
    const h = rng.pick([2.2, 2.6]);
    ctx.box({ x0: r.x0 + 0.5, x1: r.x1 - 0.5, z0: r.z0 + 0.5, z1: r.z1 - 0.5 }, 0.5, 0.5 + h, { color: rng.pick([hex(0x5a4a3a), hex(0x4a5a5a), hex(0x6a4a2a)]), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    ctx.box({ x0: r.x0 + 0.2, x1: r.x1 - 0.2, z0: r.z0 + 0.2, z1: r.z1 - 0.2 }, 0.5 + h, 0.6 + h, { color: rng.pick([hex(0x2a4a8a), hex(0x3a6a4a), hex(0x8a8a86)]), solid: false });
    if (rng.chance(0.7)) {
      const [x, z] = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
      world.light(x, 1.8, z, hex(0xffb060), 0.9, 8, rng.chance(0.4) ? rng.byte() + 1 : undefined);
    }
  }
  const [x0, z0] = P(a + 2, QUAY1 + 1), [x1, z1] = P(a + 58, QUAY1 + 1);
  ctx.peds.lines.push({ x0, z0, x1, z1, y: 0.5, count: 2, pause: 10 });
}
