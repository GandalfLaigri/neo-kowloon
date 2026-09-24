import { hex } from '../config';
import { snap } from '../rng';
import type { Tower } from './city';
import type { Ctx } from './ctx';
import { alongRange, faceCoord, outOf, sidePoint, sideRect, type Side } from './geom';

const RUST = hex(0x3b302b);
const IRON = hex(0x241e1b);
const LEN = 11; // emprise le long de la façade : palier 1,5 + volée 8 + palier 1,5

/**
 * Escalier de secours en zigzag plaqué sur la face s du segment k : de la rue
 * (k = 0) ou de la terrasse inférieure jusqu'au sommet du segment. Deux couloirs
 * côte à côte (montées alternées), paliers tous les 4 m, garde-corps.
 */
export function fireEscape(ctx: Ctx, t: Tower, k: number, s: Side, a0: number): boolean {
  const seg = t.segs[k];
  const y0 = seg.y0, y1 = seg.y1;
  const n = Math.round((y1 - y0) / 4);
  if (n < 2 || Math.abs(n * 4 - (y1 - y0)) > 0.01) return false;
  const F = faceCoord(seg, s);
  const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a0 + p0, a0 + p1, o0, o1);
  if (!ctx.free(R(-0.3, LEN + 0.3, 0, 3.1), y0 + 0.05, y1 + 1.3)) return false;

  for (let i = 0; i < n; i++) {
    const hb = y0 + 4 * i;
    const even = i % 2 === 0;
    const o0 = even ? 0.2 : 1.5, o1 = even ? 1.5 : 2.8;
    for (let j = 0; j < 8; j++) {
      const top = hb + 0.5 * (j + 1);
      const p0 = even ? 1.5 + j : 9.5 - (j + 1);
      ctx.box(R(p0, p0 + 1, o0, o1), top - 0.2, top, { color: RUST, noRain: true, seed: 7 });
      if (j % 2 === 0) ctx.box(R(p0, p0 + 0.12, 2.7, 2.82), top, top + 1.0, { color: IRON, solid: false, noRain: true });
    }
    const lp: [number, number] = even ? [9.5, LEN] : [0, 1.5];
    ctx.box(R(lp[0], lp[1], 0.2, 2.8), hb + 3.8, hb + 4, { color: RUST, noRain: true, seed: 9 });
    ctx.box(R(lp[0], lp[1], 2.7, 2.82), hb + 4, hb + 5, { color: IRON, solid: false, noRain: true });
    const ep: [number, number] = even ? [LEN - 0.12, LEN] : [0, 0.12];
    ctx.box(R(ep[0], ep[1], 0.2, 2.82), hb + 4, hb + 5, { color: IRON, solid: false, noRain: true });
  }
  // garde-corps invisibles : bord extérieur et extrémités
  const yc0 = y0 + (k === 0 ? 2.4 : 1.2);
  ctx.wall(R(-0.1, LEN + 0.1, 2.8, 2.95), yc0, y1 + 1.1);
  ctx.wall(R(-0.15, 0, 0.2, 2.95), yc0, y1 + 1.1);
  ctx.wall(R(LEN, LEN + 0.15, 0.2, 2.95), yc0, y1 + 1.1);

  // ouverture dans le parapet au palier d'arrivée
  const topEven = (n - 1) % 2 === 0;
  const tl: [number, number] = topEven ? [9.5, LEN] : [0, 1.5];
  t.gaps[k][s].push([a0 + tl[0], a0 + tl[1]]);

  // ampoules nues aux paliers (une sur deux), lumière chaude et sale
  const bulb = hex(0xffb070);
  for (let i = 1; i <= n; i += 2) {
    const hb = y0 + 4 * i;
    const lp = i % 2 === 1 ? LEN - 0.8 : 0.8;
    ctx.box(R(lp - 0.15, lp + 0.15, 0, 0.25), hb + 2.2, hb + 2.5, { color: bulb, style: 5, emis: 2.5, solid: false, extra: ctx.rng.chance(0.3) ? 3 : 0, seed: ctx.rng.byte() });
  }
  const [bx, bz] = sidePoint(s, F, a0 + LEN / 2, 1.5);
  ctx.world.light(bx, y0 + 3, bz, bulb, 1.1, 10, ctx.rng.chance(0.3) ? ctx.rng.byte() + 1 : undefined);
  const [tx, tz] = sidePoint(s, F, a0 + (tl[0] + tl[1]) / 2, 1.5);
  ctx.world.light(tx, y1 + 2, tz, bulb, 0.9, 9);
  ctx.escapes.push({ s, F, a0, y0, y1 });
  return true;
}

/** Choisit quelques façades candidates pour des escaliers de secours. */
export function placeFireEscapes(ctx: Ctx, towers: Tower[]) {
  const { rng } = ctx;
  for (const t of towers) {
    const p = t.style === 3 ? 0.7 : 0.3;
    if (!rng.chance(p)) continue;
    const cands: { k: number; s: Side }[] = [];
    t.segs.forEach((seg, k) => {
      if (seg.y1 - seg.y0 > 84) return;
      for (const s of [0, 1, 2, 3] as Side[]) {
        if (s === t.eSide) continue;
        const [a0, a1] = alongRange(seg, s);
        if (a1 - a0 < LEN + 5) continue;
        if (k === 0) {
          if (t.room && t.room.side === s) continue;
          cands.push({ k, s });
        } else {
          const w = -outOf(s, faceCoord(seg, s), faceCoord(t.segs[k - 1], s));
          if (w >= 4.5) cands.push({ k, s });
        }
      }
    });
    let made = 0;
    for (let tries = 0; tries < 4 && made < (t.style === 3 ? 2 : 1) && cands.length; tries++) {
      const c = rng.pick(cands);
      const [a0, a1] = alongRange(t.segs[c.k], c.s);
      const a = snap(rng.range(a0 + 2, a1 - LEN - 2));
      if (fireEscape(ctx, t, c.k, c.s, a)) made++;
    }
  }
}
