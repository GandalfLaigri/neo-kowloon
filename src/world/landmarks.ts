import { HALF, STYLE, hex, type RGB } from '../config';
import { RNG, snap } from '../rng';
import type { Tower } from './city';
import type { Ctx } from './ctx';
import { OPP, SIDES, SV, alongRange, faceCoord, inset, sidePoint, sideRect, type Rect, type Side } from './geom';
import { tree } from './props';

export type LandmarkKind = 'library' | 'park' | 'shrine' | 'site';
export interface Landmark { kind: LandmarkKind; lot: Rect; streetSides: Side[]; name: string }

const STONE = hex(0x7a7466);
const STONE_D = hex(0x5a554c);
const WARM = hex(0xffd6a0);
const CAT = 'Lieux uniques';

const dims = (r: Rect) => [r.x1 - r.x0, r.z1 - r.z0] as const;
const centerDist = (r: Rect) => Math.max(Math.abs((r.x0 + r.x1) / 2), Math.abs((r.z0 + r.z1) / 2)) / HALF;

/**
 * Choisit des lots occupés par des tours et les réserve aux lieux uniques
 * (les tours correspondantes sont retirées de la liste).
 */
export function pickLandmarks(rng: RNG, towers: Tower[], avoid: Rect[]): Landmark[] {
  const out: Landmark[] = [];
  const used: Rect[] = [...avoid];
  const far = (r: Rect) => used.every((u) => Math.abs((u.x0 + u.x1) / 2 - (r.x0 + r.x1) / 2) > 150 || Math.abs((u.z0 + u.z1) / 2 - (r.z0 + r.z1) / 2) > 150);
  const take = (kind: LandmarkKind, name: string, ok: (t: Tower) => boolean) => {
    const cands = towers.filter((t) => t.streetSides.length > 0 && ok(t) && far(t.lot));
    if (!cands.length) return;
    const t = rng.pick(cands);
    towers.splice(towers.indexOf(t), 1);
    used.push(t.lot);
    out.push({ kind, lot: t.lot, streetSides: t.streetSides, name });
  };
  take('library', 'Grande Bibliothèque', (t) => { const [w, d] = dims(t.lot); const c = centerDist(t.lot); return w >= 30 && d >= 30 && c > 0.15 && c < 0.7; });
  take('park', 'Parc Kowloon', (t) => { const [w, d] = dims(t.lot); return w >= 30 && d >= 30 && centerDist(t.lot) > 0.35; });
  take('shrine', 'Sanctuaire Inari', (t) => { const [w, d] = dims(t.lot); return Math.min(w, d) >= 22 && Math.min(w, d) <= 40; });
  take('site', 'Chantier abandonné', (t) => { const [w, d] = dims(t.lot); return w >= 30 && d >= 30 && centerDist(t.lot) > 0.25; });
  return out;
}

export function buildLandmark(ctx: Ctx, L: Landmark) {
  if (L.kind === 'library') library(ctx, L);
  else if (L.kind === 'park') park(ctx, L);
  else if (L.kind === 'shrine') shrine(ctx, L);
  else site(ctx, L);
}

/** Repère (le long de la façade, profondeur vers l'intérieur du lot) depuis un côté rue. */
function frame(L: Landmark, s: Side) {
  const F = faceCoord(L.lot, s);
  const [A0, A1] = alongRange(L.lot, s);
  const D = Math.abs(F - faceCoord(L.lot, OPP[s]));
  /** Rectangle : a dans [a0, a1], profondeur d dans [d0, d1] (d > 0 vers l'intérieur). */
  const R = (a0: number, a1: number, d0: number, d1: number) => sideRect(s, F, Math.min(a0, a1), Math.max(a0, a1), -Math.max(d0, d1), -Math.min(d0, d1));
  const P = (a: number, d: number) => sidePoint(s, F, a, -d);
  const inward = Math.atan2(-SV[s][0], -SV[s][1]);  // cap vers l'intérieur du lot
  const outward = Math.atan2(SV[s][0], SV[s][1]);
  return { F, A0, A1, D, R, P, inward, outward, ac: snap((A0 + A1) / 2) };
}

