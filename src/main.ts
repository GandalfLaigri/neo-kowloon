import * as THREE from 'three';
import type { Reflector } from 'three/addons/objects/Reflector.js';
import { CityAudio, type AudioFrame } from './audio';
import { BLOCKS, CLOUD_Y, RAIN_EXTENT, RAIN_RES } from './config';
import { Elevators } from './elevators';
import { Hud, MapView } from './hud';
import { Metro } from './metro';
import { Pilot } from './pilot';
import { Birds } from './fauna';
import { Events } from './events';
import { Interactions } from './interact';
import { Journal } from './journal';
import { QUAY1 } from './world/coast';
import { Pedestrians, type RiderGroup } from './pedestrians';
import { Input, Player } from './player';
import { Beams } from './render/beams';
import { createRoad } from './render/ground';
import { createWater } from './render/water';
import { WATER_Y, clipToLand } from './world/coast';
import { LightPool } from './render/lightpool';
import { createBirdMaterial, createGlassMaterial, createPedMaterial, createVoxelMaterial, shared } from './render/materials';
import { Post } from './render/post';
import { Rain } from './render/rain';
import { Splashes } from './render/splash';
import { Sky } from './render/sky';
import { Steam } from './render/steam';
import { hashString } from './rng';
import { Spectacle } from './spectacle';
import { Traffic, type Mover } from './traffic';
import { Vehicles } from './vehicles';
import { World } from './world/builder';
import { DISTRICTS, DISTRICT_IDS, type DistrictId } from './world/districts';
import { generateCity, type City } from './world/city';
import type { Dest } from './world/ctx';

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0x000000, 0.004);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.15, 6000);

const voxelMat = createVoxelMaterial();
const voxelDynMat = createVoxelMaterial(true); // objets mobiles, épargnés par les coupures de courant
const glassMat = createGlassMaterial();
const pedMat = createPedMaterial();
const birdMat = createBirdMaterial();
const sky = new Sky();
scene.add(sky.group);
const post = new Post(renderer, scene, camera);
const audio = new CityAudio();

const input = new Input();
const hud = new Hud();

// ---------------------------------------------------------------------------
// Ville (régénérable)
// ---------------------------------------------------------------------------
interface CityInstance {
  seed: string;
  city: City;
  world: World;
  group: THREE.Group;
  elevators: Elevators;
  metro: Metro;
  peds: Pedestrians;
  steam: Steam;
  traffic: Traffic;
  vehicles: Vehicles;
  spectacle: Spectacle;
  beams: Beams;
  rain: Rain;
  splash: Splashes;
  road: Reflector;
  reflRender: Reflector['onBeforeRender'];
  lights: LightPool;
  map: MapView;
  player: Player;
  pilot: Pilot;
  birds: Birds;
  events: Events;
  interactions: Interactions;
  journal: Journal;
  venues: { x: number; y: number; z: number; box: THREE.Box3; bar: boolean }[];
  districtTex: THREE.DataTexture;
}
let inst: CityInstance | null = null;

function reflSize() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  return [Math.round(s.x * 0.5), Math.round(s.y * 0.5)] as const;
}

/** Voyageurs installés dans chaque rame (assis sur les banquettes, debout près des barres). */
function trainRiders(metro: Metro, seed: number): RiderGroup[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return metro.trains.map((t) => {
    const specs: RiderGroup['specs'] = [];
    for (const c of [-15.5, 0, 15.5]) {
      for (const [x0, x1] of [[c - 7.2, c - 4.8], [c - 2.7, c + 2.7], [c + 4.8, c + 7.2]])
        for (let x = x0 + 0.35; x < x1; x += 0.75)
          for (const side of [1, -1])
            if (rnd() < 0.3) specs.push({ x, y: 0.45, z: side * 1.15, yaw: side > 0 ? Math.PI : 0, pose: 1 });
      for (const px of [c - 3.75, c + 3.75]) if (rnd() < 0.5) specs.push({ x: px + 0.4, y: 0, z: rnd() - 0.5, yaw: rnd() * 6.28, pose: 0 });
    }
    return { obj: t.group, specs };
  });
}

