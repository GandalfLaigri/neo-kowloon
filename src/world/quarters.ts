import { BLOCKS, HALF, PITCH, ROAD, SIDEWALK, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import type { Plaza } from './basements';
import type { Tower } from './city';
import { dark, type Ctx } from './ctx';
import type { District } from './districts';
import { OPP, SIDES, SV, alongRange, faceCoord, inset, sidePoint, sideRect, type Rect, type Side } from './geom';
import type { MetroLine } from './metro';
import { trashPile, tree } from './props';

const RED = hex(0xc0301c), GOLD = hex(0xd8a030), JADE = hex(0x1e3a30);
const CONTAINER: RGB[] = [hex(0x8a3a24), hex(0x2a5a7a), hex(0x3a6a3a), hex(0x8a7a2a), hex(0x6a2a4a), hex(0x3a3a3e), hex(0xb05a1a), hex(0x2a3a6a)];
const TARP: RGB[] = [hex(0x2a4a8a), hex(0x3a6a4a), hex(0x8a8a86), hex(0x6a3a2a), hex(0x1a5a6a)];

// ---------------------------------------------------------------------------
// Places : jardin (quartier riche), dépôt de conteneurs (docks), campement (bas-fonds).
// Les autres quartiers gardent leur marché de nuit (avec quelques ajouts).
// ---------------------------------------------------------------------------
export function plazaVariant(ctx: Ctx, plaza: Plaza, D: District): boolean {
  const P = plaza.rect;
  if (D.id === 'riche') { garden(ctx, P); return true; }
  if (D.id === 'port') { containerYard(ctx, P); return true; }
  if (D.id === 'fonds') { squatCamp(ctx, P); return true; }
  if (D.id === 'asia') lanternCanopy(ctx, P);
  return false;
}

function garden(ctx: Ctx, P: Rect) {
  const { rng, world } = ctx;
  const cx = snap((P.x0 + P.x1) / 2), cz = snap((P.z0 + P.z1) / 2);
  const G = 0.5;
  // pelouses entre des allées claires
  const lawn = { color: hex(0x2e5a2a), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false };
  const path = hex(0xb8b4aa);
  for (const r of [{ ...P, x1: cx - 1.5, z1: cz - 1.5 }, { ...P, x0: cx + 1.5, z1: cz - 1.5 }, { ...P, x1: cx - 1.5, z0: cz + 1.5 }, { ...P, x0: cx + 1.5, z0: cz + 1.5 }])
    ctx.box(inset(r, 1), G, G + 0.08, lawn);
  ctx.box({ ...P, x0: cx - 1.5, x1: cx + 1.5 }, G, G + 0.04, { color: path, style: STYLE.GROUND, seed: rng.byte(), solid: false });
  ctx.box({ ...P, z0: cz - 1.5, z1: cz + 1.5 }, G, G + 0.04, { color: path, style: STYLE.GROUND, seed: rng.byte(), solid: false });
  // fontaine lumineuse
  const F = { x0: cx - 4, x1: cx + 4, z0: cz - 4, z1: cz + 4 };
  const stone = hex(0xd8d4cc);
  for (const r of [{ ...F, z1: F.z0 + 0.5 }, { ...F, z0: F.z1 - 0.5 }, { ...F, x1: F.x0 + 0.5, z0: F.z0 + 0.5, z1: F.z1 - 0.5 }, { ...F, x0: F.x1 - 0.5, z0: F.z0 + 0.5, z1: F.z1 - 0.5 }])
    ctx.box(r, G, G + 0.7, { color: stone, extra: 9 });
  ctx.box(inset(F, 0.5), G + 0.5, G + 0.55, { color: hex(0x0aa0e0), style: STYLE.WATER, emis: 0.9, solid: false, noRain: true, seed: rng.byte() });
  ctx.box(inset(F, 3.2), G, G + 2.2, { color: stone, extra: 9 });
  ctx.box(inset(F, 3.5), G + 2.2, G + 2.4, { color: hex(0x9ae8ff), style: STYLE.EMISSIVE, emis: 2.5, extra: 2, seed: rng.byte(), solid: false });
  world.emitSteam(cx, G + 2.5, cz, 0.6, 2.5, 14, hex(0x8ab0c8));
  world.light(cx, G + 3, cz, hex(0x9ae8ff), 1.8, 16);
  // arbres, bancs, bornes lumineuses
  for (const [x, z] of [[P.x0 + 4, P.z0 + 4], [P.x1 - 4, P.z0 + 4], [P.x0 + 4, P.z1 - 4], [P.x1 - 4, P.z1 - 4], [cx - 10, cz + 8], [cx + 10, cz - 8]]) {
    if (x < P.x0 + 2 || x > P.x1 - 2 || z < P.z0 + 2 || z > P.z1 - 2) continue;
    if (!ctx.free({ x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6 }, G + 0.2, G + 4)) continue;
    tree(ctx, x, z, G, rng.range(0.9, 1.25), rng.chance(0.4));
  }
  for (const [x, z, yaw] of [[cx - 7, cz - 2.6, 0], [cx + 5, cz + 2.1, Math.PI]] as const) {
    const r = { x0: x, x1: x + 2.2, z0: z, z1: z + 0.5 };
    if (!ctx.free(r, G + 0.1, G + 1)) continue;
    ctx.box(r, G, G + 0.45, { color: hex(0x5a3a22), extra: 9 });
    ctx.seat(rng.chance(0.6), x + 1.1, G + 0.45, z + 0.25, yaw, rng.chance(0.4) ? 7 : 1);
  }
  for (let x = P.x0 + 2; x < P.x1 - 1; x += 5)
    for (const z of [P.z0 + 1.2, P.z1 - 1.5]) {
      const r = { x0: x, x1: x + 0.3, z0: z, z1: z + 0.3 };
      if (!ctx.free(r, G + 0.1, G + 1)) continue;
      ctx.box(r, G, G + 0.8, { color: hex(0x2a2c30), extra: 9 });
      ctx.box(r, G + 0.8, G + 0.95, { color: hex(0xfff0dc), style: STYLE.EMISSIVE, emis: 2.4, solid: false });
    }
  // sculpture chromée, vigile
  const sx = cx + (rng.chance(0.5) ? -12 : 12), sz = cz + (rng.chance(0.5) ? -10 : 10);
  if (ctx.free({ x0: sx - 1.5, x1: sx + 1.5, z0: sz - 1.5, z1: sz + 1.5 }, G + 0.1, G + 6)) {
    ctx.box({ x0: sx - 1, x1: sx + 1, z0: sz - 1, z1: sz + 1 }, G, G + 0.8, { color: hex(0x2a2a2e), extra: 9 });
    let y = G + 0.8;
    for (let k = 0; k < 4; k++) {
      const w = 0.4 + rng.range(0.2, 0.9), h = rng.range(0.8, 1.6), ox = rng.range(-0.4, 0.4);
      ctx.box({ x0: sx + ox - w / 2, x1: sx + ox + w / 2, z0: sz - w / 2, z1: sz + w / 2 }, y, y + h, { color: hex(0xc8ccd4), extra: 9 });
      y += h;
    }
    world.cone(sx, y + 4, sz, 0, -1, 0, y + 3, 2.4, hex(0xfff0dc), 0.05);
  }
  ctx.pose(P.x0 + 1.2, G, cz + 2.5, Math.PI / 2, 0);
}

function containerYard(ctx: Ctx, P: Rect) {
  const { rng, world } = ctx;
  const G = 0.5;
  const alongX = P.x1 - P.x0 >= P.z1 - P.z0;
  // rangées de conteneurs (6 ou 12 m), empilés sur 1 à 4 niveaux, allées de 4 m
  const L0 = alongX ? P.x0 + 2 : P.z0 + 2, L1 = alongX ? P.x1 - 2 : P.z1 - 2;
  const T0 = alongX ? P.z0 + 2 : P.x0 + 2, T1 = alongX ? P.z1 - 2 : P.x1 - 2;
  const R = (l0: number, l1: number, t0: number, t1: number): Rect => (alongX ? { x0: l0, x1: l1, z0: t0, z1: t1 } : { x0: t0, x1: t1, z0: l0, z1: l1 });
  for (let t = T0; t < T1 - 2.5; t += 2.5 * 2 + 4) {
    for (const row of [0, 2.5]) {
      let l = L0;
      while (l < L1 - 6) {
        const len = rng.chance(0.6) ? 12 : 6;
        if (l + len > L1) break;
        const r = R(l, l + len - 0.3, t + row, t + row + 2.45);
        const n = rng.chance(0.15) ? 0 : rng.int(1, 4);
        for (let k = 0; k < n; k++) {
          if (!ctx.free(r, G + k * 2.6 + 0.05, G + (k + 1) * 2.6)) break;
          ctx.box(r, G + k * 2.6, G + (k + 1) * 2.6 - 0.05, { color: rng.pick(CONTAINER), style: STYLE.INDUSTRIAL, seed: rng.byte() });
        }
        l += len + (rng.chance(0.2) ? 3 : 0);
      }
    }
  }
  // mât d'éclairage au sodium
  const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
  const mast = { x0: P.x0 + 0.6, x1: P.x0 + 1.2, z0: P.z0 + 0.6, z1: P.z0 + 1.2 };
  if (ctx.free(mast, G, 22)) {
    ctx.box(mast, G, 22, { color: hex(0x3a3c40) });
    ctx.box({ x0: mast.x0 - 1, x1: mast.x1 + 1, z0: mast.z0 - 1, z1: mast.z1 + 1 }, 22, 22.6, { color: hex(0xffa040), style: STYLE.EMISSIVE, emis: 3.5, solid: false });
    world.light(mast.x0 + 3, 19, mast.z0 + 3, hex(0xff9a3a), 2.4, 40);
    world.cone(mast.x0 + 0.3, 22, mast.z0 + 0.3, (cx - mast.x0) * 0.02, -1, (cz - mast.z0) * 0.02, 22, 11, hex(0xff9a3a), 0.045);
  }
  // guérite et dockers
  const gh = { x0: P.x1 - 4, x1: P.x1 - 1, z0: P.z1 - 3.5, z1: P.z1 - 1 };
  if (ctx.free(gh, G + 0.1, 3.5)) {
    ctx.box(gh, G, 3.2, { color: hex(0x4a5a6a), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    ctx.box({ ...gh, x0: gh.x0 - 0.05, x1: gh.x0 }, 1.6, 2.6, { color: hex(0xfff0c8), style: STYLE.EMISSIVE, emis: 1.2, solid: false });
    world.light(gh.x0 - 1, 2.8, (gh.z0 + gh.z1) / 2, hex(0xfff0c8), 1, 8);
    ctx.pose(gh.x0 - 1.2, G, (gh.z0 + gh.z1) / 2, -Math.PI / 2, 5);
  }
  for (let i = 0; i < rng.int(1, 3); i++) {
    const x = rng.range(P.x0 + 2, P.x1 - 2), z = rng.range(P.z0 + 2, P.z1 - 2);
    if (ctx.free({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, G + 0.1, G + 1.8)) ctx.pose(x, G, z, rng.range(-3, 3), rng.chance(0.5) ? 4 : 3);
  }
}

function squatCamp(ctx: Ctx, P: Rect) {
  const { rng, world } = ctx;
  const G = 0.5;
  // cabanes de tôle et de bâches, fûts enflammés, détritus
  for (let i = 0; i < Math.round(((P.x1 - P.x0) * (P.z1 - P.z0)) / 70); i++) {
    const w = snap(rng.range(2, 3.5)), d = snap(rng.range(2, 3));
    const x = snap(rng.range(P.x0 + 1, P.x1 - 1 - w)), z = snap(rng.range(P.z0 + 1, P.z1 - 1 - d));
    const r = { x0: x, x1: x + w, z0: z, z1: z + d };
    if (!ctx.free(inset(r, -0.8), G + 0.1, G + 3)) continue;
    const h = rng.pick([1.8, 2.2, 2.5]);
    ctx.box(r, G, G + h, { color: rng.pick([hex(0x5a4a3a), hex(0x4a5a5a), hex(0x6a4a2a), hex(0x3a4a5a)]), style: STYLE.INDUSTRIAL, seed: rng.byte() });
    ctx.box(inset(r, -0.3), G + h, G + h + 0.1, { color: rng.pick(TARP), solid: false });
    if (rng.chance(0.6)) {
      const [lx, lz] = [x - 0.03, z + d / 2];
      ctx.box({ x0: lx, x1: lx + 0.05, z0: lz - 0.3, z1: lz + 0.3 }, G + 1.0, G + 1.5, { color: hex(0xffb060), style: STYLE.EMISSIVE, emis: 1.6, extra: rng.chance(0.4) ? 3 : 0, seed: rng.byte(), solid: false });
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = snap(rng.range(P.x0 + 3, P.x1 - 3)), z = snap(rng.range(P.z0 + 3, P.z1 - 3));
    if (!ctx.free({ x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6 }, G + 0.1, G + 2)) continue;
    fireBarrel(ctx, x, z, G);
  }
  for (let i = 0; i < 5; i++) {
    const x = snap(rng.range(P.x0 + 1, P.x1 - 2)), z = snap(rng.range(P.z0 + 1, P.z1 - 2));
    if (ctx.free({ x0: x - 1, x1: x + 2, z0: z - 1, z1: z + 1 }, G + 0.1, G + 1)) trashPile(ctx, 0, z, x, 0, G);
  }
  void world;
}

/** Fût enflammé entouré de sans-abri qui se réchauffent les mains. */
export function fireBarrel(ctx: Ctx, x: number, z: number, y: number) {
  const { rng, world } = ctx;
  ctx.box({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }, y, y + 1, { color: hex(0x3a2a22) });
  ctx.box({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, y + 1, y + 1.25, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
  world.light(x, y + 1.9, z, hex(0xff7a30), 2.2, 12, rng.byte() + 1);
  world.emitSteam(x, y + 1.3, z, 0.8, 6, 12, hex(0x3a2a24));
  if (rng.chance(0.35)) ctx.animal('dog', x + 0.4, y, z - 1.5, rng.range(-3, 3), true);
  ctx.pose(x + 1.1, y, z, -Math.PI / 2, 10);
  if (rng.chance(0.7)) ctx.pose(x - 1.1, y, z, Math.PI / 2, 10);
  if (rng.chance(0.4)) ctx.pose(x, y, z + 1.1, Math.PI, 3);
}

function lanternCanopy(ctx: Ctx, P: Rect) {
  const { rng } = ctx;
  // guirlandes de lanternes rouges au-dessus du marché
  for (let z = P.z0 + 5; z < P.z1 - 3; z += 7) {
    for (let x = P.x0 + 1; x < P.x1 - 1; x += 1.6) {
      const u = (x - P.x0) / (P.x1 - P.x0);
      const y = 5.6 - Math.sin(u * Math.PI) * 0.8;
      ctx.box({ x0: x, x1: x + 0.35, z0: z, z1: z + 0.35 }, y - 0.45, y, { color: rng.chance(0.85) ? hex(0xff3020) : hex(0xffb000), style: STYLE.EMISSIVE, emis: 2.2, extra: 2, seed: rng.byte(), solid: false, noRain: true });
    }
  }
  ctx.world.light((P.x0 + P.x1) / 2, 5, (P.z0 + P.z1) / 2, hex(0xff4020), 1.6, 26);
}

// ---------------------------------------------------------------------------
// Décor propre à chaque quartier (rues, façades)
// ---------------------------------------------------------------------------
export function districtDecor(ctx: Ctx, blocks: Rect[], towers: Tower[], metro: MetroLine[], wires: number[]) {
  const onMetro = (s: Side, B: Rect) => {
    const axis = s === 0 || s === 2 ? 0 : 1;
    const c = faceCoord(B, s) + (s === 0 || s === 3 ? -ROAD / 2 : ROAD / 2);
    return metro.some((l) => l.axis === axis && Math.abs(l.c - c) < 1);
  };
  const idAt = (x: number, z: number) => ctx.districts.idAt(x, z);
  /** Quartier de l'îlot en face, de l'autre côté de la rue longeant la face s. */
  const across = (B: Rect, s: Side) => {
    const cx = (B.x0 + B.x1) / 2 + SV[s][0] * PITCH, cz = (B.z0 + B.z1) / 2 + SV[s][1] * PITCH;
    if (Math.abs(cx) > HALF || Math.abs(cz) > HALF) return null;
    return idAt(cx, cz);
  };
  for (const B of blocks) {
    const id = idAt((B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2);
    for (const s of SIDES) {
      const F = faceCoord(B, s);
      const [a0, a1] = alongRange(B, s);
      const other = across(B, s);
      // on ne décore une rue qu'une fois (faces 1 et 2), si les deux rives sont du même quartier
      const shared = other === id && (s === 1 || s === 2) && !onMetro(s, B);
      if (id === 'asia') {
        if (shared) for (let a = a0 + 14; a < a1 - 10; a += rng(ctx, 16, 26)) lanternString(ctx, s, F, a, wires);
        if (ctx.rng.chance(0.4)) foodCart(ctx, s, F, snap(ctx.rng.range(a0 + 8, a1 - 10)));
      } else if (id === 'riche') {
        curbTrees(ctx, s, F, a0, a1);
      } else if (id === 'plaisirs') {
        if (shared && ctx.rng.chance(0.7)) neonArch(ctx, s, F, snap(ctx.rng.range(a0 + 16, a1 - 16)));
        if (ctx.rng.chance(0.5)) {
          const [x, z] = sidePoint(s, F, snap(ctx.rng.range(a0 + 6, a1 - 6)), -2.5);
          if (ctx.free({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }, 0.6, 2)) ctx.pose(x, 0.5, z, Math.atan2(SV[s][0], SV[s][1]) + ctx.rng.range(-1, 1), 2);
        }
      } else if (id === 'fonds') {
        if (ctx.rng.chance(0.35)) {
          const [x, z] = sidePoint(s, F, snap(ctx.rng.range(a0 + 8, a1 - 8)), -2.2);
          if (ctx.free({ x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6 }, 0.6, 2)) fireBarrel(ctx, x, z, 0.5);
        }
        if (ctx.rng.chance(0.5)) {
          const [x, z] = sidePoint(s, F, snap(ctx.rng.range(a0 + 6, a1 - 6)), -3.3);
          if (ctx.free({ x0: x - 1.2, x1: x + 1.2, z0: z - 1.2, z1: z + 1.2 }, 0.6, 1.2)) {
            ctx.box({ x0: x - 1, x1: x + 1, z0: z - 0.4, z1: z + 0.4 }, 0.5, 0.56, { color: hex(0x6a4a2a), solid: false });
            ctx.pose(x - 0.9, 0.56, z, Math.PI / 2, 9);
          }
        }
      }
    }
  }
  // chiens errants (bas-fonds, docks), rats sur les trottoirs sales
  for (const B of blocks) {
    const id = idAt((B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2);
    const d = ctx.rng.range(0.6, 1.2);
    const loop: [number, number][] = [[B.x0 + d, B.z0 + d], [B.x1 - d, B.z0 + d], [B.x1 - d, B.z1 - d], [B.x0 + d, B.z1 - d]];
    if ((id === 'fonds' || id === 'port') && ctx.rng.chance(0.65)) ctx.animalLoop('dog', loop, 0.5, ctx.rng.int(1, 2));
    if ((id === 'fonds' || id === 'asia' || id === 'plaisirs') && ctx.rng.chance(0.4)) ctx.animalLoop('rat', loop, 0.5, 1);
  }
  // portes monumentales du quartier asiatique
  gates(ctx);
  // façades : cabanes accrochées (bas-fonds), enseignes d'hôtels (plaisirs), queues devant les bars
  for (const t of towers) {
    const id = idAt((t.lot.x0 + t.lot.x1) / 2, (t.lot.z0 + t.lot.z1) / 2);
    if (id === 'fonds') shanties(ctx, t);
    if (id === 'plaisirs') {
      if (ctx.rng.chance(0.35)) hotelSign(ctx, t);
      if (t.room && t.room.kind === 0) clubQueue(ctx, t);
    }
    if (id === 'asia' && t.alleySides.length && ctx.rng.chance(0.5)) alleyTarps(ctx, t, TARP);
    if (id === 'fonds' && t.alleySides.length && ctx.rng.chance(0.7)) alleyTarps(ctx, t, TARP);
  }
}

const rng = (ctx: Ctx, a: number, b: number) => snap(ctx.rng.range(a, b));

/** Guirlande de lanternes rouges tendue au-dessus de la rue (d'une façade à l'autre). */
function lanternString(ctx: Ctx, s: Side, F: number, a: number, wires: number[]) {
  const { rng: r } = ctx;
  const o0 = -SIDEWALK, o1 = ROAD + SIDEWALK;
  const y0 = 5.6;
  const sag = 1.1;
  const N = 14;
  let prev: [number, number, number] | null = null;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const o = o0 + (o1 - o0) * u;
    const y = y0 - sag * 4 * u * (1 - u);
    const [x, z] = sidePoint(s, F, a, o);
    if (prev) wires.push(prev[0], prev[1], prev[2], x, y, z);
    prev = [x, y, z];
    if (k > 0 && k < N && k % 1 === 0) {
      const c = r.chance(0.8) ? hex(0xff3020) : hex(0xffb000);
      ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, y - 0.55, y - 0.05, { color: c, style: STYLE.EMISSIVE, emis: 2.4, extra: 2, seed: r.byte(), solid: false, noRain: true });
    }
  }
  const [mx, mz] = sidePoint(s, F, a, (o0 + o1) / 2);
  ctx.world.light(mx, y0 - 1.5, mz, hex(0xff4a20), 1.3, 14);
}

function foodCart(ctx: Ctx, s: Side, F: number, a: number) {
  const { rng: r } = ctx;
  const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
  if (!ctx.free(R(-0.5, 2.5, -2.4, -0.6), 0.55, 2.8)) return;
  ctx.box(R(0, 2, -2, -1), 0.8, 1.6, { color: hex(0x8a2a1a) });
  for (const p of [0.2, 1.6]) ctx.box(R(p, p + 0.25, -2.05, -1.95), 0.5, 1.0, { color: hex(0x111111), solid: false });
  ctx.box(R(0.3, 1.7, -1.9, -1.1), 1.6, 1.9, { color: hex(0xb8b0a0), solid: false });
  ctx.box(R(-0.1, 2.1, -2.2, -0.9), 2.5, 2.6, { color: RED, solid: false });
  ctx.box(R(0.8, 1.2, -1.6, -1.4), 1.9, 2.5, { color: hex(0x3a2a1a), solid: false });
  ctx.box(R(0.1, 0.4, -1.1, -1.05), 1.9, 2.3, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 2.4, extra: 2, seed: r.byte(), solid: false });
  const [x, z] = sidePoint(s, F, a + 1, -1.5);
  ctx.world.emitSteam(x, 2.0, z, 0.5, 2.5, 8, hex(0x8a7a70));
  ctx.world.light(x, 2.4, z, hex(0xffa060), 1.1, 7);
  const [vx, vz] = sidePoint(s, F, a + 1, -2.5);
  ctx.pose(vx, 0.5, vz, Math.atan2(SV[s][0], SV[s][1]), 4);
  if (r.chance(0.6)) { const [cx, cz] = sidePoint(s, F, a + r.range(0.3, 1.7), -0.4); ctx.pose(cx, 0.5, cz, Math.atan2(-SV[s][0], -SV[s][1]), 10); }
  ctx.interact('food', vx + SV[s][0] * 2, 0.5, vz + SV[s][1] * 2, Math.atan2(-SV[s][0], -SV[s][1]));
}

/** Alignement d'arbres en bacs et de bornes lumineuses le long du trottoir (quartier riche). */
function curbTrees(ctx: Ctx, s: Side, F: number, a0: number, a1: number) {
  const { rng: r } = ctx;
  for (let a = a0 + 12; a < a1 - 8; a += 12) {
    const pl = sideRect(s, F, a, a + 1.2, -1.8, -0.6);
    if (!ctx.free(sideRect(s, F, a - 0.4, a + 1.6, -2.1, -0.3), 0.55, 4)) continue;
    ctx.box(pl, 0.5, 0.95, { color: hex(0xcfc8bd), extra: 9 });
    const [x, z] = sidePoint(s, F, a + 0.6, -1.2);
    tree(ctx, x, z, 0.95, r.range(0.75, 0.95), r.chance(0.25));
  }
  for (let a = a0 + 6; a < a1 - 4; a += 6) {
    const b = sideRect(s, F, a, a + 0.25, -0.5, -0.25);
    if (!ctx.free(b, 0.55, 1.2)) continue;
    ctx.box(b, 0.5, 1.2, { color: hex(0x2a2c30), extra: 9 });
    ctx.box(b, 1.2, 1.35, { color: hex(0xfff0dc), style: STYLE.EMISSIVE, emis: 2.2, solid: false });
  }
}

/** Arche de néons au-dessus de la rue (quartier des plaisirs). */
function neonArch(ctx: Ctx, s: Side, F: number, a: number) {
  const { rng: r } = ctx;
  const o0 = -1.2, o1 = ROAD + 1.2;
  const R = (p0: number, p1: number, q0: number, q1: number) => sideRect(s, F, a + p0, a + p1, q0, q1);
  if (!ctx.free(R(-0.6, 0.6, o0 - 0.4, o0 + 0.4), 0.55, 9) || !ctx.free(R(-0.6, 0.6, o1 - 0.4, o1 + 0.4), 0.55, 9)) return;
  const metal = hex(0x1a1a20);
  for (const o of [o0, o1]) ctx.box(R(-0.25, 0.25, o - 0.25, o + 0.25), 0.5, 9.5, { color: metal });
  ctx.box(R(-0.25, 0.25, o0 - 0.25, o1 + 0.25), 9.5, 10, { color: metal });
  const c1 = r.pick([hex(0xff2a9d), hex(0xa64dff), hex(0x00e5ff)]), c2 = r.pick([hex(0xff4fd8), hex(0xffb000)]);
  ctx.box(R(-0.15, 0.15, o0 + 3, o1 - 3), 6.8, 9.6, { color: c1, style: STYLE.SIGN, emis: 3, seed: r.byte(), extra: r.int(1, 2), solid: false });
  for (const o of [o0, o1]) ctx.box(R(-0.3, 0.3, o - 0.3, o + 0.3), 1, 9, { color: c2, style: STYLE.EMISSIVE, emis: 2.4, extra: 1, seed: r.byte(), solid: false, noRain: true });
  const [x, z] = sidePoint(s, F, a, ROAD / 2);
  ctx.world.light(x, 7.5, z, c1, 2.2, 22);
}

/** Portes monumentales (paifang) aux entrées du quartier asiatique. */
function gates(ctx: Ctx) {
  const { rng: r } = ctx;
  const cands: { x: number; z: number; axis: 0 | 1 }[] = [];
  const at = (bi: number, bj: number) => (bi < 0 || bj < 0 || bi >= BLOCKS || bj >= BLOCKS ? null : ctx.districts.grid[bi * BLOCKS + bj]);
  for (let bi = 0; bi < BLOCKS; bi++)
    for (let bj = 0; bj < BLOCKS; bj++) {
      if (at(bi, bj) !== 'asia') continue;
      // rue orientée z à gauche de l'îlot, entrée par le bas ou le haut
      for (const [di, dj, axis] of [[0, -1, 1], [0, 1, 1], [-1, 0, 0], [1, 0, 0]] as const) {
        const n = at(bi + di, bj + dj);
        if (n === 'asia' || n === null) continue;
        const bx = -HALF + bi * PITCH, bz = -HALF + bj * PITCH;
        if (axis === 1) cands.push({ x: bx + (r.chance(0.5) ? 0 : PITCH), z: bz + (dj < 0 ? 22 : PITCH - 22), axis: 1 });
        else cands.push({ x: bx + (di < 0 ? 22 : PITCH - 22), z: bz + (r.chance(0.5) ? 0 : PITCH), axis: 0 });
      }
    }
  const pick = cands.sort(() => r.next() - 0.5).slice(0, 3);
  for (const g of pick) paifang(ctx, g.x, g.z, g.axis);
}

function paifang(ctx: Ctx, x: number, z: number, axis: 0 | 1) {
  const { rng: r } = ctx;
  // axis 1 : la rue suit z, la porte l'enjambe dans le sens x
  const R = (a0: number, a1: number, t0: number, t1: number): Rect => (axis === 1 ? { x0: x + a0, x1: x + a1, z0: z + t0, z1: z + t1 } : { x0: x + t0, x1: x + t1, z0: z + a0, z1: z + a1 });
  const span = ROAD / 2 + 1.6;
  for (const a of [-span, span]) if (!ctx.free(R(a - 0.7, a + 0.7, -0.7, 0.7), 0.55, 12)) return;
  const clean = { extra: 9 };
  for (const a of [-span, span]) {
    ctx.box(R(a - 0.9, a + 0.9, -0.9, 0.9), 0.5, 1.2, { color: hex(0x5a554c), ...clean });
    ctx.box(R(a - 0.5, a + 0.5, -0.5, 0.5), 1.2, 10, { color: RED, ...clean });
    ctx.box(R(a - 0.55, a + 0.55, -0.55, 0.55), 7.5, 7.8, { color: GOLD, ...clean });
  }
  ctx.box(R(-span - 1, span + 1, -0.4, 0.4), 8.4, 9.1, { color: RED, ...clean });
  ctx.box(R(-2.5, 2.5, -0.45, 0.45), 9.1, 11.6, { color: GOLD, style: STYLE.SIGN, emis: 2.4, seed: r.byte(), extra: 2 });
  ctx.box(R(-span - 2.5, span + 2.5, -1.8, 1.8), 10, 10.5, { color: JADE, ...clean });
  ctx.box(R(-span - 1.5, span + 1.5, -1.3, 1.3), 10.5, 11, { color: JADE, ...clean });
  ctx.box(R(-3.5, 3.5, -1.5, 1.5), 11.6, 12.1, { color: JADE, ...clean });
  for (const a of [-span - 2.5, span + 2]) for (const t of [-1.8, 1.3]) ctx.box(R(a, a + 0.5, t, t + 0.5), 10.5, 11, { color: JADE, ...clean });
  for (const a of [-span + 1.2, -3, 3, span - 1.2]) {
    ctx.box(R(a - 0.25, a + 0.25, -0.25, 0.25), 7.4, 8.4, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 2.8, extra: 2, seed: r.byte(), solid: false });
    const [lx, lz] = axis === 1 ? [x + a, z] : [x, z + a];
    ctx.world.light(lx, 7.5, lz, hex(0xff4020), 1.2, 12);
  }
}

/** Cabanes de tôle accrochées aux façades (bas-fonds) : consoles, bâches, fenêtres allumées, échelles. */
function shanties(ctx: Ctx, t: Tower) {
  const { rng: r } = ctx;
  const seg = t.segs[0];
  const n = r.int(3, 9);
  for (let i = 0; i < n; i++) {
    const s = r.pick([...t.streetSides, ...t.alleySides]) as Side;
    if (s === t.eSide || (t.room && t.room.side === s)) continue;
    const F = faceCoord(seg, s);
    const [a0, a1] = alongRange(seg, s);
    const w = snap(r.range(2, 3.5)), d = snap(r.range(1.5, 2.5)), h = r.pick([2, 2.3, 2.6]);
    const a = snap(r.range(a0 + 0.5, a1 - 0.5 - w));
    const y = snap(r.range(6.5, Math.min(seg.y1 - 3, 26)));
    if (y < 6.5) continue;
    const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
    if (!ctx.free(R(-0.3, w + 0.3, 0, d + 0.4), y - 1.2, y + h + 0.4)) continue;
    const col = r.pick([hex(0x5a4a3a), hex(0x4a5a5a), hex(0x6a4a2a), hex(0x3a4a5a), hex(0x5a3a3a)]);
    ctx.box(R(0, w, 0, d), y, y + h, { color: col, style: STYLE.INDUSTRIAL, seed: r.byte() });
    ctx.box(R(-0.2, w + 0.2, 0, d + 0.3), y + h, y + h + 0.1, { color: r.pick(TARP), solid: false, noRain: false });
    // consoles en escalier sous la cabane
    for (let k = 0; k < 3; k++) ctx.box(R(0.1, 0.3, 0, d - k * 0.6), y - 0.3 * (k + 1), y - 0.3 * k, { color: hex(0x2a2a2a), solid: false });
    ctx.box(R(w - 0.3, w - 0.1, 0, d * 0.5), y - 0.9, y, { color: hex(0x2a2a2a), solid: false });
    // fenêtre allumée (souvent vacillante)
    const lit = r.chance(0.75);
    ctx.box(R(w * 0.3, w * 0.3 + 0.8, d, d + 0.05), y + 0.9, y + 1.6, { color: lit ? r.pick([hex(0xffb060), hex(0xb8ffcf), hex(0xff9ad5)]) : hex(0x111111), style: STYLE.EMISSIVE, emis: lit ? 1.8 : 0.1, extra: r.chance(0.4) ? 3 : 0, seed: r.byte(), solid: false });
    if (lit && r.chance(0.5)) { const [lx, lz] = sidePoint(s, F, a + w * 0.3 + 0.4, d + 0.6); ctx.world.light(lx, y + 1.3, lz, hex(0xffa060), 0.8, 7, r.chance(0.4) ? r.byte() + 1 : undefined); }
    // échelle vers le bas
    if (r.chance(0.35)) ctx.box(R(w - 0.6, w - 0.5, d - 0.15, d - 0.05), Math.max(0.5, y - 5), y, { color: hex(0x3a3a3a), solid: false });
  }
}

function hotelSign(ctx: Ctx, t: Tower) {
  const { rng: r } = ctx;
  const seg = t.segs[0];
  const s = r.pick(t.streetSides) as Side | undefined;
  if (s === undefined || s === t.eSide) return;
  const F = faceCoord(seg, s);
  const [a0, a1] = alongRange(seg, s);
  const a = snap(r.range(a0 + 2, a1 - 6));
  const y = snap(r.range(10, Math.min(18, seg.y1 - 14)));
  if (y < 10) return;
  const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
  if (!ctx.free(R(-0.5, 4.5, 0, 1.2), y - 0.5, y + 12)) return;
  const pink = hex(0xff3fa8);
  // cœur en pixels + enseigne verticale
  const heart = ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'];
  heart.forEach((row, j) => {
    for (let i = 0; i < row.length; i++)
      if (row[i] === '1') ctx.box(R(i * 0.5, i * 0.5 + 0.5, 0.6, 0.8), y + 11.5 - j * 0.5 - 0.5, y + 11.5 - j * 0.5, { color: pink, style: STYLE.EMISSIVE, emis: 3, extra: 2, seed: 40, solid: false, noRain: true });
  });
  ctx.box(R(1, 3, 0.4, 0.9), y, y + 8, { color: hex(0xff6ac8), style: STYLE.SIGN, emis: 3, seed: r.byte(), extra: 2 });
  const [x, z] = sidePoint(s, F, a + 2, 3);
  ctx.world.light(x, y + 7, z, pink, 2, 20);
}

/** File d'attente et videur devant l'entrée d'un bar (quartier des plaisirs). */
function clubQueue(ctx: Ctx, t: Tower) {
  const { rng: r } = ctx;
  const room = t.room!;
  const s = room.side;
  const F = faceCoord(t.segs[0], s);
  const [a0, a1] = alongRange(room.rect, s);
  const dc = (a0 + a1) / 2;
  const out = Math.atan2(SV[s][0], SV[s][1]);
  const along = Math.atan2(s === 0 || s === 2 ? 1 : 0, s === 0 || s === 2 ? 0 : 1);
  // cordon de velours
  for (let a = dc + 3; a < dc + 9; a += 1.5) {
    const p = sideRect(s, F, a, a + 0.12, 1.6, 1.72);
    if (!ctx.free(p, 0.55, 1.2)) break;
    ctx.box(p, 0.5, 1.4, { color: GOLD, extra: 9 });
    ctx.box(sideRect(s, F, a, a + 1.5, 1.63, 1.69), 1.15, 1.22, { color: hex(0x8a1030), solid: false });
  }
  for (let k = 0; k < r.int(3, 7); k++) {
    const [x, z] = sidePoint(s, F, dc + 3.4 + k * 0.8, 1.0);
    if (!ctx.free({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, 0.6, 1.8)) break;
    ctx.pose(x, 0.5, z, along + Math.PI + r.range(-0.4, 0.4), r.pick([5, 2, 0, 3]));
  }
  const [bx, bz] = sidePoint(s, F, dc + 2.2, 0.8);
  ctx.pose(bx, 0.5, bz, out, 0);
  void dark; void OPP;
}

function alleyTarps(ctx: Ctx, t: Tower, cols: RGB[]) {
  const { rng: r } = ctx;
  const seg = t.segs[0];
  const s = r.pick(t.alleySides) as Side;
  const F = faceCoord(seg, s);
  const [a0, a1] = alongRange(seg, s);
  const a = snap(r.range(a0 + 1, a1 - 6));
  const y = snap(r.range(4, 6));
  const R = sideRect(s, F, a, a + r.range(3, 5), 0, 4.5);
  if (!ctx.free(R, y - 0.2, y + 0.3)) return;
  ctx.box(R, y, y + 0.08, { color: r.pick(cols), solid: false });
}

// ---------------------------------------------------------------------------
// Volées d'oiseaux : pigeons (places, trottoirs, toits bas, quais), corbeaux (toits, chantier, parc)
// ---------------------------------------------------------------------------
export function placeFlocks(ctx: Ctx, plazas: Plaza[], towers: Tower[], blocks: Rect[], quay: (a: number) => [number, number]) {
  const { rng, world } = ctx;
  const flock = (x: number, y: number, z: number, n: number, crow: boolean, r: number) => world.spot('flock', x, y, z, n, crow ? 1 : 0, [0, 0, 0], [r]);
  for (const { rect: P } of plazas) {
    for (let k = 0; k < 6; k++) {
      const x = rng.range(P.x0 + 4, P.x1 - 4), z = rng.range(P.z0 + 4, P.z1 - 4);
      if (!ctx.free({ x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2 }, 0.6, 2)) continue;
      flock(x, 0.5, z, rng.int(7, 13), false, 2.2);
      break;
    }
  }
  for (let i = 0; i < 22; i++) {
    const B = rng.pick(blocks);
    const s = rng.int(0, 3) as Side;
    const [a0, a1] = alongRange(B, s);
    const [x, z] = sidePoint(s, faceCoord(B, s), rng.range(a0 + 10, a1 - 10), -2);
    if (ctx.districts.idAt(x, z) === 'riche') continue;
    if (!ctx.free({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5 }, 0.6, 2)) continue;
    flock(x, 0.5, z, rng.int(4, 9), false, 1.6);
  }
  const low = towers.filter((t) => t.H < 60 && !t.landmark).sort(() => rng.next() - 0.5).slice(0, 16);
  for (const t of low) {
    const top = t.segs[t.segs.length - 1];
    if (top.x1 - top.x0 < 10 || top.z1 - top.z0 < 10) continue;
    const x = (top.x0 + top.x1) / 2 + rng.range(-3, 3), z = (top.z0 + top.z1) / 2 + rng.range(-3, 3);
    if (!ctx.free({ x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2 }, top.y1 + 0.1, top.y1 + 1.5)) continue;
    flock(x, top.y1, z, rng.int(5, 11), false, 2.5);
  }
  const mid = towers.filter((t) => t.H >= 60 && t.H < 220 && !t.landmark).sort(() => rng.next() - 0.5).slice(0, 10);
  for (const t of mid) {
    const top = t.segs[t.segs.length - 1];
    const x = top.x0 + 1.5, z = top.z0 + 1.5;
    if (!ctx.free({ x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 }, top.y1 + 0.1, top.y1 + 1.5)) continue;
    flock(x, top.y1, z, rng.int(3, 6), true, 1.2);
  }
  for (const sp of world.spots.filter((s) => s.kind === 'crane')) flock(sp.x, sp.y, sp.z, 4, true, 0.7);
  for (const d of ctx.dests) {
    if (d.name.startsWith('Parc')) flock(d.x + rng.range(-4, 4), 0.5, d.z + rng.range(-4, 4), 6, true, 3);
    if (d.name.startsWith('Sanctuaire')) flock(d.x, 0.55, d.z, 8, false, 2.5);
  }
  for (let i = 0; i < 4; i++) {
    const [x, z] = quay(rng.range(-HALF + 30, HALF - 30));
    if (ctx.free({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5 }, 0.6, 2)) flock(x, 0.5, z, rng.int(6, 12), false, 2.2);
  }
}

// ---------------------------------------------------------------------------
// Secrets du carnet d'exploration
// ---------------------------------------------------------------------------
const MURAL = [
  '................',
  '......cccc......',
  '....cccccccc....',
  '...ccwwwwwwcc...',
  '..ccwwkkkkwwcc..',
  '.ccwwkkppkkwwcc.',
  '.ccwkkpppppkwcc.',
  'ccwwkppyyppkwwcc',
  'ccwwkppyyppkwwcc',
  '.ccwkkpppppkwcc.',
  '.ccwwkkppkkwwcc.',
  '..ccwwkkkkwwcc..',
  '...ccwwwwwwcc...',
  '....cccccccc....',
  '......cccc......',
  '................',
];
const MURAL_COL: Record<string, RGB> = { c: hex(0x00c8e0), w: hex(0xe8e8e8), k: hex(0x101014), p: hex(0xff2a9d), y: hex(0xffd23a) };

export function placeSecrets(ctx: Ctx, towers: Tower[], basements: { kind: number; rect: Rect }[]) {
  const { rng, world } = ctx;
  const idOf = (t: Tower) => ctx.districts.idAt((t.lot.x0 + t.lot.x1) / 2, (t.lot.z0 + t.lot.z1) / 2);
  const shuffled = [...towers].filter((t) => !t.landmark).sort(() => rng.next() - 0.5);
  // l'autel caché, au fond d'une ruelle
  for (const t of shuffled) {
    if (!t.alleySides.length || !['asia', 'fonds', 'plaisirs'].includes(idOf(t))) continue;
    const s = rng.pick(t.alleySides) as Side;
    const seg = t.segs[0];
    const F = faceCoord(seg, s);
    const [a0, a1] = alongRange(seg, s);
    const a = snap(rng.range(a0 + 2, a1 - 3));
    const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
    if (!ctx.free(R(-0.3, 1.3, 0, 1.4), 0.55, 2.4)) continue;
    ctx.box(R(0, 1, 0, 0.6), 0.5, 1.4, { color: RED, extra: 9 });
    ctx.box(R(-0.1, 1.1, 0, 0.7), 1.4, 1.55, { color: JADE, extra: 9 });
    for (const p of [0.15, 0.45, 0.8]) ctx.box(R(p, p + 0.06, 0.55, 0.61), 1.55, 1.75, { color: hex(0xffb050), style: STYLE.EMISSIVE, emis: 3, extra: 3, seed: rng.byte(), solid: false });
    for (const p of [0.2, 0.6]) ctx.box(R(p, p + 0.2, 0.62, 0.8), 0.5, 0.7, { color: rng.pick([hex(0xff8a30), hex(0xd8c040), hex(0xc03030)]), solid: false });
    const [x, z] = sidePoint(s, F, a + 0.5, 0.4);
    world.emitSteam(x, 1.8, z, 0.25, 2.5, 6, hex(0x6a6470));
    world.light(x, 1.9, z, hex(0xffa050), 0.9, 6, rng.byte() + 1);
    const [kx, kz] = sidePoint(s, F, a + 1.6, 0.5);
    ctx.cat(kx, 0.5, kz, Math.atan2(SV[s][0], SV[s][1]));
    ctx.secret('autel', x, 0.5, z, 5);
    break;
  }
  // la fresque du toit, visible seulement d'en haut
  for (const t of shuffled) {
    const top = t.segs[t.segs.length - 1];
    if (t.H > 60 || top.x1 - top.x0 < 18 || top.z1 - top.z0 < 18) continue;
    const cx = snap((top.x0 + top.x1) / 2), cz = snap((top.z0 + top.z1) / 2);
    const r = { x0: cx - 8, x1: cx + 8, z0: cz - 8, z1: cz + 8 };
    if (!ctx.free(r, top.y1 + 0.05, top.y1 + 0.6)) continue;
    MURAL.forEach((row, j) => row.split('').forEach((ch, i) => {
      const c = MURAL_COL[ch];
      if (c) ctx.box({ x0: r.x0 + i, x1: r.x0 + i + 1, z0: r.z0 + j, z1: r.z0 + j + 1 }, top.y1, top.y1 + 0.04, { color: c, solid: false, extra: 9 });
    }));
    ctx.secret('fresque', cx, top.y1, cz, 14);
    break;
  }
  // l'épave d'une voiture volante écrasée sur un toit
  for (const t of shuffled) {
    const top = t.segs[t.segs.length - 1];
    if (t.H < 30 || t.H > 100 || top.x1 - top.x0 < 12 || top.z1 - top.z0 < 12) continue;
    const x = snap(top.x0 + 3), z = snap(top.z0 + 3), y = top.y1;
    if (!ctx.free({ x0: x, x1: x + 6, z0: z, z1: z + 4 }, y + 0.05, y + 3)) continue;
    const hull = hex(0x3a2a2e);
    ctx.box({ x0: x, x1: x + 4.5, z0: z + 0.5, z1: z + 2.5 }, y, y + 0.6, { color: hull });
    ctx.box({ x0: x + 0.5, x1: x + 3.5, z0: z + 0.6, z1: z + 2.4 }, y + 0.6, y + 1.3, { color: hull });
    ctx.box({ x0: x + 1, x1: x + 2.8, z0: z + 0.7, z1: z + 2.3 }, y + 1.3, y + 1.8, { color: hex(0x0a0c12) });
    ctx.box({ x0: x + 4.2, x1: x + 5.5, z0: z + 1, z1: z + 3 }, y, y + 0.4, { color: hull });
    for (let k = 0; k < 8; k++) { const dx = rng.range(0, 6), dz = rng.range(0, 4); ctx.box({ x0: x + dx, x1: x + dx + 0.3, z0: z + dz, z1: z + dz + 0.3 }, y, y + 0.15, { color: hex(0x55565c), solid: false }); }
    ctx.box({ x0: x + 1.8, x1: x + 2.4, z0: z + 1.2, z1: z + 1.8 }, y + 1.8, y + 2.1, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
    world.emitSteam(x + 2, y + 2, z + 1.5, 1.2, 12, 14, hex(0x2a2a2e));
    world.light(x + 2, y + 2.5, z + 1.5, hex(0xff7a30), 2, 14, rng.byte() + 1);
    ctx.secret('epave', x + 2, y, z + 1.5, 12);
    break;
  }
  // le chat noir du sommet de la plus haute tour
  {
    const t = [...towers].filter((u) => !u.landmark).sort((a, b) => b.H - a.H)[0];
    if (t) {
      const top = t.segs[t.segs.length - 1];
      const x = top.x1 - 1.2, z = top.z1 - 1.2;
      ctx.peds.idle.push({ x, y: top.y1, z, yaw: rng.range(-3, 3), cat: true, pose: 1 });
      ctx.secret('chat', x, top.y1, z, 6);
    }
  }
  // le jardin secret, sur une terrasse oubliée
  for (const t of shuffled) {
    if (t.segs.length < 2 || !['fonds', 'asia'].includes(idOf(t))) continue;
    const seg = t.segs[0], nxt = t.segs[1];
    const y = seg.y1;
    for (const s of SIDES) {
      const F = faceCoord(seg, s);
      const w = Math.abs(F - faceCoord(nxt, s));
      if (w < 4) continue;
      const [a0, a1] = alongRange(nxt, s);
      const a = snap((a0 + a1) / 2);
      const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
      if (!ctx.free(R(-3, 3, -w + 0.3, -0.6), y + 0.1, y + 4)) continue;
      const [tx, tz] = sidePoint(s, F, a, -w / 2);
      ctx.box(R(-1, 1, -w / 2 - 1, -w / 2 + 1), y, y + 0.1, { color: hex(0x2e5a2a), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
      tree(ctx, tx, tz, y + 0.1, 1.0, true);
      ctx.box(R(1.6, 3.2, -w + 0.6, -w + 1.1), y, y + 0.45, { color: hex(0x5a3a22), extra: 9 });
      const [bx, bz] = sidePoint(s, F, a + 2.4, -w + 0.85);
      ctx.interact('seat', bx, y + 0.45, bz, Math.atan2(SV[s][0], SV[s][1]), y);
      for (const p of [-2.5, 2.5]) ctx.box(R(p, p + 0.3, -1.2, -0.9), y + 1.8, y + 2.3, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 2.5, extra: 2, seed: rng.byte(), solid: false });
      world.light(tx, y + 2, tz, hex(0xffb0d0), 1.2, 10);
      ctx.secret('jardin', tx, y, tz, 8);
      return placeTags(ctx, shuffled, basements);
    }
  }
  placeTags(ctx, shuffled, basements);
}

const GHOST = ['.xxxx.', 'xxxxxx', 'x.xx.x', 'xxxxxx', 'xxxxxx', 'x.x.xx'];

function placeTags(ctx: Ctx, shuffled: Tower[], basements: { kind: number; rect: Rect }[]) {
  const { rng, world } = ctx;
  const bar = basements.find((b) => b.kind === 3);
  if (bar) ctx.secret('bar', (bar.rect.x0 + bar.rect.x1) / 2, -5.5, (bar.rect.z0 + bar.rect.z1) / 2, 9);
  let n = 0;
  for (const t of shuffled) {
    if (n >= 5) break;
    if (!t.alleySides.length || !rng.chance(0.5)) continue;
    const s = rng.pick(t.alleySides) as Side;
    const seg = t.segs[0];
    const F = faceCoord(seg, s);
    const [a0, a1] = alongRange(seg, s);
    const a = snap(rng.range(a0 + 1, a1 - 4));
    if (!ctx.free(sideRect(s, F, a - 0.2, a + 3.2, 0, 0.4), 1.4, 4.6)) continue;
    const cyan = hex(0x40e8ff);
    GHOST.forEach((row, j) => row.split('').forEach((ch, i) => {
      if (ch === 'x') ctx.box(sideRect(s, F, a + i * 0.5, a + i * 0.5 + 0.5, 0.01, 0.04), 4.2 - j * 0.5 - 0.5, 4.2 - j * 0.5, { color: cyan, style: STYLE.EMISSIVE, emis: 2.2, extra: 2, seed: 50 + n, solid: false, noRain: true });
    }));
    const [x, z] = sidePoint(s, F, a + 1.5, 1);
    world.light(x, 3, z, cyan, 0.8, 6);
    ctx.secret(`tag${++n}`, x, 0.5, z, 5);
  }
}