// ---------------------------------------------------------------------------
// Grande Bibliothèque : péristyle, salle de lecture, rayonnages, lampes vertes
// ---------------------------------------------------------------------------
function library(ctx: Ctx, L: Landmark) {
  const { rng, world } = ctx;
  const s = rng.pick(L.streetSides);
  const { A0, A1, D, R, P, inward, outward, ac } = frame(L, s);
  const BW = snap(Math.min(A1 - A0 - 3, 44)) / 2;
  const b0 = ac - BW, b1 = ac + BW;
  const BD = snap(Math.min(D - 2, 34));
  const FL = 1.5; // niveau du plancher
  const box = ctx.box;
  const stone = { color: STONE, seed: rng.byte() };
  const wall = { color: hex(0x6e685c), seed: rng.byte() };

  // emmarchement et socle
  box(R(b0, b1, 0.5, 3), 0.5, 1.0, stone);
  box(R(b0, b1, 1.75, 3), 1.0, 1.5, stone);
  box(R(b0, b1, 3, BD), 0.5, FL, { color: STONE_D });
  box(R(b0 + 0.5, b1 - 0.5, 8.5, BD - 0.5), FL, FL + 0.05, { color: hex(0x3a2418), style: STYLE.DECK, noRain: true });
  // péristyle : colonnes, entablement avec inscription, fronton à gradins
  const nCol = Math.max(4, Math.round((b1 - b0) / 3.6));
  for (let i = 0; i <= nCol; i++) {
    const a = snap(b0 + 0.5 + ((b1 - b0 - 2) * i) / nCol);
    box(R(a, a + 1, 3.2, 4.2), FL, 14, stone);
    box(R(a - 0.25, a + 1.25, 2.95, 4.45), FL, FL + 0.5, { color: STONE_D });
    box(R(a - 0.25, a + 1.25, 2.95, 4.45), 13.5, 14, { color: STONE_D });
  }
  box(R(b0, b1, 2.5, 8.5), 14, 17.5, stone);
  box(R(ac - 8, ac + 8, 2.3, 2.5), 14.25, 17.25, { color: hex(0xffe6b8), style: STYLE.SIGN, emis: 1.8, seed: rng.byte(), solid: false });
  for (let k = 0; k < 3; k++) {
    const w = BW - 2 - k * 4.5;
    if (w < 3) break;
    box(R(ac - w, ac + w, 2.7, 8.5), 17.5 + k, 18.5 + k, stone);
  }
  // façade de la salle : baies vitrées entre trumeaux, grande porte
  const fw = (a0: number, a1: number, y0: number, y1: number) => { if (a1 - a0 > 0.01) box(R(a0, a1, 8, 8.5), y0, y1, wall); };
  fw(b0, b1, 12, 17.5);
  for (const [p0, p1] of [[b0, ac - 2.5], [ac + 2.5, b1]] as const) {
    fw(p0, p1, FL, 3);
    fw(p0, p0 + 1, 3, 12);
    fw(p1 - 1, p1, 3, 12);
    for (let a = p0 + 1; a < p1 - 1.01; a += 4) {
      const a1 = Math.min(a + 3.5, p1 - 1);
      box(R(a, a1, 8.15, 8.35), 3, 12, { color: hex(0xffd9a0), glass: true });
      fw(a1, Math.min(a1 + 0.5, p1 - 1), 3, 12);
    }
  }
  box(R(ac - 2.5, ac + 2.5, 8.15, 8.35), 7, 12, { color: hex(0xffd9a0), glass: true });
  ctx.reserve(R(ac - 2.5, ac + 2.5, 0, 12), FL, 7);
  // murs latéraux et arrière, toiture avec verrière
  box(R(b0, b0 + 0.5, 8.5, BD), FL, 17.5, wall);
  box(R(b1 - 0.5, b1, 8.5, BD), FL, 17.5, wall);
  box(R(b0 + 0.5, b1 - 0.5, BD - 0.5, BD), FL, 17.5, wall);
  const sky = R(b0 + 6, b1 - 6, 13, BD - 6);
  for (const r of [R(b0, b1, 8.5, 13), R(b0, b1, BD - 6, BD), R(b0, b0 + 6, 13, BD - 6), R(b1 - 6, b1, 13, BD - 6)]) box(r, 17, 17.5, wall);
  box(sky, 17.2, 17.3, { color: hex(0xbfe0ff), glass: true });
  for (const r of [R(b0 + 5.5, b1 - 5.5, 12.5, 13), R(b0 + 5.5, b1 - 5.5, BD - 6, BD - 5.5)]) box(r, 17.5, 18.5, wall);
  // rayonnages muraux (9 m) avec échelles, rayonnages en épi au fond
  const shelf = { color: hex(0x3a2416), style: STYLE.BOOKS, seed: rng.byte() };
  box(R(b0 + 0.5, b0 + 1.1, 9, BD - 0.5), FL, FL + 9, shelf);
  box(R(b1 - 1.1, b1 - 0.5, 9, BD - 0.5), FL, FL + 9, shelf);
  box(R(b0 + 1.1, b1 - 1.1, BD - 1.1, BD - 0.5), FL, FL + 9, shelf);
  for (const a of [b0 + 1.3, b1 - 1.4]) box(R(a, a + 0.1, 12, 12.2), FL, FL + 8, { color: hex(0x5a3a22), solid: false });
  const half = 8.5 + (BD - 8.5) * 0.55;
  if (BD - half > 8) {
    for (let a = b0 + 4; a < b1 - 4.5; a += 4.5) box(R(a, a + 0.6, half + 1, BD - 3), FL, FL + 3, { ...shelf, seed: rng.byte() });
    for (let i = 0; i < 3; i++) {
      const a = rng.range(b0 + 3, b1 - 3), d = rng.range(half + 1, BD - 3);
      const [x, z] = P(a, d);
      if (ctx.free({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, FL + 0.1, FL + 1.8)) ctx.pose(x, FL, z, rng.range(-3, 3), rng.chance(0.5) ? 10 : 0);
    }
  }
  // tables de lecture : lampes vertes, lecteurs penchés sur leurs livres
  const green = hex(0x3aff7a);
  for (let d = 13; d < half - 1.5; d += 3.5)
    for (let a = b0 + 3.5; a < b1 - 7; a += 6.5) {
      const top = R(a, a + 4.5, d, d + 1.2);
      if (!ctx.free(top, FL + 0.1, FL + 1)) continue;
      box(top, FL + 0.7, FL + 0.8, { color: hex(0x4a2a18) });
      box(R(a + 0.2, a + 0.5, d + 0.3, d + 0.9), FL, FL + 0.7, { color: hex(0x2a1a10) });
      box(R(a + 4, a + 4.3, d + 0.3, d + 0.9), FL, FL + 0.7, { color: hex(0x2a1a10) });
      for (const la of [a + 1.1, a + 3.2]) {
        box(R(la, la + 0.1, d + 0.55, d + 0.65), FL + 0.8, FL + 1.15, { color: hex(0xb89040), solid: false });
        box(R(la - 0.1, la + 0.2, d + 0.5, d + 0.7), FL + 1.15, FL + 1.25, { color: green, style: STYLE.EMISSIVE, emis: 1.1, solid: false });
      }
      const [lx, lz] = P(a + 2.25, d + 0.6);
      world.light(lx, FL + 1.6, lz, hex(0xb8ffc8), 0.9, 6);
      for (let k = 0; k < 3; k++)
        for (const side of [-1, 1]) {
          const ca = a + 0.75 + k * 1.5, cd = d + 0.6 + side * 1.05;
          box(R(ca - 0.22, ca + 0.22, cd - 0.22, cd + 0.22), FL, FL + 0.45, { color: hex(0x2a1a14) });
          { const [x, z] = P(ca, cd); ctx.seat(rng.chance(0.45), x, FL + 0.45, z, side > 0 ? outward : inward, 7); }
        }
    }
  // banque de prêt et bibliothécaire, lustres
  const desk = R(ac - 3, ac + 3, 10, 11);
  if (ctx.free(desk, FL + 0.1, FL + 1.2)) {
    box(desk, FL, FL + 1.1, { color: hex(0x3a2214) });
    const [x, z] = P(ac - 1, 11.6);
    ctx.pose(x, FL, z, outward, 10);
  }
  for (let d = 12; d < BD - 3; d += 8)
    for (const a of [ac - BW / 2, ac + BW / 2]) {
      const [x, z] = P(a, d);
      box({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 }, 11.5, 11.8, { color: WARM, style: STYLE.EMISSIVE, emis: 2.4, solid: false });
      box({ x0: x - 0.05, x1: x + 0.05, z0: z - 0.05, z1: z + 0.05 }, 11.8, 17, { color: hex(0x222222), solid: false });
      world.light(x, 10.5, z, WARM, 1.5, 16);
    }
  // lanternes de part et d'autre des marches
  for (const a of [b0 + 1, b1 - 1.5]) {
    const [x, z] = P(a + 0.25, 1.2);
    box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, 1.0, 5, { color: hex(0x2a2620) });
    box({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, 5, 5.6, { color: WARM, style: STYLE.EMISSIVE, emis: 1.5, solid: false });
    world.light(x, 5.4, z, WARM, 1.6, 14);
    world.cone(x, 5, z, 0, -1, 0, 4.2, 2.2, WARM, 0.06);
  }
  const [px, pz] = P(ac, 5.5);
  world.light(px, 12, pz, WARM, 1.6, 16);
  // quelques lecteurs sur les marches malgré la pluie
  for (let i = 0; i < 3; i++) { const [x, z] = P(rng.range(b0 + 3, b1 - 3), 2.3); ctx.seat(rng.chance(0.6), x, 1.0, z, outward, rng.chance(0.5) ? 1 : 7); }
  const [dx, dz] = P(ac, -1.5);
  ctx.dest(CAT, L.name, dx, 0.52, dz, outward); // caméra : regarde vers l'intérieur du lot
}

// ---------------------------------------------------------------------------
// Parc mal famé : grillages crevés, arbres morts, terrain de basket, sans-abri
// ---------------------------------------------------------------------------
function park(ctx: Ctx, L: Landmark) {
  const { rng, world } = ctx;
  const lot = L.lot;
  const box = ctx.box;
  const G = 0.5;
  const post = hex(0x26282c);
  const fence = { color: hex(0x5a5e64), style: STYLE.FENCE, solid: true, noRain: true };
  const inner = inset(lot, 1);
  // sol : herbe rase et jaunie par plaques, terre battue
  const dry: RGB[] = [hex(0x24241a), hex(0x2c2818), hex(0x1f2016), hex(0x2c2216), hex(0x1c2216)];
  for (let x = inner.x0; x < inner.x1 - 0.01; x += 6)
    for (let z = inner.z0; z < inner.z1 - 0.01; z += 6)
      box({ x0: x, x1: Math.min(x + 6, inner.x1), z0: z, z1: Math.min(z + 6, inner.z1) }, G, G + 0.05, { color: rng.pick(dry), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  // grillage périphérique (percé), entrées côté rue
  const gates = new Map<Side, number>();
  for (const s of L.streetSides) gates.set(s, snap(rng.range(alongRange(lot, s)[0] + 5, alongRange(lot, s)[1] - 8)));
  for (const s of SIDES) {
    const F = faceCoord(lot, s);
    const [a0, a1] = alongRange(lot, s);
    for (let a = a0; a < a1 - 0.01; a += 3) {
      const e = Math.min(a + 3, a1);
      const g = gates.get(s);
      if (g !== undefined && e > g && a < g + 3.5) continue;
      box(sideRect(s, F, a, a + 0.2, -0.3, -0.1), G, G + 2.6, { color: post });
      if (rng.chance(0.12)) continue; // pan arraché
      const torn = rng.chance(0.2);
      box(sideRect(s, F, a + 0.2, e, -0.22, -0.18), G + (torn ? 1.2 : 0.05), G + 2.5, fence);
    }
  }
  const [W, Dp] = dims(inner);
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  const used: Rect[] = [];
  const place = (w: number, d: number, pad = 1): Rect | null => {
    if (w > W - 2 || d > Dp - 2) return null;
    for (let k = 0; k < 30; k++) {
      const x = snap(rng.range(inner.x0 + 1, inner.x1 - w - 1)), z = snap(rng.range(inner.z0 + 1, inner.z1 - d - 1));
      const r = { x0: x, x1: x + w, z0: z, z1: z + d };
      if (used.some((u) => u.x0 < r.x1 + pad && u.x1 > r.x0 - pad && u.z0 < r.z1 + pad && u.z1 > r.z0 - pad)) continue;
      if (!ctx.free(r, G + 0.1, G + 3)) continue;
      used.push(r);
      return r;
    }
    return null;
  };
  // fontaine asséchée au centre, statue taguée
  const fr = { x0: snap(cx - 3.5), x1: snap(cx + 3.5), z0: snap(cz - 3.5), z1: snap(cz + 3.5) };
  used.push(inset(fr, -1.5));
  box({ ...fr, z1: fr.z0 + 0.5 }, G, G + 0.8, { color: STONE_D });
  box({ ...fr, z0: fr.z1 - 0.5 }, G, G + 0.8, { color: STONE_D });
  box({ ...fr, x1: fr.x0 + 0.5, z0: fr.z0 + 0.5, z1: fr.z1 - 0.5 }, G, G + 0.8, { color: STONE_D });
  box({ ...fr, x0: fr.x1 - 0.5, z0: fr.z0 + 0.5, z1: fr.z1 - 0.5 }, G, G + 0.8, { color: STONE_D });
  box(inset(fr, 0.5), G, G + 0.1, { color: hex(0x1a1c14) });
  box(inset(fr, 2.5), G, G + 1.5, { color: STONE });
  box(inset(fr, 2.75), G + 1.5, G + 3.5, { color: hex(0x4a5a4a) });
  box(inset(fr, 3.0), G + 3.5, G + 4.2, { color: hex(0x4a5a4a) });
  for (let i = 0; i < 6; i++) {
    const x = snap(rng.range(fr.x0 + 0.5, fr.x1 - 1)), z = snap(rng.range(fr.z0 + 0.5, fr.z1 - 1));
    if (Math.abs(x - cx) < 1.5 && Math.abs(z - cz) < 1.5) continue;
    box({ x0: x, x1: x + 0.5, z0: z, z1: z + 0.5 }, G + 0.1, G + rng.pick([0.25, 0.4]), { color: rng.pick([hex(0x111214), hex(0x6a4a2a), hex(0x1a2440)]), solid: false });
  }
  // terrain de basket en cage grillagée
  const cw = Math.min(16, W / 2 - 2), cd = Math.min(10, Dp / 2 - 2);
  const court = place(cw, cd, 1.5);
  if (court) {
    box(court, G, G + 0.06, { color: hex(0x26303a), style: STYLE.GROUND, seed: rng.byte(), noRain: true });
    const line = hex(0x9a9aa0);
    box({ ...court, x0: (court.x0 + court.x1) / 2 - 0.05, x1: (court.x0 + court.x1) / 2 + 0.05 }, G + 0.06, G + 0.08, { color: line, solid: false });
    for (const [x0, x1, z0, z1] of [[court.x0, court.x1, court.z0, court.z0 + 0.05], [court.x0, court.x1, court.z1 - 0.05, court.z1], [court.x0, court.x0 + 0.05, court.z0, court.z1], [court.x1 - 0.05, court.x1, court.z0, court.z1]])
      box({ x0, x1, z0, z1 }, G + 0.06, G + 0.08, { color: line, solid: false });
    const zc = (court.z0 + court.z1) / 2;
    for (const [x, sg] of [[court.x0 + 0.6, 1], [court.x1 - 0.6, -1]] as const) {
      box({ x0: x - 0.15, x1: x + 0.15, z0: zc - 0.15, z1: zc + 0.15 }, G, G + 3.6, { color: post });
      box({ x0: x + sg * 0.15 - 0.05, x1: x + sg * 0.15 + 0.05, z0: zc - 0.9, z1: zc + 0.9 }, G + 3.0, G + 4.1, { color: hex(0xc8c8c0), solid: false });
      const rx = x + sg * 0.6;
      box({ x0: rx - 0.25, x1: rx + 0.25, z0: zc - 0.25, z1: zc + 0.25 }, G + 3.05, G + 3.1, { color: hex(0xff5a1a), solid: false });
    }
    // cage (porte sur un côté)
    const cage = inset(court, -0.6);
    const H = 4;
    for (const [r, door] of [[{ ...cage, z1: cage.z0 + 0.05 }, true], [{ ...cage, z0: cage.z1 - 0.05 }, false], [{ ...cage, x1: cage.x0 + 0.05 }, false], [{ ...cage, x0: cage.x1 - 0.05 }, false]] as const) {
      if (door) {
        const m = snap((r.x0 + r.x1) / 2);
        box({ ...r, x1: m - 1 }, G, G + H, fence);
        box({ ...r, x0: m + 1 }, G, G + H, fence);
      } else box(r, G, G + H, fence);
    }
    for (const [x, z] of [[cage.x0, cage.z0], [cage.x1, cage.z0], [cage.x0, cage.z1], [cage.x1, cage.z1]]) box({ x0: x - 0.1, x1: x + 0.1, z0: z - 0.1, z1: z + 0.1 }, G, G + H + 0.2, { color: post });
    // lumière crue d'un projecteur défaillant, quelques joueurs
    const fl = rng.byte() + 1;
    world.light(cage.x0 + 1, G + 5, zc, hex(0xd8ffe8), 1.8, 18, fl);
    world.cone(cage.x0 + 0.2, G + H + 0.6, cage.z0 + 0.2, 0.6, -1, 0.4, 7, 5, hex(0xd8ffe8), 0.05, fl);
    box({ x0: cage.x0 - 0.1, x1: cage.x0 + 0.5, z0: cage.z0 - 0.1, z1: cage.z0 + 0.5 }, G + H, G + H + 0.6, { color: hex(0xd8ffe8), style: STYLE.EMISSIVE, emis: 3, extra: 3, seed: fl & 255, solid: false });
    for (let i = 0; i < rng.int(2, 5); i++) {
      const x = rng.range(court.x0 + 2, court.x1 - 2), z = rng.range(court.z0 + 1.5, court.z1 - 1.5);
      ctx.pose(x, G, z, rng.range(-3, 3), rng.chance(0.5) ? 2 : 0);
    }
  }
  // arbres morts
  for (let i = 0; i < Math.round((W * Dp) / 140); i++) {
    const r = place(1, 1, 2);
    if (!r) continue;
    const x = r.x0 + 0.5, z = r.z0 + 0.5, h = rng.range(3.5, 6);
    const bark = rng.pick([hex(0x3a3028), hex(0x2e2a26), hex(0x4a3e34)]);
    box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, G, G + h, { color: bark });
    for (let k = 0; k < rng.int(2, 4); k++) {
      const y = G + h * rng.range(0.5, 0.95), len = rng.range(0.8, 2);
      const dir = rng.int(0, 3);
      const [ux, uz] = SV[dir];
      const bx0 = x + (ux ? (ux > 0 ? 0.2 : -0.2 - len) : -0.08), bz0 = z + (uz ? (uz > 0 ? 0.2 : -0.2 - len) : -0.08);
      box({ x0: bx0, x1: bx0 + (ux ? len : 0.16), z0: bz0, z1: bz0 + (uz ? len : 0.16) }, y, y + 0.16, { color: bark, solid: false });
      box({ x0: x + ux * (0.2 + len) - 0.08, x1: x + ux * (0.2 + len) + 0.08, z0: z + uz * (0.2 + len) - 0.08, z1: z + uz * (0.2 + len) + 0.08 }, y, y + rng.range(0.5, 1.2), { color: bark, solid: false });
    }
    if (rng.chance(0.25)) box({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8 }, G + h - 0.3, G + h + 0.3, { color: hex(0x4a4a26), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  }
  // réverbères : la plupart morts ou défaillants
  for (let i = 0; i < 5; i++) {
    const r = place(0.4, 0.4, 3);
    if (!r) continue;
    const x = r.x0 + 0.2, z = r.z0 + 0.2;
    box(r, G, G + 5, { color: post });
    const dead = rng.chance(0.4);
    const fl = rng.byte() + 1;
    box({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 }, G + 5, G + 5.4, { color: hex(0xffb070), style: STYLE.EMISSIVE, emis: dead ? 0.1 : 2.5, extra: dead ? 0 : 3, seed: fl & 255, solid: false });
    if (!dead) {
      world.light(x, G + 4.6, z, hex(0xffa050), 1.3, 13, fl);
      world.cone(x, G + 5, z, 0, -1, 0, 5, 2.4, hex(0xffa050), 0.06, fl);
    }
  }
  // murs de béton tagués
  for (let i = 0; i < 3; i++) {
    const alongX = rng.chance(0.5);
    const r = place(alongX ? 6 : 0.5, alongX ? 0.5 : 6, 2);
    if (r) box(r, G, G + 3, { color: rng.pick([hex(0x4a4a50), hex(0x3a3c40)]), seed: rng.byte() });
  }
  // campement : tentes, caddies, fût enflammé, dormeurs
  const camp = place(8, 6, 1);
  if (camp) {
    for (let k = 0; k < 2; k++) {
      const t0 = { x0: camp.x0 + k * 4, x1: camp.x0 + k * 4 + 2.5, z0: camp.z0, z1: camp.z0 + 1.6 };
      box(t0, G, G + 1.1, { color: rng.pick([hex(0x2a4a8a), hex(0x3a5a3a), hex(0x6a3a2a), hex(0x8a7a2a)]), solid: false });
    }
    const bx = camp.x0 + 4, bz = camp.z0 + 4;
    box({ x0: bx - 0.4, x1: bx + 0.4, z0: bz - 0.4, z1: bz + 0.4 }, G, G + 1, { color: hex(0x3a2a22) });
    box({ x0: bx - 0.3, x1: bx + 0.3, z0: bz - 0.3, z1: bz + 0.3 }, G + 1, G + 1.25, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
    world.light(bx, G + 1.9, bz, hex(0xff7a30), 2.2, 12, rng.byte() + 1);
    world.emitSteam(bx, G + 1.3, bz, 0.8, 6, 12, hex(0x3a2a24));
    ctx.pose(bx + 1.1, G, bz, -Math.PI / 2, 10);
    ctx.pose(bx - 1.1, G, bz, Math.PI / 2, 10);
    if (rng.chance(0.6)) ctx.pose(bx, G, bz + 1.1, Math.PI, 3);
    // caddies
    for (let k = 0; k < 2; k++) {
      const x = camp.x1 - 1 - k * 1.5, z = camp.z1 - 0.8;
      box({ x0: x, x1: x + 0.9, z0: z, z1: z + 0.6 }, G + 0.3, G + 1.0, { color: hex(0x8a8a90), style: STYLE.FENCE, solid: false });
      box({ x0: x + 0.1, x1: x + 0.8, z0: z + 0.1, z1: z + 0.5 }, G + 0.35, G + 0.8, { color: rng.pick([hex(0x2a3a5a), hex(0x5a3a2a), hex(0x3a3a3a)]), solid: false });
    }
    // dormeur sur un carton
    box({ x0: camp.x0, x1: camp.x0 + 2, z0: camp.z1 - 1, z1: camp.z1 }, G, G + 0.05, { color: hex(0x6a4a2a), solid: false });
    ctx.pose(camp.x0 + 0.1, G + 0.05, camp.z1 - 0.5, -Math.PI / 2, 9);
  }
  // bancs cassés, dormeurs, dealers dans l'ombre, chats
  for (let i = 0; i < 3; i++) {
    const r = place(2.5, 0.6, 1.5);
    if (!r) continue;
    box(r, G, G + 0.45, { color: hex(0x3a2e24) });
    box({ ...r, z0: r.z1 - 0.15 }, G + 0.45, G + 1.0, { color: hex(0x3a2e24) });
    if (rng.chance(0.6)) ctx.pose(r.x0 + 0.1, G + 0.45, (r.z0 + r.z1) / 2 - 0.05, -Math.PI / 2, 9);
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    const r = place(0.6, 0.6, 2);
    if (r) ctx.pose(r.x0 + 0.3, G, r.z0 + 0.3, rng.range(-3, 3), rng.pick([3, 5, 0]));
  }
  for (let i = 0; i < 2; i++) {
    const r = place(0.5, 0.5, 1);
    if (r) ctx.cat(r.x0 + 0.25, G, r.z0 + 0.25, rng.range(-3, 3));
  }
  // détritus
  for (let i = 0; i < Math.round((W * Dp) / 60); i++) {
    const x = snap(rng.range(inner.x0, inner.x1 - 0.5), 0.25), z = snap(rng.range(inner.z0, inner.z1 - 0.5), 0.25);
    const r = { x0: x, x1: x + rng.pick([0.25, 0.5]), z0: z, z1: z + rng.pick([0.25, 0.5]) };
    if (ctx.free(r, G + 0.06, G + 0.6)) box(r, G + 0.05, G + rng.pick([0.1, 0.2, 0.3]), { color: rng.pick([hex(0x111214), hex(0x6a4a2a), hex(0x1a2440), hex(0x8a8a80)]), solid: false });
  }
  const gs = L.streetSides[0];
  const g = gates.get(gs)!;
  const [dx, dz] = sidePoint(gs, faceCoord(lot, gs), g + 1.5, 2);
  ctx.dest(CAT, `${L.name} (mal famé)`, dx, 0.52, dz, Math.atan2(SV[gs][0], SV[gs][1]));
}

// ---------------------------------------------------------------------------
// Sanctuaire shintô : torii, lanternes de pierre, arbre sacré, encens
// ---------------------------------------------------------------------------
function shrine(ctx: Ctx, L: Landmark) {
  const { rng, world } = ctx;
  const s = rng.pick(L.streetSides);
  const { D, R, P, inward, outward, ac, A0, A1 } = frame(L, s);
  const box = ctx.box;
  const G = 0.5;
  const verm = hex(0xc0301c), black = hex(0x181414);
  const W = A1 - A0;
  // gravier ratissé, haies périphériques
  box(R(A0 + 0.5, A1 - 0.5, 0.5, D - 0.5), G, G + 0.05, { color: hex(0x6a665c), style: STYLE.GROUND, seed: rng.byte(), noRain: true });
  box(R(ac - 1.25, ac + 1.25, 0, D - 6), G + 0.05, G + 0.1, { color: hex(0x8a8478), style: STYLE.GROUND, seed: rng.byte() });
  const hedge = { color: hex(0x24401e), style: STYLE.FOLIAGE, seed: rng.byte() };
  box(R(A0, A0 + 1, 0, D), G, G + 1.4, hedge);
  box(R(A1 - 1, A1, 0, D), G, G + 1.4, hedge);
  box(R(A0 + 1, A1 - 1, D - 1, D), G, G + 1.4, hedge);
  box(R(A0 + 1, ac - 2.5, 0, 1), G, G + 1.4, hedge);
  box(R(ac + 2.5, A1 - 1, 0, 1), G, G + 1.4, hedge);
  // torii successifs le long de l'allée
  const nT = Math.max(1, Math.min(3, Math.floor((D - 12) / 5)));
  for (let i = 0; i < nT; i++) {
    const d = 2.5 + i * 4.5;
    const H = 5.5 - i * 0.4;
    for (const a of [ac - 2.2, ac + 1.7]) box(R(a, a + 0.5, d, d + 0.5), G, G + H, { color: verm, extra: 9 });
    box(R(ac - 2.7, ac + 2.7, d - 0.05, d + 0.55), G + H - 1.3, G + H - 0.95, { color: verm, extra: 9 });
    box(R(ac - 3.2, ac + 3.2, d - 0.1, d + 0.6), G + H, G + H + 0.4, { color: black, extra: 9 });
    box(R(ac - 3.45, ac - 2.95, d - 0.1, d + 0.6), G + H + 0.25, G + H + 0.65, { color: black, extra: 9 });
    box(R(ac + 2.95, ac + 3.45, d - 0.1, d + 0.6), G + H + 0.25, G + H + 0.65, { color: black, extra: 9 });
  }
  // lanternes de pierre de part et d'autre de l'allée
  for (let d = 3.5; d < D - 9; d += 4)
    for (const a of [ac - 3.4, ac + 2.8]) {
      const r = R(a, a + 0.6, d, d + 0.6);
      if (!ctx.free(r, G + 0.1, G + 2)) continue;
      box(r, G, G + 0.7, { color: STONE_D, extra: 9 });
      box(R(a + 0.15, a + 0.45, d + 0.15, d + 0.45), G + 0.7, G + 1.2, { color: STONE, extra: 9 });
      box(r, G + 1.2, G + 1.65, { color: hex(0xffb060), style: STYLE.EMISSIVE, emis: 2.2, extra: 2, seed: rng.byte() });
      box(R(a - 0.1, a + 0.7, d - 0.1, d + 0.7), G + 1.65, G + 1.85, { color: STONE_D, extra: 9 });
      const [x, z] = P(a + 0.3, d + 0.3);
      world.light(x, G + 1.6, z, hex(0xffb060), 0.9, 7);
    }
  // honden : estrade, corps en bois, écrans de papier lumineux, double toiture
  const d0 = Math.max(D - 12, 8), d1 = D - 2;
  const hw = Math.min(5, W / 2 - 3);
  box(R(ac - hw - 1, ac + hw + 1, d0 - 1, d1 + 0.5), G, G + 0.8, { color: STONE_D, extra: 9 });
  box(R(ac - 1.5, ac + 1.5, d0 - 2.2, d0 - 1), G, G + 0.4, { color: STONE_D, extra: 9 });
  box(R(ac - hw, ac + hw, d0 + 0.6, d1), G + 0.8, G + 4.2, { color: hex(0x5a1e14), extra: 9 });
  box(R(ac - hw + 0.8, ac + hw - 0.8, d0 + 0.45, d0 + 0.6), G + 1.2, G + 3.6, { color: hex(0xffe2b0), style: STYLE.SHOP, emis: 1.6, seed: rng.byte(), solid: false });
  for (const a of [ac - hw - 0.3, ac + hw - 0.2]) box(R(a, a + 0.5, d0 - 0.4, d0 + 0.1), G + 0.8, G + 4.2, { color: verm, extra: 9 });
  const roof = hex(0x1e302c);
  box(R(ac - hw - 1.6, ac + hw + 1.6, d0 - 1.3, d1 + 1.1), G + 4.2, G + 4.7, { color: roof, extra: 9 });
  box(R(ac - hw - 2.1, ac - hw - 1.6, d0 - 1.3, d0 - 0.8), G + 4.7, G + 5.0, { color: roof, extra: 9 });
  box(R(ac + hw + 1.6, ac + hw + 2.1, d0 - 1.3, d0 - 0.8), G + 4.7, G + 5.0, { color: roof, extra: 9 });
  box(R(ac - hw - 0.6, ac + hw + 0.6, d0 - 0.3, d1 + 0.1), G + 4.7, G + 5.6, { color: hex(0x4a1812), extra: 9 });
  box(R(ac - hw - 1.1, ac + hw + 1.1, d0 - 0.8, d1 + 0.6), G + 5.6, G + 6.0, { color: roof, extra: 9 });
  box(R(ac - hw, ac + hw, d0 + 1.2, d1 - 0.8), G + 6.0, G + 6.8, { color: roof, extra: 9 });
  box(R(ac - hw - 0.3, ac + hw + 0.3, (d0 + d1) / 2 - 0.25, (d0 + d1) / 2 + 0.25), G + 6.8, G + 7.1, { color: hex(0xc8a040) });
  for (const a of [ac - hw - 0.8, ac + hw + 0.5]) {
    box(R(a, a + 0.3, d0 - 0.9, d0 - 0.6), G + 3.2, G + 3.9, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 2.8, extra: 2, seed: rng.byte(), solid: false });
    const [x, z] = P(a + 0.15, d0 - 0.75);
    world.light(x, G + 3.4, z, hex(0xff5030), 1.2, 9);
  }
  // encensoir fumant, fidèles
  box(R(ac - 0.6, ac + 0.6, d0 - 4, d0 - 2.8), G, G + 0.9, { color: hex(0x6a5a30), extra: 9 });
  const [ix, iz] = P(ac, d0 - 3.4);
  world.emitSteam(ix, G + 1.0, iz, 0.35, 3.5, 10, hex(0x6a6470));
  world.light(ix, G + 1.4, iz, hex(0xff8040), 0.8, 5);
  for (let i = 0; i < rng.int(2, 4); i++) {
    const [x, z] = P(ac + rng.range(-2, 2), d0 - rng.range(4.8, 6.5));
    ctx.pose(x, G + 0.05, z, inward, rng.chance(0.2) ? 5 : 0);
  }
  // arbre sacré ceint d'une corde, à côté du sanctuaire
  const ta = ac + hw + 3.2 < A1 - 2 ? ac + hw + 3.2 : ac - hw - 3.2;
  const [tx, tz] = P(ta, d0 + 1);
  if (ctx.free({ x0: tx - 2, x1: tx + 2, z0: tz - 2, z1: tz + 2 }, G + 0.2, G + 5)) {
    tree(ctx, tx, tz, G, 1.6, false);
    box({ x0: tx - 0.28, x1: tx + 0.28, z0: tz - 0.28, z1: tz + 0.28 }, G + 1.6, G + 1.8, { color: hex(0xd8c8a0), solid: false });
    box({ x0: tx + 0.28, x1: tx + 0.32, z0: tz - 0.1, z1: tz + 0.1 }, G + 1.2, G + 1.6, { color: hex(0xf0f0f0), solid: false });
  }
  // moine qui balaie le gravier, chat du sanctuaire
  const [mx, mz] = P(ac + rng.range(-3, 3), rng.range(4, d0 - 5));
  ctx.pose(mx, G + 0.05, mz, rng.range(-3, 3), 4);
  const [kx, kz] = P(ac - hw + 0.5, d0 - 0.6);
  ctx.cat(kx, G + 0.8, kz, outward);
  const [dx, dz] = P(ac, -1.5);
  ctx.dest(CAT, L.name, dx, 0.52, dz, outward);
}

// ---------------------------------------------------------------------------
// Chantier abandonné : squelette de tour, grue qui grince au vent, conteneurs
// ---------------------------------------------------------------------------
function site(ctx: Ctx, L: Landmark) {
  const { rng, world } = ctx;
  const lot = L.lot;
  const box = ctx.box;
  const G = 0.5;
  // palissade de chantier (affiches, tags), portail entrouvert côté rue
  const gs = rng.pick(L.streetSides);
  const g = snap(rng.range(alongRange(lot, gs)[0] + 4, alongRange(lot, gs)[1] - 10));
  for (const s of SIDES) {
    const F = faceCoord(lot, s);
    const [a0, a1] = alongRange(lot, s);
    const col = hex(0x3a3a34);
    const segs: [number, number][] = s === gs ? [[a0, g], [g + 6, a1]] : [[a0, a1]];
    for (const [p0, p1] of segs) if (p1 - p0 > 0.1) box(sideRect(s, F, p0, p1, -0.35, -0.1), G, G + 2.6, { color: col, seed: rng.byte() });
    if (s === gs) {
      box(sideRect(s, F, g, g + 2.8, -0.3, -0.25), G, G + 2.4, { color: hex(0x6a6e74), style: STYLE.FENCE, noRain: true });
      box(sideRect(s, F, g + 2.8, g + 2.9, -2.8, -0.25), G, G + 2.4, { color: hex(0x6a6e74), style: STYLE.FENCE, noRain: true });
    }
  }
  const inner = inset(lot, 3);
  const [W, Dd] = dims(inner);
  // squelette : poteaux sur une trame de 6 m, dalles inachevées, niveaux supérieurs sans plancher
  const sw = Math.min(24, W - 6), sd = Math.min(24, Dd - 8);
  const sx0 = snap(inner.x1 - sw), sz0 = snap(inner.z0 + 1);
  const S: Rect = { x0: sx0, x1: sx0 + sw, z0: sz0, z1: sz0 + sd };
  const levels = rng.int(9, 16);
  const FH = 4.5;
  const conc = hex(0x5a5850);
  for (let x = S.x0; x <= S.x1 - 0.8 + 0.01; x += (sw - 0.8) / Math.round((sw - 0.8) / 6))
    for (let z = S.z0; z <= S.z1 - 0.8 + 0.01; z += (sd - 0.8) / Math.round((sd - 0.8) / 6)) {
      const xs = snap(x), zs = snap(z);
      const h = G + FH * (levels - (rng.chance(0.3) ? rng.int(1, 3) : 0));
      box({ x0: xs, x1: xs + 0.8, z0: zs, z1: zs + 0.8 }, G, h, { color: conc, seed: rng.byte() });
      if (rng.chance(0.5)) box({ x0: xs + 0.3, x1: xs + 0.5, z0: zs + 0.3, z1: zs + 0.5 }, h, h + rng.range(0.8, 2), { color: hex(0x6a3a26), solid: false });
    }
  const slabTop = levels - rng.int(2, 4);
  for (let k = 1; k <= slabTop; k++) {
    const y = G + FH * k;
    if (k > slabTop - 2 && rng.chance(0.5)) {
      // dalle partielle
      const half = rng.chance(0.5) ? { ...S, x1: snap((S.x0 + S.x1) / 2) } : { ...S, z1: snap((S.z0 + S.z1) / 2) };
      box(half, y - 0.4, y, { color: conc, seed: rng.byte() });
    } else {
      // trémie d'escalier laissée ouverte dans un angle
      const hole: Rect = { x0: S.x0 + 1, x1: S.x0 + 4, z0: S.z0 + 1, z1: S.z0 + 5 };
      for (const r of [{ ...S, x0: hole.x1 }, { ...S, x1: hole.x1, z0: hole.z1 }, { ...S, x1: hole.x0, z1: hole.z1 }, { ...S, x0: hole.x0, x1: hole.x1, z1: hole.z0 }])
        if (r.x1 - r.x0 > 0.1 && r.z1 - r.z0 > 0.1) box(r, y - 0.4, y, { color: conc, seed: rng.byte() });
    }
    // bâches qui pendent en façade
    if (rng.chance(0.35)) {
      const side = rng.int(0, 3) as Side;
      const F = faceCoord(S, side);
      const [a0, a1] = alongRange(S, side);
      const a = snap(rng.range(a0, a1 - 5));
      box(sideRect(side, F, a, a + rng.range(3, 5), 0.1, 0.2), y - FH + 0.8, y - 0.4, { color: rng.pick([hex(0x2a4a8a), hex(0x3a5a4a), hex(0x8a8a86)]), solid: false, noRain: true });
    }
  }
  // lampes de chantier (la plupart grésillent), squatteurs autour d'un fût au 3e niveau
  for (let k = 1; k <= Math.min(slabTop, 6); k += 2) {
    const y = G + FH * k;
    const [x, z] = [S.x0 + rng.range(2, sw - 2), S.z1 - 1.5];
    const fl = rng.chance(0.7) ? rng.byte() + 1 : undefined;
    box({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.15, z1: z + 0.15 }, y + 2.5, y + 2.8, { color: hex(0xfff0c8), style: STYLE.EMISSIVE, emis: 3, extra: fl ? 3 : 0, seed: (fl ?? 0) & 255, solid: false });
    world.light(x, y + 2.3, z, hex(0xfff0c8), 1.4, 12, fl);
  }
  if (slabTop >= 3) {
    const y = G + FH * 3;
    const bx = S.x0 + sw * 0.6, bz = S.z0 + sd * 0.5;
    box({ x0: bx - 0.4, x1: bx + 0.4, z0: bz - 0.4, z1: bz + 0.4 }, y, y + 1, { color: hex(0x3a2a22) });
    box({ x0: bx - 0.3, x1: bx + 0.3, z0: bz - 0.3, z1: bz + 0.3 }, y + 1, y + 1.25, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
    world.light(bx, y + 1.9, bz, hex(0xff7a30), 2.2, 12, rng.byte() + 1);
    world.emitSteam(bx, y + 1.3, bz, 0.8, 6, 12, hex(0x3a2a24));
    ctx.pose(bx + 1.1, y, bz, -Math.PI / 2, 10);
    ctx.pose(bx, y, bz - 1.1, 0, 3);
    ctx.pose(bx - 1.2, y + 0.05, bz + 0.6, Math.PI / 2, 9);
  }
  // grue à tour : mât en treillis, cabine ; la flèche (animée) est un élément du spectacle
  const mx = snap(inner.x0 + 2), mz = snap(inner.z1 - 4);
  const mastTop = G + FH * levels + rng.range(14, 26);
  box({ x0: mx, x1: mx + 2, z0: mz, z1: mz + 2 }, G, G + 1, { color: conc });
  box({ x0: mx, x1: mx + 2, z0: mz, z1: mz + 2 }, G + 1, mastTop, { color: hex(0xc8a020), style: STYLE.FENCE });
  box({ x0: mx - 0.5, x1: mx + 2.5, z0: mz - 0.5, z1: mz + 2.5 }, mastTop, mastTop + 0.5, { color: hex(0xc8a020) });
  box({ x0: mx + 2, x1: mx + 3.5, z0: mz + 0.2, z1: mz + 1.8 }, mastTop - 2.5, mastTop, { color: hex(0x8a8a86) });
  box({ x0: mx + 3.5, x1: mx + 3.55, z0: mz + 0.4, z1: mz + 1.6 }, mastTop - 2, mastTop - 0.6, { color: hex(0xbfe0ff), style: STYLE.EMISSIVE, emis: 0.6, solid: false });
  // la flèche oscille au-dessus du chantier (cap vers le squelette)
  const hx = (S.x0 + S.x1) / 2 - (mx + 1), hz = (S.z0 + S.z1) / 2 - (mz + 1);
  world.spot('crane', mx + 1, mastTop + 0.5, mz + 1, Math.min(32, Math.max(20, Math.hypot(hx, hz) + 6)), Math.atan2(-hz, hx), hex(0xc8a020));
  // conteneurs, tas de sable, ferraille
  for (let i = 0; i < 3; i++) {
    const along = rng.chance(0.5);
    const w = along ? 6 : 2.5, d = along ? 2.5 : 6;
    const x = snap(rng.range(inner.x0, inner.x1 - w)), z = snap(rng.range(inner.z0, inner.z1 - d));
    const r = { x0: x, x1: x + w, z0: z, z1: z + d };
    if (!ctx.free(inset(r, -0.5), G + 0.1, G + 3)) continue;
    box(r, G, G + 2.6, { color: rng.pick([hex(0x8a3a24), hex(0x2a5a7a), hex(0x3a6a3a), hex(0x8a7a2a)]), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    if (rng.chance(0.4)) box(inset(r, 0.2), G + 2.6, G + 5.2, { color: rng.pick([hex(0x6a6a6a), hex(0x2a3a5a)]), style: STYLE.INDUSTRIAL, seed: rng.byte() });
  }
  for (let i = 0; i < 3; i++) {
    const x = snap(rng.range(inner.x0, inner.x1 - 4)), z = snap(rng.range(inner.z0, inner.z1 - 4));
    const r = { x0: x, x1: x + 4, z0: z, z1: z + 4 };
    if (!ctx.free(r, G + 0.1, G + 2)) continue;
    const c = rng.chance(0.5) ? hex(0x6a5a40) : hex(0x4a4640);
    box(r, G, G + 0.6, { color: c, style: STYLE.FOLIAGE, seed: rng.byte() });
    box(inset(r, 0.75), G + 0.6, G + 1.2, { color: c, style: STYLE.FOLIAGE, seed: rng.byte() });
    box(inset(r, 1.5), G + 1.2, G + 1.6, { color: c, style: STYLE.FOLIAGE, seed: rng.byte() });
  }
  const [dx, dz] = sidePoint(gs, faceCoord(lot, gs), g + 3, 2.5);
  ctx.dest(CAT, L.name, dx, 0.52, dz, Math.atan2(SV[gs][0], SV[gs][1]));
}

// ---------------------------------------------------------------------------
// Pyramide-arcologie : sommet lumineux et torchères
// ---------------------------------------------------------------------------
export function pyramidCrown(ctx: Ctx, t: Tower) {
  const { rng, world } = ctx;
  const top = t.segs[t.segs.length - 1];
  const y = top.y1;
  const cx = (top.x0 + top.x1) / 2, cz = (top.z0 + top.z1) / 2;
  const gold = hex(0xffb000);
  let r = Math.min(top.x1 - top.x0, top.z1 - top.z0) / 2 - 3.5;
  let yy = y;
  // pyramidion : gradins dorés, arêtes lumineuses
  for (let k = 0; k < 6 && r > 0.6; k++) {
    const rr = snap(r);
    ctx.box({ x0: cx - rr, x1: cx + rr, z0: cz - rr, z1: cz + rr }, yy, yy + 2.5, { color: hex(0x5a4420), style: STYLE.CURTAIN, seed: rng.byte(), extra: 200 });
    for (const [x, z] of [[cx - rr, cz - rr], [cx + rr - 0.25, cz - rr], [cx - rr, cz + rr - 0.25], [cx + rr - 0.25, cz + rr - 0.25]])
      ctx.box({ x0: x, x1: x + 0.25, z0: z, z1: z + 0.25 }, yy, yy + 2.5, { color: gold, style: STYLE.EMISSIVE, emis: 4, solid: false, noRain: true });
    yy += 2.5;
    r -= 1.1;
  }
  ctx.box({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5 }, yy, yy + 3, { color: gold, style: STYLE.EMISSIVE, emis: 7, extra: 2, seed: rng.byte(), solid: false });
  world.light(cx, yy + 2, cz, gold, 2.4, 40);
  world.cone(cx, yy + 3, cz, 0, 1, 0, 60, 7, gold, 0.1);
  // torchères aux quatre coins du toit : jets de flammes périodiques
  const m = 1.5;
  for (const [x, z] of [[top.x0 + m, top.z0 + m], [top.x1 - m - 1.5, top.z0 + m], [top.x0 + m, top.z1 - m - 1.5], [top.x1 - m - 1.5, top.z1 - m - 1.5]]) {
    const r0 = { x0: x, x1: x + 1.5, z0: z, z1: z + 1.5 };
    if (!ctx.free(r0, y + 0.1, y + 10)) continue;
    const h = 9;
    ctx.box(r0, y, y + h, { color: hex(0x2a2a2e), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    ctx.box(inset(r0, -0.15), y + h, y + h + 0.3, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 2, extra: 2, seed: rng.byte(), solid: false });
    world.spot('flare', x + 0.75, y + h + 0.3, z + 0.75, rng.range(9, 16), rng.range(0, 20), hex(0xff7a20));
  }
}
