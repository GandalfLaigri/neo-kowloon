import { HALF, PITCH, ROAD, SIDEWALK, STYLE, hex, type RGB } from '../config';
import { snap, type RNG } from '../rng';
import type { Ctx } from './ctx';
import { DISTRICTS, type DistrictMap, type DistrictId } from './districts';
import { rectSubAll, subtractIntervals, type Rect } from './geom';
import { TRACK_T, lineFrame, platformTop, type MetroLine } from './metro';

/** Dessus des voies de la ligne souterraine (quais à -12 m). */
export const SUB_DECK = -13;
const HALL = 30;      // demi-longueur de la salle des quais
const MEZ = 16;       // longueur de la mezzanine (bout de station)
const FLOOR_M = -5.5; // niveau de la mezzanine

const NAMES: Record<DistrictId, string[]> = {
  centre: ['Tenkai Central', 'Bourse', 'Hikari', 'Hôtel de Ville', 'Place Arasaka', 'Tour Mirai'],
  riche: ['Ivoire', 'Jardins Suspendus', 'Kasumi', 'Opéra', 'Belvédère'],
  asia: ['Porte de Jade', 'Marché aux Dragons', 'Pagode', 'Temple du Lotus', 'Rue des Lanternes'],
  fonds: ['La Fosse', 'Rouille', 'Cité Basse', 'Les Égouts', 'Ferraille'],
  plaisirs: ['Kabuki', 'Boulevard Néon', 'Pachinko', 'Cabaret', 'Karaoké'],
  port: ['Les Docks', 'Capitainerie', 'Quai Ouest', 'Chantier Naval', 'Entrepôts'],
};

export interface SubwayStation { name: string; p: number; m: 1 | -1; transfer: string | null; entrances: Rect[] }
export interface Subway { line: MetroLine; stations: SubwayStation[]; p0: number; p1: number }

/**
 * Tracé de la ligne souterraine : sous une rue parallèle à la ligne A, avec une
 * station voisine de la ligne B (correspondance). Planifié avant les dalles
 * (trémies d'accès sur les trottoirs).
 */
export function planSubway(rng: RNG, lines: MetroLine[], dm: DistrictMap): Subway | null {
  const A = lines.find((l) => l.axis === 0)!, B = lines.find((l) => l.axis === 1)!;
  const iB = Math.round((B.c + HALF) / PITCH);
  const roadOk = (i: number) => i >= 2 && i <= 8 && Math.abs(-HALF + i * PITCH - A.c) >= PITCH - 1;
  // une rue (le long de x) voisine d'une station de la ligne B
  const opts: { i: number; st: string }[] = [];
  for (const s of B.stations)
    for (const d of [-1, 1]) {
      const i = Math.round((s.p + d * PITCH / 2 + HALF) / PITCH);
      if (roadOk(i)) opts.push({ i, st: s.name });
    }
  let iS: number, transferName: string | null = null;
  if (opts.length) { const o = rng.pick(opts); iS = o.i; transferName = o.st; }
  else { const ok = [2, 3, 4, 5, 6, 7, 8].filter(roadOk); if (!ok.length) return null; iS = rng.pick(ok); }
  const c = -HALF + iS * PITCH;
  // stations au milieu des îlots ; celle de correspondance touche la rue de la ligne B
  const kT = rng.chance(0.5) ? iB - 1 : iB;
  const ks = [kT];
  const pool = [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => Math.abs(k - kT) >= 2).sort(() => rng.next() - 0.5);
  for (const k of pool) { if (ks.length >= 4) break; if (ks.every((q) => Math.abs(q - k) >= 2)) ks.push(k); }
  ks.sort((a, b) => a - b);
  const used = new Set<string>();
  const stations: SubwayStation[] = ks.map((k) => {
    const bc = -HALF + k * PITCH + PITCH / 2;
    const m: 1 | -1 = k === kT ? (kT === iB - 1 ? 1 : -1) : rng.chance(0.5) ? 1 : -1;
    const pc = bc - 7 * m;
    const did = dm.idAt(bc, c + 20);
    const cand = NAMES[did].filter((n) => !used.has(n));
    const name = cand.length ? rng.pick(cand) : `${DISTRICTS[did].name} ${k}`;
    used.add(name);
    const { R } = lineFrame({ axis: 0, c });
    const pb = pc + m * HALL;
    const e0 = pb + m * 5.6, e1 = pb + m * 15.2;
    const entrances = [1, -1].map((sg) => R(Math.min(e0, e1), Math.max(e0, e1), sg * (ROAD / 2 + 1), sg * (ROAD / 2 + 3.5)));
    return { name, p: pc, m, transfer: k === kT ? transferName : null, entrances };
  });
  const line: MetroLine = {
    id: 2, name: 'Ligne C', axis: 0, c, deck: SUB_DECK, color: hex(0xc05aff),
    stations: stations.map((s) => ({ name: s.name, p: s.p })),
  };
  const p0 = stations[0].p - HALL - 40, p1 = Math.min(HALF + 20, stations[stations.length - 1].p + HALL + 40);
  return { line, stations, p0, p1 };
}

