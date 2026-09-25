import { BLOCKS, HALF, NEON, PITCH, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import type { Tower } from './city';
import { dark, type Ctx } from './ctx';
import { SIDES, SV, alongRange, faceCoord, sidePoint, sideRect, type Rect, type Side } from './geom';
import type { MetroLine } from './metro';

const CAR_COLS: RGB[] = [hex(0xd8d8e0), hex(0x1b1d24), hex(0x8a1030), hex(0x1d4fa0), hex(0x2a2a2a), hex(0x5a5f66), hex(0x3a2a4a), hex(0x0f5f4f), hex(0xb0a080)];

/**
 * Petit mobilier et détails de rue : voitures garées, abribus, armoires électriques,
 * cabines, vélos, kiosques, plaques de rue, caméras, distributeurs, feux piétons
 * et piétons qui traversent au feu.
 */
export function streetExtras(ctx: Ctx, blocks: Rect[], towers: Tower[], metro: MetroLine[]) {
  const { rng } = ctx;
  const onMetro = (s: Side, B: Rect) => {
    const axis = s === 0 || s === 2 ? 0 : 1; // la rue longe x pour les faces nord/sud
    const c = faceCoord(B, s) + (s === 0 || s === 3 ? -9 : 9);
    return metro.some((l) => l.axis === axis && Math.abs(l.c - c) < 1);
  };
  for (const B of blocks) {
    for (const s of SIDES) {
      const F = faceCoord(B, s);
      const [a0, a1] = alongRange(B, s);
      const out = Math.atan2(SV[s][0], SV[s][1]); // regard vers la chaussée
      // --- voitures garées le long du trottoir ---
      for (let p = a0 + 7 + snap(rng.range(0, 6)); p < a1 - 12; p += snap(rng.range(5.5, 16))) {
        if (!rng.chance(0.55)) continue;
        parkedCar(ctx, s, F, p, onMetro(s, B));
      }
      // --- abribus ---
      if (rng.chance(0.2)) {
        const a = snap(rng.range(a0 + 9, a1 - 16));
        const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
        if (ctx.free(R(-0.3, 6, -3.5, -0.3), 0.55, 3.3)) {
          const col = rng.pick(NEON);
          ctx.box(R(0, 5, -3.3, -3.2), 0.5, 2.8, { color: col, glass: true });
          ctx.box(R(-0.1, 5.1, -3.45, -0.95), 2.8, 3.0, { color: hex(0x22252c) });
          ctx.box(R(-0.1, 5.1, -1.05, -0.95), 2.72, 2.8, { color: col, style: STYLE.EMISSIVE, emis: 2.4, solid: false, noRain: true });
          for (const q of [0, 4.85]) ctx.box(R(q, q + 0.15, -3.35, -3.15), 0.5, 2.8, { color: hex(0x22252c) });
          ctx.box(R(0, 0.15, -3.1, -1.3), 0.7, 2.6, { color: hex(0xfff0e0), style: STYLE.SHOP, emis: 2.2, seed: rng.byte() });
          ctx.box(R(1.2, 4.2, -3.15, -2.65), 0.5, 0.95, { color: hex(0x3a3e46) });
          ctx.box(R(5.5, 5.7, -0.7, -0.5), 0.5, 2.6, { color: hex(0x1a1c20) });
          ctx.box(R(5.35, 5.85, -0.75, -0.45), 2.6, 3.3, { color: col, style: STYLE.EMISSIVE, emis: 2.6, solid: false });
          const [lx, lz] = sidePoint(s, F, a + 2.5, -2.2);
          ctx.world.light(lx, 2.5, lz, hex(0xd8ecff), 1.2, 9);
          for (let k = 0; k < 3; k++)
            { const [x, z] = sidePoint(s, F, a + 1.6 + k * 1.0, -2.9); ctx.seat(rng.chance(0.45), x, 0.95, z, out, rng.chance(0.4) ? 7 : 1); }
          for (let k = 0; k < rng.int(0, 3); k++) {
            const [x, z] = sidePoint(s, F, a + rng.range(0.5, 4.5), -1.6);
            if (rng.chance(0.5)) ctx.pose(x, 0.5, z, out + rng.range(-0.8, 0.8), 5);
            else ctx.idle(x, 0.5, z, out + rng.range(-0.8, 0.8), rng.chance(0.4));
          }
        }
      }
      // --- armoire électrique (stickers, voyant) ---
      if (rng.chance(0.3)) {
        const a = snap(rng.range(a0 + 6, a1 - 7));
        const r = sideRect(s, F, a, a + 1.2, -3.95, -3.45);
        if (ctx.free(sideRect(s, F, a - 0.2, a + 1.4, -3.95, -3.2), 0.55, 1.9)) {
          ctx.box(r, 0.5, 1.9, { color: rng.pick([hex(0x3a4a3e), hex(0x4a4a48), hex(0x2e3a48)]), seed: rng.byte() });
          ctx.box(sideRect(s, F, a + 0.2, a + 0.3, -3.45, -3.43), 1.6, 1.7, { color: hex(0x40ff70), style: STYLE.EMISSIVE, emis: 3, extra: 1, seed: rng.byte(), solid: false });
        }
      }
      // --- cabine réseau (écran, occupant) ---
      if (rng.chance(0.12)) {
        const a = snap(rng.range(a0 + 6, a1 - 8));
        const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
        if (ctx.free(R(-0.2, 1.6, -3.95, -2.3), 0.55, 2.8)) {
          const col = rng.pick([hex(0x00e5ff), hex(0xff2a9d), hex(0xa64dff)]);
          for (const [p0, p1] of [[0, 0.1], [1.3, 1.4]]) ctx.box(R(p0, p1, -3.9, -2.5), 0.5, 2.6, { color: hex(0x202228) });
          ctx.box(R(0.1, 1.3, -3.9, -3.8), 0.5, 2.6, { color: hex(0x202228) });
          ctx.box(R(0, 1.4, -3.9, -2.5), 2.6, 2.75, { color: hex(0x202228) });
          ctx.box(R(0.1, 1.3, -2.55, -2.5), 2.45, 2.6, { color: col, style: STYLE.EMISSIVE, emis: 3, solid: false });
          ctx.box(R(0.25, 1.15, -3.8, -3.75), 1.2, 1.9, { color: col, style: STYLE.EMISSIVE, emis: 1.8, extra: 2, seed: rng.byte(), solid: false });
          for (const [p0, p1] of [[0.1, 0.14], [1.26, 1.3]]) ctx.box(R(p0, p1, -3.8, -2.55), 0.9, 2.45, { color: col, glass: true });
          const [lx, lz] = sidePoint(s, F, a + 0.7, -3.3);
          ctx.world.light(lx, 2.0, lz, col, 0.8, 5);
          if (rng.chance(0.5)) ctx.pose(lx, 0.5, lz, out + Math.PI, 10);
        }
      }
      // --- vélos attachés à un arceau ---
      if (rng.chance(0.2)) {
        const a = snap(rng.range(a0 + 6, a1 - 9));
        if (ctx.free(sideRect(s, F, a - 0.3, a + 3.3, -3.95, -2.1), 0.55, 1.3)) {
          ctx.box(sideRect(s, F, a, a + 3, -3.75, -3.65), 0.5, 1.0, { color: hex(0x6a6e74), solid: false });
          for (let k = 0; k < rng.int(1, 4); k++) {
            const q = a + 0.4 + k * 0.7;
            const c = rng.pick([hex(0xb01842), hex(0x1d5fbf), hex(0xe0a020), hex(0xd8d8e0), hex(0x2a8a4a), hex(0x111111)]);
            for (const [o0, o1] of [[-3.9, -3.3], [-2.8, -2.2]]) ctx.box(sideRect(s, F, q, q + 0.06, o0, o1), 0.5, 1.1, { color: hex(0x111111), solid: false });
            ctx.box(sideRect(s, F, q, q + 0.08, -3.6, -2.5), 0.95, 1.05, { color: c, solid: false });
            ctx.box(sideRect(s, F, q - 0.05, q + 0.13, -2.6, -2.45), 1.05, 1.4, { color: c, solid: false });
            ctx.box(sideRect(s, F, q - 0.25, q + 0.33, -2.55, -2.45), 1.4, 1.45, { color: hex(0x222222), solid: false });
            ctx.box(sideRect(s, F, q - 0.05, q + 0.13, -3.45, -3.25), 1.1, 1.2, { color: hex(0x1a1a1a), solid: false });
          }
        }
      }
      // --- kiosque (nouilles, journaux) ---
      if (rng.chance(0.1)) {
        const a = snap(rng.range(a0 + 8, a1 - 11));
        const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
        if (ctx.free(R(-0.3, 3, -3.95, -0.7), 0.55, 3.8)) {
          const col = rng.pick(NEON);
          const body = rng.pick([hex(0x2a3a4a), hex(0x4a2a2a), hex(0x2a4a3a)]);
          ctx.box(R(0, 2.6, -3.9, -3.7), 0.5, 2.6, { color: body });
          ctx.box(R(0, 0.2, -3.7, -1.6), 0.5, 2.6, { color: body });
          ctx.box(R(2.4, 2.6, -3.7, -1.6), 0.5, 2.6, { color: body });
          ctx.box(R(0.2, 2.4, -1.8, -1.6), 0.5, 1.2, { color: body });
          ctx.box(R(0.2, 2.4, -2.0, -1.6), 1.2, 1.3, { color: hex(0x9a8a70) });
          ctx.box(R(-0.2, 2.8, -3.9, -1.0), 2.6, 2.8, { color: dark(col, 0.4) });
          ctx.box(R(-0.2, 2.8, -1.1, -1.0), 2.45, 2.6, { color: col, style: STYLE.EMISSIVE, emis: 2.4, solid: false, noRain: true });
          ctx.box(R(0.3, 2.3, -3.5, -3.3), 2.8, 3.8, { color: col, style: STYLE.SIGN, emis: 2.8, seed: rng.byte(), extra: rng.int(0, 2) });
          for (let k = 0; k < 5; k++) ctx.box(R(0.3 + k * 0.42, 0.6 + k * 0.42, -3.7, -3.5), 1.4, 1.4 + rng.pick([0.3, 0.45]), { color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 0.9, solid: false });
          const [kx, kz] = sidePoint(s, F, a + 1.3, -2.8);
          ctx.world.light(kx, 2.2, kz, hex(0xffc890), 1.3, 8);
          ctx.pose(kx, 0.5, kz, out, 4);
          { const [fx, fz] = sidePoint(s, F, a + 1.3, -1.0); ctx.interact('food', fx, 0.5, fz, out + Math.PI); }
          if (rng.chance(0.5)) ctx.world.emitSteam(kx, 1.5, kz + 0.1, 0.5, 3, 8, hex(0x6a5a50));
          if (rng.chance(0.6)) { const [cx, cz] = sidePoint(s, F, a + rng.range(0.5, 2), -0.9); ctx.pose(cx, 0.5, cz, out + Math.PI, 10); }
        }
      }
      // --- plaque de rue au coin ---
      {
        const a = a1 - 0.8;
        const pole = sideRect(s, F, a, a + 0.2, -0.75, -0.55);
        if (ctx.free(pole, 0.5, 3.8)) {
          ctx.box(pole, 0.5, 3.4, { color: hex(0x1a1c20) });
          ctx.box(sideRect(s, F, a - 1.7, a + 0.2, -0.68, -0.62), 3.0, 3.4, { color: hex(0x1a4a8a), style: STYLE.EMISSIVE, emis: 0.8, solid: false });
          ctx.box(sideRect(s, F, a - 1.6, a + 0.1, -0.7, -0.6), 3.15, 3.25, { color: hex(0xd8e8ff), style: STYLE.EMISSIVE, emis: 1.2, solid: false });
        }
      }
    }
  }

  // --- façades : caméras de surveillance, distributeurs de billets ---
  for (const t of towers) {
    const seg = t.segs[0];
    for (const s of t.streetSides) {
      const F = faceCoord(seg, s);
      const [a0, a1] = alongRange(seg, s);
      if (a1 - a0 < 6) continue;
      if (rng.chance(0.3)) {
        const a = rng.chance(0.5) ? a0 + 0.8 : a1 - 1.3;
        const y = snap(rng.range(5.5, 7));
        if (ctx.free(sideRect(s, F, a - 0.2, a + 0.7, 0, 1.0), y - 0.3, y + 0.4)) {
          ctx.box(sideRect(s, F, a + 0.1, a + 0.3, 0, 0.5), y, y + 0.15, { color: hex(0x2a2c30), solid: false, noRain: true });
          ctx.box(sideRect(s, F, a - 0.05, a + 0.45, 0.4, 0.95), y - 0.25, y + 0.05, { color: hex(0xd0d2d6), solid: false, noRain: true });
          ctx.box(sideRect(s, F, a + 0.15, a + 0.25, 0.95, 0.97), y - 0.15, y - 0.08, { color: hex(0xff2020), style: STYLE.EMISSIVE, emis: 4, extra: 1, seed: rng.byte(), solid: false });
        }
      }
      if (rng.chance(0.14)) {
        const a = snap(rng.range(a0 + 1, a1 - 2));
        const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
        if (ctx.free(R(-0.2, 1.2, 0, 1.4), 0.55, 2.6)) {
          const col = rng.pick([hex(0x2aff9a), hex(0x3d9bff), hex(0xffb000)]);
          ctx.box(R(0, 1, 0, 0.35), 0.5, 2.3, { color: hex(0x2a2e36) });
          ctx.box(R(0.2, 0.8, 0.35, 0.37), 1.45, 1.8, { color: hex(0x9ae8ff), style: STYLE.EMISSIVE, emis: 2.2, extra: 2, seed: rng.byte(), solid: false });
          ctx.box(R(0.25, 0.75, 0.35, 0.45), 1.1, 1.3, { color: hex(0x55585e), solid: false });
          ctx.box(R(-0.1, 1.1, 0, 0.5), 2.3, 2.55, { color: col, style: STYLE.EMISSIVE, emis: 2.6, solid: false, noRain: true });
          const [x, z] = sidePoint(s, F, a + 0.5, 1.0);
          ctx.world.light(x, 2.0, z, col, 0.9, 6);
          if (rng.chance(0.45)) ctx.pose(x, 0.5, z, Math.atan2(-SV[s][0], -SV[s][1]), 10);
        }
      }
    }
  }

  // --- passages piétons : feux piétons, piétons qui attendent puis traversent ---
  for (let i = 1; i < BLOCKS; i++)
    for (let j = 1; j < BLOCKS; j++) {
      const cx = -HALF + i * PITCH, cz = -HALF + j * PITCH;
      const central = Math.max(Math.abs(cx), Math.abs(cz)) < HALF * 0.55;
      for (const axis of [0, 1] as const)
        for (const sg of [-1, 1]) {
          if (!rng.chance(central ? 0.6 : 0.4)) continue;
          // axis 0 : on traverse la rue orientée z en marchant le long de x
          const X = (along: number, lat: number) => (axis === 0 ? cx + along : cx + sg * 11.3 + lat);
          const Z = (along: number, lat: number) => (axis === 0 ? cz + sg * 11.3 + lat : cz + along);
          const rr = (a0: number, a1: number, l0: number, l1: number): Rect => {
            const xa = X(a0, l0), xb = X(a1, l1), za = Z(a0, l0), zb = Z(a1, l1);
            return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) };
          };
          if (!ctx.free(rr(-9, 9, -0.6, 0.6), 0.05, 2)) continue;
          if (!ctx.free(rr(9.5, 11.6, -1.4, 1.4), 0.55, 2) || !ctx.free(rr(-11.6, -9.5, -1.4, 1.4), 0.55, 2)) continue;
          const lampFar = sg * 2.1; // poteau juste au-delà de la bande (côté opposé au carrefour)
          for (const e of [-1, 1]) {
            const pole = rr(e * 9.35, e * 9.55, lampFar - 0.1, lampFar + 0.1);
            if (!ctx.free(pole, 0.5, 3)) continue;
            ctx.box(pole, 0.5, 2.9, { color: hex(0x1a1c20) });
            ctx.box(rr(e * 9.3, e * 9.6, lampFar - 0.15, lampFar + 0.15), 2.3, 2.9, { color: hex(0x111214) });
            const walk = axis === 0 ? 12 : 14;
            ctx.box(rr(e * 9.25, e * 9.3, lampFar - 0.1, lampFar + 0.1), 2.62, 2.82, { color: hex(0xff4a1a), style: STYLE.EMISSIVE, emis: 4, extra: walk + 1, solid: false });
            ctx.box(rr(e * 9.25, e * 9.3, lampFar - 0.1, lampFar + 0.1), 2.36, 2.56, { color: hex(0xc8fff0), style: STYLE.EMISSIVE, emis: 4, extra: walk, solid: false });
          }
          const n = rng.int(1, central ? 4 : 2);
          ctx.peds.cross.push(axis === 0 ? { cx, cz: cz + sg * 11.3, axis, n } : { cx: cx + sg * 11.3, cz, axis, n });
        }
    }
}

