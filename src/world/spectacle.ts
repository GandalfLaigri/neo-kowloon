import { BLOCKS, CLOUD_Y, HALF, NEON, PITCH, ROAD, SIDEWALK, STYLE, hex } from '../config';
import { snap } from '../rng';
import type { Basement, Plaza } from './basements';
import type { Tower } from './city';
import type { Ctx } from './ctx';
import { SV, faceCoord, inset, type Rect, type Side } from './geom';
import type { MetroLine } from './metro';

/**
 * Projecteur de toit (balaye le ciel). Posé avant l'encombrement des toits.
 */
export function placeSearchlight(ctx: Ctx, t: Tower) {
  const { rng } = ctx;
  const top = t.segs[t.segs.length - 1];
  const y = top.y1;
  const inner = inset(top, 2.5);
  const corners: [number, number][] = [[inner.x0, inner.z0], [inner.x1 - 1.5, inner.z0], [inner.x0, inner.z1 - 1.5], [inner.x1 - 1.5, inner.z1 - 1.5]];
  const [x, z] = rng.pick(corners);
  const r = { x0: x, x1: x + 1.5, z0: z, z1: z + 1.5 };
  if (!ctx.free(r, y + 0.05, y + 3)) return;
  ctx.box(r, y, y + 1.2, { color: hex(0x2a2c32) });
  ctx.box(inset(r, 0.25), y + 1.2, y + 2.0, { color: hex(0x3a3c44) });
  ctx.box(inset(r, 0.45), y + 2.0, y + 2.1, { color: hex(0xeaf4ff), style: STYLE.EMISSIVE, emis: 5, solid: false });
  const col = rng.pick([hex(0xeaf4ff), hex(0xd8e8ff), hex(0xffe6f4), hex(0xc8fff4)]);
  ctx.world.spot('search', x + 0.75, y + 2.1, z + 0.75, rng.next() * 100, rng.range(0.15, 0.35), col);
}

/**
 * Aire d'atterrissage sur un toit, desservie par une voiture volante qui arrive
 * par la rue voisine. Le trajet complet est vérifié contre le décor.
 */
export function placePad(ctx: Ctx, t: Tower): boolean {
  const { rng } = ctx;
  const top = t.segs[t.segs.length - 1];
  const y = top.y1;
  if (top.x1 - top.x0 < 16 || top.z1 - top.z0 < 16 || !t.streetSides.length) return false;
  const cx = snap((top.x0 + top.x1) / 2), cz = snap((top.z0 + top.z1) / 2);
  const pad: Rect = { x0: cx - 4.5, x1: cx + 4.5, z0: cz - 4.5, z1: cz + 4.5 };
  if (!ctx.free(pad, y + 0.05, y + 4)) return false;
  for (const s of [...t.streetSides].sort(() => rng.next() - 0.5) as Side[]) {
    const road = faceCoord(t.lot, s) + (s === 0 || s === 3 ? -1 : 1) * (SIDEWALK + ROAD / 2);
    const alongX = s === 0 || s === 2; // la rue longe x si la face est au nord/sud
    const sx = alongX ? cx : road, sz = alongX ? road : cz;
    for (const dA of [14, 20, 26, 34]) {
      const A = y + dA;
      if (A > CLOUD_Y - 15) break;
      const col = { x0: cx - 3, x1: cx + 3, z0: cz - 3, z1: cz + 3 };
      const lat = { x0: Math.min(cx, sx) - 3, x1: Math.max(cx, sx) + 3, z0: Math.min(cz, sz) - 3, z1: Math.max(cz, sz) + 3 };
      const dir = rng.chance(0.5) ? 1 : -1;
      const fx = alongX ? sx + dir * 180 : sx, fz = alongX ? sz : sz + dir * 180;
      const run = { x0: Math.min(sx, fx) - 3, x1: Math.max(sx, fx) + 3, z0: Math.min(sz, fz) - 3, z1: Math.max(sz, fz) + 3 };
      if (!ctx.free(col, y + 4, A + 3) || !ctx.free(lat, A - 2, A + 3) || !ctx.free(run, A - 2, A + 3)) continue;
      // plateforme : marquage lumineux et balises
      ctx.box(pad, y, y + 0.1, { color: hex(0x1c1e24) });
      const edge = hex(0x40ffb0);
      for (const r of [{ ...pad, z1: pad.z0 + 0.25 }, { ...pad, z0: pad.z1 - 0.25 }, { ...pad, x1: pad.x0 + 0.25 }, { ...pad, x0: pad.x1 - 0.25 }])
        ctx.box(r, y + 0.1, y + 0.16, { color: edge, style: STYLE.EMISSIVE, emis: 2.5, extra: 2, seed: rng.byte(), solid: false });
      const hc = hex(0xffe14a);
      ctx.box({ x0: cx - 1.5, x1: cx - 1, z0: cz - 2, z1: cz + 2 }, y + 0.1, y + 0.14, { color: hc, style: STYLE.EMISSIVE, emis: 2, solid: false });
      ctx.box({ x0: cx + 1, x1: cx + 1.5, z0: cz - 2, z1: cz + 2 }, y + 0.1, y + 0.14, { color: hc, style: STYLE.EMISSIVE, emis: 2, solid: false });
      ctx.box({ x0: cx - 1, x1: cx + 1, z0: cz - 0.25, z1: cz + 0.25 }, y + 0.1, y + 0.14, { color: hc, style: STYLE.EMISSIVE, emis: 2, solid: false });
      for (const [bx, bz] of [[pad.x0, pad.z0], [pad.x1 - 0.4, pad.z0], [pad.x0, pad.z1 - 0.4], [pad.x1 - 0.4, pad.z1 - 0.4]])
        ctx.box({ x0: bx, x1: bx + 0.4, z0: bz, z1: bz + 0.4 }, y + 0.1, y + 0.5, { color: hex(0xff2a2a), style: STYLE.EMISSIVE, emis: 4, extra: 1, seed: rng.byte(), solid: false });
      ctx.reserve(pad, y + 0.1, A + 3);
      ctx.world.light(cx, y + 2, cz, edge, 1.2, 14);
      ctx.world.spot('pad', cx, y + 0.1, cz, A, dir, edge, [sx, sz, fx, fz]);
      // passager qui attend
      if (rng.chance(0.6)) ctx.idle(pad.x0 - 1, y, cz, Math.PI / 2, false);
      ctx.dest('Héliports', `Aire d'atterrissage · ${t.name} (${Math.round(y - 0.5)} m)`, pad.x0 - 2, y, cz + 2, Math.PI / 2);
      return true;
    }
  }
  return false;
}

