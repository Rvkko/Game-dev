// DEEP OCEAN SURVIVAL — true-3D rebuild. Three.js rendering + cannon-es physics.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

// ============================== Utils ==============================
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Deterministic 2D value noise (seeded per-world in generateWorld)
let NSEED = 1;
function vhash(ix, iz) { let h = (ix * 374761393 + iz * 668265263 + NSEED * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function n2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz) * 2 - 1;
}

// ============================== Data ==============================
const DS = 4; // meters of display depth per world unit
const depthOf = (y) => Math.max(0, -y * DS);
const yFor = (m) => -m / DS;

const ZONES = [
  { to: 60,   name: 'Surface Shelf',  fog: 0x1a6d9e, sun: 1 },
  { to: 200,  name: 'Sunlit Reef',    fog: 0x11557f, sun: 0.75 },
  { to: 500,  name: 'Twilight Zone',  fog: 0x0a3253, sun: 0.35 },
  { to: 1000, name: 'Midnight Zone',  fog: 0x041627, sun: 0.08 },
  { to: 1400, name: 'The Abyss',      fog: 0x020a14, sun: 0.02 },
  { to: 1e9,  name: 'Hadal Trench',   fog: 0x01050c, sun: 0.01 },
];
function zoneAt(m) { for (const z of ZONES) if (m < z.to) return z; return ZONES[ZONES.length - 1]; }

const DIFFS = {
  relaxed:  { label: 'Relaxed',  o2: 0.7,  dmg: 0.7, press: 0.7, desc: 'Relaxed — gentler O2 drain, weaker predators.' },
  standard: { label: 'Standard', o2: 1,    dmg: 1,   press: 1,   desc: 'Standard — the intended experience.' },
  brutal:   { label: 'Brutal',   o2: 1.35, dmg: 1.5, press: 1.4, desc: 'Brutal — fast O2 drain, deadly fauna, harsh pressure.' },
};

const RES = {
  scrap:    { name: 'Scrap',         col: 0xb8c4c9, glow: false },
  coral:    { name: 'Coral',         col: 0xff8ba0, glow: false },
  quartz:   { name: 'Quartz',        col: 0x9be8ff, glow: true },
  gel:      { name: 'Biolume Gel',   col: 0x7dffb2, glow: true },
  titanium: { name: 'Titanium',      col: 0xd9c48a, glow: false },
  alloy:    { name: 'Abyssal Alloy', col: 0xc98bff, glow: true },
};
const RES_KEYS = Object.keys(RES);
function nodeTypeFor(m, rnd) {
  const t = m < 200 ? ['scrap', 'scrap', 'coral', 'coral', 'quartz']
    : m < 450 ? ['scrap', 'coral', 'quartz', 'quartz', 'gel']
    : m < 750 ? ['quartz', 'quartz', 'gel', 'gel', 'titanium']
    : m < 1100 ? ['gel', 'titanium', 'titanium', 'quartz', 'alloy']
    : ['titanium', 'alloy', 'alloy', 'gel', 'alloy'];
  return t[Math.floor(rnd() * t.length)];
}

const TANKS = [100, 160, 240, 350, 520];   // O2 seconds
const SUITS = [130, 330, 660, 1080, 1700]; // crush depth m
const LAMPS = [40, 60, 85, 120];           // headlamp reach, world units
const FINS  = [1, 1.22, 1.45];
const HARPS = [12, 26, 50];

const CREATURES = {
  jelly:     { name: 'Moon Jelly',  hp: 18,  dmg: 6,  speed: 1.3, aggro: 0,  rad: 1.1, min: 0,    max: 350,  col: 0xb7a8ff, glow: true,  segs: 3 },
  shark:     { name: 'Reef Shark',  hp: 45,  dmg: 14, speed: 8.5, aggro: 34, rad: 1.5, min: 90,   max: 520,  col: 0x7f9aa8, glow: false, segs: 5 },
  angler:    { name: 'Anglerfish',  hp: 70,  dmg: 20, speed: 7,   aggro: 30, rad: 1.3, min: 420,  max: 950,  col: 0x54626e, glow: true,  segs: 4 },
  eel:       { name: 'Viper Eel',   hp: 110, dmg: 27, speed: 10,  aggro: 36, rad: 1.2, min: 720,  max: 1250, col: 0x6aab7d, glow: true,  segs: 7 },
  leviathan: { name: 'Leviathan',   hp: 320, dmg: 46, speed: 8,   aggro: 48, rad: 2.6, min: 1080, max: 1700, col: 0x4a3a63, glow: true,  segs: 8 },
};

const ACH = [
  { id: 'first-dive',      name: 'Getting Your Fins Wet', at: 'Dive below 50 m' },
  { id: 'twilight-zone',   name: 'Into the Twilight',     at: 'Reach 200 m' },
  { id: 'midnight-zone',   name: 'Where Light Dies',      at: 'Reach 500 m' },
  { id: 'abyssal',         name: 'Abyssal Diver',         at: 'Reach 1,000 m' },
  { id: 'trench-floor',    name: 'Bottom of the World',   at: 'Touch the trench floor' },
  { id: 'first-craft',     name: 'Field Engineer',        at: 'Craft your first upgrade' },
  { id: 'fully-equipped',  name: 'Pressure Proof',        at: 'Craft the Tier 4 Abyssal Suit' },
  { id: 'first-kill',      name: 'Apex Predator',         at: 'Kill a hostile creature' },
  { id: 'collector',       name: 'Hoarder of the Deep',   at: 'Gather 100 resources', progressive: true, target: 100 },
  { id: 'home-sweet-home', name: 'Home Sweet Habitat',    at: 'Build 3 habitat modules' },
  { id: 'survivor',        name: 'Twenty Minute Lungs',   at: 'Survive 20 minutes in one life' },
  { id: 'close-call',      name: 'Close Call',            at: 'Refill oxygen with under 5% left' },
  { id: 'ascension',       name: 'Ascension',             at: 'Repair the pod and escape' },
  { id: 'iron-lungs',      name: 'Iron Lungs',            at: 'Escape in Hardcore mode' },
];

const RECIPES = [
  { id: 'tank1', kind: 'gear', gear: 'tank', tier: 1, name: 'Steel Tank II',    ds: 'O2 capacity 160s',                    cost: { scrap: 4, coral: 2 } },
  { id: 'tank2', kind: 'gear', gear: 'tank', tier: 2, name: 'Composite Tank',   ds: 'O2 capacity 240s',                    cost: { scrap: 8, quartz: 4 } },
  { id: 'tank3', kind: 'gear', gear: 'tank', tier: 3, name: 'Titan Tank',       ds: 'O2 capacity 350s', needs: 'workshop', cost: { titanium: 6, quartz: 6, gel: 2 } },
  { id: 'tank4', kind: 'gear', gear: 'tank', tier: 4, name: 'Abyss Rebreather', ds: 'O2 capacity 520s', needs: 'charger',  cost: { alloy: 4, titanium: 8, gel: 4 } },
  { id: 'suit1', kind: 'gear', gear: 'suit', tier: 1, name: 'Reinforced Suit',  ds: 'Crush depth 330 m',                   cost: { coral: 4, scrap: 3 } },
  { id: 'suit2', kind: 'gear', gear: 'suit', tier: 2, name: 'Pressure Suit',    ds: 'Crush depth 660 m',                   cost: { quartz: 6, scrap: 6 } },
  { id: 'suit3', kind: 'gear', gear: 'suit', tier: 3, name: 'Titan Suit',       ds: 'Crush depth 1,080 m', needs: 'workshop', cost: { titanium: 8, gel: 4 } },
  { id: 'suit4', kind: 'gear', gear: 'suit', tier: 4, name: 'Abyssal Suit',     ds: 'Crush depth 1,700 m', needs: 'charger',  cost: { alloy: 6, titanium: 6 } },
  { id: 'lamp1', kind: 'gear', gear: 'lamp', tier: 1, name: 'Halogen Lamp',     ds: 'Brighter beam',                       cost: { coral: 3, quartz: 2 } },
  { id: 'lamp2', kind: 'gear', gear: 'lamp', tier: 2, name: 'Biolume Array',    ds: 'Wide living light',                   cost: { gel: 4, quartz: 4 } },
  { id: 'lamp3', kind: 'gear', gear: 'lamp', tier: 3, name: 'Sunspot Rig',      ds: 'Turns night to day', needs: 'workshop', cost: { gel: 8, alloy: 2 } },
  { id: 'fins1', kind: 'gear', gear: 'fins', tier: 1, name: 'Carbon Fins',      ds: '+22% swim speed',                     cost: { coral: 5, scrap: 2 } },
  { id: 'fins2', kind: 'gear', gear: 'fins', tier: 2, name: 'Hydrojet Fins',    ds: '+45% swim speed',                     cost: { gel: 3, titanium: 4 } },
  { id: 'harp2', kind: 'gear', gear: 'harpoon', tier: 2, name: 'Spring Harpoon', ds: '26 damage',                          cost: { scrap: 6, quartz: 5 } },
  { id: 'harp3', kind: 'gear', gear: 'harpoon', tier: 3, name: 'Railspear',      ds: '50 damage',      needs: 'workshop',  cost: { titanium: 6, alloy: 3 } },
  { id: 'garden',   kind: 'module', name: 'O2 Garden',      ds: 'Habitat refills O2 3× faster',       cost: { coral: 8, quartz: 4 } },
  { id: 'workshop', kind: 'module', name: 'Workshop',       ds: 'Unlocks Tier 3 fabrication',         cost: { scrap: 10, quartz: 8 } },
  { id: 'beacon',   kind: 'module', name: 'Sonar Beacon',   ds: 'Habitat bearing always on your HUD', cost: { quartz: 6, gel: 3 } },
  { id: 'charger',  kind: 'module', name: 'Trench Charger', ds: 'Unlocks Tier 4 fabrication', needs: 'workshop', cost: { titanium: 10, gel: 6 } },
  { id: 'podcore',  kind: 'special', name: 'Pod Power Core', ds: 'Repairs the Ascension Pod at the trench floor', needs: 'charger', cost: { alloy: 6, titanium: 8, gel: 6, quartz: 10 } },
];