function buildCity(seedStr: string): CityInstance {
  const seed = hashString(seedStr);
  const t0 = performance.now();
  const world = new World();
  const city = generateCity(world, seed);
  const group = world.buildMeshes(voxelMat, glassMat);
  // carte des quartiers pour les shaders (crasse, tags, flaques, coupures de courant)
  const districtTex = new THREE.DataTexture(city.districts.texture(), BLOCKS, BLOCKS, THREE.RGBAFormat);
  districtTex.magFilter = districtTex.minFilter = THREE.LinearFilter;
  districtTex.needsUpdate = true;
  shared.uDistrict.value = districtTex;
  for (const l of world.lights) l.d = DISTRICT_IDS.indexOf(city.districts.idAt(l.x, l.z));

  const elevators = new Elevators(city.elevators, world.col, world.lights, voxelMat, glassMat);
  group.add(elevators.group);

  const metro = new Metro(city.subway ? [...city.metro, city.subway.line] : city.metro, world.col, voxelDynMat, glassMat);
  group.add(metro.group);

  const peds = new Pedestrians(city.peds, pedMat, seed, trainRiders(metro, seed));
  group.add(peds.group);

  const birds = new Birds(world.spots, birdMat, seed);
  group.add(birds.group);

  const steam = new Steam(world.steam);
  steam.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
  group.add(steam.points);

  const traffic = new Traffic(city.lanes, voxelMat, seed);
  group.add(traffic.group);

  const vehicles = new Vehicles(city.metro, world.spots, voxelMat, seed, city.coast.sea);
  group.add(vehicles.group);

  const spectacle = new Spectacle(world.spots, city.towers, city.bridges, city.lanes, voxelDynMat, seed);
  group.add(spectacle.group);
  spectacle.onThunder = (d) => audio.thunder(d);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  spectacle.setResolution(buf.x, buf.y);

  const beams = new Beams(world.cones);
  group.add(beams.group);

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(city.wires, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x050407 }));
  group.add(wires);

  const rain = new Rain(world.rain);
  group.add(rain.mesh);
  const splash = new Splashes(rain.tex);
  splash.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
  group.add(splash.points);

  const [rw, rh] = reflSize();
  const road = createRoad(rw, rh, (r) => clipToLand(city.coast, r));
  group.add(road);
  group.add(createWater(city.coast.water, WATER_Y, road));

  const lights = new LightPool();
  lights.add(world.lights);
  lights.add(traffic.lights);
  lights.add(metro.lights);
  lights.add(vehicles.lights);
  lights.add(spectacle.lights);

  const pilot = new Pilot(world.col, voxelMat, (x, z) => shelterAt(world, x, z));
  group.add(pilot.mesh);
  lights.add(pilot.lights);

  const events = new Events(city, lights, voxelDynMat, pedMat, seed);
  group.add(events.group);
  lights.add(events.lights);
  const interactions = new Interactions(city.points);
  const journal = new Journal(city, seedStr);

  const player = new Player(world.col);
  const sp = city.spawn;
  player.spawn(sp.x, sp.y + 0.01, sp.z, sp.yaw, sp.pitch);

  // lieux musicaux : clubs en sous-sol, bars au rez-de-chaussée
  const venues: CityInstance['venues'] = [];
  for (const b of city.basements)
    if (b.kind === 0 || b.kind === 3) venues.push({ x: (b.rect.x0 + b.rect.x1) / 2, y: -3, z: (b.rect.z0 + b.rect.z1) / 2, box: new THREE.Box3(new THREE.Vector3(b.rect.x0, -6.5, b.rect.z0), new THREE.Vector3(b.rect.x1, 0, b.rect.z1)), bar: false });
  for (const t of city.towers)
    if (t.room && t.room.kind === 0) {
      const r = t.room.rect;
      venues.push({ x: (r.x0 + r.x1) / 2, y: 3, z: (r.z0 + r.z1) / 2, box: new THREE.Box3(new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, 6.5, r.z1)), bar: true });
    }

  const map = new MapView(city);
  map.onPick = (d) => teleport(d);

  scene.add(group);
  console.info(
    `[neo-kowloon] seed "${seedStr}" : ${city.towers.length} tours, ${city.elevators.length} ascenseurs, ${city.bridges.length} passerelles, ` +
      `${city.basements.length} sous-sols, ${city.metro.reduce((n, l) => n + l.stations.length, 0)} stations, ${peds.total} passants, ${world.steam.length} vapeurs, ` +
      `${city.dests.length} destinations, ${world.cones.length} cônes, ${world.boxes} boîtes, ${world.lights.length} lumières — ${Math.round(performance.now() - t0)} ms`,
  );
  return { seed: seedStr, city, world, group, elevators, metro, peds, steam, traffic, vehicles, spectacle, beams, rain, splash, road, reflRender: road.onBeforeRender, lights, map, player, pilot, birds, events, interactions, journal, venues, districtTex };
}

