/* ASTEROID DRIFT — true 3D twin-stick drift-shooter.
   three.js WebGL rendering + cannon-es 3D rigid-body physics (ships, asteroids,
   debris "ragdoll" on death all real bodies colliding in 3D). Tilted top-down
   perspective camera follows the ship. Empire SDK wired for save/achievements/
   settings/playtime with a standalone-localStorage fallback. */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

// ============================== utils ==============================
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
const $ = (id) => document.getElementById(id);

// ============================== audio ==============================
const AUDIO = {
  ctx: null, master: null, sfxGain: null, musGain: null,
  sfxOn: true, musicOn: true, musicTimer: null, step: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
      this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.18; this.musGain.connect(this.master);
    } catch { /* no audio */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, lp = 2200) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
  },
  laser() { this.tone(880, 0.09, 'sawtooth', 0.16, -400); },
  missile() { this.tone(220, 0.22, 'square', 0.22, -80); this.noise(0.15, 0.1, 1400); },
  hit() { this.tone(140, 0.08, 'square', 0.2, -60); },
  explode(big = false) { this.noise(big ? 0.6 : 0.32, big ? 0.5 : 0.32, big ? 900 : 1600); this.tone(big ? 70 : 110, big ? 0.5 : 0.25, 'sawtooth', 0.2, -40); },
  pickup() { this.tone(660, 0.08, 'sine', 0.22); this.tone(990, 0.12, 'sine', 0.16, 200); },
  hurt() { this.tone(90, 0.2, 'sawtooth', 0.3, -30); },
  boostSfx() { this.tone(300, 0.2, 'sine', 0.15, 300); },
  boss() { this.tone(60, 0.8, 'sawtooth', 0.3, 30); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.2), i * 110)); },
  lose() { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.22), i * 130)); },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const seq = [110, 130.8, 98, 146.8];
    this.musicTimer = setInterval(() => {
      if (!this.musicOn) return;
      const f = seq[this.step % seq.length]; this.step++;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 1.7);
      o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + 1.8);
    }, 1800);
  },
};

// ============================== data tables ==============================
const DIFFS = {
  easy: { label: 'EASY', enemyHp: 0.7, enemySpd: 0.85, enemyDmg: 0.7, spawnMul: 0.8, scoreMul: 0.8 },
  normal: { label: 'NORMAL', enemyHp: 1, enemySpd: 1, enemyDmg: 1, spawnMul: 1, scoreMul: 1 },
  hard: { label: 'HARD', enemyHp: 1.5, enemySpd: 1.2, enemyDmg: 1.4, spawnMul: 1.3, scoreMul: 1.4 },
};

const META_DEFS = [
  { id: 'hull', name: 'Hull Plating', desc: '+20 max hull per level', max: 5, base: 4 },
  { id: 'shield', name: 'Shield Capacitor', desc: '+20 max shield per level', max: 5, base: 4 },
  { id: 'thrust', name: 'Engine Core', desc: '+12% thrust & top speed per level', max: 5, base: 4 },
  { id: 'dmg', name: 'Weapon Coils', desc: '+12% weapon damage per level', max: 5, base: 5 },
  { id: 'missiles', name: 'Missile Racks', desc: '+2 missile capacity per level', max: 5, base: 4 },
  { id: 'scrap', name: 'Salvage Drones', desc: '+15% scrap earned per level', max: 5, base: 3 },
];
function metaCost(def, level) { return Math.round(def.base * Math.pow(level + 1, 1.7)); }

const SHOP_DEFS = [
  { id: 'dmg', name: 'Weapon Damage', desc: '+15% laser damage', cost: (lv) => 30 + lv * 26 },
  { id: 'firerate', name: 'Fire Rate', desc: '+15% fire rate', cost: (lv) => 30 + lv * 26 },
  { id: 'hull', name: 'Hull Plating', desc: '+20 max hull, full repair', cost: (lv) => 26 + lv * 22 },
  { id: 'shieldregen', name: 'Shield Regen', desc: '+25% shield regen rate', cost: (lv) => 24 + lv * 20 },
  { id: 'missiles', name: 'Missile Rack', desc: '+3 missile capacity, refill', cost: (lv) => 22 + lv * 20 },
  { id: 'thrust', name: 'Thrusters', desc: '+12% thrust & top speed', cost: (lv) => 28 + lv * 24 },
  { id: 'tractor', name: 'Tractor Beam', desc: '+40% tractor range & pull', cost: (lv) => 18 + lv * 16 },
];

const ACH_DEFS = [
  { id: 'first-blood', title: 'First Blood', desc: 'Destroy your first hostile', rarity: 'common' },
  { id: 'rock-buster', title: 'Rock Buster', desc: 'Destroy 100 asteroids (lifetime)', rarity: 'uncommon', progressive: true, target: 100 },
  { id: 'wave-5', title: 'Deep Field', desc: 'Reach wave 5', rarity: 'common' },
  { id: 'wave-10', title: 'Void Runner', desc: 'Reach wave 10', rarity: 'uncommon' },
  { id: 'final-boss', title: 'Voidmaw Slain', desc: 'Defeat the wave 15 boss', rarity: 'epic' },
  { id: 'hard-victory', title: 'No Mercy', desc: 'Win a run on Hard difficulty', rarity: 'legendary' },
  { id: 'pickup-collector', title: 'Magpie', desc: 'Collect 30 power-ups (lifetime)', rarity: 'uncommon', progressive: true, target: 30 },
  { id: 'flawless-wave', title: 'Untouched', desc: 'Clear a wave without hull damage', rarity: 'rare' },
  { id: 'daily-challenger', title: 'Daily Grind', desc: 'Complete a Daily Challenge run', rarity: 'rare' },
  { id: 'scrap-baron', title: 'Scrap Baron', desc: 'Hold 750 scrap in a single run', rarity: 'uncommon', progressive: true, target: 750 },
  { id: 'combo-10', title: 'Chain Reaction', desc: 'Reach a 10x kill combo', rarity: 'rare' },
  { id: 'shipwright', title: 'Master Shipwright', desc: 'Max every Shipyard upgrade', rarity: 'legendary', hidden: true },
];

// ============================== persistent state ==============================
const SAVE_VERSION = 1;
let SAVE = {
  meta: { cores: 0, upgrades: {} },
  lifetime: { asteroidsDestroyed: 0, powerupsCollected: 0 },
  achievements: {}, // id -> {progress, unlocked}
  highScores: { easy: 0, normal: 0, hard: 0 },
  daily: { date: null, score: 0, done: false },
};
for (const d of META_DEFS) SAVE.meta.upgrades[d.id] = 0;

const empire = new EmpireClient({ gameId: 'asteroid-drift', saveVersion: SAVE_VERSION });
let empireSettings = null;