// ============================== Audio ==============================
class AudioSys {
  constructor() { this.ctx = null; this.vol = { master: 0.8, music: 0.6, sfx: 1 }; }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.lp = this.ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.master = this.ctx.createGain();
    this.master.connect(this.lp); this.lp.connect(this.ctx.destination);
    this.sfxG = this.ctx.createGain(); this.sfxG.connect(this.master);
    this.musG = this.ctx.createGain(); this.musG.connect(this.master);
    this.applyVol();
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
    const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 72.4;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); o2.connect(g); g.connect(this.musG);
    o.start(); o2.start(); lfo.start();
    this._padStep = 0;
    setInterval(() => this._pad(), 5200); this._pad();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  applyVol() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.sfxG.gain.value = this.vol.sfx; this.musG.gain.value = this.vol.music; }
  setDepth(m) { if (this.lp) this.lp.frequency.value = clamp(16000 - m * 9, 900, 16000); }
  _pad() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const chords = [[110, 164.8, 220], [98, 146.8, 196], [87.3, 130.8, 174.6], [110, 130.8, 196]];
    const notes = chords[this._padStep++ % chords.length], t = this.ctx.currentTime;
    for (const f of notes) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028, t + 1.8); g.gain.linearRampToValueAtTime(0, t + 5.1);
      o.connect(g); g.connect(this.musG); o.start(t); o.stop(t + 5.2);
    }
  }
  blip(f0, f1, dur, type = 'sine', vol = 0.2) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxG); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, freq = 800) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxG); src.start(t);
  }
  shoot() { this.noise(0.14, 0.35, 1600); this.blip(320, 90, 0.12, 'square', 0.12); }
  hit() { this.noise(0.1, 0.3, 500); this.blip(180, 60, 0.14, 'sawtooth', 0.14); }
  bite() { this.blip(120, 40, 0.28, 'sawtooth', 0.3); this.noise(0.2, 0.3, 300); }
  pickup() { this.blip(620, 990, 0.12, 'sine', 0.16); }
  craft() { this.blip(440, 660, 0.1, 'triangle', 0.16); this.blip(660, 990, 0.14, 'triangle', 0.14); }
  bubble() { this.blip(300 + Math.random() * 500, 900 + Math.random() * 600, 0.06, 'sine', 0.05); }
  alarm() { this.blip(880, 880, 0.1, 'square', 0.1); }
  creak() { this.blip(70 + Math.random() * 40, 40, 0.5, 'sawtooth', 0.07); }
  roar() { this.blip(90, 30, 0.9, 'sawtooth', 0.28); this.noise(0.7, 0.25, 150); }
  ach() { this.blip(523, 784, 0.12, 'sine', 0.18); this.blip(784, 1046, 0.2, 'sine', 0.16); }
  die() { this.blip(300, 40, 1.2, 'sawtooth', 0.25); }
  launch() { this.noise(3, 0.3, 220); this.blip(60, 240, 3, 'sawtooth', 0.18); }
}
const AU = new AudioSys();

// ============================== Empire SDK ==============================
const SAVE_VERSION = 2;
let hubSettings = null;
const empire = new EmpireClient({
  gameId: 'deep-ocean-survival',
  saveVersion: SAVE_VERSION,
  onInit(d) { hubSettings = d && d.settings; applySettings(hubSettings); },
  onSettings(s) { hubSettings = s; applySettings(s); },
  onPause() { if (G.state === 'play') openPause(); },
  onLoadSlot(slot) { loadSlot(slot); },
});
function applySettings(s) {
  if (!s) return;
  const ts = s.textScale || (s.accessibility && s.accessibility.textScale);
  if (ts) document.documentElement.style.setProperty('--ts', ts);
  const a = s.audio || s;
  const num = (...vals) => vals.find(v => typeof v === 'number');
  const master = num(a.master, a.masterVolume);
  const music = num(a.music, a.musicVolume);
  const sfx = num(a.sfx, a.sfxVolume);
  if (master !== undefined) AU.vol.master = master;
  if (music !== undefined) AU.vol.music = music;
  if (sfx !== undefined) AU.vol.sfx = sfx;
  if (a.muted) AU.vol.master = 0;
  AU.applyVol();
  $('fps').classList.toggle('hidden', !s.showFps);
}
const achieved = new Set();
function unlock(id) {
  if (achieved.has(id)) return;
  achieved.add(id);
  const a = ACH.find(x => x.id === id);
  toast(`🏆 ${a ? a.name : id}`, true); AU.ach();
  empire.unlockAchievement(id, 1).catch(() => {});
}
function achProgress(id, count, target) {
  empire.unlockAchievement(id, Math.min(1, count / target)).catch(() => {});
  if (count >= target) achieved.add(id);
}

// ============================== UI helpers ==============================
function toast(msg, gold = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (gold ? ' ach' : ''); el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 450); }, 3200);
}
const PANELS = ['menuMain', 'menuNew', 'menuLoad', 'menuHelp', 'menuPause', 'menuBase', 'menuInv', 'menuMap', 'menuDeath', 'menuWin'];
function showPanel(id) {
  for (const p of PANELS) $(p).classList.toggle('hidden', p !== id);
  G.panel = id;
  if (id && document.pointerLockElement) { G.suppressPause = true; document.exitPointerLock(); }
}

// ============================== Three.js setup ==============================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.useLegacyLights = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 900);
const yawObj = new THREE.Object3D();
const pitchObj = new THREE.Object3D();
yawObj.add(pitchObj); pitchObj.add(camera);
scene.add(yawObj);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x123, 1.0);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x224466, 0.35);
scene.add(amb);
const lamp = new THREE.SpotLight(0xcfefff, 1.6, LAMPS[0], 0.55, 0.45, 1.2);
lamp.position.set(0, 0.2, 0.4);
const lampTarget = new THREE.Object3D(); lampTarget.position.set(0, 0, -30);
pitchObj.add(lamp); pitchObj.add(lampTarget); lamp.target = lampTarget;

// Caustics texture
function makeCausticTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.2;
  const r = mulberry32(7);
  for (let i = 0; i < 46; i++) {
    g.beginPath();
    const cx = r() * 256, cy = r() * 256, rr = 12 + r() * 30;
    for (let a = 0; a <= 6.4; a += 0.35) {
      const w = rr + Math.sin(a * 3 + i) * rr * 0.35;
      const x = cx + Math.cos(a) * w, y = cy + Math.sin(a) * w;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const causticTex = makeCausticTex();
function addCaustics(mat, repeat = 24) {
  mat.emissive = new THREE.Color(0x9fd8ff);
  mat.emissiveIntensity = 0.5;
  mat.emissiveMap = causticTex;
  causticTex.repeat.set(repeat, repeat);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(position,1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= smoothstep(-45.0, -2.0, vWY);');
  };
}

// Marine snow
const SNOW_N = 900, SNOW_R = 55;
const snowGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N * 3; i++) pos[i] = (Math.random() - 0.5) * SNOW_R * 2;
  snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0x8fb8cc, size: 0.09, transparent: true, opacity: 0.6 }));
scene.add(snow);

// Water surface (seen from below)
const waterMat = new THREE.MeshBasicMaterial({ color: 0xaee2ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 24, 24), waterMat);
water.rotation.x = -Math.PI / 2; water.position.y = 0.4;
scene.add(water);

// ============================== Physics ==============================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
world.allowSleep = false;
const playerBody = new CANNON.Body({ mass: 72, shape: new CANNON.Sphere(0.85), linearDamping: 0.6, angularDamping: 1 });
world.addBody(playerBody);

// ============================== World generation ==============================
const WORLD_R = 560;
function terrainH(x, z) {
  const r = Math.hypot(x, z);
  let t = clamp((430 - r) / 360, 0, 1);
  t = t * t * (3 - 2 * t);
  let h = -18 - t * 384;
  if (t > 0 && t < 1) h += Math.sin(t * Math.PI * 9) * 8 * Math.sin(t * Math.PI); // terraces
  h += n2(x * 0.02, z * 0.02) * 7 + n2(x * 0.07 + 40, z * 0.07 - 40) * 2.5;
  if (r > WORLD_R) h += (r - WORLD_R) * 0.8; // rising rim
  return h;
}
const HAB_XZ = [14, 452];
const POD_XZ = [0, 0];

let terrainMesh = null, decor = [], nodes = [], nodeGroup = null, habitat = null, pod = null, moduleMeshes = {};
const dynMeshes = new Set(); // {mesh, body} pairs synced each frame

