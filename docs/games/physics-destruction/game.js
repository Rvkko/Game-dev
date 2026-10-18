/* PHYSICS DESTRUCTION ARENA 3D — three.js rendering + cannon-es physics.
   Wave-survival destruction arena with ragdolls, shop, meta upgrades, boss,
   daily seeded challenge. Empire SDK integrated (save/load/achievements). */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

// ============================== utils ==============================
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
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
      this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.22; this.musGain.connect(this.master);
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
  noise(dur, vol = 0.4, freq = 800) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  },
  shoot(kind) {
    if (kind === 'bolt') { this.tone(680, 0.09, 'square', 0.22, -420); this.noise(0.05, 0.15, 2400); }
    else if (kind === 'grenade') { this.tone(240, 0.18, 'triangle', 0.3, -140); }
    else if (kind === 'rocket') { this.noise(0.35, 0.35, 900); this.tone(140, 0.3, 'sawtooth', 0.25, -60); }
    else if (kind === 'hammer') { this.tone(120, 0.2, 'sine', 0.4, -70); this.noise(0.12, 0.3, 500); }
  },
  boom(big = 1) { this.noise(0.5 * big, 0.55, 400); this.tone(70, 0.45 * big, 'sine', 0.5, -40); },
  hit() { this.tone(300, 0.06, 'square', 0.18, -120); },
  thud() { this.noise(0.1, 0.25, 300); },
  hurt() { this.tone(180, 0.22, 'sawtooth', 0.35, -90); },
  pickup() { this.tone(880, 0.08, 'square', 0.15, 220); },
  buy() { this.tone(520, 0.1, 'square', 0.2, 200); this.tone(780, 0.12, 'square', 0.15, 160); },
  wave() { this.tone(392, 0.14, 'square', 0.25); setTimeout(() => this.tone(523, 0.2, 'square', 0.25), 140); },
  ach() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.22), i * 90)); },
  die() { this.tone(220, 0.5, 'sawtooth', 0.4, -160); this.noise(0.6, 0.4, 350); },
  win() { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.25), i * 130)); },
  musicNote(freq, dur, vol, type = 'sawtooth') {
    if (!this.ctx || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + dur + 0.02);
  },
  startMusic() {
    if (this.musicTimer) return;
    const bass = [55, 55, 65.4, 49];       // A A C G
    const arp = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6];
    this.step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicOn || G.state !== 'PLAYING') return;
      const s = this.step++;
      if (s % 2 === 0) this.musicNote(bass[(s >> 3) % 4], 0.3, 0.5, 'triangle');
      this.musicNote(arp[s % 8] * (G.bossActive ? 1.5 : 1), 0.14, 0.18, 'square');
      if (s % 4 === 0) this.musicNote(1200, 0.03, 0.06, 'square');
    }, 170);
  },
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; },
};

// ============================== Empire SDK ==============================
const empire = new EmpireClient({
  gameId: 'physics-destruction',
  saveVersion: 1,
  onPause: () => { if (G.state === 'PLAYING') setPause(true); },
  onResume: () => {},
  onSettings: (s) => applySettings(s),
  onTheme: () => {},
});
const unlockedCache = new Set();
function ach(id, progress = 1) {
  if (unlockedCache.has(id) && progress >= 1) return;
  if (progress >= 1) { unlockedCache.add(id); toast(`Achievement: ${ACH_NAMES[id] || id}`); AUDIO.ach(); }
  empire.unlockAchievement(id, clamp(progress, 0, 1)).catch(() => {});
}
const ACH_NAMES = {
  'first-blood': 'First Blood', 'wrecking-ball': 'Wrecking Ball', 'wave-5': 'Storm Survivor',
  'airborne': 'Air Mail', 'untouchable': 'Untouchable', 'big-spender': 'Big Spender',
  'hoarder': 'Scrap Magnate', 'grenadier': 'Triple Threat', 'arsenal': 'Full Arsenal',
  'boss-slayer': 'Demolition Complete', 'daily-driver': 'Daily Demolisher', 'hard-boiled': 'Hardcore Demolition',
};
function applySettings(s) {
  if (!s) return;
  const a = s.audio || {};
  if (AUDIO.master && a.master != null) AUDIO.master.gain.value = clamp(a.master, 0, 1);
  if (AUDIO.sfxGain && a.sfx != null) AUDIO.sfxGain.gain.value = clamp(a.sfx, 0, 1);
  if (AUDIO.musGain && a.music != null) AUDIO.musGain.gain.value = clamp(a.music, 0, 1) * 0.35;
  if (s.textScale) document.documentElement.style.setProperty('--ts', String(clamp(s.textScale, 0.8, 1.5)));
  if (s.screenShake != null) G.shakeEnabled = !!s.screenShake;
}

// ============================== global state ==============================
const DIFFS = {
  easy:   { label: 'EASY',   ehp: 0.7,  edmg: 0.65, count: 0.8,  scrap: 1.1, cores: 0.7 },
  normal: { label: 'NORMAL', ehp: 1.0,  edmg: 1.0,  count: 1.0,  scrap: 1.0, cores: 1.0 },
  hard:   { label: 'HARD',   ehp: 1.45, edmg: 1.35, count: 1.25, scrap: 1.0, cores: 1.5 },
};
const MAX_WAVE = 10;

const G = {
  state: 'MENU',            // MENU SHOP PLAYING PAUSED PAUSED_INV OVER
  diff: 'easy',
  daily: false,
  seed: 1,
  rng: Math.random,
  wave: 0,
  waveActive: false,
  waveCleared: false,
  bossActive: false,
  boss: null,
  spawnQueue: [],
  spawnTimer: 0,
  hp: 100, maxHp: 100,
  scrap: 0, spentRun: 0,
  killsRun: 0, blocksRun: 0,
  dmgTakenWave: 0,
  combo: 0, comboTimer: 0,
  timeScale: 1, hitstop: 0,
  shake: 0, shakeEnabled: true,
  runTime: 0,
  upgrades: {},             // per-run shop upgrade levels
  meta: { cores: 0, up: {}, blocksTotal: 0, bestWave: 0, wins: 0, dailyDone: {} },
  invOpen: false,
  overFlag: false,
};

// weapon defs
const WEAPONS = [
  { id: 'bolt',    name: 'BOLT CASTER',   key: '1', mag: 12, reload: 1.0, cd: 0.22, dmg: 14, kind: 'proj', speed: 46, mass: 1.2, radius: 0, kb: 9 },
  { id: 'grenade', name: 'GRENADE LNCHR', key: '2', mag: 4,  reload: 1.6, cd: 0.55, dmg: 42, kind: 'proj', speed: 26, mass: 2.2, radius: 5, kb: 16 },
  { id: 'hammer',  name: 'SHOCK HAMMER',  key: '3', mag: Infinity, reload: 0, cd: 0.7, dmg: 34, kind: 'melee', range: 4.0, kb: 26 },
  { id: 'rocket',  name: 'ROCKET LANCE',  key: '4', mag: 2,  reload: 2.2, cd: 0.8, dmg: 75, kind: 'proj', speed: 38, mass: 3, radius: 7, kb: 24 },
];
const W = { owned: ['bolt'], cur: 0, ammo: {}, reloading: 0, cd: 0 };

// shop items
const SHOP_ITEMS = [
  { id: 'repair', t: 'FIELD REPAIR', d: '+35 HP', cost: () => 40, can: () => G.hp < G.maxHp, buy: () => { G.hp = Math.min(G.maxHp, G.hp + 35); } },
  { id: 'w_grenade', t: 'GRENADE LAUNCHER', d: 'Lobbed explosives. Blast radius wrecks structures.', cost: () => 150, weapon: 'grenade' },
  { id: 'w_hammer', t: 'SHOCK HAMMER', d: 'Melee shockwave. Infinite swings, massive knockback.', cost: () => 120, weapon: 'hammer' },
  { id: 'w_rocket', t: 'ROCKET LANCE', d: 'Fast rocket, huge blast. Boss deleter.', cost: () => 300, weapon: 'rocket' },
  { id: 's_dmg', t: 'HYPER PAYLOAD', d: '+15% damage per level', max: 5, cost: (l) => 60 + l * 35 },
  { id: 's_hp', t: 'PLATED SUIT', d: '+20 max HP per level', max: 4, cost: (l) => 70 + l * 30, buy: () => { G.maxHp += 20; G.hp += 20; } },
  { id: 's_speed', t: 'SERVO LEGS', d: '+8% move speed per level', max: 3, cost: (l) => 50 + l * 30 },
  { id: 's_blast', t: 'BIG BADA BOOM', d: '+18% blast radius per level', max: 3, cost: (l) => 60 + l * 35 },
];
const META_ITEMS = [
  { id: 'm_hp', t: 'REINFORCED CORE', d: '+15 starting max HP / lvl', max: 4, cost: (l) => 2 + l },
  { id: 'm_dmg', t: 'OVERCHARGED COILS', d: '+8% damage / lvl', max: 4, cost: (l) => 2 + l },
  { id: 'm_scrap', t: 'SALVAGE CONTRACT', d: '+40 starting scrap / lvl', max: 3, cost: (l) => 1 + l },
  { id: 'm_speed', t: 'LIGHT FRAME', d: '+6% move speed / lvl', max: 3, cost: (l) => 2 + l },
];

function dmgMult() { return (1 + 0.15 * (G.upgrades.s_dmg || 0)) * (1 + 0.08 * (G.meta.up.m_dmg || 0)); }
function speedMult() { return (1 + 0.08 * (G.upgrades.s_speed || 0)) * (1 + 0.06 * (G.meta.up.m_speed || 0)); }
function blastMult() { return 1 + 0.18 * (G.upgrades.s_blast || 0); }

// ============================== three.js scene ==============================
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = '<div style="padding:40px;color:#fff">WebGL is required for this game and could not be initialized.</div>';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1220);
scene.fog = new THREE.Fog(0x0d1220, 55, 150);