/** Hologrammes : carpes au-dessus des places, visages aux carrefours, logos sur les tours. */
export function placeHolograms(ctx: Ctx, towers: Tower[], plazas: Plaza[]) {
  const { rng } = ctx;
  const ps = [...plazas].sort(() => rng.next() - 0.5).slice(0, 3);
  for (const p of ps) {
    const r = p.rect;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    ctx.world.spot('koi', cx, rng.range(22, 34), cz, Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 - 3, rng.next() * 10, rng.pick(NEON));
  }
  // visages : au-dessus de carrefours proches du centre
  const cross: [number, number][] = [];
  for (let i = 2; i <= BLOCKS - 2; i++) for (let j = 2; j <= BLOCKS - 2; j++) cross.push([-HALF + i * PITCH, -HALF + j * PITCH]);
  for (const [x, z] of cross.sort(() => rng.next() - 0.5).slice(0, 3)) ctx.world.spot('face', x, rng.range(30, 55), z, rng.range(0.65, 0.8), rng.next() * 10, rng.pick(NEON));
  // logos tournants au-dessus de tours hautes
  const tall = towers.filter((t) => t.H > 200 && t.H < CLOUD_Y - 40 && !t.landmark).sort(() => rng.next() - 0.5).slice(0, 3);
  for (const t of tall) {
    const top = t.segs[t.segs.length - 1];
    ctx.world.spot('logo', (top.x0 + top.x1) / 2, t.H + 16, (top.z0 + top.z1) / 2, rng.range(7, 10), rng.int(0, 1), t.accent);
    ctx.world.cone((top.x0 + top.x1) / 2, t.H + 0.2, (top.z0 + top.z1) / 2, 0, 1, 0, 11, 6, t.accent, 0.12);
  }
}

