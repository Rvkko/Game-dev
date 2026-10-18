// game.js — Depths of the Warden: TRUE-3D procedural dungeon RPG flagship.
// Engine: Three.js (WebGL) rendering + cannon-es 3D physics (walls, characters, ragdolls).
// Camera: third-person angled orbit, non-inverted look, pointer-lock mouse.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../../shared/empire-sdk.js';
import { InputManager } from '../../../shared/input.js';
import { makeRng, clamp, lerp, dist, angleTo, dailySeed, fmtTime, los } from './util.js';
import { TILE, generateFloor, wallRects, isBossFloor } from './dungeon.js';
import { rollItem, rarityInfo, itemTooltipLines, LEVELUP_CARDS, META_UPGRADES, metaCost, totalMetaRanks } from './items.js';
import { AudioSys } from './audio.js';

// ============================ constants ============================
const GAME_ID = 'dungeon-rpg';
const SAVE_VERSION = 1;
const MAX_FLOOR = 10;
const DAILY_MAX_FLOOR = 5;
const WALLH = 64;                 // wall height (px units; 1 tile = 48)
const GRAV = -980;                // px/s^2
const JUMP_V = 340;
const KV = 36;                    // knockback px/s per knock point

const G = { WALL: 1, PLAYER: 2, ENEMY: 4, RAGDOLL: 8, GROUND: 16 };

const DIFFS = {
  easy:   { label: 'Easy',   hp: 0.75, dmg: 0.7,  souls: 0.8, elite: 0 },
  normal: { label: 'Normal', hp: 1,    dmg: 1,    souls: 1,   elite: 0 },
  hard:   { label: 'Hard',   hp: 1.45, dmg: 1.35, souls: 1.5, elite: 0.08 },
};

const ENEMY_TYPES = {
  slime:    { name: 'Cave Slime',   hp: 20, dmg: 8,  speed: 58,  r: 13, xp: 6,  souls: 1, color: 0x5aa84a, minFloor: 1 },
  skeleton: { name: 'Skeleton',     hp: 28, dmg: 11, speed: 82,  r: 13, xp: 9,  souls: 1, color: 0xc8c2b0, minFloor: 1 },
  archer:   { name: 'Bone Archer',  hp: 22, dmg: 10, speed: 66,  r: 12, xp: 11, souls: 1, color: 0xa89a78, minFloor: 2 },
  brute:    { name: 'Crypt Brute',  hp: 66, dmg: 18, speed: 48,  r: 19, xp: 18, souls: 2, color: 0x8a5a3a, minFloor: 3 },
  wraith:   { name: 'Wraith',       hp: 32, dmg: 13, speed: 98,  r: 12, xp: 15, souls: 2, color: 0x7a8ac8, minFloor: 6 },
  butcher:  { name: 'The Bone Butcher', hp: 420, dmg: 22, speed: 62, r: 30, xp: 120, souls: 25, color: 0xd8c8a8, boss: true },
  warden:   { name: 'The Warden',   hp: 780, dmg: 26, speed: 66, r: 34, xp: 250, souls: 60, color: 0x9a6ae8, boss: true },
};

const ACH_TITLES = {
  'first-blood': 'First Blood', 'floor-5': 'Going Down', 'loot-hoarder': 'Loot Hoarder',
  'boss-slayer': 'Boss Slayer', 'untouchable': 'Untouchable', 'ragdoll-artist': 'Ragdoll Artist',
  'deep-delver': 'Deep Delver', 'century-slayer': 'Century Slayer', 'daily-grind': 'Daily Devotee',
  'dressed-to-kill': 'Dressed to Kill', 'ascended': 'Ascended', 'wardens-bane': "Warden's Bane",
};

const DEATH_TIPS = [
  'Dodge rolling (Ctrl / B) grants brief invulnerability — roll through attacks.',
  'Jumping (Space) clears shockwave rings and low projectiles.',
  'Potions (F) heal 40% of max HP. Watch the counter by your health bar.',
  'Brutes telegraph their charge — sidestep, then punish.',
  'Spend souls at the Soul Forge. Permanent upgrades carry across every run.',
  'Knockback shoves enemies into each other. The Maul excels at crowd control.',
  'Archers retreat when you close in. Corner them against walls.',
  'Healing fountains glow blue. Save them for after a hard room.',
  'Hold Right Mouse to aim, then Left Mouse fires a magic bolt (20 mana).',
];

// ============================ globals ============================
const canvas = document.getElementById('game');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const mapCv = document.getElementById('map-overlay');
const mapCtx = mapCv.getContext('2d');
let W = 0, H = 0;

const audio = new AudioSys();
const input = new InputManager({ target: window });
input.attach();

let sdk = null;
let hubSettings = null;
let localOverride = loadLocalOverride();
let effSettings = null;

let state = 'boot';
let hubPaused = false;

let meta = defaultMeta();
let run = null;
let currentRunSnapshot = null;
let floorData = null;
let world = null;                 // cannon-es world
let player = null;
let enemies = [];
let projectiles = [];
let ragdolls = [];
let dmgNumbers = [];
let groundItems = [];
let rings = [];
let lootRng = makeRng('loot' + Date.now());

let aimAngle = 0;                 // camera yaw / player facing (radians, xz-plane)
let camElev = 0.62;               // camera elevation angle
let camDist = 330;
let trauma = 0;
let hurtFlash = 0;
let slowmo = 0;
let deathTimer = -1;
let playtimeAcc = 0;
let saveBusy = false;
let achProgressCache = {};
let pendingLevelUps = 0;
let menuFD = null;                // floor shown behind main menu
let dungeonKit = null;
let dungeonPhysics = null;
let dungeonKitRadius = 0;
window.__dungeonAssetStatus = { loaded: false, attached: false, physics: false, error: '' };

// ============================ helpers ============================
function defaultMeta() {
  return {
    souls: 0,
    upgrades: {},
    stats: { kills: 0, deaths: 0, wins: 0, runs: 0, itemsCollected: 0, bestFloor: 0, dailyDone: {} },
    ach: {},
  };
}
function rank(id) { return meta.upgrades[id] || 0; }
function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function hideAllMenus() { for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden'); }
function loadLocalOverride() {
  try { return JSON.parse(localStorage.getItem('dungeonRpg.override')) || {}; } catch { return {}; }
}
function saveLocalOverride() {
  try { localStorage.setItem('dungeonRpg.override', JSON.stringify(localOverride)); } catch {}
}
/** logical xz-plane position of a cannon body (y = plane depth axis). */
function bp(body) { return { x: body.position.x, y: body.position.z }; }
function setVelXZ(body, vx, vz) { body.velocity.x = vx; body.velocity.z = vz; }

function applySettings() {
  const base = hubSettings || {};
  effSettings = {
    audio: { master: 0.8, music: 0.7, sfx: 0.9, muted: false, ...(base.audio || {}), ...(localOverride.audio || {}) },
    accessibility: {
      textScale: 1, reducedMotion: false, highContrast: false, screenShake: true,
      ...(base.accessibility || {}), ...(localOverride.accessibility || {}),
    },
    controls: base.controls || {},
  };
  audio.setVolumes({
    master: effSettings.audio.master, music: effSettings.audio.music,
    sfx: effSettings.audio.sfx, muted: effSettings.audio.muted,
  });
  document.documentElement.style.setProperty('--text-scale', effSettings.accessibility.textScale);
  input.applySettings(effSettings.controls);
  if (hemi) hemi.intensity = effSettings.accessibility.highContrast ? 1.05 : 0.5;
}

function toast(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = body || '';
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function ach(id, progress = 1) {
  if (meta.ach[id]) return;
  if (progress >= 1) {
    meta.ach[id] = true;
    toast('🏆 ' + (ACH_TITLES[id] || id), 'Achievement unlocked');
    audio.sfx('levelup');
  } else {
    if (achProgressCache[id] !== undefined && progress <= achProgressCache[id]) return;
    achProgressCache[id] = progress;
  }
  try { await sdk.unlockAchievement(id, Math.min(1, progress)); } catch {}
}

function shakeAmt() {
  const s = effSettings.accessibility;
  if (!s.screenShake) return 0;
  return s.reducedMotion ? 0.4 : 1;
}
function addTrauma(t) { trauma = clamp(trauma + t * shakeAmt(), 0, 1); }

// ============================ SDK / persistence ============================
window.__empireMigrate = (blob) => blob;

function thumbnail() {
  try {
    const tc = document.createElement('canvas');
    tc.width = 320; tc.height = 180;
    tc.getContext('2d').drawImage(renderer.domElement, 0, 0, 320, 180);
    return tc.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

async function writeSave(slot) {
  if (saveBusy) return;
  saveBusy = true;
  try {
    const blob = { meta, run: currentRunSnapshot };
    const m = {
      label: currentRunSnapshot
        ? `Floor ${currentRunSnapshot.floor} — ${DIFFS[currentRunSnapshot.difficulty].label}${currentRunSnapshot.daily ? ' (Daily)' : ''}`
        : `Soul Forge — ${meta.souls} souls`,
      playtimeSec: currentRunSnapshot ? currentRunSnapshot.playtimeSec : 0,
      progress: currentRunSnapshot ? currentRunSnapshot.floor / MAX_FLOOR : 0,
      mode: currentRunSnapshot && currentRunSnapshot.daily ? 'daily' : 'standard',
      difficulty: currentRunSnapshot ? currentRunSnapshot.difficulty : null,
      seed: currentRunSnapshot ? currentRunSnapshot.seed : null,
      thumbnail: (run && state !== 'menu') ? thumbnail() : null,
    };
    await sdk.saveState(slot, blob, m);
    if (slot === 'auto' && currentRunSnapshot) {
      try { await sdk.setContinuePoint('auto', m.label); } catch {}
    }
  } catch (e) { console.warn('save failed', e); }
  saveBusy = false;
}

function applyLoadedBlob(blob) {
  if (!blob) return false;
  if (blob.meta) meta = { ...defaultMeta(), ...blob.meta, stats: { ...defaultMeta().stats, ...(blob.meta.stats || {}) } };
  return true;
}

async function reportPlaytime(force = false) {
  if (playtimeAcc >= 30 || (force && playtimeAcc > 1)) {
    const s = Math.floor(playtimeAcc);
    playtimeAcc -= s;
    try { await sdk.reportPlaytime(s); } catch {}
  }
}

// ============================ player / stats ============================
function newPlayerState() {
  const p = {
    level: 1, xp: 0, gold: 0,
    potions: 1 + rank('flask'),
    hp: 0, mana: 0,
    maxHpBase: 100 + rank('vigor') * 15,
    dmgMult: 1 * (1 + rank('might') * 0.06),
    msMult: 1, bonusArmor: 0, bonusCrit: 0.05, bonusMana: 0,
    manaRegenMult: 1, knockMult: 1, bonusLifesteal: 0,
    inventory: [], equipment: { weapon: null, armor: null, trinket: null },
    reviveUsed: false,
    kills: 0, itemsCollected: 0,
  };
  if (rank('arsenal')) {
    p.equipment.weapon = rollItem(lootRng, 1, { slot: 'weapon', rarity: 'uncommon' });
  }
  const st = computeStats(p);
  p.hp = st.maxHp; p.mana = st.maxMana;
  return p;
}

const FISTS = { name: 'Fists', icon: '👊', dmg: 6, speed: 0.3, range: 56, arc: 1.7, knock: 5, slot: 'weapon', rarity: 'common', affixes: [] };

function computeStats(p) {
  const wpn = p.equipment.weapon || FISTS;
  let maxHp = p.maxHpBase, dmgPct = 0, crit = p.bonusCrit, ms = 0, armor = p.bonusArmor,
      lifesteal = p.bonusLifesteal, maxMana = 50 + p.bonusMana, goldMult = 1 + rank('fortune') * 0.12;
  for (const it of [p.equipment.weapon, p.equipment.armor, p.equipment.trinket]) {
    if (!it) continue;
    if (it.hp) maxHp += it.hp;
    if (it.armor) armor += it.armor;
    if (it.slot === 'trinket') {
      if (it.stat === 'crit') crit += it.val;
      if (it.stat === 'ms') ms += it.val;
      if (it.stat === 'mana') maxMana += it.val;
      if (it.stat === 'gold') goldMult += it.val;
      if (it.stat === 'lifesteal') lifesteal += it.val;
    }
    for (const a of it.affixes) {
      if (a.stat === 'hp') maxHp += a.val;
      if (a.stat === 'dmgPct') dmgPct += a.val / 100;
      if (a.stat === 'crit') crit += a.val / 100;
      if (a.stat === 'ms') ms += a.val / 100;
      if (a.stat === 'armor') armor += a.val;
      if (a.stat === 'lifesteal') lifesteal += a.val / 100;
    }
  }
  return {
    maxHp: Math.round(maxHp),
    dmg: Math.round(wpn.dmg * p.dmgMult * (1 + dmgPct)),
    weapon: wpn,
    crit: clamp(crit, 0, 0.75),
    speed: 168 * p.msMult * (1 + ms),
    armor,
    dmgReduction: armor / (armor + 60),
    maxMana: Math.round(maxMana),
    manaRegen: 6 * p.manaRegenMult,
    lifesteal: clamp(lifesteal, 0, 0.4),
    goldMult,
    knock: wpn.knock * p.knockMult,
    dodgeCd: 1.25 * (1 - rank('haste') * 0.12),
    xpMult: 1 + rank('insight') * 0.1,
  };
}
function playerStats() { return computeStats(player); }
function xpNeed(level) { return 28 + (level - 1) * 24; }

// ============================ THREE renderer / scene ============================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 10, 4000);
scene.background = new THREE.Color(0x0a0810);

const hemi = new THREE.HemisphereLight(0x8877aa, 0x120a1a, 0.5);
scene.add(hemi);
const playerLight = new THREE.PointLight(0xffd9a0, 1.6, 620, 1.4);
scene.add(playerLight);
const stairsLight = new THREE.PointLight(0xe8b64c, 1.4, 260, 1.4);
scene.add(stairsLight);

// Torch light pool (assigned to the nearest torches each frame)
const TORCH_LIGHTS = 6;
const torchLights = [];
for (let i = 0; i < TORCH_LIGHTS; i++) {
  const l = new THREE.PointLight(0xffb04a, 0, 300, 1.6);
  scene.add(l);
  torchLights.push(l);
}

let levelGroup = new THREE.Group();   // static level meshes (rebuilt per floor)
scene.add(levelGroup);
let fxGroup = new THREE.Group();      // dynamic meshes (entities, pickups, ragdolls)
scene.add(fxGroup);

function loadDungeonKit() {
  const GLTFLoader = window.THREE?.GLTFLoader;
  if (!GLTFLoader) { window.__dungeonAssetStatus.error = 'GLTFLoader unavailable'; return; }
  const loader = new GLTFLoader();
  Promise.all([
    fetch('../../assets/blender-kits/dungeon-rpg/physics.json').then((r) => r.ok ? r.json() : null).catch(() => null),
    new Promise((resolve, reject) => loader.load('../../assets/blender-kits/dungeon-rpg/dungeon-rpg-kit.glb', resolve, undefined, reject)),
  ]).then(([physics, gltf]) => {
    dungeonPhysics = physics;
    dungeonKit = gltf;
    dungeonKitRadius = physics?.playerCollider?.radius || 0;
    window.__dungeonAssetStatus.loaded = true;
    window.__dungeonAssetStatus.physics = !!physics?.playerCollider;
    if (player?.mesh) attachDungeonKit(player.mesh);
  }).catch((error) => { window.__dungeonAssetStatus.error = String(error?.message || error); });
}

function attachDungeonKit(target) {
  if (!dungeonKit || target.userData.dungeonAsset) return;
  const source = dungeonKit.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || dungeonKit.scene.getObjectByName('PLAYER_BODY');
  if (!source) return;
  const asset = source.clone(true);
  asset.name = 'BLENDER_PLAYER_ASSET';
  asset.scale.setScalar(18);
  asset.position.set(0, 0, 0);
  asset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
  target.children.forEach((child) => { if (child !== target.userData.shadow) child.visible = false; });
  target.add(asset);
  target.userData.dungeonAsset = asset;
  target.userData.assetRadius = dungeonKitRadius || 12;
  window.__dungeonAssetStatus.attached = true;
}

loadDungeonKit();

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  mapCv.width = W; mapCv.height = H;
}
window.addEventListener('resize', resize);
resize();

function matL(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
  g.clear();
}

// ============================ particles (THREE.Points) ============================
const PCAP = 700;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PCAP * 3);
const pCol = new Float32Array(PCAP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
const pPoints = new THREE.Points(pGeo, pMat);
pPoints.frustumCulled = false;
scene.add(pPoints);
const _pc = new THREE.Color();
const pool = [];
for (let i = 0; i < PCAP; i++) pool.push({ life: 0, x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, grav: 0 });
let pNext = 0;

function spawnParticle(x, h, z, vx, vy, vz, life, color, grav = 300) {
  const idx = pNext; pNext = (pNext + 1) % PCAP;
  const p = pool[idx];
  p.x = x; p.y = h; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.grav = grav;
  _pc.set(color);
  pCol[idx * 3] = _pc.r; pCol[idx * 3 + 1] = _pc.g; pCol[idx * 3 + 2] = _pc.b;
}

function bloodBurst(x, y, n, color) {
  if (effSettings.accessibility.reducedMotion) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 140;
    spawnParticle(x, 22 + Math.random() * 14, y, Math.cos(a) * sp, 60 + Math.random() * 130, Math.sin(a) * sp, 0.35 + Math.random() * 0.35, color, 600);
  }
}
function sparkleBurst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 80;
    spawnParticle(x, 8 + Math.random() * 24, y, Math.cos(a) * sp, 40 + Math.random() * 90, Math.sin(a) * sp, 0.5 + Math.random() * 0.5, color, 60);
  }
}