// Authored Blender kit: the gameplay collider remains Cannon-driven, while
// the exported hero detail replaces the fallback capsule when available.
let profilePlayerAsset = null;
let profilePhysicsRadius = 0.7;
window.__physicsAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
async function loadPhysicsAsset() {
  const Loader = window.THREE?.GLTFLoader;
  if (!Loader) { window.__physicsAssetStatus.error = 'GLTFLoader unavailable'; return; }
  try {
    const [physics, gltf] = await Promise.all([
      fetch('../../assets/blender-kits/physics-destruction/physics.json').then((r) => r.ok ? r.json() : null),
      new Promise((resolve, reject) => new Loader().load('../../assets/blender-kits/physics-destruction/physics-destruction-kit.glb', resolve, undefined, reject)),
    ]);
    const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
    if (!source) throw new Error('profile player asset missing');
    profilePlayerAsset = source.clone(true);
    profilePlayerAsset.name = 'BLENDER_PLAYER_DETAIL';
    profilePlayerAsset.scale.setScalar(1.15);
    profilePlayerAsset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    profilePhysicsRadius = physics?.playerCollider?.radius || profilePhysicsRadius;
    window.__physicsAssetStatus.loaded = true;
    window.__physicsAssetStatus.physics = !!physics?.playerCollider;
  } catch (error) {
    window.__physicsAssetStatus.error = String(error?.message || error);
  }
}

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 8, 16);

scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x1a1408, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(24, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.far = 130;
scene.add(sun);

const flash = new THREE.PointLight(0xffcc66, 0, 40, 2);
scene.add(flash);
let flashT = 0;

function fitViewport() {
  if (innerWidth < 2 || innerHeight < 2) return; // ignore collapsed/hidden panes
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', fitViewport);
document.addEventListener('visibilitychange', () => { if (!document.hidden) fitViewport(); });

// ============================== physics world ==============================
const GROUP = { WORLD: 1, PLAYER: 2, RAGDOLL: 4, ENEMY: 8, PROJ: 16 };
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
const matGround = new CANNON.Material('ground');
const matBlock = new CANNON.Material('block');
const matPlayer = new CANNON.Material('player');
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matBlock, { friction: 0.5, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(matBlock, matBlock, { friction: 0.45, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matPlayer, { friction: 0.0, restitution: 0 }));
world.defaultContactMaterial.friction = 0.4;

const bodyData = new Map(); // body.id -> {kind, ref}
function tag(body, kind, ref) { bodyData.set(body.id, { kind, ref }); }
function untag(body) { bodyData.delete(body.id); }

// ============================== arena ==============================
const ARENA = 38; // half-extent
const arenaGroup = new THREE.Group();
scene.add(arenaGroup);
let blocks = [];         // {mesh, body, hp, maxHp, mat, size}
let debris = [];         // {mesh, body, ttl}
let enemies = [];
let ragdolls = [];       // {parts:[{mesh,body}], cons, ttl}
let projectiles = [];    // {mesh, body, def, ttl, dead, enemy, dmg}
let staticMeshes = [];

const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
const BLOCK_MATS = {
  wood:  { color: 0x9a6a38, hp: 26, density: 2.2, scrap: 2 },
  stone: { color: 0x8b93a5, hp: 65, density: 5.0, scrap: 3 },
  crate: { color: 0xd9a832, hp: 14, density: 1.4, scrap: 6 },
};
const threeMats = {};
for (const [k, v] of Object.entries(BLOCK_MATS)) {
  threeMats[k] = new THREE.MeshStandardMaterial({ color: v.color, roughness: 0.85, metalness: 0.05 });
}

function addBlock(x, y, z, w, h, d, matName) {
  const info = BLOCK_MATS[matName];
  const mesh = new THREE.Mesh(boxGeo(w, h, d), threeMats[matName]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  arenaGroup.add(mesh);
  const body = new CANNON.Body({
    mass: w * h * d * info.density,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    position: new CANNON.Vec3(x, y, z),
    material: matBlock,
    collisionFilterGroup: GROUP.WORLD,
    collisionFilterMask: -1,
  });
  body.allowSleep = true; body.sleepSpeedLimit = 0.4; body.sleepTimeLimit = 0.6;
  world.addBody(body);
  const block = { mesh, body, hp: info.hp, maxHp: info.hp, mat: matName, size: [w, h, d] };
  tag(body, 'block', block);
  body.addEventListener('collide', (e) => {
    if (block.hp <= 0 || block.dead) return;
    const iv = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const other = bodyData.get(e.body.id);
    if (iv > 9 && e.body.mass > 1.5 && (!other || other.kind !== 'player')) {
      damageBlock(block, (iv - 8) * 2.2, body.position);
    }
  });
  blocks.push(block);
  return block;
}

function addStaticBox(x, y, z, w, h, d, color, visible = true) {
  const body = new CANNON.Body({
    mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    position: new CANNON.Vec3(x, y, z), material: matGround,
    collisionFilterGroup: GROUP.WORLD, collisionFilterMask: -1,
  });
  world.addBody(body);
  tag(body, 'static', null);
  if (visible) {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    arenaGroup.add(mesh);
    staticMeshes.push({ mesh, body });
  } else {
    staticMeshes.push({ mesh: null, body });
  }
  return body;
}

function buildStructure(rng, cx, cz) {
  const type = Math.floor(rng() * 3);
  const mats = ['wood', 'stone', 'crate'];
  const mat = mats[Math.floor(rng() * mats.length)];
  if (type === 0) { // tower
    const h = 4 + Math.floor(rng() * 4);
    for (let y = 0; y < h; y++)
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++)
          addBlock(cx + i * 1.05 - 0.52, 0.55 + y * 1.06, cz + j * 1.05 - 0.52, 1, 1, 1, y === 0 ? 'stone' : mat);
    if (rng() < 0.6) addBlock(cx, 0.55 + h * 1.06 + 0.3, cz, 2.4, 0.5, 2.4, 'wood');
  } else if (type === 1) { // wall
    const wdt = 4 + Math.floor(rng() * 3), hgt = 3 + Math.floor(rng() * 2);
    const rot = rng() < 0.5;
    for (let y = 0; y < hgt; y++)
      for (let i = 0; i < wdt; i++) {
        const off = (i - wdt / 2) * 1.25 + (y % 2) * 0.6;
        addBlock(cx + (rot ? 0 : off), 0.45 + y * 0.85, cz + (rot ? off : 0), rot ? 0.8 : 1.2, 0.8, rot ? 1.2 : 0.8, mat);
      }
  } else { // pyramid of crates
    const base = 3 + Math.floor(rng() * 2);
    for (let y = 0; y < base; y++) {
      const n = base - y;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          addBlock(cx + (i - n / 2 + 0.5) * 1.05, 0.55 + y * 1.05, cz + (j - n / 2 + 0.5) * 1.05, 1, 1, 1, rng() < 0.4 ? 'crate' : mat);
    }
  }
}

const structurePads = [];
function buildArena(seed) {
  // clear old physics/meshes
  for (const b of blocks.slice()) removeBlock(b, false);
  blocks = [];
  for (const d of debris) { world.removeBody(d.body); arenaGroup.remove(d.mesh); untag(d.body); }
  debris = [];
  for (const s of staticMeshes) { if (s.mesh) arenaGroup.remove(s.mesh); if (s.body) { world.removeBody(s.body); untag(s.body); } }
  staticMeshes = [];
  clearEntities();
  // ground
  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: matGround, collisionFilterGroup: GROUP.WORLD, collisionFilterMask: -1 });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody); tag(groundBody, 'ground', null);
  staticMeshes.push({ mesh: makeGroundMesh(), body: groundBody });
  // perimeter walls (visible, low)
  const wallH = 3.4, wc = 0x2a3550;
  addStaticBox(0, wallH / 2, -ARENA - 1, ARENA * 2 + 4, wallH, 2, wc);
  addStaticBox(0, wallH / 2, ARENA + 1, ARENA * 2 + 4, wallH, 2, wc);
  addStaticBox(-ARENA - 1, wallH / 2, 0, 2, wallH, ARENA * 2 + 4, wc);
  addStaticBox(ARENA + 1, wallH / 2, 0, 2, wallH, ARENA * 2 + 4, wc);
  // invisible tall walls so nothing escapes
  addStaticBox(0, 12, -ARENA - 2.5, ARENA * 2 + 8, 24, 1, 0, false);
  addStaticBox(0, 12, ARENA + 2.5, ARENA * 2 + 8, 24, 1, 0, false);
  addStaticBox(-ARENA - 2.5, 12, 0, 1, 24, ARENA * 2 + 8, 0, false);
  addStaticBox(ARENA + 2.5, 12, 0, 1, 24, ARENA * 2 + 8, 0, false);
  // corner pillars
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    addStaticBox(sx * (ARENA - 4), 3, sz * (ARENA - 4), 2.4, 6, 2.4, 0x39496e);
  // seeded structures
  const rng = mulberry32(seed);
  structurePads.length = 0;
  const padCount = 7;
  for (let i = 0; i < padCount; i++) {
    const ang = (i / padCount) * Math.PI * 2 + rng() * 0.5;
    const r = 10 + rng() * 18;
    const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
    structurePads.push([cx, cz]);
    buildStructure(rng, cx, cz);
  }
}
function makeGroundMesh() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 6, ARENA * 2 + 6, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.95 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
  arenaGroup.add(g);
  const grid = new THREE.GridHelper(ARENA * 2, 26, 0x2a3550, 0x222d45);
  grid.position.y = 0.02;
  arenaGroup.add(grid);
  staticMeshes.push({ mesh: grid, body: null });
  return g;
}