function disposeWorldObjects() {
  for (const o of [terrainMesh, nodeGroup, habitat, pod, ...decor, ...Object.values(moduleMeshes)]) {
    if (o) { scene.remove(o); o.traverse && o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
  }
  for (const c of creatures.slice()) removeCreature(c, false);
  for (const r of ragdolls.slice()) removeRagdoll(r);
  for (const p of pickups.slice()) removePickup(p);
  for (const f of flares.slice()) removeFlare(f);
  for (const s of spears.slice()) removeSpear(s);
  decor = []; nodes = []; moduleMeshes = {}; terrainMesh = nodeGroup = habitat = pod = null;
}

function generateWorld(seedStr) {
  disposeWorldObjects();
  NSEED = hashStr(seedStr) || 1;
  const rnd = mulberry32(hashStr(seedStr + ':w'));

  // --- terrain mesh ---
  const SEG = 168, SIZE = 1180;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cShallow = new THREE.Color(0xc8b58a), cMid = new THREE.Color(0x4a6a72), cDeep = new THREE.Color(0x232b3b), cAbyss = new THREE.Color(0x131320);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    const m = depthOf(h);
    if (m < 180) tmp.lerpColors(cShallow, cMid, m / 180);
    else if (m < 700) tmp.lerpColors(cMid, cDeep, (m - 180) / 520);
    else tmp.lerpColors(cDeep, cAbyss, clamp((m - 700) / 900, 0, 1));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 });
  addCaustics(tMat, 26);
  terrainMesh = new THREE.Mesh(geo, tMat);
  scene.add(terrainMesh);

  // --- decor: kelp, rocks, glow plants ---
  const kelpGeo = new THREE.ConeGeometry(0.35, 6, 5);
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x2e7d4f, roughness: 0.9 });
  addCaustics(kelpMat, 4);
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, 260);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rock = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 1 }), 420);
  const glowGeo = new THREE.ConeGeometry(0.25, 2.2, 5);
  const glow = new THREE.InstancedMesh(glowGeo, new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x37ffa8, emissiveIntensity: 1.4 }), 200);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const place = (inst, count, minM, maxM, sMin, sMax, yOff = 0) => {
    for (let i = 0; i < count; i++) {
      let x, z, m, tries = 0;
      do { const a = rnd() * Math.PI * 2, r = 40 + rnd() * (WORLD_R - 50); x = Math.cos(a) * r; z = Math.sin(a) * r; m = depthOf(terrainH(x, z)); } while ((m < minM || m > maxM) && ++tries < 30);
      const s = sMin + rnd() * (sMax - sMin);
      E.set(rnd() * 0.25, rnd() * Math.PI * 2, rnd() * 0.25); Q.setFromEuler(E);
      P.set(x, terrainH(x, z) + yOff * s, z); S.set(s, s, s);
      M.compose(P, Q, S); inst.setMatrixAt(i, M);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst); decor.push(inst);
  };
  place(kelp, 260, 0, 260, 0.7, 1.8, 2.6);
  place(rock, 420, 0, 1700, 0.5, 3.2, 0.3);
  place(glow, 200, 450, 1700, 0.8, 2, 0.9);

  // --- wrecks ---
  const wreckMat = new THREE.MeshStandardMaterial({ color: 0x5c554a, roughness: 0.8, metalness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, r = 150 + rnd() * 280;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = terrainH(x, z);
    const w = new THREE.Mesh(new THREE.BoxGeometry(6 + rnd() * 6, 2.4, 3), wreckMat);
    w.position.set(x, h + 1, z); w.rotation.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.6);
    scene.add(w); decor.push(w);
  }

  // --- resource nodes ---
  nodeGroup = new THREE.Group(); scene.add(nodeGroup);
  const nodeGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const matCache = {};
  for (let i = 0; i < 250; i++) {
    let x, z, m, tries = 0;
    do { const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 0.8) * (WORLD_R - 40); x = Math.cos(a) * r; z = Math.sin(a) * r; m = depthOf(terrainH(x, z)); } while (m > 1700 && ++tries < 20);
    const type = nodeTypeFor(m, rnd);
    const def = RES[type];
    if (!matCache[type]) matCache[type] = new THREE.MeshStandardMaterial({ color: def.col, roughness: 0.5, metalness: 0.3, emissive: def.glow ? def.col : 0x000000, emissiveIntensity: def.glow ? 0.9 : 0 });
    const mesh = new THREE.Mesh(nodeGeo, matCache[type]);
    mesh.position.set(x, terrainH(x, z) + 0.55, z);
    mesh.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    mesh.scale.setScalar(0.8 + rnd() * 0.8);
    nodeGroup.add(mesh);
    nodes.push({ id: i, type, mesh, pos: mesh.position, depleted: false });
  }

  // --- habitat ---
  habitat = new THREE.Group();
  const hy = terrainH(HAB_XZ[0], HAB_XZ[1]);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a6e86, roughness: 0.35, metalness: 0.5, emissive: 0x1c4a5e, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 }));
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5, 1, 20), new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.7, metalness: 0.6 }));
  ring.position.y = 0.2; dome.position.y = 0.6;
  const habLight = new THREE.PointLight(0x8fe8ff, 1.4, 34, 1.4); habLight.position.y = 4;
  habitat.add(ring, dome, habLight);
  habitat.position.set(HAB_XZ[0], hy, HAB_XZ[1]);
  scene.add(habitat);

  // --- ascension pod ---
  pod = new THREE.Group();
  const py = terrainH(POD_XZ[0], POD_XZ[1]);
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 4.5, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.5, metalness: 0.7, emissive: 0x421, emissiveIntensity: 0.4 }));
  hull.position.y = 4.6;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333c44, metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4), legMat);
    const a = i / 3 * Math.PI * 2;
    leg.position.set(Math.cos(a) * 2, 1.4, Math.sin(a) * 2); leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5;
    pod.add(leg);
  }
  const podLight = new THREE.PointLight(0xff8844, 1.6, 40, 1.4); podLight.position.y = 6;
  pod.add(hull, podLight);
  pod.userData.light = podLight; pod.userData.hull = hull;
  pod.position.set(POD_XZ[0], py, POD_XZ[1]);
  scene.add(pod);

  // module meshes for already-built modules (on load)
  for (const id of Object.keys(G.modules || {})) if (G.modules[id]) buildModuleMesh(id);
  updatePodVisual();
}

const MODULE_SLOTS = { garden: 0, workshop: 1, beacon: 2, charger: 3 };
function buildModuleMesh(id) {
  if (moduleMeshes[id] || !habitat) return;
  const slot = MODULE_SLOTS[id] ?? 0;
  const a = Math.PI * 0.35 + slot * (Math.PI * 2 / 4.5);
  const g = new THREE.Group();
  const cols = { garden: 0x2fae62, workshop: 0xb9873a, beacon: 0x39d7ff, charger: 0xc98bff };
  const box = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f4552, roughness: 0.5, metalness: 0.55, emissive: cols[id] || 0x39d7ff, emissiveIntensity: 0.55 }));
  box.position.y = 1.1;
  const l = new THREE.PointLight(cols[id] || 0x39d7ff, 0.8, 16, 1.5); l.position.y = 3;
  g.add(box, l);
  const x = habitat.position.x + Math.cos(a) * 8.5, z = habitat.position.z + Math.sin(a) * 8.5;
  g.position.set(x, terrainH(x, z), z);
  scene.add(g);
  moduleMeshes[id] = g;
}
function updatePodVisual() {
  if (!pod) return;
  const on = G.flags.podInstalled;
  pod.userData.light.color.set(on ? 0x66ffcc : 0xff8844);
  pod.userData.hull.material.emissive.set(on ? 0x0a3a2a : 0x442211);
  pod.userData.hull.material.emissiveIntensity = on ? 0.9 : 0.4;
}

// ============================== Player visuals ==============================
const diver = new THREE.Group();
{
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x2a5a72, roughness: 0.6, metalness: 0.3 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.62, 4, 10), suitMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd9a8, roughness: 0.8 }));
  head.position.y = 0.72;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9be8ff, roughness: 0.1, metalness: 0.6 }));
  visor.position.set(0, 0.72, -0.13); visor.scale.set(1, 0.7, 0.6);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.66, 10), new THREE.MeshStandardMaterial({ color: 0xd9c48a, metalness: 0.7, roughness: 0.35 }));
  tank.position.set(0, 0.15, 0.34);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x1c3a4a, roughness: 0.8 });
  const finL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.6), finMat); finL.position.set(-0.15, -0.72, -0.14);
  const finR = finL.clone(); finR.position.x = 0.15;
  diver.add(torso, head, visor, tank, finL, finR);
}
scene.add(diver);

const oceanAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
window.__oceanAssetStatus = oceanAssetStatus;
function loadOceanKit() {
  const GLTFLoader = window.THREE?.GLTFLoader;
  if (!GLTFLoader) { oceanAssetStatus.error = 'GLTFLoader unavailable'; return; }
  const loader = new GLTFLoader();
  Promise.all([
    fetch('../../assets/blender-kits/deep-ocean-survival/physics.json').then((r) => r.ok ? r.json() : null).catch(() => null),
    new Promise((resolve, reject) => loader.load('../../assets/blender-kits/deep-ocean-survival/deep-ocean-survival-kit.glb', resolve, undefined, reject)),
  ]).then(([physics, gltf]) => {
    const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
    if (!source) throw new Error('Ocean player asset missing');
    const asset = source.clone(true);
    asset.name = 'BLENDER_DIVER_ASSET';
    asset.scale.setScalar(1.15);
    asset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    diver.children.forEach((child) => { child.visible = false; });
    diver.add(asset);
    oceanAssetStatus.loaded = true;
    oceanAssetStatus.physics = !!physics?.playerCollider;
    oceanAssetStatus.attached = true;
  }).catch((error) => { oceanAssetStatus.error = String(error?.message || error); });
}
loadOceanKit();

// ============================== Game state ==============================
const G = {
  state: 'menu', panel: 'menuMain', suppressPause: false,
  seed: '', mode: 'normal', difficulty: 'standard', hardcore: false,
  gear: { tank: 0, suit: 0, lamp: 0, fins: 0, harpoon: 1 },
  res: {}, modules: {}, flags: { podcore: false, podInstalled: false, won: false },
  depletedNodes: [],
  o2: 100, o2Max: 100, hp: 100, hpMax: 100, flares: 5,
  timeAlive: 0, playtimeUnreported: 0, autosaveT: 0,
  stats: { maxDepth: 0, kills: 0, gathered: 0, crafts: 0, deaths: 0, playtime: 0 },
  cam3rd: false, aiming: false, spearLoaded: true, reloadT: 0, fireT: 0,
  harvest: null, harvestT: 0, lowO2Latch: false, shake: 0, dmgFlash: 0, pauseAt: 0,
  baseTab: 'gear', helpReturn: 'menuMain', freeplay: false,
};
for (const k of RES_KEYS) G.res[k] = 0;

// ============================== Input ==============================
const keys = {};
let mouseDown = false, rmbDown = false;
const look = { yaw: 0, pitch: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (G.panel === 'menuBase' || G.panel === 'menuInv' || G.panel === 'menuMap') {
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyM') { e.preventDefault(); closeOverlay(); }
    return;
  }
  if (G.state === 'play') {
    if (e.code === 'KeyV') G.cam3rd = !G.cam3rd;
    if (e.code === 'KeyR') tryReload();
    if (e.code === 'KeyF') dropFlare();
    if (e.code === 'KeyM') { showPanel('menuMap'); drawMap(); }
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); openInventory(); }
  }
  // Esc normally reaches us only when pointer lock is not held (the browser eats
  // it otherwise and pointerlockchange opens the pause menu instead). The time
  // guard stops a stray Esc from instantly resuming a just-opened pause menu.
  if (e.code === 'Escape') {
    if (G.state === 'play') openPause();
    else if (G.state === 'pause' && performance.now() - G.pauseAt > 250) resumeGame();
  }
});
function lockPtr() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* denied */ } }
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  AU.init(); AU.resume();
  if (G.state === 'play' && !document.pointerLockElement) { lockPtr(); return; }
  if (G.state !== 'play') return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) rmbDown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmbDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement || G.state !== 'play') return;
  const s = 0.0023;
  look.yaw -= e.movementX * s;
  look.pitch -= e.movementY * s; // mouse up => look up (non-inverted)
  look.pitch = clamp(look.pitch, -1.45, 1.45);
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'play') {
    if (G.suppressPause) { G.suppressPause = false; return; }
    openPause();
  }
});

// Gamepad
const pad = { fire: false, aimHeld: false, lastButtons: [] };
function pollGamepad(dt) {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && (gps[0] || gps[1]); if (!gp) return;
  const dz = (v) => Math.abs(v) > 0.16 ? v : 0;
  if (G.state === 'play') {
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    keys.__gpF = ly < -0.2; keys.__gpB = ly > 0.2; keys.__gpL = lx < -0.2; keys.__gpR = lx > 0.2;
    look.yaw -= rx * 2.4 * dt;
    look.pitch -= ry * 1.8 * dt; // stick up => look up (non-inverted)
    look.pitch = clamp(look.pitch, -1.45, 1.45);
    keys.__gpUp = !!(gp.buttons[0] && gp.buttons[0].pressed);        // A = up
    keys.__gpDown = !!(gp.buttons[1] && gp.buttons[1].pressed);      // B = down
    keys.__gpSprint = !!(gp.buttons[4] && gp.buttons[4].pressed);    // LB
    pad.fire = !!(gp.buttons[7] && gp.buttons[7].value > 0.4);       // RT
    pad.aimHeld = !!(gp.buttons[6] && gp.buttons[6].value > 0.4);    // LT
    const pressed = (i) => gp.buttons[i] && gp.buttons[i].pressed && !pad.lastButtons[i];
    if (pressed(2)) keys.__gpInteract = true;                        // X
    if (pressed(3)) G.cam3rd = !G.cam3rd;                            // Y
    if (pressed(9)) openPause();                                     // Start
  } else {
    const pressed = (i) => gp.buttons[i] && gp.buttons[i].pressed && !pad.lastButtons[i];
    if (pressed(9) && G.state === 'pause') resumeGame();
  }
  pad.lastButtons = gp.buttons.map(b => b.pressed);
}

