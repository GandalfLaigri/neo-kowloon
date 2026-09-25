import type * as THREE from 'three';
import type { City } from './world/city';
import { DISTRICTS, DISTRICT_IDS } from './world/districts';

interface Entry { id: string; cat: string; name: string; hint: string; x?: number; y?: number; z?: number; r?: number }

const CATS = ['Quartiers', 'Lieux', 'Transports', 'Expériences', 'Secrets'];

/** Textes des secrets (indices tant qu'ils ne sont pas trouvés). */
const SECRETS: Record<string, [string, string]> = {
  autel: ['L’autel caché', 'Quelqu’un entretient un petit autel au fond d’une ruelle. Suivez l’odeur d’encens.'],
  fresque: ['La fresque du toit', 'Une œuvre immense, qu’on ne voit que du ciel, recouvre un toit bas.'],
  epave: ['L’épave du toit', 'Une voiture volante s’est écrasée sur un immeuble. Elle fume encore.'],
  chat: ['Le chat du sommet', 'On raconte qu’un chat noir vit tout en haut de la plus haute tour.'],
  jardin: ['Le jardin suspendu secret', 'Un cerisier fleurit sur une terrasse oubliée, au-dessus des bas-fonds.'],
  bar: ['Le Lotus Noir', 'Un bar clandestin, sans enseigne, se cache sous une ruelle. Une lanterne rouge le trahit.'],
  tags: ['Les tags du Fantôme', 'Un graffeur signe ses œuvres d’un spectre bleu lumineux, dans cinq ruelles.'],
};

/**
 * Carnet d'exploration : quartiers, lieux, transports, expériences et secrets.
 * La progression est conservée dans le navigateur (par ville).
 */
export class Journal {
  private entries: Entry[] = [];
  private found = new Set<string>();
  private tags = new Set<string>();
  private key: string;
  private panel = document.getElementById('journal')!;
  private counter = document.getElementById('carnet')!;
  visible = false;

  constructor(city: City, seed: string) {
    this.key = `nk-carnet-${seed}`;
    for (const id of DISTRICT_IDS) this.entries.push({ id: `q-${id}`, cat: 'Quartiers', name: DISTRICTS[id].name, hint: 'Un quartier à visiter.' });
    for (const d of city.dests)
      if (d.cat === 'Lieux uniques' || d.cat === 'Port')
        if (!this.entries.some((e) => e.name === d.name)) this.entries.push({ id: `l-${d.name}`, cat: 'Lieux', name: d.name, hint: 'Un lieu remarquable (voir la carte).', x: d.x, y: d.y, z: d.z, r: 26 });
    for (const [id, name] of [['t-Ligne A', 'Ligne A (aérienne)'], ['t-Ligne B', 'Ligne B (aérienne)'], ['t-Ligne C', 'Ligne C (souterraine)'], ['t-voiture', 'La voiture volante'], ['t-ascenseur', 'Ascenseur au-dessus de 150 m']])
      this.entries.push({ id, cat: 'Transports', name, hint: 'À essayer.' });
    for (const [id, name, hint] of [
      ['x-canette', 'Boire une canette', 'Les distributeurs ne manquent pas.'],
      ['x-manger', 'Manger dans une échoppe', 'Un étal de marché, un kiosque, une charrette de rue…'],
      ['x-assis', 'S’asseoir et regarder la ville', 'Un banc, un tabouret de bar, un quai de métro.'],
      ['x-chase', 'Assister à une course-poursuite', 'La police finit toujours par surgir dans le ciel.'],
      ['x-blackout', 'Vivre une coupure de courant', 'Le réseau électrique est fragile.'],
      ['x-drones', 'Voir un spectacle de drones', 'Levez les yeux au-dessus du quartier Ivoire.'],
      ['x-dragon', 'Suivre le défilé du dragon', 'Le Quartier de Jade célèbre souvent.'],
      ['x-nuages', 'Toucher les nuages', 'Plus haut, toujours plus haut.'],
      ['x-eau', 'Tomber à l’eau', 'Le port n’a pas partout de garde-corps.'],
    ]) this.entries.push({ id, cat: 'Expériences', name, hint });
    for (const s of city.secrets) {
      if (s.id.startsWith('tag')) continue;
      const t = SECRETS[s.id];
      if (t) this.entries.push({ id: `s-${s.id}`, cat: 'Secrets', name: t[0], hint: t[1], x: s.x, y: s.y, z: s.z, r: s.r });
    }
    this.tagSpots = city.secrets.filter((s) => s.id.startsWith('tag'));
    if (this.tagSpots.length) this.entries.push({ id: 's-tags', cat: 'Secrets', name: SECRETS.tags[0], hint: SECRETS.tags[1] });
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? '{}');
      for (const id of saved.found ?? []) this.found.add(id);
      for (const id of saved.tags ?? []) this.tags.add(id);
    } catch { /* stockage indisponible */ }
    this.refresh();
  }
  private tagSpots: { id: string; x: number; y: number; z: number; r: number }[] = [];

  private save() {
    try { localStorage.setItem(this.key, JSON.stringify({ found: [...this.found], tags: [...this.tags] })); } catch { /* ignoré */ }
  }

  /** Marque une entrée ; renvoie son nom si c'est une nouvelle découverte. */
  mark(id: string): string | null {
    if (this.found.has(id)) return null;
    const e = this.entries.find((x) => x.id === id);
    if (!e) return null;
    this.found.add(id);
    this.save();
    this.refresh();
    return e.name;
  }

  /** Découvertes par proximité (lieux, secrets, tags). */
  check(p: THREE.Vector3): string | null {
    for (const e of this.entries) {
      if (e.x === undefined || this.found.has(e.id)) continue;
      if (Math.hypot(p.x - e.x, p.z - e.z!) < e.r! && Math.abs(p.y - e.y!) < Math.max(8, e.r! * 0.6)) return this.mark(e.id);
    }
    for (const t of this.tagSpots) {
      if (this.tags.has(t.id) || Math.hypot(p.x - t.x, p.z - t.z) > t.r || Math.abs(p.y - t.y) > 4) continue;
      this.tags.add(t.id);
      this.save();
      if (this.tags.size >= this.tagSpots.length) return this.mark('s-tags');
      this.refresh();
      return `Tag du Fantôme ${this.tags.size}/${this.tagSpots.length}`;
    }
    return null;
  }

  toggle() {
    this.visible = !this.visible;
    this.panel.classList.toggle('hidden', !this.visible);
    if (this.visible) this.refresh();
  }

  private refresh() {
    const n = this.entries.filter((e) => this.found.has(e.id)).length;
    this.counter.textContent = `CARNET ${n}/${this.entries.length}  ·  J`;
    if (!this.visible) return;
    const html = CATS.map((c) => {
      const list = this.entries.filter((e) => e.cat === c);
      if (!list.length) return '';
      const items = list.map((e) => {
        const ok = this.found.has(e.id);
        const extra = e.id === 's-tags' && !ok && this.tags.size ? ` (${this.tags.size}/${this.tagSpots.length})` : '';
        return ok ? `<div class="ok">✓ ${e.name}</div>` : `<div class="no">${c === 'Secrets' ? '???' : e.name}${extra}<span>${e.hint}</span></div>`;
      }).join('');
      const k = list.filter((e) => this.found.has(e.id)).length;
      return `<h4>${c} <em>${k}/${list.length}</em></h4>${items}`;
    }).join('');
    this.panel.innerHTML = `<h3>CARNET D’EXPLORATION · ${n}/${this.entries.length}</h3>${html}<div class="foot">J : fermer</div>`;
  }
}