function disposeCity(c: CityInstance) {
  scene.remove(c.group);
  c.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  c.road.dispose();
  c.districtTex.dispose();
  shared.uBlackId.value = -1;
  if (c.journal.visible) c.journal.toggle();
  c.rain.dispose();
  c.splash.dispose();
  c.steam.dispose();
  c.map.show(false);
}

// ---------------------------------------------------------------------------
// Menu / options
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const menu = $('menu');
const hudEl = $('hud');
const playBtn = $<HTMLButtonElement>('play');
const status = $('status');
const seedInput = $<HTMLInputElement>('seed');
const optRefl = $<HTMLInputElement>('optRefl');
const optBloom = $<HTMLInputElement>('optBloom');
const optRain = $<HTMLSelectElement>('optRain');
const optStorm = $<HTMLInputElement>('optStorm');
const optAO = $<HTMLInputElement>('optAO');
const optRes = $<HTMLSelectElement>('optRes');
const optSens = $<HTMLInputElement>('optSens');
const optFov = $<HTMLInputElement>('optFov');
const optVol = $<HTMLInputElement>('optVol');
const optMusic = $<HTMLInputElement>('optMusic');

const params = new URLSearchParams(location.search);
seedInput.value = params.get('seed') ?? 'kowloon-2089';

let locked = false;
let started = false;
let mapMode = false; // carte interactive ouverte (curseur libre)
/** Verrouille le pointeur (ignore les refus : geste trop rapide, fenêtre non active…). */
function lockPointer() {
  const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
  p?.catch?.(() => {});
}
const noop = () => {};

function load(seedStr: string) {
  playBtn.disabled = true;
  playBtn.textContent = 'GÉNÉRATION…';
  status.textContent = 'Coulée du béton, câblage des néons…';
  setTimeout(() => {
    if (inst) disposeCity(inst);
    inst = buildCity(seedStr);
    applyOptions();
    playBtn.disabled = false;
    playBtn.textContent = started ? 'REPRENDRE' : 'ENTRER DANS LA VILLE';
    status.textContent = `${inst.city.towers.length} tours · ${inst.city.elevators.length} ascenseurs · ${inst.city.bridges.length} passerelles · ${inst.city.dests.length} destinations`;
  }, 30);
}

function applyOptions() {
  if (inst) {
    (inst.road.material as THREE.ShaderMaterial).uniforms.uReflOn.value = optRefl.checked ? 1 : 0;
    // sans reflets, on court-circuite le rendu miroir (coûteux)
    inst.road.onBeforeRender = optRefl.checked ? inst.reflRender : noop;
  }
  post.bloom.enabled = optBloom.checked;
  post.ao.mat.uniforms.uEnabled.value = optAO.checked ? 1 : 0;
  const res = parseFloat(optRes.value);
  const pr = res > 1 ? Math.min(devicePixelRatio, res) : res;
  if (Math.abs(pr - pixelRatio) > 1e-3) {
    pixelRatio = pr;
    onResize();
  }
  camera.fov = parseFloat(optFov.value);
  camera.updateProjectionMatrix();
  if (inst) inst.steam.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
  if (inst) inst.splash.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
  if (inst) inst.player.sensitivity = inst.pilot.sensitivity = 0.002 * parseFloat(optSens.value);
  audio.setVolume(parseFloat(optVol.value));
  audio.setMusic(parseFloat(optMusic.value));
}
for (const el of [optRefl, optBloom, optRain, optStorm, optAO, optRes, optSens, optFov, optVol, optMusic]) el.addEventListener('input', applyOptions);

playBtn.addEventListener('click', () => {
  if (!inst) return;
  audio.start();
  lockPointer();
});
$('regen').addEventListener('click', () => {
  const s = seedInput.value.trim() || Math.random().toString(36).slice(2, 8);
  seedInput.value = s;
  history.replaceState(null, '', `?seed=${encodeURIComponent(s)}`);
  load(s);
});
seedInput.addEventListener('keydown', (e) => e.stopPropagation());

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && mapMode) return; // carte ouverte : pas de menu
  menu.classList.toggle('hidden', locked);
  hudEl.classList.toggle('hidden', !locked && !started);
  if (locked && !started) {
    started = true;
    hud.toast('BIENVENUE À NEO-KOWLOON');
  }
  if (!locked) playBtn.textContent = 'REPRENDRE';
});
canvas.addEventListener('click', () => {
  if (!locked && inst && started && !mapMode) lockPointer();
});