function removeBlock(b, effects = true) {
  if (b.dead) return;
  b.dead = true;
  world.removeBody(b.body); untag(b.body);
  arenaGroup.remove(b.mesh);
  if (effects) {
    spawnDebris(b.body.position, b.mat, 4);
    particles.burst(b.body.position, BLOCK_MATS[b.mat].color, 10, 6);
    addScrap(BLOCK_MATS[b.mat].scrap);
    G.blocksRun++; G.meta.blocksTotal++;
    ach('wrecking-ball', G.meta.blocksTotal / 50);
    AUDIO.thud();
  }
}
function damageBlock(b, dmg, atPos) {
  if (b.dead || b.hp <= 0) return;
  b.hp -= dmg;
  b.body.wakeUp();
  if (b.hp <= 0) removeBlock(b);
  else {
    const f = b.hp / b.maxHp;
    if (!b.ownMat) { b.mesh.material = b.mesh.material.clone(); b.ownMat = true; }
    b.mesh.material.color.setHex(BLOCK_MATS[b.mat].color).multiplyScalar(0.45 + 0.55 * f);
    if (atPos) particles.burst(atPos, BLOCK_MATS[b.mat].color, 4, 4);
  }
}
function spawnDebris(pos, matName, n) {
  for (let i = 0; i < n; i++) {
    if (debris.length > 42) { const old = debris.shift(); world.removeBody(old.body); arenaGroup.remove(old.mesh); untag(old.body); }
    const s = rand(0.22, 0.42);
    const mesh = new THREE.Mesh(boxGeo(0.35, 0.35, 0.35), threeMats[matName]);
    mesh.scale.setScalar(s / 0.35);
    arenaGroup.add(mesh);
    const body = new CANNON.Body({
      mass: 0.6, shape: new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)),
      position: new CANNON.Vec3(pos.x + rand(-0.4, 0.4), pos.y + rand(-0.2, 0.5), pos.z + rand(-0.4, 0.4)),
      material: matBlock, collisionFilterGroup: GROUP.WORLD, collisionFilterMask: -1,
    });
    body.velocity.set(rand(-5, 5), rand(2, 8), rand(-5, 5));
    body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    body.allowSleep = true; body.sleepSpeedLimit = 0.5; body.sleepTimeLimit = 0.5;
    world.addBody(body); tag(body, 'debris', null);
    debris.push({ mesh, body, ttl: 6 });
  }
}

// ============================== particles ==============================
const particles = (() => {
  const MAX = 600;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  positions.fill(-100);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const pool = [];
  for (let i = 0; i < MAX; i++) pool.push({ life: 0, vx: 0, vy: 0, vz: 0, i });
  let cursor = 0;
  const col = new THREE.Color();
  return {
    burst(pos, hex, n, spd) {
      col.setHex(hex);
      for (let k = 0; k < n; k++) {
        const p = pool[cursor]; cursor = (cursor + 1) % MAX;
        p.life = rand(0.4, 0.9);
        positions[p.i * 3] = pos.x; positions[p.i * 3 + 1] = pos.y; positions[p.i * 3 + 2] = pos.z;
        colors[p.i * 3] = col.r; colors[p.i * 3 + 1] = col.g; colors[p.i * 3 + 2] = col.b;
        const a = rand(0, Math.PI * 2), b = rand(-1, 1);
        const m = rand(0.3, 1) * spd;
        p.vx = Math.cos(a) * m; p.vz = Math.sin(a) * m; p.vy = Math.abs(b) * m + 2;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) { positions[p.i * 3 + 1] = -100; continue; }
        p.life -= dt; p.vy -= 18 * dt;
        positions[p.i * 3] += p.vx * dt;
        positions[p.i * 3 + 1] += p.vy * dt;
        positions[p.i * 3 + 2] += p.vz * dt;
        if (positions[p.i * 3 + 1] < 0.05) { positions[p.i * 3 + 1] = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
})();

// ============================== player ==============================
const player = {
  body: null, mesh: null, yaw: 0, pitch: -0.15,
  grounded: false, firstPerson: false, aiming: false,
  fovKick: 0, hurtCd: 0,
};
function makePlayerMesh() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x3ec6ff, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16324a, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 4, 10), suit);
  torso.position.y = 0.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), dark);
  head.position.y = 0.95; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffd24a, emissiveIntensity: 0.7 }));
  visor.position.set(0, 0.97, -0.2); g.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), dark);
  gun.position.set(0.42, 0.35, -0.3); g.add(gun);
  return g;
}
function spawnPlayer() {
  if (player.body) { world.removeBody(player.body); untag(player.body); }
  if (player.mesh) scene.remove(player.mesh);
  player.body = new CANNON.Body({
    mass: 10, shape: new CANNON.Sphere(profilePhysicsRadius), position: new CANNON.Vec3(0, 2, ARENA - 8),
    material: matPlayer, fixedRotation: true, linearDamping: 0.02,
    collisionFilterGroup: GROUP.PLAYER,
    collisionFilterMask: GROUP.WORLD | GROUP.ENEMY | GROUP.PROJ | GROUP.RAGDOLL,
  });
  player.body.allowSleep = false;
  world.addBody(player.body);
  tag(player.body, 'player', player);
  player.mesh = makePlayerMesh();
  if (profilePlayerAsset) {
    player.mesh.children.forEach((child) => { child.visible = false; });
    if (profilePlayerAsset.parent) profilePlayerAsset.parent.remove(profilePlayerAsset);
    player.mesh.add(profilePlayerAsset);
    window.__physicsAssetStatus.attached = true;
  }
  scene.add(player.mesh);
  player.yaw = 0; // spawn at +z facing -z (arena center)
  player.pitch = -0.12;
}

const keys = {};
let mouseDX = 0, mouseDY = 0, fireHeld = false, locked = false;
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Tab') e.preventDefault();
  handleKey(e.code);
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  mouseDX += e.movementX; mouseDY += e.movementY;
});
canvas.addEventListener('mousedown', (e) => {
  AUDIO.init(); AUDIO.resume();
  if (G.state === 'PLAYING') {
    if (!locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) fireHeld = true;
    if (e.button === 2) player.aiming = true;
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) fireHeld = false;
  if (e.button === 2) player.aiming = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (G.state !== 'PLAYING' || !locked) return;
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('crosshair').style.display = locked ? 'block' : 'none';
  $('lockHint').style.display = (!locked && G.state === 'PLAYING') ? 'block' : 'none';
  if (!locked && G.state === 'PLAYING' && !G.overFlag) setPause(true);
});

function handleKey(code) {
  if (G.state === 'PLAYING') {
    if (code === 'Escape' || code === 'KeyP') { setPause(true); return; }
    if (code === 'KeyQ') cycleWeapon(1);
    if (code === 'KeyR') startReload();
    if (code === 'KeyV') player.firstPerson = !player.firstPerson;
    if (code === 'KeyE' && G.waveCleared) openShop();
    if (code === 'Digit1') selectWeapon('bolt');
    if (code === 'Digit2') selectWeapon('grenade');
    if (code === 'Digit3') selectWeapon('hammer');
    if (code === 'Digit4') selectWeapon('rocket');
    if ((code === 'Tab' || code === 'KeyI') && !G.invOpen) { toggleInv(true); return; }
  } else if (G.state === 'PAUSED' && code === 'Escape') {
    // resume must come from a user gesture; keydown qualifies for pointer lock re-request
    resumeGame();
  }
  if (G.invOpen && (code === 'Escape' || code === 'Tab' || code === 'KeyI')) toggleInv(false);
}

// gamepad
const pad = { lastButtons: [] };
function pollGamepad(dt) {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && gps[0];
  if (!gp) return null;
  const dead = (v) => (Math.abs(v) < 0.16 ? 0 : v);
  const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
  const just = (i) => btn(i) && !pad.lastButtons[i];
  const out = {
    mx: dead(gp.axes[0] || 0), my: dead(gp.axes[1] || 0),
    lx: dead(gp.axes[2] || 0), ly: dead(gp.axes[3] || 0),
    fire: btn(7), aim: btn(6), jump: just(0), sprint: btn(10),
    cycleL: just(4), cycleR: just(5), interact: just(2), reload: just(3), pause: just(9),
  };
  // non-inverted right stick: stick up (negative ly) looks up
  player.yaw += out.lx * 2.6 * dt;
  player.pitch -= out.ly * 2.0 * dt;
  pad.lastButtons = gp.buttons.map((b) => b.pressed);
  return out;
}

// ============================== weapons ==============================
function wDef() { return WEAPONS.find((w) => w.id === W.owned[W.cur]); }
function selectWeapon(id) {
  const i = W.owned.indexOf(id);
  if (i >= 0 && i !== W.cur) { W.cur = i; W.reloading = 0; AUDIO.tone(440, 0.05, 'square', 0.12); updateWeaponHud(); }
}
function cycleWeapon(dir) {
  if (W.owned.length < 2) return;
  W.cur = (W.cur + dir + W.owned.length) % W.owned.length;
  W.reloading = 0; AUDIO.tone(440, 0.05, 'square', 0.12);
  updateWeaponHud();
}
function startReload() {
  const d = wDef();
  if (d.mag === Infinity || W.reloading > 0 || (W.ammo[d.id] || 0) >= d.mag) return;
  W.reloading = d.reload;
  AUDIO.tone(320, 0.08, 'square', 0.12, -80);
  updateWeaponHud();
}
function giveWeapon(id) {
  if (!W.owned.includes(id)) {
    W.owned.push(id);
    const d = WEAPONS.find((w) => w.id === id);
    W.ammo[id] = d.mag === Infinity ? Infinity : d.mag;
    if (W.owned.length >= 4) ach('arsenal');
    updateWeaponHud();
  }
}
function refillAmmo() { for (const id of W.owned) { const d = WEAPONS.find((w) => w.id === id); W.ammo[id] = d.mag; } }

