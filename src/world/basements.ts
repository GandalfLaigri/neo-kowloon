import { NEON, STYLE, hex, type RGB } from '../config';
import { snap } from '../rng';
import { dark, type Ctx } from './ctx';
import { faceCoord, overlaps, rectSubAll, sideRect, type Rect, type Side } from './geom';

export const BASE_FLOOR = -6;

export interface Basement {
  rect: Rect;      // emprise souterraine
  stair: Rect;     // trémie d'escalier (trou dans la dalle)
  axis: 0 | 1;     // l'escalier descend le long de x (0) ou z (1)
  dir: 1 | -1;     // sens de descente
  kind: number;    // 0 club · 1 marché noir · 2 parking désaffecté
  name: string;
}

const NAMES = [['Club Yami', 'Club Oni-bi', 'Club Kage'], ['Marché noir', 'Bazar souterrain', 'Ruelle des puces'], ['Parking P-3', 'Niveau technique', 'Tunnel de service']];

export interface Plaza { rect: Rect; streetSides: Side[] }

/** Choisit les sous-sols (sous les places et quelques ruelles) avant la pose des dalles. */
export function planBasements(ctx: Ctx, plazas: Plaza[], alleys: Rect[]): Basement[] {
  const { rng } = ctx;
  const out: Basement[] = [];
  const ok = (r: Rect) => out.every((b) => !overlaps(b.rect, r, 2));
  const mk = (rect: Rect, stair: Rect, axis: 0 | 1): Basement => {
    const kind = rng.int(0, 2);
    return { rect, stair, axis, dir: rng.chance(0.5) ? 1 : -1, kind, name: rng.pick(NAMES[kind]) };
  };
  for (const P of plazas) {
    if (!rng.chance(0.6) || !P.streetSides.length) continue;
    const s = rng.pick(P.streetSides);
    const F = faceCoord(P.rect, s);
    const [pa0, pa1] = s === 0 || s === 2 ? [P.rect.x0, P.rect.x1] : [P.rect.z0, P.rect.z1];
    if (pa1 - pa0 < 16) continue;
    const a = snap(rng.range(pa0 + 2.5, pa1 - 13.5));
    const stair = sideRect(s, F, a, a + 11, -4, -1.5);
    let rect: Rect = { x0: P.rect.x0 + 1, z0: P.rect.z0 + 1, x1: P.rect.x1 - 1, z1: P.rect.z1 - 1 };
    // on limite la taille (grands lots) autour de la trémie
    const cx = (stair.x0 + stair.x1) / 2, cz = (stair.z0 + stair.z1) / 2;
    rect = { x0: Math.max(rect.x0, cx - 20), x1: Math.min(rect.x1, cx + 20), z0: Math.max(rect.z0, cz - 20), z1: Math.min(rect.z1, cz + 20) };
    if (!ok(rect)) continue;
    out.push(mk(rect, stair, s === 0 || s === 2 ? 0 : 1));
  }
  let nAlley = 0;
  for (const A of alleys) {
    if (nAlley >= 10 || !rng.chance(0.3)) continue;
    const alongX = A.x1 - A.x0 > A.z1 - A.z0;
    const len = alongX ? A.x1 - A.x0 : A.z1 - A.z0;
    if (len < 26) continue;
    const p = snap(rng.range((alongX ? A.x0 : A.z0) + 7, (alongX ? A.x1 : A.z1) - 18));
    const mid = alongX ? (A.z0 + A.z1) / 2 : (A.x0 + A.x1) / 2;
    const stair: Rect = alongX
      ? { x0: p, x1: p + 11, z0: mid - 1.25, z1: mid + 1.25 }
      : { x0: mid - 1.25, x1: mid + 1.25, z0: p, z1: p + 11 };
    const rect: Rect = alongX
      ? { x0: p - 6, x1: p + 17, z0: mid - 9, z1: mid + 9 }
      : { x0: mid - 9, x1: mid + 9, z0: p - 6, z1: p + 17 };
    if (!ok(rect)) continue;
    out.push(mk(rect, stair, alongX ? 0 : 1));
    nAlley++;
  }
  return out;
}