function updateParticles(dt) {
  for (let i = 0; i < PCAP; i++) {
    const p = pool[i];
    if (p.life <= 0) { pPos[i * 3 + 1] = -9999; continue; }
    p.life -= dt;
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 1) { p.y = 1; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
    pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// ============================ damage numbers (projected HTML) ============================
function pushDmgNumber(x, y, text, color, big) {
  const el = document.createElement('div');
  el.className = 'dmg-num' + (big ? ' big' : '');
  el.textContent = text;
  el.style.color = color;
  $('dmg-layer').appendChild(el);
  dmgNumbers.push({ el, x: x + (Math.random() - 0.5) * 14, z: y, h: 46, vh: 70, life: 0.85 });
}
const _v3 = new THREE.Vector3();
function updateDmgNumbers(dt) {
  for (const d of dmgNumbers) {
    d.life -= dt; d.h += d.vh * dt; d.vh *= 0.94;
    if (d.life <= 0) { d.el.remove(); continue; }
    _v3.set(d.x, d.h, d.z).project(camera);
    if (_v3.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    d.el.style.opacity = clamp(d.life / 0.5, 0, 1);
    d.el.style.transform = `translate(-50%,-50%) translate(${(_v3.x + 1) / 2 * W}px, ${(1 - _v3.y) / 2 * H}px)`;
  }
  dmgNumbers = dmgNumbers.filter(d => d.life > 0);
}
function clearDmgNumbers() { for (const d of dmgNumbers) d.el.remove(); dmgNumbers = []; }

// ============================ mesh builders ============================
function makeHpBarSprite(widthPx) {
  const cv = document.createElement('canvas'); cv.width = 40; cv.height = 6;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(widthPx, widthPx * 0.15, 1);
  sp.visible = false;
  return {
    sprite: sp,
    update(frac, elite) {
      c.clearRect(0, 0, 40, 6);
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, 40, 6);
      c.fillStyle = elite ? '#e8b64c' : '#c84a4a';
      c.fillRect(1, 1, 38 * clamp(frac, 0, 1), 4);
      tex.needsUpdate = true;
    },
  };
}

function buildPlayerMesh() {
  const g = new THREE.Group();
  const bodyMat = matL(0x3a5a9a);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(11, 14, 4, 10), bodyMat);
  torso.position.y = 21;
  const head = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 10), matL(0x5a7aba));
  head.position.y = 40;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 12), matL(0x0a1220));
  visor.position.set(6.5, 41, 0);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(3.5, 12, 8), matL(0xc84a4a));
  plume.position.y = 52;
  // sword arm pivot
  const arm = new THREE.Group();
  arm.position.set(0, 26, 11);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(34, 2.6, 2.6), matL(0xb8b8cc, { emissive: 0x222233 }));
  blade.position.x = 26;
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 6), matL(0x5a4a30));
  hilt.position.x = 7;
  arm.add(blade, hilt);
  arm.rotation.y = -0.4;
  // shadow blob
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(14, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.6;
  g.add(torso, head, visor, plume, arm, shadow);
  g.userData = { arm, blade, shadow, mats: [bodyMat] };
  return g;
}

function buildEnemyMesh(e) {
  const t = e.def;
  const g = new THREE.Group();
  const mats = [];
  const M = (c, o) => { const m = matL(c, o); mats.push(m); return m; };
  const r = e.r;

  if (e.type === 'slime') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), M(t.color));
    body.scale.y = 0.72; body.position.y = r * 0.7;
    g.add(body);
    g.userData.bodyMesh = body;
  } else if (e.type === 'wraith') {
    const m = M(t.color, { transparent: true, opacity: 0.72, emissive: 0x2a3a7a });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(r, r * 3, 10, 1, true), m);
    robe.position.y = r * 1.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), m);
    head.position.y = r * 3;
    g.add(robe, head);
    g.userData.headMesh = head;
    g.userData.floats = true;
  } else {
    const big = e.type === 'brute' || t.boss;
    const torso = new THREE.Mesh(
      big ? new THREE.BoxGeometry(r * 1.3, r * 1.7, r * 1.15) : new THREE.CapsuleGeometry(r * 0.72, r * 1.1, 4, 10),
      M(t.color));
    torso.position.y = r * 1.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 12, 10), M(t.color).clone());
    head.material.color.offsetHSL(0, 0, 0.08); mats.push(head.material);
    head.position.y = r * 2.35;
    g.add(torso, head);
    g.userData.headMesh = head;
    if (e.type === 'brute' || e.type === 'butcher') {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.7, 8), M(0xe8e0d0));
        horn.position.set(0, r * 2.7, s * r * 0.45);
        horn.rotation.x = s * 0.5;
        g.add(horn);
      }
    }
    if (e.type === 'archer') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 1.6, 6, 14, Math.PI), M(0x6a4a2a));
      bow.position.set(r * 0.9, r * 1.4, 0);
      bow.rotation.z = -Math.PI / 2;
      g.add(bow);
    }
    if (e.type === 'warden') {
      for (let i = -2; i <= 2; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(2.6, 13 + Math.abs(i) * -2 + 8, 6), M(0xc86aff, { emissive: 0x7a2ab8, emissiveIntensity: 0.8 }));
        spike.position.set(0, r * 2.75, i * 7);
        g.add(spike);
      }
    }
  }
  // eyes
  const eyeMat = matL(t.boss ? 0xff4a6a : 0x1a1220, t.boss ? { emissive: 0xff2244, emissiveIntensity: 1 } : {});
  const eyeY = e.type === 'slime' ? r * 0.9 : (g.userData.headMesh ? g.userData.headMesh.position.y : r);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(t.boss ? 3.4 : 2.2, 8, 6), eyeMat);
    eye.position.set(r * 0.5, eyeY, s * r * 0.28);
    g.add(eye);
  }
  // elite ring
  if (e.elite) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 6, 1.4, 6, 22), matL(0xe8b64c, { emissive: 0xe8b64c, emissiveIntensity: 0.9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4;
    g.add(ring);
    g.userData.eliteRing = ring;
  }
  // telegraph line (windup)
  const tele = new THREE.Mesh(new THREE.BoxGeometry(240, 1.5, 5), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.6 }));
  tele.position.set(120, 2, 0);
  tele.visible = false;
  g.add(tele);
  g.userData.tele = tele;
  // shadow blob
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.5;
  g.add(shadow);
  // hp bar
  const hpBar = makeHpBarSprite(r * 2.4);
  hpBar.sprite.position.y = e.type === 'slime' ? r * 1.8 : r * 3.1;
  g.add(hpBar.sprite);
  g.userData.hpBar = hpBar;
  g.userData.mats = mats;
  return g;
}

function buildGoldMesh() {
  const g = new THREE.Group();
  const m = matL(0xe8b64c, { emissive: 0x6a4a10, emissiveIntensity: 0.6 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6), m);
    c.position.set((i - 1) * 6, 4, (i % 2) * 5 - 2);
    g.add(c);
  }
  return g;
}
function buildPotionMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), matL(0xc83a5a, { emissive: 0x881122, emissiveIntensity: 0.5 }));
  b.position.y = 8;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 7, 8), matL(0x8a6a4a));
  neck.position.y = 17;
  g.add(b, neck);
  return g;
}
function buildChestMesh(theme) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 22), matL(0x7a5a30));
  base.position.y = 8;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 22), matL(0x9a7a44));
  lid.position.set(0, 18, 0);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 5), matL(0xe8b64c, { emissive: 0x6a4a10, emissiveIntensity: 0.7 }));
  clasp.position.set(14, 12, 0);
  g.add(base, lid, clasp);
  g.userData.lid = lid;
  return g;
}
function buildFountainMesh() {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 10, 14), matL(0x3a4a5a));
  rim.position.y = 5;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 2, 14), matL(0x5ac8e8, { emissive: 0x2a8aaa, emissiveIntensity: 0.9 }));
  water.position.y = 10.5;
  g.add(rim, water);
  g.userData.water = water;
  return g;
}
function buildStairsMesh(locked, theme) {
  const g = new THREE.Group();
  const pit = new THREE.Mesh(new THREE.BoxGeometry(46, 4, 46), matL(0x05030a));
  pit.position.y = 2;
  const col = locked ? 0x7a2a3a : 0xe8b64c;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(26, 2.4, 6, 4), matL(col, { emissive: col, emissiveIntensity: 0.9 }));
  frame.rotation.x = Math.PI / 2;
  frame.rotation.z = Math.PI / 4;
  frame.position.y = 5;
  // descending steps illusion
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(34 - i * 9, 2, 34 - i * 9), matL(0x141020));
    step.position.y = 4.5 - i * 1.6;
    g.add(step);
  }
  g.add(pit, frame);
  g.userData.frame = frame;
  return g;
}
function buildItemMesh(item) {
  const r = rarityInfo(item.rarity);
  const col = new THREE.Color(r.color);
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(9), matL(col, { emissive: col, emissiveIntensity: 0.85 }));
  gem.position.y = 16;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(12, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.8;
  g.add(gem, glow);
  g.userData.gem = gem;
  return g;
}

// ============================ floor visuals + physics ============================
let viz = null; // { torchFlames:[], chestMeshes:[], goldMeshes:Map, potionMeshes:Map, fountainMesh, stairsMesh, torches:[] }