const camDir = new THREE.Vector3();
function tryFire() {
  const d = wDef();
  if (W.cd > 0 || W.reloading > 0) return;
  if (d.mag !== Infinity && (W.ammo[d.id] || 0) <= 0) { startReload(); return; }
  W.cd = d.cd;
  if (d.mag !== Infinity) W.ammo[d.id]--;
  camera.getWorldDirection(camDir);
  const origin = new THREE.Vector3().copy(player.body.position);
  origin.y += 1.0;
  origin.addScaledVector(camDir, 1.1);
  AUDIO.shoot(d.id);
  player.fovKick = 3.5;
  flashAt(origin, 0xffcc66, 2.5);
  if (d.kind === 'melee') {
    meleeSwing(d);
  } else {
    fireProjectile(d, origin, camDir, false);
    // recoil
    player.body.velocity.x -= camDir.x * d.kb * 0.12;
    player.body.velocity.z -= camDir.z * d.kb * 0.12;
  }
  updateWeaponHud();
}
const projGeo = new THREE.SphereGeometry(0.22, 10, 8);
const projMats = {
  bolt: new THREE.MeshStandardMaterial({ color: 0x3ec6ff, emissive: 0x3ec6ff, emissiveIntensity: 1.4 }),
  grenade: new THREE.MeshStandardMaterial({ color: 0xff9d3e, emissive: 0xff5a2e, emissiveIntensity: 0.8 }),
  rocket: new THREE.MeshStandardMaterial({ color: 0xff5a6e, emissive: 0xff2222, emissiveIntensity: 1.2 }),
  eproj: new THREE.MeshStandardMaterial({ color: 0xd98cff, emissive: 0xa040ff, emissiveIntensity: 1.0 }),
};
function fireProjectile(d, origin, dir, isEnemy, overrideDmg) {
  const mesh = new THREE.Mesh(projGeo, projMats[isEnemy ? 'eproj' : d.id] || projMats.bolt);
  mesh.scale.setScalar(d.id === 'rocket' ? 1.5 : d.id === 'grenade' ? 1.2 : 1);
  mesh.castShadow = true;
  scene.add(mesh);
  const body = new CANNON.Body({
    mass: d.mass || 1.5, shape: new CANNON.Sphere(0.22 * (d.id === 'rocket' ? 1.5 : 1)),
    position: new CANNON.Vec3(origin.x, origin.y, origin.z),
    collisionFilterGroup: GROUP.PROJ,
    collisionFilterMask: GROUP.WORLD | GROUP.ENEMY | GROUP.RAGDOLL | (isEnemy ? GROUP.PLAYER : 0),
  });
  body.velocity.set(dir.x * d.speed, dir.y * d.speed + (d.id === 'grenade' ? 4 : 0), dir.z * d.speed);
  world.addBody(body);
  const p = { mesh, body, def: d, ttl: d.id === 'grenade' ? 2.4 : 4, dead: false, enemy: isEnemy, dmg: overrideDmg || d.dmg };
  tag(body, 'proj', p);
  body.addEventListener('collide', (e) => onProjHit(p, e));
  projectiles.push(p);
}
function onProjHit(p, e) {
  if (p.dead) return;
  const other = bodyData.get(e.body.id);
  if (p.enemy) {
    if (other && other.kind === 'player') { damagePlayer(p.dmg); killProjectile(p, true); }
    else if (!other || other.kind !== 'enemy') killProjectile(p, true);
    return;
  }
  const d = p.def;
  if (d.radius > 0) { killProjectile(p, true); return; }
  // bolt: direct damage
  if (other && other.kind === 'enemy') {
    const dir = new CANNON.Vec3().copy(p.body.velocity); dir.normalize();
    damageEnemy(other.ref, p.dmg * dmgMult(), dir.scale(d.kb));
  } else if (other && other.kind === 'block') {
    damageBlock(other.ref, p.dmg * dmgMult() * 1.4, p.body.position);
    e.body.wakeUp();
    e.body.applyImpulse(new CANNON.Vec3(p.body.velocity.x * 0.4, 2, p.body.velocity.z * 0.4), p.body.position);
  } else if (other && other.kind === 'ragdoll') {
    e.body.applyImpulse(new CANNON.Vec3().copy(p.body.velocity).scale(0.3), p.body.position);
  }
  particles.burst(p.body.position, 0x3ec6ff, 6, 5);
  AUDIO.hit();
  killProjectile(p, false);
}
function killProjectile(p, explode) {
  if (p.dead) return;
  p.dead = true;
  if (explode && !p.enemy && p.def.radius > 0) doExplosion(p.body.position, p.def.radius * blastMult(), p.dmg * dmgMult(), p.def.kb);
  else if (explode && p.enemy) { particles.burst(p.body.position, 0xd98cff, 8, 5); AUDIO.hit(); }
}
function meleeSwing(d) {
  camera.getWorldDirection(camDir);
  const pp = player.body.position;
  let hitAny = false;
  const fwd2 = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const check = (bpos) => {
    const dx = bpos.x - pp.x, dy = bpos.y - pp.y, dz = bpos.z - pp.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > d.range) return 0;
    const dot = (dx * fwd2.x + dz * fwd2.z) / (Math.hypot(dx, dz) || 1);
    if (dot < 0.35 && dist > 1.4) return 0;
    return 1 - dist / (d.range + 1);
  };
  for (const en of enemies.slice()) {
    const f = check(en.body.position);
    if (f > 0) {
      hitAny = true;
      const imp = new CANNON.Vec3(fwd2.x * d.kb, d.kb * 0.55, fwd2.z * d.kb);
      damageEnemy(en, d.dmg * dmgMult() * (0.5 + f * 0.7), imp);
    }
  }
  for (const b of blocks.slice()) {
    const f = check(b.body.position);
    if (f > 0) {
      hitAny = true;
      b.body.wakeUp();
      b.body.applyImpulse(new CANNON.Vec3(fwd2.x * d.kb * 1.6, d.kb * 0.7, fwd2.z * d.kb * 1.6), b.body.position);
      damageBlock(b, d.dmg * dmgMult() * 0.8, b.body.position);
    }
  }
  for (const r of ragdolls) for (const part of r.parts) {
    if (check(part.body.position) > 0)
      part.body.applyImpulse(new CANNON.Vec3(fwd2.x * 8, 5, fwd2.z * 8), part.body.position);
  }
  if (hitAny) { addShake(0.25); hitstop(0.05); }
  particles.burst(new THREE.Vector3(pp.x + fwd2.x * 2, pp.y + 0.5, pp.z + fwd2.z * 2), 0xffd24a, 10, 6);
}

// ============================== explosions ==============================
function doExplosion(pos, radius, dmg, kb) {
  AUDIO.boom(radius > 5.5 ? 1.4 : 1);
  addShake(radius * 0.16);
  hitstop(0.06);
  flashAt(pos, 0xffaa44, radius * 1.6);
  particles.burst(pos, 0xffaa44, 26, 11);
  particles.burst(pos, 0xff5a2e, 16, 7);
  let killsThisBlast = 0;
  const apply = (body, factorScale, onHit) => {
    const dx = body.position.x - pos.x, dy = body.position.y - pos.y, dz = body.position.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) return;
    const f = (1 - dist / radius) * factorScale;
    const n = dist > 0.01 ? 1 / dist : 0;
    if (body.wakeUp) body.wakeUp();
    const s = kb * f * body.mass * 0.35;
    body.applyImpulse(new CANNON.Vec3(dx * n * s + 0.001, (dy * n * 0.5 + 0.6) * s, dz * n * s), body.position);
    if (onHit) onHit(f);
  };
  for (const b of blocks.slice()) apply(b.body, 1, (f) => damageBlock(b, dmg * f * 1.3, b.body.position));
  for (const en of enemies.slice()) apply(en.body, 1, (f) => {
    const wasAlive = en.hp > 0;
    damageEnemy(en, dmg * f, null);
    if (wasAlive && en.hp <= 0) killsThisBlast++;
  });
  for (const dd of debris) apply(dd.body, 1.2);
  for (const r of ragdolls) for (const part of r.parts) apply(part.body, 1.4);
  if (player.body) apply(player.body, 0.8, (f) => damagePlayer(dmg * f * 0.35));
  if (killsThisBlast >= 3) ach('grenadier');
}
function flashAt(pos, color, intensity) {
  flash.position.copy(pos);
  flash.color.setHex(color);
  flash.intensity = intensity * 30;
  flashT = 0.14;
}

