import { LUX_Y, NEON, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import type { Tower } from './city';
import type { Ctx } from './ctx';
import { SIDES, SV, alongRange, faceCoord, inset, sidePoint, sideRect, type Rect } from './geom';

const LAUNDRY: RGB[] = [hex(0xc8c0b0), hex(0x8a3a3a), hex(0x3a5a8a), hex(0xd8c070), hex(0x5a7a5a), hex(0xb07aa0)];
const GREENS: RGB[] = [hex(0x2f5a2a), hex(0x3d6b30), hex(0x244a22)];

/**
 * Balcons-cages des immeubles denses (style Kowloon) : linge, plantes, climatiseurs,
 * parfois un fumeur. Alignés sur les planchers (3 m).
 */
export function balconies(ctx: Ctx, t: Tower) {
  const { rng } = ctx;
  if (t.style !== STYLE.DENSE && !(t.style === STYLE.GRID && rng.chance(0.25))) return;
  let budget = rng.int(14, 34);
  for (let k = 0; k < Math.min(2, t.segs.length) && budget > 0; k++) {
    const seg = t.segs[k];
    for (const s of SIDES) {
      if (s === t.eSide) continue;
      const F = faceCoord(seg, s);
      const [a0, a1] = alongRange(seg, s);
      if (a1 - a0 < 8) continue;
      const n = Math.min(budget, Math.round(((a1 - a0) * Math.min(seg.y1 - seg.y0, 60)) / 90));
      for (let i = 0; i < n; i++) {
        const w = rng.pick([2, 2.5, 3]);
        const a = snap(rng.range(a0 + 1, a1 - 1 - w));
        const f = rng.int(Math.max(2, Math.ceil((seg.y0 < 1 ? 7 : 0) / 3)), Math.floor((Math.min(seg.y1, 70) - seg.y0 - 3.5) / 3));
        const y = seg.y0 + f * 3;
        if (y < 6.5 || y + 3 > seg.y1 - 0.5) continue;
        if (!ctx.free(sideRect(s, F, a - 0.2, a + w + 0.2, 0, 1.3), y - 0.1, y + 3)) continue;
        budget--;
        const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
        const metal = hex(0x3a3c40);
        ctx.box(R(0, w, 0, 1.0), y, y + 0.2, { color: hex(0x4a4a4c), noRain: true });
        const cage = rng.chance(0.5);
        if (cage) {
          const fence = { color: hex(0x6a6e74), style: STYLE.FENCE, noRain: true };
          ctx.box(R(0, w, 0.95, 1.0), y + 0.2, y + 2.8, fence);
          ctx.box(R(0, 0.05, 0, 0.95), y + 0.2, y + 2.8, fence);
          ctx.box(R(w - 0.05, w, 0, 0.95), y + 0.2, y + 2.8, fence);
          ctx.box(R(-0.1, w + 0.1, 0, 1.1), y + 2.8, y + 2.9, { color: rng.pick([hex(0x3a4a5a), hex(0x5a4a3a), metal]) });
        } else {
          ctx.box(R(0, w, 0.9, 1.0), y + 0.2, y + 1.1, { color: metal, noRain: true });
          ctx.box(R(0, 0.1, 0, 0.9), y + 0.2, y + 1.1, { color: metal, noRain: true });
          ctx.box(R(w - 0.1, w, 0, 0.9), y + 0.2, y + 1.1, { color: metal, noRain: true });
        }
        const roll = rng.next();
        if (roll < 0.45) {
          // linge qui sèche sous l'auvent
          for (let q = 0.2; q < w - 0.4; q += rng.range(0.4, 0.7)) {
            const cw = rng.pick([0.3, 0.4, 0.5]), ch = rng.pick([0.4, 0.6, 0.8]);
            ctx.box(R(q, q + cw, 0.5, 0.54), y + 2.55 - ch, y + 2.55, { color: rng.pick(LAUNDRY), solid: false, noRain: true });
          }
        } else if (roll < 0.7) {
          ctx.box(R(0.1, w - 0.1, 0.55, 0.9), y + 0.2, y + 0.55, { color: hex(0x5a3a2a), solid: false });
          ctx.box(R(0.15, w - 0.15, 0.55, 0.9), y + 0.55, y + 0.55 + rng.pick([0.3, 0.6, 0.9]), { color: rng.pick(GREENS), style: STYLE.FOLIAGE, seed: rng.byte(), solid: false, noRain: true });
        } else if (roll < 0.9) {
          ctx.box(R(0.2, 1.0, 0.3, 0.8), y + 0.2, y + 0.75, { color: hex(0x5a5f66), solid: false });
          ctx.box(R(1.2, w - 0.2, 0.2, 0.9), y + 0.2, y + rng.pick([0.5, 0.75, 1.0]), { color: rng.pick([hex(0x6a4a2a), hex(0x2a2a30), hex(0x3a3a2a)]), solid: false });
        }
        if (rng.chance(0.1)) ctx.box(R(0, w, 1.0, 1.05), y + 0.25, y + 0.35, { color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 2.2, solid: false, noRain: true });
        if (rng.chance(0.07)) {
          const [x, z] = sidePoint(s, F, a + w / 2, 0.5);
          ctx.smoker(x, y + 0.2, z, Math.atan2(SV[s][0], SV[s][1]));
        }
      }
    }
  }
}

/**
 * Éléments de toit des immeubles "populaires" (sous LUX_Y) : chapeau (pagode, dôme),
 * panneau publicitaire, château d'eau. Renvoie true si le toit doit rester dégagé.
 */
export function roofFeature(ctx: Ctx, t: Tower): boolean {
  const { rng, world } = ctx;
  const top = t.segs[t.segs.length - 1];
  const y = top.y1;
  if (y >= LUX_Y) return false;
  const w = top.x1 - top.x0, d = top.z1 - top.z0;
  const cx = snap((top.x0 + top.x1) / 2), cz = snap((top.z0 + top.z1) / 2);
  // corniche des immeubles anciens
  if (t.style === STYLE.HERITAGE) {
    ctx.box(inset(top, -0.5), y - 1.2, y - 0.6, { color: hex(0x5a554c) });
    ctx.box(inset(top, -0.25), y - 2.2, y - 1.2, { color: hex(0x4a453e) });
  }
  const roll = rng.next();
  // chapeau : pagode ou dôme (le toit reste dégagé)
  if (w >= 14 && d >= 14 && roll < 0.1 && t.style !== STYLE.INDUSTRIAL) {
    const r0 = Math.min(w, d) / 2 - 1.5;
    if (!ctx.free({ x0: cx - r0, x1: cx + r0, z0: cz - r0, z1: cz + r0 }, y + 0.1, y + 12)) return false;
    if (rng.chance(0.55)) pagoda(ctx, cx, cz, y, r0);
    else dome(ctx, cx, cz, y, r0, t);
    return true;
  }
  // panneau publicitaire tourné vers la rue
  if (roll < 0.28 && t.streetSides.length) {
    const s = rng.pick(t.streetSides);
    const F = faceCoord(top, s);
    const [a0, a1] = alongRange(top, s);
    const bw = snap(Math.min(16, a1 - a0 - 4));
    if (bw >= 8) {
      const a = snap((a0 + a1) / 2 - bw / 2);
      const h = snap(bw * 0.45);
      const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
      if (ctx.free(R(-0.5, bw + 0.5, -2.6, -1.2), y + 0.1, y + 3.5 + h)) {
        const metal = hex(0x22252c);
        for (const q of [0.5, bw / 2, bw - 1]) ctx.box(R(q, q + 0.4, -2.3, -1.9), y, y + 3, { color: metal });
        ctx.box(R(0, bw, -2.3, -1.5), y + 2.8, y + 3.0, { color: metal });
        ctx.box(R(0, bw, -1.9, -1.6), y + 3, y + 3 + h, { color: metal });
        const col = rng.pick(NEON);
        const screen = rng.chance(0.5);
        ctx.box(R(0.25, bw - 0.25, -1.6, -1.5), y + 3.25, y + 3 + h - 0.25, screen
          ? { color: hex(0x111111), style: STYLE.SCREEN, emis: 2.2, seed: rng.byte() }
          : { color: col, style: STYLE.SIGN, emis: 2.8, seed: rng.byte(), extra: rng.int(0, 2) });
        const [lx, lz] = sidePoint(s, F, a + bw / 2, 3);
        world.light(lx, y + 3 + h / 2, lz, screen ? rng.pick(NEON) : col, 2, 30);
        for (const q of [bw * 0.2, bw * 0.8]) {
          const [x, z] = sidePoint(s, F, a + q, -1.2);
          ctx.box({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 }, y + 2.9, y + 3.2, { color: hex(0xfff0d8), style: STYLE.EMISSIVE, emis: 3, solid: false });
          world.cone(x, y + 3.2, z, -SV[s][0] * 0.12, 1, -SV[s][1] * 0.12, h * 0.95, bw * 0.22, hex(0xfff0d8), 0.035);
        }
        return false;
      }
    }
  }
  // château d'eau sur pilotis
  if (roll < 0.5 && w >= 10 && d >= 10) {
    for (let k = 0; k < 8; k++) {
      const x = snap(rng.range(top.x0 + 2, top.x1 - 6)), z = snap(rng.range(top.z0 + 2, top.z1 - 6));
      const r: Rect = { x0: x, x1: x + 4, z0: z, z1: z + 4 };
      if (!ctx.free(inset(r, -0.3), y + 0.1, y + 10)) continue;
      waterTower(ctx, x + 2, z + 2, y);
      break;
    }
  }
  return false;
}

function waterTower(ctx: Ctx, x: number, z: number, y: number) {
  const { rng } = ctx;
  const wood = rng.pick([hex(0x5a3a24), hex(0x4a3422), hex(0x6a4a30)]);
  const steel = hex(0x2a2c30);
  for (const [dx, dz] of [[-1.6, -1.6], [1.3, -1.6], [-1.6, 1.3], [1.3, 1.3]]) ctx.box({ x0: x + dx, x1: x + dx + 0.3, z0: z + dz, z1: z + dz + 0.3 }, y, y + 3.5, { color: steel });
  ctx.box({ x0: x - 1.8, x1: x + 1.8, z0: z - 1.8, z1: z + 1.8 }, y + 3.5, y + 3.7, { color: steel });
  const H = 3.6;
  ctx.box({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.9, z1: z + 1.9 }, y + 3.7, y + 3.7 + H, { color: wood, seed: rng.byte() });
  ctx.box({ x0: x - 1.9, x1: x + 1.9, z0: z - 1.5, z1: z + 1.5 }, y + 3.7, y + 3.7 + H, { color: wood, seed: rng.byte() });
  for (const hy of [0.6, 1.8, 3.0]) {
    ctx.box({ x0: x - 1.55, x1: x + 1.55, z0: z - 1.95, z1: z + 1.95 }, y + 3.7 + hy, y + 3.78 + hy, { color: steel, solid: false });
    ctx.box({ x0: x - 1.95, x1: x + 1.95, z0: z - 1.55, z1: z + 1.55 }, y + 3.7 + hy, y + 3.78 + hy, { color: steel, solid: false });
  }
  let r = 1.7, yy = y + 3.7 + H;
  for (let k = 0; k < 3; k++) {
    ctx.box({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, yy, yy + 0.5, { color: hex(0x2a2622) });
    yy += 0.5; r -= 0.6;
  }
  ctx.box({ x0: x + 1.9, x1: x + 2.0, z0: z - 0.3, z1: z + 0.3 }, y, y + 3.7 + H, { color: steel, solid: false });
}

function pagoda(ctx: Ctx, cx: number, cz: number, y: number, r0: number) {
  const { rng, world } = ctx;
  const body = rng.pick([hex(0x4a1a14), hex(0x3a2418), hex(0x2a2a2e)]);
  const roof = rng.pick([hex(0x1e2a28), hex(0x181414), hex(0x2a3a44)]);
  let r = r0 - 1.5, yy = y;
  for (let k = 0; k < 3 && r > 1.5; k++) {
    const rb = snap(r);
    ctx.box({ x0: cx - rb, x1: cx + rb, z0: cz - rb, z1: cz + rb }, yy, yy + 3, { color: body, seed: rng.byte() });
    for (const s of SIDES) {
      const F = faceCoord({ x0: cx - rb, x1: cx + rb, z0: cz - rb, z1: cz + rb }, s);
      ctx.box(sideRect(s, F, -rb + 1 + (s === 0 || s === 2 ? cx : cz), rb - 1 + (s === 0 || s === 2 ? cx : cz), 0, 0.05), yy + 1, yy + 2.3, { color: hex(0xffd6a0), style: STYLE.SHOP, emis: 1.4, seed: rng.byte(), solid: false });
    }
    const re = rb + 1.4;
    ctx.box({ x0: cx - re, x1: cx + re, z0: cz - re, z1: cz + re }, yy + 3, yy + 3.5, { color: roof });
    for (const [x, z] of [[cx - re, cz - re], [cx + re - 0.5, cz - re], [cx - re, cz + re - 0.5], [cx + re - 0.5, cz + re - 0.5]]) {
      ctx.box({ x0: x, x1: x + 0.5, z0: z, z1: z + 0.5 }, yy + 3.5, yy + 4, { color: roof });
      ctx.box({ x0: x + 0.1, x1: x + 0.4, z0: z + 0.1, z1: z + 0.4 }, yy + 2.3, yy + 2.9, { color: hex(0xff3020), style: STYLE.EMISSIVE, emis: 3, extra: 2, seed: rng.byte(), solid: false });
    }
    ctx.box({ x0: cx - rb + 0.5, x1: cx + rb - 0.5, z0: cz - rb + 0.5, z1: cz + rb - 0.5 }, yy + 3.5, yy + 4.0, { color: roof });
    yy += 4;
    r -= 2.2;
  }
  ctx.box({ x0: cx - 0.25, x1: cx + 0.25, z0: cz - 0.25, z1: cz + 0.25 }, yy, yy + 2.5, { color: hex(0xc8a040) });
  world.light(cx, y + 3, cz + r0, hex(0xff5030), 1.4, 14);
  world.light(cx, yy - 1, cz, hex(0xff5030), 1.2, 12);
}

function dome(ctx: Ctx, cx: number, cz: number, y: number, r0: number, t: Tower) {
  const { rng, world } = ctx;
  const R = snap(Math.min(r0 - 1, 8));
  const skin = rng.pick([hex(0x2e5a4a), hex(0x8a9098), hex(0x6a5a3a)]);
  ctx.box({ x0: cx - R, x1: cx + R, z0: cz - R, z1: cz + R }, y, y + 2, { color: hex(0x4a4a4e) });
  ctx.box({ x0: cx - R - 0.1, x1: cx + R + 0.1, z0: cz - R - 0.1, z1: cz + R + 0.1 }, y + 1.6, y + 1.85, { color: t.accent, style: STYLE.EMISSIVE, emis: 3, solid: false, noRain: true });
  const n = Math.max(3, Math.round(R));
  for (let k = 0; k < n; k++) {
    const r = snap(R * Math.sqrt(1 - (k / n) ** 2));
    if (r < 0.5) break;
    const yy = y + 2 + k;
    ctx.box({ x0: cx - r, x1: cx + r, z0: cz - r * 0.7, z1: cz + r * 0.7 }, yy, yy + 1, { color: skin, seed: rng.byte() });
    ctx.box({ x0: cx - r * 0.7, x1: cx + r * 0.7, z0: cz - r, z1: cz + r }, yy, yy + 1, { color: skin, seed: rng.byte() });
  }
  const yt = y + 2 + n;
  ctx.box({ x0: cx - 0.25, x1: cx + 0.25, z0: cz - 0.25, z1: cz + 0.25 }, yt, yt + 6, { color: hex(0x33363f) });
  ctx.box({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5 }, yt + 6, yt + 7, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 6, extra: 1, seed: rng.byte(), solid: false });
  world.light(cx, y + 2, cz + R + 1, t.accent, 1.5, 16);
}