function buildFloorVisuals(fd) {
  disposeGroup(levelGroup);
  disposeGroup(fxGroup);
  clearDmgNumbers();
  viz = { torchFlames: [], chestMeshes: [], goldMeshes: new Map(), potionMeshes: new Map(), fountainMesh: null, stairsMesh: null, decals: [], swingArcs: [] };

  const th = fd.theme;
  scene.background = new THREE.Color(th.wall).multiplyScalar(0.5);
  scene.fog = new THREE.Fog(scene.background, 500, 1900);

  // --- floor tiles (instanced) ---
  const floorTiles = [];
  for (let y = 0; y < fd.h; y++) for (let x = 0; x < fd.w; x++) if (fd.grid[y * fd.w + x] === 1) floorTiles.push([x, y]);
  const tileGeo = new THREE.BoxGeometry(TILE, 8, TILE);
  const tileMesh = new THREE.InstancedMesh(tileGeo, matL(0xffffff), floorTiles.length);
  const m4 = new THREE.Matrix4();
  const c1 = new THREE.Color(th.floor), c2 = new THREE.Color(th.floor2);
  floorTiles.forEach(([x, y], i) => {
    m4.setPosition(x * TILE + TILE / 2, -4, y * TILE + TILE / 2);
    tileMesh.setMatrixAt(i, m4);
    tileMesh.setColorAt(i, (x + y) % 2 === 0 ? c1 : c2);
  });
  tileMesh.instanceColor.needsUpdate = true;
  levelGroup.add(tileMesh);

  // --- walls (instanced from merged rects) ---
  const rects = wallRects(fd.grid, fd.w, fd.h);
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMesh = new THREE.InstancedMesh(wallGeo, matL(0xffffff), rects.length);
  const wc = new THREE.Color(th.wallTop);
  rects.forEach((r, i) => {
    m4.makeScale(r.w, WALLH, r.h);
    m4.setPosition(r.x, WALLH / 2, r.y);
    wallMesh.setMatrixAt(i, m4);
    wallMesh.setColorAt(i, wc);
  });
  wallMesh.instanceColor.needsUpdate = true;
  levelGroup.add(wallMesh);

  // --- torches ---
  const flameGeo = new THREE.ConeGeometry(4.5, 13, 8);
  const flameMat = matL(th.torch, { emissive: th.torch, emissiveIntensity: 1.4 });
  const stickMat = matL(0x5a4a3a);
  for (const t of fd.torches) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 16, 6), stickMat);
    stick.position.set(t.x, 38, t.y);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(t.x, 50, t.y);
    levelGroup.add(stick, flame);
    viz.torchFlames.push({ flame, t });
  }

  // --- stairs ---
  viz.stairsMesh = buildStairsMesh(fd.boss && !fd.bossDefeated, th);
  viz.stairsMesh.position.set(fd.stairs.x, 0, fd.stairs.y);
  levelGroup.add(viz.stairsMesh);
  stairsLight.position.set(fd.stairs.x, 40, fd.stairs.y);
  stairsLight.color.set(fd.boss && !fd.bossDefeated ? 0xaa3050 : 0xe8b64c);

  // --- chests / fountain / gold / potions ---
  for (const c of fd.chests) {
    const mesh = buildChestMesh(th);
    mesh.position.set(c.x, 0, c.y);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    levelGroup.add(mesh);
    viz.chestMeshes.push({ c, mesh });
  }
  if (fd.fountain) {
    viz.fountainMesh = buildFountainMesh();
    viz.fountainMesh.position.set(fd.fountain.x, 0, fd.fountain.y);
    levelGroup.add(viz.fountainMesh);
  }
  for (const gp of fd.goldPiles) addGoldMesh(gp);
  for (const pt of fd.potions) addPotionMesh(pt);
}

function addGoldMesh(gp) {
  if (!viz || viz.goldMeshes.has(gp)) return;
  const mesh = buildGoldMesh();
  mesh.position.set(gp.x, 0, gp.y);
  fxGroup.add(mesh);
  viz.goldMeshes.set(gp, mesh);
}
function addPotionMesh(pt) {
  if (!viz || viz.potionMeshes.has(pt)) return;
  const mesh = buildPotionMesh();
  mesh.position.set(pt.x, 0, pt.y);
  fxGroup.add(mesh);
  viz.potionMeshes.set(pt, mesh);
}
function addDecal(x, y, r) {
  if (!viz) return;
  const d = new THREE.Mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: 0x5a0f14, transparent: true, opacity: 0.4 }));
  d.rotation.x = -Math.PI / 2;
  d.position.set(x, 1 + Math.random() * 0.4, y);
  fxGroup.add(d);
  viz.decals.push(d);
  if (viz.decals.length > 40) {
    const old = viz.decals.shift();
    fxGroup.remove(old); old.geometry.dispose(); old.material.dispose();
  }
}

function buildFloorPhysics(fd) {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAV, 0) });
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.12;
  world.defaultContactMaterial.restitution = 0.05;
  // ground
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: G.GROUND | G.WALL, collisionFilterMask: -1 });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // walls
  for (const r of wallRects(fd.grid, fd.w, fd.h)) {
    const b = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(r.w / 2, WALLH, r.h / 2)),
      position: new CANNON.Vec3(r.x, WALLH, r.y),
      collisionFilterGroup: G.WALL, collisionFilterMask: -1,
    });
    world.addBody(b);
  }
  // outer bounds
  const bw = fd.w * TILE, bh = fd.h * TILE;
  for (const [x, z, hx, hz] of [[bw / 2, -TILE, bw / 2 + TILE, TILE], [bw / 2, bh + TILE, bw / 2 + TILE, TILE], [-TILE, bh / 2, TILE, bh / 2 + TILE], [bw + TILE, bh / 2, TILE, bh / 2 + TILE]]) {
    world.addBody(new CANNON.Body({
      mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, WALLH * 2, hz)),
      position: new CANNON.Vec3(x, WALLH, z),
      collisionFilterGroup: G.WALL, collisionFilterMask: -1,
    }));
  }
}

function makeCharBody(x, y, r, group, mask, mass) {
  const b = new CANNON.Body({
    mass,
    shape: new CANNON.Sphere(r),
    position: new CANNON.Vec3(x, r + 0.5, y),
    fixedRotation: true,
    linearDamping: 0.01,
    collisionFilterGroup: group,
    collisionFilterMask: mask,
  });
  b.allowSleep = false;
  world.addBody(b);
  return b;
}

// ============================ run / floor lifecycle ============================
function startRun(difficulty, daily, fromSnapshot = null) {
  hideAllMenus();
  pendingLevelUps = 0;
  lootRng = makeRng('loot:' + Date.now() + Math.random());
  if (fromSnapshot) {
    run = {
      seed: fromSnapshot.seed, daily: fromSnapshot.daily, difficulty: fromSnapshot.difficulty,
      floor: fromSnapshot.floor, souls: fromSnapshot.souls, playtimeSec: fromSnapshot.playtimeSec,
      startedAt: Date.now(),
    };
    player = { ...newPlayerState(), ...fromSnapshot.player };
    player.equipment = { weapon: null, armor: null, trinket: null, ...(fromSnapshot.player.equipment || {}) };
    player.inventory = fromSnapshot.player.inventory || [];
  } else {
    const seed = daily ? dailySeed() : String(Math.floor(Math.random() * 1e9));
    run = { seed, daily, difficulty: daily ? 'normal' : difficulty, floor: 1, souls: 0, playtimeSec: 0, startedAt: Date.now() };
    player = newPlayerState();
    meta.stats.runs++;
  }
  menuFD = null;
  state = 'playing';
  enterFloor(run.floor);
  show('hud'); show('crosshair'); show('vignette');
  lockPointer();
  audio.music(isBossFloor(run.floor) ? 'boss' : 'dungeon');
}

function serializePlayer() {
  const { body, mesh, ...rest } = player;
  return JSON.parse(JSON.stringify(rest));
}
function makeSnapshot() {
  return {
    seed: run.seed, daily: run.daily, difficulty: run.difficulty, floor: run.floor,
    souls: run.souls, playtimeSec: run.playtimeSec, player: serializePlayer(),
  };
}

let explored = null;
function enterFloor(floor) {
  run.floor = floor;
  meta.stats.bestFloor = Math.max(meta.stats.bestFloor, floor);
  floorData = generateFloor(run.seed, floor);
  explored = new Uint8Array(floorData.w * floorData.h);

  buildFloorPhysics(floorData);
  buildFloorVisuals(floorData);

  // player body + mesh
  player.body = makeCharBody(floorData.spawn.x, floorData.spawn.y, 14, G.PLAYER, G.WALL | G.GROUND | G.ENEMY, 5);
  player.mesh = buildPlayerMesh();
  attachDungeonKit(player.mesh);
  fxGroup.add(player.mesh);
  player.iframes = 0; player.attackCd = 0; player.dodgeCdT = 0; player.swingT = 0;
  player.dodgeT = 0; player.floorDamaged = false;

  enemies = []; projectiles = []; ragdolls = []; groundItems = []; rings = [];

  const diff = DIFFS[run.difficulty];
  const hpScale = (1 + (floor - 1) * 0.22) * diff.hp;
  const dmgScale = (1 + (floor - 1) * 0.12) * diff.dmg;

  const allowed = Object.entries(ENEMY_TYPES).filter(([k, t]) => !t.boss && (t.minFloor || 1) <= floor).map(([k]) => k);
  const spawnRng = makeRng(run.seed + ':spawn:' + floor);
  for (const s of floorData.enemySpawns) {
    const type = spawnRng.pick(allowed);
    const elite = s.elite || spawnRng.chance(diff.elite);
    spawnEnemy(type, s.x, s.y, hpScale, dmgScale, elite);
  }
  if (floorData.boss) {
    const bossType = floor === 5 ? 'butcher' : 'warden';
    spawnEnemy(bossType, floorData.bossSpawn.x, floorData.bossSpawn.y, hpScale, dmgScale, false);
    audio.sfx('bossroar');
  }
  aimAngle = angleTo(floorData.spawn.x, floorData.spawn.y, floorData.stairs.x, floorData.stairs.y);

  currentRunSnapshot = makeSnapshot();
  writeSave('auto');
  ach('floor-5', floor / 5);

  const b = $('floor-banner');
  const nb = b.cloneNode(false);
  nb.textContent = `FLOOR ${floor} — ${floorData.name.toUpperCase()}`;
  nb.classList.remove('hidden');
  b.replaceWith(nb);
  audio.music(floorData.boss ? 'boss' : 'dungeon');
  audio.sfx('stairs');
}

function spawnEnemy(type, x, y, hpScale, dmgScale, elite) {
  const t = ENEMY_TYPES[type];
  const size = t.r * (elite ? 1.28 : 1);
  const e = {
    type, def: t, elite,
    hp: Math.round(t.hp * hpScale * (elite ? 2.2 : 1)),
    maxHp: Math.round(t.hp * hpScale * (elite ? 2.2 : 1)),
    dmg: Math.round(t.dmg * dmgScale * (elite ? 1.4 : 1)),
    speed: t.speed * (elite ? 1.1 : 1),
    r: size,
    aggro: false, attackCd: 0, shootCd: 1 + Math.random(),
    mode: 'chase', modeT: 0, stuckT: 0, detour: null, detourT: 0, tpCd: 0,
    flash: 0, bob: Math.random() * 10,
    phase: 0, patternT: 2,
  };
  e.body = makeCharBody(x, y, size, G.ENEMY, G.WALL | G.GROUND | G.PLAYER | G.ENEMY, t.boss ? 40 : 8);
  e.mesh = buildEnemyMesh(e);
  fxGroup.add(e.mesh);
  enemies.push(e);
  return e;
}

// ============================ combat ============================
function damageEnemy(e, amount, isCrit, dir, knock) {
  e.hp -= amount;
  e.aggro = true;
  e.flash = 0.13;
  const ep = bp(e.body);
  pushDmgNumber(ep.x, ep.y, String(Math.round(amount)), isCrit ? '#ffd24c' : '#fff', isCrit);
  bloodBurst(ep.x, ep.y, isCrit ? 14 : 7, e.def.boss ? 0x7a2a5a : 0xa82a2a);
  if (knock && !e.def.boss) {
    e.body.velocity.x += Math.cos(dir) * knock * KV * 0.6;
    e.body.velocity.z += Math.sin(dir) * knock * KV * 0.6;
    e.body.velocity.y += knock * 6;
  }
  audio.sfx(isCrit ? 'crit' : 'hit', { pitch: 0.9 + Math.random() * 0.25 });
  addTrauma(isCrit ? 0.22 : 0.1);
  if (e.hp <= 0) killEnemy(e, dir, knock || 6);
}

function removeEnemy(e) {
  world.removeBody(e.body);
  fxGroup.remove(e.mesh);
  disposeGroup(e.mesh);
  enemies = enemies.filter(x => x !== e);
}

function killEnemy(e, dir, knock) {
  const st = playerStats();
  const pos = bp(e.body);
  removeEnemy(e);
  spawnRagdoll(pos.x, pos.y, e.r, e.def.color, dir, knock * (e.def.boss ? 0.4 : 1));
  audio.sfx('enemydie', { pitch: e.def.boss ? 0.5 : (0.85 + Math.random() * 0.3) });
  addDecal(pos.x, pos.y, e.r * 1.6);

  const diff = DIFFS[run.difficulty];
  player.kills++; meta.stats.kills++;
  run.souls += Math.round(e.def.souls * (e.elite ? 3 : 1) * diff.souls);
  gainXp(Math.round(e.def.xp * (e.elite ? 2.5 : 1) * st.xpMult));
  const goldDrop = Math.round((2 + Math.random() * 5 + run.floor) * (e.elite ? 3 : 1) * st.goldMult);
  const gp = { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20, amount: goldDrop };
  floorData.goldPiles.push(gp); addGoldMesh(gp);
  if (Math.random() < 0.08) { const pt = { x: pos.x, y: pos.y }; floorData.potions.push(pt); addPotionMesh(pt); }
  if (e.elite || Math.random() < 0.06) {
    dropItem(pos.x, pos.y, rollItem(lootRng, run.floor, { boost: e.elite ? 0.5 : 0.15 }));
  }
  if (e.def.boss) onBossKilled(e, pos);

  if (meta.stats.kills === 1 || !meta.ach['first-blood']) ach('first-blood');
  ach('century-slayer', meta.stats.kills / 100);
}