// ============================== enemies ==============================
const ETYPES = {
  grunt:   { hp: 34,  speed: 4.6, dmg: 10, scrap: 12,  color: 0xff5a6e, scale: 1.0, mass: 8 },
  brute:   { hp: 110, speed: 2.9, dmg: 20, scrap: 26,  color: 0xc73a2e, scale: 1.5, mass: 22 },
  thrower: { hp: 46,  speed: 3.4, dmg: 12, scrap: 18,  color: 0xd98cff, scale: 1.1, mass: 9,  ranged: true },
  boss:    { hp: 620, speed: 2.3, dmg: 26, scrap: 220, color: 0x8f2fd4, scale: 2.5, mass: 60, ranged: true, boss: true },
};
function makeEnemyMesh(t) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.45), bodyMat);
  torso.position.y = 0.55; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), bodyMat);
  head.position.y = 1.32; head.castShadow = true; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffc02a, emissiveIntensity: 1.2 }));
  eye.position.set(0, 1.36, -0.22); g.add(eye);
  const mkLimb = (x, y) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), darkMat);
    l.position.set(x, y, 0); l.castShadow = true; g.add(l); return l;
  };
  g.userData.legL = mkLimb(-0.22, -0.15);
  g.userData.legR = mkLimb(0.22, -0.15);
  g.userData.armL = mkLimb(-0.5, 0.6);
  g.userData.armR = mkLimb(0.5, 0.6);
  g.scale.setScalar(t.scale);
  return g;
}
function spawnEnemy(typeName, x, z) {
  const t = ETYPES[typeName];
  const dm = DIFFS[G.diff];
  const mesh = makeEnemyMesh(t);
  scene.add(mesh);
  const r = 0.55 * t.scale;
  const body = new CANNON.Body({
    mass: t.mass, shape: new CANNON.Sphere(r),
    position: new CANNON.Vec3(x, r + 3, z),
    fixedRotation: true, linearDamping: 0.05,
    collisionFilterGroup: GROUP.ENEMY,
    collisionFilterMask: GROUP.WORLD | GROUP.PLAYER | GROUP.ENEMY | GROUP.PROJ | GROUP.RAGDOLL,
  });
  body.allowSleep = false;
  world.addBody(body);
  const hpScale = dm.ehp * (1 + Math.max(0, G.wave - 5) * 0.06);
  const en = {
    type: typeName, t, mesh, body, radius: r,
    hp: t.hp * hpScale, maxHp: t.hp * hpScale,
    atkCd: rand(0.5, 1.5), throwCd: rand(1.5, 3), slamCd: 4, animT: rand(0, 6), dead: false,
  };
  tag(body, 'enemy', en);
  body.addEventListener('collide', (e) => {
    if (en.dead) return;
    const other = bodyData.get(e.body.id);
    const iv = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (iv > 9.5 && e.body.mass > 1.5 && other && (other.kind === 'block' || other.kind === 'debris')) {
      damageEnemy(en, (iv - 8) * 3, new CANNON.Vec3(0, 4, 0));
    }
  });
  enemies.push(en);
  if (t.boss) { G.boss = en; G.bossActive = true; $('bossBar').style.display = 'block'; }
  return en;
}
function damageEnemy(en, dmg, impulse) {
  if (en.dead || G.state !== 'PLAYING') return;
  en.hp -= dmg;
  en.body.wakeUp();
  if (impulse) en.body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), en.body.position);
  particles.burst(en.body.position, en.t.color, 5, 5);
  AUDIO.hit();
  if (en.hp <= 0) killEnemy(en);
}
function killEnemy(en) {
  if (en.dead) return;
  en.dead = true;
  const v = en.body.velocity;
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > 12 && en.body.position.y > 2.5) ach('airborne');
  // scrap + combo
  G.combo = G.comboTimer > 0 ? G.combo + 1 : 1;
  G.comboTimer = 2.5;
  const mult = Math.min(3, 1 + 0.25 * (G.combo - 1));
  addScrap(Math.round(en.t.scrap * DIFFS[G.diff].scrap * mult));
  G.killsRun++;
  ach('first-blood');
  hitstop(en.t.boss ? 0.22 : 0.07);
  addShake(en.t.boss ? 1.2 : 0.3);
  AUDIO.thud();
  spawnRagdoll(en);
  despawnEnemy(en);
  if (en.t.boss) {
    G.bossActive = false; G.boss = null;
    $('bossBar').style.display = 'none';
    setTimeout(() => { if (G.state === 'PLAYING') victory(); }, 1400);
  }
  updateHud();
}
function despawnEnemy(en) {
  const i = enemies.indexOf(en);
  if (i >= 0) enemies.splice(i, 1);
  world.removeBody(en.body); untag(en.body);
  scene.remove(en.mesh);
}
function clearEntities() {
  for (const en of enemies.slice()) despawnEnemy(en);
  for (const r of ragdolls) removeRagdoll(r);
  ragdolls = [];
  for (const p of projectiles) { world.removeBody(p.body); untag(p.body); scene.remove(p.mesh); }
  projectiles = [];
  G.boss = null; G.bossActive = false;
  $('bossBar').style.display = 'none';
}

// ============================== ragdolls ==============================
function ragdollPart(pos, hx, hy, hz, mass, mat3, vel) {
  const mesh = new THREE.Mesh(boxGeo(hx * 2, hy * 2, hz * 2), mat3);
  mesh.castShadow = true;
  scene.add(mesh);
  const body = new CANNON.Body({
    mass, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
    position: new CANNON.Vec3(pos.x, pos.y, pos.z),
    collisionFilterGroup: GROUP.RAGDOLL,
    collisionFilterMask: GROUP.WORLD | GROUP.PLAYER | GROUP.ENEMY | GROUP.PROJ,
    linearDamping: 0.12, angularDamping: 0.3,
  });
  body.velocity.set(vel.x + rand(-2, 2), vel.y + rand(0, 3), vel.z + rand(-2, 2));
  body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
  body.allowSleep = true; body.sleepSpeedLimit = 0.35; body.sleepTimeLimit = 0.8;
  world.addBody(body); tag(body, 'ragdoll', null);
  return { mesh, body };
}
function spawnRagdoll(en) {
  if (ragdolls.length >= 6) { const old = ragdolls.shift(); removeRagdoll(old); }
  const s = en.t.scale;
  const p = en.body.position;
  const v = en.body.velocity;
  const mat3 = new THREE.MeshStandardMaterial({ color: en.t.color, roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.7 });
  const torso = ragdollPart({ x: p.x, y: p.y + 0.3 * s, z: p.z }, 0.35 * s, 0.45 * s, 0.22 * s, 4 * s, mat3, v);
  const head = ragdollPart({ x: p.x, y: p.y + 1.0 * s, z: p.z }, 0.24 * s, 0.24 * s, 0.24 * s, 1.2 * s, mat3, v);
  const armL = ragdollPart({ x: p.x - 0.55 * s, y: p.y + 0.3 * s, z: p.z }, 0.1 * s, 0.35 * s, 0.1 * s, 0.8 * s, dark, v);
  const armR = ragdollPart({ x: p.x + 0.55 * s, y: p.y + 0.3 * s, z: p.z }, 0.1 * s, 0.35 * s, 0.1 * s, 0.8 * s, dark, v);
  const legL = ragdollPart({ x: p.x - 0.2 * s, y: p.y - 0.5 * s, z: p.z }, 0.11 * s, 0.4 * s, 0.11 * s, 1.2 * s, dark, v);
  const legR = ragdollPart({ x: p.x + 0.2 * s, y: p.y - 0.5 * s, z: p.z }, 0.11 * s, 0.4 * s, 0.11 * s, 1.2 * s, dark, v);
  const cons = [];
  const cone = (a, b, pivA, pivB, angle) => {
    const c = new CANNON.ConeTwistConstraint(a.body, b.body, {
      pivotA: new CANNON.Vec3(...pivA), pivotB: new CANNON.Vec3(...pivB),
      axisA: CANNON.Vec3.UNIT_Y, axisB: CANNON.Vec3.UNIT_Y, angle, twistAngle: Math.PI / 4,
    });
    world.addConstraint(c); cons.push(c);
  };
  cone(torso, head, [0, 0.5 * s, 0], [0, -0.28 * s, 0], Math.PI / 5);
  cone(torso, armL, [-0.42 * s, 0.32 * s, 0], [0, 0.38 * s, 0], Math.PI / 2.5);
  cone(torso, armR, [0.42 * s, 0.32 * s, 0], [0, 0.38 * s, 0], Math.PI / 2.5);
  cone(torso, legL, [-0.2 * s, -0.5 * s, 0], [0, 0.43 * s, 0], Math.PI / 3);
  cone(torso, legR, [0.2 * s, -0.5 * s, 0], [0, 0.43 * s, 0], Math.PI / 3);
  ragdolls.push({ parts: [torso, head, armL, armR, legL, legR], cons, ttl: en.t.boss ? 12 : 7 });
}
function removeRagdoll(r) {
  for (const c of r.cons) world.removeConstraint(c);
  for (const part of r.parts) { world.removeBody(part.body); untag(part.body); scene.remove(part.mesh); }
}

// ============================== player damage ==============================
function damagePlayer(dmg) {
  if (G.state !== 'PLAYING' || dmg <= 0 || G.overFlag) return;
  if (player.hurtCd > 0) return;
  player.hurtCd = 0.35;
  G.hp -= dmg;
  G.dmgTakenWave += dmg;
  AUDIO.hurt();
  addShake(0.5);
  const v = $('dmgVignette');
  v.style.opacity = '1';
  setTimeout(() => { v.style.opacity = G.hp < G.maxHp * 0.25 ? '0.5' : '0'; }, 220);
  updateHud();
  if (G.hp <= 0) gameOver();
}

// ============================== waves ==============================
function waveComposition(n) {
  const dm = DIFFS[G.diff];
  const list = [];
  const c = Math.round((3 + n * 1.6) * dm.count);
  for (let i = 0; i < c; i++) list.push('grunt');
  if (n >= 3) for (let i = 0; i < Math.floor((n - 1) / 2); i++) list.push('brute');
  if (n >= 4) for (let i = 0; i < Math.floor(n / 3); i++) list.push('thrower');
  if (n === MAX_WAVE) { list.length = Math.min(list.length, 6); list.push('boss'); }
  // seeded shuffle
  const rng = G.rng;
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
function startWave(n) {
  G.wave = n;
  G.waveActive = true; G.waveCleared = false;
  G.dmgTakenWave = 0;
  G.spawnQueue = waveComposition(n);
  G.spawnTimer = 0.8;
  refillAmmo();
  // replenish some destruction
  if (blocks.length < 40 && n < MAX_WAVE && n > 1) {
    const rng = mulberry32(G.seed + n * 977);
    const pad = structurePads[Math.floor(rng() * structurePads.length)];
    buildStructure(rng, pad[0], pad[1]);
  }
  announce(n === MAX_WAVE ? 'FINAL WAVE — DEMOLITION KING' : `WAVE ${n}`);
  AUDIO.wave();
  updateHud();
  updateWeaponHud();
}
function spawnFromQueue(dt) {
  if (!G.spawnQueue.length) return;
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = G.spawnQueue[0] === 'boss' ? 2 : rand(0.7, 1.4);
    const type = G.spawnQueue.shift();
    const ang = rand(0, Math.PI * 2);
    const r = ARENA - 6;
    spawnEnemy(type, Math.cos(ang) * r, Math.sin(ang) * r);
    if (type === 'boss') { announce('DEMOLITION KING HAS ARRIVED'); addShake(1); AUDIO.boom(1.5); }
    updateHud();
  }
}
function checkWaveClear() {
  if (!G.waveActive || G.spawnQueue.length || enemies.length) return;
  G.waveActive = false;
  if (G.wave === MAX_WAVE) return; // victory path handled on boss kill
  G.waveCleared = true;
  if (G.dmgTakenWave <= 0) ach('untouchable');
  if (G.wave >= 5) ach('wave-5');
  G.meta.bestWave = Math.max(G.meta.bestWave, G.wave);
  announce('WAVE CLEARED — press E for shop');
  AUDIO.wave();
  saveGame();
  setTimeout(() => { if (G.state === 'PLAYING' && G.waveCleared) openShop(); }, 2600);
}