export function buildBasement(ctx: Ctx, b: Basement) {
  const { rng } = ctx;
  const B = b.rect, S = b.stair, FY = BASE_FLOOR;
  const concrete = hex(0x2b2a2e);
  const kindCol: RGB[][] = [[hex(0xff2a9d), hex(0x00e5ff)], [hex(0xff6a1f), hex(0xffb000)], [hex(0xb8ffcf), hex(0xffa24a)]];
  const [c1, c2] = kindCol[b.kind];

  // dalle, murs, plafond (percé au-dessus de l'escalier)
  ctx.box(B, FY - 0.5, FY, { color: hex(0x242329), style: STYLE.GROUND, seed: rng.byte() });
  ctx.box({ ...B, x1: B.x0 + 0.5 }, FY, 0, { color: concrete, seed: rng.byte() });
  ctx.box({ ...B, x0: B.x1 - 0.5 }, FY, 0, { color: concrete, seed: rng.byte() });
  ctx.box({ ...B, x0: B.x0 + 0.5, x1: B.x1 - 0.5, z1: B.z0 + 0.5 }, FY, 0, { color: concrete, seed: rng.byte() });
  ctx.box({ ...B, x0: B.x0 + 0.5, x1: B.x1 - 0.5, z0: B.z1 - 0.5 }, FY, 0, { color: concrete, seed: rng.byte() });
  for (const r of rectSubAll(B, [S])) ctx.box(r, -0.5, 0, { color: hex(0x1b1a1f) });

  // cage d'escalier fermée sur les côtés, ouverte en bas
  const ax = b.axis === 0;
  const L0 = ax ? S.x0 : S.z0, L1 = ax ? S.x1 : S.z1;
  const W0 = ax ? S.z0 : S.x0, W1 = ax ? S.z1 : S.x1;
  const Rl = (l0: number, l1: number, w0: number, w1: number): Rect =>
    ax ? { x0: Math.min(l0, l1), x1: Math.max(l0, l1), z0: w0, z1: w1 } : { x0: w0, x1: w1, z0: Math.min(l0, l1), z1: Math.max(l0, l1) };
  const top = b.dir > 0 ? L0 : L1; // extrémité haute (entrée depuis la rue)
  ctx.box(Rl(L0, L1, W0 - 0.3, W0), FY, 0, { color: concrete, seed: 11 });
  ctx.box(Rl(L0, L1, W1, W1 + 0.3), FY, 0, { color: concrete, seed: 12 });
  ctx.box(Rl(top - b.dir * 0.3, top, W0 - 0.3, W1 + 0.3), FY, 0, { color: concrete, seed: 13 });
  for (let i = 1; i <= 12; i++) {
    const t = 0.5 - 0.5 * i;
    const l0 = top + b.dir * (i - 1) * 0.8, l1 = top + b.dir * i * 0.8;
    ctx.box(Rl(l0, l1, W0, W1), FY, t, { color: hex(0x2f2e33), style: STYLE.GROUND, seed: 5 });
  }
  // néon de guidage dans la cage + garde-corps en surface
  ctx.box(Rl(L0 + 0.5, L1 - 0.5, W0 - 0.05, W0), -2.8, -2.65, { color: c1, style: STYLE.EMISSIVE, emis: 2, solid: false, extra: rng.chance(0.4) ? 3 : 0, seed: rng.byte() });
  ctx.box(Rl(L0, L1, W0 - 0.15, W0), 0.5, 1.5, { color: hex(0x1d1f24) });
  ctx.box(Rl(L0, L1, W1, W1 + 0.15), 0.5, 1.5, { color: hex(0x1d1f24) });
  const bot = b.dir > 0 ? L1 : L0;
  ctx.box(Rl(bot - b.dir * 0.15, bot, W0 - 0.15, W1 + 0.15), 0.5, 1.5, { color: hex(0x1d1f24) });
  ctx.reserve(Rl(top - b.dir * 2.5, bot, W0 - 1, W1 + 1), 0.5, 4);
  // enseigne verticale à l'entrée
  const sign = Rl(top - b.dir * 0.6, top - b.dir * 1.1, W1 + 0.2, W1 + 2.7);
  if (ctx.free(sign, 0.5, 6.5)) {
    ctx.box(Rl(top - b.dir * 0.7, top - b.dir * 1.0, W1 + 0.3, W1 + 0.6), 0.5, 3, { color: hex(0x1d1f24) });
    ctx.box(sign, 3, 6, { color: c1, style: STYLE.SIGN, emis: 2.6, seed: rng.byte(), extra: 1 });
  }
  const cS = Rl((L0 + L1) / 2, (L0 + L1) / 2, (W0 + W1) / 2, (W0 + W1) / 2);
  ctx.world.light(cS.x0, -2.5, cS.z0, c1, 1.6, 12, rng.chance(0.4) ? rng.byte() + 1 : undefined);
  ctx.world.light(cS.x0, 3, cS.z0, c1, 1.2, 9);
  ctx.world.emitSteam(cS.x0, -1, cS.z0, 1.2, 6, 10, dark(c1, 0.6));

  // tuyaux au plafond, tubes fluorescents
  const long = B.x1 - B.x0 > B.z1 - B.z0;
  for (let i = 0; i < 3; i++) {
    const off = 1.5 + i * 0.6;
    const r = long ? { x0: B.x0 + 0.5, x1: B.x1 - 0.5, z0: B.z0 + off, z1: B.z0 + off + 0.35 } : { x0: B.x0 + off, x1: B.x0 + off + 0.35, z0: B.z0 + 0.5, z1: B.z1 - 0.5 };
    ctx.box(r, -1.4 + i * 0.2, -1.05 + i * 0.2, { color: rng.pick([hex(0x4a3a30), hex(0x3a4040), hex(0x5a4a2a)]), solid: false });
  }
  const tube = hex(0xd8ffe8);
  for (let x = B.x0 + 3; x < B.x1 - 2; x += 6)
    for (let z = B.z0 + 3; z < B.z1 - 2; z += 6) {
      const r = { x0: x, x1: x + 1.5, z0: z, z1: z + 0.2 };
      if (overlaps(r, S, 0.5)) continue;
      const faulty = rng.chance(0.35);
      const broken = rng.chance(0.15);
      ctx.box(r, -0.65, -0.5, { color: tube, style: STYLE.EMISSIVE, emis: broken ? 0.1 : 1.6, extra: faulty ? 3 : 0, seed: rng.byte(), solid: false });
      if (!broken && rng.chance(0.5)) ctx.world.light(x + 0.75, -1.5, z, b.kind === 2 ? tube : c2, 1.0, 11, faulty ? rng.byte() + 1 : undefined);
    }

  // piliers
  const pillars: Rect[] = [];
  for (let x = B.x0 + 6; x < B.x1 - 4; x += 8)
    for (let z = B.z0 + 6; z < B.z1 - 4; z += 8) {
      const r = { x0: x, x1: x + 0.75, z0: z, z1: z + 0.75 };
      if (overlaps(r, S, 1.5)) continue;
      ctx.box(r, FY, -0.5, { color: concrete, seed: rng.byte() });
      pillars.push(r);
    }

  const free = (r: Rect, h: number) => !overlaps(r, S, 1.2) && ctx.free(r, FY + 0.05, FY + h);
  const inner = { x0: B.x0 + 1, x1: B.x1 - 1, z0: B.z0 + 1, z1: B.z1 - 1 };
  const rp = () => [snap(rng.range(inner.x0, inner.x1 - 2)), snap(rng.range(inner.z0, inner.z1 - 2))];

  if (b.kind === 0) {
    // Club : bar, cabine de DJ à écrans, néons muraux, brume de machine à fumée
    const wallBar = { x0: B.x0 + 0.5, x1: B.x0 + 1.5, z0: B.z0 + 3, z1: B.z1 - 3 };
    if (free(wallBar, 1.2)) {
      ctx.box(wallBar, FY, FY + 1.1, { color: hex(0x1a1418) });
      ctx.box({ ...wallBar, x0: wallBar.x1, x1: wallBar.x1 + 0.08 }, FY + 0.9, FY + 1.0, { color: c1, style: STYLE.EMISSIVE, emis: 2.5, solid: false });
    }
    const booth = { x0: B.x1 - 3, x1: B.x1 - 1.5, z0: (B.z0 + B.z1) / 2 - 2, z1: (B.z0 + B.z1) / 2 + 2 };
    if (free(booth, 2)) {
      ctx.box(booth, FY, FY + 1.2, { color: hex(0x15151a) });
      ctx.box({ ...booth, x0: booth.x1, x1: booth.x1 + 0.5 }, FY + 1.2, FY + 4.2, { color: hex(0x111111), style: STYLE.SCREEN, emis: 2.4, seed: rng.byte() });
    }
    for (const w of [B.z0 + 0.5, B.z1 - 0.55])
      ctx.box({ x0: B.x0 + 1, x1: B.x1 - 1, z0: w, z1: w + 0.05 }, FY + 3.2, FY + 3.35, { color: rng.pick([c1, c2]), style: STYLE.EMISSIVE, emis: 2.2, extra: 2, seed: rng.byte(), solid: false });
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    ctx.world.light(cx - 4, FY + 4, cz, c1, 2.2, 14);
    ctx.world.light(cx + 4, FY + 4, cz, c2, 2.2, 14);
    ctx.world.emitSteam(cx, FY + 0.2, cz, 3, 3, 16, dark(c1, 0.5));
    for (let i = 0; i < rng.int(6, 12); i++) {
      const x = rng.range(cx - 6, cx + 6), z = rng.range(cz - 5, cz + 5);
      if (ctx.free({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, FY + 0.1, FY + 1.8)) ctx.pose(x, FY, z, rng.range(-Math.PI, Math.PI), rng.chance(0.8) ? 6 : 5);
    }
  } else if (b.kind === 1) {
    // Marché noir : étals, caisses, lampions
    for (let i = 0; i < 14; i++) {
      const [x, z] = rp();
      const st = { x0: x, x1: x + 3, z0: z, z1: z + 1 };
      if (!free({ ...st, z0: z - 1.2, z1: z + 1.2 }, 2.5)) continue;
      ctx.box(st, FY, FY + 1.0, { color: hex(0x3a2a1e) });
      for (let k = 0; k < 4; k++)
        ctx.box({ x0: x + k * 0.75 + 0.1, x1: x + k * 0.75 + 0.6, z0: z + 0.2, z1: z + 0.8 }, FY + 1.0, FY + 1.0 + rng.range(0.2, 0.5), { color: rng.pick(NEON), style: STYLE.EMISSIVE, emis: 0.8, solid: false });
      ctx.box({ x0: x - 0.2, x1: x + 3.2, z0: z - 1.2, z1: z + 1.2 }, FY + 2.6, FY + 2.7, { color: dark(rng.pick(NEON), 0.3), solid: false });
      ctx.box({ x0: x + 1.3, x1: x + 1.7, z0: z - 0.9, z1: z - 0.5 }, FY + 2.0, FY + 2.5, { color: hex(0xff3a20), style: STYLE.EMISSIVE, emis: 2.5, extra: 2, seed: rng.byte(), solid: false });
      ctx.world.light(x + 1.5, FY + 2.2, z - 0.7, hex(0xff7a30), 1.3, 7);
      ctx.pose(x + 1.5, FY, z + 1.6, Math.PI, rng.chance(0.5) ? 4 : 3);
      if (rng.chance(0.6)) ctx.pose(x + rng.range(0.5, 2.5), FY, z - 1.8, 0, rng.chance(0.4) ? 5 : 0);
    }
    for (let i = 0; i < 10; i++) {
      const [x, z] = rp();
      const r = { x0: x, x1: x + 1, z0: z, z1: z + 1 };
      if (free(r, 1)) ctx.box(r, FY, FY + rng.pick([0.5, 1, 1.5]), { color: rng.pick([hex(0x6a4a2a), hex(0x4a5a3a)]) });
    }
  } else {
    // Parking désaffecté : épaves, fût enflammé, flaques, détritus
    for (let i = 0; i < 8; i++) {
      const [x, z] = rp();
      const alongXc = rng.chance(0.5);
      const r = alongXc ? { x0: x, x1: x + 4.2, z0: z, z1: z + 1.9 } : { x0: x, x1: x + 1.9, z0: z, z1: z + 4.2 };
      if (!free(r, 1.6)) continue;
      const col = rng.pick([hex(0x2a2e36), hex(0x4a2a24), hex(0x3a3a30), hex(0x20303a)]);
      ctx.box(r, FY, FY + 1.0, { color: col, seed: rng.byte() });
      const cab = alongXc ? { x0: x + 1, x1: x + 3, z0: z + 0.15, z1: z + 1.75 } : { x0: x + 0.15, x1: x + 1.75, z0: z + 1, z1: z + 3 };
      ctx.box(cab, FY + 1.0, FY + 1.55, { color: hex(0x0c0e12) });
    }
    const [bx, bz] = rp();
    const barrel = { x0: bx, x1: bx + 0.8, z0: bz, z1: bz + 0.8 };
    if (free({ x0: bx - 1.5, x1: bx + 2.3, z0: bz - 1.5, z1: bz + 2.3 }, 1.5)) {
      ctx.box(barrel, FY, FY + 1.1, { color: hex(0x3a2a22) });
      ctx.box({ x0: bx + 0.1, x1: bx + 0.7, z0: bz + 0.1, z1: bz + 0.7 }, FY + 1.1, FY + 1.35, { color: hex(0xff6a1f), style: STYLE.EMISSIVE, emis: 5, extra: 3, seed: rng.byte(), solid: false });
      ctx.world.light(bx + 0.4, FY + 2, bz + 0.4, hex(0xff7a30), 2.4, 12, rng.byte() + 1);
      ctx.world.emitSteam(bx + 0.4, FY + 1.3, bz + 0.4, 0.8, 5, 14, hex(0x3a2a24));
      for (const [dx, dz, yw] of [[-1.1, 0.4, Math.PI / 2], [1.9, 0.4, -Math.PI / 2], [0.4, -1.1, 0]] as const)
        if (rng.chance(0.8)) ctx.pose(bx + dx, FY, bz + dz, yw, 10);
    }
    for (let i = 0; i < 18; i++) {
      const [x, z] = rp();
      const w = rng.pick([0.5, 0.75]);
      const r = { x0: x, x1: x + w, z0: z, z1: z + w };
      if (free(r, 0.6)) ctx.box(r, FY, FY + rng.pick([0.25, 0.4, 0.5]), { color: rng.pick([hex(0x111214), hex(0x1a2a1a), hex(0x6a4a2a), hex(0x1a2440)]), solid: false });
    }
  }
  void pillars;
}