// ============================== Creatures ==============================
const creatures = [];
function buildCreatureMesh(type) {
  const def = CREATURES[type];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.col, roughness: 0.7, metalness: 0.1, emissive: def.glow ? def.col : 0x000000, emissiveIntensity: def.glow ? 0.35 : 0 });
  const segs = [];
  if (type === 'jelly') {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(def.rad, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.clone());
    bell.material.transparent = true; bell.material.opacity = 0.75;
    g.add(bell);
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1.6, 4), mat);
      const a = i / 5 * Math.PI * 2;
      t.position.set(Math.cos(a) * 0.5, -0.9, Math.sin(a) * 0.5);
      g.add(t);
    }
    segs.push({ z: 0, r: def.rad }, { z: 0, r: def.rad * 0.6, y: -0.8 }, { z: 0, r: 0.3, y: -1.5 });
  } else {
    const len = def.rad * 4.2;
    const body = new THREE.Mesh(new THREE.SphereGeometry(def.rad, 12, 8), mat);
    body.scale.set(0.62, 0.62, len / (def.rad * 2));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(def.rad * 0.55, def.rad * 1.4, 6), mat);
    tail.rotation.x = -Math.PI / 2; tail.position.z = len * 0.56;
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(def.rad * 0.3, def.rad * 0.9, 4), mat);
    dorsal.position.set(0, def.rad * 0.6, 0);
    g.add(body, tail, dorsal);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3322, emissiveIntensity: type === 'leviathan' ? 1.5 : 0.6 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(def.rad * 0.12, 6, 5), eyeMat);
      eye.position.set(s * def.rad * 0.32, def.rad * 0.18, -len * 0.42);
      g.add(eye);
    }
    if (type === 'angler') {
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xaaffee, emissiveIntensity: 3 }));
      lure.position.set(0, def.rad * 0.9, -len * 0.5);
      const lureL = new THREE.PointLight(0xaaffee, 0.9, 14, 1.6); lureL.position.copy(lure.position);
      g.add(lure, lureL);
    }
    for (let i = 0; i < def.segs; i++) segs.push({ z: -len * 0.45 + i * (len * 0.9 / (def.segs - 1)), r: def.rad * (0.85 - Math.abs(i / (def.segs - 1) - 0.35) * 0.7) });
  }
  g.userData.segs = segs;
  return g;
}
let creatureRnd = mulberry32(12345);
function spawnCreature(type, pos) {
  const def = CREATURES[type];
  const mesh = buildCreatureMesh(type);
  mesh.position.copy(pos);
  scene.add(mesh);
  const c = { type, def, mesh, hp: def.hp, vel: new THREE.Vector3(), heading: creatureRnd() * Math.PI * 2, state: 'wander', atkT: 0, t: creatureRnd() * 100 };
  creatures.push(c);
  return c;
}
function removeCreature(c, drop = true) {
  const i = creatures.indexOf(c); if (i >= 0) creatures.splice(i, 1);
  scene.remove(c.mesh);
}
function creatureManager(dt) {
  if (G.state !== 'play') return;
  const pm = depthOf(playerBody.position.y);
  const hostiles = creatures.filter(c => c.def.aggro > 0).length;
  const jellies = creatures.length - hostiles;
  // despawn far ones
  for (const c of creatures.slice()) {
    if (c.mesh.position.distanceTo(playerBody.position) > 150) removeCreature(c, false);
  }
  const want = G.difficulty === 'brutal' ? 8 : G.difficulty === 'relaxed' ? 5 : 7;
  if (hostiles < want || jellies < 3) {
    const candidates = Object.keys(CREATURES).filter(k => {
      const d = CREATURES[k];
      if (d.aggro > 0 && hostiles >= want) return false;
      if (d.aggro === 0 && jellies >= 3) return false;
      return pm > d.min - 80 && pm < d.max + 80;
    });
    if (candidates.length && creatureRnd() < dt * 0.5) {
      const type = candidates[Math.floor(creatureRnd() * candidates.length)];
      const a = creatureRnd() * Math.PI * 2, dist = 60 + creatureRnd() * 55;
      const p = new THREE.Vector3(playerBody.position.x + Math.cos(a) * dist, 0, playerBody.position.z + Math.sin(a) * dist);
      const def = CREATURES[type];
      const m = clamp(pm + (creatureRnd() - 0.5) * 120, def.min, def.max);
      p.y = Math.max(yFor(m), terrainH(p.x, p.z) + def.rad + 1.5);
      if (p.y > -1) p.y = -2;
      spawnCreature(type, p);
    }
  }
  // AI
  const pp = playerBody.position;
  for (const c of creatures) {
    c.t += dt;
    const d = c.mesh.position.distanceTo(pp);
    const def = c.def;
    let target = null, speed = def.speed * 0.45;
    if (def.aggro > 0 && d < def.aggro && G.hp > 0) { c.state = 'chase'; }
    else if (c.state === 'chase' && d > def.aggro * 1.6) c.state = 'wander';
    if (c.hp < def.hp * 0.22 && def.aggro > 0 && c.type === 'shark') c.state = 'flee';
    if (c.state === 'chase') { target = pp; speed = def.speed; }
    else if (c.state === 'flee') { target = c.mesh.position.clone().sub(pp).setLength(30).add(c.mesh.position); speed = def.speed; }
    const dir = new THREE.Vector3();
    if (target) dir.subVectors(target, c.mesh.position).normalize();
    else {
      c.heading += (n2(c.t * 0.25, c.mesh.position.x * 0.01) * 1.2) * dt;
      dir.set(Math.cos(c.heading), Math.sin(c.t * 0.7) * 0.15, Math.sin(c.heading));
    }
    c.vel.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-2.2 * dt));
    c.mesh.position.addScaledVector(c.vel, dt);
    // clamp to terrain and water, and depth band
    const h = terrainH(c.mesh.position.x, c.mesh.position.z) + def.rad + 0.4;
    if (c.mesh.position.y < h) c.mesh.position.y = h;
    if (c.mesh.position.y > -1.2) c.mesh.position.y = -1.2;
    const mNow = depthOf(c.mesh.position.y);
    if (mNow < def.min - 60) c.mesh.position.y -= dt * 3;
    if (mNow > def.max + 60) c.mesh.position.y += dt * 3;
    // orient
    if (c.vel.lengthSq() > 0.01) {
      const lookP = c.mesh.position.clone().add(c.type === 'jelly' ? new THREE.Vector3(0, 1, 0) : c.vel);
      if (c.type !== 'jelly') { c.mesh.lookAt(lookP); c.mesh.rotateY(Math.PI); }
    }
    if (c.type === 'jelly') c.mesh.position.y += Math.sin(c.t * 1.4) * dt * 0.6;
    // attack
    c.atkT -= dt;
    if (def.aggro > 0 && d < def.rad + 2.1 && c.atkT <= 0 && G.hp > 0) {
      c.atkT = 1.25;
      const kb = c.vel.clone().setLength(6);
      damagePlayer(def.dmg * DIFFS[G.difficulty].dmg, `Killed by a ${def.name.toLowerCase()}`, kb);
      AU.bite(); G.shake = Math.max(G.shake, 0.5);
      if (c.type === 'leviathan') AU.roar();
    }
    if (def.aggro === 0 && d < def.rad + 1.2 && c.atkT <= 0 && G.hp > 0) { // jelly sting on touch
      c.atkT = 1.5;
      damagePlayer(def.dmg * DIFFS[G.difficulty].dmg, 'Stung to death by a moon jelly', new THREE.Vector3(0, 2, 0));
      AU.bite();
    }
  }
}
function hurtCreature(c, dmg, impulseDir) {
  c.hp -= dmg;
  AU.hit(); G.shake = Math.max(G.shake, 0.12);
  // flash
  c.mesh.traverse(o => { if (o.material && o.material.emissive) { o.material._e0 = o.material._e0 ?? o.material.emissiveIntensity; o.material.emissiveIntensity = 2.2; setTimeout(() => { o.material.emissiveIntensity = o.material._e0; }, 90); } });
  if (c.hp <= 0) {
    G.stats.kills++;
    unlock('first-kill');
    spawnRagdoll(c, impulseDir);
    // drops
    const n = c.type === 'leviathan' ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = c.type === 'leviathan' ? (Math.random() < 0.6 ? 'alloy' : 'gel') : 'gel';
      spawnPickup(t, c.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)));
    }
    removeCreature(c);
    toast(`${c.def.name} killed`);
  }
}