// enemy AI update
const tmpV = new THREE.Vector3();
function updateEnemies(dt) {
  const pp = player.body.position;
  for (const en of enemies) {
    en.animT += dt * 8;
    const b = en.body;
    const dx = pp.x - b.position.x, dz = pp.z - b.position.z;
    const dist = Math.hypot(dx, dz);
    const nx = dx / (dist || 1), nz = dz / (dist || 1);
    const spd = en.t.speed * (G.wave >= 7 ? 1.15 : 1);
    const wantRange = en.t.ranged && !en.t.boss ? 11 : 0;
    let mx = nx, mz = nz;
    if (dist < wantRange) { mx = -nx; mz = -nz; }
    b.velocity.x = lerp(b.velocity.x, mx * spd, 0.12);
    b.velocity.z = lerp(b.velocity.z, mz * spd, 0.12);
    // hop if stuck against something
    if (Math.hypot(b.velocity.x, b.velocity.z) < 0.7 && dist > 3 && Math.abs(b.velocity.y) < 0.5 && Math.random() < 0.03) b.velocity.y = 9;
    // melee contact damage
    en.atkCd -= dt;
    if (dist < en.radius + 1.35 && Math.abs(pp.y - b.position.y) < 2.2 && en.atkCd <= 0) {
      en.atkCd = 1.0;
      damagePlayer(en.t.dmg * DIFFS[G.diff].edmg);
      const kb = en.t.boss ? 18 : 9;
      player.body.velocity.x += nx * kb; player.body.velocity.y += 4; player.body.velocity.z += nz * kb;
    }
    // ranged throw
    if (en.t.ranged) {
      en.throwCd -= dt;
      if (en.throwCd <= 0 && dist > 5 && dist < 34) {
        en.throwCd = en.t.boss ? 2.2 : 3.2;
        const origin = new THREE.Vector3(b.position.x, b.position.y + 1.2 * en.t.scale, b.position.z);
        const dir = tmpV.set(pp.x - origin.x, (pp.y + 0.5 - origin.y) + dist * 0.28, pp.z - origin.z).normalize();
        fireProjectile({ id: 'eproj', mass: 2.5, speed: en.t.boss ? 26 : 20, radius: 0, kb: 8, dmg: 0 },
          origin, dir, true, en.t.dmg * DIFFS[G.diff].edmg * 0.8);
        AUDIO.tone(200, 0.15, 'triangle', 0.2, -60);
      }
    }
    // boss slam
    if (en.t.boss) {
      en.slamCd -= dt;
      if (en.slamCd <= 0 && dist < 9) {
        en.slamCd = 5;
        doExplosion(new CANNON.Vec3(b.position.x, 0.5, b.position.z), 8, 18 * DIFFS[G.diff].edmg, 20);
        announce('SLAM!');
      }
      $('bossHp').style.width = `${clamp(en.hp / en.maxHp, 0, 1) * 100}%`;
    }
    // mesh sync + walk anim
    en.mesh.position.set(b.position.x, b.position.y - en.radius, b.position.z);
    en.mesh.rotation.y = Math.atan2(nx, nz);
    const sw = Math.sin(en.animT) * 0.5;
    en.mesh.userData.legL.rotation.x = sw;
    en.mesh.userData.legR.rotation.x = -sw;
    en.mesh.userData.armL.rotation.x = -sw * 0.7;
    en.mesh.userData.armR.rotation.x = sw * 0.7;
  }
}

// ============================== juice ==============================
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }
function addShake(s) { if (G.shakeEnabled) G.shake = Math.min(1.6, G.shake + s); }
function announce(text) {
  const a = $('announcer');
  a.textContent = text;
  a.style.opacity = text ? '1' : '0';
  clearTimeout(a._t);
  a._t = setTimeout(() => { a.style.opacity = '0'; }, 1900);
}
let toastT = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.style.opacity = '0'; }, 2400);
}
function addScrap(n) {
  G.scrap += n;
  if (G.scrap >= 1000) ach('hoarder');
  updateHud();
}

// ============================== HUD ==============================
function updateHud() {
  $('hpText').textContent = `${Math.max(0, Math.ceil(G.hp))} / ${G.maxHp}`;
  const f = clamp(G.hp / G.maxHp, 0, 1);
  $('hpBar').style.width = `${f * 100}%`;
  $('hpBar').classList.toggle('low', f < 0.3);
  $('waveLabel').textContent = G.wave === MAX_WAVE ? 'BOSS WAVE' : `WAVE ${G.wave}`;
  $('waveSub').textContent = `enemies left: ${enemies.length + G.spawnQueue.length}`;
  $('scrapLabel').textContent = `⚙ ${G.scrap}`;
  $('coreLabel').textContent = `◆ ${G.meta.cores} cores`;
  $('comboLabel').textContent = G.combo > 1 ? `x${G.combo} COMBO` : '';
}
function updateWeaponHud() {
  const box = $('weaponBox');
  box.innerHTML = '';
  for (let i = 0; i < W.owned.length; i++) {
    const d = WEAPONS.find((w) => w.id === W.owned[i]);
    const el = document.createElement('div');
    el.className = 'wslot' + (i === W.cur ? ' active' : '');
    const ammo = d.mag === Infinity ? '∞' : (W.reloading > 0 && i === W.cur ? '...' : `${W.ammo[d.id] ?? 0}/${d.mag}`);
    el.innerHTML = `<div class="wkey">${d.key}</div><div class="wname">${d.name}</div><div class="wammo">${ammo}</div>`;
    box.appendChild(el);
  }
}

// ============================== camera ==============================
const rayResult = new CANNON.RaycastResult();
function updateCamera(dt) {
  const sens = player.aiming ? 0.0013 : 0.0022;
  player.yaw += mouseDX * sens;
  player.pitch -= mouseDY * sens; // mouse up (negative dy) => look up. NON-INVERTED.
  mouseDX = 0; mouseDY = 0;
  player.pitch = clamp(player.pitch, -1.35, 1.35);
  camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, -player.yaw, 0, 'YXZ'));
  const eye = tmpV.set(player.body.position.x, player.body.position.y + 1.15, player.body.position.z);
  let dist = player.firstPerson ? 0 : (player.aiming ? 3.2 : 6.5);
  camera.getWorldDirection(camDir);
  if (dist > 0) {
    // occlusion: pull camera in if blocked
    const from = new CANNON.Vec3(eye.x, eye.y, eye.z);
    const to = new CANNON.Vec3(eye.x - camDir.x * dist, eye.y - camDir.y * dist + 0.6, eye.z - camDir.z * dist);
    rayResult.reset();
    world.raycastClosest(from, to, { collisionFilterMask: GROUP.WORLD, skipBackfaces: true }, rayResult);
    if (rayResult.hasHit) dist = Math.max(1.2, rayResult.distance - 0.5);
  }
  camera.position.set(eye.x - camDir.x * dist, eye.y - camDir.y * dist + (dist > 0 ? 0.6 : 0), eye.z - camDir.z * dist);
  // shake
  if (G.shake > 0.001) {
    const s = G.shake * 0.14;
    camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    G.shake *= Math.pow(0.0009, dt);
  }
  // fov
  const targetFov = (player.aiming ? 52 : 75) + player.fovKick;
  player.fovKick = Math.max(0, player.fovKick - dt * 26);
  camera.fov = lerp(camera.fov, targetFov, 0.25);
  camera.updateProjectionMatrix();
  // player mesh
  player.mesh.visible = !player.firstPerson;
  player.mesh.position.set(player.body.position.x, player.body.position.y - 0.55, player.body.position.z);
  player.mesh.rotation.y = -player.yaw + Math.PI;
}

// ============================== movement ==============================
function updatePlayer(dt, gp) {
  const b = player.body;
  player.hurtCd = Math.max(0, player.hurtCd - dt);
  // ground check
  const from = new CANNON.Vec3(b.position.x, b.position.y, b.position.z);
  const to = new CANNON.Vec3(b.position.x, b.position.y - 0.95, b.position.z);
  rayResult.reset();
  world.raycastClosest(from, to, { collisionFilterMask: GROUP.WORLD | GROUP.ENEMY, skipBackfaces: true }, rayResult);
  player.grounded = rayResult.hasHit;
  // input
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (gp) { ix += gp.mx; iz -= gp.my; }
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const sprint = keys.ShiftLeft || keys.ShiftRight || (gp && gp.sprint);
  const speed = (sprint ? 10.5 : 7) * speedMult();
  const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = Math.sin(player.yaw);
  const wantX = (fx * iz + rx * ix) * speed;
  const wantZ = (fz * iz + rz * ix) * speed;
  const accel = player.grounded ? 0.22 : 0.06;
  b.velocity.x = lerp(b.velocity.x, wantX, accel);
  b.velocity.z = lerp(b.velocity.z, wantZ, accel);
  // jump
  if ((keys.Space || (gp && gp.jump)) && player.grounded) {
    b.velocity.y = 11;
    keys.Space = false;
    AUDIO.tone(300, 0.08, 'sine', 0.12, 120);
  }
  // fell out safety
  if (b.position.y < -8) { b.position.set(0, 3, ARENA - 8); b.velocity.set(0, 0, 0); }
  // fire / reload
  W.cd = Math.max(0, W.cd - dt);
  if (W.reloading > 0) {
    W.reloading -= dt;
    if (W.reloading <= 0) { const d = wDef(); W.ammo[d.id] = d.mag; W.reloading = 0; AUDIO.tone(500, 0.06, 'square', 0.12); }
    updateWeaponHud();
  }
  if (fireHeld || (gp && gp.fire)) tryFire();
  if (gp) {
    if (gp.aim) player.aiming = true;
    else if (!fireHeld && pad.wasAiming) player.aiming = false;
    pad.wasAiming = gp.aim;
    if (gp.cycleL) cycleWeapon(-1);
    if (gp.cycleR) cycleWeapon(1);
    if (gp.reload) startReload();
    if (gp.interact && G.waveCleared) openShop();
    if (gp.pause) setPause(true);
  }
}

