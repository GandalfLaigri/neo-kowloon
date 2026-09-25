import { BLOCKS, HALF, PITCH, STRATUM } from './config';
import { DISTRICTS, DISTRICT_IDS } from './world/districts';
import type { ElevContext } from './elevators';
import type { MetroContext } from './metro';
import type { City } from './world/city';
import type { Dest } from './world/ctx';
import { lineFrame } from './world/metro';

const css = (c: number[]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private alt = $('alt');
  private mode = $('mode');
  private prompt = $('prompt');
  private elev = $('elev');
  private fps = $('fps');
  private toastEl = $('toast');
  private help = $('help');
  private toastTimer = 0;
  private lastElevKey = '';
  private frames = 0;
  private acc = 0;

  private train = $('train');
  private district = $('district');

  setDistrict(name: string, color: string) {
    this.district.textContent = name;
    this.district.style.color = color;
  }
  private lastTrainKey = '';

  setMetro(ctx: MetroContext): string {
    if (!ctx || ctx.kind !== 'train') {
      if (this.lastTrainKey) {
        this.train.classList.add('hidden');
        this.lastTrainKey = '';
      }
      if (ctx?.kind === 'platform') {
        const eta = ctx.eta === null ? '' : ctx.eta < 1 ? ' — <b>rame à quai</b>' : ` — prochaine rame ~${Math.max(1, Math.round(ctx.eta))} s`;
        return `<span style="color:${css(ctx.line.color)}">■</span> Station <b>${ctx.station}</b> · ${ctx.line.name}${eta}`;
      }
      return '';
    }
    const key = `${ctx.line.id}:${ctx.station}:${ctx.next}:${ctx.doorsOpen}`;
    if (key !== this.lastTrainKey) {
      this.lastTrainKey = key;
      const col = css(ctx.line.color);
      const now = ctx.station ? `Arrêt : <b>${ctx.station}</b>${ctx.doorsOpen ? ' · portes ouvertes' : ''}` : `Prochain arrêt : <b>${ctx.next}</b>`;
      const rows = ctx.line.stations
        .map((s) => `<div class="row ${s.name === ctx.station ? 'cur' : s.name === ctx.next && !ctx.station ? 'tgt' : ''}"><span class="k" style="color:${col}">●</span><span>${s.name}</span></div>`)
        .join('');
      this.train.innerHTML = `<h3 style="color:${col}">${ctx.line.name.toUpperCase()} · DIRECTION ${ctx.terminus.toUpperCase()}</h3>${rows}<div class="foot">${now}</div>`;
      this.train.classList.remove('hidden');
    }
    return '';
  }

  setAltitude(y: number) {
    if (y < -0.5) {
      this.alt.textContent = `SOUS-SOL · ${Math.round(y - 0.5)} m`;
      return;
    }
    const m = Math.max(0, Math.round(y - 0.5));
    const lvl = Math.floor(m / STRATUM);
    this.alt.textContent = `ALT ${String(m).padStart(3, '0')} m  ·  ${lvl === 0 ? 'SOL' : 'STRATE ' + lvl}`;
  }

  setMode(fly: boolean | string) {
    const s = typeof fly === 'string' ? fly : fly ? 'VOL LIBRE' : 'À PIED';
    if (this.mode.textContent !== s) this.mode.textContent = s;
  }

  setPrompt(html: string) {
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  toggleHelp() {
    this.help.classList.toggle('hidden');
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), 2600);
  }

  tick(dt: number) {
    this.frames++;
    this.acc += dt;
    if (this.acc > 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.acc)} FPS`;
      this.frames = 0;
      this.acc = 0;
    }
  }

  setElevator(ctx: ElevContext) {
    if (!ctx || ctx.kind !== 'inside') {
      if (this.lastElevKey) {
        this.elev.classList.add('hidden');
        this.lastElevKey = '';
      }
      return;
    }
    const e = ctx.e;
    const moving = e.state !== 'idle';
    const key = `${e.def.id}:${e.cur}:${e.target}:${moving}`;
    if (key === this.lastElevKey) return;
    this.lastElevKey = key;
    const rows = e.def.stops
      .map((s, i) => ({ s, i }))
      .reverse()
      .map(({ s, i }) => {
        const cls = moving && i === e.target ? 'tgt' : !moving && i === e.cur ? 'cur' : '';
        return `<div class="row ${cls}"><span class="k">${i + 1}</span><span>${s.label}</span></div>`;
      })
      .join('');
    this.elev.innerHTML = `<h3>${e.def.towerName.toUpperCase()}</h3>${rows}<div class="foot">1–${e.def.stops.length} : choisir · E : étage suivant</div>`;
    this.elev.classList.remove('hidden');
  }
}

/** Couleurs des catégories de destinations. */
const CAT_COLS: Record<string, string> = {
  'Métro': '#ffb000', 'Sous-sols': '#ffe14a', 'Toits': '#ffd6a0', 'Étages': '#e8f4ff', 'Bars': '#ff5fb0',
  'Marchés': '#ff8a40', 'Points de vue': '#00e5ff', 'Héliports': '#40ffb0', 'Scènes': '#ff3b3b', 'Lieux uniques': '#c8ff4a', 'Port': '#4aa0d0',
};

/** Carte du quartier (touche M) : lecture seule en jeu, cliquable pour se téléporter. */
export class MapView {
  private canvas = $('map') as HTMLCanvasElement;
  private list = $('dests');
  private ctx = this.canvas.getContext('2d')!;
  private base: HTMLCanvasElement;
  private k: number;
  private hover: Dest | null = null;
  visible = false;
  interactive = false;
  onPick: ((d: Dest) => void) | null = null;

  constructor(private city: City) {
    const S = this.canvas.width;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = S;
    const g = this.base.getContext('2d')!;
    const k = (this.k = S / ((HALF + 20) * 2));
    const X = (x: number) => (x + HALF + 20) * k;
    g.fillStyle = '#07050d';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#15121f';
    g.fillRect(X(-HALF), X(-HALF), (HALF * 2) * k, (HALF * 2) * k);
    // quartiers : teinte de fond par îlot
    for (let bi = 0; bi < BLOCKS; bi++)
      for (let bj = 0; bj < BLOCKS; bj++) {
        const D = DISTRICTS[city.districts.grid[bi * BLOCKS + bj]];
        g.fillStyle = D.map;
        g.globalAlpha = 0.16;
        g.fillRect(X(-HALF + bi * PITCH), X(-HALF + bj * PITCH), PITCH * k, PITCH * k);
        g.globalAlpha = 1;
      }
    for (const { rect: p } of city.plazas) {
      g.fillStyle = 'rgba(255,150,40,0.25)';
      g.fillRect(X(p.x0), X(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
    }
    for (const t of city.towers) {
      const s = t.segs[0];
      const h = Math.min(1, t.H / 560);
      g.fillStyle = `hsl(${270 - h * 60}, ${35 + h * 40}%, ${14 + h * 34}%)`;
      g.fillRect(X(s.x0), X(s.z0), (s.x1 - s.x0) * k, (s.z1 - s.z0) * k);
      const top = t.segs[t.segs.length - 1];
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.strokeRect(X(top.x0), X(top.z0), (top.x1 - top.x0) * k, (top.z1 - top.z0) * k);
    }
    g.fillStyle = '#ff2a9d';
    for (const b of city.bridges) g.fillRect(X(b.x0), X(b.z0), Math.max(2, (b.x1 - b.x0) * k), Math.max(2, (b.z1 - b.z0) * k));
    for (const l of city.metro) {
      const { R } = lineFrame(l);
      const r = R(-HALF - 20, HALF + 20, -3.75, 3.75);
      g.fillStyle = css(l.color);
      g.globalAlpha = 0.55;
      g.fillRect(X(r.x0), X(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      g.globalAlpha = 1;
    }
    if (city.subway) {
      const l = city.subway.line;
      const { R } = lineFrame(l);
      g.strokeStyle = css(l.color);
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      const r = R(city.subway.p0, city.subway.p1, 0, 0);
      g.beginPath();
      g.moveTo(X(r.x0), X(r.z0));
      g.lineTo(X(r.x1), X(r.z1));
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1;
      for (const s of city.subway.stations) {
        const [x, z] = lineFrame(l).P(s.p, 0);
        g.fillStyle = css(l.color);
        g.fillRect(X(x) - 5, X(z) - 5, 10, 10);
        g.fillStyle = '#fff';
        g.font = 'bold 10px "Share Tech Mono", monospace';
        g.fillText('M', X(x) - 3.5, X(z) + 3.5);
      }
    }
    // eau : mer et canal
    g.fillStyle = 'rgba(40,90,140,0.55)';
    for (const w of city.coast.water) {
      const x0 = Math.max(w.x0, -HALF - 20), x1 = Math.min(w.x1, HALF + 20), z0 = Math.max(w.z0, -HALF - 20), z1 = Math.min(w.z1, HALF + 20);
      if (x1 > x0 && z1 > z0) g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    }
    for (const e of city.elevators) {
      const sv = [[0, -1], [1, 0], [0, 1], [-1, 0]][e.side];
      const isX = e.side === 0 || e.side === 2;
      const cx = isX ? e.along : e.F + sv[0] * 5;
      const cz = isX ? e.F + sv[1] * 5 : e.along;
      g.fillStyle = 'rgba(0,229,255,0.55)';
      g.beginPath();
      g.arc(X(cx), X(cz), 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // destinations
    for (const d of city.dests) {
      g.fillStyle = CAT_COLS[d.cat] ?? '#fff';
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(X(d.x), X(d.z) - 5);
      g.lineTo(X(d.x) + 5, X(d.z));
      g.lineTo(X(d.x), X(d.z) + 5);
      g.lineTo(X(d.x) - 5, X(d.z));
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
    }
    g.font = '16px "Share Tech Mono", monospace';
    g.fillStyle = '#8c86b8';
    g.fillText('NEO-KOWLOON · SECTEUR 7', 14, 24);
    // noms des quartiers au centre de leur zone
    g.font = '14px "Share Tech Mono", monospace';
    g.textAlign = 'center';
    for (const id of DISTRICT_IDS) {
      let sx = 0, sz = 0, n = 0;
      for (let bi = 0; bi < BLOCKS; bi++)
        for (let bj = 0; bj < BLOCKS; bj++)
          if (city.districts.grid[bi * BLOCKS + bj] === id) { sx += -HALF + (bi + 0.5) * PITCH; sz += -HALF + (bj + 0.5) * PITCH; n++; }
      if (!n) continue;
      g.fillStyle = DISTRICTS[id].map;
      g.globalAlpha = 0.85;
      g.fillText(DISTRICTS[id].name.toUpperCase(), X(sx / n), X(sz / n));
      g.globalAlpha = 1;
    }
    g.textAlign = 'left';
    g.font = '16px "Share Tech Mono", monospace';
    let lx = 14;
    for (const [cat, col] of Object.entries(CAT_COLS)) {
      if (!city.dests.some((d) => d.cat === cat)) continue;
      g.fillStyle = col;
      g.fillText('◆ ' + cat, lx, S - 18);
      lx += g.measureText('◆ ' + cat).width + 16;
    }

    // liste des destinations, par catégorie
    const cats = Object.keys(CAT_COLS).filter((c) => city.dests.some((d) => d.cat === c));
    this.list.innerHTML = cats
      .map((c) => {
        const items = city.dests
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.cat === c)
          .map(({ d, i }) => `<button data-i="${i}">${d.name}</button>`)
          .join('');
        return `<h4 style="color:${CAT_COLS[c]}">${c}</h4>${items}`;
      })
      .join('');
    this.list.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (b && this.onPick) this.onPick(city.dests[+b.dataset.i!]);
    };
    this.canvas.onmousemove = (ev) => { this.hover = this.pickAt(ev.clientX, ev.clientY); };
    this.canvas.onclick = (ev) => {
      const d = this.pickAt(ev.clientX, ev.clientY);
      if (d && this.onPick) this.onPick(d);
    };
  }

  private pickAt(cx: number, cy: number): Dest | null {
    const r = this.canvas.getBoundingClientRect();
    const S = this.canvas.width;
    const px = ((cx - r.left) / r.width) * S, py = ((cy - r.top) / r.height) * S;
    let best: Dest | null = null, bd = 14;
    for (const d of this.city.dests) {
      const dx = (d.x + HALF + 20) * this.k - px, dz = (d.z + HALF + 20) * this.k - py;
      const dd = Math.hypot(dx, dz);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  /** Affiche / masque la carte ; en mode interactif, curseur libre et liste des destinations. */
  show(on: boolean, interactive = false) {
    this.visible = on;
    this.interactive = on && interactive;
    this.canvas.classList.toggle('hidden', !on);
    this.canvas.classList.toggle('interactive', this.interactive);
    this.list.classList.toggle('hidden', !this.interactive);
    if (!on) this.hover = null;
  }

  toggle() {
    this.show(!this.visible);
  }

  draw(x: number, z: number, yaw: number, car: { x: number; z: number } | null = null) {
    if (!this.visible) return;
    const S = this.canvas.width;
    const k = this.k;
    const g = this.ctx;
    g.drawImage(this.base, 0, 0);
    if (car) {
      // voiture garée
      const cx = (car.x + HALF + 20) * k, cz = (car.z + HALF + 20) * k;
      g.fillStyle = '#ff4fd8';
      g.shadowColor = '#ff4fd8';
      g.shadowBlur = 10;
      g.fillRect(cx - 6, cz - 4, 12, 8);
      g.shadowBlur = 0;
      g.font = '13px "Share Tech Mono", monospace';
      g.fillText('VOITURE', cx + 9, cz + 4);
    }
    const px = (x + HALF + 20) * k, pz = (z + HALF + 20) * k;
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw);
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.restore();
    if (this.hover) {
      const d = this.hover;
      const hx = (d.x + HALF + 20) * k, hz = (d.z + HALF + 20) * k;
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(hx, hz, 10, 0, Math.PI * 2);
      g.stroke();
      g.font = '15px "Share Tech Mono", monospace';
      const w = g.measureText(d.name).width;
      const tx = Math.min(S - w - 12, hx + 14);
      g.fillStyle = 'rgba(6,4,12,0.85)';
      g.fillRect(tx - 6, hz - 16, w + 12, 24);
      g.fillStyle = '#fff';
      g.fillText(d.name, tx, hz + 1);
    }
  }
}
