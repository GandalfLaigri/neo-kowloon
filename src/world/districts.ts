import { BLOCKS, HALF, NEON, PITCH, STYLE, hex, type RGB } from '../config';
import type { RNG } from '../rng';
import type { Side } from './geom';

export type DistrictId = 'centre' | 'riche' | 'asia' | 'fonds' | 'plaisirs' | 'port';
/** Ordre des quartiers (index transmis au shader, coupures de courant). */
export const DISTRICT_IDS: DistrictId[] = ['centre', 'riche', 'asia', 'fonds', 'plaisirs', 'port'];

/** Identité d'un quartier : architecture, palette, propreté, densité de vie. */
export interface District {
  id: DistrictId;
  name: string;
  map: string;            // teinte sur la carte
  neon: RGB[];            // néons, enseignes, accents des tours
  shop: RGB[];            // lumière des devantures
  lamp: RGB[];            // lampadaires
  styles: [number, number][] | null; // styles de façade pondérés (null : mélange par défaut)
  height: number;         // multiplicateur de hauteur des tours
  grime: number;          // crasse au pied des murs (0..1)
  graffiti: number;       // tags et affiches (0..1)
  puddle: number;         // flaques (0..1)
  faulty: number;         // proportion de lampadaires défaillants ou morts
  peds: number;           // densité de passants
  signs: number;          // densité d'enseignes
  screens: number;        // probabilité d'écrans géants
  neonEdges: number;      // tours cerclées de néon
  rooms: number;          // bars, arcades, cantines au rez-de-chaussée
  trash: number;          // détritus
}

const W = (h: number) => hex(h);

export const DISTRICTS: Record<DistrictId, District> = {
  centre: {
    id: 'centre', name: "Centre d'affaires", map: '#7a7aff',
    neon: NEON, shop: [W(0xffc58a), W(0xff9ad5), W(0x9ae8ff), W(0xfff1d0), W(0xc9a0ff), W(0xa0ffb4)],
    lamp: [W(0xcfe8ff), W(0x7fe9ff), W(0xc58bff), W(0xffa24a), W(0xb8ffcf)],
    styles: null, height: 1, grime: 0.55, graffiti: 0.5, puddle: 0.6, faulty: 0.2, peds: 1, signs: 1, screens: 0.4, neonEdges: 0.75, rooms: 0.24, trash: 0.6,
  },
  riche: {
    id: 'riche', name: 'Quartier Ivoire', map: '#e8dcb8',
    neon: [W(0xffe2b0), W(0x9ae8ff), W(0xffffff), W(0xc9a0ff), W(0xffd070)],
    shop: [W(0xfff4e0), W(0xffe8c0), W(0xe0f4ff), W(0xfff0f8)],
    lamp: [W(0xf0f6ff), W(0xfff0dc)],
    styles: [[STYLE.CURTAIN, 5], [STYLE.FINS, 2.5], [STYLE.GRID, 2], [STYLE.RIBBON, 1]],
    height: 1.2, grime: 0.08, graffiti: 0, puddle: 0.35, faulty: 0.02, peds: 0.75, signs: 0.45, screens: 0.55, neonEdges: 0.45, rooms: 0.16, trash: 0,
  },
  asia: {
    id: 'asia', name: 'Quartier de Jade', map: '#ff5a3a',
    neon: [W(0xff3b3b), W(0xffb000), W(0x2aff9a), W(0xff2a6a), W(0xffd23a)],
    shop: [W(0xffb070), W(0xff8a50), W(0xffd690), W(0xff6a50), W(0xa0ffc0)],
    lamp: [W(0xffb060), W(0xffd690), W(0xff8a50)],
    styles: [[STYLE.DENSE, 4.5], [STYLE.GRID, 2.5], [STYLE.HERITAGE, 1.5], [STYLE.CAPSULE, 1.5]],
    height: 0.75, grime: 0.8, graffiti: 0.35, puddle: 0.75, faulty: 0.18, peds: 1.35, signs: 2.2, screens: 0.3, neonEdges: 0.6, rooms: 0.38, trash: 0.8,
  },
  fonds: {
    id: 'fonds', name: 'Les Bas-Fonds', map: '#7a9a3a',
    neon: [W(0x9aff3a), W(0xff7a1a), W(0xff3b3b), W(0x3affc0)],
    shop: [W(0xb8ffb0), W(0xffc070), W(0xd8a080)],
    lamp: [W(0xffa24a), W(0xb8ffcf), W(0xffa24a)],
    styles: [[STYLE.DENSE, 4.5], [STYLE.HERITAGE, 2], [STYLE.INDUSTRIAL, 2], [STYLE.GRID, 1.5]],
    height: 0.5, grime: 1, graffiti: 1, puddle: 1, faulty: 0.55, peds: 0.8, signs: 0.9, screens: 0.1, neonEdges: 0.3, rooms: 0.2, trash: 1,
  },
  plaisirs: {
    id: 'plaisirs', name: 'Quartier des Plaisirs', map: '#ff4fd8',
    neon: [W(0xff2a9d), W(0xa64dff), W(0x00e5ff), W(0xff4fd8), W(0xff6ac8)],
    shop: [W(0xff9ad5), W(0xc9a0ff), W(0xff80c0), W(0x9ae8ff)],
    lamp: [W(0xc58bff), W(0xff7ad8), W(0x7fe9ff)],
    styles: [[STYLE.GRID, 3.5], [STYLE.RIBBON, 3.5], [STYLE.DENSE, 2], [STYLE.CAPSULE, 1.5]],
    height: 0.85, grime: 0.65, graffiti: 0.75, puddle: 0.85, faulty: 0.12, peds: 1.8, signs: 2.6, screens: 0.8, neonEdges: 0.95, rooms: 0.5, trash: 0.8,
  },
  port: {
    id: 'port', name: 'Les Docks', map: '#4aa0d0',
    neon: [W(0xffa24a), W(0xffd070), W(0x00e5ff)],
    shop: [W(0xffc070), W(0xd8e8ff)],
    lamp: [W(0xff9a3a), W(0xffb050)],
    styles: [[STYLE.INDUSTRIAL, 7], [STYLE.HERITAGE, 2]],
    height: 0.3, grime: 0.9, graffiti: 0.6, puddle: 0.95, faulty: 0.3, peds: 0.4, signs: 0.35, screens: 0.1, neonEdges: 0.2, rooms: 0.12, trash: 0.7,
  },
};