function mergeSave(blob) {
  if (!blob) return;
  SAVE = {
    meta: { cores: blob.meta?.cores || 0, upgrades: { ...SAVE.meta.upgrades, ...(blob.meta?.upgrades || {}) } },
    lifetime: { asteroidsDestroyed: blob.lifetime?.asteroidsDestroyed || 0, powerupsCollected: blob.lifetime?.powerupsCollected || 0 },
    achievements: blob.achievements || {},
    highScores: { easy: 0, normal: 0, hard: 0, ...(blob.highScores || {}) },
    daily: blob.daily || { date: null, score: 0, done: false },
  };
}
function saveBlob() {
  return { meta: SAVE.meta, lifetime: SAVE.lifetime, achievements: SAVE.achievements, highScores: SAVE.highScores, daily: SAVE.daily };
}
async function persist() {
  try { await empire.saveState('auto', saveBlob(), { label: 'Asteroid Drift', progress: `wave ${G.wave}` }); } catch { /* ignore */ }
}
async function unlock(id, progress) {
  const cur = SAVE.achievements[id] || { progress: 0, unlocked: false };
  if (cur.unlocked) return;
  const def = ACH_DEFS.find((a) => a.id === id);
  const target = def?.target || 1;
  const p = def?.progressive ? clamp(progress / target, 0, 1) : 1;
  if (p > cur.progress) cur.progress = p;
  if (cur.progress >= 1 && !cur.unlocked) {
    cur.unlocked = true; cur.unlockedAt = Date.now();
    toast(`🏆 ${def ? def.title : id}`);
  }
  SAVE.achievements[id] = cur;
  try { await empire.unlockAchievement(id, cur.progress); } catch { /* ignore */ }
}

// ============================== three.js scene ==============================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060c, 0.010);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);
const camOffset = new THREE.Vector3(0, 26, 15);
const camLook = new THREE.Vector3();

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

scene.add(new THREE.AmbientLight(0x506080, 0.55));
const sun = new THREE.DirectionalLight(0xbfe3ff, 1.1);
sun.position.set(30, 60, 10); scene.add(sun);
const rim = new THREE.PointLight(0xff5ad0, 0.7, 200); rim.position.set(-30, 20, -30); scene.add(rim);

// starfield
{
  const N = 2200, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = rand(80, 400), th = rand(0, Math.PI * 2), ph = rand(-0.5, 0.5);
    pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = rand(-40, 120); pos[i * 3 + 2] = Math.sin(th) * r * (1 + ph * 0.3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xaad4ff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(g, m));
}
// grid floor for depth cue
{
  const grid = new THREE.GridHelper(240, 48, 0x2a3a5c, 0x151d33);
  grid.position.y = -6; grid.material.transparent = true; grid.material.opacity = 0.35;
  scene.add(grid);
  const floorGeo = new THREE.CircleGeometry(120, 48);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x030509, transparent: true, opacity: 0.55 });
  const floor = new THREE.Mesh(floorGeo, floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -6.1;
  scene.add(floor);
}

const ARENA_R = 70;
{
  const ringGeo = new THREE.TorusGeometry(ARENA_R, 0.25, 8, 96);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fe0ff, transparent: true, opacity: 0.35 });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = -3;
  scene.add(ring);
}

// ============================== cannon-es world ==============================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
const matShip = new CANNON.Material('ship');
const matRock = new CANNON.Material('rock');
const matDebris = new CANNON.Material('debris');
world.addContactMaterial(new CANNON.ContactMaterial(matShip, matRock, { friction: 0.05, restitution: 0.35 }));
world.addContactMaterial(new CANNON.ContactMaterial(matRock, matRock, { friction: 0.1, restitution: 0.4 }));
world.addContactMaterial(new CANNON.ContactMaterial(matShip, matShip, { friction: 0.1, restitution: 0.3 }));
world.addContactMaterial(new CANNON.ContactMaterial(matDebris, matDebris, { friction: 0.3, restitution: 0.2 }));

// ============================== procedural meshes ==============================
function makeShipMesh(color = 0x4fe0ff, scale = 1) {
  const g = new THREE.Group();
  const bodyGeo = new THREE.ConeGeometry(0.9 * scale, 2.6 * scale, 8);
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(bodyGeo, bodyMat); g.add(body);
  const wingGeo = new THREE.BoxGeometry(2.4 * scale, 0.12 * scale, 1 * scale);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x1b2540, metalness: 0.6, roughness: 0.4 });
  const wing = new THREE.Mesh(wingGeo, wingMat); wing.position.set(0, 0, 0.2 * scale); g.add(wing);
  const glowGeo = new THREE.ConeGeometry(0.3 * scale, 0.9 * scale, 6);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9d3e, transparent: true, opacity: 0.8 });
  const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(0, 0, 1.6 * scale); glow.name = 'engineGlow'; g.add(glow);
  return g;
}
function makeAsteroidMesh(size) {
  const geo = new THREE.IcosahedronGeometry(size, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + rand(-0.22, 0.22));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6f7a, roughness: 0.95, metalness: 0.05, flatShading: true });
  return new THREE.Mesh(geo, mat);
}
function makeEnemyMesh(type) {
  const colors = { drone: 0xff5a6e, turret: 0xffd24a, kamikaze: 0xff7de0, boss: 0xd42f8f };
  const g = makeShipMesh(colors[type] || 0xff5a6e, type === 'boss' ? 3.2 : 0.9);
  return g;
}
function makePickupMesh(kind) {
  const colors = { rapid: 0xffd24a, spread: 0xff7de0, shield: 0x4fe0ff, repair: 0x5aff8f, scrap: 0xffbd4a, multiplier: 0xb98cff, speed: 0x5ad4ff };
  const geo = new THREE.OctahedronGeometry(0.65, 0);
  const mat = new THREE.MeshStandardMaterial({ color: colors[kind] || 0xffffff, emissive: colors[kind] || 0xffffff, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 });
  return new THREE.Mesh(geo, mat);
}

// ============================== particles / fx ==============================
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const bursts = [];
function burst(pos, color = 0xffaa55, count = 18, spd = 8) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3), v = [];
  for (let i = 0; i < count; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(spd * 0.4, spd));
    v.push(dir);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.5, transparent: true, opacity: 1 });
  const pts = new THREE.Points(g, mat); fxGroup.add(pts);
  bursts.push({ pts, v, life: 0, max: 0.7 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.life += dt;
    const pos = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.v.length; j++) {
      pos.array[j * 3] += b.v[j].x * dt; pos.array[j * 3 + 1] += b.v[j].y * dt; pos.array[j * 3 + 2] += b.v[j].z * dt;
    }
    pos.needsUpdate = true;
    b.pts.material.opacity = 1 - b.life / b.max;
    if (b.life >= b.max) { fxGroup.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
}

let shakeT = 0, shakeMag = 0;
function screenShake(mag, dur) {
  if (empireSettings?.accessibility?.reducedMotion) return;
  if (empireSettings?.accessibility?.screenShake === false) return;
  shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, dur);
}
function flashVignette() {
  const v = $('dmgVignette'); v.style.opacity = 1;
  setTimeout(() => { v.style.opacity = 0; }, 220);
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toast._h); toast._h = setTimeout(() => { t.style.opacity = 0; }, 2200);
}
function announce(msg) {
  const a = $('announcer'); a.textContent = msg; a.style.opacity = 1;
  clearTimeout(announce._h); announce._h = setTimeout(() => { a.style.opacity = 0; }, 1600);
}