function openMap() {
  if (!inst) return;
  mapMode = true;
  inst.map.show(true, true);
  document.exitPointerLock();
}
function closeMap(relock = true) {
  if (!inst) return;
  mapMode = false;
  inst.map.show(false);
  if (relock) lockPointer();
}
function teleport(d: Dest) {
  if (!inst) return;
  const P = inst.player;
  if (inst.pilot.state === 'flying') inst.pilot.park();
  if (P.fly) { P.toggleFly(); hud.setMode(false); }
  P.spawn(d.x, d.y + 0.05, d.z, d.yaw, 0);
  hud.toast(d.name.toUpperCase());
  closeMap(true);
}
addEventListener('keydown', (e) => {
  if (!mapMode) return;
  if (e.key.toLowerCase() === 'm' || e.code === 'Escape') closeMap(e.code !== 'Escape');
});

function onResize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
  if (inst) {
    const [rw, rh] = reflSize();
    inst.road.getRenderTarget().setSize(rw, rh);
    inst.steam.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
    inst.splash.setPixelScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera.fov);
    const b = renderer.getDrawingBufferSize(new THREE.Vector2());
    inst.spectacle.setResolution(b.x, b.y);
  }
}
addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------------
const noInput = new Input(false);
let curDistrict: DistrictId | null = null;
let time = 0;
let last = performance.now();
let debugActive = false;
const fogLow = new THREE.Color().setRGB(0.04, 0.018, 0.05);
const fogHigh = new THREE.Color().setRGB(0.018, 0.024, 0.055);
const fogFlash = new THREE.Color().setRGB(0.12, 0.13, 0.2);
const smooth = THREE.MathUtils.smoothstep;
const hideBox = new THREE.Box3();
const lerp = THREE.MathUtils.lerp;
const fwd = new THREE.Vector3();
// états lents (mis à jour quelques fois par seconde)
const slow = { t: 0, crowd: 0, steam: 99, indoor: 0 };
const prevDoors = new Map<object, number>();
const prevElev = new Map<object, string>();

// ---------------------------------------------------------------------------
// Annonces vocales dans les rames (synthèse vocale du navigateur)
// ---------------------------------------------------------------------------
let lastAnn = '';
function transferOf(c: CityInstance, line: string, station: string): string {
  const sub = c.city.subway;
  if (!sub) return '';
  for (const s of sub.stations) {
    if (!s.transfer) continue;
    if (line === sub.line.name && s.name === station) return ` Correspondance avec la ligne B, station ${s.transfer}.`;
    if (line === 'Ligne B' && s.transfer === station) return ` Correspondance avec la ligne C, station ${s.name}.`;
  }
  return '';
}
function announce(c: CityInstance, m: ReturnType<Metro['context']>) {
  if (!m || m.kind !== 'train') { lastAnn = ''; return; }
  const key = m.station ? `at:${m.station}` : `next:${m.next}`;
  if (key === lastAnn) return;
  const first = lastAnn === '';
  lastAnn = key;
  if (first && m.station) return; // on vient de monter : pas d'annonce immédiate
  const text = m.station
    ? `${m.station}.${transferOf(c, m.line.name, m.station)}`
    : `Prochaine station : ${m.next}.${transferOf(c, m.line.name, m.next)}`;
  say(text);
}
function say(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s || parseFloat(optVol.value) <= 0) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    const v = s.getVoices().find((x) => x.lang.startsWith('fr'));
    if (v) u.voice = v;
    u.rate = 1.02; u.pitch = 1.1;
    u.volume = Math.min(1, parseFloat(optVol.value));
    s.cancel();
    s.speak(u);
  } catch { /* synthèse vocale indisponible */ }
}

let barkAt = 0, journalAt = 0;
function discover(c: CityInstance, id: string) {
  const n = c.journal.mark(id);
  if (n) { hud.toast(`CARNET · ${n.toUpperCase()}`); audio.discover(); }
}
/** Proximité de l'eau (1 : au bord ou dedans, 0 : à plus de 40 m). */
function waterNear(c: CityInstance, p: THREE.Vector3) {
  let d = 1e9;
  for (const r of c.city.coast.water) {
    const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dz = Math.max(r.z0 - p.z, 0, p.z - r.z1);
    d = Math.min(d, Math.hypot(dx, dz));
  }
  return Math.max(0, 1 - d / 40);
}
function interact(c: CityInstance, q: ReturnType<Interactions['nearest']> & object) {
  const P = c.player;
  if (q.kind === 'seat') {
    P.sitAt({ x: q.x, y: q.y, z: q.z, yaw: q.yaw, floor: q.floor });
    audio.sitDown();
    discover(c, 'x-assis');
  } else if (q.kind === 'vend') {
    audio.vend();
    hud.toast(Interactions.drink().toUpperCase());
    discover(c, 'x-canette');
  } else {
    audio.slurp();
    hud.toast(`VOUS DÉGUSTEZ ${Interactions.dish().toUpperCase()}`);
    discover(c, 'x-manger');
  }
}
void QUAY1;

