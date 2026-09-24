import {
  ALLEY, BLOCK, BLOCKS, CONCRETE, HALF, LEVEL, LUX_Y, NEON, PITCH, ROAD, SIDEWALK, STRATUM, STYLE, hex, type RGB,
} from '../config';
import { RNG, snap } from '../rng';
import { buildBasement, planBasements, type Basement, type Plaza } from './basements';
import { SKIP, World } from './builder';
import { dark, makeCtx, type Escape, type PedDefs } from './ctx';
import {
  OPP, SIDES, SV, alongRange, faceCoord, outOf, rectSub, rectSubAll, sidePoint, sideRect, subtractIntervals,
  type Rect, type Seg, type Side,
} from './geom';
import { buildMetro, type MetroLine } from './metro';
import { decorateRoof, decorateTerraces, streetProps } from './props';
import { placeFireEscapes } from './stairs';
import { FLOOR_H, FLOOR_KINDS, buildFloor, planFloors, type Floor } from './floors';
import { placeDestinations, placeHolograms, placeIncidents, placePad, placeSearchlight } from './spectacle';
import { buildLandmark, pickLandmarks, pyramidCrown } from './landmarks';
import { balconies, roofFeature } from './extras';
import { streetExtras } from './street';
import type { Dest } from './ctx';

export { SV, OPP, faceCoord, alongRange, outOf, sideRect, type Side, type Rect, type Seg } from './geom';

export interface Stop { y: number; label: string }
export interface ElevatorDef {
  id: number;
  side: Side;
  F: number;       // coordonnée de la face du socle
  along: number;   // centre de la gaine le long de la face
  stops: Stop[];
  top: number;
  accent: RGB;
  towerName: string;
}

export interface Tower {
  id: number;
  name: string;
  lot: Rect;
  segs: Seg[];
  H: number;
  style: number;
  color: RGB;
  accent: RGB;
  litBias: number;
  streetSides: Side[];
  alleySides: Side[];
  eSide: number;
  room?: { side: Side; rect: Rect; kind: number };
  neonEdges: boolean;
  cornerNeon: boolean;
  crown: boolean;
  gaps: [number, number][][][];
  floors: Floor[];
  along?: number; // centre de la gaine d'ascenseur le long de la face
  landmark?: 'pyramid';
}

export interface Bridge { x0: number; z0: number; x1: number; z1: number; y: number }
export interface Lane { axis: 0 | 1; coord: number; y: number; dir: 1 | -1; speed: number; count: number }

export interface City {
  towers: Tower[];
  elevators: ElevatorDef[];
  bridges: Bridge[];
  lanes: Lane[];
  wires: number[];
  plazas: Plaza[];
  metro: MetroLine[];
  basements: Basement[];
  escapes: Escape[];
  dests: Dest[];
  peds: PedDefs;
  spawn: { x: number; y: number; z: number; yaw: number; pitch: number };
}

const levelLabel = (y: number) => {
  const m = Math.round(y - 0.5);
  if (m % STRATUM === 0) return `Niveau ${m / STRATUM} · ${m} m`;
  return `Terrasse · ${m} m`;
};