// ============================== game state ==============================
const G = {
  state: 'menu', // menu | playing | paused | shop | over
  diff: 'easy', daily: false, dailySeed: 0, rng: Math.random,
  wave: 1, waveTimer: 0, waveHostilesLeft: 0,
  scrap: 0, score: 0, combo: 0, comboT: 0, maxCombo: 0,
  waveDamageTaken: 0,
  runUpg: {}, // shop levels this run
  timeSinceReport: 0, elapsed: 0,
  bossActive: false,
};
for (const s of SHOP_DEFS) G.runUpg[s.id] = 0;

function metaVal(id) { return SAVE.meta.upgrades[id] || 0; }

// ============================== player ship ==============================
const player = {
  mesh: null, body: null,
  hull: 100, hullMax: 100, shield: 0, shieldMax: 100, shieldRegen: 6,
  thrust: 46, maxSpeed: 26, dmg: 10, fireRate: 6.5, tractorRange: 14, tractorForce: 30,
  missileAmmo: 5, missileMax: 5,
  fireCd: 0, missileCd: 0, boostCd: 0, boosting: 0, aimAngle: 0,
  buffs: {}, // key -> secondsLeft
  alive: true,
};
function computeBaseStats() {
  player.hullMax = 100 + metaVal('hull') * 20 + G.runUpg.hull * 20;
  player.shieldMax = 60 + metaVal('shield') * 20;
  player.shieldRegen = 6 * (1 + G.runUpg.shieldregen * 0.25);
  player.thrust = 46 * (1 + metaVal('thrust') * 0.12) * (1 + G.runUpg.thrust * 0.12);
  player.maxSpeed = 26 * (1 + metaVal('thrust') * 0.12) * (1 + G.runUpg.thrust * 0.12);
  player.dmg = 10 * (1 + metaVal('dmg') * 0.12) * (1 + G.runUpg.dmg * 0.15);
  player.fireRate = 6.5 * (1 + G.runUpg.firerate * 0.15);
  player.missileMax = 5 + metaVal('missiles') * 2 + G.runUpg.missiles * 3;
  player.tractorRange = 14 * (1 + G.runUpg.tractor * 0.4);
  player.tractorForce = 30 * (1 + G.runUpg.tractor * 0.4);
}
function spawnPlayer() {
  if (player.mesh) { scene.remove(player.mesh); disposeObject(player.mesh); }
  if (player.body) world.removeBody(player.body);
  player.mesh = makeShipMesh(0x4fe0ff, 1); scene.add(player.mesh);
  player.body = new CANNON.Body({ mass: 6, shape: new CANNON.Sphere(1.0), position: new CANNON.Vec3(0, 0, 0), material: matShip, linearDamping: 0.45, angularDamping: 0.9 });
  player.body.fixedRotation = true; player.body.updateMassProperties();
  world.addBody(player.body);
  computeBaseStats();
  player.hull = player.hullMax; player.shield = player.shieldMax * 0.4;
  player.missileAmmo = player.missileMax;
  player.fireCd = 0; player.missileCd = 0; player.boostCd = 0; player.aimAngle = 0;
  player.buffs = {}; player.alive = true;
  attachAsteroidKit(player.mesh);
}

const asteroidAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
window.__asteroidAssetStatus = asteroidAssetStatus;
let asteroidKit = null;
function attachAsteroidKit(target) {
  if (!asteroidKit || !target || target.userData.blenderAsset) return;
  const source = asteroidKit.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || asteroidKit.scene.getObjectByName('PLAYER_BODY');
  if (!source) { asteroidAssetStatus.error = 'Asteroid player asset missing'; return; }
  const asset = source.clone(true);
  asset.name = 'BLENDER_SPACECRAFT_ASSET';
  asset.scale.setScalar(2.6);
  asset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
  target.children.forEach((child) => { child.visible = false; });
  target.add(asset);
  target.userData.blenderAsset = asset;
  asteroidAssetStatus.attached = true;
}
function loadAsteroidKit() {
  const GLTFLoader = window.THREE?.GLTFLoader;
  if (!GLTFLoader) { asteroidAssetStatus.error = 'GLTFLoader unavailable'; return; }
  const loader = new GLTFLoader();
  Promise.all([
    fetch('../../assets/blender-kits/asteroid-drift/physics.json').then((r) => r.ok ? r.json() : null).catch(() => null),
    new Promise((resolve, reject) => loader.load('../../assets/blender-kits/asteroid-drift/asteroid-drift-kit.glb', resolve, undefined, reject)),
  ]).then(([physics, gltf]) => {
    asteroidKit = gltf;
    asteroidAssetStatus.loaded = true;
    asteroidAssetStatus.physics = !!physics?.playerCollider;
    attachAsteroidKit(player.mesh);
  }).catch((error) => { asteroidAssetStatus.error = String(error?.message || error); });
}
loadAsteroidKit();

// ============================== entity registries ==============================
const asteroids = []; // {mesh, body, size, level}
const enemies = []; // {mesh, body, type, hp, hpMax, fireCd, ai...}
const pickups = []; // {mesh, body, kind, life}
const bullets = []; // {mesh, vel, life, dmg, owner, homing?}
const debris = []; // {mesh, body, life}

function toVec3(v) { return new THREE.Vector3(v.x, v.y, v.z); }
function disposeObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}

function removeAsteroid(a) {
  scene.remove(a.mesh); disposeObject(a.mesh); world.removeBody(a.body);
  const i = asteroids.indexOf(a); if (i >= 0) asteroids.splice(i, 1);
}
function removeEnemy(e) {
  scene.remove(e.mesh); disposeObject(e.mesh); world.removeBody(e.body);
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
}
function removePickup(p) {
  scene.remove(p.mesh); disposeObject(p.mesh); if (p.body) world.removeBody(p.body);
  const i = pickups.indexOf(p); if (i >= 0) pickups.splice(i, 1);
}

function spawnAsteroid(pos, level = 3) {
  const size = level * 1.1 + 0.8;
  const mesh = makeAsteroidMesh(size); mesh.position.copy(pos); scene.add(mesh);
  const body = new CANNON.Body({ mass: size * 1.4, shape: new CANNON.Sphere(size * 0.85), position: new CANNON.Vec3(pos.x, pos.y, pos.z), material: matRock, linearDamping: 0.15, angularDamping: 0.2 });
  body.velocity.set(rand(-4, 4), rand(-0.4, 0.4), rand(-4, 4));
  body.angularVelocity.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  world.addBody(body);
  asteroids.push({ mesh, body, size, level, hp: level * 14 });
}
function edgeSpawnPos() {
  const a = G.rng() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a) * (ARENA_R - 4), rand(-2, 2), Math.sin(a) * (ARENA_R - 4));
}
function nearPlayerButFar(minD = 30) {
  let p;
  do { p = edgeSpawnPos(); } while (p.distanceTo(toVec3(player.body.position)) < minD);
  return p;
}