// ============================== Ragdolls (cannon-es) ==============================
const ragdolls = [];
function spawnRagdoll(c, impulseDir) {
  const segs = c.mesh.userData.segs || [{ z: 0, r: c.def.rad }];
  const bodies = [], meshes = [], constraints = [];
  const q = c.mesh.quaternion;
  const mat = new THREE.MeshStandardMaterial({ color: c.def.col, roughness: 0.75, transparent: true, opacity: 1, emissive: c.def.glow ? c.def.col : 0x000000, emissiveIntensity: c.def.glow ? 0.25 : 0 });
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const local = new THREE.Vector3(0, s.y || 0, s.z || 0).applyQuaternion(q);
    const p = c.mesh.position.clone().add(local);
    const body = new CANNON.Body({ mass: 3 + s.r * 2, shape: new CANNON.Sphere(Math.max(0.18, s.r * 0.8)), linearDamping: 0.75, angularDamping: 0.9 });
    body.position.set(p.x, p.y, p.z);
    const v = c.vel.clone().add(impulseDir ? impulseDir.clone().multiplyScalar(9) : new THREE.Vector3());
    body.velocity.set(v.x + (Math.random() - 0.5) * 2, v.y + Math.random() * 2, v.z + (Math.random() - 0.5) * 2);
    body.__underwater = true; body.__buoy = 0.72; // sinks slowly
    world.addBody(body);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.18, s.r * 0.85), 10, 8), mat);
    mesh.scale.set(1, 0.85, 1.25);
    scene.add(mesh);
    bodies.push(body); meshes.push(mesh);
    if (i > 0) {
      const dist = bodies[i - 1].position.distanceTo(body.position);
      const con = new CANNON.DistanceConstraint(bodies[i - 1], body, Math.max(0.2, dist));
      world.addConstraint(con); constraints.push(con);
    }
    if (i > 1) { // stiffener
      const dist = bodies[i - 2].position.distanceTo(body.position);
      const con = new CANNON.DistanceConstraint(bodies[i - 2], body, Math.max(0.3, dist), 1e4);
      world.addConstraint(con); constraints.push(con);
    }
  }
  ragdolls.push({ bodies, meshes, constraints, mat, life: 12 });
}
function removeRagdoll(r) {
  for (const c of r.constraints) world.removeConstraint(c);
  for (const b of r.bodies) world.removeBody(b);
  for (const m of r.meshes) scene.remove(m);
  const i = ragdolls.indexOf(r); if (i >= 0) ragdolls.splice(i, 1);
}
function ragdollTick(dt) {
  for (const r of ragdolls.slice()) {
    r.life -= dt;
    for (let i = 0; i < r.bodies.length; i++) {
      r.meshes[i].position.copy(r.bodies[i].position);
      r.meshes[i].quaternion.copy(r.bodies[i].quaternion);
    }
    if (r.life < 2) r.mat.opacity = Math.max(0, r.life / 2);
    if (r.life <= 0) removeRagdoll(r);
  }
}

// ============================== Pickups / flares / spears ==============================
const pickups = [];
const pickGeo = new THREE.OctahedronGeometry(0.32, 0);
function spawnPickup(type, pos) {
  const def = RES[type];
  const mesh = new THREE.Mesh(pickGeo, new THREE.MeshStandardMaterial({ color: def.col, emissive: def.col, emissiveIntensity: 1.2 }));
  mesh.position.copy(pos);
  scene.add(mesh);
  pickups.push({ type, mesh, t: 0 });
}
function removePickup(p) { scene.remove(p.mesh); const i = pickups.indexOf(p); if (i >= 0) pickups.splice(i, 1); }
function pickupTick(dt) {
  for (const p of pickups.slice()) {
    p.t += dt;
    p.mesh.rotation.y += dt * 2;
    const d = p.mesh.position.distanceTo(playerBody.position);
    if (d < 4) p.mesh.position.lerp(new THREE.Vector3().copy(playerBody.position), 1 - Math.exp(-4 * dt));
    else p.mesh.position.y += Math.sin(p.t * 2) * dt * 0.3;
    const h = terrainH(p.mesh.position.x, p.mesh.position.z) + 0.4;
    if (p.mesh.position.y < h) p.mesh.position.y = h;
    if (d < 1.4) { addRes(p.type, 1); AU.pickup(); removePickup(p); }
    else if (p.t > 90) removePickup(p);
  }
}
function addRes(type, n) {
  G.res[type] += n;
  G.stats.gathered += n;
  achProgress('collector', G.stats.gathered, 100);
  updateResMini();
}

const flares = [];
function dropFlare() {
  if (G.flares <= 0) { toast('No flares left'); return; }
  G.flares--;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dffb2 }));
  const light = new THREE.PointLight(0x7dffb2, 1.8, 26, 1.5);
  mesh.add(light);
  mesh.position.copy(playerBody.position).add(new THREE.Vector3(0, -0.5, 0));
  scene.add(mesh);
  flares.push({ mesh, light, life: 60 });
  if (flares.length > 4) removeFlare(flares[0]);
  AU.bubble(); updateToolbox();
}
function removeFlare(f) { scene.remove(f.mesh); const i = flares.indexOf(f); if (i >= 0) flares.splice(i, 1); }
function flareTick(dt) {
  for (const f of flares.slice()) {
    f.life -= dt;
    const h = terrainH(f.mesh.position.x, f.mesh.position.z) + 0.2;
    if (f.mesh.position.y > h) f.mesh.position.y = Math.max(h, f.mesh.position.y - dt * 1.5);
    if (f.life < 6) f.light.intensity = 1.8 * (f.life / 6);
    if (f.life <= 0) removeFlare(f);
  }
}

const spears = [];
const spearGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5);
spearGeo.rotateX(Math.PI / 2);
const spearMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.8, roughness: 0.3 });
function fireHarpoon() {
  if (!G.spearLoaded || G.fireT > 0 || G.reloadT > 0) return;
  G.spearLoaded = false; G.fireT = 0.18;
  AU.shoot(); G.shake = Math.max(G.shake, 0.08);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const mesh = new THREE.Mesh(spearGeo, spearMat);
  const start = new THREE.Vector3().copy(playerBody.position).addScaledVector(dir, 1.4);
  mesh.position.copy(start);
  mesh.lookAt(start.clone().add(dir));
  scene.add(mesh);
  spears.push({ mesh, dir: dir.clone(), vel: 52, life: 1.6, stuck: 0 });
  setTimeout(() => tryReload(true), 60);
  updateToolbox();
}
function tryReload(auto = false) {
  if (G.spearLoaded || G.reloadT > 0) return;
  G.reloadT = 1.1;
  if (!auto) AU.bubble();
  updateToolbox();
}
function removeSpear(s) { scene.remove(s.mesh); const i = spears.indexOf(s); if (i >= 0) spears.splice(i, 1); }
function spearTick(dt) {
  for (const s of spears.slice()) {
    s.life -= dt;
    if (s.life <= 0) { removeSpear(s); continue; }
    if (s.stuck > 0) continue;
    s.dir.y -= dt * 0.12; s.dir.normalize();
    s.mesh.position.addScaledVector(s.dir, s.vel * dt);
    s.mesh.lookAt(s.mesh.position.clone().add(s.dir));
    // creature hit
    for (const c of creatures) {
      if (s.mesh.position.distanceTo(c.mesh.position) < c.def.rad + 0.9) {
        hurtCreature(c, HARPS[G.gear.harpoon - 1], s.dir);
        removeSpear(s); break;
      }
    }
    if (!spears.includes(s)) continue;
    // terrain hit
    if (s.mesh.position.y < terrainH(s.mesh.position.x, s.mesh.position.z)) { s.stuck = 1; s.life = Math.min(s.life, 1.2); }
    if (s.mesh.position.y > 0.5) removeSpear(s);
  }
}

// ============================== Player systems ==============================
function damagePlayer(dmg, cause, knockback) {
  if (G.state !== 'play') return;
  G.hp -= dmg;
  G.dmgFlash = 1;
  G.shake = Math.max(G.shake, 0.35);
  if (knockback) playerBody.velocity.vadd(new CANNON.Vec3(knockback.x, knockback.y, knockback.z), playerBody.velocity);
  if (G.hp <= 0) { G.hp = 0; die(cause); }
  updateBars();
}
function die(cause) {
  G.state = 'dead';
  G.stats.deaths++;
  AU.die();
  document.exitPointerLock && document.exitPointerLock();
  $('deathTitle').textContent = G.hardcore ? 'Run Over' : 'You Died';
  $('deathDesc').textContent = cause || 'The deep claimed you.';
  $('deathStats').innerHTML = statRows();
  $('btnRespawn').classList.toggle('hidden', G.hardcore);
  showPanel('menuDeath');
  if (G.hardcore) {
    empire.saveState('auto', { hardcoreDead: true, seed: G.seed, mode: G.mode, difficulty: G.difficulty, hardcore: true, stats: G.stats },
      { label: 'Hardcore run ended', mode: G.mode, difficulty: G.difficulty, seed: G.seed }).catch(() => {});
  } else {
    saveGame('auto');
  }
}
function respawn() {
  const hy = terrainH(HAB_XZ[0], HAB_XZ[1]);
  playerBody.position.set(HAB_XZ[0] + 3, hy + 4, HAB_XZ[1] + 3);
  playerBody.velocity.setZero();
  G.hp = G.hpMax; G.o2 = G.o2Max; G.timeAlive = 0;
  G.state = 'play';
  showPanel(null);
  $('hud').classList.remove('hidden');
  lockPtr();
  updateBars();
}