/** Répartition des îlots en quartiers ; la mer borde un côté du secteur. */
export class DistrictMap {
  readonly grid: DistrictId[] = [];
  /** Côté de la mer : 0 -z · 1 +x · 2 +z · 3 -x. */
  readonly sea: Side;

  constructor(rng: RNG) {
    this.sea = rng.int(0, 3) as Side;
    const flip = rng.chance(0.5);
    // ancres (u le long de la côte, v en s'éloignant de la mer) et poids
    const anchors: [DistrictId, number, number, number][] = [
      ['centre', 4.5, 5.0, 1.1],
      ['riche', 2.3, 7.6, 0.2],
      ['plaisirs', 7.3, 6.8, 0.2],
      ['asia', 2.0, 2.8, 0.2],
      ['fonds', 7.8, 2.3, 0.3],
    ].map(([id, u, v, w]) => [id as DistrictId, (u as number) + rng.range(-0.6, 0.6), (v as number) + rng.range(-0.6, 0.6), w as number]);
    for (let bi = 0; bi < BLOCKS; bi++)
      for (let bj = 0; bj < BLOCKS; bj++) {
        let [u, v] = this.uv(bi, bj);
        if (flip) u = BLOCKS - 1 - u;
        let id: DistrictId = 'centre';
        if (v === 0 && u >= 1 && u <= BLOCKS - 2) id = 'port';
        else {
          let best = Infinity;
          for (const [a, au, av, w] of anchors) {
            const d = Math.hypot(u - au, v - av) - w;
            if (d < best) { best = d; id = a; }
          }
        }
        this.grid[bi * BLOCKS + bj] = id;
      }
  }

  /** (u le long de la côte, v = rang depuis la mer) d'un îlot. */
  private uv(bi: number, bj: number): [number, number] {
    switch (this.sea) {
      case 0: return [bi, bj];
      case 2: return [bi, BLOCKS - 1 - bj];
      case 3: return [bj, bi];
      default: return [bj, BLOCKS - 1 - bi];
    }
  }

  /** Rang d'un îlot depuis la mer (0 : en front de mer). */
  seaRank(bi: number, bj: number) { return this.uv(bi, bj)[1]; }

  static index(x: number, z: number): [number, number] {
    const bi = Math.max(0, Math.min(BLOCKS - 1, Math.floor((x + HALF) / PITCH)));
    const bj = Math.max(0, Math.min(BLOCKS - 1, Math.floor((z + HALF) / PITCH)));
    return [bi, bj];
  }

  idAt(x: number, z: number): DistrictId {
    const [bi, bj] = DistrictMap.index(x, z);
    return this.grid[bi * BLOCKS + bj];
  }

  at(x: number, z: number): District {
    return DISTRICTS[this.idAt(x, z)];
  }

  /** Texture (un texel par îlot) : r crasse, g tags, b flaques. */
  texture(): Uint8Array {
    const d = new Uint8Array(BLOCKS * BLOCKS * 4);
    for (let bj = 0; bj < BLOCKS; bj++)
      for (let bi = 0; bi < BLOCKS; bi++) {
        const D = DISTRICTS[this.grid[bi * BLOCKS + bj]];
        const o = (bj * BLOCKS + bi) * 4;
        d[o] = Math.round(D.grime * 255);
        d[o + 1] = Math.round(D.graffiti * 255);
        d[o + 2] = Math.round(D.puddle * 255);
        d[o + 3] = DISTRICT_IDS.indexOf(D.id) * 32;
      }
    return d;
  }
}

export function pickWeighted<T>(rng: RNG, items: [T, number][]): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = rng.next() * tot;
  for (const [v, w] of items) { x -= w; if (x <= 0) return v; }
  return items[items.length - 1][0];
}
