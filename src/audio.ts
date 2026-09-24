import * as THREE from 'three';
import type { Mover } from './traffic';

/** État du monde utile au son, recalculé à chaque image par la boucle principale. */
export interface AudioFrame {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  altitude: number;
  rain: number;        // intensité de pluie audible (0 au-dessus des nuages)
  shelter: number;     // 0 sous la pluie · 1 à l'abri
  indoor: number;      // 0 dehors · 0.5 véhicule · 1 intérieur clos
  movers: Mover[];
  trainNear: number;   // distance à la rame la plus proche
  trainSpeed: number;
  inTrain: boolean;
  inElevator: boolean;
  elevatorMoving: boolean;
  neon: number;        // distance à la source lumineuse la plus proche
  crowd: number;       // passants à proximité
  steam: number;       // distance au panache de vapeur le plus proche
  blimp: number;       // distance au dirigeable
  venue: { x: number; y: number; z: number; inside: boolean; bar: boolean } | null;
  steps: number;       // compteur de pas
  surface: 'wet' | 'metal' | 'hard';
  speed: number;
  engine: number;      // -1 : pas de voiture · 0..1 régime de la voiture volante
  radio: boolean;      // autoradio (club techno) pendant le pilotage
  bump: boolean;       // choc de la voiture contre un obstacle
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class CityAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private outdoor!: BiquadFilterNode;
  private outGain!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private reverb!: ConvolverNode;
  private layers: Record<string, { g: GainNode; f?: BiquadFilterNode; extra?: AudioNode[] }> = {};
  private voices: { g: GainNode; pan: StereoPannerNode; osc: OscillatorNode; nf: BiquadFilterNode; ng: GainNode; og: GainNode; lp: BiquadFilterNode }[] = [];
  private club!: { g: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode; bus: GainNode };
  private engine!: { g: GainNode; o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; air: GainNode };
  private nextBeat = 0;
  private beat = 0;
  private padOsc: OscillatorNode[] = [];
  private chord = 0;
  private chordAt = 0;
  private lastSteps = 0;
  private volume = 0.8;
  private musicVol = 0.5;