function spawnEnemy(type, pos) {
  const d = DIFFS[G.diff];
  const mesh = makeEnemyMesh(type); mesh.position.copy(pos); scene.add(mesh);
  const radius = type === 'boss' ? 3.4 : 1.0;
  const body = new CANNON.Body({ mass: type === 'boss' ? 40 : 5, shape: new CANNON.Sphere(radius), position: new CANNON.Vec3(pos.x, pos.y, pos.z), material: matShip, linearDamping: 0.5, angularDamping: 0.9 });
  body.fixedRotation = true; body.updateMassProperties();
  world.addBody(body);
  const baseHp = { drone: 22, turret: 30, kamikaze: 16, boss: 900 }[type];
  const hp = baseHp * d.enemyHp * (1 + (G.wave - 1) * 0.06);
  enemies.push({ mesh, body, type, hp, hpMax: hp, fireCd: rand(0.5, 1.5), phase: 0, phaseT: 0, bob: rand(0, 10) });
  return enemies[enemies.length - 1];
}

function spawnPickup(pos, kind) {
  const mesh = makePickupMesh(kind); mesh.position.copy(pos); scene.add(mesh);
  pickups.push({ mesh, kind, life: 0, spin: rand(1, 2) });
}
const PICKUP_KINDS = ['rapid', 'spread', 'shield', 'repair', 'scrap', 'multiplier', 'speed'];

function breakApart(pos, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const size = rand(0.18, 0.45);
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); scene.add(mesh);
    const body = new CANNON.Body({ mass: 0.4, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), position: new CANNON.Vec3(pos.x, pos.y, pos.z), material: matDebris, linearDamping: 0.3, angularDamping: 0.3 });
    const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.5, speed));
    body.velocity.set(dir.x, dir.y, dir.z);
    body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    world.addBody(body);
    debris.push({ mesh, body, life: 0, max: rand(2.2, 3.4) });
  }
  while (debris.length > 120) {
    const d = debris.shift(); scene.remove(d.mesh); disposeObject(d.mesh); world.removeBody(d.body);
  }
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life += dt;
    d.mesh.position.copy(toVec3(d.body.position));
    d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    if (d.life > d.max - 0.6) d.mesh.material.opacity = clamp((d.max - d.life) / 0.6, 0, 1), d.mesh.material.transparent = true;
    if (d.life >= d.max) { scene.remove(d.mesh); disposeObject(d.mesh); world.removeBody(d.body); debris.splice(i, 1); }
  }
}

// ============================== bullets ==============================
function fireLaser(pos, dir, dmg, spreadRad = 0) {
  const a = Math.atan2(dir.x, dir.z) + spreadRad;
  const d3 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const geo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4fe0ff });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d3);
  scene.add(mesh);
  bullets.push({ mesh, vel: d3.multiplyScalar(70), life: 0, max: 1.6, dmg, owner: 'player', radius: 0.6 });
  AUDIO.laser();
}
function fireEnemyShot(pos, dir, dmg, color = 0xff5a6e) {
  const geo = new THREE.SphereGeometry(0.22, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); scene.add(mesh);
  bullets.push({ mesh, vel: dir.clone().multiplyScalar(30), life: 0, max: 3, dmg, owner: 'enemy', radius: 0.7 });
}
function fireMissile(pos, dir) {
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6); geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  scene.add(mesh);
  let target = null, bd = 1e9;
  for (const e of enemies) { const dd = e.mesh.position.distanceTo(pos); if (dd < bd) { bd = dd; target = e; } }
  bullets.push({ mesh, vel: dir.clone().multiplyScalar(40), life: 0, max: 3.2, dmg: player.dmg * 3.2, owner: 'player', radius: 1.4, homing: target, aoe: 6 });
  AUDIO.missile();
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life += dt;
    if (b.homing && enemies.includes(b.homing)) {
      const toT = new THREE.Vector3().subVectors(b.homing.mesh.position, b.mesh.position).normalize();
      b.vel.lerp(toT.multiplyScalar(b.vel.length()), 0.08);
      b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.vel.clone().normalize());
    }
    b.mesh.position.addScaledVector(b.vel, dt);
    let hit = false;
    if (b.owner === 'player') {
      for (const e of enemies) {
        if (b.mesh.position.distanceTo(e.mesh.position) < b.radius + (e.type === 'boss' ? 3 : 1)) {
          damageEnemy(e, b.dmg);
          if (b.aoe) { burst(b.mesh.position, 0xffd24a, 24, 12); screenShake(0.3, 0.2); for (const e2 of [...enemies]) if (e2 !== e && e2.mesh.position.distanceTo(b.mesh.position) < b.aoe) damageEnemy(e2, b.dmg * 0.5); }
          hit = true; break;
        }
      }
      for (const a of asteroids) {
        if (!hit && b.mesh.position.distanceTo(a.mesh.position) < b.radius + a.size) { damageAsteroid(a, b.dmg); hit = true; break; }
      }
    } else if (b.owner === 'enemy') {
      if (player.alive && b.mesh.position.distanceTo(player.mesh.position) < b.radius + 1.1) { damagePlayer(b.dmg); hit = true; }
    }
    if (hit || b.life > b.max || b.mesh.position.length() > ARENA_R + 20) {
      scene.remove(b.mesh); disposeObject(b.mesh); bullets.splice(i, 1);
    }
  }
}

// ============================== damage & death ==============================
function damageAsteroid(a, dmg) {
  a.hp -= dmg; burst(a.mesh.position, 0xffaa55, 6, 5); AUDIO.hit();
  if (a.hp <= 0) {
    AUDIO.explode(false);
    burst(a.mesh.position, 0xffaa55, 20, 10);
    screenShake(0.15, 0.15);
    const scrapGain = Math.round((4 - a.level) * 3 * (1 + metaVal('scrap') * 0.15));
    addScrap(scrapGain);
    SAVE.lifetime.asteroidsDestroyed++;
    unlock('rock-buster', SAVE.lifetime.asteroidsDestroyed);
    registerKill();
    if (a.level > 1 && a.size > 1.4) {
      for (let i = 0; i < 2; i++) {
        const off = new THREE.Vector3(rand(-1.5, 1.5), rand(-0.5, 0.5), rand(-1.5, 1.5));
        spawnAsteroid(a.mesh.position.clone().add(off), a.level - 1);
      }
    } else if (Math.random() < 0.3) {
      spawnPickup(a.mesh.position, choice(PICKUP_KINDS));
    }
    removeAsteroid(a);
    G.waveHostilesLeft = countHostiles();
  }
}
function damageEnemy(e, dmg) {
  e.hp -= dmg; AUDIO.hit();
  if (e.hp <= 0) {
    const wasBoss = e.type === 'boss';
    AUDIO.explode(wasBoss);
    burst(e.mesh.position, wasBoss ? 0xff8ad9 : 0xff5a6e, wasBoss ? 60 : 22, wasBoss ? 20 : 11);
    screenShake(wasBoss ? 0.7 : 0.25, wasBoss ? 0.5 : 0.2);
    breakApart(e.mesh.position, wasBoss ? 0xd42f8f : 0xff5a6e, wasBoss ? 14 : 6, wasBoss ? 14 : 8);
    const scrapGain = Math.round({ drone: 8, turret: 12, kamikaze: 6, boss: 300 }[e.type] * (1 + metaVal('scrap') * 0.15));
    addScrap(scrapGain);
    G.score += { drone: 100, turret: 150, kamikaze: 80, boss: 5000 }[e.type] * DIFFS[G.diff].scoreMul * (comboMul());
    registerKill();
    if (!SAVE.achievements['first-blood']?.unlocked) unlock('first-blood', 1);
    if (wasBoss) { G.bossActive = false; $('bossBar').style.display = 'none'; onBossKilled(); }
    removeEnemy(e);
    G.waveHostilesLeft = countHostiles();
  }
}
function comboMul() { return 1 + Math.min(G.combo, 20) * 0.05; }
function registerKill() {
  G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.maxCombo >= 10) unlock('combo-10', 1);
}
function addScrap(n) {
  G.scrap += n;
  unlock('scrap-baron', G.scrap);
}
function countHostiles() { return asteroids.length + enemies.length; }

