import { NEON, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import type { Tower } from './city';
import { dark, type Ctx } from './ctx';
import { SIDES, SV, alongRange, faceCoord, inset, overlaps, sidePoint, sideRect, subtractIntervals, type Rect, type Side } from './geom';
import { bamboo, planter, trashPile, tree } from './props';

export const FLOOR_H = 4.5;
export const FLOOR_KINDS = ['Bureaux', 'Appartements', 'Penthouse', 'Squat'];

export interface Floor { k: number; y: number; kind: number }

const WARM = hex(0xffd6a0), COOL = hex(0xd8f0ff);

/**
 * Étage aménagé dans le segment k d'une tour, entre y et y + FLOOR_H : façade
 * vitrée réelle (meneaux, allèges, vitrages), noyau central, mobilier, occupants.
 * La porte d'accès se trouve face à la passerelle de l'ascenseur (côté t.eSide).
 */
export function buildFloor(ctx: Ctx, t: Tower, f: Floor, along: number) {
  const { rng } = ctx;
  const seg = t.segs[f.k];
  const y = f.y, top = y + FLOOR_H;
  const kind = f.kind;
  const wallCol = kind === 3 ? hex(0x2a2826) : kind === 2 ? hex(0xcfc8bd) : hex(0x3a3a42);
  const glassCol = kind === 2 ? hex(0xffe2b0) : hex(0x9fd8ff);

  // Façade : meneaux tous les 3 m, allège, vitrage, retombée ; porte côté ascenseur
  for (const s of SIDES) {
    const F = faceCoord(seg, s);
    let [a0, a1] = alongRange(seg, s);
    if (s === 1 || s === 3) { a0 += 0.4; a1 -= 0.4; }
    const door: [number, number][] = s === t.eSide ? [[along - 1.5, along + 1.5]] : [];
    for (let p = a0; p < a1 - 0.2; p += 3) {
      const m1 = Math.min(p + 0.4, a1);
      if (!door.some(([d0, d1]) => m1 > d0 && p < d1)) ctx.box(sideRect(s, F, p, m1, -0.4, 0), y, top, { color: t.color, seed: 3 });
      for (const [q0, q1] of subtractIntervals([m1, Math.min(p + 3, a1)], door)) {
        ctx.box(sideRect(s, F, q0, q1, -0.4, 0), y, y + 0.9, { color: t.color, seed: 4 });
        if (kind === 3 && rng.chance(0.3)) { /* vitre cassée */ } else ctx.box(sideRect(s, F, q0, q1, -0.25, -0.15), y + 0.9, y + 3.7, { color: glassCol, glass: true });
        ctx.box(sideRect(s, F, q0, q1, -0.4, 0), y + 3.7, top, { color: t.color, seed: 5 });
      }
    }
    for (const [d0, d1] of door) ctx.box(sideRect(s, F, d0, d1, -0.4, 0), y + 3.1, top, { color: t.color, seed: 6 });
    // le décor de façade ne doit pas masquer les baies
    ctx.reserve(sideRect(s, F, a0, a1, 0, 1.2), y - 0.5, top + 0.5);
  }

  // Sol, noyau, plafond lumineux
  const inner = inset(seg, 0.4);
  const floorStyle = kind === 1 ? STYLE.DECK : STYLE.SOLID;
  const floorCol = kind === 0 ? hex(0x3a3c44) : kind === 2 ? hex(0xd8d4cc) : kind === 3 ? hex(0x2e2c2a) : hex(0x4a3020);
  ctx.box(inner, y, y + 0.05, { color: floorCol, style: floorStyle, seed: rng.byte(), noRain: true });
  const iw = inner.x1 - inner.x0, id = inner.z1 - inner.z0;
  const D = Math.min(7, Math.floor(Math.min(iw, id) / 2 - 3));
  const core = iw > 18 && id > 18 ? inset(inner, D) : null;
  if (core) {
    ctx.box(core, y + 0.05, top, { color: wallCol, seed: rng.byte() });
    if (kind !== 3) {
      // tableaux / écrans sur le noyau
      for (const s of SIDES) {
        const F = faceCoord(core, s);
        const [c0, c1] = alongRange(core, s);
        if (c1 - c0 > 6 && rng.chance(0.6)) {
          const a = snap((c0 + c1) / 2 - 1.5);
          ctx.box(sideRect(s, F, a, a + 3, 0, 0.1), y + 1.2, y + 3.0, { color: hex(0x111111), style: STYLE.SCREEN, emis: 1.6, seed: rng.byte() });
        }
      }
    }
  }
  const lightCol = kind === 0 ? COOL : WARM;
  for (let x = inner.x0 + 2; x < inner.x1 - 1; x += 4)
    for (let z = inner.z0 + 2; z < inner.z1 - 1; z += 4) {
      const r = { x0: x, x1: x + 1.2, z0: z, z1: z + 0.3 };
      if (core && overlaps(r, core, 0.2)) continue;
      const broken = kind === 3 && rng.chance(0.5);
      ctx.box(r, top - 0.1, top, { color: lightCol, style: STYLE.EMISSIVE, emis: broken ? 0.1 : kind === 0 ? 1.4 : 1.0, extra: kind === 3 && rng.chance(0.5) ? 3 : 0, seed: rng.byte(), solid: false });
    }

  // Emplacements le long de chaque façade (anneau entre façade et noyau)
  const depth = core ? D : Math.min(6, Math.min(iw, id) / 2 - 1);
  const slots: { s: Side; F: number; a: number }[] = [];
  for (const s of SIDES) {
    const F = faceCoord(inner, s);
    const [a0, a1] = alongRange(inner, s);
    for (let a = a0 + Math.min(depth, 3) + 0.5; a < a1 - Math.min(depth, 3) - 3; a += 3.5) slots.push({ s, F, a });
  }
  const face = (s: Side) => Math.atan2(SV[s][0], SV[s][1]);     // regard vers l'extérieur
  const faceIn = (s: Side) => Math.atan2(-SV[s][0], -SV[s][1]); // regard vers l'intérieur
  const clear = (r: Rect, h = 1.5) => ctx.free(r, y + 0.1, y + h) && !(core && overlaps(r, core));
  const doorSide = t.eSide as Side;
  const nearDoor = (s: Side, a: number) => s === doorSide && Math.abs(a - along) < 4;

  for (const { s, F, a } of slots) {
    if (nearDoor(s, a)) continue;
    const R = (p0: number, p1: number, o0: number, o1: number) => sideRect(s, F, a + p0, a + p1, o0, o1);
    const roll = rng.next();
    if (kind === 0) {
      // bureaux : postes de travail face à la vitre
      const desk = R(0, 1.8, -2.2, -1.4);
      if (!clear(desk)) continue;
      ctx.box(desk, y, y + 0.75, { color: hex(0xb8b4ac) });
      ctx.box(R(0.5, 1.3, -1.6, -1.5), y + 0.75, y + 1.25, { color: rng.pick([hex(0x40d0ff), hex(0x7affc0), hex(0xff9ad5)]), style: STYLE.EMISSIVE, emis: 1.6, solid: false });
      ctx.box(R(0.65, 1.15, -2.8, -2.3), y, y + 0.5, { color: hex(0x1a1a1e) });
      if (roll < 0.6) { const [x, z] = sidePoint(s, F, a + 0.9, -2.55); ctx.sit(x, y + 0.5, z, face(s), 7); }
      if (roll > 0.85) { const [x, z] = sidePoint(s, F, a + 3, -3); ctx.group(x, y, z, 2); }
    } else if (kind === 1 || kind === 2) {
      const lux = kind === 2;
      if (roll < 0.3) {
        // salon : canapé + écran mural + table basse
        const sofa = R(0, 3, -(depth - 0.2), -(depth - 1.1));
        if (!clear(R(0, 3, -(depth - 0.2), -1))) continue;
        const velvet = lux ? rng.pick([hex(0x4a1a3a), hex(0x1a2a4a), hex(0xd8cfc0)]) : rng.pick([hex(0x5a4a3a), hex(0x2a3a4a), hex(0x4a2a2a)]);
        ctx.box(R(-0.3, 3.3, -(depth - 0.1), -(depth - 3.0)), y + 0.05, y + 0.08, { color: lux ? rng.pick([hex(0x6a2a3a), hex(0x2a3a5a), hex(0xb8a88a)]) : rng.pick([hex(0x4a3a2a), hex(0x3a2a3a)]), solid: false });
        ctx.box(sofa, y, y + 0.45, { color: velvet });
        ctx.box(R(0, 3, -(depth - 0.2), -(depth - 0.45)), y + 0.45, y + 1.0, { color: velvet });
        ctx.box(R(1, 2, -(depth - 1.6), -(depth - 2.4)), y, y + 0.4, { color: lux ? hex(0xe8e4dc) : hex(0x5a3a22) });
        { const [x, z] = sidePoint(s, F, a + 0.8, -(depth - 0.7)); ctx.seat(rng.chance(0.6), x, y + 0.45, z, face(s)); }
        { const [x, z] = sidePoint(s, F, a + 2.2, -(depth - 0.7)); ctx.seat(rng.chance(0.4), x, y + 0.45, z, face(s)); }
        const [lx, lz] = sidePoint(s, F, a + 1.5, -(depth - 1.5));
        ctx.world.light(lx, y + 2.6, lz, WARM, 1.2, 9);
      } else if (roll < 0.5) {
        // chambre : lit, lampe de chevet
        const bed = R(0, 2, -3.2, -1.2);
        if (!clear(bed)) continue;
        ctx.box(bed, y, y + 0.5, { color: lux ? hex(0xeae6de) : rng.pick([hex(0x6a3a4a), hex(0x3a4a6a), hex(0x8a8070)]) });
        ctx.box(R(0.2, 1.8, -3.2, -2.8), y + 0.5, y + 0.7, { color: hex(0xf0ece4) });
        ctx.box(R(2.2, 2.6, -3.2, -2.8), y, y + 0.6, { color: hex(0x3a2a1e) });
        ctx.box(R(2.3, 2.5, -3.1, -2.9), y + 0.6, y + 0.9, { color: WARM, style: STYLE.EMISSIVE, emis: 2.5, solid: false });
      } else if (roll < 0.65) {
        // cuisine le long du noyau
        const k = R(0, 3.5, -(depth - 0.1), -(depth - 0.8));
        if (!clear(k, 1.2)) continue;
        ctx.box(k, y, y + 0.95, { color: lux ? hex(0x1c1a20) : hex(0xc8c4bc) });
        ctx.box(R(0.3, 1, -(depth - 0.2), -(depth - 0.4)), y + 0.95, y + 1.3, { color: hex(0x9aa0a8), solid: false });
        const [x, z] = sidePoint(s, F, a + 1.5, -(depth - 1.4));
        if (rng.chance(0.5)) ctx.pose(x, y, z, faceIn(s), 4);
      } else if (roll < 0.8) {
        if (lux && rng.chance(0.5)) {
          // piano à queue (penthouse)
          const pn = R(0, 2.2, -3.4, -1.8);
          if (clear(pn)) { ctx.box(pn, y + 0.6, y + 1.0, { color: hex(0x0a0a0c) }); ctx.box(R(0.2, 0.4, -3.2, -2.0), y, y + 0.6, { color: hex(0x0a0a0c) }); }
        } else {
          const [x, z] = sidePoint(s, F, a + 1, -1.2);
          if (clear({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4 }, 3)) {
            if (lux) tree(ctx, x, z, y + 0.05, 0.75, rng.chance(0.3));
            else if (rng.chance(0.5)) bamboo(ctx, x, z, y + 0.05);
            else planter(ctx, { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }, y, lux);
          }
        }
      } else {
        const [x, z] = sidePoint(s, F, a + 1.5, -1.3);
        if (rng.chance(0.4) && ctx.free({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 }, y + 0.1, y + 1.8)) ctx.pose(x, y, z, face(s), rng.chance(0.4) ? 5 : 0);
      }
    } else {
      // squat : matelas, détritus, fût enflammé, occupants
      if (roll < 0.35) {
        const m = R(0, 2, -2.6, -1.6);
        if (!clear(m, 0.6)) continue;
        ctx.box(m, y, y + 0.22, { color: rng.pick([hex(0x4a4238), hex(0x3a3a48), hex(0x5a3a3a)]) });
        if (rng.chance(0.5)) { const [x, z] = sidePoint(s, F, a + 0.4, -2.1); ctx.pose(x, y + 0.22, z, face(s) + Math.PI / 2, 9); }
      } else if (roll < 0.7) {
        if (clear(R(-0.5, 2.5, -2.5, -0.5), 1)) trashPile(ctx, s, F, a + 0.5, -2.2, y);
      } else if (roll < 0.85) {
        const [x, z] = sidePoint(s, F, a + 1, -2.4);
        const b = { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
        if (!clear({ x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6 }, 1.2)) continue;
        ctx.box(b, y, y + 1.0, { color: hex(0x3a2a22) });
        ctx.box(inset(b, 0.1), y + 1.0, y + 1.25, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
        ctx.world.light(x, y + 1.8, z, hex(0xff7a30), 2.2, 11, rng.byte() + 1);
        ctx.world.emitSteam(x, y + 1.3, z, 0.7, 3, 10, hex(0x3a2a24));
        ctx.smoker(x + 1.1, y, z, -Math.PI / 2);
        ctx.seat(rng.chance(0.6), x - 1.1, y + 0.3, z, Math.PI / 2);
      }
    }
  }
  // îlot central (plateaux sans noyau) : grande table, chaises, suspension ; ou bibliothèques contre le noyau
  if (kind !== 3) {
    const cxm = (inner.x0 + inner.x1) / 2, czm = (inner.z0 + inner.z1) / 2;
    if (!core) {
      const tb = { x0: cxm - 1.8, x1: cxm + 1.8, z0: czm - 0.7, z1: czm + 0.7 };
      if (ctx.free(inset(tb, -1), y + 0.1, y + 1.5)) {
        ctx.box(tb, y + 0.7, y + 0.8, { color: kind === 0 ? hex(0xc8c4bc) : kind === 2 ? hex(0x1a1418) : hex(0x5a3a22) });
        ctx.box({ x0: cxm - 0.2, x1: cxm + 0.2, z0: czm - 0.2, z1: czm + 0.2 }, y, y + 0.7, { color: hex(0x2a2a2a) });
        for (let i = 0; i < 3; i++)
          for (const sg of [-1, 1]) {
            const cx = cxm - 1.2 + i * 1.2, cz = czm + sg * 1.05;
            ctx.box({ x0: cx - 0.22, x1: cx + 0.22, z0: cz - 0.22, z1: cz + 0.22 }, y, y + 0.45, { color: hex(0x2a2a30) });
            ctx.seat(rng.chance(0.4), cx, y + 0.45, cz, sg > 0 ? Math.PI : 0);
          }
        ctx.box({ x0: cxm - 0.5, x1: cxm + 0.5, z0: czm - 0.2, z1: czm + 0.2 }, top - 1.4, top - 1.2, { color: WARM, style: STYLE.EMISSIVE, emis: 2.5, solid: false });
        ctx.world.light(cxm, top - 1.6, czm, WARM, 1.4, 10);
      }
    } else {
      for (const s of SIDES) {
        const F = faceCoord(core, s);
        const [c0, c1] = alongRange(core, s);
        if (c1 - c0 < 8 || !rng.chance(0.6)) continue;
        const a = snap(c0 + 1);
        const r = sideRect(s, F, a, a + 2.5, 0, 0.45);
        if (!ctx.free(r, y + 0.1, y + 2.2)) continue;
        ctx.box(r, y, y + 2.2, { color: hex(0x3a2a1e) });
        for (let k = 0; k < 4; k++)
          ctx.box(sideRect(s, F, a + 0.1, a + 2.4, 0.05, 0.4), y + 0.35 + k * 0.5, y + 0.45 + k * 0.5, { color: rng.pick([hex(0x8a3a2a), hex(0x2a4a6a), hex(0xc8b070), hex(0x3a6a3a)]), solid: false });
      }
    }
  }
  // lumières d'ambiance réparties
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  const off = core ? D / 2 + (core.x1 - core.x0) / 2 : 0;
  for (const s of SIDES) {
    const [lx, lz] = [cx + SV[s][0] * (off || (inner.x1 - inner.x0) / 4), cz + SV[s][1] * (off || (inner.z1 - inner.z0) / 4)];
    ctx.world.light(lx, top - 1, lz, kind === 3 ? hex(0xb8ffcf) : lightCol, kind === 3 ? 0.9 : 1.3, 14, kind === 3 ? rng.byte() + 1 : undefined);
  }
  void NEON; void dark;
  return { x: 0, y, z: 0 };
}

/** Choix des étages aménagés pour une tour à ascenseur. */
export function planFloors(ctx: Ctx, t: Tower, luxY: number): Floor[] {
  const { rng } = ctx;
  if (t.eSide < 0 || !rng.chance(0.65)) return [];
  const out: Floor[] = [];
  const n = t.H > 250 ? 2 : 1;
  for (let tries = 0; tries < 8 && out.length < n; tries++) {
    const k = rng.int(0, t.segs.length - 1);
    const seg = t.segs[k];
    const lo = Math.ceil((seg.y0 + 12 - 0.5) / 12), hi = Math.floor((seg.y1 - 12 - 0.5) / 12);
    if (hi < lo) continue;
    const y = 0.5 + 12 * rng.int(lo, hi);
    if (out.some((f) => Math.abs(f.y - y) < 12)) continue;
    const kind = y >= luxY ? 2 : y < 60 && rng.chance(0.5) ? 3 : rng.chance(0.5) ? 0 : 1;
    out.push({ k, y, kind });
  }
  return out;
}

export const floorColor = (kind: number): RGB => (kind === 0 ? COOL : kind === 3 ? hex(0xb8ffcf) : WARM);