function onBossKilled(e, pos) {
  addTrauma(0.8);
  audio.sfx('bossroar');
  ach('boss-slayer');
  for (let i = 0; i < 3; i++) {
    dropItem(pos.x + (Math.random() - 0.5) * 90, pos.y + (Math.random() - 0.5) * 90,
      rollItem(lootRng, run.floor, { boost: 0.9 }));
  }
  const gp = { x: pos.x, y: pos.y, amount: 60 + run.floor * 10 };
  floorData.goldPiles.push(gp); addGoldMesh(gp);
  hideBossBar();
  if (e.type === 'warden') {
    setTimeout(() => winRun(false), 1400);
  } else if (run.daily) {
    setTimeout(() => winRun(true), 1400);
  } else {
    floorData.bossDefeated = true;
    if (viz && viz.stairsMesh) {
      viz.stairsMesh.userData.frame.material.color.set(0xe8b64c);
      viz.stairsMesh.userData.frame.material.emissive.set(0xe8b64c);
      stairsLight.color.set(0xe8b64c);
    }
    toast('The way opens', 'Stairs to the next floor are unlocked.');
  }
}

function dropItem(x, y, item) {
  const gi = { x, y, item, bob: Math.random() * 10, mesh: buildItemMesh(item) };
  gi.mesh.position.set(x, 0, y);
  fxGroup.add(gi.mesh);
  groundItems.push(gi);
}
function removeGroundItem(gi) {
  fxGroup.remove(gi.mesh); disposeGroup(gi.mesh);
  groundItems = groundItems.filter(g2 => g2 !== gi);
}

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= xpNeed(player.level)) {
    player.xp -= xpNeed(player.level);
    player.level++;
    pendingLevelUps++;
    audio.sfx('levelup');
    addTrauma(0.15);
    const pp = bp(player.body);
    sparkleBurst(pp.x, pp.y, 20, 0xa8e86a);
  }
  if (pendingLevelUps > 0 && state === 'playing') openLevelUp();
}

function damagePlayer(amount, sourceName, dir) {
  if (player.iframes > 0 || state !== 'playing') return;
  const st = playerStats();
  const real = Math.max(1, Math.round(amount * (1 - st.dmgReduction)));
  player.hp -= real;
  player.iframes = 0.55;
  player.floorDamaged = true;
  player.lastHitBy = sourceName;
  hurtFlash = 0.35;
  addTrauma(0.35);
  audio.sfx('hurt');
  const pp = bp(player.body);
  bloodBurst(pp.x, pp.y, 8, 0xc83a3a);
  pushDmgNumber(pp.x, pp.y, '-' + real, '#ff8a8a', false);
  if (dir !== undefined) {
    player.body.velocity.x += Math.cos(dir) * 240;
    player.body.velocity.z += Math.sin(dir) * 240;
  }
  if (player.hp <= 0) {
    if (rank('resolve') && !player.reviveUsed) {
      player.reviveUsed = true;
      player.hp = Math.round(st.maxHp * 0.5);
      player.iframes = 2;
      toast('🕯️ Resolve', 'Death defied — once per run.');
      audio.sfx('fountain');
      sparkleBurst(pp.x, pp.y, 26, 0xe8b64c);
    } else {
      startDeath();
    }
  }
}

function startDeath() {
  state = 'dying';
  slowmo = 1.4;
  deathTimer = 1.5;
  audio.sfx('die');
  addTrauma(1);
  const pp = bp(player.body);
  spawnRagdoll(pp.x, pp.y, 15, 0x4a6aa8, Math.random() * Math.PI * 2, 9);
  world.removeBody(player.body);
  player.mesh.visible = false;
  unlockPointer();
  audio.music(null);
}

function finishDeath() {
  meta.stats.deaths++;
  const earned = Math.max(3, run.souls);
  meta.souls += earned;
  const killer = player.lastHitBy || 'the dungeon';
  const tip = DEATH_TIPS[Math.floor(Math.random() * DEATH_TIPS.length)];
  currentRunSnapshot = null;
  writeSave('auto');
  reportPlaytime(true);
  state = 'dead';
  hide('hud'); hide('crosshair');
  $('death-info').innerHTML =
    `Slain by <b></b> on floor <b>${run.floor}</b><br>` +
    `${player.kills} kills · ${fmtTime(run.playtimeSec)} · level ${player.level}` +
    `<span class="souls-earned">✦ +${earned} souls banked</span>` +
    `<span class="death-tip"></span>`;
  $('death-info').querySelector('b').textContent = killer;
  $('death-info').querySelector('.death-tip').textContent = 'Tip: ' + tip;
  const btns = $('death-btns');
  btns.innerHTML = '';
  btns.append(
    mkBtn('Retry ' + DIFFS[run.difficulty].label + (run.daily ? ' Daily' : ''), () => {
      const d = run.daily; const df = run.difficulty;
      startRun(df, d);
    }),
    mkBtn('Soul Forge', () => { openShop('menu-death'); }),
    mkBtn('Main Menu', () => { toMenu(); }),
  );
  show('menu-death');
  focusMenu('menu-death');
}

function winRun(isDaily) {
  if (state === 'win') return;
  const bonus = isDaily ? 50 : 100;
  const earned = run.souls + bonus;
  meta.souls += earned;
  meta.stats.wins++;
  if (isDaily) {
    meta.stats.dailyDone[run.seed] = true;
    ach('daily-grind');
  } else {
    ach('deep-delver');
    if (run.difficulty === 'hard') ach('wardens-bane');
  }
  currentRunSnapshot = null;
  writeSave('auto');
  reportPlaytime(true);
  state = 'win';
  audio.music(null);
  audio.sfx('win');
  hide('hud'); hide('crosshair');
  unlockPointer();
  $('win-info').innerHTML =
    (isDaily ? `<b>Daily challenge complete!</b> The Bone Butcher lies broken.<br>` :
      `The dungeon's master is destroyed. You have conquered all ${MAX_FLOOR} floors.<br>`) +
    `${player.kills} kills · ${fmtTime(run.playtimeSec)} · level ${player.level} · ${DIFFS[run.difficulty].label}` +
    `<span class="souls-earned">✦ +${earned} souls banked</span>`;
  const btns = $('win-btns');
  btns.innerHTML = '';
  btns.append(
    mkBtn('New Run', () => { hideAllMenus(); openDifficulty(); }),
    mkBtn('Soul Forge', () => { openShop('menu-win'); }),
    mkBtn('Main Menu', () => { toMenu(); }),
  );
  show('menu-win');
  focusMenu('menu-win');
}

// ============================ 3D ragdolls (cannon-es) ============================
function spawnRagdoll(x, y, size, color, dir, impulse) {
  if (ragdolls.length >= 8) destroyRagdoll(ragdolls.shift());
  const s = size / 14;
  const filt = { collisionFilterGroup: G.RAGDOLL, collisionFilterMask: G.WALL | G.GROUND | G.RAGDOLL };
  const parts = [];   // { body, mesh }
  const cons = [];
  const baseCol = new THREE.Color(color);
  const headCol = baseCol.clone().offsetHSL(0, 0, 0.1);

  const mkPart = (shape, px, py, pz, mass, geo, col) => {
    const body = new CANNON.Body({
      mass, shape, position: new CANNON.Vec3(px, py, pz),
      angularDamping: 0.35, linearDamping: 0.06, ...filt,
    });
    world.addBody(body);
    const mesh = new THREE.Mesh(geo, matL(col, { transparent: true }));
    fxGroup.add(mesh);
    parts.push({ body, mesh });
    return body;
  };

  const torso = mkPart(new CANNON.Box(new CANNON.Vec3(7 * s, 10 * s, 4.5 * s)), x, 30 * s, y, 3,
    new THREE.BoxGeometry(14 * s, 20 * s, 9 * s), baseCol);
  const head = mkPart(new CANNON.Sphere(6 * s), x, 46 * s, y, 1,
    new THREE.SphereGeometry(6 * s, 10, 8), headCol);
  const armL = mkPart(new CANNON.Box(new CANNON.Vec3(2.5 * s, 8 * s, 2.5 * s)), x, 32 * s, y - 10 * s, 0.6,
    new THREE.BoxGeometry(5 * s, 16 * s, 5 * s), baseCol);
  const armR = mkPart(new CANNON.Box(new CANNON.Vec3(2.5 * s, 8 * s, 2.5 * s)), x, 32 * s, y + 10 * s, 0.6,
    new THREE.BoxGeometry(5 * s, 16 * s, 5 * s), baseCol);
  const legL = mkPart(new CANNON.Box(new CANNON.Vec3(3 * s, 9 * s, 3 * s)), x, 11 * s, y - 4 * s, 1,
    new THREE.BoxGeometry(6 * s, 18 * s, 6 * s), baseCol);
  const legR = mkPart(new CANNON.Box(new CANNON.Vec3(3 * s, 9 * s, 3 * s)), x, 11 * s, y + 4 * s, 1,
    new THREE.BoxGeometry(6 * s, 18 * s, 6 * s), baseCol);

  const link = (a, pa, b, pb) => {
    const c = new CANNON.PointToPointConstraint(a, new CANNON.Vec3(...pa), b, new CANNON.Vec3(...pb), 1e5);
    world.addConstraint(c);
    cons.push(c);
  };
  link(torso, [0, 10 * s, 0], head, [0, -6 * s, 0]);
  link(torso, [0, 8 * s, -7 * s], armL, [0, 8 * s, 0]);
  link(torso, [0, 8 * s, 7 * s], armR, [0, 8 * s, 0]);
  link(torso, [0, -10 * s, -4 * s], legL, [0, 9 * s, 0]);
  link(torso, [0, -10 * s, 4 * s], legR, [0, 9 * s, 0]);

  const v = clamp(impulse * 60, 200, 900);
  for (const p of parts) {
    const j = 0.7 + Math.random() * 0.6;
    p.body.velocity.set(Math.cos(dir) * v * j, v * 0.55 * j, Math.sin(dir) * v * j);
    p.body.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  }
  ragdolls.push({ parts, cons, life: 6, startX: x, startY: y, tracked: impulse > 7 });
}

function destroyRagdoll(r) {
  for (const c of r.cons) world.removeConstraint(c);
  for (const p of r.parts) {
    world.removeBody(p.body);
    fxGroup.remove(p.mesh);
    p.mesh.geometry.dispose(); p.mesh.material.dispose();
  }
}

function updateRagdolls(dt) {
  for (const r of ragdolls) {
    r.life -= dt;
    if (r.tracked && !meta.ach['ragdoll-artist']) {
      const t = r.parts[0].body.position;
      if (dist(t.x, t.z, r.startX, r.startY) > 240) {
        ach('ragdoll-artist');
        r.tracked = false;
      }
    }
    const alpha = r.life < 1.5 ? clamp(r.life / 1.5, 0, 1) : 1;
    for (const p of r.parts) {
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
      p.mesh.material.opacity = alpha;
    }
    if (r.life <= 0) destroyRagdoll(r);
  }
  ragdolls = ragdolls.filter(r => r.life > 0);
}

// ============================ enemy AI ============================
function tileAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= floorData.w || ty >= floorData.h) return 0;
  return floorData.grid[ty * floorData.w + tx];
}
function hasLos(x0, y0, x1, y1) {
  return los(floorData.grid, floorData.w, floorData.h, x0 / TILE, y0 / TILE, x1 / TILE, y1 / TILE);
}

function updateEnemies(dt) {
  const pp = bp(player.body);
  for (const e of enemies) {
    const ep = bp(e.body);
    e.flash = Math.max(0, e.flash - dt);
    e.attackCd -= dt; e.shootCd -= dt; e.bob += dt * 6;
    const d = dist(ep.x, ep.y, pp.x, pp.y);
    const seen = d < 500 && hasLos(ep.x, ep.y, pp.x, pp.y);
    if (seen) e.aggro = true;
    if (!e.aggro) continue;

    if (e.def.boss) { updateBoss(e, dt, d, seen); continue; }

    const dirTo = angleTo(ep.x, ep.y, pp.x, pp.y);
    let mvx = 0, mvy = 0;
    const spd = e.speed;

    switch (e.type) {
      case 'archer': {
        if (seen && e.shootCd <= 0 && d < 420) {
          e.shootCd = 1.9;
          fireProjectile(ep.x, ep.y, dirTo, 330, e.dmg, 0xd8c88a, 'arrow', false);
          audio.sfx('arrow');
        }
        if (d > 280) { mvx = Math.cos(dirTo); mvy = Math.sin(dirTo); }
        else if (d < 170) { mvx = -Math.cos(dirTo); mvy = -Math.sin(dirTo); }
        else { const t = dirTo + Math.PI / 2; mvx = Math.cos(t) * 0.5; mvy = Math.sin(t) * 0.5; }
        break;
      }
      case 'brute': {
        e.modeT -= dt;
        if (e.mode === 'chase') {
          mvx = Math.cos(dirTo); mvy = Math.sin(dirTo);
          if (seen && d < 300 && d > 90 && e.attackCd <= 0) { e.mode = 'windup'; e.modeT = 0.65; e.chargeDir = dirTo; }
        } else if (e.mode === 'windup') {
          if (e.modeT <= 0) { e.mode = 'dash'; e.modeT = 0.45; audio.sfx('swing'); }
        } else if (e.mode === 'dash') {
          setVelXZ(e.body, Math.cos(e.chargeDir) * 372, Math.sin(e.chargeDir) * 372);
          if (e.modeT <= 0) { e.mode = 'chase'; e.attackCd = 1.6; }
        }
        break;
      }
      case 'wraith': {
        e.tpCd -= dt;
        if (d > 430 && e.tpCd <= 0) {
          for (let tries = 0; tries < 12; tries++) {
            const a = Math.random() * Math.PI * 2, rr = 100 + Math.random() * 60;
            const nx = pp.x + Math.cos(a) * rr, ny = pp.y + Math.sin(a) * rr;
            if (tileAt(nx, ny) === 1) {
              sparkleBurst(ep.x, ep.y, 8, 0x7a8ac8);
              e.body.position.set(nx, e.r, ny);
              sparkleBurst(nx, ny, 8, 0x7a8ac8);
              e.tpCd = 4;
              break;
            }
          }
        }
        mvx = Math.cos(dirTo); mvy = Math.sin(dirTo);
        break;
      }
      default: {
        mvx = Math.cos(dirTo); mvy = Math.sin(dirTo);
      }
    }

    // anti-stuck detour
    const sp2 = Math.hypot(e.body.velocity.x, e.body.velocity.z);
    if ((mvx || mvy) && sp2 < spd * 0.25) e.stuckT += dt; else e.stuckT = 0;
    if (e.stuckT > 0.7) { e.detour = dirTo + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2); e.detourT = 0.55; e.stuckT = 0; }
    if (e.detourT > 0) { e.detourT -= dt; mvx = Math.cos(e.detour); mvy = Math.sin(e.detour); }

    if ((mvx || mvy) && e.mode !== 'dash' && e.mode !== 'windup') {
      setVelXZ(e.body,
        lerp(e.body.velocity.x, mvx * spd, 0.18),
        lerp(e.body.velocity.z, mvy * spd, 0.18));
    }

    // contact damage (only when player is near the ground — you can jump over slimes)
    if (d < e.r + 16 && e.attackCd <= 0 && player.body.position.y < e.r + 34) {
      const contactDmg = e.mode === 'dash' ? e.dmg * 1.4 : e.dmg;
      damagePlayer(contactDmg, e.elite ? 'Elite ' + e.def.name : e.def.name, dirTo);
      e.attackCd = 0.95;
      if (e.mode === 'dash') { e.mode = 'chase'; e.attackCd = 1.6; }
    }
  }
}