// ============================== shop / meta UI ==============================
function openShop() {
  if (G.state !== 'PLAYING' || !G.waveCleared) return;
  G.state = 'SHOP';
  if (document.pointerLockElement) document.exitPointerLock();
  $('shop').classList.remove('hidden');
  $('shopTitle').textContent = `WAVE ${G.wave} CLEARED`;
  $('nextWaveNum').textContent = G.wave + 1;
  renderShop();
  saveGame();
  sendScreenshot();
}
function renderShop() {
  $('shopScrap').textContent = G.scrap;
  const grid = $('shopGrid');
  grid.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const lvl = G.upgrades[item.id] || 0;
    const ownedWeapon = item.weapon && W.owned.includes(item.weapon);
    const maxed = item.max && lvl >= item.max;
    const cost = item.cost(lvl);
    const card = document.createElement('div');
    card.className = 'shopCard' + (ownedWeapon || maxed ? ' owned' : '');
    const lvlTxt = item.max ? ` <span class="sub">(${lvl}/${item.max})</span>` : '';
    card.innerHTML = `<div class="t">${item.t}${lvlTxt}</div><div class="d">${item.d}</div>`;
    const btn = document.createElement('button');
    if (ownedWeapon || maxed) { btn.textContent = 'OWNED'; btn.disabled = true; }
    else {
      btn.innerHTML = `BUY — <span class="price">⚙ ${cost}</span>`;
      btn.disabled = G.scrap < cost || (item.can && !item.can());
      btn.onclick = () => {
        if (G.scrap < cost) return;
        G.scrap -= cost; G.spentRun += cost;
        if (G.spentRun >= 500) ach('big-spender');
        if (item.weapon) giveWeapon(item.weapon);
        else if (item.max) { G.upgrades[item.id] = lvl + 1; if (item.buy) item.buy(); }
        else if (item.buy) item.buy();
        AUDIO.buy();
        renderShop(); updateHud(); updateWeaponHud();
      };
    }
    card.appendChild(btn);
    grid.appendChild(card);
  }
}
$('btnNextWave').onclick = () => {
  $('shop').classList.add('hidden');
  G.state = 'PLAYING';
  startWave(G.wave + 1);
  canvas.requestPointerLock();
};
function renderMeta() {
  $('metaCores').textContent = G.meta.cores;
  const grid = $('metaGrid');
  grid.innerHTML = '';
  for (const item of META_ITEMS) {
    const lvl = G.meta.up[item.id] || 0;
    const maxed = lvl >= item.max;
    const cost = item.cost(lvl);
    const card = document.createElement('div');
    card.className = 'shopCard' + (maxed ? ' owned' : '');
    card.innerHTML = `<div class="t">${item.t} <span class="sub">(${lvl}/${item.max})</span></div><div class="d">${item.d}</div>`;
    const btn = document.createElement('button');
    if (maxed) { btn.textContent = 'MAXED'; btn.disabled = true; }
    else {
      btn.innerHTML = `BUY — <span style="color:var(--accent)">◆ ${cost}</span>`;
      btn.disabled = G.meta.cores < cost;
      btn.onclick = () => {
        if (G.meta.cores < cost) return;
        G.meta.cores -= cost;
        G.meta.up[item.id] = lvl + 1;
        AUDIO.buy();
        saveGame();
        renderMeta();
      };
    }
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

// ============================== inventory overlay ==============================
function toggleInv(open) {
  if (open && G.state !== 'PLAYING') return;
  if (!open && G.state !== 'PAUSED_INV') { $('inv').classList.add('hidden'); G.invOpen = false; return; }
  G.invOpen = open;
  $('inv').classList.toggle('hidden', !open);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    G.state = 'PAUSED_INV';
    const lines = [
      ['Difficulty', DIFFS[G.diff].label + (G.daily ? ' · DAILY' : '')],
      ['Wave', `${G.wave} / ${MAX_WAVE}`],
      ['Kills this run', G.killsRun],
      ['Blocks destroyed (run)', G.blocksRun],
      ['Scrap spent', G.spentRun],
      ['Damage mult', `${Math.round(dmgMult() * 100)}%`],
      ['Speed mult', `${Math.round(speedMult() * 100)}%`],
      ['Blast radius', `${Math.round(blastMult() * 100)}%`],
      ['Weapons', W.owned.map((id) => WEAPONS.find((w) => w.id === id).name).join(', ')],
    ];
    $('invBody').innerHTML = lines.map(([a, b]) => `<div class="statLine"><span>${a}</span><span>${b}</span></div>`).join('');
  } else {
    G.state = 'PLAYING';
    canvas.requestPointerLock();
  }
}
$('invBack').onclick = () => toggleInv(false);

// ============================== pause ==============================
function setPause(on) {
  if (on && (G.state === 'PLAYING' || G.state === 'PAUSED_INV')) {
    G.state = 'PAUSED';
    $('inv').classList.add('hidden'); G.invOpen = false;
    $('pause').classList.remove('hidden');
    $('pauseStats').textContent = `Wave ${G.wave} · ${G.killsRun} kills · ⚙ ${G.scrap}`;
    if (document.pointerLockElement) document.exitPointerLock();
    reportPlaytimeNow();
  }
}
function resumeGame() {
  if (G.state !== 'PAUSED') return;
  $('pause').classList.add('hidden');
  G.state = 'PLAYING';
  canvas.requestPointerLock();
}
$('btnResume').onclick = resumeGame;
$('btnRestart').onclick = () => { $('pause').classList.add('hidden'); startRun(G.daily); };
$('btnQuit').onclick = async () => {
  await saveGame();
  $('pause').classList.add('hidden');
  toMenu();
};
$('btnMusic').onclick = () => { AUDIO.musicOn = !AUDIO.musicOn; $('btnMusic').textContent = `MUSIC: ${AUDIO.musicOn ? 'ON' : 'OFF'}`; };
$('btnSfx').onclick = () => { AUDIO.sfxOn = !AUDIO.sfxOn; $('btnSfx').textContent = `SFX: ${AUDIO.sfxOn ? 'ON' : 'OFF'}`; };

// ============================== run lifecycle ==============================
function startRun(daily, resume = null) {
  AUDIO.init(); AUDIO.resume(); AUDIO.startMusic();
  G.daily = !!daily;
  if (resume) { G.seed = resume.seed; G.diff = resume.diff; G.daily = !!resume.daily; }
  else if (daily) { G.seed = (parseInt(todayKey(), 10) ^ 0x5f3759) >>> 0; G.diff = 'normal'; }
  else G.seed = (Math.random() * 1e9) >>> 0;
  G.rng = mulberry32(G.seed);
  buildArena(G.seed);
  spawnPlayer();
  // stats
  G.maxHp = 100 + 15 * (G.meta.up.m_hp || 0);
  G.hp = G.maxHp;
  G.scrap = 40 * (G.meta.up.m_scrap || 0);
  G.spentRun = 0; G.killsRun = 0; G.blocksRun = 0;
  G.combo = 0; G.comboTimer = 0; G.runTime = 0;
  G.upgrades = {};
  G.overFlag = false;
  G.shake = 0; G.hitstop = 0; G.timeScale = 1;
  W.owned = ['bolt']; W.cur = 0; W.ammo = { bolt: WEAPONS[0].mag }; W.reloading = 0; W.cd = 0;
  if (resume) {
    G.hp = resume.hp; G.maxHp = resume.maxHp; G.scrap = resume.scrap; G.spentRun = resume.spent || 0;
    G.upgrades = resume.upgrades || {};
    G.maxHp += 0; // maxHp already includes bought upgrades
    W.owned = resume.weapons && resume.weapons.length ? resume.weapons.slice() : ['bolt'];
    W.cur = 0; refillAmmo();
  }
  hideAllOverlays();
  $('hud').classList.remove('hidden');
  G.state = 'PLAYING';
  startWave(resume ? resume.wave : 1);
  canvas.requestPointerLock();
  updateHud(); updateWeaponHud();
  saveGame(); // checkpoint the run as soon as it starts
}
function hideAllOverlays() {
  for (const id of ['menu', 'metaMenu', 'howMenu', 'shop', 'pause', 'inv', 'endScreen']) $(id).classList.add('hidden');
  G.invOpen = false;
}
function endCores(win) {
  const dm = DIFFS[G.diff];
  return Math.max(1, Math.floor(G.wave * dm.cores) + (win ? 10 : 0));
}
function gameOver() {
  if (G.overFlag) return;
  G.overFlag = true;
  AUDIO.die(); AUDIO.stopMusic();
  addShake(1);
  const cores = endCores(false);
  G.meta.cores += cores;
  G.meta.bestWave = Math.max(G.meta.bestWave, G.wave);
  clearRunSave();
  setTimeout(() => {
    G.state = 'OVER';
    if (document.pointerLockElement) document.exitPointerLock();
    hideAllOverlays();
    $('endScreen').classList.remove('hidden');
    $('endTitle').textContent = 'RUN OVER';
    $('endTitle').style.color = 'var(--bad)';
    $('endBody').innerHTML =
      `<div class="statLine"><span>Reached wave</span><span>${G.wave}</span></div>
       <div class="statLine"><span>Kills</span><span>${G.killsRun}</span></div>
       <div class="statLine"><span>Blocks destroyed</span><span>${G.blocksRun}</span></div>
       <div class="statLine"><span>Cores earned</span><span>◆ ${cores}</span></div>`;
  }, 1100);
  reportPlaytimeNow();
}
function victory() {
  if (G.overFlag) return;
  G.overFlag = true;
  AUDIO.win(); AUDIO.stopMusic();
  ach('boss-slayer');
  if (G.diff === 'hard') ach('hard-boiled');
  if (G.daily) { ach('daily-driver'); G.meta.dailyDone[todayKey()] = true; }
  const cores = endCores(true);
  G.meta.cores += cores;
  G.meta.wins++;
  G.meta.bestWave = MAX_WAVE;
  clearRunSave();
  G.state = 'OVER';
  if (document.pointerLockElement) document.exitPointerLock();
  announce('');
  hideAllOverlays();
  $('endScreen').classList.remove('hidden');
  $('endTitle').textContent = 'DEMOLITION COMPLETE';
  $('endTitle').style.color = 'var(--good)';
  $('endBody').innerHTML =
    `<div class="sub" style="margin-bottom:8px">The Demolition King has been toppled${G.daily ? ' — daily challenge complete!' : ''}.</div>
     <div class="statLine"><span>Difficulty</span><span>${DIFFS[G.diff].label}${G.daily ? ' · DAILY' : ''}</span></div>
     <div class="statLine"><span>Kills</span><span>${G.killsRun}</span></div>
     <div class="statLine"><span>Blocks destroyed</span><span>${G.blocksRun}</span></div>
     <div class="statLine"><span>Cores earned</span><span>◆ ${cores}</span></div>`;
  reportPlaytimeNow();
}
$('btnEndMenu').onclick = () => { $('endScreen').classList.add('hidden'); toMenu(); };
$('btnEndRetry').onclick = () => { $('endScreen').classList.add('hidden'); startRun(G.daily); };
function toMenu() {
  G.state = 'MENU';
  AUDIO.stopMusic();
  hideAllOverlays();
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  clearEntities();
  refreshMenu();
  saveGame();
}

// ============================== save / load ==============================
let savedRun = null;
function serializeRun() {
  if (G.state === 'MENU' || G.overFlag || G.wave < 1) return savedRun;
  return {
    seed: G.seed, daily: G.daily, diff: G.diff,
    wave: G.waveCleared ? G.wave + 1 : G.wave,
    hp: Math.max(1, Math.round(G.hp)), maxHp: G.maxHp,
    scrap: G.scrap, spent: G.spentRun,
    upgrades: G.upgrades, weapons: W.owned.slice(),
  };
}
async function saveGame() {
  savedRun = serializeRun();
  const blob = { meta: G.meta, run: savedRun };
  try {
    await empire.saveState('auto', blob, {
      label: savedRun ? `Wave ${savedRun.wave} · ${DIFFS[savedRun.diff].label}` : 'Meta progress',
      playtimeSec: Math.round(G.runTime),
      progress: savedRun ? `Wave ${savedRun.wave}/${MAX_WAVE}` : `Best wave ${G.meta.bestWave}`,
      mode: G.daily ? 'daily' : 'standard',
      difficulty: G.diff,
      seed: G.seed,
    });
    empire.setContinuePoint('auto', savedRun ? `Wave ${savedRun.wave}` : 'Menu').catch(() => {});
  } catch { /* save unavailable */ }
}
function clearRunSave() { savedRun = null; saveGame(); }
async function loadGame() {
  try {
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) {
      if (rec.blob.meta) G.meta = { cores: 0, up: {}, blocksTotal: 0, bestWave: 0, wins: 0, dailyDone: {}, ...rec.blob.meta };
      savedRun = rec.blob.run || null;
    }
  } catch { /* fresh start */ }
}
window.__empireMigrate = (blob) => blob; // v1 only; accept as-is