const NAMES_A = ['Hoshi', 'Kuro', 'Neon', 'Arasaka', 'Tenkai', 'Kaiju', 'Zaibatsu', 'Oni', 'Ryu', 'Sora', 'Yami', 'Kage', 'Hikari', 'Tetsu', 'Mirai', 'Denki'];
const NAMES_B = ['Tower', 'Spire', 'Arcology', 'Heights', 'Plaza', 'Complex', 'Stack', 'Citadel', 'Needle', 'Block'];
const SHOP_COLS: RGB[] = [hex(0xffc58a), hex(0xff9ad5), hex(0x9ae8ff), hex(0xfff1d0), hex(0xc9a0ff), hex(0xa0ffb4)];
const BRICK: RGB[] = [hex(0x5a2a20), hex(0x4a2418), hex(0x6a3a2a), hex(0x6a5a44), hex(0x3a3030)];
const METAL: RGB[] = [hex(0x3a4450), hex(0x4a3a30), hex(0x2e4a3e), hex(0x4a4a4c)];
const GLASS: RGB[] = [hex(0x1a3040), hex(0x20303a), hex(0x2a2a3a), hex(0x303a30)];
const PANEL: RGB[] = [hex(0x8a8a88), hex(0x6a6e72), hex(0x7a746a)];
const OLD_A = ['Maison', 'Immeuble', 'Résidence', 'Hôtel'];
const OLD_B = ['Lin', 'Wong', 'Chan', 'Ho', 'Lau', 'Cheung', 'Victoria', 'Canton'];

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
export function generateCity(world: World, seed: number): City {
  const rng = new RNG(seed);
  const ctx = makeCtx(world, rng);
  const { box, free } = ctx;
  const towers: Tower[] = [];
  const elevators: ElevatorDef[] = [];
  const bridges: Bridge[] = [];
  const plazas: Plaza[] = [];
  const alleys: Rect[] = [];
  const wires: number[] = [];
  const blocks: Rect[] = [];

  // Chaussées : collision seule (le rendu est assuré par le réflecteur)
  for (let i = 0; i <= BLOCKS; i++) {
    const c = -HALF + i * PITCH;
    world.col.add(c - ROAD / 2, -2, -HALF - PITCH, c + ROAD / 2, 0, HALF + PITCH);
    world.col.add(-HALF - PITCH, -2, c - ROAD / 2, HALF + PITCH, 0, c + ROAD / 2);
  }

  // ---- Îlots, lots, ruelles ---------------------------------------------------
  for (let bi = 0; bi < BLOCKS; bi++)
    for (let bj = 0; bj < BLOCKS; bj++) {
      const bx0 = -HALF + bi * PITCH + ROAD / 2;
      const bz0 = -HALF + bj * PITCH + ROAD / 2;
      const B: Rect = { x0: bx0, z0: bz0, x1: bx0 + BLOCK, z1: bz0 + BLOCK };
      blocks.push(B);
      const I: Rect = { x0: B.x0 + SIDEWALK, z0: B.z0 + SIDEWALK, x1: B.x1 - SIDEWALK, z1: B.z1 - SIDEWALK };
      const { lots, al } = splitBlock(I, rng);
      alleys.push(...al);
      for (const lot of lots) {
        const streetSides: Side[] = [];
        const alleySides: Side[] = [];
        for (const s of SIDES) (Math.abs(faceCoord(lot, s) - faceCoord(I, s)) < 0.01 ? streetSides : alleySides).push(s);
        const cd = Math.max(Math.abs((lot.x0 + lot.x1) / 2), Math.abs((lot.z0 + lot.z1) / 2)) / HALF;
        if (rng.chance(0.05 + cd * 0.06) && lots.length > 1) {
          plazas.push({ rect: lot, streetSides });
          continue;
        }
        const t = makeTower(lot, streetSides, alleySides, towers.length);
        if (t) towers.push(t);
        else plazas.push({ rect: lot, streetSides });
      }
    }

  // ---- Pyramide-arcologie : un îlot central entier ------------------------------
  let pyramidLot: Rect | null = null;
  {
    const cands = blocks.filter((B) => Math.max(Math.abs((B.x0 + B.x1) / 2), Math.abs((B.z0 + B.z1) / 2)) < PITCH * 1.6);
    const B = rng.pick(cands);
    const I: Rect = { x0: B.x0 + SIDEWALK, z0: B.z0 + SIDEWALK, x1: B.x1 - SIDEWALK, z1: B.z1 - SIDEWALK };
    const inside = (r: Rect) => r.x0 >= I.x0 - 0.01 && r.x1 <= I.x1 + 0.01 && r.z0 >= I.z0 - 0.01 && r.z1 <= I.z1 + 0.01;
    for (let i = towers.length - 1; i >= 0; i--) if (inside(towers[i].lot)) towers.splice(i, 1);
    for (let i = plazas.length - 1; i >= 0; i--) if (inside(plazas[i].rect)) plazas.splice(i, 1);
    for (let i = alleys.length - 1; i >= 0; i--) if (inside(alleys[i])) alleys.splice(i, 1);
    towers.push(makePyramid(I));
    pyramidLot = I;
  }
  const landmarks = pickLandmarks(rng, towers, [pyramidLot!]);
  towers.forEach((t, i) => (t.id = i));

  function makePyramid(lot: Rect): Tower {
    const streetSides: Side[] = [0, 1, 2, 3];
    const eSide = rng.pick(streetSides);
    const m = (s: number) => (s === eSide ? 7.5 : 1.5);
    const seg0: Rect = { x0: lot.x0 + m(3), x1: lot.x1 - m(1), z0: lot.z0 + m(0), z1: lot.z1 - m(2) };
    const segs: Seg[] = [];
    const TH = 24, IN = 3;
    for (let k = 0; k < 9; k++) {
      const r = { x0: seg0.x0 + IN * k, x1: seg0.x1 - IN * k, z0: seg0.z0 + IN * k, z1: seg0.z1 - IN * k };
      if (r.x1 - r.x0 < 12 || r.z1 - r.z0 < 12) break;
      segs.push({ ...r, y0: 0.5 + TH * k, y1: 0.5 + TH * (k + 1) });
    }
    const t: Tower = {
      id: towers.length, name: 'Arcologie Tenkai', lot, segs, H: segs[segs.length - 1].y1, style: STYLE.CURTAIN,
      color: hex(0x6a5426), accent: hex(0xffb000), litBias: 210, streetSides, alleySides: [], eSide,
      neonEdges: true, cornerNeon: true, crown: false, gaps: segs.map(() => [[], [], [], []]), floors: [], landmark: 'pyramid',
    };
    t.floors = planFloors(ctx, t, LUX_Y);
    return t;
  }

  function splitBlock(I: Rect, r: RNG): { lots: Rect[]; al: Rect[] } {
    const w = I.x1 - I.x0;
    const half = (w - ALLEY) / 2;
    const cx = (I.x0 + I.x1) / 2, cz = (I.z0 + I.z1) / 2;
    const d = Math.max(Math.abs(cx), Math.abs(cz)) / HALF;
    const p = r.next();
    const A = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
    const xa = I.x0 + half, xb = I.x1 - half, za = I.z0 + half, zb = I.z1 - half;
    const vx = A(xa, I.z0, xb, I.z1), hz = A(I.x0, za, I.x1, zb);
    if (p < 0.08 + (1 - d) * 0.12) return { lots: [I], al: [] };
    if (p < 0.4) {
      return r.chance(0.5)
        ? { lots: [A(I.x0, I.z0, xa, I.z1), A(xb, I.z0, I.x1, I.z1)], al: [vx] }
        : { lots: [A(I.x0, I.z0, I.x1, za), A(I.x0, zb, I.x1, I.z1)], al: [hz] };
    }
    if (p < 0.55) {
      return { lots: [A(I.x0, I.z0, xa, I.z1), A(xb, I.z0, I.x1, za), A(xb, zb, I.x1, I.z1)], al: [vx, A(xb, za, I.x1, zb)] };
    }
    return { lots: [A(I.x0, I.z0, xa, za), A(xb, I.z0, I.x1, za), A(I.x0, zb, xa, I.z1), A(xb, zb, I.x1, I.z1)], al: [vx, A(I.x0, za, xa, zb), A(xb, za, I.x1, zb)] };
  }

  function pickTops(need: number, H: number): number[] {
    const cands: number[] = [];
    for (let y = 0.5 + 36; y <= H - 24; y += LEVEL) cands.push(y);
    const w = cands.map((y) => (Math.round(y - 0.5) % STRATUM === 0 ? 14 : 1));
    const tot = w.reduce((a, b) => a + b, 0);
    const chosen: number[] = [];
    let tries = 0;
    while (chosen.length < need && tries++ < 300 && cands.length) {
      let x = rng.next() * tot;
      let c = cands[0];
      for (let i = 0; i < cands.length; i++) {
        x -= w[i];
        if (x <= 0) { c = cands[i]; break; }
      }
      if (chosen.every((v) => Math.abs(v - c) >= 24)) chosen.push(c);
    }
    return chosen.sort((a, b) => a - b);
  }

  function makeTower(lot: Rect, streetSides: Side[], alleySides: Side[], id: number): Tower | null {
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    const d = Math.min(1, Math.max(Math.abs(cx), Math.abs(cz)) / HALF);
    const area = (lot.x1 - lot.x0) * (lot.z1 - lot.z0);
    let hMax = 150 + 340 * Math.pow(1 - d, 1.2);
    if (area > 3000) hMax *= 1.25;
    let H = hMax * (0.35 + 0.65 * Math.pow(rng.next(), 0.7));
    if (rng.chance(0.06 + (area > 3000 ? 0.3 : 0) + (1 - d) * 0.05)) H = 430 + rng.next() * 150;
    // styles : vieux immeubles de brique et entrepôts en périphérie, murs-rideaux au centre, hôtels-capsules
    let style: number = rng.pick([1, 1, 2, 2, 3, 4] as const);
    let low = 0;
    const r = rng.next();
    if (d > 0.55 && r < 0.2) { style = STYLE.HERITAGE; low = rng.int(2, 3); }
    else if (d > 0.5 && r < 0.32) { style = STYLE.INDUSTRIAL; low = rng.int(1, 3); }
    else if (d < 0.5 && r > 0.8) style = STYLE.CURTAIN;
    else if (r > 0.74 && r < 0.8) style = STYLE.CAPSULE;
    if (style === 3) H = Math.min(H, 80 + rng.next() * 110);
    if (style === STYLE.CAPSULE) H = Math.min(H, 60 + rng.next() * 100);
    H = low ? 0.5 + LEVEL * low : 0.5 + LEVEL * Math.max(3, Math.round((H - 0.5) / LEVEL));

    let eSide = -1;
    if (H >= 40 && streetSides.length > 0 && rng.chance(H > 150 ? 0.85 : 0.55)) eSide = rng.pick(streetSides);

    const margin = (s: number) => (s === eSide ? 7.5 : snap(rng.range(1, 2.5)));
    const m = [margin(0), margin(1), margin(2), margin(3)];
    const seg0: Rect = { x0: lot.x0 + m[3], x1: lot.x1 - m[1], z0: lot.z0 + m[0], z1: lot.z1 - m[2] };
    if (seg0.x1 - seg0.x0 < 14 || seg0.z1 - seg0.z0 < 14) return null;

    const rects: Rect[] = [seg0];
    const maxSeg = style === 3 ? 2 : 1 + Math.min(5, Math.floor(H / 70));
    const S = rng.int(1, maxSeg);
    while (rects.length < S) {
      const p = rects[rects.length - 1];
      const r: Rect = {
        x0: p.x0 + snap(rng.range(3, 7)), x1: p.x1 - snap(rng.range(3, 7)),
        z0: p.z0 + snap(rng.range(3, 7)), z1: p.z1 - snap(rng.range(3, 7)),
      };
      if (r.x1 - r.x0 < 12 || r.z1 - r.z0 < 12) break;
      rects.push(r);
    }
    const tops = pickTops(rects.length - 1, H);
    rects.length = tops.length + 1;
    const segs: Seg[] = rects.map((r, k) => ({ ...r, y0: k === 0 ? 0.5 : tops[k - 1], y1: k < tops.length ? tops[k] : H }));

    const old = style === STYLE.HERITAGE || style === STYLE.INDUSTRIAL;
    const t: Tower = {
      id,
      name: style === STYLE.HERITAGE ? `${rng.pick(OLD_A)} ${rng.pick(OLD_B)}` : style === STYLE.INDUSTRIAL ? `Entrepôt ${rng.int(2, 99)}` : `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`,
      lot, segs, H, style,
      color: style === STYLE.HERITAGE ? rng.pick(BRICK) : style === STYLE.INDUSTRIAL ? rng.pick(METAL) : style === STYLE.CURTAIN ? rng.pick(GLASS) : style === STYLE.CAPSULE ? rng.pick(PANEL) : rng.pick(CONCRETE),
      accent: rng.pick(NEON),
      litBias: rng.byte(),
      streetSides, alleySides, eSide,
      neonEdges: rng.chance(old ? 0.25 : 0.75),
      cornerNeon: rng.chance(old ? 0.1 : 0.3),
      crown: !old && rng.chance(0.35),
      gaps: segs.map(() => [[], [], [], []]),
      floors: [],
    };
    if (style === 3) t.color = dark(t.color, 1.15);

    const roomSides = streetSides.filter((s) => s !== eSide);
    if (roomSides.length && rng.chance(0.24) && segs[0].y1 - segs[0].y0 >= 18) {
      const s = rng.pick(roomSides);
      const [a0, a1] = alongRange(seg0, s);
      const w = snap(Math.min(a1 - a0 - 4, rng.range(12, 20)));
      const depth = snap(rng.range(9, 12));
      if (w >= 12) {
        const ra = snap(rng.range(a0 + 2, a1 - 2 - w));
        t.room = { side: s, rect: sideRect(s, faceCoord(seg0, s), ra, ra + w, -depth, 0), kind: rng.int(0, 2) };
      }
    }
    t.floors = planFloors(ctx, t, LUX_Y);
    return t;
  }

  // ---- Sous-sols (planifiés avant de couler les dalles) -------------------------
  const basements = planBasements(ctx, plazas, alleys);
  for (const B of blocks) {
    const holes = basements.map((b) => b.stair).filter((s) => s.x0 < B.x1 && s.x1 > B.x0 && s.z0 < B.z1 && s.z1 > B.z0);
    for (const r of rectSubAll(B, holes)) box(r, 0, 0.5, { color: hex(0x3b3a45), style: STYLE.GROUND, seed: rng.byte() });
  }

  // ---- Corps des tours ------------------------------------------------------
  for (const t of towers) {
    t.segs.forEach((seg, k) => {
      const o = { color: t.color, style: t.style, seed: rng.byte(), extra: t.litBias };
      // volume plein, évidé des étages aménagés (et du local du rez-de-chaussée)
      const start = k === 0 && t.room ? 6.5 : seg.y0;
      const bands = t.floors.filter((f) => f.k === k).map((f) => [f.y, f.y + FLOOR_H] as [number, number]);
      for (const [p0, p1] of subtractIntervals([start, seg.y1], bands)) {
        const hidden = (p0 === seg.y0 && k > 0) || (k === 0 && !!t.room && p0 === 6.5);
        box(seg, p0, p1, { ...o, skip: hidden ? SKIP.NY : 0 });
      }
      if (k === 0 && t.room) {
        for (const r of rectSub(seg, t.room.rect)) box(r, 0.5, 6.5, o);
        buildRoom(t);
      }
    });
  }

  for (const L of landmarks) buildLandmark(ctx, L);

  function buildRoom(t: Tower) {
    const room = t.room!;
    const s = room.side;
    const R = room.rect;
    const F = faceCoord(t.segs[0], s);
    const [a0, a1] = alongRange(R, s);
    const depth = -outOf(s, F, faceCoord(R, OPP[s]));
    const wall = hex(0x2a2230);
    const kindCols: RGB[][] = [
      [hex(0xff2a9d), hex(0xffb000)],
      [hex(0x00e5ff), hex(0xa64dff)],
      [hex(0xff3b3b), hex(0xffb000)],
    ];
    const [c1, c2] = kindCols[room.kind];
    const lr = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, p0, p1, o0, o1);
    box(lr(a0, a0 + 0.5, -depth, -0.5), 0.5, 6.5, { color: wall });
    box(lr(a1 - 0.5, a1, -depth, -0.5), 0.5, 6.5, { color: wall });
    box(lr(a0 + 0.5, a1 - 0.5, -depth, -depth + 0.5), 0.5, 6.5, { color: wall });
    box(lr(a0, a1, -depth, 0), 6.0, 6.5, { color: hex(0x16131c), noRain: true });
    for (let a = a0 + 2; a < a1 - 1.5; a += 4)
      box(lr(a, a + 0.25, -depth + 1, -1), 5.9, 6.0, { color: c2, style: STYLE.EMISSIVE, emis: 1.4, solid: false });
    const dc = snap(rng.range(a0 + 5, a1 - 5));
    const front = (p0: number, p1: number, y0: number, y1: number, glass = false) => {
      if (p1 - p0 < 0.01) return;
      const r = lr(p0, p1, -0.5, 0);
      if (glass) box(r, y0, y1, { color: c1, glass: true });
      else box(r, y0, y1, { color: t.color, style: STYLE.SOLID });
    };
    front(a0, a0 + 1, 0.5, 6.5);
    front(a0 + 1, dc - 2.5, 0.5, 4.5, true);
    front(a0 + 1, dc - 2.5, 4.5, 6.5);
    front(dc - 2.5, dc - 1.5, 0.5, 6.5);
    front(dc - 1.5, dc + 1.5, 4.0, 6.5);
    front(dc + 1.5, dc + 2.5, 0.5, 6.5);
    front(dc + 2.5, a1 - 1, 0.5, 4.5, true);
    front(dc + 2.5, a1 - 1, 4.5, 6.5);
    front(a1 - 1, a1, 0.5, 6.5);
    box(lr(dc - 4, dc + 4, 0, 0.5), 6.75, 8.25, { color: c1, style: STYLE.SIGN, emis: 3.2, seed: rng.byte(), extra: rng.int(0, 2) });
    const ctr = (p: number, o: number) => sidePoint(s, F, p, o);
    const [lx, lz] = ctr(dc, 2);
    world.light(lx, 7.5, lz, c1, 2.2, 14);
    ctx.reserve(lr(dc - 1.5, dc + 1.5, 0, 2.5), 0.5, 3.5);

    const D = depth;
    const face = Math.atan2(-SV[s][0], -SV[s][1]); // regard vers l'intérieur
    if (room.kind === 0) {
      box(lr(a0 + 2, a1 - 2, -(D - 2.5), -(D - 3.5)), 0.5, 1.6, { color: hex(0x3b2418) });
      box(lr(a0 + 2, a1 - 2, -(D - 3.5), -(D - 3.6)), 1.3, 1.5, { color: c1, style: STYLE.EMISSIVE, emis: 3, solid: false });
      for (let a = a0 + 2.5; a < a1 - 2.5; a += 1.5) box(lr(a, a + 0.5, -(D - 4.1), -(D - 4.6)), 0.5, 1.4, { color: hex(0x55505a) });
      for (const y of [1.6, 2.4]) {
        box(lr(a0 + 1, a1 - 1, -(D - 0.5), -(D - 1.1)), y, y + 0.1, { color: hex(0x2a2a2a) });
        for (let a = a0 + 1.25; a < a1 - 1.25; a += 0.5)
          if (rng.chance(0.7))
            box(lr(a, a + 0.25, -(D - 0.6), -(D - 0.85)), y + 0.1, y + 0.1 + rng.pick([0.35, 0.5, 0.6]), {
              color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 1.1, solid: false,
            });
      }
      box(lr(dc - 4, dc + 4, -(D - 0.5), -(D - 0.75)), 3.0, 6.0, { color: c2, style: STYLE.SIGN, emis: 2.4, seed: rng.byte(), extra: 1 });
      const [bx, bz] = ctr((a0 + a1) / 2, -(D - 1.8));
      ctx.pose(bx, 0.5, bz, face + Math.PI, 4);
      for (let a = a0 + 3; a < a1 - 3; a += 1.5)
        if (rng.chance(0.45)) { const [x, z] = ctr(a + 0.25, -(D - 4.35)); ctx.sit(x, 1.4, z, face, 8); }
    } else if (room.kind === 1) {
      for (const row of [3, 7]) {
        if (row + 2 > D - 1) continue;
        for (let a = a0 + 2; a < a1 - 3; a += 2.5) {
          box(lr(a, a + 1.5, -(row + 1), -row), 0.5, 2.5, { color: hex(0x1a1a24), style: STYLE.SCREEN, emis: 2.2, seed: rng.byte() });
          if (rng.chance(0.4)) { const [x, z] = ctr(a + 0.75, -(row - 0.7)); ctx.pose(x, 0.5, z, face, 10); }
        }
      }
    } else {
      box(lr(a0 + 3, a1 - 3, -(D - 2.5), -(D - 3.5)), 0.5, 1.2, { color: hex(0x4a2e1c) });
      box(lr(a0 + 3, a0 + 4, -(D - 3.5), -3), 0.5, 1.2, { color: hex(0x4a2e1c) });
      box(lr(a1 - 4, a1 - 3, -(D - 3.5), -3), 0.5, 1.2, { color: hex(0x4a2e1c) });
      for (let a = a0 + 2; a < a1 - 1.5; a += 2.5)
        box(lr(a, a + 0.5, -(D * 0.5), -(D * 0.5 - 0.5)), 4.5, 5.25, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 2.5, solid: false, extra: 2 });
      const [sx, sz] = ctr((a0 + a1) / 2, -(D - 3));
      world.emitSteam(sx, 1.3, sz, 0.8, 3.5, 10, hex(0x5a4040));
      for (let a = a0 + 4.5; a < a1 - 4.5; a += 1.5)
        if (rng.chance(0.35)) { const [x, z] = ctr(a, -(D - 4.3)); ctx.pose(x, 0.5, z, face, 10); }
    }
    const [ix, iz] = ctr((a0 + a1) / 2, -D * 0.5);
    world.light(ix, 5, iz, c1, 2.4, 13);
    const [jx, jz] = ctr(a0 + (a1 - a0) * 0.2, -D * 0.7);
    world.light(jx, 4.5, jz, c2, 1.8, 10);
  }

  // ---- Ascenseurs -----------------------------------------------------------
  for (const t of towers) {
    if (t.eSide < 0) continue;
    const s = t.eSide as Side;
    const seg0 = t.segs[0];
    const top = t.segs[t.segs.length - 1];
    const F = faceCoord(seg0, s);
    const [ta0, ta1] = alongRange(top, s);
    const along = snap((ta0 + ta1) / 2);
    t.along = along;
    const topY = t.H + 4.5;
    const metal = hex(0x2a2e38);
    const R = (a0: number, a1: number, o0: number, o1: number) => sideRect(s, F, along + a0, along + a1, o0, o1);

    for (const ao of [-2, 1.5]) for (const oo of [3, 6.5]) box(R(ao, ao + 0.5, oo, oo + 0.5), 0.5, topY, { color: metal, noRain: true });
    box(R(-1.85, -1.65, 7, 7.1), 3.5, topY, { color: t.accent, style: STYLE.EMISSIVE, emis: 2, solid: false, noRain: true });
    box(R(1.65, 1.85, 7, 7.1), 3.5, topY, { color: t.accent, style: STYLE.EMISSIVE, emis: 2, solid: false, noRain: true });
    for (let y = 6.5; y < topY - 1; y += LEVEL) {
      box(R(-1.5, 1.5, 3, 3.5), y, y + 0.5, { color: metal, noRain: true });
      box(R(-1.5, 1.5, 6.5, 7), y, y + 0.5, { color: metal, noRain: true });
      box(R(-2, -1.5, 3.5, 6.5), y, y + 0.5, { color: metal, noRain: true });
      box(R(1.5, 2, 3.5, 6.5), y, y + 0.5, { color: metal, noRain: true });
    }
    box(R(-2.25, 2.25, 2.75, 7.25), topY, topY + 0.5, { color: metal });
    box(R(-0.25, 0.25, 4.75, 5.25), topY + 0.5, topY + 1, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 6, extra: 1, solid: false });
    box(R(-2, -1.9, 3.5, 6.5), 0.5, 3.5, { color: t.accent, glass: true });
    box(R(1.9, 2, 3.5, 6.5), 0.5, 3.5, { color: t.accent, glass: true });
    box(R(-1.5, 1.5, 6.8, 6.9), 0.5, 3.5, { color: t.accent, glass: true });
    ctx.reserve(R(-2, 2, 0, 3), 0.5, 3.5);

    const stops: Stop[] = [{ y: 0.5, label: 'Rue · 0 m' }];
    t.segs.forEach((seg, k) => {
      const y = seg.y1;
      const oK = outOf(s, F, faceCoord(seg, s));
      box(R(-1.5, 1.5, oK, 3.5), y - 0.5, y, { color: hex(0x30343c) });
      box(R(-1.5, -1.0, oK, 3.0), y, y + 1.0, { color: metal });
      box(R(1.0, 1.5, oK, 3.0), y, y + 1.0, { color: metal });
      box(R(-1.5, -1.25, oK, 3.0), y - 0.75, y - 0.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
      box(R(1.25, 1.5, oK, 3.0), y - 0.75, y - 0.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
      t.gaps[k][s].push([along - 1.5, along + 1.5]);
      const c = R(0, 0, (oK + 3) / 2, (oK + 3) / 2);
      world.light(c.x0, y + 2.5, c.z0, t.accent, 1.3, 10);
      stops.push({ y, label: k === t.segs.length - 1 ? `Toit · ${Math.round(y - 0.5)} m` : levelLabel(y) });
    });
    // étages aménagés : passerelle jusqu'à la porte, arrêt supplémentaire
    for (const f of t.floors) {
      const y = f.y;
      const oK = outOf(s, F, faceCoord(t.segs[f.k], s));
      box(R(-1.5, 1.5, oK, 3.5), y - 0.5, y, { color: hex(0x30343c) });
      box(R(-1.5, -1.0, oK, 3.0), y, y + 1.0, { color: metal });
      box(R(1.0, 1.5, oK, 3.0), y, y + 1.0, { color: metal });
      box(R(-1.5, -1.25, oK, 3.0), y - 0.75, y - 0.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
      box(R(1.25, 1.5, oK, 3.0), y - 0.75, y - 0.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
      buildFloor(ctx, t, f, along);
      const name = `${FLOOR_KINDS[f.kind]} · ${Math.round(y - 0.5)} m`;
      stops.push({ y, label: name });
      const [dx, dz] = sidePoint(s, faceCoord(t.segs[f.k], s), along, -2.5);
      ctx.dest('Étages', `${FLOOR_KINDS[f.kind]} · ${t.name} (${Math.round(y - 0.5)} m)`, dx, y + 0.06, dz, Math.atan2(SV[s][0], SV[s][1]));
    }
    stops.sort((a, b) => a.y - b.y);
    elevators.push({ id: elevators.length, side: s, F, along, stops, top: topY, accent: t.accent, towerName: t.name });
  }

  // ---- Métro aérien -----------------------------------------------------------
  const metro = buildMetro(ctx);

  // ---- Passerelles ----------------------------------------------------------
  const pairs: { A: Tower; B: Tower; axis: 0 | 1; gap: number }[] = [];
  for (const A of towers)
    for (const B of towers) {
      if (A === B) continue;
      const zo = Math.min(A.lot.z1, B.lot.z1) - Math.max(A.lot.z0, B.lot.z0);
      const xo = Math.min(A.lot.x1, B.lot.x1) - Math.max(A.lot.x0, B.lot.x0);
      const gx = B.lot.x0 - A.lot.x1;
      const gz = B.lot.z0 - A.lot.z1;
      if (gx >= -0.01 && gx <= 40 && zo > 12) pairs.push({ A, B, axis: 0, gap: gx });
      if (gz >= -0.01 && gz <= 40 && xo > 12) pairs.push({ A, B, axis: 1, gap: gz });
    }

  for (const { A, B, axis } of pairs) {
    let made = 0;
    const sA: Side = axis === 0 ? 1 : 2;
    const sB: Side = axis === 0 ? 3 : 0;
    for (let i = 0; i < A.segs.length && made < 3; i++)
      for (let j = 0; j < B.segs.length && made < 3; j++) {
        const y = A.segs[i].y1;
        if (y !== B.segs[j].y1 || y < 30) continue;
        const reachable = A.eSide >= 0 || B.eSide >= 0;
        if (!rng.chance(reachable ? 0.9 : 0.45)) continue;
        const sa = A.segs[i], sb = B.segs[j];
        const [la0, la1] = alongRange(sa, sA);
        const [lb0, lb1] = alongRange(sb, sB);
        const lo = Math.max(la0, lb0), hi = Math.min(la1, lb1);
        if (hi - lo < 8) continue;
        const c = snap(rng.range(lo + 3, hi - 3));
        const fa = faceCoord(sa, sA), fb = faceCoord(sb, sB);
        if (fb - fa < 3 || fb - fa > 60) continue;
        const covered = rng.chance(0.45);
        const R = (a0: number, a1: number, p0: number, p1: number): Rect =>
          axis === 0 ? { x0: p0, x1: p1, z0: c + a0, z1: c + a1 } : { x0: c + a0, x1: c + a1, z0: p0, z1: p1 };
        if (!free(R(-2, 2, fa + 0.01, fb - 0.01), y - 1.3, y + (covered ? 4.6 : 1.2))) continue;
        const accent = rng.chance(0.5) ? A.accent : B.accent;
        const lux = y >= LUX_Y;
        const metal = lux ? hex(0x3a3a40) : hex(0x2b2f38);
        box(R(-2, 2, fa, fb), y - 1, y, { color: metal });
        if (lux) {
          box(R(-2, -1.5, fa, fb), y, y + 0.25, { color: metal });
          box(R(1.5, 2, fa, fb), y, y + 0.25, { color: metal });
          box(R(-1.85, -1.75, fa, fb), y + 0.25, y + 1.1, { color: hex(0xffe2b0), glass: true });
          box(R(1.75, 1.85, fa, fb), y + 0.25, y + 1.1, { color: hex(0xffe2b0), glass: true });
          box(R(-1.9, -1.7, fa, fb), y + 1.1, y + 1.16, { color: hex(0xffe2b0), style: STYLE.EMISSIVE, emis: 1.4, solid: false, noRain: true });
          box(R(1.7, 1.9, fa, fb), y + 1.1, y + 1.16, { color: hex(0xffe2b0), style: STYLE.EMISSIVE, emis: 1.4, solid: false, noRain: true });
        } else {
          box(R(-2, -1.5, fa, fb), y, y + 1, { color: metal });
          box(R(1.5, 2, fa, fb), y, y + 1, { color: metal });
          box(R(-1.6, -1.5, fa, fb), y + 0.85, y + 0.95, { color: accent, style: STYLE.EMISSIVE, emis: 1.8, solid: false, noRain: true });
          box(R(1.5, 1.6, fa, fb), y + 0.85, y + 0.95, { color: accent, style: STYLE.EMISSIVE, emis: 1.8, solid: false, noRain: true });
        }
        box(R(-2, -1.75, fa, fb), y - 1.25, y - 1, { color: accent, style: STYLE.EMISSIVE, emis: 3.5, solid: false, noRain: true });
        box(R(1.75, 2, fa, fb), y - 1.25, y - 1, { color: accent, style: STYLE.EMISSIVE, emis: 3.5, solid: false, noRain: true });
        if (covered) {
          for (let p = fa + 1; p < fb - 0.5; p += 6) {
            box(R(-2, -1.5, p, p + 0.5), y + 1, y + 4, { color: metal });
            box(R(1.5, 2, p, p + 0.5), y + 1, y + 4, { color: metal });
            box(R(-2, 2, p, p + 0.5), y + 4, y + 4.5, { color: metal });
          }
          box(R(-1.5, 1.5, fa, fb), y + 4.35, y + 4.45, { color: accent, glass: true });
          box(R(-1.95, -1.85, fa, fb), y + 1.1, y + 4, { color: accent, glass: true });
          box(R(1.85, 1.95, fa, fb), y + 1.1, y + 4, { color: accent, glass: true });
        }
        for (let p = fa + 6; p < fb - 3; p += 12) {
          const r = R(0, 0, p, p);
          world.light(r.x0, y + 2.8, r.z0, lux ? hex(0xffd6a0) : accent, 1.4, 11);
        }
        A.gaps[i][sA].push([c - 2, c + 2]);
        B.gaps[j][sB].push([c - 2, c + 2]);
        const rr = R(-2, 2, fa, fb);
        bridges.push({ ...rr, y });
        if (rng.chance(0.65)) {
          const e0 = R(0, 0, fa + 0.5, fa + 0.5), e1 = R(0, 0, fb - 0.5, fb - 0.5);
          const off = rng.range(-0.9, 0.9);
          ctx.peds.lines.push({
            x0: e0.x0 + (axis === 1 ? off : 0), z0: e0.z0 + (axis === 0 ? off : 0),
            x1: e1.x0 + (axis === 1 ? off : 0), z1: e1.z0 + (axis === 0 ? off : 0), y, count: rng.int(1, 2),
          });
        }
        made++;
      }
  }

  // ---- Escaliers de secours, sous-sols ---------------------------------------------
  placeFireEscapes(ctx, towers);
  for (const b of basements) buildBasement(ctx, b);

  // ---- Parapets (verre en hauteur), néons de rive, lampes de terrasse ---------------
  for (const t of towers) {
    const last = t.segs.length - 1;
    t.segs.forEach((seg, k) => {
      const y = seg.y1;
      const lux = y >= LUX_Y;
      const pcol = dark(t.color, 0.8);
      for (const s of SIDES) {
        const F = faceCoord(seg, s);
        const [a0, a1] = alongRange(seg, s);
        for (const [p0, p1] of subtractIntervals([a0, a1], t.gaps[k][s])) {
          const q0 = s === 1 || s === 3 ? Math.max(p0, a0 + 0.5) : p0;
          const q1 = s === 1 || s === 3 ? Math.min(p1, a1 - 0.5) : p1;
          if (q1 - q0 > 0.1) {
            if (lux) {
              box(sideRect(s, F, q0, q1, -0.5, 0), y, y + 0.25, { color: hex(0x3a3a40) });
              box(sideRect(s, F, q0, q1, -0.3, -0.2), y + 0.25, y + 1.1, { color: hex(0xffe2b0), glass: true });
              box(sideRect(s, F, q0, q1, -0.35, -0.15), y + 1.1, y + 1.16, { color: hex(0xffe2b0), style: STYLE.EMISSIVE, emis: 1.2, solid: false, noRain: true });
            } else box(sideRect(s, F, q0, q1, -0.5, 0), y, y + 1, { color: pcol });
          }
          if (t.neonEdges) box(sideRect(s, F, p0, p1, 0, 0.25), y - 1, y - 0.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3.5, solid: false, noRain: true });
        }
        if (t.cornerNeon) {
          const cr = s === 0 ? { x0: seg.x0 - 0.25, x1: seg.x0, z0: seg.z0 - 0.25, z1: seg.z0 }
            : s === 1 ? { x0: seg.x1, x1: seg.x1 + 0.25, z0: seg.z0 - 0.25, z1: seg.z0 }
            : s === 2 ? { x0: seg.x1, x1: seg.x1 + 0.25, z0: seg.z1, z1: seg.z1 + 0.25 }
            : { x0: seg.x0 - 0.25, x1: seg.x0, z0: seg.z1, z1: seg.z1 + 0.25 };
          box(cr, seg.y0 + (k === 0 ? 8 : 0), seg.y1 - 1, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
        }
      }
      if (k < last) {
        const n = t.segs[k + 1];
        const col = lux ? hex(0xffd6a0) : t.accent;
        const pts: [number, number][] = [[n.x0 - 1.25, n.z0 - 1.25], [n.x1 + 0.75, n.z0 - 1.25], [n.x0 - 1.25, n.z1 + 0.75], [n.x1 + 0.75, n.z1 + 0.75]];
        for (const [px, pz] of pts) {
          const r = { x0: px, x1: px + 0.5, z0: pz, z1: pz + 0.5 };
          if (!free(r, y + 0.05, y + 1.6)) continue;
          box(r, y, y + 1.25, { color: hex(0x22252c) });
          box(r, y + 1.25, y + 1.6, { color: col, style: STYLE.EMISSIVE, emis: lux ? 2.5 : 4, solid: false });
        }
        world.light(n.x0 - 1, y + 2, n.z0 - 1, col, 1.2, 12);
        world.light(n.x1 + 1, y + 2, n.z1 + 1, col, 1.2, 12);
      }
    });
    decorateTerraces(ctx, t);
  }

  // ---- Toits ------------------------------------------------------------------
  let nPads = 0;
  for (const t of towers) {
    const top = t.segs[t.segs.length - 1];
    const y = top.y1;
    if (t.landmark === 'pyramid') {
      pyramidCrown(ctx, t);
      const s = t.eSide as Side;
      const [rx, rz] = sidePoint(s, faceCoord(top, s), t.along!, -2);
      ctx.dest('Lieux uniques', `${t.name} · sommet (${Math.round(y - 0.5)} m)`, rx, y + 0.02, rz, Math.atan2(SV[s][0], SV[s][1]));
      const [bx, bz] = sidePoint(s, faceCoord(t.segs[0], s), t.along! + 4.5, 9);
      ctx.dest('Lieux uniques', `${t.name} · parvis`, bx, 0.52, bz, Math.atan2(SV[s][0], SV[s][1]));
      continue;
    }
    const luxRoof = decorateRoof(ctx, t);
    let bare = false;
    if (luxRoof) {
      const [rx, rz] = t.eSide >= 0 ? sidePoint(t.eSide as Side, faceCoord(top, t.eSide as Side), t.along!, -2) : [top.x0 + 1.5, top.z0 + 1.5];
      ctx.dest('Toits', `${t.name} · toit-terrasse (${Math.round(y - 0.5)} m)`, rx, y + 0.02, rz, t.eSide >= 0 ? Math.atan2(SV[t.eSide][0], SV[t.eSide][1]) : 0);
    } else {
      if (nPads < 14 && t.H >= 45 && t.H <= 280 && rng.chance(0.16) && placePad(ctx, t)) nPads++;
      if (t.H >= 160 && rng.chance(0.25)) placeSearchlight(ctx, t);
      bare = roofFeature(ctx, t);
    }
    const inner: Rect = { x0: top.x0 + 4, x1: top.x1 - 4, z0: top.z0 + 4, z1: top.z1 - 4 };
    const iw = inner.x1 - inner.x0, id = inner.z1 - inner.z0;
    const grey = hex(0x4a4e57);
    if (iw > 2 && id > 2 && !bare) {
      const n = luxRoof ? 0 : rng.int(2, 7);
      for (let i = 0; i < n; i++) {
        const w = snap(rng.range(1.5, 3.5)), d = snap(rng.range(1.5, 3.5)), h = snap(rng.range(1, 3));
        const x = snap(rng.range(inner.x0, inner.x1 - w)), z = snap(rng.range(inner.z0, inner.z1 - d));
        const r = { x0: x, x1: x + w, z0: z, z1: z + d };
        if (w > iw || d > id || !free(r, y, y + h)) continue;
        box(r, y, y + h, { color: rng.chance(0.3) ? hex(0x5d4a3a) : grey });
        if (y < 280 && rng.chance(0.18)) world.emitSteam(x + w / 2, y + h + 0.2, z + d / 2, 2.2, 14, 12, hex(0x4a4250));
      }
      const nA = luxRoof ? (t.H > 300 ? 1 : 0) : t.H > 200 ? rng.int(1, 3) : rng.int(0, 2);
      for (let i = 0; i < nA; i++) {
        const x = snap(rng.range(inner.x0, inner.x1 - 0.5)), z = snap(rng.range(inner.z0, inner.z1 - 0.5));
        const h = snap(rng.range(8, 30));
        const r = { x0: x, x1: x + 0.5, z0: z, z1: z + 0.5 };
        if (!free(r, y, y + h)) continue;
        box(r, y, y + h, { color: hex(0x3a3d44) });
        box({ x0: x - 0.25, x1: x + 0.75, z0: z - 0.25, z1: z + 0.75 }, y + h, y + h + 0.75, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 6, extra: 1, seed: rng.byte(), solid: false });
      }
    }
    if (t.H > 400) {
      const cx = snap((top.x0 + top.x1) / 2), cz = snap((top.z0 + top.z1) / 2);
      const h = snap(rng.range(40, 90));
      const r = { x0: cx - 1, x1: cx + 1, z0: cz - 1, z1: cz + 1 };
      if (free(r, y, y + h)) {
        box(r, y, y + h, { color: hex(0x33363f) });
        box({ x0: cx - 0.25, x1: cx + 0.25, z0: cz - 1.2, z1: cz - 1 }, y + 2, y + h, { color: t.accent, style: STYLE.EMISSIVE, emis: 4, solid: false });
        box({ x0: cx - 0.75, x1: cx + 0.75, z0: cz - 0.75, z1: cz + 0.75 }, y + h, y + h + 1.5, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 7, extra: 1, solid: false });
      }
    }
    if (t.crown) {
      for (const s of SIDES) {
        const F = faceCoord(top, s);
        const [a0, a1] = alongRange(top, s);
        for (let a = a0 + 1.5; a < a1 - 1.5; a += 3)
          box(sideRect(s, F, a, a + 0.5, 0, 0.25), y - 12, y - 1.5, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
      }
    }
    world.light((top.x0 + top.x1) / 2, y + 4, (top.z0 + top.z1) / 2, y >= LUX_Y ? hex(0xffd6a0) : t.accent, 1.2, 18);
  }

  // ---- Balcons-cages des immeubles denses ------------------------------------------
  for (const t of towers) balconies(ctx, t);

  // ---- Façades : climatiseurs, tuyaux, enseignes, écrans, devantures ---------
  for (const t of towers) {
    t.segs.forEach((seg, k) => {
      for (const s of SIDES) {
        const F = faceCoord(seg, s);
        const [a0, a1] = alongRange(seg, s);
        const fw = a1 - a0, fh = seg.y1 - seg.y0;
        const street = t.streetSides.includes(s);
        const alley = t.alleySides.includes(s);
        const area = fw * fh;
        const nAC = t.style === 3 ? Math.min(70, area / 30) : t.style === 4 || t.style === STYLE.CURTAIN || t.style === STYLE.CAPSULE ? 0 : Math.min(10, area / 300);
        const acMin = k === 0 ? (alley ? 3 : 8) : 2;
        for (let i = 0; i < nAC; i++) {
          const a = snap(rng.range(a0 + 1, a1 - 2));
          const yy = snap(rng.range(seg.y0 + acMin, seg.y1 - 2));
          const r = sideRect(s, F, a, a + 1, 0, 0.5);
          if (!free(r, yy - 0.1, yy + 0.6)) continue;
          box(r, yy, yy + 0.5, { color: hex(0x5a5f66), solid: false, noRain: true });
        }
        if ((t.style === 3 || t.style === STYLE.INDUSTRIAL) && rng.chance(0.6)) {
          const a = snap(rng.range(a0 + 1, a1 - 1.5));
          const r = sideRect(s, F, a, a + 0.5, 0, 0.5);
          if (free(r, seg.y0 + 1, seg.y1 - 1)) box(r, seg.y0 + (k === 0 ? 3 : 1), seg.y1 - 1, { color: hex(0x3d3a36), solid: false, noRain: true });
        }
        // Écrans géants
        if (street && k <= 1 && fw >= 16 && s !== t.eSide && rng.chance(0.4)) {
          const portrait = rng.chance(0.35);
          const w = portrait ? snap(rng.range(7, 10), 1) : snap(rng.range(10, Math.min(26, fw - 4)), 1);
          const h = portrait ? snap(rng.range(20, 34), 1) : snap(w * rng.range(0.5, 0.65), 1);
          const ymin = Math.max(seg.y0 + 12, 22);
          const ymax = Math.min(seg.y1 - h - 4, 160);
          if (ymax > ymin) {
            const yy = snap(rng.range(ymin, ymax), 1);
            const a = snap(rng.range(a0 + 2, a1 - 2 - w), 1);
            if (free(sideRect(s, F, a - 0.5, a + w + 0.5, 0, 1.5), yy - 0.5, yy + h + 0.5)) {
              box(sideRect(s, F, a - 0.5, a + w + 0.5, 0, 0.35), yy - 0.5, yy + h + 0.5, { color: hex(0x15151b) });
              box(sideRect(s, F, a, a + w, 0, 0.5), yy, yy + h, { color: hex(0x111111), style: STYLE.SCREEN, emis: 2.4, seed: rng.byte() });
              const [cx, cz] = sidePoint(s, F, a + w / 2, 8);
              world.light(cx, yy + h / 2, cz, rng.pick(NEON), 2.2, 45);
            }
          }
        }
        if (k !== 0 || (!street && !alley)) continue;

        // Rez-de-chaussée : devantures (plus rares et plus sales dans les ruelles)
        if (!(t.room && t.room.side === s)) {
          let p = a0 + snap(rng.range(0.5, 2));
          while (p < a1 - 4) {
            const w = Math.min(snap(rng.range(4, 9)), a1 - 1 - p);
            if (w < 3) break;
            if ((street || rng.chance(0.4)) && free(sideRect(s, F, p, p + w, 0, 1.6), 0.55, 4.6)) {
              const col = rng.pick(SHOP_COLS);
              const shutter = (alley && rng.chance(0.4)) || (t.style === STYLE.INDUSTRIAL && rng.chance(0.75));
              if (shutter) {
                // rideau de fer baissé
                box(sideRect(s, F, p, p + w, 0, 0.15), 0.5, 3.6, { color: hex(0x4a4a50), seed: rng.byte() });
              } else {
                box(sideRect(s, F, p, p + w, 0, 0.2), 0.5, 4.0, { color: col, style: STYLE.SHOP, emis: 1.7, seed: rng.byte(), solid: false });
                const aw = rng.pick(NEON);
                box(sideRect(s, F, p, p + w, 0, 1.5), 4.0, 4.5, { color: dark(aw, 0.35) });
                box(sideRect(s, F, p, p + w, 1.4, 1.55), 3.85, 4.0, { color: aw, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true, extra: rng.chance(0.15) ? 3 : 0, seed: rng.byte() });
                const [cx, cz] = sidePoint(s, F, p + w / 2, 1.6);
                world.light(cx, 3.2, cz, col, 1.3, 9);
                if (rng.chance(0.55)) {
                  const sw = Math.min(w, snap(rng.range(4, 8)));
                  box(sideRect(s, F, p + (w - sw) / 2, p + (w + sw) / 2, 0, 0.5), 4.75, 6.25, {
                    color: rng.pick(NEON), style: STYLE.SIGN, emis: 3, seed: rng.byte(), extra: rng.int(0, 2),
                  });
                }
                if (street && rng.chance(0.3)) {
                  const [ix, iz] = sidePoint(s, F, p + rng.range(1, w - 1), 1.0);
                  if (rng.chance(0.3)) ctx.pose(ix, 0.5, iz, Math.atan2(SV[s][0], SV[s][1]), 5);
                  else ctx.idle(ix, 0.5, iz, Math.atan2(-SV[s][0], -SV[s][1]), rng.chance(0.5));
                }
              }
            }
            p += w + snap(rng.range(1, 2.5));
          }
        }
        // Enseignes en drapeau
        const nBlade = Math.floor(fw / (street ? 8 : 14));
        for (let i = 0; i < nBlade; i++) {
          if (alley && !rng.chance(0.6)) continue;
          const a = snap(rng.range(a0 + 1, a1 - 1.5));
          const h = snap(rng.range(5, 14));
          const y0 = snap(rng.range(6.5, 11));
          if (y0 + h > seg.y1 - 1) continue;
          const width = alley ? 2 : 3;
          if (!free(sideRect(s, F, a - 0.75, a + 1.25, 0.3, width + 0.8), y0 - 0.5, y0 + h + 0.5)) continue;
          const col = rng.pick(NEON);
          box(sideRect(s, F, a, a + 0.5, 0.5, 0.5 + width), y0, y0 + h, { color: col, style: STYLE.SIGN, emis: 3.2, seed: rng.byte(), extra: rng.pick([0, 0, 1, 2, 0]) });
          box(sideRect(s, F, a, a + 0.5, 0, 0.5), y0 + 1, y0 + 1.5, { color: hex(0x222222) });
          box(sideRect(s, F, a, a + 0.5, 0, 0.5), y0 + h - 1.5, y0 + h - 1, { color: hex(0x222222) });
          const [cx, cz] = sidePoint(s, F, a + 0.25, 0.5 + width / 2);
          world.light(cx, y0 + h / 2, cz, col, 2.4, 16);
        }
      }
    });
  }

  // ---- Rue : mobilier, crasse, vapeur, campements -------------------------------
  streetProps(ctx, blocks, towers, metro);
  streetExtras(ctx, blocks, towers, metro);

  // ---- Places et marchés de nuit ------------------------------------------------
  for (const { rect: P } of plazas) {
    const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    let stalls = 0;
    const totem = { x0: cx - 1.5, x1: cx + 1.5, z0: cz - 1.5, z1: cz + 1.5 };
    if (free(totem, 0.5, 14)) {
      box(totem, 0.5, 14, { color: hex(0x111111), style: STYLE.SCREEN, emis: 2.4, seed: rng.byte() });
      world.light(cx, 8, cz, rng.pick(NEON), 2.5, 22);
    }
    for (let x = P.x0 + 3; x < P.x1 - 5; x += 7)
      for (let z = P.z0 + 3; z < P.z1 - 4; z += 7) {
        if (Math.abs(x + 2 - cx) < 5 && Math.abs(z + 1.5 - cz) < 5) continue;
        if (!rng.chance(0.65)) continue;
        if (!free({ x0: x - 0.3, x1: x + 3.8, z0: z - 1.8, z1: z + 1.6 }, 0.55, 3.3)) continue;
        const col = rng.pick(NEON);
        box({ x0: x, x1: x + 3.5, z0: z, z1: z + 1 }, 0.5, 1.6, { color: hex(0x4a2e1c) });
        box({ x0: x, x1: x + 3.5, z0: z + 0.9, z1: z + 1 }, 0.9, 1.5, { color: rng.pick(SHOP_COLS), style: STYLE.SHOP, emis: 1.5, solid: false, seed: rng.byte() });
        box({ x0: x, x1: x + 0.25, z0: z - 1.5, z1: z - 1.25 }, 0.5, 3, { color: hex(0x222222) });
        box({ x0: x + 3.25, x1: x + 3.5, z0: z - 1.5, z1: z - 1.25 }, 0.5, 3, { color: hex(0x222222) });
        box({ x0: x - 0.25, x1: x + 3.75, z0: z - 1.75, z1: z + 1.5 }, 3, 3.25, { color: dark(col, 0.45) });
        for (let lx = x; lx < x + 3.5; lx += 0.75)
          box({ x0: lx, x1: lx + 0.5, z0: z + 1.2, z1: z + 1.5 }, 2.35, 2.85, { color: rng.chance(0.7) ? hex(0xff3a20) : hex(0xffb000), style: STYLE.EMISSIVE, emis: 3, solid: false, extra: 2, seed: rng.byte() });
        world.light(x + 1.75, 2.5, z + 2.5, hex(0xff8a40), 1.6, 9);
        if (rng.chance(0.5)) world.emitSteam(x + 1.75, 1.7, z + 0.4, 0.7, 3, 8, hex(0x6a5a50));
        ctx.pose(x + 1.75, 0.5, z - 0.8, 0, 4);
        if (rng.chance(0.3)) ctx.pose(x + rng.range(0.4, 3.1), 0.5, z - 0.8, rng.range(-0.6, 0.6), rng.chance(0.5) ? 4 : 5);
        for (let c = 0; c < rng.int(0, 3); c++) ctx.idle(x + rng.range(0.3, 3.2), 0.5, z + 2.1 + rng.range(0, 0.6), Math.PI, rng.chance(0.4));
        stalls++;
      }
    if (stalls >= 2) {
      // allées entre les rangées d'étals (vérifiées contre le décor)
      const lineOk = (r: Rect) => free(r, 0.6, 2.2);
      for (let z = P.z0 + 3 + 4; z < P.z1 - 2; z += 7) {
        const r = { x0: P.x0 + 1.5, x1: P.x1 - 1.5, z0: z - 0.6, z1: z + 0.6 };
        if (lineOk(r)) ctx.peds.lines.push({ x0: r.x0, z0: z, x1: r.x1, z1: z, y: 0.5, count: rng.int(2, 4), pause: 7 });
      }
      for (let x = P.x0 + 3 - 1.75; x < P.x1 - 2; x += 7) {
        if (x < P.x0 + 1) continue;
        const r = { x0: x - 0.5, x1: x + 0.5, z0: P.z0 + 1.5, z1: P.z1 - 1.5 };
        if (lineOk(r)) ctx.peds.lines.push({ x0: x, z0: r.z0, x1: x, z1: r.z1, y: 0.5, count: rng.int(1, 3), pause: 7 });
      }
    }
  }

  // ---- Hologrammes, interventions de police, destinations ---------------------------
  placeHolograms(ctx, towers, plazas);
  placeIncidents(ctx, metro);
  placeDestinations(ctx, towers, plazas, metro, basements);
  const views = towers.filter((t) => t.eSide >= 0).sort((a, b) => b.H - a.H).slice(0, 6);
  for (const t of views) {
    const top = t.segs[t.segs.length - 1];
    const [vx, vz] = sidePoint(t.eSide as Side, faceCoord(top, t.eSide as Side), t.along!, -2);
    ctx.dest('Points de vue', `${t.name} · ${Math.round(t.H - 0.5)} m`, vx, t.H + 0.02, vz, Math.atan2(SV[t.eSide][0], SV[t.eSide][1]));
  }

  // ---- Câbles suspendus (+ linge qui sèche dans les ruelles) ---------------------------
  const metroRoad = (axis: 0 | 1, mid: number) => metro.some((l) => (axis === 0 ? l.axis === 1 : l.axis === 0) && Math.abs(l.c - mid) < 12);
  for (const { A, B, axis, gap } of pairs) {
    const sA: Side = axis === 0 ? 1 : 2;
    const sB: Side = axis === 0 ? 3 : 0;
    const a = A.segs[0], b = B.segs[0];
    const [la0, la1] = alongRange(a, sA);
    const [lb0, lb1] = alongRange(b, sB);
    const lo = Math.max(la0, lb0) + 1, hi = Math.min(la1, lb1) - 1;
    if (hi <= lo) continue;
    const fa = faceCoord(a, sA), fb = faceCoord(b, sB);
    if (gap > 15 && metroRoad(axis, (fa + fb) / 2)) continue;
    const n = gap < 15 ? rng.int(3, 8) : rng.int(1, 4);
    for (let i = 0; i < n; i++) {
      const c0 = rng.range(lo, hi), c1 = Math.min(hi, Math.max(lo, c0 + rng.range(-6, 6)));
      const ymax = Math.min(a.y1, b.y1) - 2;
      const y0 = rng.range(gap < 15 ? 5 : 9, Math.min(ymax, 32));
      const y1 = y0 + rng.range(-2, 2);
      const sag = rng.range(0.5, 2.5) * (fb - fa) / 20;
      const laundry = gap < 15 && y0 < 22 && rng.chance(0.35);
      const N = 10;
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k <= N; k++) {
        const u = k / N;
        const p = fa + (fb - fa) * u;
        const c = c0 + (c1 - c0) * u;
        const yy = y0 + (y1 - y0) * u - sag * 4 * u * (1 - u);
        const x = axis === 0 ? p : c, z = axis === 0 ? c : p;
        if (k > 0) wires.push(px, py, pz, x, yy, z);
        if (laundry && k > 0 && k < N && rng.chance(0.7)) {
          const cw = rng.pick([0.4, 0.5, 0.7]), ch = rng.pick([0.5, 0.7, 0.9]);
          const col: RGB = rng.pick([hex(0xc8c0b0), hex(0x8a3a3a), hex(0x3a5a8a), hex(0xd8c070), hex(0x5a7a5a), hex(0xb07aa0)]);
          const r = axis === 0 ? { x0: x - 0.03, x1: x + 0.03, z0: z - cw / 2, z1: z + cw / 2 } : { x0: x - cw / 2, x1: x + cw / 2, z0: z - 0.03, z1: z + 0.03 };
          box(r, yy - ch, yy - 0.02, { color: col, solid: false, noRain: true });
        }
        px = x; py = yy; pz = z;
      }
    }
  }

  // ---- Trafic aérien : couloirs ------------------------------------------------------
  const lanes: Lane[] = [];
  const ALT: number[][] = [[42.5, 90.5, 138.5, 234.5], [66.5, 114.5, 186.5, 282.5]];
  for (let axis = 0 as 0 | 1; axis < 2; axis = (axis + 1) as 0 | 1) {
    for (let i = 0; i <= BLOCKS; i++) {
      const coord = -HALF + i * PITCH;
      const alts = [...ALT[axis]].sort(() => rng.next() - 0.5).slice(0, rng.int(2, 3));
      for (const y of alts) {
        for (const dir of [1, -1] as const) {
          lanes.push({ axis, coord: coord + dir * 3.5 * (axis === 0 ? 1 : -1), y: y + rng.range(-1, 1), dir, speed: rng.range(18, 38), count: rng.int(3, 6) });
        }
      }
    }
  }

  // ---- Passants : boucles de trottoir, ruelles ---------------------------------------
  for (const B of blocks) {
    const d = rng.range(1.6, 2.3);
    const cd = Math.max(Math.abs((B.x0 + B.x1) / 2), Math.abs((B.z0 + B.z1) / 2)) / HALF;
    ctx.peds.loops.push({
      pts: [[B.x0 + d, B.z0 + d], [B.x1 - d, B.z0 + d], [B.x1 - d, B.z1 - d], [B.x0 + d, B.z1 - d]],
      y: 0.5,
      count: Math.round(8 + 20 * Math.pow(1 - cd, 1.3) + rng.range(0, 4)),
      pause: 40,
    });
  }
  for (const A of alleys) {
    if (!rng.chance(0.35)) continue;
    const alongX = A.x1 - A.x0 > A.z1 - A.z0;
    const mid = alongX ? (A.z0 + A.z1) / 2 : (A.x0 + A.x1) / 2;
    const off = rng.range(-1.5, 1.5);
    ctx.peds.lines.push(alongX
      ? { x0: A.x0 + 2, z0: mid + off, x1: A.x1 - 2, z1: mid + off, y: 0.5, count: 1 }
      : { x0: mid + off, z0: A.z0 + 2, x1: mid + off, z1: A.z1 - 2, y: 0.5, count: 1 });
  }

  // ---- Skyline lointaine (décor) -----------------------------------------------------
  const GR = HALF + PITCH;
  const ground = { color: hex(0x0e0d14), far: true };
  world.box(-2400, -1, -2400, -GR, -0.02, 2400, ground);
  world.box(GR, -1, -2400, 2400, -0.02, 2400, ground);
  world.box(-GR, -1, -2400, GR, -0.02, -GR, ground);
  world.box(-GR, -1, GR, GR, -0.02, 2400, ground);
  const EXT = 8;
  for (let bi = -EXT; bi < BLOCKS + EXT; bi++)
    for (let bj = -EXT; bj < BLOCKS + EXT; bj++) {
      if (bi >= 0 && bi < BLOCKS && bj >= 0 && bj < BLOCKS) continue;
      const bx0 = -HALF + bi * PITCH + ROAD / 2;
      const bz0 = -HALF + bj * PITCH + ROAD / 2;
      const cx = bx0 + BLOCK / 2, cz = bz0 + BLOCK / 2;
      const dist = Math.hypot(cx, cz);
      if (dist > 1700) continue;
      world.box(bx0, 0, bz0, bx0 + BLOCK, 0.5, bz0 + BLOCK, { color: hex(0x2c2b34), style: STYLE.GROUND, far: true });
      const fall = Math.max(0.15, 1 - (dist - HALF) / 1400);
      for (const [ox, oz] of [[4, 4], [41, 4], [4, 41], [41, 41]]) {
        if (!rng.chance(0.8)) continue;
        const w = snap(rng.range(18, 33)), d = snap(rng.range(18, 33));
        const h = 0.5 + LEVEL * Math.round((rng.range(40, 340) * fall) / LEVEL);
        const x0 = bx0 + ox, z0 = bz0 + oz;
        world.box(x0, 0.5, z0, x0 + w, h, z0 + d, { color: rng.pick(CONCRETE), style: rng.pick([1, 2, 3, 4, 1, 2, 13, 14, 16]), seed: rng.byte(), extra: rng.byte(), far: true });
        if (rng.chance(0.4))
          world.box(x0 - 0.25, h - 1, z0 - 0.25, x0 + w + 0.25, h - 0.5, z0 + d + 0.25, { color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 3, far: true });
      }
    }

  // ---- Point de départ ---------------------------------------------------------------
  let spawn = { x: -HALF + PITCH * 5, y: 0.5, z: -HALF + PITCH * 5 + ROAD / 2 + 2, yaw: 0, pitch: 0.15 };
  let best = Infinity;
  for (const e of elevators) {
    const sv = SV[e.side];
    const c = sideRect(e.side, e.F, e.along, e.along, 9.5, 9.5);
    const dd = Math.hypot(c.x0, c.z0);
    if (dd < best) {
      best = dd;
      const alongDir: [number, number] = e.side === 0 || e.side === 2 ? [1, 0] : [0, 1];
      const fx = alongDir[0] - sv[0] * 0.9, fz = alongDir[1] - sv[1] * 0.9;
      spawn = { x: c.x0 + alongDir[0] * 5, y: 0.5, z: c.z0 + alongDir[1] * 5, yaw: Math.atan2(-fx, -fz), pitch: 0.28 };
    }
  }

  // destinations : on garde une sélection lisible par catégorie (les plus hautes d'abord pour toits et étages)
  const limit: Record<string, number> = { 'Toits': 24, 'Étages': 36, 'Bars': 30, 'Marchés': 14 };
  const byCat = new Map<string, Dest[]>();
  for (const d of ctx.dests) (byCat.get(d.cat) ?? byCat.set(d.cat, []).get(d.cat)!).push(d);
  const dests: Dest[] = [];
  for (const [cat, list] of byCat) {
    const n = limit[cat] ?? list.length;
    const sorted = cat === 'Toits' || cat === 'Étages' ? [...list].sort((p, q) => q.y - p.y) : list;
    dests.push(...sorted.slice(0, n));
  }
  return { towers, elevators, bridges, lanes, wires, plazas, metro, basements, escapes: ctx.escapes, dests, peds: ctx.peds, spawn };
}