function updateBoss(e, dt, d, seen) {
  const ep = bp(e.body), pp = bp(player.body);
  const dirTo = angleTo(ep.x, ep.y, pp.x, pp.y);
  e.patternT -= dt;
  e.modeT -= dt;
  showBossBar(e);
  const hpFrac = e.hp / e.maxHp;
  const spd = e.speed * (e.type === 'warden' && hpFrac < 0.33 ? 1.35 : 1);

  if (e.type === 'butcher') {
    if (e.phase === 0 && hpFrac < 0.66) { e.phase = 1; bossSummon(e, ['skeleton', 'skeleton']); }
    if (e.phase === 1 && hpFrac < 0.33) { e.phase = 2; bossSummon(e, ['skeleton', 'archer']); }
    if (e.mode === 'chase') {
      setVelXZ(e.body, lerp(e.body.velocity.x, Math.cos(dirTo) * spd, 0.15), lerp(e.body.velocity.z, Math.sin(dirTo) * spd, 0.15));
      if (e.patternT <= 0 && seen) {
        if (d < 110) { e.mode = 'cleave'; e.modeT = 0.55; e.cleaveDir = dirTo; }
        else if (d < 420) { e.mode = 'windup'; e.modeT = 0.8; e.chargeDir = dirTo; }
        e.patternT = 2.4;
      }
    } else if (e.mode === 'cleave') {
      if (e.modeT <= 0) {
        audio.sfx('slam'); addTrauma(0.3);
        const dd = dist(ep.x, ep.y, pp.x, pp.y);
        const da = Math.abs(normAngle(angleTo(ep.x, ep.y, pp.x, pp.y) - e.cleaveDir));
        if (dd < 150 && da < 1.5) damagePlayer(e.dmg * 1.2, e.def.name, e.cleaveDir);
        e.mode = 'chase';
      }
    } else if (e.mode === 'windup') {
      if (e.modeT <= 0) { e.mode = 'dash'; e.modeT = 0.6; audio.sfx('bossroar'); }
    } else if (e.mode === 'dash') {
      setVelXZ(e.body, Math.cos(e.chargeDir) * 450, Math.sin(e.chargeDir) * 450);
      if (d < e.r + 18) { damagePlayer(e.dmg * 1.3, e.def.name, e.chargeDir); e.mode = 'chase'; }
      if (e.modeT <= 0) e.mode = 'chase';
    }
  } else { // warden
    if (e.phase === 0 && hpFrac < 0.66) { e.phase = 1; bossSummon(e, ['archer']); audio.sfx('bossroar'); }
    if (e.phase === 1 && hpFrac < 0.33) { e.phase = 2; bossSummon(e, ['archer', 'wraith']); audio.sfx('bossroar'); }
    setVelXZ(e.body, lerp(e.body.velocity.x, Math.cos(dirTo) * spd, 0.12), lerp(e.body.velocity.z, Math.sin(dirTo) * spd, 0.12));
    if (e.patternT <= 0 && seen) {
      const roll = Math.random();
      if (roll < 0.4) {
        const n = e.phase === 2 ? 14 : 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
          fireProjectile(ep.x, ep.y, a, 240, e.dmg * 0.7, 0xc86aff, 'bolt', false);
        }
        audio.sfx('bolt');
      } else if (roll < 0.7 && e.phase >= 1) {
        rings.push({ x: ep.x, y: ep.y, r: 40, speed: 300, dmg: e.dmg, width: 26, hit: false, max: 520, mesh: makeRingMesh(ep.x, ep.y) });
        audio.sfx('slam'); addTrauma(0.4);
      } else if (d < 130) {
        damagePlayer(e.dmg, e.def.name, dirTo);
      } else {
        for (const off of [-0.25, 0, 0.25]) fireProjectile(ep.x, ep.y, dirTo + off, 330, e.dmg * 0.8, 0xc86aff, 'bolt', false);
        audio.sfx('bolt');
      }
      e.patternT = e.phase === 2 ? 1.5 : 2.3;
    }
  }
  if (d < e.r + 16 && e.attackCd <= 0 && player.body.position.y < e.r + 40) {
    damagePlayer(e.dmg, e.def.name, dirTo);
    e.attackCd = 1.1;
  }
}

function bossSummon(e, types) {
  const diff = DIFFS[run.difficulty];
  const hpScale = (1 + (run.floor - 1) * 0.22) * diff.hp;
  const dmgScale = (1 + (run.floor - 1) * 0.12) * diff.dmg;
  const ep = bp(e.body);
  for (const t of types) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, rr = 90 + Math.random() * 70;
      const nx = ep.x + Math.cos(a) * rr, ny = ep.y + Math.sin(a) * rr;
      if (tileAt(nx, ny) === 1) {
        const m2 = spawnEnemy(t, nx, ny, hpScale, dmgScale, false);
        m2.aggro = true;
        sparkleBurst(nx, ny, 10, 0xc86aff);
        break;
      }
    }
  }
  toast('⚠️ Reinforcements', e.def.name + ' calls for aid!');
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function showBossBar(e) {
  const wrap = $('bossbar-wrap');
  if (wrap.classList.contains('hidden')) {
    wrap.classList.remove('hidden');
    $('bossname').textContent = e.def.name.toUpperCase();
  }
  $('bossbar').style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
}
function hideBossBar() { $('bossbar-wrap').classList.add('hidden'); }

// ============================ projectiles / rings ============================
const boltGeo = new THREE.SphereGeometry(6, 8, 6);
const arrowGeo = new THREE.CylinderGeometry(1.1, 1.1, 18, 5);
arrowGeo.rotateZ(Math.PI / 2);

function fireProjectile(x, y, dir, speed, dmg, color, kind, friendly) {
  const mesh = new THREE.Mesh(
    kind === 'arrow' ? arrowGeo : boltGeo,
    matL(color, { emissive: color, emissiveIntensity: kind === 'arrow' ? 0.3 : 1.2 }));
  mesh.position.set(x, 26, y);
  mesh.rotation.y = -dir;
  fxGroup.add(mesh);
  projectiles.push({ x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, dmg, color, kind, friendly, life: 3, dir, mesh });
}
function killProjectile(pr) {
  pr.life = 0;
  fxGroup.remove(pr.mesh);
  pr.mesh.material.dispose();
}

function makeRingMesh(x, y) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 6, 8, 40),
    matL(0xc86aff, { emissive: 0xc86aff, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 10, y);
  fxGroup.add(mesh);
  return mesh;
}

function updateProjectiles(dt) {
  const pB = player && player.body ? player.body : null;
  const pp = pB ? bp(pB) : null;
  for (const pr of projectiles) {
    pr.life -= dt;
    const steps = 2;
    for (let s = 0; s < steps && pr.life > 0; s++) {
      pr.x += pr.vx * dt / steps; pr.y += pr.vy * dt / steps;
      if (tileAt(pr.x, pr.y) !== 1) { sparkleBurst(pr.x, pr.y, 4, pr.color); killProjectile(pr); break; }
      if (pr.friendly) {
        for (const e of enemies) {
          const ep = bp(e.body);
          if (dist(pr.x, pr.y, ep.x, ep.y) < e.r + 8) {
            const st = playerStats();
            const isCrit = Math.random() < st.crit;
            damageEnemy(e, pr.dmg * (isCrit ? 2 : 1), isCrit, pr.dir, st.knock * 0.8);
            audio.sfx('boltHit');
            killProjectile(pr);
            break;
          }
        }
      } else if (pp && state === 'playing') {
        // jumping over low projectiles works
        if (dist(pr.x, pr.y, pp.x, pp.y) < 20 && player.iframes <= 0 && pB.position.y < 44) {
          damagePlayer(pr.dmg, pr.kind === 'arrow' ? 'Bone Archer' : 'The Warden', pr.dir);
          killProjectile(pr);
        }
      }
    }
    if (pr.life > 0) pr.mesh.position.set(pr.x, 26, pr.y);
  }
  projectiles = projectiles.filter(p => p.life > 0);

  for (const r of rings) {
    r.r += r.speed * (state === 'playing' ? 1 : 0) * dt;
    r.mesh.scale.set(r.r, r.r, 1);
    r.mesh.material.opacity = clamp(1 - r.r / r.max, 0, 1);
    if (pp && !r.hit && player.iframes <= 0 && state === 'playing' && pB.position.y < 40) {
      const dd = dist(r.x, r.y, pp.x, pp.y);
      if (Math.abs(dd - r.r) < r.width) {
        r.hit = true;
        damagePlayer(r.dmg, 'The Warden', angleTo(r.x, r.y, pp.x, pp.y));
      }
    }
    if (r.r >= r.max) { fxGroup.remove(r.mesh); r.mesh.material.dispose(); }
  }
  rings = rings.filter(r => r.r < r.max);
}

// ============================ player update ============================
function isAiming() { return input.isDown('secondary'); }

function updatePlayer(dt) {
  const st = playerStats();
  const b = player.body;
  player.iframes = Math.max(0, player.iframes - dt);
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.dodgeCdT = Math.max(0, player.dodgeCdT - dt);
  player.swingT = Math.max(0, player.swingT - dt);
  player.mana = Math.min(st.maxMana, player.mana + st.manaRegen * dt);

  // camera-relative movement: W = away from camera (forward)
  const mv = input.moveVector();       // y=+1 forward
  const ca = Math.cos(aimAngle), sa = Math.sin(aimAngle);
  let mx = ca * mv.y - sa * mv.x;
  let my = sa * mv.y + ca * mv.x;
  const sprint = input.isDown('sprint') ? 1.32 : 1;
  const spd = st.speed * sprint;
  const grounded = b.position.y < 16.5 && b.velocity.y <= 1;

  if (player.dodgeT > 0) {
    player.dodgeT -= dt;
  } else {
    b.velocity.x = lerp(b.velocity.x, mx * spd, grounded ? 0.3 : 0.08);
    b.velocity.z = lerp(b.velocity.z, my * spd, grounded ? 0.3 : 0.08);
  }

  // jump (Space / A)
  if (input.isDown('jump') && grounded && !player._jumpHeld) {
    b.velocity.y = JUMP_V;
    audio.sfx('dodge', { pitch: 1.4 });
  }
  player._jumpHeld = input.isDown('jump');

  // dodge roll (Ctrl / B)
  if (input.isDown('crouch') && player.dodgeCdT <= 0 && grounded) {
    const dir = (mx || my) ? Math.atan2(my, mx) : aimAngle;
    setVelXZ(b, Math.cos(dir) * 570, Math.sin(dir) * 570);
    player.dodgeT = 0.22;
    player.iframes = Math.max(player.iframes, 0.34);
    player.dodgeCdT = st.dodgeCd;
    audio.sfx('dodge');
    const pp = bp(b);
    for (let i = 0; i < 6; i++) {
      spawnParticle(pp.x, 10, pp.y, -Math.cos(dir) * 60 + (Math.random() - 0.5) * 40, 30, -Math.sin(dir) * 60 + (Math.random() - 0.5) * 40, 0.3, 0xaaaaaa, 100);
    }
  }

  // primary: melee, or magic bolt while aiming (RMB / LT)
  if (input.isDown('primary') && player.attackCd <= 0) {
    if (isAiming()) {
      if (player.mana >= 20) {
        player.mana -= 20;
        player.attackCd = 0.5;
        const pp = bp(b);
        fireProjectile(pp.x + ca * 20, pp.y + sa * 20, aimAngle, 480, Math.round(st.dmg * 1.25), 0x6ad9ff, 'bolt', true);
        audio.sfx('bolt');
      } else { audio.sfx('error'); player.attackCd = 0.3; }
    } else {
      const wpn = st.weapon;
      player.attackCd = wpn.speed;
      player.swingT = 0.16;
      player.swingDir = aimAngle;
      player.swingArc = wpn.arc;
      audio.sfx('swing', { pitch: 0.9 + Math.random() * 0.2 });
      spawnSwingArc(wpn);
      let hitAny = false;
      const pp = bp(b);
      for (const e of enemies) {
        const ep = bp(e.body);
        const d = dist(pp.x, pp.y, ep.x, ep.y);
        if (d < wpn.range + e.r) {
          const da = Math.abs(normAngle(angleTo(pp.x, pp.y, ep.x, ep.y) - aimAngle));
          if (da < wpn.arc / 2 + Math.atan2(e.r, d)) {
            const isCrit = Math.random() < st.crit;
            const dmg = st.dmg * (isCrit ? 2 : 1);
            damageEnemy(e, dmg, isCrit, angleTo(pp.x, pp.y, ep.x, ep.y), st.knock);
            hitAny = true;
            if (st.lifesteal > 0) player.hp = Math.min(st.maxHp, player.hp + dmg * st.lifesteal);
          }
        }
      }
      if (hitAny) addTrauma(0.06);
    }
  }

  // potion (F / RB)
  if (input.isDown('use') && !player._useHeld) {
    player._useHeld = true;
    if (player.potions > 0 && player.hp < st.maxHp) {
      player.potions--;
      player.hp = Math.min(st.maxHp, player.hp + Math.round(st.maxHp * 0.4));
      audio.sfx('potion');
      const pp = bp(b);
      sparkleBurst(pp.x, pp.y, 14, 0xe86a6a);
    } else if (player.potions <= 0) { audio.sfx('error'); }
  } else if (!input.isDown('use')) player._useHeld = false;

  // pickups
  const pp = bp(b);
  for (const g2 of floorData.goldPiles) {
    if (!g2.taken && dist(pp.x, pp.y, g2.x, g2.y) < 30) {
      g2.taken = true;
      player.gold += Math.round(g2.amount * st.goldMult);
      audio.sfx('coin');
      sparkleBurst(g2.x, g2.y, 6, 0xe8b64c);
      const mesh = viz.goldMeshes.get(g2);
      if (mesh) { fxGroup.remove(mesh); disposeGroup(mesh); viz.goldMeshes.delete(g2); }
    }
  }
  for (const pt of floorData.potions) {
    if (!pt.taken && dist(pp.x, pp.y, pt.x, pt.y) < 28) {
      pt.taken = true;
      player.potions++;
      audio.sfx('pickup');
      bumpLoot();
      const mesh = viz.potionMeshes.get(pt);
      if (mesh) { fxGroup.remove(mesh); disposeGroup(mesh); viz.potionMeshes.delete(pt); }
    }
  }

  // interact (E / X)
  const inter = nearestInteractable();
  const hint = $('hint');
  if (inter) {
    hint.textContent = inter.label;
    hint.classList.add('show');
    if (input.isDown('interact') && !player._interHeld) {
      player._interHeld = true;
      inter.action();
    }
  } else hint.classList.remove('show');
  if (!input.isDown('interact')) player._interHeld = false;

  // explore minimap
  const tx = Math.floor(pp.x / TILE), ty = Math.floor(pp.y / TILE);
  for (let y = Math.max(0, ty - 5); y <= Math.min(floorData.h - 1, ty + 5); y++)
    for (let x = Math.max(0, tx - 5); x <= Math.min(floorData.w - 1, tx + 5); x++)
      explored[y * floorData.w + x] = 1;
}