/** Invite liée à la voiture volante (monter / descendre). */
function carPrompt(c: CityInstance): string {
  const Pi = c.pilot;
  if (Pi.state === 'flying') return Pi.nearGround() && Pi.speed < 14 ? '<b>[V]</b> Descendre de la voiture' : '';
  if (Pi.state === 'parked' && Pi.distTo(c.player.pos) < 7) return '<b>[V]</b> Monter dans la voiture';
  return '';
}

function vKey(c: CityInstance, busy: boolean) {
  const Pi = c.pilot, P = c.player;
  if (Pi.state === 'flying') {
    const out = new THREE.Vector3();
    const free = (x: number, y: number, z: number) => !c.world.col.any(x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3);
    if (!Pi.exitPoint(out, free)) {
      hud.toast(!Pi.nearGround() ? 'TROP HAUT : APPROCHEZ-VOUS DU SOL (< 5 M)' : 'RALENTISSEZ POUR DESCENDRE');
      return;
    }
    Pi.park();
    P.spawn(out.x, out.y, out.z, Pi.camYaw, 0);
    hud.toast('À PIED');
  } else if (Pi.state === 'parked' && Pi.distTo(P.pos) < 7) {
    if (P.fly) P.toggleFly();
    Pi.enter(P.yaw, P.pitch);
    hud.toast('PILOTAGE');
  } else if (Pi.state !== 'arriving') {
    if (P.pos.y < -0.5) { hud.toast('PAS DE RÉSEAU EN SOUS-SOL'); return; }
    if (busy) return;
    hud.toast(Pi.summon(P.pos, P.yaw) ? 'VOITURE EN APPROCHE' : 'AUCUN ACCÈS DÉGAGÉ POUR LA VOITURE');
  }
}

function shelterAt(w: World, x: number, z: number) {
  const s = RAIN_RES / RAIN_EXTENT, h = RAIN_EXTENT / 2;
  const i = Math.floor((x + h) * s), j = Math.floor((z + h) * s);
  if (i < 0 || j < 0 || i >= RAIN_RES || j >= RAIN_RES) return 0;
  return w.rain[j * RAIN_RES + i];
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  tick(dt, true);
}

