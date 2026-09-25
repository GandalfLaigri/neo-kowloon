import type * as THREE from 'three';
import type { InteractPoint } from './world/ctx';

const CELL = 16;
const DRINKS = ['Thé au jasmin synthétique', 'Neo-Cola cerise', 'Café glacé Hoshi', 'Boisson énergisante Kaiju', 'Lait de soja au melon', 'Eau minérale de Hokkaidō (probablement)', 'Soda aux perles de tapioca'];
const DISHES = ['un bol de ramen fumant', 'des raviolis vapeur', 'une brochette de calamar grillé', 'des nouilles sautées au wok', 'un bao au porc laqué', 'une soupe de nouilles au bœuf épicé'];

/** Points d'interaction indexés spatialement : sièges, distributeurs, comptoirs. */
export class Interactions {
  private grid = new Map<number, InteractPoint[]>();

  constructor(points: InteractPoint[]) {
    for (const p of points) {
      const k = this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(p);
    }
  }

  private key(i: number, j: number) { return (i + 512) * 4096 + (j + 512); }

  /** Point le plus proche (à portée de main, même niveau). */
  nearest(p: THREE.Vector3): InteractPoint | null {
    const i0 = Math.floor(p.x / CELL), j0 = Math.floor(p.z / CELL);
    let best: InteractPoint | null = null, bd = 1.7;
    for (let i = i0 - 1; i <= i0 + 1; i++)
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const l = this.grid.get(this.key(i, j));
        if (!l) continue;
        for (const q of l) {
          if (Math.abs(p.y - q.floor) > 1.3) continue;
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d < bd) { bd = d; best = q; }
        }
      }
    return best;
  }

  static prompt(q: InteractPoint): string {
    return q.kind === 'seat' ? '<b>[E]</b> S’asseoir' : q.kind === 'vend' ? '<b>[E]</b> Acheter une canette' : '<b>[E]</b> Commander à manger';
  }

  static drink() { return DRINKS[Math.floor(Math.random() * DRINKS.length)]; }
  static dish() { return DISHES[Math.floor(Math.random() * DISHES.length)]; }
}