function damagePlayer(dmg) {
  if (!player.alive) return;
  let d = dmg;
  if (player.shield > 0) { const absorb = Math.min(player.shield, d); player.shield -= absorb; d -= absorb; }
  if (d > 0) { player.hull -= d; G.waveDamageTaken += d; flashVignette(); AUDIO.hurt(); screenShake(0.35, 0.25); }
  if (player.hull <= 0) killPlayer();
}
function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  AUDIO.explode(true); screenShake(0.8, 0.6);
  breakApart(player.mesh.position, 0x4fe0ff, 16, 16);
  scene.remove(player.mesh);
  const runId = G.runId;
  setTimeout(() => { if (G.runId === runId && G.state === 'playing' && !player.alive) endRun(false); }, 900);
}

// ============================== waves ==============================
function waveComposition(wave) {
  const isBoss = wave % 5 === 0;
  const d = DIFFS[G.diff];
  const rockCount = Math.round((5 + wave * 1.6) * d.spawnMul);
  const enemyCount = Math.round((1 + wave * 0.7) * d.spawnMul);
  return { isBoss, rockCount, enemyCount };
}
function startWave(n) {
  G.wave = n; G.waveDamageTaken = 0;
  const comp = waveComposition(n);
  for (let i = 0; i < comp.rockCount; i++) spawnAsteroid(nearPlayerButFar(24), (G.rng() * 3 | 0) + 1);
  if (comp.isBoss) {
    G.bossActive = true;
    const boss = spawnEnemy('boss', nearPlayerButFar(40));
    $('bossBar').style.display = 'block'; $('bossName').textContent = n >= 15 ? 'VOIDMAW PRIME' : 'VOIDMAW SPAWN';
    AUDIO.boss(); announce(`WAVE ${n} — BOSS`);
    for (let i = 0; i < Math.round(comp.enemyCount * 0.5); i++) spawnEnemy(choice(['drone', 'kamikaze']), nearPlayerButFar(30));
  } else {
    announce(`WAVE ${n}`);
    for (let i = 0; i < comp.enemyCount; i++) spawnEnemy(choice(['drone', 'turret', 'kamikaze']), nearPlayerButFar(28));
  }
  G.waveHostilesLeft = countHostiles();
  if (n >= 5) unlock('wave-5', 1);
  if (n >= 10) unlock('wave-10', 1);
}
function onBossKilled() {
  if (G.wave >= 15) { endRun(true); return; }
  toast('BOSS DOWN — bonus scrap!'); addScrap(150);
}
function waveClear() {
  if (G.waveDamageTaken === 0) unlock('flawless-wave', 1);
  openShop();
}

// ============================== shop / meta ==============================
function openShop() {
  G.state = 'shop';
  $('shopTitle').textContent = `WAVE ${G.wave} CLEARED`;
  $('shopScrap').textContent = G.scrap;
  $('nextWaveNum').textContent = G.wave + 1;
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const s of SHOP_DEFS) {
    const lv = G.runUpg[s.id]; const cost = s.cost(lv);
    const card = document.createElement('div'); card.className = 'shopCard';
    card.innerHTML = `<div class="t">${s.name} (Lv ${lv})</div><div class="d">${s.desc}</div><div class="price">⚙ ${cost}</div><button ${G.scrap < cost ? 'disabled' : ''}>BUY</button>`;
    card.querySelector('button').onclick = () => {
      if (G.scrap < cost) return;
      G.scrap -= cost; G.runUpg[s.id]++;
      computeBaseStats();
      if (s.id === 'hull') player.hull = player.hullMax;
      if (s.id === 'missiles') player.missileAmmo = player.missileMax;
      AUDIO.pickup(); openShop();
    };
    grid.appendChild(card);
  }
  player.hull = player.hullMax; player.shield = player.shieldMax;
  player.missileAmmo = player.missileMax;
  $('shop').classList.remove('hidden');
}
function closeShop() { $('shop').classList.add('hidden'); startWave(G.wave + 1); G.state = 'playing'; }

function renderMetaMenu() {
  $('metaCores').textContent = SAVE.meta.cores;
  const grid = $('metaGrid'); grid.innerHTML = '';
  for (const d of META_DEFS) {
    const lv = SAVE.meta.upgrades[d.id] || 0;
    const maxed = lv >= d.max;
    const cost = maxed ? 0 : metaCost(d, lv);
    const card = document.createElement('div'); card.className = 'shopCard' + (maxed ? ' owned' : '');
    card.innerHTML = `<div class="t">${d.name} (Lv ${lv}/${d.max})</div><div class="d">${d.desc}</div>` +
      (maxed ? `<div class="price" style="color:var(--good)">MAXED</div>` : `<div class="price">◆ ${cost}</div><button ${SAVE.meta.cores < cost ? 'disabled' : ''}>BUY</button>`);
    if (!maxed) card.querySelector('button').onclick = () => {
      if (SAVE.meta.cores < cost) return;
      SAVE.meta.cores -= cost; SAVE.meta.upgrades[d.id] = lv + 1;
      AUDIO.pickup(); persist(); renderMetaMenu();
      if (META_DEFS.every((m) => (SAVE.meta.upgrades[m.id] || 0) >= m.max)) unlock('shipwright', 1);
    };
    grid.appendChild(card);
  }
}
function renderAchMenu() {
  const grid = $('achGrid'); grid.innerHTML = '';
  for (const a of ACH_DEFS) {
    const st = SAVE.achievements[a.id] || { progress: 0, unlocked: false };
    const hidden = a.hidden && !st.unlocked;
    const card = document.createElement('div'); card.className = 'achCard' + (st.unlocked ? ' done' : '');
    const pct = a.progressive ? Math.round(st.progress * a.target) : (st.unlocked ? 1 : 0);
    card.innerHTML = hidden ? `<div class="t">??? <span class="sub">(${a.rarity})</span></div><div class="sub">Hidden achievement</div>`
      : `<div class="t">${st.unlocked ? '✅' : '▫'} ${a.title} <span class="sub">(${a.rarity})</span></div><div class="sub">${a.desc}${a.progressive ? ` — ${pct}/${a.target}` : ''}</div>`;
    grid.appendChild(card);
  }
}

