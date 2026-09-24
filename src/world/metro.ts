import { HALF, NEON, PITCH, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import { dark, type Ctx } from './ctx';
import type { Rect } from './geom';

export interface MetroStation { name: string; p: number }
export interface MetroLine {
  id: number;
  name: string;
  axis: 0 | 1;     // 0 : la ligne suit l'axe x, 1 : l'axe z
  c: number;       // coordonnée fixe (axe de la chaussée)
  deck: number;    // dessus du tablier (voies)
  color: RGB;
  stations: MetroStation[];
}

export const TRACK_T = 1.75;           // axe des voies (de part et d'autre du centre)
export const PLATFORM = [3.75, 7.25];  // quais : |t| dans cet intervalle
export const PLATFORM_HALF = 28;       // demi-longueur des quais
export const platformTop = (l: MetroLine) => l.deck + 1;

const STATION_NAMES = ['Kabuki-chō', 'Marché Nocturne', 'Porte Tenkai', 'Vieux Port', 'Denki-gai', 'Hikari Crossing', 'Yami-dōri', 'Arasaka Plaza', 'Shin-Kowloon', 'Ryūgū'];

/** Rectangle et point dans le repère d'une ligne : p le long de la ligne, t en travers. */
export function lineFrame(l: { axis: 0 | 1; c: number }) {
  const R = (p0: number, p1: number, t0: number, t1: number): Rect =>
    l.axis === 0
      ? { x0: Math.min(p0, p1), x1: Math.max(p0, p1), z0: l.c + Math.min(t0, t1), z1: l.c + Math.max(t0, t1) }
      : { x0: l.c + Math.min(t0, t1), x1: l.c + Math.max(t0, t1), z0: Math.min(p0, p1), z1: Math.max(p0, p1) };
  const P = (p: number, t: number): [number, number] => (l.axis === 0 ? [p, l.c + t] : [l.c + t, p]);
  /** yaw (convention passants : atan2(dx, dz)) pour regarder dans la direction (dp, dt). */
  const yaw = (dp: number, dt: number) => (l.axis === 0 ? Math.atan2(dp, dt) : Math.atan2(dt, dp));
  return { R, P, yaw };
}

const nearCross = (p: number, m = 11) => {
  const r = (((p + HALF) % PITCH) + PITCH) % PITCH;
  return r < m || r > PITCH - m;
};

export function buildMetro(ctx: Ctx): MetroLine[] {
  const { rng } = ctx;
  const names = [...STATION_NAMES].sort(() => rng.next() - 0.5);
  const lines: MetroLine[] = [
    { id: 0, name: 'Ligne A', axis: 0, c: -HALF + rng.pick([3, 4, 6]) * PITCH, deck: 15, color: hex(0xffb000), stations: [] },
    { id: 1, name: 'Ligne B', axis: 1, c: -HALF + rng.pick([3, 5, 6]) * PITCH, deck: 25, color: hex(0x00e5ff), stations: [] },
  ];
  let ni = 0;
  for (const l of lines) {
    const segs = [1, rng.pick([4, 5]), 8];
    l.stations = segs.map((k) => ({ name: names[ni++ % names.length], p: -HALF + k * PITCH + PITCH / 2 }));
    buildViaduct(ctx, l);
    for (const st of l.stations) buildStation(ctx, l, st);
  }
  return lines;
}

function inStation(l: MetroLine, p0: number, p1: number) {
  return l.stations.some((s) => p1 > s.p - PLATFORM_HALF && p0 < s.p + PLATFORM_HALF);
}

function buildViaduct(ctx: Ctx, l: MetroLine) {
  const { R } = lineFrame(l);
  const D = l.deck;
  const concrete = hex(0x2a2a30);
  const P0 = -HALF - PITCH, P1 = HALF + PITCH;
  for (let p = P0; p < P1; p += 24) {
    const q = Math.min(p + 24, P1);
    ctx.box(R(p, q, -3.75, 3.75), D - 1.5, D, { color: concrete, seed: ctx.rng.byte() });
    // rails (non bloquants)
    for (const tt of [-TRACK_T, TRACK_T])
      for (const dr of [-0.75, 0.75])
        ctx.box(R(p, q, tt + dr - 0.08, tt + dr + 0.08), D, D + 0.15, { color: hex(0x55565c), solid: false, noRain: true });
    // parapets hors stations
    if (!inStation(l, p, q)) {
      ctx.box(R(p, q, 3.5, 3.75), D, D + 1.2, { color: concrete });
      ctx.box(R(p, q, -3.75, -3.5), D, D + 1.2, { color: concrete });
    }
    // liseré de néon sous le tablier
    ctx.box(R(p, q, 3.62, 3.75), D - 1.62, D - 1.5, { color: l.color, style: STYLE.EMISSIVE, emis: 0.9, solid: false, noRain: true });
    ctx.box(R(p, q, -3.75, -3.62), D - 1.62, D - 1.5, { color: l.color, style: STYLE.EMISSIVE, emis: 0.9, solid: false, noRain: true });
  }
  // piliers + chevêtres, lampes sous le tablier (glauques, parfois défaillantes)
  for (let p = P0 + 12; p < P1; p += 24) {
    if (!nearCross(p)) {
      ctx.box(R(p - 0.75, p + 0.75, -0.75, 0.75), 0, D - 2.5, { color: concrete, seed: ctx.rng.byte() });
      ctx.box(R(p - 0.75, p + 0.75, -3.75, 3.75), D - 2.5, D - 1.5, { color: concrete });
    }
    const lp = p + 12;
    if (lp < P1 - 1 && Math.abs(lp) < HALF + 20) {
      const faulty = ctx.rng.chance(0.3);
      const col = ctx.rng.chance(0.6) ? hex(0xffa24a) : hex(0xb8ffcf);
      ctx.box(R(lp - 0.6, lp + 0.6, -0.3, 0.3), D - 1.75, D - 1.5, { color: col, style: STYLE.EMISSIVE, emis: 3, extra: faulty ? 3 : 0, seed: ctx.rng.byte(), solid: false });
      const [x, z] = lineFrame(l).P(lp, 0);
      ctx.world.light(x, D - 3, z, col, 1.5, 18, faulty ? ctx.rng.byte() + 1 : undefined);
    }
  }
}

function buildStation(ctx: Ctx, l: MetroLine, st: MetroStation) {
  const { R, P, yaw } = lineFrame(l);
  const { rng } = ctx;
  const D = l.deck;
  const PT = platformTop(l);
  const pc = st.p;
  const pa = pc - PLATFORM_HALF, pb = pc + PLATFORM_HALF;
  const metal = hex(0x2c2f36);
  const white = hex(0xd8f0ff);

  for (const sg of [1, -1]) {
    const T = (t0: number, t1: number): [number, number] => [sg * t0, sg * t1];
    const Rs = (p0: number, p1: number, t0: number, t1: number) => { const [a, b] = T(t0, t1); return R(p0, p1, a, b); };
    // quai
    ctx.box(Rs(pa, pb, 3.75, 7.25), D - 1.5, PT, { color: hex(0x3a3a42), style: STYLE.GROUND, seed: rng.byte() });
    ctx.box(Rs(pa, pb, 3.75, 4.15), PT, PT + 0.03, { color: hex(0xffd23a), style: STYLE.EMISSIVE, emis: 0.5, solid: false, noRain: true });
    ctx.box(Rs(pa, pb, 3.75, 3.95), D - 1.7, D - 1.5, { color: l.color, style: STYLE.EMISSIVE, emis: 2.5, solid: false, noRain: true });
    // escalier : palier haut côté +p (sg>0) ou -p (sg<0)
    const land0 = sg > 0 ? pc + 18 : pc - 21, land1 = land0 + 3;
    // mur extérieur avec ouverture au palier
    for (const [q0, q1] of [[pa, land0], [land1, pb]] as [number, number][])
      if (q1 > q0) ctx.box(Rs(q0, q1, 7.0, 7.25), PT, PT + 1.2, { color: metal });
    // colonnes, auvent, panneaux
    for (let p = pa + 2; p <= pb - 2; p += 12) ctx.box(Rs(p, p + 0.4, 6.6, 7.0), PT, PT + 5, { color: metal });
    ctx.box(Rs(pc - 5, pc + 5, 6.75, 7.0), PT + 1.4, PT + 4.4, { color: l.color, style: STYLE.SIGN, emis: 2.2, seed: rng.byte() });
    for (const ap of [pa + 6, pb - 12]) {
      if (ap + 6 > land0 && ap < land1) continue;
      ctx.box(Rs(ap, ap + 6, 6.8, 7.0), PT + 1.4, PT + 4.4, { color: hex(0x111111), style: STYLE.SCREEN, emis: 2, seed: rng.byte() });
    }
    // bancs, poubelle, distributeur
    for (let p = pa + 8; p < pb - 8; p += 16) {
      if (p + 2.5 > land0 - 1 && p < land1 + 1) continue;
      ctx.box(Rs(p, p + 2.5, 6.0, 6.6), PT, PT + 0.5, { color: hex(0x4a3a2a) });
      for (let k = 0; k < 3; k++)
        if (rng.chance(0.4)) { const [x, z] = P(p + 0.45 + k * 0.8, sg * 6.3); ctx.sit(x, PT + 0.5, z, yaw(0, -sg)); }
    }
    ctx.box(Rs(pc - 12, pc - 11.4, 6.4, 7.0), PT, PT + 1.0, { color: hex(0x1f3a2a) });
    ctx.box(Rs(pc + 9, pc + 10, 6.2, 7.0), PT, PT + 2, { color: rng.pick([hex(0xff4fa0), hex(0x40d0ff)]), style: STYLE.SHOP, emis: 2, seed: rng.byte() });
    for (let p = pa + 7; p < pb - 3; p += 14) {
      const [x, z] = P(p, sg * 5.5);
      ctx.world.light(x, PT + 4, z, white, 1.3, 14);
    }

    // Escalier d'accès depuis la rue (dans la chaussée, entre le quai et le trottoir)
    const N = Math.round(PT / 0.5);
    ctx.box(Rs(land0, land1, 7.25, 9.0), PT - 0.5, PT, { color: metal });
    const stepP = (i: number): [number, number] => (sg > 0 ? [land0 - i * 0.6, land0 - (i - 1) * 0.6] : [land1 + (i - 1) * 0.6, land1 + i * 0.6]);
    for (let i = 1; i < N; i++) {
      const top = PT - 0.5 * i;
      const [p0, p1] = stepP(i);
      ctx.box(Rs(p0, p1, 7.25, 9.0), Math.max(0, top - 0.5), top, { color: metal, seed: 3 });
      if (i % 2 === 1) {
        const [q0, q1] = stepP(Math.min(N - 1, i + 1));
        const lo = Math.min(p0, q0), hi = Math.max(p1, q1);
        ctx.box(Rs(lo, hi, 8.88, 9.0), top, top + 1.0, { color: hex(0x1d1f24), solid: false, noRain: true });
        ctx.box(Rs(lo, hi, 7.25, 7.37), top, top + 1.0, { color: hex(0x1d1f24), solid: false, noRain: true });
      }
      if (i % 10 === 5 && top > 2.5) ctx.box(Rs(p0, p0 + 0.4, 7.9, 8.3), 0, top - 0.5, { color: metal });
    }
    const s0 = Math.min(stepP(1)[0], stepP(N - 1)[0]);
    const s1 = Math.max(stepP(1)[1], stepP(N - 1)[1]);
    // garde-corps invisibles (le long de l'escalier et du palier)
    ctx.wall(Rs(sg > 0 ? s0 : land0 - 0.15, sg > 0 ? land1 + 0.15 : s1, 8.9, 9.05), 1.2, PT + 1.1);
    ctx.wall(Rs(s0, s1, 7.2, 7.3), 1.2, PT + 1.1);
    ctx.wall(Rs(sg > 0 ? land1 : land0 - 0.15, sg > 0 ? land1 + 0.15 : land0, 7.25, 9.0), PT, PT + 1.1);
    // totem d'entrée sur le trottoir, au pied de l'escalier
    const pf = sg > 0 ? s0 + 0.5 : s1 - 0.5;
    const tot = Rs(pf - 1.5, pf + 1.5, 9.6, 10.1);
    if (ctx.free(tot, 0.5, 7.5)) {
      ctx.box(Rs(pf - 0.15, pf + 0.15, 9.7, 10.0), 0.5, 4, { color: metal });
      ctx.box(tot, 4, 7, { color: l.color, style: STYLE.SIGN, emis: 2.4, seed: rng.byte(), extra: 1 });
      const [x, z] = P(pf, sg * 9.85);
      ctx.world.light(x, 5.5, z, l.color, 1.6, 12);
    }
    // voyageurs qui attendent
    for (let i = 0; i < rng.int(2, 6); i++) {
      const p = snap(rng.range(pa + 3, pb - 3), 0.25);
      if (p > land0 - 1 && p < land1 + 1) continue;
      const [x, z] = P(p, sg * rng.range(4.8, 6.4));
      ctx.idle(x, PT, z, yaw(rng.range(-0.3, 0.3), -sg), false);
    }
    ctx.peds.lines.push((() => {
      const [x0, z0] = P(pa + 4, sg * 5.3), [x1, z1] = P(pb - 4, sg * 5.3);
      return { x0, z0, x1, z1, y: PT, count: rng.int(1, 2) };
    })());
    // petite zone de misère sous l'escalier (tente, cartons)
    if (rng.chance(0.6)) {
      const pm = (s0 + s1) / 2;
      ctx.box(Rs(pm - 1.2, pm + 1.2, 7.4, 8.9), 0, 1.1, { color: rng.pick([hex(0x2a4a8a), hex(0x3a5a3a), hex(0x6a4a2a)]), solid: false });
      ctx.box(Rs(pm + 1.4, pm + 2.0, 7.6, 8.4), 0, 0.5, { color: hex(0x6a4a2a), solid: false });
    }
  }
  // auvent commun (quais + voies) et bandeaux lumineux
  ctx.box(R(pa + 1, pb - 1, -7.25, 7.25), PT + 5, PT + 5.35, { color: metal });
  for (const t of [-5.5, 0, 5.5])
    ctx.box(R(pa + 2, pb - 2, t - 0.15, t + 0.15), PT + 4.85, PT + 5, { color: white, style: STYLE.EMISSIVE, emis: 1.6, solid: false });
  // nom de la station en néon sur le toit de l'auvent
  ctx.box(R(pc - 6, pc + 6, -0.25, 0.25), PT + 5.35, PT + 8.35, { color: dark(l.color, 1), style: STYLE.SIGN, emis: 2.6, seed: ctx.rng.byte(), extra: 2 });
  void NEON;
}