function spawnSwingArc(wpn) {
  const geo = new THREE.RingGeometry(wpn.range * 0.4, wpn.range * 0.95, 18, 1, -wpn.arc / 2, wpn.arc);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  const pp = bp(player.body);
  mesh.position.set(pp.x, 20, pp.y);
  mesh.rotation.z = -aimAngle;
  fxGroup.add(mesh);
  viz.swingArcs.push({ mesh, life: 0.16 });
}

function bumpLoot() {
  player.itemsCollected++;
  meta.stats.itemsCollected++;
  ach('loot-hoarder', meta.stats.itemsCollected / 50);
}

function nearestInteractable() {
  const b2 = bp(player.body);
  const near = (x, y, r = 58) => dist(b2.x, b2.y, x, y) < r;

  for (const gi of groundItems) {
    if (near(gi.x, gi.y, 44)) {
      const r = rarityInfo(gi.item.rarity);
      return {
        label: `[E] Pick up ${gi.item.name}`,
        action: () => {
          if (player.inventory.length >= 12) { toast('Inventory full', 'Drop or equip something first.'); audio.sfx('error'); return; }
          player.inventory.push(gi.item);
          removeGroundItem(gi);
          audio.sfx('pickup');
          toast(`${gi.item.icon} ${gi.item.name}`, r.name + ' — added to inventory');
          bumpLoot();
        },
      };
    }
  }
  for (const cm of (viz ? viz.chestMeshes : [])) {
    const c = cm.c;
    if (!c.opened && near(c.x, c.y)) {
      return {
        label: '[E] Open chest',
        action: () => {
          c.opened = true;
          cm.mesh.userData.lid.rotation.z = -1.1;
          cm.mesh.userData.lid.position.y = 24;
          audio.sfx('chest');
          const st = playerStats();
          const gold = Math.round((15 + Math.random() * 20 + run.floor * 4) * st.goldMult);
          const gp = { x: c.x + 20, y: c.y, amount: gold };
          floorData.goldPiles.push(gp); addGoldMesh(gp);
          dropItem(c.x - 20, c.y + 10, rollItem(lootRng, run.floor, { boost: 0.35 }));
          if (Math.random() < 0.4) { const pt = { x: c.x, y: c.y + 26 }; floorData.potions.push(pt); addPotionMesh(pt); }
          sparkleBurst(c.x, c.y, 16, 0xe8b64c);
        },
      };
    }
  }
  const f = floorData.fountain;
  if (f && !f.used && near(f.x, f.y)) {
    return {
      label: '[E] Drink from the fountain',
      action: () => {
        f.used = true;
        if (viz.fountainMesh) {
          viz.fountainMesh.userData.water.material.color.set(0x2a3038);
          viz.fountainMesh.userData.water.material.emissive.set(0x000000);
        }
        const st = playerStats();
        player.hp = Math.min(st.maxHp, player.hp + Math.round(st.maxHp * 0.5));
        audio.sfx('fountain');
        sparkleBurst(f.x, f.y, 20, 0x6ad9d9);
        toast('💧 Restored', 'The waters mend your wounds.');
      },
    };
  }
  if (near(floorData.stairs.x, floorData.stairs.y, 64)) {
    if (floorData.boss && !floorData.bossDefeated) {
      return { label: 'The stairs are sealed by dark magic…', action: () => { audio.sfx('error'); } };
    }
    return {
      label: run.floor >= (run.daily ? DAILY_MAX_FLOOR : MAX_FLOOR) ? '' : '[E] Descend the stairs',
      action: () => { descend(); },
    };
  }
  return null;
}

function descend() {
  if (!player.floorDamaged && floorData.enemySpawns.length > 0) ach('untouchable');
  const maxF = run.daily ? DAILY_MAX_FLOOR : MAX_FLOOR;
  if (run.floor >= maxF) return;
  audio.sfx('stairs');
  enterFloor(run.floor + 1);
}

// ============================ level up ============================
function openLevelUp() {
  state = 'levelup';
  unlockPointer();
  const cards = $('levelup-cards');
  cards.innerHTML = '';
  const rng = makeRng('lu' + Date.now() + player.level);
  const picks = rng.shuffle(LEVELUP_CARDS).slice(0, 3);
  for (const c of picks) {
    const el = document.createElement('div');
    el.className = 'lu-card menu-focusable';
    el.innerHTML = `<div class="lu-icon">${c.icon}</div><h4>${c.name}</h4><p>${c.desc}</p>`;
    el.onclick = () => {
      c.apply(player);
      const st = playerStats();
      player.hp = Math.min(player.hp, st.maxHp);
      hide('menu-levelup');
      state = 'playing';
      audio.sfx('click');
      pendingLevelUps--;
      if (pendingLevelUps > 0) openLevelUp();
      else lockPointer();
    };
    cards.appendChild(el);
  }
  show('menu-levelup');
  focusMenu('menu-levelup');
}

// ============================ inventory ============================
function openInventory() {
  state = 'inventory';
  unlockPointer();
  renderInventory();
  show('menu-inventory');
}
function closeInventory() {
  hide('menu-inventory');
  hide('inv-detail');
  state = 'playing';
  lockPointer();
}

function renderInventory() {
  const st = playerStats();
  const eq = $('inv-equipped');
  eq.innerHTML = '<h4>Equipped</h4>';
  for (const slot of ['weapon', 'armor', 'trinket']) {
    const it = player.equipment[slot];
    const el = document.createElement('div');
    el.className = 'equip-slot' + (it ? ' rarity-' + it.rarity : '');
    el.innerHTML = `<div class="slot-label">${slot}</div>` +
      (it ? `<div>${it.icon} ${escapeHtml(it.name)}</div>` : '<div style="color:#666">— empty —</div>');
    if (it) {
      el.onmouseenter = (ev) => showItemDetail(it, ev);
      el.onmouseleave = () => hide('inv-detail');
      el.onclick = () => {
        if (player.inventory.length >= 12) { audio.sfx('error'); return; }
        player.inventory.push(it);
        player.equipment[slot] = null;
        afterGearChange();
      };
    }
    eq.appendChild(el);
  }

  const grid = $('inv-grid');
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const it = player.inventory[i];
    const cell = document.createElement('div');
    cell.className = 'inv-cell' + (it ? ' rarity-' + it.rarity : ' empty');
    if (it) {
      cell.innerHTML = `<div>${it.icon}</div><div class="cell-name">${escapeHtml(it.name)}</div>`;
      cell.onmouseenter = (ev) => showItemDetail(it, ev);
      cell.onmouseleave = () => hide('inv-detail');
      cell.onclick = () => {
        const cur = player.equipment[it.slot];
        player.equipment[it.slot] = it;
        player.inventory.splice(player.inventory.indexOf(it), 1);
        if (cur) player.inventory.push(cur);
        if (it.rarity === 'legendary') ach('dressed-to-kill');
        afterGearChange();
      };
      cell.oncontextmenu = (ev) => {
        ev.preventDefault();
        player.inventory.splice(player.inventory.indexOf(it), 1);
        const pp = bp(player.body);
        dropItem(pp.x + 20, pp.y, it);
        afterGearChange();
      };
    }
    grid.appendChild(cell);
  }

  const stEl = $('inv-stats');
  stEl.innerHTML = '<h4>Stats</h4>' + [
    ['Max HP', st.maxHp], ['Damage', st.dmg], ['Armor', `${st.armor} (${Math.round(st.dmgReduction * 100)}%)`],
    ['Crit', Math.round(st.crit * 100) + '%'], ['Speed', (st.speed / 9.6 * 0.682).toFixed(1) + ' mph'],
    ['Mana', st.maxMana], ['Lifesteal', Math.round(st.lifesteal * 100) + '%'],
    ['Gold find', '+' + Math.round((st.goldMult - 1) * 100) + '%'],
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
}

function afterGearChange() {
  const st = playerStats();
  player.hp = Math.min(player.hp, st.maxHp);
  audio.sfx('click');
  renderInventory();
}