/** Scènes d'intervention de police : voitures en vol stationnaire, périmètre, badauds. */
export function placeIncidents(ctx: Ctx, metro: MetroLine[]) {
  const { rng } = ctx;
  let made = 0;
  for (let tries = 0; tries < 30 && made < 3; tries++) {
    const axis = rng.int(0, 1);
    const i = rng.int(1, BLOCKS - 1), k = rng.int(1, BLOCKS - 2);
    const c = -HALF + i * PITCH;
    if (metro.some((l) => l.axis === axis && Math.abs(l.c - c) < 1)) continue;
    const p = -HALF + k * PITCH + PITCH / 2 + rng.range(-15, 15);
    const sg = rng.chance(0.5) ? 1 : -1;
    // périmètre sur le trottoir
    const tw = c + sg * (ROAD / 2 + 2); // milieu du trottoir
    const R = (p0: number, p1: number, t0: number, t1: number): Rect =>
      axis === 0 ? { x0: p0, x1: p1, z0: Math.min(t0, t1), z1: Math.max(t0, t1) } : { x0: Math.min(t0, t1), x1: Math.max(t0, t1), z0: p0, z1: p1 };
    const zone = R(p - 4, p + 4, tw - 1.8, tw + 1.8);
    if (!ctx.free(zone, 0.55, 3)) continue;
    const tape = hex(0xffd23a);
    for (const r of [R(p - 4, p + 4, tw - 1.8, tw - 1.75), R(p - 4, p + 4, tw + 1.75, tw + 1.8), R(p - 4, p - 3.95, tw - 1.8, tw + 1.8), R(p + 3.95, p + 4, tw - 1.8, tw + 1.8)])
      ctx.box(r, 1.0, 1.08, { color: tape, style: STYLE.EMISSIVE, emis: 1.5, solid: false });
    for (const [pp, tt] of [[p - 4, tw - 1.8], [p + 4, tw - 1.8], [p - 4, tw + 1.8], [p + 4, tw + 1.8]])
      ctx.box(R(pp - 0.08, pp + 0.08, tt - 0.08, tt + 0.08), 0.5, 1.15, { color: hex(0x2a2a2a) });
    // corps sous une bâche, flaque de lumière
    ctx.box(R(p - 0.9, p + 0.9, tw - 0.4, tw + 0.4), 0.5, 0.75, { color: hex(0x8a8a90), solid: false });
    ctx.box(R(p - 2.5, p + 1.5, tw + 2.0, tw + 2.1), 0.5, 2.4, { color: hex(0x40d8ff), style: STYLE.SIGN, emis: 1.6, seed: rng.byte(), solid: false });
    // badauds
    const [ox, oz] = axis === 0 ? [p, tw - sg * 3.6] : [tw - sg * 3.6, p];
    ctx.group(ox, 0.5, oz, rng.int(3, 5));
    const hx = axis === 0 ? p : c + sg * 5.5, hz = axis === 0 ? c + sg * 5.5 : p;
    ctx.world.spot('police', hx, rng.range(8, 11), hz, axis, sg, hex(0xff2a2a), [axis === 0 ? p : tw, axis === 0 ? tw : p]);
    ctx.dest('Scènes', `Intervention de police · ${made + 1}`, axis === 0 ? p + 8 : tw - sg * 4, 0.5, axis === 0 ? tw - sg * 4 : p + 8, 0);
    made++;
  }
}

/** Destinations remarquables : stations, sous-sols, bars, marchés, points de vue. */
export function placeDestinations(ctx: Ctx, towers: Tower[], plazas: Plaza[], metro: MetroLine[], basements: Basement[]) {
  for (const l of metro)
    for (const st of l.stations) {
      const PT = l.deck + 1;
      const [x, z] = l.axis === 0 ? [st.p, l.c + 5.5] : [l.c + 5.5, st.p];
      ctx.dest('Métro', `${st.name} · ${l.name}`, x, PT + 0.02, z, l.axis === 0 ? -Math.PI / 2 : Math.PI);
    }
  for (const b of basements) {
    if (b.kind === 3) continue; // secret
    const S = b.stair;
    const ax = b.axis === 0;
    const top = b.dir > 0 ? (ax ? S.x0 : S.z0) : (ax ? S.x1 : S.z1);
    const mid = ax ? (S.z0 + S.z1) / 2 : (S.x0 + S.x1) / 2;
    const x = ax ? top - b.dir * 1.5 : mid, z = ax ? mid : top - b.dir * 1.5;
    const fx = ax ? b.dir : 0, fz = ax ? 0 : b.dir;
    ctx.dest('Sous-sols', b.name, x, 0.52, z, Math.atan2(-fx, -fz));
  }
  const bars = ['Bar', 'Salle d\'arcade', 'Cantine'];
  for (const t of towers) {
    if (!t.room) continue;
    const s = t.room.side;
    const R = t.room.rect;
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    const F = faceCoord(t.segs[0], s);
    const [x, z] = s === 0 || s === 2 ? [cx, F + SV[s][1] * 4] : [F + SV[s][0] * 4, cz];
    ctx.dest('Bars', `${bars[t.room.kind]} · ${t.name}`, x, 0.52, z, Math.atan2(SV[s][0], SV[s][1]));
  }
  plazas.forEach((p, i) => {
    const r = p.rect;
    ctx.dest('Marchés', `Marché de nuit n°${i + 1}`, r.x0 + 1.5, 0.52, (r.z0 + r.z1) / 2, -Math.PI / 2);
  });
}