function playerTick(dt) {
  const diff = DIFFS[G.difficulty];
  const p = playerBody.position;
  const depthM = depthOf(p.y);
  const underwater = p.y < 0.2;

  // --- movement ---
  yawObj.rotation.y = look.yaw;
  pitchObj.rotation.x = look.pitch;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const flatF = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  const right = new THREE.Vector3(flatF.z, 0, -flatF.x);
  const sprint = (keys.ShiftLeft || keys.ShiftRight || keys.__gpSprint) && G.o2 > 2;
  const speed = 6.2 * FINS[G.gear.fins] * (sprint ? 1.55 : 1) * (G.aiming ? 0.6 : 1);
  const wish = new THREE.Vector3();
  if (keys.KeyW || keys.__gpF) wish.add(underwater ? fwd : flatF);
  if (keys.KeyS || keys.__gpB) wish.sub(underwater ? fwd : flatF);
  if (keys.KeyA || keys.__gpL) wish.add(right);
  if (keys.KeyD || keys.__gpR) wish.sub(right);
  if (keys.Space || keys.__gpUp) wish.y += 1;
  if (keys.KeyC || keys.ControlLeft || keys.__gpDown) wish.y -= 1;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
  if (underwater) {
    // buoyancy: neutral
    playerBody.applyForce(new CANNON.Vec3(0, 9.8 * playerBody.mass, 0));
    const k = 1 - Math.exp(-6 * dt);
    playerBody.velocity.x = lerp(playerBody.velocity.x, wish.x, k);
    playerBody.velocity.y = lerp(playerBody.velocity.y, wish.y, k);
    playerBody.velocity.z = lerp(playerBody.velocity.z, wish.z, k);
  } else {
    const k = 1 - Math.exp(-4 * dt);
    playerBody.velocity.x = lerp(playerBody.velocity.x, wish.x, k);
    playerBody.velocity.z = lerp(playerBody.velocity.z, wish.z, k);
    if ((keys.Space || keys.__gpUp) && p.y < 0.6) playerBody.velocity.y = 4.5; // surface hop
  }
  // world bounds
  const rr = Math.hypot(p.x, p.z);
  if (rr > WORLD_R) { const s = WORLD_R / rr; p.x *= s; p.z *= s; }
  if (p.y > 1.6) { p.y = 1.6; playerBody.velocity.y = Math.min(playerBody.velocity.y, 0); }

  // --- oxygen ---
  const atSurface = depthM < 3;
  const nearHab = habitat && new THREE.Vector3(p.x, p.y, p.z).distanceTo(habitat.position) < 8;
  const nearPod = pod && new THREE.Vector3(p.x, p.y, p.z).distanceTo(pod.position) < 7;
  if (atSurface || nearHab || nearPod) {
    if (G.o2 < G.o2Max) {
      if (G.o2 / G.o2Max < 0.05 && !G.lowO2Latch) { unlock('close-call'); }
      G.lowO2Latch = true;
      const rate = nearHab && G.modules.garden ? G.o2Max * 0.45 : G.o2Max * 0.16;
      G.o2 = Math.min(G.o2Max, G.o2 + rate * dt);
      if (Math.random() < dt * 4) AU.bubble();
    }
    if ((nearHab || atSurface) && G.hp < G.hpMax) G.hp = Math.min(G.hpMax, G.hp + 7 * dt);
  } else {
    G.lowO2Latch = false;
    G.o2 -= dt * diff.o2 * (sprint && wish.lengthSq() > 0 ? 1.7 : 1);
    if (Math.random() < dt * 0.5) AU.bubble();
    if (G.o2 <= 0) { G.o2 = 0; G.hp -= 9 * dt; if (G.hp <= 0) { G.hp = 0; die('Drowned in the dark'); } }
  }
  const o2frac = G.o2 / G.o2Max;
  $('o2bar').classList.toggle('alarm', o2frac < 0.25);
  if (o2frac < 0.25 && Math.floor(G.timeAlive * 1.4) !== Math.floor((G.timeAlive - dt) * 1.4)) AU.alarm();

  // --- pressure ---
  const crush = SUITS[G.gear.suit];
  const over = depthM - crush;
  $('depthbox').classList.toggle('over', over > 0);
  if (over > 0) {
    G.hp -= (2 + over / 60) * diff.press * dt;
    G.shake = Math.max(G.shake, 0.1);
    if (Math.random() < dt * 1.6) AU.creak();
    if (G.hp <= 0) { G.hp = 0; die(`Crushed at ${fmt(depthM)} m — suit rated to ${fmt(crush)} m`); }
  }

  // --- depth achievements & stats ---
  G.stats.maxDepth = Math.max(G.stats.maxDepth, depthM);
  if (depthM > 50) unlock('first-dive');
  if (depthM > 200) unlock('twilight-zone');
  if (depthM > 500) unlock('midnight-zone');
  if (depthM > 1000) unlock('abyssal');
  if (depthM > 1500 && p.y < terrainH(p.x, p.z) + 3) unlock('trench-floor');
  G.timeAlive += dt;
  if (G.timeAlive > 1200) unlock('survivor');

  // --- firing / aiming ---
  G.fireT = Math.max(0, G.fireT - dt);
  if (G.reloadT > 0) { G.reloadT -= dt; if (G.reloadT <= 0) { G.reloadT = 0; G.spearLoaded = true; updateToolbox(); } }
  G.aiming = rmbDown || pad.aimHeld;
  camera.fov = lerp(camera.fov, G.aiming ? 50 : 74, 1 - Math.exp(-10 * dt));
  camera.updateProjectionMatrix();
  $('xh').classList.toggle('aim', G.aiming);
  if ((mouseDown || pad.fire) && document.pointerLockElement) fireHarpoon();

  // --- interact ---
  interactTick(dt, nearHab, nearPod);
  keys.__gpInteract = false;

  updateBars(); updateDepthUI(depthM);
}

// interact: harvest nodes, habitat, pod
function interactTick(dt, nearHab, nearPod) {
  const p = playerBody.position;
  const pv = new THREE.Vector3(p.x, p.y, p.z);
  let prompt = '';
  const eHeld = keys.KeyE || keys.__gpInteract;

  // nearest node in reach
  let best = null, bestD = 5;
  for (const n of nodes) {
    if (n.depleted) continue;
    const d = n.pos.distanceTo(pv);
    if (d < bestD) { best = n; bestD = d; }
  }
  if (nearHab) {
    prompt = 'E — Open Habitat Fabricator';
    if (eHeld) { keys.KeyE = false; openBase(); return; }
  } else if (nearPod) {
    if (G.flags.podInstalled) {
      prompt = 'E — LAUNCH the Ascension Pod';
      if (eHeld) { keys.KeyE = false; startLaunch(); return; }
    } else if (G.flags.podcore) {
      prompt = 'E — Install Pod Power Core';
      if (eHeld) {
        keys.KeyE = false;
        G.flags.podcore = false; G.flags.podInstalled = true;
        updatePodVisual(); AU.craft();
        toast('Power core installed — the pod hums to life');
        saveGame('auto');
      }
    } else {
      prompt = 'Ascension Pod — needs a Pod Power Core (craft at habitat)';
    }
  } else if (best) {
    prompt = `${RES[best.type].name} deposit\nHold E to harvest`;
    if (eHeld) {
      G.harvest = best;
      G.harvestT += dt / 1.6;
      $('harv').classList.remove('hidden');
      $('harv').firstElementChild.style.width = `${Math.min(100, G.harvestT * 100)}%`;
      if (Math.random() < dt * 6) AU.bubble();
      if (G.harvestT >= 1) {
        const n = 2 + Math.floor(Math.random() * 3);
        addRes(best.type, n);
        toast(`+${n} ${RES[best.type].name}`);
        AU.pickup();
        best.depleted = true; G.depletedNodes.push(best.id);
        best.mesh.visible = false;
        G.harvestT = 0; G.harvest = null;
        $('harv').classList.add('hidden');
      }
    } else { G.harvestT = 0; $('harv').classList.add('hidden'); }
  } else { G.harvestT = 0; $('harv').classList.add('hidden'); }

  const pe = $('prompt');
  if (prompt) { pe.textContent = prompt; pe.classList.remove('hidden'); }
  else pe.classList.add('hidden');
}

// ============================== Launch / win ==============================
let launchT = 0;
function startLaunch() {
  G.state = 'launch'; launchT = 0; G.cam3rd = true;
  AU.launch();
  document.exitPointerLock && document.exitPointerLock();
  G.suppressPause = true;
  toast('IGNITION — ascending!');
}
function launchTick(dt) {
  launchT += dt;
  playerBody.velocity.setZero();
  const speed = Math.min(60, launchT * 14);
  playerBody.position.y += speed * dt;
  playerBody.position.x = lerp(playerBody.position.x, POD_XZ[0], dt);
  playerBody.position.z = lerp(playerBody.position.z, POD_XZ[1], dt);
  pod.position.set(playerBody.position.x, playerBody.position.y - 6, playerBody.position.z);
  G.shake = 0.4;
  if (Math.random() < dt * 20) AU.bubble();
  if (playerBody.position.y >= -1) {
    G.state = 'win'; G.flags.won = true;
    unlock('ascension');
    if (G.hardcore) unlock('iron-lungs');
    $('winStats').innerHTML = statRows();
    showPanel('menuWin');
    saveGame('auto');
  }
  updateDepthUI(depthOf(playerBody.position.y));
}
function statRows() {
  return `
    <span>Max depth</span><b>${fmt(G.stats.maxDepth)} m</b>
    <span>Creatures killed</span><b>${G.stats.kills}</b>
    <span>Resources gathered</span><b>${G.stats.gathered}</b>
    <span>Items crafted</span><b>${G.stats.crafts}</b>
    <span>Deaths</span><b>${G.stats.deaths}</b>
    <span>Time alive</span><b>${Math.floor(G.timeAlive / 60)}:${String(Math.floor(G.timeAlive % 60)).padStart(2, '0')}</b>
    <span>Seed</span><b>${G.seed}</b>
    <span>Mode</span><b>${DIFFS[G.difficulty].label}${G.hardcore ? ' · Hardcore' : ''}${G.mode === 'daily' ? ' · Daily' : ''}</b>`;
}

// ============================== Crafting ==============================
function recipeAvailable(r) {
  if (r.needs && !G.modules[r.needs]) { const req = RECIPES.find(x => x.id === r.needs); return { ok: false, why: `Requires ${req ? req.name : r.needs}` }; }
  if (r.kind === 'gear') {
    const cur = r.gear === 'harpoon' ? G.gear.harpoon : G.gear[r.gear];
    if (cur >= r.tier) return { ok: false, why: 'Owned', owned: true };
    if (cur < r.tier - 1) return { ok: false, why: 'Craft previous tier first' };
  }
  if (r.kind === 'module' && G.modules[r.id]) return { ok: false, why: 'Built', owned: true };
  if (r.kind === 'special' && (G.flags.podcore || G.flags.podInstalled)) return { ok: false, why: G.flags.podInstalled ? 'Installed' : 'In inventory', owned: true };
  for (const k in r.cost) if ((G.res[k] || 0) < r.cost[k]) return { ok: false, why: 'Missing resources' };
  return { ok: true };
}
function craft(r) {
  const av = recipeAvailable(r);
  if (!av.ok) return;
  for (const k in r.cost) G.res[k] -= r.cost[k];
  G.stats.crafts++;
  unlock('first-craft');
  if (r.kind === 'gear') {
    G.gear[r.gear] = r.tier;
    if (r.gear === 'tank') { G.o2Max = TANKS[r.tier]; G.o2 = G.o2Max; }
    if (r.gear === 'lamp') applyLamp();
    if (r.id === 'suit4') unlock('fully-equipped');
  } else if (r.kind === 'module') {
    G.modules[r.id] = true;
    buildModuleMesh(r.id);
    const built = Object.values(G.modules).filter(Boolean).length;
    if (built >= 3) unlock('home-sweet-home');
    $('basedir').style.display = G.modules.beacon ? 'block' : 'none';
  } else if (r.id === 'podcore') {
    G.flags.podcore = true;
    toast('Pod Power Core built — take it to the trench floor');
  }
  AU.craft();
  toast(`Crafted: ${r.name}`);
  updateResMini(); updateToolbox(); renderBaseList();
  saveGame('auto');
}
function applyLamp() {
  lamp.distance = LAMPS[G.gear.lamp];
  lamp.angle = 0.55 + G.gear.lamp * 0.09;
  lamp.intensity = 1.6 + G.gear.lamp * 0.7;
}