// ============================== end / run flow ==============================
function endRun(victory) {
  G.state = 'over';
  document.exitPointerLock?.();
  const d = DIFFS[G.diff];
  const coresEarned = Math.round(G.score / 500 + G.wave * 2 + (victory ? 60 : 0)) * (G.diff === 'hard' ? 1.5 : 1) | 0;
  SAVE.meta.cores += coresEarned;
  if (!G.daily) {
    if (G.score > SAVE.highScores[G.diff]) SAVE.highScores[G.diff] = G.score;
    if (victory && G.diff === 'hard') unlock('hard-victory', 1);
    if (victory) unlock('final-boss', 1);
  } else {
    if (G.score > SAVE.daily.score) SAVE.daily.score = G.score;
    SAVE.daily.done = true;
    unlock('daily-challenger', 1);
  }
  persist();
  if (victory) AUDIO.win(); else AUDIO.lose();
  $('endTitle').textContent = victory ? 'VICTORY' : 'RUN OVER';
  $('endBody').innerHTML = `<div class="statLine"><span>Score</span><span>${Math.round(G.score)}</span></div>
    <div class="statLine"><span>Wave reached</span><span>${G.wave}</span></div>
    <div class="statLine"><span>Max combo</span><span>${G.maxCombo}x</span></div>
    <div class="statLine"><span>Cores earned</span><span>◆ ${coresEarned}</span></div>
    <div class="sub" style="margin-top:8px">${G.daily ? 'Daily Challenge run — no meta bonuses applied.' : ''}</div>`;
  $('endScreen').classList.remove('hidden');
  $('hud').classList.add('hidden');
}
function clearWorld() {
  for (const a of [...asteroids]) removeAsteroid(a);
  for (const e of [...enemies]) removeEnemy(e);
  for (const p of [...pickups]) removePickup(p);
  for (const b of [...bullets]) { scene.remove(b.mesh); disposeObject(b.mesh); }
  bullets.length = 0;
  for (const d of [...debris]) { scene.remove(d.mesh); disposeObject(d.mesh); world.removeBody(d.body); }
  debris.length = 0;
  $('bossBar').style.display = 'none'; G.bossActive = false;
}
function startRun(diff, daily) {
  clearWorld();
  G.runId = (G.runId || 0) + 1;
  G.diff = diff; G.daily = daily;
  G.rng = daily ? mulberry32(hashStr(todayKey())) : Math.random;
  G.wave = 0; G.scrap = 0; G.score = 0; G.combo = 0; G.comboT = 0; G.maxCombo = 0;
  if (daily) G.runUpg = Object.fromEntries(SHOP_DEFS.map((s) => [s.id, 0])); else for (const k in G.runUpg) G.runUpg[k] = 0;
  spawnPlayer();
  G.state = 'playing';
  $('menu').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('hud').classList.remove('hidden');
  startWave(1);
  AUDIO.init(); AUDIO.startMusic();
  canvas.requestPointerLock?.();
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// ============================== input ==============================
const keys = {};
const mouse = { x: 0, y: 0, down: false, rdown: false, ndcX: 0, ndcY: 0 };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyE') keys.tractor = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyE') keys.tractor = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    mouse.ndcX = clamp(mouse.ndcX + e.movementX / innerWidth * 2.2, -1, 1);
    mouse.ndcY = clamp(mouse.ndcY - e.movementY / innerHeight * 2.2, -1, 1); // up = up, non-inverted
  } else {
    mouse.ndcX = (e.clientX / innerWidth) * 2 - 1;
    mouse.ndcY = -(e.clientY / innerHeight) * 2 + 1;
  }
});
canvas.addEventListener('mousedown', (e) => {
  AUDIO.init(); AUDIO.resume();
  if (G.state === 'playing') canvas.requestPointerLock?.();
  if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.rdown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.rdown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const gp = { connected: false };
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[0];
  gp.connected = !!p;
  if (!p) return null;
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  return {
    mx: dz(p.axes[0] || 0), my: dz(p.axes[1] || 0),
    ax: dz(p.axes[2] || 0), ay: dz(p.axes[3] || 0),
    a: p.buttons[0]?.pressed, x: p.buttons[2]?.pressed,
    rt: p.buttons[7]?.pressed, lt: p.buttons[6]?.pressed,
    start: p.buttons[9]?.pressed,
  };
}
let prevStart = false;
function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; $('pause').classList.remove('hidden'); AUDIO.resume(); }
  else if (G.state === 'paused') { G.state = 'playing'; $('pause').classList.add('hidden'); if (G.state === 'playing') canvas.requestPointerLock?.(); }
}

// ============================== HUD update ==============================
const weaponSlots = [
  { id: 'laser', name: 'LASER', key: '' },
  { id: 'missile', name: 'MISSILE', key: '' },
];
function buildWeaponBox() {
  const box = $('weaponBox'); box.innerHTML = '';
  for (const w of weaponSlots) {
    const el = document.createElement('div'); el.className = 'wslot active'; el.id = 'wslot_' + w.id;
    el.innerHTML = `<div class="wname">${w.name}</div><div class="wammo" id="wammo_${w.id}">--</div>`;
    box.appendChild(el);
  }
}
buildWeaponBox();
function updateHud() {
  $('hpText').textContent = `${Math.max(0, Math.round(player.hull))} / ${Math.round(player.hullMax)}`;
  const hpBar = $('hpBar'); hpBar.style.width = `${clamp(player.hull / player.hullMax, 0, 1) * 100}%`;
  hpBar.classList.toggle('low', player.hull / player.hullMax < 0.3);
  $('shBar').style.width = `${clamp(player.shield / player.shieldMax, 0, 1) * 100}%`;
  $('waveLabel').textContent = `WAVE ${G.wave}`;
  $('waveSub').textContent = `hostiles: ${G.waveHostilesLeft}`;
  $('scrapLabel').textContent = `⚙ ${G.scrap}`;
  $('coreLabel').textContent = `◆ ${SAVE.meta.cores} cores`;
  $('comboLabel').textContent = G.combo > 1 ? `${G.combo}x COMBO` : '';
  $('wammo_laser').textContent = '∞';
  $('wammo_missile').textContent = `${player.missileAmmo}/${player.missileMax}`;
  if (G.bossActive) {
    const boss = enemies.find((e) => e.type === 'boss');
    if (boss) $('bossHp').style.width = `${clamp(boss.hp / boss.hpMax, 0, 1) * 100}%`;
  }
}