  /** À appeler sur un geste de l'utilisateur (politique d'autoplay). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    this.outdoor = ctx.createBiquadFilter();
    this.outdoor.type = 'lowpass';
    this.outdoor.frequency.value = 18000;
    this.outGain = ctx.createGain();
    this.outdoor.connect(this.outGain).connect(this.master);
    this.white = this.noise('white');
    this.brown = this.noise('brown');
    // réverbération (réponse impulsionnelle synthétique)
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    this.reverb.connect(rv).connect(this.master);

    // --- nappes continues ---
    this.layer('rain', this.brownish(this.white, 'lowpass', 7000), this.outdoor);
    this.layer('patter', this.brownish(this.white, 'highpass', 3500), this.outdoor);
    this.layer('wind', this.brownish(this.white, 'bandpass', 500, 0.8), this.outdoor);
    this.layer('hum', this.brownish(this.brown, 'lowpass', 180), this.outdoor);
    this.layer('traffic', this.brownish(this.brown, 'bandpass', 380, 0.7), this.outdoor);
    this.layer('neon', this.buzz(), this.master);
    this.layer('steam', this.brownish(this.white, 'highpass', 2600), this.master);
    this.layer('crowd', this.murmur(), this.master);
    this.layer('train', this.brownish(this.brown, 'lowpass', 140), this.master);
    this.layer('elev', this.brownish(this.brown, 'lowpass', 300), this.master);
    this.layer('blimp', this.drone([38, 57, 76]), this.outdoor);
    // modulation lente du vent
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(this.layers.wind.f!.frequency);
    lfo.start();

    // --- voix mobiles (véhicules, drones, sirènes) ---
    for (let i = 0; i < 7; i++) {
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
      const og = ctx.createGain(); og.gain.value = 0.5;
      const n = ctx.createBufferSource(); n.buffer = this.white; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 800; nf.Q.value = 0.9;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      osc.connect(og).connect(lp);
      n.connect(nf).connect(ng).connect(lp);
      lp.connect(g).connect(pan).connect(this.outdoor);
      osc.start(); n.start();
      this.voices.push({ g, pan, osc, nf, ng, og, lp });
    }

    // --- voiture volante : bourdonnement de turbine + souffle, selon le régime ---
    {
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 121;
      const o2g = ctx.createGain(); o2g.gain.value = 0.25;
      const air = ctx.createGain(); air.gain.value = 0.3;
      o1.connect(f); o2.connect(o2g).connect(f);
      this.brownish(this.white, 'bandpass', 1100, 0.6).connect(air).connect(g);
      f.connect(g).connect(this.master);
      o1.start(); o2.start();
      this.engine = { g, o1, o2, f, air };
    }

    // --- club : séquenceur techno, étouffé par les murs ---
    const bus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner();
    bus.connect(lp).connect(g).connect(pan).connect(this.master);
    g.connect(this.reverb);
    this.club = { g, lp, pan, bus };
    this.nextBeat = ctx.currentTime + 0.1;

    // --- nappe d'ambiance (synthés désaccordés, filtre lent) ---
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.Q.value = 0.7;
    const padG = ctx.createGain(); padG.gain.value = 0.05;
    padLp.connect(padG);
    padG.connect(this.music);
    padG.connect(this.reverb);
    const plfo = ctx.createOscillator(); plfo.frequency.value = 0.05;
    const plg = ctx.createGain(); plg.gain.value = 500;
    plfo.connect(plg).connect(padLp.frequency);
    plfo.start();
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = (i % 2 ? 1 : -1) * 9;
      o.connect(padLp);
      o.start();
      this.padOsc.push(o);
    }
    this.setChord(0, true);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  setMusic(v: number) {
    this.musicVol = v;
    if (this.ctx) this.music.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }

  // ---------------------------------------------------------------------------
  private noise(kind: 'white' | 'brown') {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  private brownish(buf: AudioBuffer, type: BiquadFilterType, freq: number, q = 0.7) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f);
    return f;
  }
  private buzz() {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 2;
    for (const [fr, t] of [[120, 'sawtooth'], [240, 'square']] as const) {
      const o = ctx.createOscillator(); o.type = t; o.frequency.value = fr; o.connect(f); o.start();
    }
    return f;
  }
  private drone(freqs: number[]) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
    for (const fr of freqs) { const o = ctx.createOscillator(); o.frequency.value = fr; o.connect(f); o.start(); }
    return f;
  }
  private murmur() {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    for (const [fr, rate] of [[480, 3.1], [1150, 4.3], [2300, 5.7]]) {
      const f = this.brownish(this.white, 'bandpass', fr, 5);
      const g = ctx.createGain(); g.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = 0.45;
      lfo.connect(lg).connect(g.gain); lfo.start();
      f.connect(g).connect(out);
    }
    return out;
  }
  private layer(name: string, src: AudioNode, dest: AudioNode) {
    const g = this.ctx!.createGain();
    g.gain.value = 0;
    src.connect(g).connect(dest);
    this.layers[name] = { g, f: src instanceof BiquadFilterNode ? src : undefined };
  }
  private set(name: string, v: number, tc = 0.25) {
    const l = this.layers[name];
    if (l) l.g.gain.setTargetAtTime(v, this.ctx!.currentTime, tc);
  }

  // --- sons ponctuels ---
  private blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0, dest: AudioNode = this.master, pan = 0) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  private burst(dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, when = 0, dest: AudioNode = this.master) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.05);
  }

  thunder(dist: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const delay = Math.min(6, dist / 343);
    const t0 = ctx.currentTime + delay;
    const amp = 0.9 / (1 + dist / 700);
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(dist < 300 ? 2500 : 900, t0);
    f.frequency.exponentialRampToValueAtTime(70, t0 + 5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + (dist < 300 ? 0.02 : 0.3));
    g.gain.setTargetAtTime(amp * 0.5, t0 + 0.6, 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 6);
    s.connect(f).connect(g).connect(this.outdoor);
    g.connect(this.reverb);
    s.start(t0); s.stop(t0 + 6.5);
    if (dist < 300) this.burst(0.25, 0.5, 'highpass', 2000, 0.7, delay);
  }
  chime() {
    if (!this.ctx) return;
    [76, 72, 67].forEach((n, i) => this.blip(NOTE(n), 0.9, 0.12, 'sine', i * 0.28, this.master));
  }
  ding() {
    if (!this.ctx) return;
    this.blip(NOTE(88), 1.4, 0.12, 'sine'); this.blip(NOTE(95), 1.0, 0.05, 'sine');
  }
  horn(pan: number, gain: number) {
    if (!this.ctx) return;
    for (const f of [392, 466]) this.blip(f, 0.45, 0.08 * gain, 'square', 0, this.outdoor, pan);
  }

  private setChord(i: number, now = false) {
    const CH = [[50, 57, 60, 64, 69, 72], [46, 53, 57, 62, 65, 69], [41, 48, 53, 57, 60, 64], [48, 55, 60, 62, 67, 71]];
    const notes = CH[i % CH.length];
    this.padOsc.forEach((o, k) => o.frequency.setTargetAtTime(NOTE(notes[k % notes.length]) * (k >= 6 ? 0.5 : 1), this.ctx!.currentTime, now ? 0.01 : 2.5));
  }

  private schedule(inside: boolean) {
    const ctx = this.ctx!;
    const spb = 60 / 124 / 2; // croches
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const t0 = this.nextBeat;
      const b = this.beat % 32;
      const bus = this.club.bus;
      if (b % 2 === 0) {
        // grosse caisse
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
        g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        o.connect(g).connect(bus); o.start(t0); o.stop(t0 + 0.35);
      } else if (inside) {
        // charleston
        const s = ctx.createBufferSource(); s.buffer = this.white;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
        s.connect(f).connect(g).connect(bus); s.start(t0); s.stop(t0 + 0.08);
      }
      // basse
      const roots = [38, 38, 41, 36];
      const root = roots[Math.floor(this.beat / 32) % 4];
      if (b % 2 === 1 || b % 8 === 6) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(root + (b % 8 === 6 ? 12 : 0));
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(120, t0 + 0.18);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.28, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(f).connect(g).connect(bus); o.start(t0); o.stop(t0 + 0.25);
      }
      if (b === 0 || b === 20) {
        for (const n of [root + 24, root + 27, root + 31]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n);
          const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
          o.connect(g).connect(bus); o.start(t0); o.stop(t0 + 0.45);
        }
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }

  update(f: AudioFrame, t: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const indoor = f.indoor;
    // filtre "dehors" : étouffé à l'intérieur
    this.outdoor.frequency.setTargetAtTime(indoor > 0.9 ? 450 : indoor > 0.4 ? 1800 : f.shelter > 0.5 ? 6000 : 18000, now, 0.2);
    this.outGain.gain.setTargetAtTime(indoor > 0.9 ? 0.45 : 1, now, 0.2);
    const alt = Math.max(0, f.altitude);
    const high = Math.min(1, alt / 250);
    // pluie : plus présente à découvert, crépitement sur les abris
    this.set('rain', f.rain * (0.22 - 0.1 * f.shelter));
    this.set('patter', f.rain * (0.03 + 0.07 * f.shelter) * (1 - indoor));
    this.set('wind', 0.02 + high * 0.22 + Math.min(0.2, f.speed / 200));
    this.set('hum', 0.16 * (1 - high * 0.6));
    this.set('traffic', 0.12 * (1 - high * 0.7));
    this.set('neon', 0.025 * Math.max(0, 1 - f.neon / 5) * (1 - indoor * 0.5));
    this.set('steam', 0.06 * Math.max(0, 1 - f.steam / 8));
    this.set('crowd', Math.min(0.12, f.crowd * 0.012) * (1 - indoor * 0.7));
    this.set('train', f.inTrain ? 0.25 + f.trainSpeed * 0.012 : 0.35 * Math.max(0, 1 - f.trainNear / 120) * Math.min(1, 0.2 + f.trainSpeed / 15));
    this.set('elev', f.inElevator && f.elevatorMoving ? 0.12 : 0);
    this.set('blimp', 0.1 / (1 + (f.blimp / 180) ** 2));

    // voix mobiles : les sources les plus proches
    const right = new THREE.Vector3(-f.fwd.z, 0, f.fwd.x).normalize();
    this.voices.forEach((v, i) => {
      const m = f.movers[i];
      if (!m) { v.g.gain.setTargetAtTime(0, now, 0.2); return; }
      const dx = m.x - f.pos.x, dy = m.y - f.pos.y, dz = m.z - f.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const radial = (m.vx * dx + m.vy * dy + m.vz * dz) / d; // >0 : s'éloigne
      const dop = 343 / (343 + radial);
      const speed = Math.hypot(m.vx, m.vz);
      let gain = 0, freq = 60, nfq = 800, og = 0.5, ng = 0.5, lp = 1200;
      switch (m.kind) {
        case 'car': gain = 0.14; freq = 38 + speed * 3; nfq = 500; og = 0.6; ng = 0.3 + speed * 0.03; break;
        case 'truck': gain = 0.2; freq = 30 + speed * 2; nfq = 300; og = 0.7; ng = 0.4; lp = 700; break;
        case 'moto': gain = 0.14; freq = 70 + speed * 6; nfq = 1200; og = 0.8; ng = 0.2; lp = 2200; break;
        case 'flyer': gain = 0.22; freq = 220; nfq = 900; og = 0.15; ng = 0.9; lp = 2500; break;
        case 'police': gain = 0.22; freq = (t % 1 < 0.5 ? 700 : 950); nfq = 900; og = 0.6; ng = 0.5; lp = 3000; break;
        case 'siren': gain = 0.16; freq = 650 + 250 * Math.abs(Math.sin(t * 2.2)); nfq = 900; og = 0.7; ng = 0.1; lp = 3000; break;
        case 'drone': gain = 0.05; freq = 180 + 20 * Math.sin(t * 9 + i); nfq = 2000; og = 0.7; ng = 0.3; lp = 3500; break;
      }
      const att = 1 / (1 + Math.pow(d / 9, 1.4));
      v.g.gain.setTargetAtTime(gain * att, now, 0.1);
      v.osc.type = m.kind === 'police' ? 'square' : m.kind === 'siren' ? 'triangle' : 'sawtooth';
      v.osc.frequency.setTargetAtTime(freq * dop, now, 0.08);
      v.nf.frequency.setTargetAtTime(nfq * dop, now, 0.1);
      v.og.gain.setTargetAtTime(og, now, 0.1);
      v.ng.gain.setTargetAtTime(ng, now, 0.1);
      v.lp.frequency.setTargetAtTime(lp, now, 0.1);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / d)), now, 0.08);
    });

    // voiture volante
    if (f.engine >= 0) {
      const e = f.engine;
      this.engine.g.gain.setTargetAtTime(0.05 + 0.09 * e, now, 0.15);
      this.engine.o1.frequency.setTargetAtTime(52 + 95 * e, now, 0.2);
      this.engine.o2.frequency.setTargetAtTime(105 + 190 * e + 1.5, now, 0.2);
      this.engine.f.frequency.setTargetAtTime(350 + 1600 * e, now, 0.2);
      this.engine.air.gain.setTargetAtTime(0.15 + 0.9 * e, now, 0.2);
    } else this.engine.g.gain.setTargetAtTime(0, now, 0.3);
    if (f.bump) { this.burst(0.4, 0.45, 'lowpass', 240, 0.8); this.blip(95, 0.3, 0.1, 'triangle'); this.burst(0.12, 0.12, 'bandpass', 3200, 3, 0.02); }

    // club / bar le plus proche (ou autoradio pendant le pilotage)
    const vn = f.venue;
    if (f.radio) {
      this.club.g.gain.setTargetAtTime(0.26 * Math.min(1, this.musicVol * 2), now, 0.4);
      this.club.lp.frequency.setTargetAtTime(7000, now, 0.4);
      this.club.pan.pan.setTargetAtTime(0, now, 0.1);
    } else if (vn) {
      const dx = vn.x - f.pos.x, dy = vn.y - f.pos.y, dz = vn.z - f.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const g = vn.inside ? 0.5 : 0.35 / (1 + (d / 20) ** 2);
      this.club.g.gain.setTargetAtTime(g * (vn.bar ? 0.6 : 1), now, 0.3);
      this.club.lp.frequency.setTargetAtTime(vn.inside ? 12000 : 320, now, 0.3);
      this.club.pan.pan.setTargetAtTime(vn.inside ? 0 : Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / d)), now, 0.1);
    } else this.club.g.gain.setTargetAtTime(0, now, 0.5);
    this.schedule(f.radio || !!vn?.inside);

    // nappe : changement d'accord toutes les 10 s
    if (t - this.chordAt > 10) { this.chordAt = t; this.chord++; this.setChord(this.chord); }

    // pas
    if (f.steps !== this.lastSteps) {
      this.lastSteps = f.steps;
      if (f.surface === 'metal') { this.burst(0.08, 0.12, 'bandpass', 2600, 6); this.blip(420 + Math.random() * 80, 0.12, 0.03, 'triangle'); }
      else if (f.surface === 'wet') { this.burst(0.05, 0.14, 'bandpass', 900, 1.5); this.burst(0.14, 0.05, 'highpass', 3500, 0.7, 0.02); }
      else this.burst(0.06, 0.12, 'bandpass', 1300, 2);
    }
  }
}