function showItemDetail(it, ev) {
  const d = $('inv-detail');
  const r = rarityInfo(it.rarity);
  d.innerHTML = `<b class="r-${it.rarity}">${it.icon} ${escapeHtml(it.name)}</b><br>` +
    `<span class="r-${it.rarity}">${r.name} ${it.slot}</span><br>` +
    itemTooltipLines(it).map(l => '· ' + escapeHtml(l)).join('<br>') +
    `<br><span style="color:#888">Click to ${it === player.equipment[it.slot] ? 'unequip' : 'equip'} · Right-click to drop</span>`;
  d.classList.remove('hidden');
  d.style.left = Math.min(window.innerWidth - 280, ev.clientX + 16) + 'px';
  d.style.top = Math.min(window.innerHeight - 200, ev.clientY + 10) + 'px';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ============================ menus ============================
function mkBtn(label, onClick, sub) {
  const b = document.createElement('button');
  b.className = 'menu-btn menu-focusable';
  b.innerHTML = escapeHtml(label) + (sub ? `<small>${escapeHtml(sub)}</small>` : '');
  b.onclick = () => { audio.sfx('click'); onClick(); };
  return b;
}

function toMenu() {
  hideAllMenus();
  hide('hud'); hide('crosshair');
  hideBossBar();
  unlockPointer();
  state = 'menu';
  run = null;
  floorData = null;
  world = null;
  enemies = []; projectiles = []; ragdolls = []; rings = []; groundItems = [];
  // atmospheric 3D backdrop: a torchlit floor with a slow orbiting camera
  menuFD = generateFloor('menu-backdrop-' + GAME_ID, 3);
  buildFloorVisuals(menuFD);
  audio.music('menu');
  buildMainMenu();
  show('menu-main');
  focusMenu('menu-main');
}

async function buildMainMenu() {
  const btns = $('main-btns');
  btns.innerHTML = '';
  let auto = null;
  try { auto = await sdk.loadState('auto'); } catch (e) { /* version mismatch etc. */ }
  if (auto && auto.blob) applyLoadedBlob(auto.blob);
  const canContinue = auto && auto.blob && auto.blob.run;
  if (canContinue) {
    const r = auto.blob.run;
    btns.appendChild(mkBtn('Continue', () => startRun(null, null, r),
      `Floor ${r.floor} — ${DIFFS[r.difficulty].label}${r.daily ? ' (Daily)' : ''}`));
  }
  btns.appendChild(mkBtn('New Run', () => { hide('menu-main'); openDifficulty(); }));
  const seed = dailySeed();
  const done = meta.stats.dailyDone[seed];
  btns.appendChild(mkBtn(done ? 'Daily Challenge ✓' : 'Daily Challenge', () => {
    startRun('normal', true);
  }, done ? `Completed — seed ${seed}` : `Seeded 5-floor gauntlet — seed ${seed}`));
  btns.appendChild(mkBtn('Soul Forge', () => openShop('menu-main'), `✦ ${meta.souls} souls`));
  btns.appendChild(mkBtn('How to Play', () => { hide('menu-main'); buildHelp(); show('menu-help'); focusMenu('menu-help'); }));
  btns.appendChild(mkBtn('Settings', () => { hide('menu-main'); buildSettings(); show('menu-settings'); focusMenu('menu-settings'); }));
  $('menu-meta-line').innerHTML =
    `<b>✦ ${meta.souls}</b> souls · ${meta.stats.kills} total kills · best floor ${meta.stats.bestFloor} · ${meta.stats.wins} victories`;
  focusMenu('menu-main');
}

function openDifficulty() {
  const btns = $('diff-btns');
  btns.innerHTML = '';
  btns.appendChild(mkBtn('Easy', () => startRun('easy', false), 'Gentler foes · 0.8× souls'));
  btns.appendChild(mkBtn('Normal', () => startRun('normal', false), 'The intended descent'));
  btns.appendChild(mkBtn('Hard', () => startRun('hard', false), 'Brutal foes, more elites · 1.5× souls'));
  btns.appendChild(mkBtn('Back', () => { hide('menu-difficulty'); show('menu-main'); focusMenu('menu-main'); }));
  show('menu-difficulty');
  focusMenu('menu-difficulty');
}

let shopReturnTo = 'menu-main';
function openShop(returnTo) {
  shopReturnTo = returnTo || 'menu-main';
  hide(shopReturnTo);
  renderShop();
  show('menu-shop');
  focusMenu('menu-shop');
}

function renderShop() {
  $('shop-souls').textContent = `✦ ${meta.souls}`;
  const grid = $('shop-grid');
  grid.innerHTML = '';
  for (const up of META_UPGRADES) {
    const r = rank(up.id);
    const maxed = r >= up.ranks;
    const cost = maxed ? 0 : metaCost(up, r);
    const el = document.createElement('div');
    el.className = 'shop-item menu-focusable' + (maxed ? ' maxed' : (meta.souls < cost ? ' locked' : ''));
    el.innerHTML = `<h4>${up.icon} ${up.name}<span class="pips">${
      Array.from({ length: up.ranks }, (_, i) => `<span class="pip${i < r ? ' on' : ''}"></span>`).join('')
    }</span></h4><p>${up.desc}</p>` +
      (maxed ? `<span class="maxed-tag">MAXED</span>` : `<span class="cost">✦ ${cost}</span>`);
    if (!maxed) {
      el.onclick = () => {
        if (meta.souls < cost) { audio.sfx('error'); return; }
        meta.souls -= cost;
        meta.upgrades[up.id] = r + 1;
        audio.sfx('levelup');
        const total = Object.entries(meta.upgrades).reduce((s, [, v]) => s + v, 0);
        if (total >= totalMetaRanks()) ach('ascended');
        writeSave('auto');
        renderShop();
      };
    }
    grid.appendChild(el);
  }
  $('shop-back').onclick = () => {
    audio.sfx('click');
    hide('menu-shop');
    show(shopReturnTo);
    if (shopReturnTo === 'menu-main') buildMainMenu();
    focusMenu(shopReturnTo);
  };
}

function buildHelp() {
  $('help-body').innerHTML = `
    <h3>Goal</h3>
    Descend all ${MAX_FLOOR} floors of the 3D dungeon and destroy <b>The Warden</b>.
    Bosses guard floors 5 and 10. Death banks your souls (✦) for permanent upgrades at the Soul Forge.
    <h3>Keyboard &amp; Mouse</h3>
    <table>
      <tr><td>W A S D</td><td>Move (camera-relative)</td></tr>
      <tr><td>Mouse</td><td>Look — mouse up looks up (non-inverted)</td></tr>
      <tr><td>Left Mouse</td><td>Melee attack</td></tr>
      <tr><td>Right Mouse (hold)</td><td>Aim — Left Mouse then fires a magic bolt (20 mana)</td></tr>
      <tr><td>Space</td><td>Jump — clears shockwaves and low bolts</td></tr>
      <tr><td>Left Ctrl</td><td>Dodge roll (brief invulnerability)</td></tr>
      <tr><td>Left Shift</td><td>Sprint</td></tr>
      <tr><td>E</td><td>Interact — chests, fountains, stairs, loot</td></tr>
      <tr><td>F</td><td>Drink potion (heal 40%)</td></tr>
      <tr><td>I / Tab</td><td>Inventory</td></tr>
      <tr><td>M</td><td>Map overlay</td></tr>
      <tr><td>Esc</td><td>Pause</td></tr>
    </table>
    <h3>Gamepad (Xbox layout)</h3>
    <table>
      <tr><td>Left Stick</td><td>Move</td></tr>
      <tr><td>Right Stick</td><td>Look (non-inverted)</td></tr>
      <tr><td>RT</td><td>Melee attack / fire bolt while aiming</td></tr>
      <tr><td>LT</td><td>Aim</td></tr>
      <tr><td>A</td><td>Jump / confirm</td></tr>
      <tr><td>B</td><td>Dodge roll / back</td></tr>
      <tr><td>X</td><td>Interact</td></tr>
      <tr><td>RB</td><td>Drink potion</td></tr>
      <tr><td>Y</td><td>Inventory</td></tr>
      <tr><td>Start</td><td>Pause</td></tr>
    </table>
    <h3>Tips</h3>
    Loot has five rarities — equip better gear from the inventory. Elites glow gold and always drop loot.
    Enemies ragdoll through the air when slain — heavier weapons launch them further.
    The Daily Challenge is a seeded 5-floor gauntlet, identical for everyone today.
    Key bindings can be remapped in the hub's Settings.`;
  $('help-back').onclick = () => {
    audio.sfx('click');
    hide('menu-help');
    if (state === 'paused') { show('menu-pause'); focusMenu('menu-pause'); }
    else { show('menu-main'); focusMenu('menu-main'); }
  };
}

function buildSettings() {
  const b = $('settings-body');
  const a = effSettings.audio, acc = effSettings.accessibility;
  b.innerHTML = '';
  const row = (label, inputEl) => {
    const r = document.createElement('div');
    r.className = 'setting-row';
    const l = document.createElement('label');
    l.textContent = label;
    r.append(l, inputEl);
    b.appendChild(r);
  };
  const slider = (val, min, max, step, onCh) => {
    const s = document.createElement('input');
    s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val;
    s.oninput = () => onCh(parseFloat(s.value));
    return s;
  };
  const check = (val, onCh) => {
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = val;
    c.onchange = () => onCh(c.checked);
    return c;
  };
  const set = (path, v) => {
    const [g2, k] = path.split('.');
    localOverride[g2] = localOverride[g2] || {};
    localOverride[g2][k] = v;
    saveLocalOverride();
    applySettings();
  };
  row('Master volume', slider(a.master, 0, 1, 0.05, v => set('audio.master', v)));
  row('Music volume', slider(a.music, 0, 1, 0.05, v => set('audio.music', v)));
  row('SFX volume', slider(a.sfx, 0, 1, 0.05, v => set('audio.sfx', v)));
  row('Mute all', check(a.muted, v => set('audio.muted', v)));
  row('Screen shake', check(acc.screenShake, v => set('accessibility.screenShake', v)));
  row('Reduced motion', check(acc.reducedMotion, v => set('accessibility.reducedMotion', v)));
  row('High contrast (brighter dungeon)', check(acc.highContrast, v => set('accessibility.highContrast', v)));
  row('Text scale', slider(acc.textScale, 0.85, 1.5, 0.05, v => set('accessibility.textScale', v)));
  const note = document.createElement('p');
  note.className = 'settings-note';
  note.textContent = 'These override the Empire hub settings for this game only. Key bindings, mouse sensitivity, invert-Y (off by default) and more are configured in the hub Settings screen and apply here automatically.';
  b.appendChild(note);
  $('settings-back').onclick = () => {
    audio.sfx('click');
    hide('menu-settings');
    if (state === 'paused') { show('menu-pause'); focusMenu('menu-pause'); }
    else { show('menu-main'); focusMenu('menu-main'); }
  };
}

function openPause() {
  if (state !== 'playing') return;
  state = 'paused';
  unlockPointer();
  audio.music(null);
  $('pause-info').innerHTML =
    `Floor <b>${run.floor}</b> · ${DIFFS[run.difficulty].label}${run.daily ? ' · Daily' : ''} · seed ${run.seed}<br>` +
    `Level ${player.level} · ${player.kills} kills · ${fmtTime(run.playtimeSec)} · ✦ ${run.souls} souls this run`;
  const btns = $('pause-btns');
  btns.innerHTML = '';
  btns.append(
    mkBtn('Resume', resumeGame),
    mkBtn('Save Run', () => { hide('menu-pause'); openSaveMenu(); }),
    mkBtn('Settings', () => { hide('menu-pause'); buildSettings(); show('menu-settings'); focusMenu('menu-settings'); }),
    mkBtn('How to Play', () => { hide('menu-pause'); buildHelp(); show('menu-help'); focusMenu('menu-help'); }),
    mkBtn('Quit to Menu', async () => {
      currentRunSnapshot = makeSnapshot();
      await writeSave('auto');
      await reportPlaytime(true);
      toMenu();
    }, 'Progress autosaved at floor entrance'),
  );
  show('menu-pause');
  focusMenu('menu-pause');
  writeSave('auto');
  reportPlaytime(true);
}

function resumeGame() {
  hideAllMenus();
  state = 'playing';
  lockPointer();
  audio.music(floorData.boss && enemies.some(e => e.def.boss) ? 'boss' : 'dungeon');
}

async function openSaveMenu() {
  const btns = $('save-btns');
  btns.innerHTML = '<div style="color:#888">Loading slots…</div>';
  show('menu-save');
  let saves = [];
  try { saves = await sdk.listSaves(); } catch {}
  btns.innerHTML = '';
  for (const slot of ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']) {
    const existing = (Array.isArray(saves) ? saves : []).find(s => s.slot === slot);
    btns.appendChild(mkBtn(
      `Slot ${slot.slice(4)}`,
      async () => {
        currentRunSnapshot = makeSnapshot();
        await writeSave(slot);
        await writeSave('auto');
        toast('💾 Saved', `Run saved to slot ${slot.slice(4)}.`);
        hide('menu-save');
        show('menu-pause');
        focusMenu('menu-pause');
      },
      existing ? `Overwrite: ${existing.meta?.label || 'saved game'}` : 'Empty',
    ));
  }
  btns.appendChild(mkBtn('Back', () => { hide('menu-save'); show('menu-pause'); focusMenu('menu-pause'); }));
  focusMenu('menu-save');
}

// ============================ menu focus (keyboard/gamepad nav) ============================
let focusList = [], focusIdx = 0;
function focusMenu(menuId) {
  const el = $(menuId);
  focusList = [...el.querySelectorAll('.menu-focusable, .menu-btn')].filter(b => !b.disabled && b.offsetParent !== null);
  focusIdx = 0;
  updateFocusStyles();
}
function updateFocusStyles() {
  for (const [i, el] of focusList.entries()) el.classList.toggle('focused', i === focusIdx);
}
function menuNav(dir) {
  if (!focusList.length) return;
  focusIdx = (focusIdx + dir + focusList.length) % focusList.length;
  updateFocusStyles();
  audio.sfx('click');
}
function menuActivate() {
  if (focusList[focusIdx]) focusList[focusIdx].click();
}

// ============================ pointer lock ============================
function lockPointer() {
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock(); } catch {}
  }
}
function unlockPointer() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  // Esc kicks us out of pointer lock — treat it as pause during play
  if (document.pointerLockElement !== canvas && state === 'playing') openPause();
});
canvas.addEventListener('mousedown', () => {
  if (state === 'playing') lockPointer();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================ input: global key handling ============================
window.addEventListener('keydown', (e) => {
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  const inMenu = ['menu', 'paused', 'dead', 'win', 'levelup'].includes(state);
  if (inMenu) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') menuNav(-1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') menuNav(1);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') menuNav(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') menuNav(1);
    if (e.code === 'Enter') menuActivate();
  }
  const act = input.actionForCode(e.code);
  if (state === 'playing') {
    if (act === 'pause') openPause();
    else if (act === 'inventory' || e.code === 'Tab') openInventory();
    else if (act === 'map') { state = 'map'; show('map-overlay'); }
  } else if (state === 'paused' && act === 'pause' && !$('menu-pause').classList.contains('hidden')) {
    resumeGame();
  } else if (state === 'inventory' && (act === 'inventory' || e.code === 'Tab' || act === 'pause')) {
    closeInventory();
  } else if (state === 'map' && (act === 'map' || act === 'pause')) {
    state = 'playing'; hide('map-overlay'); lockPointer();
  }
});

window.addEventListener('pointerdown', () => {
  if (state === 'menu') audio.music('menu');
});

// gamepad menu nav
function pollGamepadMenus() {
  const edges = input.pollGamepadEdges();
  const inMenu = ['menu', 'paused', 'dead', 'win', 'levelup'].includes(state);
  for (const ed of edges) {
    if (inMenu) {
      if (ed.button === 12 || ed.stick === 'up' || ed.stick === 'left' || ed.button === 14) menuNav(-1);
      if (ed.button === 13 || ed.stick === 'down' || ed.stick === 'right' || ed.button === 15) menuNav(1);
      if (ed.button === 0) menuActivate();
      if (ed.button === 1) {
        const back = focusList.find(b => /back|resume|close/i.test(b.textContent));
        if (back) back.click();
      }
    } else if (state === 'playing') {
      if (ed.button === 9) openPause();
      if (ed.button === 3) openInventory();
    } else if (state === 'inventory') {
      if (ed.button === 1 || ed.button === 3 || ed.button === 9) closeInventory();
    } else if (state === 'map') {
      if (ed.button === 1 || ed.button === 9) { state = 'playing'; hide('map-overlay'); }
    }
  }
}

// ============================ main loop ============================
let lastT = performance.now();
let acc = 0;
const STEP = 1 / 60;

let lastRafAt = performance.now();
function rafLoop(now) {
  lastRafAt = performance.now();
  frame(now);
  requestAnimationFrame(rafLoop);
}
setInterval(() => {
  if (performance.now() - lastRafAt > 250) frame(performance.now());
}, 33);