// ============================== enemy AI ==============================
function updateEnemies(dt) {
  const ppos = toVec3(player.body.position);
  for (const e of [...enemies]) {
    e.bob += dt;
    const epos = toVec3(e.body.position);
    const toP = new THREE.Vector3().subVectors(ppos, epos);
    const dist = toP.length(); toP.normalize();
    const spd = DIFFS[G.diff].enemySpd;
    e.fireCd -= dt;
    if (e.type === 'drone') {
      e.body.applyForce(new CANNON.Vec3(toP.x * 26 * spd, 0, toP.z * 26 * spd));
      if (dist < 20 && e.fireCd <= 0 && player.alive) { fireEnemyShot(epos, toP, 6 * DIFFS[G.diff].enemyDmg); e.fireCd = 1.6; }
    } else if (e.type === 'turret') {
      if (dist < 16) e.body.applyForce(new CANNON.Vec3(-toP.x * 14, 0, -toP.z * 14));
      else if (dist > 24) e.body.applyForce(new CANNON.Vec3(toP.x * 14, 0, toP.z * 14));
      if (dist < 34 && e.fireCd <= 0 && player.alive) { fireEnemyShot(epos, toP, 8 * DIFFS[G.diff].enemyDmg, 0xffd24a); e.fireCd = 2.2; }
    } else if (e.type === 'kamikaze') {
      e.body.applyForce(new CANNON.Vec3(toP.x * 40 * spd, 0, toP.z * 40 * spd));
      if (dist < 3 && player.alive) {
        damagePlayer(20 * DIFFS[G.diff].enemyDmg);
        burst(epos, 0xff7de0, 26, 12); screenShake(0.4, 0.3); AUDIO.explode(false);
        breakApart(epos, 0xff7de0, 6, 8);
        removeEnemy(e); G.waveHostilesLeft = countHostiles();
        continue;
      }
    } else if (e.type === 'boss') {
      e.phaseT -= dt;
      const orbit = dist > 26 ? 1 : dist < 16 ? -1 : 0;
      e.body.applyForce(new CANNON.Vec3(toP.x * 18 * orbit, 0, toP.z * 18 * orbit));
      const tangent = new THREE.Vector3(-toP.z, 0, toP.x);
      e.body.applyForce(new CANNON.Vec3(tangent.x * 10, 0, tangent.z * 10));
      if (e.phaseT <= 0 && player.alive) {
        e.phase = (e.phase + 1) % 3; e.phaseT = 2.4;
        if (e.phase === 0) for (let i = -2; i <= 2; i++) { const a = Math.atan2(toP.x, toP.z) + i * 0.25; fireEnemyShot(epos, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 10 * DIFFS[G.diff].enemyDmg, 0xd42f8f); }
        else if (e.phase === 1) fireEnemyShot(epos, toP, 16 * DIFFS[G.diff].enemyDmg, 0xff2fae);
        else for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fireEnemyShot(epos, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 8 * DIFFS[G.diff].enemyDmg, 0xd42f8f); }
      }
    }
    // clamp to arena
    if (epos.length() > ARENA_R) e.body.applyForce(new CANNON.Vec3(-epos.x * 6, 0, -epos.z * 6));
    e.body.velocity.y *= 0.8; e.body.position.y = clamp(e.body.position.y, -3, 3);
    e.mesh.position.copy(toVec3(e.body.position));
    const faceA = Math.atan2(toP.x, toP.z);
    e.mesh.rotation.y = lerp(e.mesh.rotation.y, faceA, 0.06);
  }
}

// ============================== pickups & tractor ==============================
function updatePickups(dt) {
  const ppos = toVec3(player.body.position);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.life += dt;
    p.mesh.rotation.y += dt * p.spin; p.mesh.position.y = Math.sin(p.life * 2) * 0.4;
    const d = p.mesh.position.distanceTo(ppos);
    const tractorOn = keys.tractor && d < player.tractorRange;
    if (tractorOn) {
      const toP = new THREE.Vector3().subVectors(ppos, p.mesh.position).normalize();
      p.mesh.position.addScaledVector(toP, dt * player.tractorForce * 0.1);
    }
    if (d < 1.6 || (tractorOn && d < 1.9)) {
      applyPickup(p.kind); AUDIO.pickup();
      SAVE.lifetime.powerupsCollected++;
      unlock('pickup-collector', SAVE.lifetime.powerupsCollected);
      removePickup(p);
    } else if (p.life > 22) removePickup(p);
  }
}
function applyPickup(kind) {
  switch (kind) {
    case 'rapid': player.buffs.rapid = 10; break;
    case 'spread': player.buffs.spread = 10; break;
    case 'speed': player.buffs.speed = 10; break;
    case 'multiplier': player.buffs.multiplier = 12; toast('Damage surge +60%'); break;
    case 'shield': player.shield = player.shieldMax; toast('Shield charged'); break;
    case 'repair': player.hull = Math.min(player.hullMax, player.hull + player.hullMax * 0.35); toast('Hull repaired'); break;
    case 'scrap': addScrap(20 + G.wave * 2); break;
  }
}

// ============================== player update ==============================
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function aimWorldPoint() {
  raycaster.setFromCamera(new THREE.Vector2(mouse.ndcX, mouse.ndcY), camera);
  const pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, pt);
  return pt || new THREE.Vector3();
}
function updatePlayer(dt) {
  if (!player.alive) return;
  for (const k in player.buffs) { player.buffs[k] -= dt; if (player.buffs[k] <= 0) delete player.buffs[k]; }
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

  const g = pollGamepad();
  let ix = 0, iz = 0;
  if (keys.KeyW) iz -= 1; if (keys.KeyS) iz += 1; if (keys.KeyA) ix -= 1; if (keys.KeyD) ix += 1;
  if (g) { ix += g.mx; iz += g.my; }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }

  let thrustMul = 1;
  if (keys.ShiftLeft || keys.ShiftRight) thrustMul *= 1.5;
  if (player.buffs.speed) thrustMul *= 1.3;
  if (player.boostCd > 0) player.boostCd -= dt;
  if ((keys.Space || g?.a) && player.boostCd <= 0) {
    player.boosting = 0.35; player.boostCd = 1.8; AUDIO.boostSfx(); screenShake(0.12, 0.15);
  }
  if (player.boosting > 0) { player.boosting -= dt; thrustMul *= 2.2; }

  const force = player.thrust * thrustMul * 6;
  player.body.applyForce(new CANNON.Vec3(ix * force, 0, iz * force));
  const v = player.body.velocity;
  const speed = Math.hypot(v.x, v.z); const capSpeed = player.maxSpeed * (thrustMul > 1 ? thrustMul : 1);
  if (speed > capSpeed) { const s = capSpeed / speed; v.x *= s; v.z *= s; }
  player.body.velocity.y *= 0.7; player.body.position.y = clamp(player.body.position.y, -1.5, 1.5);

  // soft arena wall
  const p = player.body.position; const r = Math.hypot(p.x, p.z);
  if (r > ARENA_R) { const s = (r - ARENA_R) * 4; player.body.applyForce(new CANNON.Vec3(-p.x / r * s, 0, -p.z / r * s)); }

  // aim
  let aimPt;
  if (g && (Math.abs(g.ax) > 0.001 || Math.abs(g.ay) > 0.001)) {
    player.aimAngle = Math.atan2(g.ax, -g.ay);
  } else {
    aimPt = aimWorldPoint();
    const dx = aimPt.x - p.x, dz = aimPt.z - p.z;
    if (Math.hypot(dx, dz) > 0.5) player.aimAngle = Math.atan2(dx, dz);
  }
  player.mesh.position.copy(toVec3(p));
  player.mesh.rotation.y = lerp(player.mesh.rotation.y, player.aimAngle, 0.18);
  player.mesh.rotation.z = lerp(player.mesh.rotation.z, -ix * 0.3, 0.1);
  const glow = player.mesh.getObjectByName('engineGlow');
  if (glow) glow.scale.setScalar(0.8 + (speed / player.maxSpeed) * 1.2 + (player.boosting > 0 ? 1 : 0));

  // shield regen
  if (player.shield < player.shieldMax) player.shield = Math.min(player.shieldMax, player.shield + player.shieldRegen * dt);

  // firing
  player.fireCd -= dt; player.missileCd -= dt;
  const firing = mouse.down || g?.rt;
  if (firing && player.fireCd <= 0) {
    const rate = player.fireRate * (player.buffs.rapid ? 2 : 1);
    player.fireCd = 1 / rate;
    const dir = new THREE.Vector3(Math.sin(player.aimAngle), 0, Math.cos(player.aimAngle));
    const origin = toVec3(p).addScaledVector(dir, 1.6);
    const dmg = player.dmg * (player.buffs.multiplier ? 1.6 : 1);
    if (player.buffs.spread) { fireLaser(origin, dir, dmg * 0.7, -0.18); fireLaser(origin, dir, dmg * 0.7, 0); fireLaser(origin, dir, dmg * 0.7, 0.18); }
    else fireLaser(origin, dir, dmg);
  }
  const secondary = mouse.rdown || g?.lt;
  if (secondary && player.missileCd <= 0 && player.missileAmmo > 0) {
    player.missileCd = 0.6; player.missileAmmo--;
    const dir = new THREE.Vector3(Math.sin(player.aimAngle), 0, Math.cos(player.aimAngle));
    fireMissile(toVec3(p).addScaledVector(dir, 1.6), dir);
  }

  // enemy contact damage
  for (const e of enemies) {
    if (e.type === 'kamikaze') continue;
    if (e.mesh.position.distanceTo(player.mesh.position) < (e.type === 'boss' ? 4.2 : 1.9)) {
      damagePlayer((e.type === 'boss' ? 22 : 8) * DIFFS[G.diff].enemyDmg * dt);
    }
  }
  for (const a of asteroids) {
    if (a.mesh.position.distanceTo(player.mesh.position) < a.size + 1.1) damagePlayer(10 * dt);
  }
}

