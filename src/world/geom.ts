// Outils géométriques partagés par les générateurs.

export type Side = 0 | 1 | 2 | 3; // 0:-z  1:+x  2:+z  3:-x
export const SV: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const OPP: Side[] = [2, 3, 0, 1];
export const SIDES: Side[] = [0, 1, 2, 3];

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Seg extends Rect { y0: number; y1: number }

export const faceCoord = (r: Rect, s: Side) => (s === 0 ? r.z0 : s === 1 ? r.x1 : s === 2 ? r.z1 : r.x0);
export const alongRange = (r: Rect, s: Side): [number, number] => (s === 0 || s === 2 ? [r.x0, r.x1] : [r.z0, r.z1]);
/** Distance "vers l'extérieur" d'une coordonnée par rapport à la face F du côté s. */
export const outOf = (s: Side, F: number, c: number) => (s === 0 ? F - c : s === 2 ? c - F : s === 1 ? c - F : F - c);

/** Rectangle défini par un intervalle le long de la face et un intervalle de distance vers l'extérieur. */
export function sideRect(s: Side, F: number, a0: number, a1: number, o0: number, o1: number): Rect {
  switch (s) {
    case 0: return { x0: a0, x1: a1, z0: F - o1, z1: F - o0 };
    case 2: return { x0: a0, x1: a1, z0: F + o0, z1: F + o1 };
    case 1: return { x0: F + o0, x1: F + o1, z0: a0, z1: a1 };
    default: return { x0: F - o1, x1: F - o0, z0: a0, z1: a1 };
  }
}

/** Point (x, z) exprimé en coordonnées (le long, vers l'extérieur) d'une face. */
export function sidePoint(s: Side, F: number, a: number, o: number): [number, number] {
  const r = sideRect(s, F, a, a, o, o);
  return [r.x0, r.z0];
}

export const overlaps = (a: Rect, b: Rect, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
export const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, z0: r.z0 + d, x1: r.x1 - d, z1: r.z1 - d });

/** A privé de R (R peut dépasser de A) : jusqu'à 4 rectangles. */
export function rectSub(A: Rect, R: Rect): Rect[] {
  const r = { x0: Math.max(A.x0, R.x0), x1: Math.min(A.x1, R.x1), z0: Math.max(A.z0, R.z0), z1: Math.min(A.z1, R.z1) };
  if (r.x1 <= r.x0 || r.z1 <= r.z0) return [A];
  const out: Rect[] = [];
  if (r.x0 > A.x0) out.push({ x0: A.x0, x1: r.x0, z0: A.z0, z1: A.z1 });
  if (r.x1 < A.x1) out.push({ x0: r.x1, x1: A.x1, z0: A.z0, z1: A.z1 });
  if (r.z0 > A.z0) out.push({ x0: r.x0, x1: r.x1, z0: A.z0, z1: r.z0 });
  if (r.z1 < A.z1) out.push({ x0: r.x0, x1: r.x1, z0: r.z1, z1: A.z1 });
  return out;
}

/** A privé de plusieurs trous. */
export function rectSubAll(A: Rect, holes: Rect[]): Rect[] {
  let out = [A];
  for (const h of holes) out = out.flatMap((r) => rectSub(r, h));
  return out;
}

export function subtractIntervals(r: [number, number], gaps: [number, number][]): [number, number][] {
  let out: [number, number][] = [r];
  for (const [g0, g1] of gaps) {
    const next: [number, number][] = [];
    for (const [p0, p1] of out) {
      if (g1 <= p0 || g0 >= p1) { next.push([p0, p1]); continue; }
      if (g0 > p0) next.push([p0, g0]);
      if (g1 < p1) next.push([g1, p1]);
    }
    out = next;
  }
  return out;
}