/** Trémies (à percer dans les dalles) et réservations des accès. */
export function subwayHoles(sub: Subway | null): Rect[] {
  return sub ? sub.stations.flatMap((s) => s.entrances) : [];
}

export function reserveSubway(ctx: Ctx, sub: Subway | null) {
  if (!sub) return;
  for (const s of sub.stations) for (const e of s.entrances) ctx.reserve({ x0: e.x0 - 0.8, x1: e.x1 + 0.8, z0: e.z0 - 0.8, z1: e.z1 + 0.8 }, 0.4, 5);
}

// ---------------------------------------------------------------------------
export function buildSubway(ctx: Ctx, sub: Subway) {
  const { rng, world } = ctx;
  const l = sub.line;
  const { R, P, yaw } = lineFrame(l);
  const D = SUB_DECK, PT = platformTop(l);
  const concrete = hex(0x2a2a30), tile = hex(0xc8ccd2), dark = hex(0x1a1c22);
  // ---- tunnel : radier, rails sur toute la longueur ; piédroits et voûte hors des stations ----
  for (let p = sub.p0; p < sub.p1; p += 24) {
    const q = Math.min(p + 24, sub.p1);
    ctx.box(R(p, q, -5, 5), D - 1, D, { color: concrete, style: STYLE.GROUND, seed: rng.byte() });
    for (const tt of [-TRACK_T, TRACK_T])
      for (const dr of [-0.75, 0.75])
        ctx.box(R(p, q, tt + dr - 0.08, tt + dr + 0.08), D, D + 0.15, { color: hex(0x55565c), solid: false, noRain: true });
  }
  const halls = sub.stations.map((s) => [s.p - HALL, s.p + HALL] as [number, number]);
  let k = 0;
  for (const [i0, i1] of subtractIntervals([sub.p0, sub.p1], halls))
    for (let p = i0; p < i1 - 0.01; p += 24) {
      const q = Math.min(p + 24, i1);
      ctx.box(R(p, q, 4.5, 5), D, -6, { color: concrete, seed: rng.byte() });
      ctx.box(R(p, q, -5, -4.5), D, -6, { color: concrete, seed: rng.byte() });
      ctx.box(R(p, q, -5, 5), -6.5, -6, { color: concrete });
      if (q - p > 5) for (const t of [-4.45, 4.4]) ctx.box(R(p + 2, p + 4, t, t + 0.05), -8.5, -8.3, { color: hex(0xffd6a0), style: STYLE.EMISSIVE, emis: 2, solid: false });
      if (k++ % 2 === 0) { const [x, z] = P(p + 3, 0); world.light(x, -8.5, z, hex(0xffc890), 1.1, 12); }
    }
  // extrémités fermées
  for (const p of [sub.p0, sub.p1]) ctx.box(R(p - 0.5, p + 0.5, -5, 5), D - 1, -6, { color: concrete });

  for (const st of sub.stations) station(ctx, sub, st);
  void R; void yaw; void tile; void dark;
}

