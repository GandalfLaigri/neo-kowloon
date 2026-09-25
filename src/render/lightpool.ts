import * as THREE from 'three';
import { NUM_PL } from '../config';
import type { LightSrc } from '../world/builder';
import { shared } from './materials';

const GAIN = 0.5;

/** Grésillement d'une source défaillante (coupures brèves et irrégulières). */
function flicker(t: number, seed: number) {
  const tt = Math.floor(t * 14);
  let h = Math.sin(tt * 12.9898 + seed * 78.233) * 43758.5453;
  h -= Math.floor(h);
  const slow = Math.sin(t * 0.7 + seed) > -0.6 ? 1 : 0.35; // longues pannes occasionnelles
  return (h > 0.1 ? 1 : 0.1) * slow;
}

/**
 * Sélectionne les NUM_PL sources les plus proches de la caméra et les pousse dans
 * les uniformes partagés. Les plus lointaines de la sélection sont atténuées
 * pour éviter les sauts visibles.
 */
export class LightPool {
  private sources: LightSrc[] = [];
  private cand: { l: LightSrc; d: number }[] = [];
  private frame = 0;
  /** Distance à la source lumineuse la plus proche (pour le grésillement des néons). */
  nearestDist = 999;
  /** Coupure : les sources du quartier blackId (champ d) sont multipliées par blackK. */
  blackId = -1;
  blackK = 1;

  add(list: LightSrc[]) {
    this.sources.push(...list);
  }

  update(cam: THREE.Vector3) {
    this.frame++;
    const cand = this.cand;
    cand.length = 0;
    const R = 160;
    for (const l of this.sources) {
      const dx = l.x - cam.x, dy = l.y - cam.y, dz = l.z - cam.z;
      const d = dx * dx + dy * dy + dz * dz;
      const reach = R + l.radius;
      if (d < reach * reach) cand.push({ l, d: Math.sqrt(d) - l.radius * 0.6 });
    }
    cand.sort((a, b) => a.d - b.d);
    this.nearestDist = cand.length ? Math.max(0, cand[0].d + cand[0].l.radius * 0.6) : 999;
    const n = Math.min(NUM_PL, cand.length);
    const dMax = n === NUM_PL ? cand[n - 1].d : R;
    const P = shared.uPL.value, C = shared.uPLC.value;
    for (let i = 0; i < NUM_PL; i++) {
      if (i < n) {
        const { l, d } = cand[i];
        const fade = THREE.MathUtils.clamp((dMax - d) / Math.max(8, dMax * 0.25), 0, 1);
        const k = fade * GAIN * (l.flicker ? flicker(shared.uTime.value, l.flicker) : 1) * (l.d === this.blackId && this.blackId >= 0 ? this.blackK : 1);
        P[i].set(l.x, l.y, l.z, l.radius);
        C[i].set(l.r * k, l.g * k, l.b * k);
      } else {
        P[i].set(0, -9999, 0, 1);
        C[i].set(0, 0, 0);
      }
    }
  }
}