// ============================== Base / inventory UI ==============================
function openBase() { G.baseTab = 'gear'; renderBaseList(); showPanel('menuBase'); }
function renderBaseList() {
  for (const [tab, btn] of [['gear', 'tabGear'], ['module', 'tabModules'], ['special', 'tabSpecial']]) $(btn).classList.toggle('sel', G.baseTab === tab);
  const list = RECIPES.filter(r => r.kind === G.baseTab);
  $('baseList').innerHTML = list.map(r => {
    const av = recipeAvailable(r);
    const cost = Object.entries(r.cost).map(([k, v]) => `<span class="${(G.res[k] || 0) >= v ? 'ok' : 'no'}">${v} ${RES[k].name}</span>`).join(' · ');
    return `<div class="recipe">
      <div><div class="nm">${r.name}</div><div class="ds">${r.ds}</div><div class="cost">${cost}</div></div>
      <button class="small" data-craft="${r.id}" ${av.ok ? '' : 'disabled'}>${av.ok ? 'Craft' : av.why}</button>
    </div>`;
  }).join('');
  $('baseList').querySelectorAll('[data-craft]').forEach(b => b.onclick = () => { const r = RECIPES.find(x => x.id === b.dataset.craft); craft(r); });
}
function openInventory() {
  $('invBody').innerHTML = `
    <div class="statgrid">
      <span>O2 Tank</span><b>Tier ${G.gear.tank + 1} — ${TANKS[G.gear.tank]}s</b>
      <span>Dive Suit</span><b>Tier ${G.gear.suit + 1} — ${fmt(SUITS[G.gear.suit])} m crush</b>
      <span>Lamp</span><b>Tier ${G.gear.lamp + 1}</b>
      <span>Fins</span><b>Tier ${G.gear.fins + 1} — ×${FINS[G.gear.fins]}</b>
      <span>Harpoon</span><b>Tier ${G.gear.harpoon} — ${HARPS[G.gear.harpoon - 1]} dmg</b>
      <span>Flares</span><b>${G.flares}</b>
      <span>Pod Core</span><b>${G.flags.podInstalled ? 'Installed' : G.flags.podcore ? 'Carried' : '—'}</b>
    </div>
    <div class="sub">Resources</div>
    <div class="statgrid">${RES_KEYS.map(k => `<span>${RES[k].name}</span><b>${G.res[k]}</b>`).join('')}</div>`;
  showPanel('menuInv');
}
function closeOverlay() {
  showPanel(null);
  $('hud').classList.remove('hidden');
  if (G.state === 'play') lockPtr();
}

// ============================== Map ==============================
function drawMap() {
  const c = $('mapCanvas'), g = c.getContext('2d');
  const W = c.width, H = c.height;
  const scale = Math.min(W, H) / (WORLD_R * 2.15);
  const cx = W / 2, cy = H / 2;
  g.fillStyle = '#020a14'; g.fillRect(0, 0, W, H);
  // depth shading rings
  for (let i = 0; i < 60; i++) {
    const r = (i / 60) * WORLD_R;
    const m = depthOf(terrainH(r, 0));
    const z = zoneAt(m);
    g.strokeStyle = '#' + new THREE.Color(z.fog).getHexString();
    g.lineWidth = WORLD_R * scale / 58;
    g.beginPath(); g.arc(cx, cy, r * scale, 0, Math.PI * 2); g.stroke();
  }
  const dot = (x, z, col, r = 5) => { g.fillStyle = col; g.beginPath(); g.arc(cx + x * scale, cy + z * scale, r, 0, Math.PI * 2); g.fill(); };
  dot(POD_XZ[0], POD_XZ[1], '#ffd76b', 6);
  g.fillStyle = '#ffd76b'; g.font = '11px sans-serif'; g.fillText('POD', cx + 8, cy + 4);
  dot(HAB_XZ[0], HAB_XZ[1], '#8fe8b0', 6);
  g.fillText('HABITAT', cx + HAB_XZ[0] * scale + 8, cy + HAB_XZ[1] * scale + 4);
  for (const f of flares) dot(f.mesh.position.x, f.mesh.position.z, '#7dffb2', 3);
  // player w/ heading
  const p = playerBody.position;
  dot(p.x, p.z, '#39d7ff', 5);
  g.strokeStyle = '#39d7ff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx + p.x * scale, cy + p.z * scale);
  g.lineTo(cx + (p.x - Math.sin(look.yaw) * 30) * scale, cy + (p.z - Math.cos(look.yaw) * 30) * scale); g.stroke();
  g.fillStyle = '#cfe9f5'; g.fillText(`You — ${fmt(depthOf(p.y))} m`, cx + p.x * scale + 8, cy + p.z * scale - 6);
}

// ============================== HUD ==============================
function updateBars() {
  $('o2fill').style.width = `${clamp(G.o2 / G.o2Max, 0, 1) * 100}%`;
  $('o2txt').textContent = `O2 ${Math.ceil(G.o2)}s`;
  $('hpfill').style.width = `${clamp(G.hp / G.hpMax, 0, 1) * 100}%`;
  $('hptxt').textContent = `HULL ${Math.ceil(G.hp)}`;
}
function updateDepthUI(m) {
  $('depthTxt').textContent = `${fmt(m)} m`;
  $('zoneTxt').textContent = `${zoneAt(m).name} · suit ${fmt(SUITS[G.gear.suit])} m`;
}
function updateResMini() {
  $('resmini').innerHTML = RES_KEYS.filter(k => G.res[k] > 0).map(k => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#${new THREE.Color(RES[k].col).getHexString()}"></i>${G.res[k]}</span>`).join('') || '<span>No resources yet — harvest glowing deposits (E)</span>';
}
function updateToolbox() {
  $('toolbox').innerHTML = `Harpoon T${G.gear.harpoon} — ${G.spearLoaded ? 'LOADED' : G.reloadT > 0 ? 'reloading…' : 'empty (R)'}<br>Flares: ${G.flares} (F)`;
}
function updateBaseDir() {
  const el = $('basedir');
  if (!G.modules.beacon || !habitat) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const p = playerBody.position;
  const dx = habitat.position.x - p.x, dz = habitat.position.z - p.z;
  const d = Math.hypot(dx, dz);
  const worldA = Math.atan2(dx, dz);
  let rel = worldA - (look.yaw + Math.PI);
  while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
  const arrow = Math.abs(rel) < 0.4 ? '↑' : rel > 0 ? (Math.abs(rel) > 2.6 ? '↓' : '←') : (Math.abs(rel) > 2.6 ? '↓' : '→');
  el.textContent = `⌂ Habitat ${arrow} ${fmt(d * DS)} m`;
}

// ============================== Save / load ==============================
function saveBlob() {
  return {
    seed: G.seed, mode: G.mode, difficulty: G.difficulty, hardcore: G.hardcore,
    gear: { ...G.gear }, res: { ...G.res }, modules: { ...G.modules }, flags: { ...G.flags },
    depletedNodes: G.depletedNodes.slice(), o2: G.o2, o2Max: G.o2Max, hp: G.hp, flares: G.flares,
    timeAlive: G.timeAlive, stats: { ...G.stats },
    player: { x: playerBody.position.x, y: playerBody.position.y, z: playerBody.position.z, yaw: look.yaw, pitch: look.pitch },
  };
}
function captureThumb() {
  try {
    renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0, 320, 180);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return undefined; }
}
async function saveGame(slot) {
  if (G.state === 'menu') return;
  const depth = depthOf(playerBody.position.y);
  const meta = {
    label: `${DIFFS[G.difficulty].label}${G.hardcore ? ' · Hardcore' : ''}${G.mode === 'daily' ? ' · Daily' : ''} — ${fmt(depth)} m`,
    playtimeSec: Math.round(G.stats.playtime),
    progress: clamp(G.stats.maxDepth / 1600, 0, 1),
    mode: G.mode, difficulty: G.difficulty, seed: G.seed,
    thumbnail: captureThumb(),
  };
  try {
    await empire.saveState(slot, saveBlob(), meta);
    await empire.setContinuePoint(slot, meta.label);
    if (slot !== 'auto') toast(`Saved to ${slot}`);
  } catch { if (slot !== 'auto') toast('Save failed'); }
}
function applyBlob(blob) {
  G.seed = blob.seed; G.mode = blob.mode || 'normal'; G.difficulty = blob.difficulty || 'standard'; G.hardcore = !!blob.hardcore;
  G.gear = { tank: 0, suit: 0, lamp: 0, fins: 0, harpoon: 1, ...blob.gear };
  G.res = {}; for (const k of RES_KEYS) G.res[k] = (blob.res && blob.res[k]) || 0;
  G.modules = { ...(blob.modules || {}) };
  G.flags = { podcore: false, podInstalled: false, won: false, ...(blob.flags || {}) };
  G.depletedNodes = (blob.depletedNodes || []).slice();
  G.o2Max = blob.o2Max || TANKS[G.gear.tank]; G.o2 = blob.o2 ?? G.o2Max;
  G.hp = blob.hp ?? 100; G.flares = blob.flares ?? 5;
  G.timeAlive = blob.timeAlive || 0;
  G.stats = { maxDepth: 0, kills: 0, gathered: 0, crafts: 0, deaths: 0, playtime: 0, ...(blob.stats || {}) };
  generateWorld(G.seed);
  for (const id of G.depletedNodes) { const n = nodes[id]; if (n) { n.depleted = true; n.mesh.visible = false; } }
  if (blob.player) {
    playerBody.position.set(blob.player.x, blob.player.y, blob.player.z);
    look.yaw = blob.player.yaw || 0; look.pitch = blob.player.pitch || 0;
  }
  playerBody.velocity.setZero();
  applyLamp();
  $('basedir').style.display = G.modules.beacon ? 'block' : 'none';
  updateResMini(); updateToolbox(); updateBars();
}
async function loadSlot(slot) {
  try {
    const rec = await empire.loadState(slot);
    if (!rec || !rec.blob || rec.blob.hardcoreDead) { toast('Slot empty or run ended'); return false; }
    applyBlob(rec.blob);
    startPlaying();
    toast(`Loaded — seed "${G.seed}"`);
    return true;
  } catch (e) {
    toast(String(e.message).includes('version') ? 'Old 2D-era save — incompatible with the 3D rebuild' : 'Load failed');
    return false;
  }
}

