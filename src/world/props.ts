import { HALF, LUX_Y, NEON, PITCH, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import type { Tower } from './city';
import { dark, mixRGB, type Ctx } from './ctx';
import { SIDES, SV, alongRange, faceCoord, inset, outOf, sidePoint, sideRect, subtractIntervals, type Rect, type Side } from './geom';
import { lineFrame, type MetroLine } from './metro';

const GREENS: RGB[] = [hex(0x2f5a2a), hex(0x3d6b30), hex(0x244a22), hex(0x4a7a34), hex(0x365e2c)];
const BLOSSOM = hex(0xd97aa8);
const TRASH: RGB[] = [hex(0x111214), hex(0x1a2a1a), hex(0x1a2440), hex(0x2a2a2e)];
const CARDBOARD = hex(0x6a4a2a);
const WARM = hex(0xffd6a0);

// ---------------------------------------------------------------------------
// Végétation
// ---------------------------------------------------------------------------
export function planter(ctx: Ctx, r: Rect, y: number, lux: boolean) {
  ctx.box(r, y, y + 0.6, { color: lux ? hex(0xcfc8bd) : hex(0x3a3836), seed: ctx.rng.byte() });
  ctx.box(inset(r, 0.1), y + 0.6, y + 0.6 + snap(ctx.rng.range(0.25, 0.9), 0.25), { color: ctx.rng.pick(GREENS), style: STYLE.FOLIAGE, seed: ctx.rng.byte(), solid: false, noRain: true });
}

export function tree(ctx: Ctx, x: number, z: number, y: number, s: number, blossom = false) {
  const { rng } = ctx;
  const leaf = () => (blossom && rng.chance(0.8) ? BLOSSOM : rng.pick(GREENS));
  ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, y, y + 2.4 * s, { color: hex(0x4a3526) });
  const w1 = 1.3 * s, w2 = 0.8 * s;
  const ox = snap(rng.range(-0.3, 0.3), 0.25), oz = snap(rng.range(-0.3, 0.3), 0.25);
  ctx.box({ x0: x - w1, x1: x + w1, z0: z - w1, z1: z + w1 }, y + 2.1 * s, y + 3.4 * s, { color: leaf(), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  ctx.box({ x0: x - w2 + ox, x1: x + w2 + ox, z0: z - w2 + oz, z1: z + w2 + oz }, y + 3.4 * s, y + 4.2 * s, { color: leaf(), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  if (rng.chance(0.6)) {
    const sx = rng.chance(0.5) ? w1 : -w1 - 0.8 * s;
    ctx.box({ x0: x + sx, x1: x + sx + 0.8 * s, z0: z - 0.6 * s, z1: z + 0.6 * s }, y + 2.4 * s, y + 3.1 * s, { color: leaf(), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  }
}

export function bamboo(ctx: Ctx, x: number, z: number, y: number) {
  const { rng } = ctx;
  for (let i = 0; i < rng.int(3, 6); i++) {
    const bx = x + rng.range(-0.6, 0.6), bz = z + rng.range(-0.6, 0.6), h = rng.range(3, 5.5);
    ctx.box({ x0: bx, x1: bx + 0.15, z0: bz, z1: bz + 0.15 }, y, y + h, { color: hex(0x7a8f3a), solid: false });
    ctx.box({ x0: bx - 0.35, x1: bx + 0.5, z0: bz - 0.35, z1: bz + 0.5 }, y + h - 0.6, y + h, { color: rng.pick(GREENS), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
  }
}

// ---------------------------------------------------------------------------
// Terrasses : verdure partout, luxe en hauteur
// ---------------------------------------------------------------------------
export function decorateTerraces(ctx: Ctx, t: Tower) {
  const { rng } = ctx;
  const last = t.segs.length - 1;
  for (let k = 0; k < last; k++) {
    const seg = t.segs[k], nxt = t.segs[k + 1];
    const y = seg.y1;
    const lux = y >= LUX_Y;
    if (!lux && !rng.chance(0.45)) continue;
    for (const s of SIDES) {
      const F = faceCoord(seg, s);
      const w = -outOf(s, F, faceCoord(nxt, s));
      if (w < 3) continue;
      const [a0, a1] = alongRange(nxt, s);
      const gaps = t.gaps[k][s].map(([g0, g1]) => [g0 - 1.5, g1 + 1.5] as [number, number]);
      for (const [p0, p1] of subtractIntervals([a0 + 1, a1 - 1], gaps)) {
        let p = p0;
        while (p < p1 - 2) {
          const len = Math.min(p1 - p, snap(rng.range(2, 3.5)));
          if (len < 1.5) break;
          const r = sideRect(s, F, p, p + len, -1.5, -0.5);
          if (rng.chance(lux ? 0.75 : 0.5) && ctx.free(sideRect(s, F, p, p + len, -2.5, -0.5), y + 0.05, y + 2)) {
            if (lux && len >= 2 && rng.chance(0.45)) {
              const r2 = sideRect(s, F, p, p + 1.5, -2, -0.5);
              ctx.box(r2, y, y + 0.6, { color: hex(0xcfc8bd) });
              const [cx, cz] = sidePoint(s, F, p + 0.75, -1.25);
              tree(ctx, cx, cz, y + 0.6, rng.range(0.6, 0.85), rng.chance(0.3));
            } else if (lux && rng.chance(0.25)) {
              const [cx, cz] = sidePoint(s, F, p + 0.75, -1.1);
              ctx.box(sideRect(s, F, p, p + 1.5, -1.6, -0.5), y, y + 0.4, { color: hex(0xcfc8bd) });
              bamboo(ctx, cx, cz, y + 0.4);
            } else planter(ctx, r, y, lux);
          }
          p += len + snap(rng.range(1, 4));
        }
      }
      // salon de terrasse le long du mur intérieur
      if (lux && w >= 5 && rng.chance(0.4)) {
        const pa = snap(rng.range(a0 + 1, a1 - 6));
        const sofa = sideRect(s, F, pa, pa + 4, -w, -w + 0.9);
        if (ctx.free(sideRect(s, F, pa - 0.5, pa + 4.5, -w, -w + 2.8), y + 0.05, y + 2)) {
          const velvet = rng.pick([hex(0x4a1a3a), hex(0x1a2a4a), hex(0x2a3a2a), hex(0x3a2a1a)]);
          ctx.box(sofa, y, y + 0.45, { color: velvet });
          ctx.box(sideRect(s, F, pa, pa + 4, -w, -w + 0.25), y + 0.45, y + 1.0, { color: velvet });
          ctx.box(sideRect(s, F, pa + 1.2, pa + 2.8, -w + 1.4, -w + 2.2), y, y + 0.4, { color: hex(0xd8d0c0) });
          ctx.box(sideRect(s, F, pa + 1.8, pa + 2.2, -w + 1.6, -w + 2.0), y + 0.4, y + 0.6, { color: WARM, style: STYLE.EMISSIVE, emis: 2, solid: false });
          const [lx, lz] = sidePoint(s, F, pa + 2, -w + 1.8);
          ctx.world.light(lx, y + 1.2, lz, WARM, 1.2, 8);
          for (let k = 0; k < 3; k++) { const [sx, sz] = sidePoint(s, F, pa + 0.8 + k * 1.2, -w + 0.5); ctx.seat(rng.chance(0.5), sx, y + 0.45, sz, Math.atan2(SV[s][0], SV[s][1])); }
          void lx; void lz;
        }
      }
      if (lux && rng.chance(0.25)) {
        const pa = rng.range(a0 + 2, a1 - 2);
        const [px, pz] = sidePoint(s, F, pa, -1.9);
        if (ctx.free({ x0: px - 0.35, x1: px + 0.35, z0: pz - 0.35, z1: pz + 0.35 }, y + 0.05, y + 1.8)) ctx.idle(px, y, pz, Math.atan2(SV[s][0], SV[s][1]));
      }
    }
  }
}

/** Programme de toit luxueux (piscine, jardin, lounge). Renvoie true si le toit a été aménagé. */
export function decorateRoof(ctx: Ctx, t: Tower): boolean {
  const { rng } = ctx;
  const top = t.segs[t.segs.length - 1];
  const y = top.y1;
  const inner = inset(top, 3.5);
  const w = inner.x1 - inner.x0, d = inner.z1 - inner.z0;
  if (w < 8 || d < 8) return false;
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  if (y < LUX_Y) {
    // toits populaires : potager en pots, parfois
    if (!rng.chance(0.3)) return false;
    for (let i = 0; i < rng.int(4, 12); i++) {
      const x = snap(rng.range(inner.x0, inner.x1 - 0.5)), z = snap(rng.range(inner.z0, inner.z1 - 0.5));
      const r = { x0: x, x1: x + 0.5, z0: z, z1: z + 0.5 };
      if (!ctx.free(r, y + 0.05, y + 1)) continue;
      ctx.box(r, y, y + 0.5, { color: hex(0x7a3a2a) });
      ctx.box(inset(r, 0.05), y + 0.5, y + 0.5 + rng.pick([0.25, 0.5, 0.75]), { color: rng.pick(GREENS), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
    }
    return false;
  }
  const prog = w >= 16 && d >= 12 ? rng.int(0, 2) : rng.int(1, 2);
  const stone = hex(0xd8d4cc);
  if (prog === 0) {
    // Piscine à débordement
    const alongX = w >= d;
    const pw = Math.min(alongX ? w - 6 : w - 4, 16), pd = Math.min(alongX ? d - 4 : d - 6, 7);
    const P: Rect = alongX
      ? { x0: snap(cx - pw / 2), x1: snap(cx + pw / 2), z0: snap(cz - pd / 2), z1: snap(cz + pd / 2) }
      : { x0: snap(cx - pd / 2), x1: snap(cx + pd / 2), z0: snap(cz - pw / 2), z1: snap(cz + pw / 2) };
    if (!ctx.free(P, y + 0.05, y + 2)) return false;
    ctx.box({ ...P, x1: P.x0 + 0.5 }, y, y + 0.6, { color: stone });
    ctx.box({ ...P, x0: P.x1 - 0.5 }, y, y + 0.6, { color: stone });
    ctx.box({ ...P, x0: P.x0 + 0.5, x1: P.x1 - 0.5, z1: P.z0 + 0.5 }, y, y + 0.6, { color: stone });
    ctx.box({ ...P, x0: P.x0 + 0.5, x1: P.x1 - 0.5, z0: P.z1 - 0.5 }, y, y + 0.6, { color: stone });
    ctx.box(inset(P, 0.5), y + 0.45, y + 0.5, { color: hex(0x0aa0e0), style: STYLE.WATER, emis: 0.8, solid: false, noRain: true, seed: ctx.rng.byte() });
    ctx.world.light(cx, y + 1.2, cz, hex(0x40d8ff), 1.6, 12);
    // transats + parasols le long de la piscine
    for (let i = 0; i < 5; i++) {
      const lx = alongX ? P.x0 + 1 + i * (pw / 5) : P.x1 + 1.2;
      const lz = alongX ? P.z1 + 1.2 : P.z0 + 1 + i * (pw / 5);
      const r = alongX ? { x0: lx, x1: lx + 0.75, z0: lz, z1: lz + 1.9 } : { x0: lx, x1: lx + 1.9, z0: lz, z1: lz + 0.75 };
      if (!ctx.free(r, y + 0.05, y + 1.2)) continue;
      ctx.box(r, y, y + 0.35, { color: hex(0xeeeae2) });
      if (i % 2 === 0) {
        const px = alongX ? lx + 1.2 : lx + 2.4, pz = alongX ? lz + 2.4 : lz + 1.2;
        ctx.box({ x0: px, x1: px + 0.1, z0: pz, z1: pz + 0.1 }, y, y + 2.3, { color: hex(0x888070), solid: false });
        ctx.box({ x0: px - 1, x1: px + 1.1, z0: pz - 1, z1: pz + 1.1 }, y + 2.3, y + 2.4, { color: rng.pick([hex(0xf0e6d0), hex(0xc85a3a), hex(0x2a4a6a)]), solid: false });
      }
    }
    for (let i = 0; i < rng.int(2, 4); i++) ctx.idle(P.x0 - 1 + rng.range(0, 1), y, rng.range(P.z0, P.z1), Math.PI / 2);
  } else if (prog === 1) {
    // Jardin suspendu : pelouses, arbres (parfois en fleurs), bambous, guirlandes
    for (let i = 0; i < 4; i++) {
      const gw = snap(rng.range(3, Math.min(8, w))), gd = snap(rng.range(3, Math.min(8, d)));
      const x = snap(rng.range(inner.x0, inner.x1 - gw)), z = snap(rng.range(inner.z0, inner.z1 - gd));
      const r = { x0: x, x1: x + gw, z0: z, z1: z + gd };
      if (!ctx.free(r, y + 0.05, y + 1)) continue;
      ctx.box(r, y, y + 0.1, { color: rng.pick(GREENS), style: STYLE.FOLIAGE, seed: rng.byte() });
    }
    const blossom = rng.chance(0.4);
    for (let i = 0; i < rng.int(3, 7); i++) {
      const x = snap(rng.range(inner.x0 + 1.5, inner.x1 - 1.5)), z = snap(rng.range(inner.z0 + 1.5, inner.z1 - 1.5));
      if (!ctx.free({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4 }, y + 0.2, y + 4)) continue;
      if (rng.chance(0.25)) bamboo(ctx, x, z, y + 0.1);
      else tree(ctx, x, z, y + 0.1, rng.range(0.8, 1.2), blossom);
    }
    for (let i = 0; i < 3; i++) {
      const x = snap(rng.range(inner.x0, inner.x1 - 2)), z = snap(rng.range(inner.z0, inner.z1 - 0.6));
      const r = { x0: x, x1: x + 2, z0: z, z1: z + 0.6 };
      if (ctx.free(r, y + 0.2, y + 1)) {
        ctx.box(r, y, y + 0.45, { color: hex(0x5a3a22) });
        ctx.seat(rng.chance(0.6), x + rng.range(0.4, 1.6), y + 0.45, z + 0.3, 0);
      }
    }
    stringLights(ctx, inner, y);
    for (let i = 0; i < rng.int(1, 4); i++) ctx.idle(rng.range(inner.x0, inner.x1), y, rng.range(inner.z0, inner.z1), rng.range(-3, 3));
  } else {
    // Sky lounge : bar, canapés, lanternes
    const bar = { x0: snap(cx - 3), x1: snap(cx + 3), z0: snap(inner.z0 + 0.5), z1: snap(inner.z0 + 1.5) };
    if (ctx.free(bar, y + 0.05, y + 2)) {
      ctx.box(bar, y, y + 1.1, { color: hex(0x1c1a20) });
      ctx.box({ ...bar, z0: bar.z1, z1: bar.z1 + 0.06 }, y + 0.9, y + 1.0, { color: t.accent, style: STYLE.EMISSIVE, emis: 2, solid: false });
      ctx.box({ ...bar, z0: bar.z0 - 0.1, z1: bar.z0 }, y + 1.5, y + 3.5, { color: t.accent, style: STYLE.SIGN, emis: 2, seed: rng.byte() });
      ctx.idle(cx, y, bar.z0 - 0.6, 0);
    }
    for (let i = 0; i < 5; i++) {
      const x = snap(rng.range(inner.x0, inner.x1 - 3)), z = snap(rng.range(inner.z0 + 3, inner.z1 - 3));
      const set = { x0: x, x1: x + 3, z0: z, z1: z + 2.4 };
      if (!ctx.free(set, y + 0.05, y + 1.5)) continue;
      const velvet = rng.pick([hex(0x4a1a3a), hex(0x1a2a4a), hex(0x3a2a1a)]);
      ctx.box({ ...set, z1: z + 0.8 }, y, y + 0.45, { color: velvet });
      ctx.box({ ...set, z1: z + 0.25 }, y + 0.45, y + 0.95, { color: velvet });
      ctx.box({ x0: x + 1, x1: x + 2, z0: z + 1.3, z1: z + 2.1 }, y, y + 0.4, { color: stone });
      ctx.box({ x0: x + 1.4, x1: x + 1.6, z0: z + 1.6, z1: z + 1.8 }, y + 0.4, y + 0.6, { color: WARM, style: STYLE.EMISSIVE, emis: 2.2, solid: false });
      ctx.world.light(x + 1.5, y + 1.3, z + 1.7, WARM, 1.1, 8);
      for (let k = 0; k < 3; k++) ctx.seat(rng.chance(0.45), x + 0.6 + k * 0.9, y + 0.45, z + 0.5, 0);
    }
    stringLights(ctx, inner, y);
  }
  // grands bacs aux angles
  for (const [x, z] of [[inner.x0, inner.z0], [inner.x1 - 1.5, inner.z0], [inner.x0, inner.z1 - 1.5], [inner.x1 - 1.5, inner.z1 - 1.5]]) {
    const r = { x0: x, x1: x + 1.5, z0: z, z1: z + 1.5 };
    if (!ctx.free(r, y + 0.05, y + 3)) continue;
    ctx.box(r, y, y + 0.7, { color: stone });
    tree(ctx, x + 0.75, z + 0.75, y + 0.7, 0.7, rng.chance(0.3));
  }
  return true;
}

function stringLights(ctx: Ctx, inner: Rect, y: number) {
  const { rng } = ctx;
  const z = snap(rng.range(inner.z0 + 2, inner.z1 - 2));
  for (const x of [inner.x0 + 0.5, inner.x1 - 0.75]) ctx.box({ x0: x, x1: x + 0.2, z0: z, z1: z + 0.2 }, y, y + 3.2, { color: hex(0x2a2622), solid: false });
  for (let x = inner.x0 + 1.2; x < inner.x1 - 1; x += 0.9) {
    const u = (x - inner.x0) / (inner.x1 - inner.x0);
    const yy = y + 3.0 - Math.sin(u * Math.PI) * 0.6;
    ctx.box({ x0: x, x1: x + 0.15, z0: z + 0.02, z1: z + 0.17 }, yy - 0.15, yy, { color: WARM, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
  }
  ctx.world.light((inner.x0 + inner.x1) / 2, y + 2.6, z, WARM, 1.3, 14);
}

// ---------------------------------------------------------------------------
// Rue : mobilier, crasse, vapeur
// ---------------------------------------------------------------------------

export function trashPile(ctx: Ctx, s: Side, F: number, a: number, o: number, y = 0.5) {
  const { rng } = ctx;
  for (let i = 0; i < rng.int(2, 6); i++) {
    const w = rng.pick([0.5, 0.75]);
    const aa = a + snap(rng.range(-0.75, 1.0), 0.25), oo = o + snap(rng.range(-0.5, 0.5), 0.25);
    const r = sideRect(s, F, aa, aa + w, oo, oo + w);
    const h = rng.pick([0.25, 0.4, 0.5, 0.6]);
    ctx.box(r, y, y + h, { color: rng.chance(0.25) ? CARDBOARD : rng.pick(TRASH), solid: false, seed: rng.byte() });
    if (rng.chance(0.3)) ctx.box(inset(r, 0.05), y + h, y + h + 0.25, { color: rng.chance(0.5) ? CARDBOARD : rng.pick(TRASH), solid: false });
  }
}

export function streetProps(ctx: Ctx, blocks: Rect[], towers: Tower[], metro: MetroLine[]) {
  const { rng } = ctx;
  for (const B of blocks) {
    const cornerLights = rng.pick([[0, 2], [1, 3]]);
    for (const s of SIDES) {
      const F = faceCoord(B, s);
      const [a0, a1] = alongRange(B, s);
      // lampadaires (+ poubelle au pied)
      for (let a = a0 + 6; a < a1 - 5; a += 24) {
        const pole = sideRect(s, F, a, a + 0.5, -1, -0.5);
        if (!ctx.free(pole, 0.5, 8) || !ctx.free(sideRect(s, F, a - 0.25, a + 0.75, -1, 1.5), 6.5, 8)) continue;
        const [px, pz] = sidePoint(s, F, a, -1);
        const LD = ctx.D(px, pz);
        const col = rng.pick(LD.lamp);
        const faulty = rng.chance(LD.faulty);
        const dead = !faulty && rng.chance(LD.faulty * 0.4);
        ctx.box(pole, 0.5, 7.5, { color: hex(0x1c1e24) });
        ctx.box(sideRect(s, F, a, a + 0.5, -1, 1.5), 7.5, 7.75, { color: hex(0x1c1e24) });
        ctx.box(sideRect(s, F, a - 0.25, a + 0.75, 0.25, 1.5), 7.25, 7.5, { color: col, style: STYLE.EMISSIVE, emis: dead ? 0.1 : 4, extra: faulty ? 3 : 0, seed: rng.byte(), solid: false });
        const [lx, lz] = sidePoint(s, F, a + 0.25, 0.9);
        if (!dead) {
          const fl = faulty ? rng.byte() + 1 : undefined;
          ctx.world.light(lx, 6.8, lz, col, 1.7, 20, fl);
          ctx.world.cone(lx, 7.25, lz, 0, -1, 0, 6.75, 2.8, col, 0.07, fl);
        }
        const bin = sideRect(s, F, a + 1.0, a + 1.55, -1.05, -0.5);
        if (rng.chance(0.7) && ctx.free(bin, 0.5, 1.5)) {
          ctx.box(bin, 0.5, 1.35, { color: LD.id === 'riche' ? hex(0x9a9ca4) : rng.pick([hex(0x1f3a2a), hex(0x2a2a30), hex(0x3a2a20)]) });
          ctx.box(inset(bin, -0.04), 1.35, 1.45, { color: hex(0x15161a) });
          if (rng.chance(0.45 * LD.trash)) trashPile(ctx, s, F, a + 1.8, -1.2);
        }
      }
      // distributeurs
      for (let i = 0, nv = rng.int(0, 3); i < nv; i++) {
        const a = snap(rng.range(a0 + 6, a1 - 7));
        if (!ctx.free(sideRect(s, F, a - 0.5, a + 1.5, -3.95, -2.5), 0.5, 2.6)) continue;
        const col = rng.pick([hex(0xff4fa0), hex(0x40d0ff), hex(0xffe060), hex(0xff5040)]);
        ctx.box(sideRect(s, F, a, a + 1, -3.9, -3.1), 0.5, 2.5, { color: col, style: STYLE.SHOP, emis: 2.2, seed: rng.byte() });
        const [x, z] = sidePoint(s, F, a + 0.5, -2.2);
        ctx.world.light(x, 1.8, z, col, 0.9, 6);
        ctx.interact('vend', x, 0.5, z, Math.atan2(-SV[s][0], -SV[s][1]));
      }
      // scooters garés, plantes en pot, sacs
      for (let i = 0, n = rng.int(0, 3); i < n; i++) {
        const a = snap(rng.range(a0 + 5, a1 - 6));
        const r = sideRect(s, F, a, a + 0.5, -3.9, -2.4);
        if (!ctx.free(sideRect(s, F, a - 0.3, a + 0.8, -3.95, -2.3), 0.5, 1.5)) continue;
        const body = rng.pick([hex(0xb01842), hex(0x1d5fbf), hex(0xe0a020), hex(0xd8d8e0), hex(0x2a2a2a)]);
        ctx.box(sideRect(s, F, a + 0.15, a + 0.35, -3.85, -3.4), 0.5, 0.95, { color: hex(0x111111), solid: false });
        ctx.box(sideRect(s, F, a + 0.15, a + 0.35, -2.9, -2.45), 0.5, 0.95, { color: hex(0x111111), solid: false });
        ctx.box(r, 0.75, 1.2, { color: body, solid: false });
        ctx.box(sideRect(s, F, a + 0.1, a + 0.4, -3.6, -3.0), 1.2, 1.35, { color: hex(0x1a1a1a), solid: false });
        ctx.box(sideRect(s, F, a - 0.1, a + 0.6, -2.55, -2.45), 1.5, 1.6, { color: hex(0x222222), solid: false });
      }
      for (let i = 0, n = rng.int(0, 2); i < n; i++) {
        const a = snap(rng.range(a0 + 5, a1 - 6));
        const r = sideRect(s, F, a, a + 0.5, -3.9, -3.4);
        if (!ctx.free(r, 0.5, 1.5)) continue;
        ctx.box(r, 0.5, 1.0, { color: hex(0x5a3a2a) });
        ctx.box(inset(r, -0.1), 1.0, 1.0 + rng.pick([0.5, 0.75, 1.0]), { color: rng.pick(GREENS), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false });
      }
      for (let k = 0, nt = rng.chance(ctx.D(...sidePoint(s, F, (a0 + a1) / 2, -2)).trash * 0.5) ? rng.int(1, 3) : 0; k < nt; k++) {
        const a = snap(rng.range(a0 + 5, a1 - 6));
        if (ctx.free(sideRect(s, F, a - 0.5, a + 1.5, -3.9, -2.9), 0.5, 1.2)) trashPile(ctx, s, F, a, -3.6);
      }
      // bancs (souvent occupés), groupes qui discutent
      if (rng.chance(0.5)) {
        const a = snap(rng.range(a0 + 6, a1 - 9));
        const seat = sideRect(s, F, a, a + 2.5, -3.9, -3.3);
        if (ctx.free(sideRect(s, F, a - 0.3, a + 2.8, -3.95, -2.4), 0.5, 1.6)) {
          ctx.box(seat, 0.5, 0.95, { color: hex(0x3a2e24) });
          ctx.box(sideRect(s, F, a, a + 2.5, -3.95, -3.8), 0.95, 1.5, { color: hex(0x3a2e24) });
          const face = Math.atan2(SV[s][0], SV[s][1]);
          for (let k = 0; k < 3; k++)
            { const [x, z] = sidePoint(s, F, a + 0.45 + k * 0.8, -3.6); ctx.seat(rng.chance(0.45), x, 0.95, z, face); }
        }
      }
      if (rng.chance(0.4)) {
        const a = snap(rng.range(a0 + 6, a1 - 6));
        const [x, z] = sidePoint(s, F, a, -3.0);
        if (ctx.free({ x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1 }, 0.55, 2)) ctx.group(x, 0.5, z, rng.int(2, 4));
      }
      // bouches d'égout fumantes sur la chaussée
      if (rng.chance(0.4)) {
        const a = snap(rng.range(a0 + 12, a1 - 12));
        const o = snap(rng.range(2.5, 7.5));
        const r = sideRect(s, F, a, a + 1, o, o + 1);
        if (ctx.free(r, 0, 2)) {
          ctx.box(r, 0, 0.04, { color: hex(0x16161a), solid: false });
          const [x, z] = sidePoint(s, F, a + 0.5, o + 0.5);
          ctx.world.emitSteam(x, 0.05, z, 1.4, 7, 16, mixRGB(hex(0x3a3844), rng.pick(NEON), 0.15));
        }
      }
      // feux tricolores aux angles
      if (s === cornerLights[0] || s === cornerLights[1]) {
        const a = a0 + 0.75;
        const pole = sideRect(s, F, a, a + 0.3, -0.75, -0.45);
        if (ctx.free(pole, 0.5, 5)) {
          ctx.box(pole, 0.5, 4.5, { color: hex(0x1a1c20) });
          const head = sideRect(s, F, a - 0.05, a + 0.35, -0.15, 0.25);
          ctx.box(head, 3.3, 4.5, { color: hex(0x111214) });
          // feux synchronisés avec le trafic : la face s règle la chaussée qui longe ce côté
          const axis = s === 0 || s === 2 ? 0 : 1;
          const cols = [hex(0xff2a1a), hex(0xffa000), hex(0x2aff7a)];
          for (let i = 0; i < 3; i++)
            ctx.box(sideRect(s, F, a + 0.05, a + 0.25, 0.25, 0.3), 4.2 - i * 0.4, 4.4 - i * 0.4, { color: cols[i], style: STYLE.EMISSIVE, emis: 4, extra: 6 + axis * 3 + i, solid: false });
        }
      }
    }
  }

  // Ruelles : bennes, sacs, cartons, lampes murales jaunâtres, grilles fumantes
  for (const t of towers) {
    const seg = t.segs[0];
    for (const s of t.alleySides) {
      if (t.room && t.room.side === s) continue;
      const F = faceCoord(seg, s);
      const [a0, a1] = alongRange(seg, s);
      for (let i = 0, n = rng.int(1, 3); i < n; i++) {
        const a = snap(rng.range(a0 + 1, a1 - 4));
        const dump = sideRect(s, F, a, a + 2.2, 0.2, 1.5);
        if (!ctx.free(sideRect(s, F, a - 0.3, a + 2.5, 0.1, 1.9), 0.55, 2.2)) continue;
        const col = rng.pick([hex(0x2b4a3a), hex(0x283a5a), hex(0x4a3a2a), hex(0x3a2a2a)]);
        ctx.box(dump, 0.5, 1.7, { color: col, seed: rng.byte() });
        ctx.box(inset(dump, -0.05), 1.7, 1.8, { color: dark(col, 0.6) });
        trashPile(ctx, s, F, a + 2.5, 0.4);
        if (rng.chance(0.35)) {
          const [cx, cz] = sidePoint(s, F, a + rng.range(0.4, 1.8), 0.85);
          ctx.cat(cx, 1.8, cz, rng.range(-Math.PI, Math.PI));
        }
      }
      if (rng.chance(0.7)) {
        const a = snap(rng.range(a0 + 2, a1 - 2));
        const r = sideRect(s, F, a, a + 0.5, 0, 0.35);
        if (ctx.free(r, 3.2, 3.8)) {
          const faulty = rng.chance(0.4);
          ctx.box(r, 3.3, 3.6, { color: hex(0xffb050), style: STYLE.EMISSIVE, emis: 3, extra: faulty ? 3 : 0, seed: rng.byte(), solid: false });
          const [x, z] = sidePoint(s, F, a + 0.25, 1);
          const fl = faulty ? rng.byte() + 1 : undefined;
          ctx.world.light(x, 3.2, z, hex(0xffa040), 1.2, 9, fl);
          ctx.world.cone(x, 3.3, z, SV[s][0] * 0.3, -1, SV[s][1] * 0.3, 3, 1.6, hex(0xffa040), 0.06, fl);
          // fumeur sous la lampe, dos au mur
          if (rng.chance(0.45)) {
            const [px, pz] = sidePoint(s, F, a + 1.1, 0.6);
            if (ctx.free({ x0: px - 0.3, x1: px + 0.3, z0: pz - 0.3, z1: pz + 0.3 }, 0.55, 2)) ctx.smoker(px, 0.5, pz, Math.atan2(SV[s][0], SV[s][1]));
          }
        }
      }
      // chats errants et rats qui arpentent la ruelle le long du mur
      if (rng.chance(0.3)) {
        const [x0, z0] = sidePoint(s, F, a0 + 1, 0.35), [x1, z1] = sidePoint(s, F, a1 - 1, 0.35);
        ctx.peds.loops.push({ pts: [[x0, z0], [x1, z1]], y: 0.5, count: 1, cat: true });
      }
      const ratK = ctx.D(...sidePoint(s, F, (a0 + a1) / 2, 1)).trash;
      if (rng.chance(0.25 + 0.35 * ratK)) {
        const [x0, z0] = sidePoint(s, F, a0 + 0.5, 0.2), [x1, z1] = sidePoint(s, F, a1 - 0.5, 0.2);
        ctx.animalLoop('rat', [[x0, z0], [x1, z1]], 0.5, rng.int(1, 2));
      }
      if (rng.chance(0.35)) {
        const a = snap(rng.range(a0 + 2, a1 - 3));
        const r = sideRect(s, F, a, a + 1, 0.5, 1.5);
        if (ctx.free(r, 0.5, 2)) {
          ctx.box(r, 0.5, 0.54, { color: hex(0x16161a), solid: false });
          const [x, z] = sidePoint(s, F, a + 0.5, 1);
          ctx.world.emitSteam(x, 0.55, z, 1.0, 6, 12, hex(0x35323c));
        }
      }
    }
  }

  // Sous le viaduc : campements, fûts, cartons
  for (const l of metro) {
    const { R, P } = lineFrame(l);
    for (let p = -HALF + 20; p < HALF - 20; p += 24) {
      const r = (((p + HALF) % PITCH) + PITCH) % PITCH;
      if (r < 14 || r > PITCH - 14 || !rng.chance(0.3)) continue;
      const sg = rng.chance(0.5) ? 1 : -1;
      const tent = R(p + 2, p + 4.5, sg * 1.2, sg * 3.2);
      if (!ctx.free(tent, 0.05, 2)) continue;
      ctx.box(tent, 0, 1.2, { color: rng.pick([hex(0x2a4a8a), hex(0x3a5a3a), hex(0x5a3a2a)]), solid: false });
      ctx.box(R(p + 5, p + 5.6, sg * 1.5, sg * 2.1), 0, 0.5, { color: CARDBOARD, solid: false });
      if (rng.chance(0.4)) {
        const [x, z] = P(p + 0.5, sg * 2.5);
        ctx.box({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }, 0, 1.0, { color: hex(0x3a2a22) });
        ctx.box({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, 1.0, 1.25, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
        ctx.world.light(x, 1.8, z, hex(0xff7a30), 2.2, 11, rng.byte() + 1);
        ctx.world.emitSteam(x, 1.3, z, 0.8, 6, 12, hex(0x3a2a24));
        if (rng.chance(0.4)) ctx.animal('dog', x - 0.5, 0, z + 1.6, rng.range(-3, 3), true);
        ctx.pose(x + 1.1, 0, z, -Math.PI / 2, 10);
        if (rng.chance(0.6)) ctx.pose(x - 1.1, 0, z, Math.PI / 2, 10);
      }
      // dormeur sur un carton, emmitouflé
      if (rng.chance(0.45)) {
        const cb = R(p + 6.2, p + 8.2, sg * 1.3, sg * 2.3);
        if (ctx.free(cb, 0.05, 1)) {
          ctx.box(cb, 0, 0.06, { color: CARDBOARD, solid: false });
          const [x, z] = P(p + 6.3, sg * 1.8);
          ctx.pose(x, 0.06, z, -Math.PI / 2 * (l.axis === 0 ? 1 : 0) + (l.axis === 1 ? Math.PI : 0), 9);
        }
      }
    }
  }
}