// ============================== camera ==============================
function updateCamera(dt) {
  const target = player.alive && player.body ? toVec3(player.body.position) : camLook;
  const desired = target.clone().add(camOffset);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camLook.lerp(target, 1 - Math.pow(0.0005, dt));
  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT -= dt; sx = rand(-1, 1) * shakeMag; sy = rand(-1, 1) * shakeMag; if (shakeT <= 0) shakeMag = 0; }
  camera.lookAt(camLook.x + sx, camLook.y, camLook.z + sy);
  camera.position.x += sx * 0.3; camera.position.y += sy * 0.2;
}

// ============================== main loop ==============================
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // gamepad Start toggles pause (polled in every state so it can un-pause too)
  const padNow = pollGamepad();
  if (padNow) {
    if (padNow.start && !prevStart && (G.state === 'playing' || G.state === 'paused')) togglePause();
    prevStart = padNow.start;
  } else prevStart = false;
  if (G.state === 'playing') {
    world.step(1 / 60, dt, 3);
    updatePlayer(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateBullets(dt);
    updateBursts(dt);
    updateDebris(dt);
    updateHud();
    G.elapsed += dt; G.timeSinceReport += dt;
    if (G.timeSinceReport > 30) { G.timeSinceReport = 0; empire.reportPlaytime(30).catch(() => {}); persist(); }
    if (G.waveHostilesLeft <= 0 && !G.bossActive && player.alive) waveClear();
    else if (G.waveHostilesLeft <= 0 && G.bossActive === false) { /* handled above */ }
  } else {
    updateBursts(dt); updateDebris(dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ============================== menu wiring ==============================
document.querySelectorAll('.diffBtn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.diffBtn').forEach((x) => x.classList.remove('sel'));
  b.classList.add('sel'); G.diff = b.dataset.diff;
}));
$('btnPlay').onclick = () => startRun(G.diff, false);
$('btnDaily').onclick = () => startRun('normal', true);
$('btnUpgrades').onclick = () => { renderMetaMenu(); $('metaMenu').classList.remove('hidden'); };
$('metaBack').onclick = () => $('metaMenu').classList.add('hidden');
$('btnAch').onclick = () => { renderAchMenu(); $('achMenu').classList.remove('hidden'); };
$('achBack').onclick = () => $('achMenu').classList.add('hidden');
$('btnHow').onclick = () => $('howMenu').classList.remove('hidden');
$('howBack').onclick = () => $('howMenu').classList.add('hidden');
$('btnNextWave').onclick = () => closeShop();
$('btnResume').onclick = () => togglePause();
$('btnMusic').onclick = () => { AUDIO.musicOn = !AUDIO.musicOn; $('btnMusic').textContent = `MUSIC: ${AUDIO.musicOn ? 'ON' : 'OFF'}`; };
$('btnSfx').onclick = () => { AUDIO.sfxOn = !AUDIO.sfxOn; $('btnSfx').textContent = `SFX: ${AUDIO.sfxOn ? 'ON' : 'OFF'}`; };
$('btnRestart').onclick = () => { $('pause').classList.add('hidden'); startRun(G.diff, G.daily); };
$('btnQuit').onclick = async () => { $('pause').classList.add('hidden'); await persist(); backToMenu(); };
$('btnEndMenu').onclick = () => backToMenu();
$('btnEndRetry').onclick = () => startRun(G.diff, G.daily);
function backToMenu() {
  G.state = 'menu'; clearWorld();
  document.exitPointerLock?.();
  $('endScreen').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  refreshMenuStats();
}
function refreshMenuStats() {
  const daily = SAVE.daily.date === todayKey() ? SAVE.daily : { date: todayKey(), score: 0, done: false };
  $('dailyTag').textContent = daily.done ? `(done — best ${daily.score})` : '(new today)';
  $('menuStats').textContent = `Best — Easy ${SAVE.highScores.easy} · Normal ${SAVE.highScores.normal} · Hard ${SAVE.highScores.hard} · Cores ◆${SAVE.meta.cores}`;
}

// ============================== boot ==============================
(async function boot() {
  const init = await empire.connect().catch(() => null);
  empireSettings = init?.settings || null;
  if (empireSettings?.audio) {
    AUDIO.init();
    if (AUDIO.master) AUDIO.master.gain.value = (empireSettings.audio.master ?? 0.8) * (empireSettings.audio.muted ? 0 : 1);
    if (AUDIO.sfxGain) AUDIO.sfxGain.gain.value = empireSettings.audio.sfx ?? 0.7;
    if (AUDIO.musGain) AUDIO.musGain.gain.value = (empireSettings.audio.music ?? 0.7) * 0.25;
  }
  try {
    const rec = await empire.loadState('auto');
    if (rec?.blob) mergeSave(rec.blob);
  } catch { /* no save yet */ }
  if (SAVE.daily.date !== todayKey()) SAVE.daily = { date: todayKey(), score: 0, done: false };
  refreshMenuStats();
  addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') { empire.reportPlaytime(G.timeSinceReport).catch(() => {}); G.timeSinceReport = 0; persist(); }
  });
})();