// ============================== Game flow ==============================
function newGame(opts) {
  const seed = opts.seed || Math.random().toString(36).slice(2, 9);
  G.seed = seed; G.mode = opts.mode || 'normal'; G.difficulty = opts.difficulty || 'standard'; G.hardcore = !!opts.hardcore;
  G.gear = { tank: 0, suit: 0, lamp: 0, fins: 0, harpoon: 1 };
  for (const k of RES_KEYS) G.res[k] = 0;
  G.modules = {}; G.flags = { podcore: false, podInstalled: false, won: false };
  G.depletedNodes = [];
  G.o2Max = TANKS[0]; G.o2 = G.o2Max; G.hp = G.hpMax = 100; G.flares = 5;
  G.timeAlive = 0; G.freeplay = false;
  G.stats = { maxDepth: 0, kills: 0, gathered: 0, crafts: 0, deaths: 0, playtime: 0 };
  creatureRnd = mulberry32(hashStr(seed + ':c'));
  generateWorld(seed);
  const hy = terrainH(HAB_XZ[0], HAB_XZ[1]);
  playerBody.position.set(HAB_XZ[0] + 4, hy + 5, HAB_XZ[1] + 4);
  playerBody.velocity.setZero();
  look.yaw = Math.PI * 0.9; look.pitch = 0;
  applyLamp();
  $('basedir').style.display = 'none';
  updateResMini(); updateToolbox(); updateBars();
  startPlaying();
  toast(G.mode === 'daily' ? `Daily Challenge — seed "${seed}"` : `Expedition started — seed "${seed}"`);
  toast('Harvest deposits (hold E) and dive deeper for rarer materials');
}
function startPlaying() {
  G.state = 'play';
  showPanel(null);
  $('hud').classList.remove('hidden');
  AU.init(); AU.resume();
  lockPtr();
}
function openPause() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  G.pauseAt = performance.now();
  $('pauseStats').innerHTML = statRows();
  showPanel('menuPause');
}
function resumeGame() {
  if (G.state !== 'pause') return;
  G.state = 'play';
  showPanel(null);
  $('hud').classList.remove('hidden');
  lockPtr();
}
async function quitToMenu() {
  if (!G.hardcore || G.hp > 0) await saveGame('auto');
  G.state = 'menu';
  $('hud').classList.add('hidden');
  showPanel('menuMain');
  refreshContinue();
}
async function refreshContinue() {
  try {
    const saves = await empire.listSaves();
    const auto = saves.find(s => s.slot === 'auto');
    $('btnContinue').classList.toggle('hidden', !auto);
    $('menuFoot').textContent = `3D rebuild · Three.js + cannon-es · ${ACH.length} achievements`;
  } catch { $('menuFoot').textContent = 'Three.js + cannon-es'; }
}

// ============================== Menu wiring ==============================
let newDiff = 'standard';
$('btnNew').onclick = () => { AU.init(); showPanel('menuNew'); };
$('btnDaily').onclick = () => {
  AU.init();
  const d = new Date();
  const seed = `daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  newGame({ seed, mode: 'daily', difficulty: 'standard', hardcore: false });
};
$('btnContinue').onclick = () => { AU.init(); loadSlot('auto'); };
$('btnLoad').onclick = async () => {
  showPanel('menuLoad');
  $('loadList').innerHTML = '<div class="sub">Loading…</div>';
  try {
    const saves = await empire.listSaves();
    $('loadList').innerHTML = saves.length ? saves.map(s => `
      <div class="recipe"><div><div class="nm">${s.slot}</div><div class="ds">${(s.meta && s.meta.label) || ''} · ${new Date(s.savedAt).toLocaleString()}</div></div>
      <button class="small" data-slot="${s.slot}">Load</button></div>`).join('') : '<div class="sub">No saves yet.</div>';
    $('loadList').querySelectorAll('[data-slot]').forEach(b => b.onclick = () => loadSlot(b.dataset.slot));
  } catch { $('loadList').innerHTML = '<div class="sub">Could not list saves.</div>'; }
};
$('btnHelp').onclick = () => { G.helpReturn = 'menuMain'; showPanel('menuHelp'); };
$('btnHelpBack').onclick = () => showPanel(G.helpReturn);
$('btnNewBack').onclick = () => showPanel('menuMain');
$('btnLoadBack').onclick = () => showPanel('menuMain');
document.querySelectorAll('#menuNew [data-diff]').forEach(b => b.onclick = () => {
  newDiff = b.dataset.diff;
  document.querySelectorAll('#menuNew [data-diff]').forEach(x => x.classList.toggle('sel', x === b));
  $('diffDesc').textContent = DIFFS[newDiff].desc;
});
$('btnStart').onclick = () => newGame({ seed: $('seedInput').value.trim(), difficulty: newDiff, hardcore: $('chkHardcore').checked });
$('btnResume').onclick = resumeGame;
$('btnSave1').onclick = () => { saveGame('slot1'); };
$('btnSave2').onclick = () => { saveGame('slot2'); };
$('btnPauseHelp').onclick = () => { G.helpReturn = 'menuPause'; showPanel('menuHelp'); };
$('btnQuit').onclick = quitToMenu;
$('btnBaseClose').onclick = closeOverlay;
$('btnInvClose').onclick = closeOverlay;
$('btnMapClose').onclick = closeOverlay;
$('tabGear').onclick = () => { G.baseTab = 'gear'; renderBaseList(); };
$('tabModules').onclick = () => { G.baseTab = 'module'; renderBaseList(); };
$('tabSpecial').onclick = () => { G.baseTab = 'special'; renderBaseList(); };
$('btnRespawn').onclick = respawn;
$('btnDeathMenu').onclick = quitToMenu;
$('btnFreeplay').onclick = () => { G.freeplay = true; startPlaying(); toast('Freeplay — the ocean is yours'); };
$('btnWinMenu').onclick = quitToMenu;

// ============================== Environment per-frame ==============================
const fogColor = new THREE.Color();
function environmentTick(dt, t) {
  const m = depthOf(camera.getWorldPosition(new THREE.Vector3()).y);
  const z = zoneAt(m);
  const zi = ZONES.indexOf(z);
  const prev = ZONES[Math.max(0, zi - 1)];
  const span = z.to - (zi > 0 ? prev.to : 0);
  const f = zi > 0 ? clamp((m - prev.to) / span, 0, 1) : clamp(m / z.to, 0, 1);
  fogColor.set(prev.fog).lerp(new THREE.Color(z.fog), f);
  if (m < 2) fogColor.set(0x7ec8ea);
  scene.background = fogColor;
  if (!scene.fog) scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.014);
  scene.fog.color.copy(fogColor);
  scene.fog.density = lerp(0.013, 0.03, clamp(m / 1300, 0, 1)) - (m < 2 ? 0.006 : 0);
  const sun = lerp(prev.sun, z.sun, f);
  hemi.intensity = 0.15 + sun * 1.1;
  amb.intensity = 0.12 + sun * 0.3;
  causticTex.offset.set(t * 0.021, t * 0.013);
  // marine snow follows camera
  snow.position.copy(yawObj.position);
  const sp = snowGeo.attributes.position;
  for (let i = 0; i < SNOW_N; i++) {
    let y = sp.getY(i) - dt * 0.55;
    if (y < -SNOW_R) y += SNOW_R * 2;
    sp.setY(i, y);
  }
  sp.needsUpdate = true;
  water.position.x = yawObj.position.x; water.position.z = yawObj.position.z;
  water.visible = yawObj.position.y > -120;
  AU.setDepth(m);
  // damage vignette decay
  G.dmgFlash = Math.max(0, G.dmgFlash - dt * 2.2);
  $('vig').style.opacity = G.dmgFlash;
}

// ============================== Camera ==============================
const camTarget = new THREE.Vector3();
function cameraTick(dt) {
  if (G.state !== 'menu') yawObj.position.set(playerBody.position.x, playerBody.position.y + 0.4, playerBody.position.z);
  const goal = G.cam3rd ? camTarget.set(0.85, 0.9, 4.2) : camTarget.set(0, 0, 0);
  camera.position.lerp(goal, 1 - Math.exp(-10 * dt));
  // keep 3rd-person camera above terrain
  if (G.cam3rd) {
    const wp = camera.getWorldPosition(new THREE.Vector3());
    const h = terrainH(wp.x, wp.z) + 0.5;
    if (wp.y < h) camera.position.y += (h - wp.y);
  }
  // shake
  G.shake = Math.max(0, G.shake - dt * 1.6);
  if (G.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.35;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.35;
  }
  // diver visuals
  diver.visible = G.cam3rd || G.state === 'launch';
  if (diver.visible) {
    diver.position.copy(playerBody.position);
    diver.rotation.set(0, look.yaw + Math.PI, 0);
    diver.rotateX(-look.pitch * 0.55);
  }
  lamp.visible = true;
  $('xh').style.display = G.cam3rd ? 'none' : (G.state === 'play' ? 'block' : 'none');
}

// ============================== Physics buoyancy hook ==============================
world.addEventListener('postStep', () => {
  for (const b of world.bodies) {
    if (b === playerBody) continue;
    if (b.__underwater && b.position.y < 0) {
      b.applyForce(new CANNON.Vec3(0, 9.8 * b.mass * (b.__buoy ?? 1), 0));
    }
    // terrain clamp for dynamic bodies
    if (b.mass > 0) {
      const h = terrainH(b.position.x, b.position.z);
      const r = (b.shapes[0] && b.shapes[0].radius) || 0.4;
      if (b.position.y - r < h) {
        b.position.y = h + r;
        if (b.velocity.y < 0) b.velocity.y *= -0.25;
        b.velocity.x *= 0.94; b.velocity.z *= 0.94;
      }
    }
  }
});

// ============================== Main loop ==============================
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, playT = 0, saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;
  pollGamepad(dt);

  if ((G.state === 'play' && !G.panel) || G.state === 'launch') {
    world.step(1 / 60, dt, 3);
    if (G.state === 'play') {
      playerTick(dt);
      creatureManager(dt);
      spearTick(dt);
      pickupTick(dt);
      flareTick(dt);
      updateBaseDir();
      // autosave + playtime
      G.stats.playtime += dt; playT += dt; saveT += dt;
      if (playT >= 30) { empire.reportPlaytime(Math.round(playT)).catch(() => {}); playT = 0; }
      if (saveT >= 45) { saveT = 0; saveGame('auto'); }
    } else {
      launchTick(dt);
    }
    ragdollTick(dt);
  } else if (G.state === 'pause' || G.state === 'dead' || G.state === 'win') {
    ragdollTick(dt * 0.2);
  } else if (G.state === 'menu') {
    // idle menu camera drift over the reef
    look.yaw = t * 0.05;
    yawObj.position.set(Math.cos(t * 0.05) * 30 + HAB_XZ[0], -8, Math.sin(t * 0.05) * 30 + HAB_XZ[1]);
    yawObj.rotation.y = look.yaw;
    pitchObj.rotation.x = -0.25;
  }
  cameraTick(dt);
  environmentTick(dt, t);
  renderer.render(scene, camera);
  // fps
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; fpsT = 0; }
}

// ============================== Boot ==============================
(async function boot() {
  try {
    await empire.connect();
  } catch { /* standalone */ }
  // menu backdrop world
  G.seed = 'menu';
  generateWorld('menu');
  updateResMini(); updateToolbox();
  refreshContinue();
  showPanel('menuMain');
  requestAnimationFrame(frame);
  window.__dos = { G, frame, newGame, renderer, scene, world, creatures, ragdolls, spawnCreature, hurtCreature, playerBody, terrainH, saveGame, loadSlot, startLaunch, craft, RECIPES, pickups, THREE };
})();