function tick(dt: number, render: boolean) {
  time += dt;
  shared.uTime.value = time;
  hud.tick(dt);
  if (!inst) return;
  const c = inst;
  const active = (locked || debugActive) && !mapMode;
  const inp = active ? input : noInput;
  const P = c.player;
  const Pi = c.pilot;

  if (active) {
    if (input.hitChar('f') && Pi.state !== 'flying') {
      P.toggleFly();
      hud.setMode(P.fly);
      hud.toast(P.fly ? 'VOL LIBRE' : 'À PIED');
    }
    if (input.hitChar('m')) {
      if (locked) openMap();
      else c.map.toggle();
    }
    if (input.hitChar('h')) hud.toggleHelp();
    if (input.hitChar('j')) c.journal.toggle();
    if (input.hitChar('r')) {
      if (Pi.state === 'flying') Pi.park();
      const sp = c.city.spawn;
      P.spawn(sp.x, sp.y + 0.01, sp.z, sp.yaw, sp.pitch);
      if (P.fly) { P.toggleFly(); hud.setMode(false); }
    }
  }

  c.elevators.update(dt);
  const carry = c.metro.update(dt, P.pos);
  // escalators : entraînement horizontal (les marches font monter)
  P.ext.set(0, 0, 0);
  if (!P.fly)
    for (const e of c.city.escalators)
      if (P.pos.x > e.r.x0 && P.pos.x < e.r.x1 && P.pos.z > e.r.z0 && P.pos.z < e.r.z1 && P.pos.y > e.y0 && P.pos.y < e.y1) { P.ext.set(e.vx, 0, e.vz); break; }
  const piloting = Pi.state === 'flying';
  if (piloting) {
    // aux commandes : le "joueur" suit la voiture (son, carte, passants)
    Pi.update(dt, time, inp);
    P.pos.copy(Pi.pos);
    P.vel.set(0, 0, 0);
    P.yaw = Pi.camYaw;
  } else {
    Pi.update(dt, time, null);
    if (carry && !P.fly) P.pos.add(carry);
    P.update(dt, inp);
  }
  c.peds.update(dt, P.pos, time);
  c.birds.update(dt, time, P.pos);
  const mctx = P.fly || piloting ? null : c.metro.context(P.pos);
  const metroPrompt = hud.setMetro(mctx);
  announce(c, mctx);

  // Interactions ascenseur
  const ctx = P.fly || piloting ? null : c.elevators.context(P.pos.x, P.pos.y, P.pos.z);
  hud.setElevator(ctx);
  if (ctx?.kind === 'inside') {
    hud.setPrompt('');
    if (active) {
      for (let i = 0; i < 9; i++) if (input.hit(`Digit${i + 1}`) || input.hit(`Numpad${i + 1}`)) c.elevators.request(ctx.e, i);
      if (input.hitChar('e')) c.elevators.request(ctx.e, (ctx.e.cur + 1) % ctx.e.def.stops.length);
    }
  } else if (ctx?.kind === 'call') {
    const busy = ctx.e.state !== 'idle';
    hud.setPrompt(busy ? 'Ascenseur en mouvement…' : '<b>[E]</b> Appeler l’ascenseur');
    if (active && input.hitChar('e')) c.elevators.request(ctx.e, ctx.stop);
  } else {
    const ip = !P.fly && !piloting && !P.seat ? c.interactions.nearest(P.pos) : null;
    hud.setPrompt(carPrompt(c) || metroPrompt || (P.seat ? '<b>[E]</b> Se lever' : ip ? Interactions.prompt(ip) : ''));
    if (active && input.hitChar('e')) {
      if (P.seat) P.stand();
      else if (ip) interact(c, ip);
    }
  }

  // Voiture volante : appel, montée, descente
  if (active && input.hitChar('v')) vKey(c, !!ctx || !!c.metro.interior(P.pos, hideBox));

  // caméra (poursuite en voiture), champ de vision élargi avec la vitesse
  const baseFov = parseFloat(optFov.value);
  const fovT = Pi.state === 'flying' ? baseFov + Math.min(14, Pi.speed * 0.16) : baseFov;
  if (Math.abs(camera.fov - fovT) > 0.01) {
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  if (Pi.state === 'flying') {
    Pi.applyCamera(camera, dt);
    hud.setMode(`PILOTAGE · ${Math.round(Pi.speed * 3.6)} km/h`);
  } else {
    P.applyCamera(camera);
    hud.setMode(P.fly);
  }
  camera.updateMatrixWorld();
  hud.setAltitude(P.pos.y);
  // quartier courant : nom dans le HUD, annonce à l'entrée
  const did = c.city.districts.idAt(P.pos.x, P.pos.z);
  if (did !== curDistrict && P.pos.y < 300) discover(c, `q-${did}`);
  if (did !== curDistrict) {
    if (curDistrict !== null && P.pos.y < 60) hud.toast(DISTRICTS[did].name.toUpperCase());
    curDistrict = did;
    hud.setDistrict(DISTRICTS[did].name, DISTRICTS[did].map);
  }
  c.map.draw(P.pos.x, P.pos.z, P.yaw, Pi.state === 'parked' || Pi.state === 'arriving' ? Pi.pos : null);

  // Brouillard selon l'altitude (dense au sol, nuage à CLOUD_Y, clair au-dessus)
  const y = camera.position.y;
  let dens = lerp(0.0045, 0.0026, smooth(y, 0, 250));
  const above = smooth(y, CLOUD_Y + 20, CLOUD_Y + 90);
  dens = lerp(dens, 0.0011, above);
  const inCloud = 1 - smooth(Math.abs(y - (CLOUD_Y + 14)), 8, 34);
  const rainAmt = parseFloat(optRain.value);
  const rainI = rainAmt * (optStorm.checked ? c.spectacle.rain : 1);
  dens *= lerp(0.78, 1.1, Math.min(1, rainI)) * lerp(1, 1 / 1.1, above);
  dens = lerp(dens, 0.035, inCloud);
  fog.density = dens;

  c.beams.begin(dens);
  c.traffic.update(dt, time, camera.position);
  camera.getWorldDirection(fwd);
  c.vehicles.update(dt, time, camera.position, P.pos, c.beams, fwd);
  c.events.update(dt, time, camera.position, P.pos, c.beams);
  if (c.events.notice) hud.toast(c.events.notice.text);
  for (const w of c.events.witnessed) discover(c, `x-${w}`);
  Pi.drawBeams(c.beams);
  const flash = c.spectacle.update(dt, time, camera.position, c.beams, dens, optStorm.checked);
  c.beams.end();
  c.lights.update(camera.position);
  sky.update(camera);
  fog.color.copy(fogLow).lerp(fogHigh, smooth(y, CLOUD_Y - 40, CLOUD_Y + 40)).lerp(fogFlash, Math.min(1, flash * 0.8));

  const altFade = 1 - smooth(y, CLOUD_Y - 30, CLOUD_Y);
  const rainFade = altFade * Math.min(1.3, rainI);
  (c.road.material as THREE.ShaderMaterial).uniforms.uRain.value = rainI;
  let hide = c.metro.interior(P.pos, hideBox);
  const inTrain = !!hide;
  if (!hide && ctx?.kind === 'inside') {
    const f = ctx.e.floor;
    hide = hideBox.set(hideBox.min.set(f.min[0], f.max[1] - 0.3, f.min[2]), hideBox.max.set(f.max[0], f.max[1] + 3.2, f.max[2]));
  }
  c.rain.update(camera.position, altFade, hide, rainI);
  c.splash.update(camera.position, altFade * Math.min(1, rainI));

  // ---- Son ----
  if (audio.ctx) {
    // états lents : foule, vapeur, intérieur
    if (time - slow.t > 0.3) {
      slow.t = time;
      slow.crowd = c.peds.crowdNear(P.pos, 12);
      let sd = 99;
      for (const s of c.world.steam) {
        const d = Math.hypot(s.x - P.pos.x, s.y - P.pos.y, s.z - P.pos.z);
        if (d < sd) sd = d;
      }
      slow.steam = sd;
      // clos : plafond proche et murs dans au moins trois directions
      const hy = P.pos.y + 1.2;
      let walls = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let r = 1; r <= 12; r += 1.5) {
          const x = P.pos.x + dx * r, z = P.pos.z + dz * r;
          if (c.world.col.any(x - 0.1, hy, z - 0.1, x + 0.1, hy + 0.2, z + 0.1)) { walls++; break; }
        }
      }
      const roof = shelterAt(c.world, P.pos.x, P.pos.z);
      slow.indoor = P.pos.y < -0.5 ? 1 : roof > P.pos.y + 2 && roof - P.pos.y < 9 && walls >= 3 ? 1 : 0;
    }
    const roof = shelterAt(c.world, P.pos.x, P.pos.z);
    const shelter = roof > P.pos.y + 1.9 ? 1 : 0;
    const movers: Mover[] = [...c.traffic.nearest, ...c.vehicles.nearest, ...c.events.nearest].sort((a, b) => a.d2 - b.d2).slice(0, 7);
    // animaux et événements : sons ponctuels
    if (c.peds.dogNear < 7 && time > barkAt) { barkAt = time + 3 + Math.random() * 5; audio.bark(c.peds.dogNear); }
    if (c.peds.ratScared) audio.squeak();
    if (c.birds.flutter >= 0) audio.flutter(c.birds.flutter);
    if (c.birds.caw) audio.caw(20);
    const sx = c.events.sfx;
    if (sx.drum >= 0) audio.drum(sx.drum);
    if (sx.cracker >= 0) audio.crackers(sx.cracker);
    if (sx.blackOn) audio.powerDown();
    if (sx.blackOff) audio.powerUp();
    let trainNear = 999, trainSpeed = 0;
    for (const t of c.metro.trains) {
      const d = t.group.position.distanceTo(P.pos);
      if (d < trainNear) { trainNear = d; trainSpeed = t.v; }
      // carillon à l'ouverture des portes
      const pd = prevDoors.get(t) ?? 0;
      if (pd < 0.5 && t.door >= 0.5 && d < 70) audio.chime();
      prevDoors.set(t, t.door);
    }
    for (const e of c.elevators.list) {
      const ps = prevElev.get(e);
      if (ps === 'moving' && e.state === 'opening') {
        const b = e.floor;
        if (Math.hypot((b.min[0] + b.max[0]) / 2 - P.pos.x, (b.min[2] + b.max[2]) / 2 - P.pos.z, b.max[1] - P.pos.y) < 14) audio.ding();
      }
      prevElev.set(e, e.state);
    }
    if (c.vehicles.honk === time) {
      // klaxon du véhicule le plus proche
      const m = c.vehicles.nearest.find((v) => v.kind !== 'drone' && v.kind !== 'siren');
      if (m) audio.horn(0, 1);
    }
    let venue: AudioFrame['venue'] = null, vd = 90;
    for (const v of c.venues) {
      const d = Math.hypot(v.x - P.pos.x, v.y - P.pos.y, v.z - P.pos.z);
      if (d < vd) { vd = d; venue = { x: v.x, y: v.y, z: v.z, inside: v.box.containsPoint(P.pos), bar: v.bar }; }
    }
    camera.getWorldDirection(fwd);
    const surface = inTrain || ctx?.kind === 'inside' ? 'metal' : P.pos.y < 0.7 && !shelter ? 'wet' : 'hard';
    const flying = Pi.state === 'flying';
    audio.update({
      pos: camera.position, fwd, altitude: P.pos.y,
      rain: rainFade * (slow.indoor ? 0.4 : 1), shelter, indoor: inTrain || ctx?.kind === 'inside' ? 0.5 : slow.indoor,
      movers, trainNear, trainSpeed, inTrain,
      inElevator: ctx?.kind === 'inside', elevatorMoving: ctx?.kind === 'inside' && ctx.e.state === 'moving',
      neon: c.lights.nearestDist, crowd: slow.crowd, steam: slow.steam,
      blimp: c.spectacle.blimpPosition.distanceTo(P.pos), venue,
      steps: P.grounded && !P.fly && !flying ? P.stepCount : -1, surface, speed: flying ? Pi.speed : P.speed,
      engine: flying ? Math.min(1, Pi.speed / 60) : Pi.state === 'arriving' ? 0.45 : Pi.state === 'parked' && Pi.distTo(P.pos) < 25 ? 0.02 : -1,
      radio: flying && parseFloat(optMusic.value) > 0,
      bump: flying && time - Pi.bump < 1e-6,
      district: did, water: waterNear(c, P.pos), blackout: shared.uBlackId.value >= 0 && DISTRICT_IDS[shared.uBlackId.value] === did,
      swarm: sx.swarm,
    }, time);
  }

  // carnet : transports, altitude, eau, lieux et secrets à proximité
  if (mctx?.kind === 'train') discover(c, `t-${mctx.line.name}`);
  if (piloting) discover(c, 't-voiture');
  if (ctx?.kind === 'inside' && P.pos.y > 150) discover(c, 't-ascenseur');
  if (camera.position.y > CLOUD_Y + 5) discover(c, 'x-nuages');
  if (P.pos.y < -1.0 && !piloting && waterNear(c, P.pos) > 0.98) discover(c, 'x-eau');
  if (time - journalAt > 0.25) {
    journalAt = time;
    const found = c.journal.check(P.pos);
    if (found) { hud.toast(`DÉCOUVERTE · ${found.toUpperCase()}`); audio.discover(); }
  }

  if (render) post.render();
  input.endFrame();
}