let captureShot = false;
function sendScreenshot() { captureShot = true; }
function doScreenshot() {
  try {
    const c = document.createElement('canvas');
    const w = 512, h = Math.max(1, Math.round(512 * innerHeight / innerWidth));
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    empire.screenshot(c.toDataURL('image/jpeg', 0.7)).catch(() => {});
  } catch { /* ignore */ }
}

let playtimeAcc = 0;
function reportPlaytimeNow() {
  if (playtimeAcc >= 1) {
    empire.reportPlaytime(Math.round(playtimeAcc)).catch(() => {});
    playtimeAcc = 0;
  }
}
setInterval(reportPlaytimeNow, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.state === 'PLAYING') setPause(true); reportPlaytimeNow(); }
});

// ============================== menu wiring ==============================
for (const btn of document.querySelectorAll('.diffBtn')) {
  btn.onclick = () => {
    document.querySelectorAll('.diffBtn').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');
    G.diff = btn.dataset.diff;
    AUDIO.init(); AUDIO.tone(440, 0.05, 'square', 0.1);
  };
}
$('btnPlay').onclick = () => startRun(false);
$('btnDaily').onclick = () => startRun(true);
$('btnContinue').onclick = () => { if (savedRun) startRun(savedRun.daily, savedRun); };
$('btnUpgrades').onclick = () => { $('menu').classList.add('hidden'); $('metaMenu').classList.remove('hidden'); renderMeta(); };
$('metaBack').onclick = () => { $('metaMenu').classList.add('hidden'); $('menu').classList.remove('hidden'); refreshMenu(); };
$('btnHow').onclick = () => { $('menu').classList.add('hidden'); $('howMenu').classList.remove('hidden'); };
$('howBack').onclick = () => { $('howMenu').classList.add('hidden'); $('menu').classList.remove('hidden'); };
function refreshMenu() {
  $('btnContinue').classList.toggle('hidden', !savedRun);
  if (savedRun) $('btnContinue').textContent = `CONTINUE RUN — WAVE ${savedRun.wave} (${DIFFS[savedRun.diff].label}${savedRun.daily ? ' · DAILY' : ''})`;
  $('dailyTag').textContent = G.meta.dailyDone[todayKey()] ? '✓ done today' : `#${todayKey()}`;
  $('menuStats').textContent = `Best wave: ${G.meta.bestWave} · Wins: ${G.meta.wins} · Blocks smashed: ${G.meta.blocksTotal} · ◆ ${G.meta.cores} cores`;
}

// ============================== main loop ==============================
let menuAngle = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // hitstop
  if (G.hitstop > 0) { G.hitstop -= dt; G.timeScale = 0.07; }
  else G.timeScale = lerp(G.timeScale, 1, 0.2);

  if (G.state === 'PLAYING') {
    playtimeAcc += dt;
    G.runTime += dt;
    const sdt = dt * G.timeScale;
    const gp = pollGamepad(sdt);
    updatePlayer(sdt, gp);
    updateEnemies(sdt);
    spawnFromQueue(sdt);
    world.step(1 / 60, sdt, 4);
    // combo timer
    if (G.comboTimer > 0) { G.comboTimer -= sdt; if (G.comboTimer <= 0) { G.combo = 0; updateHud(); } }
    // projectiles
    for (const p of projectiles.slice()) {
      p.ttl -= sdt;
      if (p.ttl <= 0 && !p.dead) killProjectile(p, p.def.radius > 0);
      if (p.dead) {
        world.removeBody(p.body); untag(p.body); scene.remove(p.mesh);
        projectiles.splice(projectiles.indexOf(p), 1);
      } else {
        p.mesh.position.copy(p.body.interpolatedPosition);
      }
    }
    // debris ttl
    for (const dd of debris.slice()) {
      dd.ttl -= sdt;
      if (dd.ttl <= 0) {
        world.removeBody(dd.body); untag(dd.body); arenaGroup.remove(dd.mesh);
        debris.splice(debris.indexOf(dd), 1);
      } else {
        dd.mesh.position.copy(dd.body.interpolatedPosition);
        dd.mesh.quaternion.copy(dd.body.interpolatedQuaternion);
        if (dd.ttl < 1) dd.mesh.scale.setScalar(Math.max(0.05, dd.ttl));
      }
    }
    // ragdolls ttl
    for (const r of ragdolls.slice()) {
      r.ttl -= sdt;
      if (r.ttl <= 0) { removeRagdoll(r); ragdolls.splice(ragdolls.indexOf(r), 1); continue; }
      for (const part of r.parts) {
        part.mesh.position.copy(part.body.interpolatedPosition);
        part.mesh.quaternion.copy(part.body.interpolatedQuaternion);
        if (r.ttl < 1.2) part.mesh.scale.setScalar(Math.max(0.05, r.ttl / 1.2));
      }
    }
    // blocks sync (also prune dead entries safely)
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.dead) { blocks.splice(i, 1); continue; }
      b.mesh.position.copy(b.body.interpolatedPosition);
      b.mesh.quaternion.copy(b.body.interpolatedQuaternion);
    }
    checkWaveClear();
    updateCamera(dt);
    $('waveSub').textContent = `enemies left: ${enemies.length + G.spawnQueue.length}`;
  } else if (G.state === 'MENU' || G.state === 'OVER') {
    // idle orbit camera over the arena
    menuAngle += dt * 0.12;
    camera.position.set(Math.cos(menuAngle) * 34, 16, Math.sin(menuAngle) * 34);
    camera.lookAt(0, 2, 0);
    camera.fov = 60; camera.updateProjectionMatrix();
    world.step(1 / 60, dt, 2);
    for (const b of blocks) { if (!b.dead) { b.mesh.position.copy(b.body.position); b.mesh.quaternion.copy(b.body.quaternion); } }
  }
  // flash decay
  if (flashT > 0) { flashT -= dt; flash.intensity *= 0.78; if (flashT <= 0) flash.intensity = 0; }
  particles.update(dt);
  renderer.render(scene, camera);
  if (captureShot) { captureShot = false; doScreenshot(); }
}

// ============================== boot ==============================
(async () => {
  const init = await empire.connect().catch(() => null);
  if (init && init.settings) applySettings(init.settings);
  await loadGame();
  await loadPhysicsAsset();
  buildArena((Math.random() * 1e9) >>> 0); // pretty menu backdrop
  refreshMenu();
  requestAnimationFrame(frame);
})();