function station(ctx: Ctx, sub: Subway, st: SubwayStation) {
  const { rng, world } = ctx;
  const l = sub.line;
  const { R, P, yaw } = lineFrame(l);
  const D = SUB_DECK, PT = platformTop(l);
  const m = st.m;
  const pa = st.p - HALL, pb = st.p + HALL;           // salle des quais
  const ze = m > 0 ? pb : pa;                         // bord côté mezzanine
  const zm = ze + m * MEZ;                            // fond de la mezzanine
  const M = (u0: number, u1: number, t0: number, t1: number) => R(ze + m * u0, ze + m * u1, t0, t1); // distances depuis le bord
  const did = ctx.districts.idAt(st.p, l.c + 20);
  const acc: RGB = DISTRICTS[did].neon[0];
  const tile = hex(0xc8ccd2), concrete = hex(0x2a2a30), metal = hex(0x2c2f36), white = hex(0xe8f4ff);
  const W = ROAD / 2 + 0.5; // demi-largeur intérieure de la salle

  // ---- salle des quais ----
  for (const sg of [1, -1]) {
    const Rs = (p0: number, p1: number, t0: number, t1: number) => R(p0, p1, sg * t0, sg * t1);
    ctx.box(Rs(pa, pb, 3.75, W), D - 1, PT, { color: hex(0x3a3a42), style: STYLE.GROUND, seed: rng.byte() });
    ctx.box(Rs(pa, pb, 3.75, 4.15), PT, PT + 0.03, { color: hex(0xffd23a), style: STYLE.EMISSIVE, emis: 0.6, solid: false });
    ctx.box(Rs(pa, pb, W, W + 0.5), D - 1, -2, { color: tile, seed: rng.byte(), extra: 9 });
    // frise au couleurs du quartier, publicités, nom de la station
    ctx.box(Rs(pa, pb, W - 0.05, W), PT + 3.2, PT + 3.5, { color: acc, style: STYLE.EMISSIVE, emis: 1.8, solid: false });
    for (let p = pa + 4; p < pb - 8; p += 14) ctx.box(Rs(p, p + 6, W - 0.1, W), PT + 4.2, PT + 7.2, { color: hex(0x111111), style: STYLE.SCREEN, emis: 2, seed: rng.byte() });
    for (const p of [st.p - 4, st.p + 10]) ctx.box(Rs(p - 3.5, p + 3.5, W - 0.1, W), PT + 0.5, PT + 3.5, { color: acc, style: STYLE.SIGN, emis: 2.2, seed: rng.byte() });
    // bancs et voyageurs
    for (let p = pa + 6; p < pb - 14; p += 12) {
      ctx.box(Rs(p, p + 2.5, W - 1, W - 0.4), PT, PT + 0.5, { color: hex(0x4a3a2a) });
      for (let k = 0; k < 3; k++) {
        const [x, z] = P(p + 0.45 + k * 0.8, sg * (W - 0.7));
        if (rng.chance(0.4)) ctx.sit(x, PT + 0.5, z, yaw(0, -sg), rng.chance(0.4) ? 7 : 1);
        else if (rng.chance(0.3)) ctx.interact('seat', x, PT + 0.5, z, yaw(0, -sg), PT);
      }
    }
    for (let i = 0; i < rng.int(3, 7); i++) {
      const p = snap(rng.range(pa + 3, pb - 14), 0.25);
      const [x, z] = P(p, sg * rng.range(4.6, 6.5));
      ctx.pose(x, PT, z, yaw(rng.range(-0.3, 0.3), -sg), rng.chance(0.45) ? 5 : 0);
    }
    const [x0, z0] = P(pa + 3, sg * 6), [x1, z1] = P(pb - 14, sg * 6);
    ctx.peds.lines.push({ x0, z0, x1, z1, y: PT, count: rng.int(1, 3) });
    // distributeur sur le quai
    const vp = st.p - 18;
    ctx.box(Rs(vp, vp + 1, W - 0.8, W), PT, PT + 2, { color: rng.pick([hex(0xff4fa0), hex(0x40d0ff)]), style: STYLE.SHOP, emis: 2, seed: rng.byte() });
    { const [x, z] = P(vp + 0.5, sg * (W - 1.6)); ctx.interact('vend', x, PT, z, yaw(0, sg)); }
    // éclairage
    for (let p = pa + 6; p < pb; p += 12) {
      ctx.box(Rs(p, p + 3, 5.5, 5.8), -2.6, -2.5, { color: white, style: STYLE.EMISSIVE, emis: 2, solid: false });
      const [x, z] = P(p + 1.5, sg * 6);
      world.light(x, PT + 5, z, white, 1.2, 16);
    }
    // escalator (montant) et escalier fixe vers la mezzanine
    const n = 26;
    for (let i = 1; i <= n; i++) {
      const top = FLOOR_M - 0.25 * i;
      const u0 = (i - 1) * 0.4, u1 = i * 0.4;
      ctx.box(M(-u1, -u0, sg * 7.7, sg * 8.9), PT, top, { color: hex(0x3a3c44), style: STYLE.ESCALATOR, extra: m > 0 ? 1 : 0, seed: 3 });
    }
    for (let i = 1; i <= 13; i++) {
      const top = FLOOR_M - 0.5 * i;
      ctx.box(M(-i * 0.8, -(i - 1) * 0.8, sg * 6.3, sg * 7.5), PT, top, { color: hex(0x4a4a50), seed: 5 });
    }
    for (const t of [6.2, 7.55, 8.95]) ctx.box(M(-10.6, 0, sg * t, sg * (t + 0.12)), PT, FLOOR_M + 1.0, { color: hex(0x9fd8ff), glass: true });
    ctx.box(M(-10.6, 0, sg * 8.95, sg * 9.1), FLOOR_M - 0.1, FLOOR_M + 0.05, { color: acc, style: STYLE.EMISSIVE, emis: 2, solid: false });
    // zone d'entraînement de l'escalator (vers la mezzanine)
    ctx.escalator(M(-10.8, 0.3, sg * 7.7, sg * 8.9), PT - 0.5, FLOOR_M + 2, l.axis === 0 ? m * 0.75 : 0, l.axis === 1 ? m * 0.75 : 0);
  }
  // voûte, murs d'extrémité
  ctx.box(R(pa, pb, -W - 0.5, W + 0.5), -2.5, -2, { color: concrete });
  const pf = m > 0 ? pa : pb; // extrémité opposée à la mezzanine
  ctx.box(R(pf - 0.5, pf + 0.5, 4.5, W + 0.5), D - 1, -2, { color: tile, extra: 9 });
  ctx.box(R(pf - 0.5, pf + 0.5, -W - 0.5, -4.5), D - 1, -2, { color: tile, extra: 9 });
  ctx.box(R(pf - 0.5, pf + 0.5, -4.5, 4.5), -6.5, -2, { color: tile, extra: 9 });
  // au-dessus des voies, grand nom de station lumineux
  ctx.box(R(st.p - 8, st.p + 8, -0.2, 0.2), -5.8, -3.8, { color: l.color, style: STYLE.SIGN, emis: 2.4, seed: rng.byte(), extra: 2 });

  // ---- mezzanine : dalle, garde-corps sur la salle, portillons, guichets ----
  const WM = ROAD / 2 + SIDEWALK; // jusque sous les trottoirs
  ctx.box(M(0, MEZ, -WM, WM), FLOOR_M - 0.5, FLOOR_M, { color: hex(0x3a3a42), style: STYLE.GROUND, seed: rng.byte() });
  ctx.box(M(0, MEZ, -WM - 0.5, -WM), FLOOR_M, -2, { color: tile, extra: 9 });
  ctx.box(M(0, MEZ, WM, WM + 0.5), FLOOR_M, -2, { color: tile, extra: 9 });
  ctx.box(M(MEZ, MEZ + 0.5, -WM - 0.5, WM + 0.5), FLOOR_M - 0.5, -2, { color: tile, extra: 9 });
  // sous la mezzanine, la salle est fermée (hors tunnel)
  for (const sg of [1, -1]) ctx.box(M(0, 0.5, sg * 4.5, sg * (W + 0.5)), D - 1, FLOOR_M - 0.5, { color: tile, extra: 9 });
  // plafond percé par les escaliers de la rue
  const holes = st.entrances;
  const ceil = M(0, MEZ + 0.5, -WM - 0.5, WM + 0.5);
  for (const r of rectSubAll(ceil, holes)) ctx.box(r, -2.5, -2, { color: concrete });
  // garde-corps vitré au bord de la salle (sauf escaliers)
  ctx.box(M(-0.1, 0.1, -6.2, 6.2), FLOOR_M, FLOOR_M + 1.1, { color: hex(0x9fd8ff), glass: true });
  ctx.box(M(-0.1, 0.1, -6.2, 6.2), FLOOR_M + 1.05, FLOOR_M + 1.15, { color: acc, style: STYLE.EMISSIVE, emis: 2, solid: false });
  // portillons
  for (let t = -8; t <= 8; t += 1.6) {
    if (Math.abs(t) < 0.5) continue;
    ctx.box(M(6, 7.2, t - 0.15, t + 0.15), FLOOR_M, FLOOR_M + 1.1, { color: metal });
    ctx.box(M(6, 7.2, t - 0.17, t + 0.17), FLOOR_M + 1.1, FLOOR_M + 1.15, { color: hex(0x40ff9a), style: STYLE.EMISSIVE, emis: 2, extra: 2, seed: rng.byte(), solid: false });
  }
  // guichets automatiques, plan du réseau, kiosque
  for (const sg of [1, -1]) {
    ctx.box(M(9, 13, sg * (WM - 0.8), sg * WM), FLOOR_M, FLOOR_M + 2.2, { color: hex(0x2a3a5a), style: STYLE.SHOP, emis: 1.8, seed: rng.byte() });
    const [x, z] = P(ze + m * 11, sg * (WM - 1.6));
    ctx.interact('vend', x, FLOOR_M, z, yaw(0, sg));
  }
  ctx.box(M(2, 5, -WM, -WM + 0.1), FLOOR_M + 1, FLOOR_M + 3.2, { color: l.color, style: STYLE.SIGN, emis: 2, seed: rng.byte() });
  for (let u = 3; u < MEZ; u += 5) {
    const [x, z] = P(ze + m * u, 0);
    ctx.box({ x0: x - 1.5, x1: x + 1.5, z0: z - 0.15, z1: z + 0.15 }, -2.6, -2.5, { color: white, style: STYLE.EMISSIVE, emis: 2, solid: false });
    world.light(x, -3, z, white, 1.1, 14);
  }
  for (let i = 0; i < rng.int(2, 5); i++) {
    const [x, z] = P(ze + m * rng.range(8, 14), rng.range(-8, 8));
    ctx.pose(x, FLOOR_M, z, rng.range(-3, 3), rng.pick([0, 5, 5]));
  }
  { const [x0, z0] = P(ze + m * 1, 0), [x1, z1] = P(ze + m * (MEZ - 1), 0); ctx.peds.lines.push({ x0, z0, x1, z1, y: FLOOR_M, count: rng.int(1, 3) }); }

  // ---- accès depuis la rue : escaliers dans les trottoirs ----
  for (const e of st.entrances) {
    const sg = (e.z0 + e.z1) / 2 > l.c ? 1 : -1; // ligne le long de x : t = z - c
    const t0 = sg * (ROAD / 2 + 1), t1 = sg * (ROAD / 2 + 3.5);
    const top = ze + m * 15.2; // bord haut (rue), on descend vers la salle
    for (let i = 1; i <= 12; i++) {
      const y = 0.5 - 0.5 * i;
      const u0 = 15.2 - i * 0.8, u1 = 15.2 - (i - 1) * 0.8;
      ctx.box(M(u0, u1, t0, t1), FLOOR_M - 0.5, y, { color: hex(0x3a3a42), style: STYLE.GROUND, seed: 5 });
    }
    // murs de trémie, garde-corps en surface, totem lumineux, auvent
    for (const t of [t0, t1]) {
      const w = t === t0 ? [t0 - sg * 0.3, t0] : [t1, t1 + sg * 0.3];
      ctx.box(M(5.6, 15.2, w[0], w[1]), FLOOR_M, 0.5, { color: tile, extra: 9 });
      ctx.box(M(5.6, 15.2, w[0], w[1]), 0.5, 1.5, { color: hex(0x1d1f24) });
    }
    ctx.box(M(5.3, 5.6, t0, t1), 0.5, 1.5, { color: hex(0x1d1f24) });
    ctx.box(M(5.6, 15.2, t0, t1), 3.3, 3.5, { color: l.color, glass: true });
    for (const u of [5.8, 14.8]) for (const t of [t0, t1]) ctx.box(M(u - 0.1, u + 0.1, t - 0.1, t + 0.1), 0.5, 3.4, { color: metal });
    const [tx, tz] = P(top + m * 0.8, sg * (ROAD / 2 + 0.6));
    ctx.box({ x0: tx - 0.15, x1: tx + 0.15, z0: tz - 0.15, z1: tz + 0.15 }, 0.5, 3.6, { color: metal });
    ctx.box({ x0: tx - 0.6, x1: tx + 0.6, z0: tz - 0.6, z1: tz + 0.6 }, 3.6, 4.8, { color: l.color, style: STYLE.EMISSIVE, emis: 3, extra: 2, seed: rng.byte() });
    world.light(tx, 4, tz, l.color, 1.4, 12);
    const [lx, lz] = P(ze + m * 10, sg * (ROAD / 2 + 2.25));
    world.light(lx, -1.5, lz, white, 1.0, 10);
  }
  const [dx, dz] = P(st.p, 5.5);
  ctx.dest('Métro', `${st.name} · ${l.name} (souterrain)`, dx, PT + 0.02, dz, -Math.PI / 2);
}