function frame(now) {
  let dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  pollGamepadMenus();

  // look input (once per frame)
  const look = input.consumeLookDelta();
  if (state === 'playing' && (document.pointerLockElement === canvas || input.getGamepad())) {
    aimAngle += look.x * 0.0026;
    camElev = clamp(camElev + look.y * 0.002, 0.16, 1.25);
  }

  if (hubPaused) { renderFrame(dt); return; }

  const timeScale = slowmo > 0 ? 0.3 : 1;
  slowmo = Math.max(0, slowmo - dt);

  if (state === 'playing' || state === 'dying' || state === 'map' || state === 'inventory') {
    acc += dt * timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP; steps++;
      tick(STEP);
    }
    if (state === 'playing') {
      run.playtimeSec += dt;
      playtimeAcc += dt;
      if (playtimeAcc >= 30) reportPlaytime();
    }
  }
  trauma = Math.max(0, trauma - dt * 1.5);
  hurtFlash = Math.max(0, hurtFlash - dt);
  if (state === 'dying') {
    deathTimer -= dt;
    if (deathTimer <= 0) finishDeath();
  }
  renderFrame(dt);
  updateHud();
}

function tick(dt) {
  if (state === 'playing') {
    updatePlayer(dt);
    updateEnemies(dt);
  }
  if (world) world.step(dt);
  updateProjectiles(dt);
  updateRagdolls(dt);
  updateParticles(dt);
  updateDmgNumbers(dt);
}

// ============================ per-frame visuals ============================
function syncMeshes() {
  const t = performance.now();
  // player
  if (player && player.mesh && player.body && state !== 'dying') {
    const b = player.body;
    player.mesh.position.set(b.position.x, b.position.y - 14, b.position.z);
    player.mesh.rotation.y = -aimAngle;
    const blink = player.iframes > 0 && Math.floor(t / 80) % 2 === 0;
    player.mesh.visible = true;
    for (const m of player.mesh.userData.mats) { m.transparent = true; m.opacity = blink ? 0.4 : 1; }
    // sword swing
    const arm = player.mesh.userData.arm;
    if (player.swingT > 0) {
      const prog = 1 - player.swingT / 0.16;
      arm.rotation.y = (player.swingArc / 2) - player.swingArc * prog;
    } else {
      arm.rotation.y = lerp(arm.rotation.y, -0.4, 0.2);
    }
  }
  // swing arcs fade
  if (viz) {
    for (const sw of viz.swingArcs) {
      sw.life -= 1 / 60;
      sw.mesh.material.opacity = clamp(sw.life / 0.16, 0, 1) * 0.5;
      if (sw.life <= 0) { fxGroup.remove(sw.mesh); sw.mesh.geometry.dispose(); sw.mesh.material.dispose(); }
    }
    viz.swingArcs = viz.swingArcs.filter(s => s.life > 0);
  }
  // enemies
  const ppos = player && player.body ? bp(player.body) : null;
  for (const e of enemies) {
    const b = e.body;
    e.mesh.position.set(b.position.x, b.position.y - e.r + (e.mesh.userData.floats ? Math.sin(e.bob) * 4 + 4 : 0), b.position.z);
    if (ppos) e.mesh.rotation.y = -angleTo(b.position.x, b.position.z, ppos.x, ppos.y);
    if (e.type === 'slime' && e.mesh.userData.bodyMesh) {
      const sq = Math.abs(Math.sin(e.bob)) * 0.18;
      e.mesh.userData.bodyMesh.scale.set(1 + sq * 0.5, 0.72 - sq * 0.3, 1 + sq * 0.5);
    }
    // hit flash
    const fl = e.flash > 0;
    for (const m of e.mesh.userData.mats) {
      m.emissive = m.emissive || new THREE.Color(0);
      if (fl) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.9; }
      else if (m.userData?.baseEmissive === undefined) { m.emissive.setRGB(0, 0, 0); }
    }
    if (e.mesh.userData.eliteRing) e.mesh.userData.eliteRing.rotation.z = t / 600;
    e.mesh.userData.tele.visible = e.mode === 'windup';
    if (e.mode === 'windup') {
      e.mesh.userData.tele.material.opacity = 0.35 + Math.sin(t / 60) * 0.25;
      // telegraph points along charge dir (mesh already faces player; chargeDir ~ dirTo)
    }
    const hb = e.mesh.userData.hpBar;
    if (e.hp < e.maxHp && !e.def.boss) {
      hb.sprite.visible = true;
      hb.update(e.hp / e.maxHp, e.elite);
    }
  }
  // torch flames flicker + light pool
  if (viz) {
    for (const tf of viz.torchFlames) {
      const fl = Math.sin(t / 90 + tf.t.flicker);
      tf.flame.scale.set(1 + fl * 0.15, 1 + fl * 0.25, 1 + fl * 0.15);
    }
    // stairs frame spin
    if (viz.stairsMesh) viz.stairsMesh.userData.frame.rotation.z = t / 900;
    if (viz.fountainMesh && floorData && floorData.fountain && !floorData.fountain.used && Math.random() < 0.1) {
      sparkleBurst(floorData.fountain.x, floorData.fountain.y, 1, 0x8ae8ff);
    }
  }
  // ground items bob + spin
  for (const gi of groundItems) {
    gi.mesh.userData.gem.position.y = 16 + Math.sin(t / 350 + gi.bob) * 4;
    gi.mesh.userData.gem.rotation.y = t / 500 + gi.bob;
  }
}

function assignTorchLights(centerX, centerZ, fd) {
  if (!fd) { for (const l of torchLights) l.intensity = 0; return; }
  const sorted = fd.torches
    .map(t2 => ({ t: t2, d: dist(t2.x, t2.y, centerX, centerZ) }))
    .sort((a, b2) => a.d - b2.d)
    .slice(0, TORCH_LIGHTS);
  const time = performance.now();
  for (let i = 0; i < TORCH_LIGHTS; i++) {
    const l = torchLights[i];
    if (i < sorted.length && sorted[i].d < 900) {
      const t2 = sorted[i].t;
      l.position.set(t2.x, 52, t2.y);
      l.intensity = 1.1 + Math.sin(time / 90 + t2.flicker) * 0.25;
      l.color.set(fd.theme.torch);
    } else l.intensity = 0;
  }
}

function updateCamera(dt) {
  const fd = floorData || menuFD;
  if (!fd) return;

  let tx, tz;
  if (state === 'menu' || !player || !player.body) {
    // slow orbit around the backdrop floor
    const t = performance.now() / 1000;
    const cx = fd.w * TILE / 2, cz = fd.h * TILE / 2;
    tx = cx; tz = cz;
    camera.position.set(cx + Math.cos(t * 0.08) * 500, 320, cz + Math.sin(t * 0.08) * 500);
    camera.lookAt(cx, 0, cz);
    assignTorchLights(camera.position.x, camera.position.z, fd);
    playerLight.position.set(camera.position.x, 200, camera.position.z);
    playerLight.intensity = 0.6;
    return;
  }

  const b = player.body;
  tx = b.position.x; tz = b.position.z;
  const targetDist = isAiming() && state === 'playing' ? 190 : 330;
  camDist = lerp(camDist, targetDist, 0.14);
  const cf = Math.cos(camElev) * camDist;
  const ch = Math.sin(camElev) * camDist;
  const shx = trauma * trauma * 16 * (Math.random() * 2 - 1);
  const shy = trauma * trauma * 16 * (Math.random() * 2 - 1);
  const cx = tx - Math.cos(aimAngle) * cf + shx;
  const cz = tz - Math.sin(aimAngle) * cf + shy;
  const cy = Math.max(42, b.position.y + 16 + ch);
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx + Math.cos(aimAngle) * 40, b.position.y + 26, tz + Math.sin(aimAngle) * 40);
  if (trauma > 0) camera.rotation.z += trauma * trauma * 0.04 * (Math.random() * 2 - 1);

  playerLight.position.set(tx, b.position.y + 90, tz);
  playerLight.intensity = 1.6;
  assignTorchLights(tx, tz, fd);
}

function renderFrame(dt) {
  updateCamera(dt);
  syncMeshes();
  renderer.render(scene, camera);

  // css fx overlays
  $('hurt-overlay').style.opacity = hurtFlash > 0 ? hurtFlash * 1.4 : 0;
  const lowHp = player && state === 'playing' && player.hp / playerStats().maxHp < 0.25;
  $('lowhp-overlay').style.opacity = lowHp ? 0.35 + Math.sin(performance.now() / 250) * 0.25 : 0;
  $('crosshair').classList.toggle('aiming', state === 'playing' && isAiming());

  if (state === 'map') renderMapOverlay();
}

// ============================ HUD ============================
function updateHud() {
  if (!run || !player || state === 'menu') return;
  const st = playerStats();
  $('hpbar').style.width = clamp(player.hp / st.maxHp * 100, 0, 100) + '%';
  $('hptext').textContent = `${Math.max(0, Math.ceil(player.hp))} / ${st.maxHp}`;
  $('manabar').style.width = clamp(player.mana / st.maxMana * 100, 0, 100) + '%';
  $('hud-gold').textContent = player.gold;
  $('hud-souls').textContent = run.souls;
  $('hud-potions').textContent = player.potions;
  $('hud-floor').textContent = `FLOOR ${run.floor} / ${run.daily ? DAILY_MAX_FLOOR : MAX_FLOOR}${run.daily ? ' · DAILY' : ''}`;
  $('xpbar').style.width = clamp(player.xp / xpNeed(player.level) * 100, 0, 100) + '%';
  $('xptext').textContent = `Level ${player.level} — ${player.xp}/${xpNeed(player.level)} XP`;
  renderMinimap();
}

function renderMinimap() {
  if (!floorData) return;
  const { w, h } = floorData;
  mctx.clearRect(0, 0, mini.width, mini.height);
  const sx = mini.width / w, sy = mini.height / h;
  mctx.fillStyle = 'rgba(200,190,220,0.5)';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (explored[y * w + x] && floorData.grid[y * w + x] === 1) {
        mctx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
      }
    }
  }
  const stx = floorData.stairs.x / TILE, sty = floorData.stairs.y / TILE;
  if (explored[Math.floor(sty) * w + Math.floor(stx)]) {
    mctx.fillStyle = '#e8b64c';
    mctx.fillRect(stx * sx - 2, sty * sy - 2, 4, 4);
  }
  if (player && player.body) {
    const pp = bp(player.body);
    mctx.fillStyle = '#6ad9ff';
    mctx.beginPath();
    mctx.arc(pp.x / TILE * sx, pp.y / TILE * sy, 2.5, 0, 7);
    mctx.fill();
    // facing tick
    mctx.strokeStyle = '#6ad9ff';
    mctx.beginPath();
    mctx.moveTo(pp.x / TILE * sx, pp.y / TILE * sy);
    mctx.lineTo(pp.x / TILE * sx + Math.cos(aimAngle) * 6, pp.y / TILE * sy + Math.sin(aimAngle) * 6);
    mctx.stroke();
  }
}

function renderMapOverlay() {
  mapCtx.clearRect(0, 0, W, H);
  mapCtx.fillStyle = 'rgba(6,4,12,0.85)';
  mapCtx.fillRect(0, 0, W, H);
  if (!floorData) return;
  const { w, h } = floorData;
  const scale = Math.min((W - 160) / w, (H - 160) / h);
  const mx = (W - w * scale) / 2, my = (H - h * scale) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (explored[y * w + x] && floorData.grid[y * w + x] === 1) {
        mapCtx.fillStyle = 'rgba(180,170,210,0.55)';
        mapCtx.fillRect(mx + x * scale, my + y * scale, scale + 0.5, scale + 0.5);
      }
    }
  }
  const stx = floorData.stairs.x / TILE, sty = floorData.stairs.y / TILE;
  if (explored[Math.floor(sty) * w + Math.floor(stx)]) {
    mapCtx.fillStyle = '#e8b64c';
    mapCtx.fillRect(mx + stx * scale - 4, my + sty * scale - 4, 8, 8);
  }
  const pp = bp(player.body);
  mapCtx.fillStyle = '#6ad9ff';
  mapCtx.beginPath();
  mapCtx.arc(mx + pp.x / TILE * scale, my + pp.y / TILE * scale, 5, 0, 7);
  mapCtx.fill();
  mapCtx.fillStyle = '#e8e2d8';
  mapCtx.font = '20px Georgia';
  mapCtx.textAlign = 'center';
  mapCtx.fillText(`FLOOR ${run.floor} — ${floorData.name.toUpperCase()}   ·   [M] close`, W / 2, my - 24);
}

// ============================ boot ============================
async function boot() {
  $('inv-close').onclick = closeInventory;
  sdk = new EmpireClient({
    gameId: GAME_ID,
    saveVersion: SAVE_VERSION,
    onSettings: (s) => { hubSettings = s; applySettings(); },
    onTheme: () => {},
    onProfile: () => {},
    onPause: () => { hubPaused = true; if (state === 'playing') openPause(); },
    onResume: () => { hubPaused = false; },
    onLoadSlot: (slot, record) => {
      if (!record || !record.blob) return;
      applyLoadedBlob(record.blob);
      if (record.blob.run) startRun(null, null, record.blob.run);
      else toMenu();
    },
  });
  const init = await sdk.connect();
  if (init && init.settings) hubSettings = init.settings;
  applySettings();

  try {
    const auto = await sdk.loadState('auto');
    if (auto && auto.blob) applyLoadedBlob(auto.blob);
  } catch (e) { console.warn('autosave load:', e.message); }

  toMenu();
  requestAnimationFrame(rafLoop);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') openPause();
  });
  window.addEventListener('beforeunload', () => {
    if (run && state !== 'dead' && state !== 'win') {
      currentRunSnapshot = makeSnapshot();
    }
  });
}

boot();

// Read-only introspection for tests/debugging (no mutators).
window.__dungeonDebug = {
  get state() { return state; },
  get run() { return run; },
  get player() { return player; },
  get enemies() { return enemies; },
  get ragdolls() { return ragdolls; },
  get floorData() { return floorData; },
  get meta() { return meta; },
  get renderer() { return renderer; },      // THREE.WebGLRenderer — true 3D
  get world() { return world; },            // CANNON.World — true 3D physics
  get scene() { return scene; },
  get camera() { return camera; },
  THREE, CANNON,
};