load(seedInput.value);
frame();

// Accès de debug (dev uniquement) : window.nk.view(x, y, z, yaw, pitch, fly)
if (import.meta.env.DEV) {
  (window as any).nk = {
    get inst() { return inst; },
    post, renderer, shared, fog, scene, camera, audio,
    view(x: number, y: number, z: number, yaw = 0, pitch = 0, fly = true) {
      if (!inst) return;
      const P = inst.player;
      if (P.fly !== fly) P.toggleFly();
      P.spawn(x, y, z, yaw, pitch);
      menu.classList.add('hidden');
      hudEl.classList.remove('hidden');
      hud.setMode(P.fly);
    },
    menu(show: boolean) { menu.classList.toggle('hidden', !show); },
    press(code: string) { input.pressed.add(code); },
    /** Raccourci lettre (touches V, F, M…) comme si elle venait d'être pressée. */
    key(ch: string) { input.chars.add(ch); },
    /** Mouvement de souris simulé (pixels). */
    mouse(dx: number, dy: number) { input.dx += dx; input.dy += dy; },
    hold(code: string, on = true) { if (on) input.keys.add(code); else input.keys.delete(code); },
    /** Simule `seconds` secondes à 60 Hz (le rAF est suspendu quand le panneau est masqué). */
    step(seconds: number) {
      debugActive = true;
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) tick(1 / 60, i === n - 1);
      debugActive = false;
    },
    openMap() { if (inst) { mapMode = true; inst.map.show(true, true); } },
    teleport,
  };
}