function parkedCar(ctx: Ctx, s: Side, F: number, p: number, metroRoad: boolean) {
  const { rng } = ctx;
  const L = 4.4;
  const flip = rng.chance(0.5);
  const R = (a0: number, a1: number, o0: number, o1: number) => {
    const q0 = flip ? L - a1 : a0, q1 = flip ? L - a0 : a1;
    return sideRect(s, F, p + q0, p + q1, o0, o1);
  };
  if (!ctx.free(R(-0.3, L + 0.3, 0.2, 2.3), 0.05, 1.8)) return;
  if (metroRoad && !ctx.free(R(-1, L + 1, 0, 3), 0.05, 4)) return;
  const kind = rng.next();
  const [cx, cz] = sidePoint(s, F, p + 2, 1);
  const did = ctx.districts.idAt(cx, cz);
  const wreckP = did === 'fonds' ? 0.3 : did === 'riche' ? 0 : did === 'port' ? 0.15 : 0.07;
  const taxi = kind < 0.12, wreck = kind > 1 - wreckP, van = !taxi && !wreck && kind > (did === 'port' ? 0.5 : 0.8);
  const col = taxi ? hex(0xe0b020) : wreck ? rng.pick([hex(0x4a2a1a), hex(0x3a3a34), hex(0x2a2a2e)]) : did === 'riche' ? rng.pick([hex(0xe8e8ec), hex(0x0c0c10), hex(0x9a9ca4), hex(0x3a2a1a)]) : rng.pick(CAR_COLS);
  const y0 = wreck ? 0.12 : 0.3;
  const top = van ? 2.3 : 1.0;
  ctx.box(R(0, L, 0.35, 2.15), y0, top, { color: col, seed: rng.byte() });
  if (!van) ctx.box(R(1.2, 3.3, 0.5, 2.0), top, top + 0.5, { color: wreck ? hex(0x2a3038) : hex(0x0a0c12) });
  else ctx.box(R(3.6, 4.42, 0.55, 1.95), 1.3, 2.0, { color: hex(0x0a0c12), solid: false });
  if (!wreck) for (const a of [0.6, 3.2]) for (const [o0, o1] of [[0.25, 0.4], [2.1, 2.25]]) ctx.box(R(a, a + 0.65, o0, o1), 0, 0.62, { color: hex(0x0c0c0e), solid: false });
  ctx.box(R(L, L + 0.04, 0.5, 0.9), 0.6, 0.78, { color: hex(0xf4f8ff), style: STYLE.EMISSIVE, emis: 0.25, solid: false });
  ctx.box(R(L, L + 0.04, 1.6, 2.0), 0.6, 0.78, { color: hex(0xf4f8ff), style: STYLE.EMISSIVE, emis: 0.25, solid: false });
  ctx.box(R(-0.04, 0, 0.45, 2.05), 0.62, 0.78, { color: hex(0xff1a1a), style: STYLE.EMISSIVE, emis: wreck ? 0 : 0.7, solid: false });
  if (taxi) ctx.box(R(2.0, 2.6, 0.9, 1.6), top + 0.5, top + 0.75, { color: hex(0xffe14a), style: STYLE.EMISSIVE, emis: 2.4, solid: false });
  if (!wreck && !taxi && rng.chance(0.12)) {
    // feux de détresse
    for (const [a0, a1] of [[-0.04, 0], [L, L + 0.04]]) for (const [o0, o1] of [[0.35, 0.55], [1.95, 2.15]])
      ctx.box(R(a0, a1, o0, o1), 0.62, 0.8, { color: hex(0xffa000), style: STYLE.EMISSIVE, emis: 3, extra: 1, seed: 17, solid: false });
  }
  if (wreck) {
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, L), o = rng.range(0.2, 2.2);
      ctx.box(R(a, a + 0.4, o, o + 0.4), 0, 0.25, { color: rng.pick([hex(0x111214), hex(0x6a4a2a)]), solid: false });
    }
  }
  void dark;
}
