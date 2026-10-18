/* ============================================================================
   ANT COLONY â€” pheromone foraging simulation
   Gaming Empire Â· canvas2d Â· 100% offline
   ============================================================================ */

import { EmpireClient } from '../../shared/empire-sdk.js';

/* ============================== CONSTANTS ================================= */

const WORLD_W = 1920, WORLD_H = 1200;
const PC = 12, GW = WORLD_W / PC | 0, GH = WORLD_H / PC | 0, PCELLS = GW * GH;   // 160 x 100
const FOGC = 24, FW = WORLD_W / FOGC | 0, FH = WORLD_H / FOGC | 0;               // 80 x 50
const FGC = 120, FGW = Math.ceil(WORLD_W / FGC), FGH = Math.ceil(WORLD_H / FGC); // food buckets
const BKC = 64, BKW = Math.ceil(WORLD_W / BKC), BKH = Math.ceil(WORLD_H / BKC);  // ant buckets

const STEP = 1 / 60;
const MAX_STEPS = 7;
const DAY_LEN = 55;              // seconds of real time per in-game day at 1x
const TOTAL_DAYS = 20;
const DUSK = 0.70, NIGHT = 0.78, DAWN_END = 0.10;

const MAX_ANTS = 460;
const MAX_PARTICLES = 420;
const PH_CAP = 1.6;

const W = 0, S = 1, SO = 2;                      // castes
const FORAGE = 0, RETURN = 1, RALLY = 2, RAID = 3, INNEST = 4;
const PLAYER = 0, RIVAL = 1;

const CASTE = [
  { name: 'Worker',  speed: 54, sensor: 26, turn: 3.6, carry: 8, hp: 26, dmg: 6,  life: 9,  upkeep: 6,  cost: 14, incub: 14, wander: 0.55 },
  { name: 'Scout',   speed: 80, sensor: 46, turn: 4.4, carry: 5, hp: 20, dmg: 5,  life: 8,  upkeep: 8,  cost: 22, incub: 18, wander: 1.15 },
  { name: 'Soldier', speed: 60, sensor: 24, turn: 3.1, carry: 0, hp: 74, dmg: 21, life: 11, upkeep: 14, cost: 34, incub: 22, wander: 0.5 },
];

const FOOD_TYPES = {
  seed:  { name: 'Seed pile',  amount: 220, regen: 0,    color: '#d8b877', r: 13 },
  sugar: { name: 'Sugar',      amount: 340, regen: 0,    color: '#f2f0e2', r: 15 },
  aphid: { name: 'Aphid herd', amount: 150, regen: 0.55, color: '#8fd14f', r: 14 },
  crumb: { name: 'Crumb',      amount: 90,  regen: 0,    color: '#c79a5a', r: 9 },
};

const DIFFS = {
  easy:   { label: 'Meadow',   foodMul: 1.35, rivalMul: 0.62, upkeepMul: 0.85, beetleMul: 0.6,  rainMul: 0.6, startFood: 170 },
  normal: { label: 'Woodland', foodMul: 1.0,  rivalMul: 1.0,  upkeepMul: 1.0,  beetleMul: 1.0,  rainMul: 1.0, startFood: 130 },
  hard:   { label: 'Drought',  foodMul: 0.72, rivalMul: 1.45, upkeepMul: 1.18, beetleMul: 1.45, rainMul: 1.4, startFood: 105 },
};

const UPGRADES = [
  { key: 'tunnel',  ico: 'â›', name: 'Tunnels',      max: 5, base: 90,  mul: 1.75,
    desc: l => `+${250 * l} storage, +${2 * l} brood slots` },
  { key: 'nursery', ico: 'ðŸ¥š', name: 'Nursery',      max: 5, base: 110, mul: 1.7,
    desc: l => `Eggs hatch ${Math.round((1 - Math.max(0.32, 1 - l * 0.14)) * 100)}% faster` },
  { key: 'antenna', ico: 'ðŸ“¡', name: 'Antennae',     max: 5, base: 80,  mul: 1.7,
    desc: l => `+${l * 18}% scent range, +${l * 15}% trail focus` },
  { key: 'mandible',ico: 'ðŸ¦·', name: 'Mandibles',    max: 5, base: 100, mul: 1.7,
    desc: l => `+${l * 2} carry capacity, +${l * 25}% bite` },
  { key: 'gland',   ico: 'ðŸ’§', name: 'Scent Glands', max: 5, base: 95,  mul: 1.7,
    desc: l => `+${l * 22}% trail strength, trails last longer` },
  { key: 'endure',  ico: 'ðŸŒ¿', name: 'Endurance',    max: 5, base: 120, mul: 1.7,
    desc: l => `+${l * 12}% lifespan, +${l * 6}% speed` },
  { key: 'scout',   ico: 'â—‡',  name: 'Scout Corps',  max: 5, base: 130, mul: 1.6,
    desc: l => l === 1 ? 'Unlocks scouts â€” fast, far-seeing explorers' : `Scouts +${(l - 1) * 9}% speed & range` },
  { key: 'soldier', ico: 'âš”',  name: 'Soldier Caste',max: 5, base: 165, mul: 1.6,
    desc: l => l === 1 ? 'Unlocks soldiers â€” nest defence & raids' : `Soldiers +${(l - 1) * 20}% health & bite` },
];

const ACH = {
  first_harvest: 'First Harvest', trail_blazer: 'Trail Blazer', scout_squad: 'Eyes On The Meadow',
  standing_army: 'Standing Army', week_one: 'Week One', granary: 'Full Granary',
  deep_delve: 'Deep Delve', rival_routed: 'Rival Routed', long_haul: 'Twenty Days',
  untouched: 'Untouched Queen',
};

/* =============================== UTILITIES =============================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const $ = id => document.getElementById(id);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function fmt(n) { n = Math.round(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

/* ================================ AUDIO ================================== */

const SFX = {
  ctx: null, master: null, vol: 0.6, muted: false, rainG: null, rainSrc: null,
  lastDeposit: 0, lastFight: 0,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; },
  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.15), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noiseBurst(dur, gain, cutoff) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, Math.max(1, n), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
    const g = this.ctx.createGain(); g.gain.value = gain || 0.14;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },
  click() { this.tone(520, 0.055, 'square', 0.07, 700); },
  pickup(now) { if (now - this.lastDeposit < 0.08) return; this.tone(680 + Math.random() * 90, 0.06, 'triangle', 0.045, 900); },
  deposit(now) {
    if (now - this.lastDeposit < 0.11) return; this.lastDeposit = now;
    this.tone(420, 0.07, 'sine', 0.055, 620); this.tone(640, 0.06, 'sine', 0.035, 780, 0.05);
  },
  hatch() { this.tone(300, 0.1, 'triangle', 0.07, 560); this.tone(560, 0.12, 'sine', 0.05, 760, 0.08); },
  upgrade() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.09, null, i * 0.07)); },
  alarm() { for (let i = 0; i < 3; i++) { this.tone(180, 0.18, 'sawtooth', 0.09, 120, i * 0.22); } },
  fight(now) { if (now - this.lastFight < 0.22) return; this.lastFight = now; this.noiseBurst(0.07, 0.07, 2600); },
  beetle() { this.tone(90, 0.5, 'sawtooth', 0.1, 60); this.noiseBurst(0.4, 0.07, 500); },
  dayBell() { this.tone(523, 0.4, 'sine', 0.06, null); this.tone(784, 0.5, 'sine', 0.04, null, 0.1); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.1, null, i * 0.13)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, 'sawtooth', 0.09, f * 0.7, i * 0.17)); },
  rainOn() {
    if (!this.ctx || this.rainSrc || this.muted) return;
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    g.gain.linearRampToValueAtTime(0.075, this.ctx.currentTime + 1.5);
    this.rainSrc = src; this.rainG = g;
  },
  rainOff() {
    if (!this.rainSrc) return;
    const s = this.rainSrc, g = this.rainG; this.rainSrc = null; this.rainG = null;
    try { g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0); setTimeout(() => { try { s.stop(); } catch (e) {} }, 1300); }
    catch (e) { try { s.stop(); } catch (e2) {} }
  },
};

/* ============================== GAME STATE =============================== */

const G = {
  mode: 'menu', running: false, paused: false, over: false, speed: 1,
  seed: 1, diff: 'normal', cfg: DIFFS.normal,
  day: 1, dayT: 0, elapsed: 0,
  food: 130, foodCap: 400,
  queenHp: 100, queenMax: 100, queenWounded: false,
  ants: [], antFree: [], counts: [[0, 0, 0], [0, 0, 0]],
  brood: [], broodSlots: 4, targets: [25, 0, 0],
  up: {}, mods: {},
  foods: [], foodGrid: [], rocks: [],
  nests: [{ x: 300, y: 900, r: 34 }, { x: 1620, y: 300, r: 30 }],
  rival: { food: 0, hp: 700, maxHp: 700, spawnT: 0, nextRaid: 6, raiders: 0, dead: false },
  beetles: [],
  particles: [], pFree: [],
  beacons: [], beaconCd: 0,
  rally: null,
  weather: { type: 'clear', t: 0, dur: 0, next: 3, forecast: 'Clear skies' },
  fields: null, scratch: null,
  fogVis: null, fogSeen: null,
  buckets: null,
  cam: { x: 300, y: 900, z: 1 },
  stats: { gathered: 0, raised: 0, kills: 0, beetles: 0, peakPop: 0, deliveries: 0, upgrades: 0 },
  achDone: {}, achSent: {}, runAch: [],
  shake: 0, shakeMag: 0,
  playtime: 0, ptAcc: 0, saveAcc: 0, uiAcc: 0,
  incomeWin: 0, incomeAcc: 0,
  keys: {}, opts: { trails: true, fog: true, reduceFx: false, mute: false, vol: 0.6 },
  panelsHidden: false,
  best: { score: 0, days: 0 },
};

const VIEW = { w: 1280, h: 720, dpr: 1 };
const mouse = { sx: 0, sy: 0, x: 0, y: 0, inside: false, panning: false, px: 0, py: 0 };

let cv, ctx, terrainCv, terrainCtx, phCv, phCtx, phImg, fogCv, fogCtx, fogImg, mm, mmCtx;
let empire = null;
let rng = mulberry32(1);
let reducedMotion = false;
let phDirty = 0, fogDirty = 0, combatTick = 0;

/* ============================== WORLD GEN ================================ */

function allocGrids() {
  G.fields = [
    [new Float32Array(PCELLS), new Float32Array(PCELLS)],   // player: home, food
    [new Float32Array(PCELLS), new Float32Array(PCELLS)],   // rival:  home, food
  ];
  G.scratch = new Float32Array(PCELLS);
  G.fogVis = new Float32Array(FW * FH);
  G.fogSeen = new Uint8Array(FW * FH);
  G.buckets = new Array(BKW * BKH);
  for (let i = 0; i < G.buckets.length; i++) G.buckets[i] = [];
}

function clearGrids() {
  for (let c = 0; c < 2; c++) { G.fields[c][0].fill(0); G.fields[c][1].fill(0); }
  G.fogVis.fill(0); G.fogSeen.fill(0);
}

function makeTerrain() {
  if (!terrainCv) {
    terrainCv = document.createElement('canvas');
    terrainCv.width = WORLD_W; terrainCv.height = WORLD_H;
    terrainCtx = terrainCv.getContext('2d');
  }
  const t = terrainCtx;
  const r = mulberry32(G.seed ^ 0x9e37);
  // base soil
  const g = t.createLinearGradient(0, 0, WORLD_W, WORLD_H);
  g.addColorStop(0, '#241a0d'); g.addColorStop(0.5, '#1d1509'); g.addColorStop(1, '#171006');
  t.fillStyle = g; t.fillRect(0, 0, WORLD_W, WORLD_H);
  // soil blotches
  for (let i = 0; i < 340; i++) {
    const x = r() * WORLD_W, y = r() * WORLD_H, rad = 40 + r() * 190;
    const a = 0.018 + r() * 0.05;
    const gg = t.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() < 0.5;
    gg.addColorStop(0, warm ? `rgba(90,66,30,${a})` : `rgba(20,14,6,${a * 1.4})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = gg; t.beginPath(); t.arc(x, y, rad, 0, TAU); t.fill();
  }
  // grass tufts
  for (let i = 0; i < 260; i++) {
    const x = r() * WORLD_W, y = r() * WORLD_H;
    const n = 3 + (r() * 4 | 0);
    t.strokeStyle = `rgba(${60 + r() * 40 | 0},${90 + r() * 60 | 0},${34 + r() * 30 | 0},${0.18 + r() * 0.22})`;
    t.lineWidth = 1.2;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 1.5, len = 8 + r() * 16;
      t.beginPath(); t.moveTo(x, y);
      t.quadraticCurveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6,
        x + Math.cos(a) * len * 0.9 + (r() - 0.5) * 6, y + Math.sin(a) * len);
      t.stroke();
    }
  }
  // pebbles
  for (let i = 0; i < 500; i++) {
    const x = r() * WORLD_W, y = r() * WORLD_H, rad = 1 + r() * 3.4;
    t.fillStyle = `rgba(${110 + r() * 60 | 0},${100 + r() * 50 | 0},${86 + r() * 40 | 0},${0.1 + r() * 0.25})`;
    t.beginPath(); t.arc(x, y, rad, 0, TAU); t.fill();
  }
  // rocks (obstacles)
  for (const rk of G.rocks) {
    const gg = t.createRadialGradient(rk.x - rk.r * 0.3, rk.y - rk.r * 0.35, rk.r * 0.15, rk.x, rk.y, rk.r);
    gg.addColorStop(0, '#6b6155'); gg.addColorStop(0.65, '#463f36'); gg.addColorStop(1, '#241f19');
    t.fillStyle = gg;
    t.beginPath();
    const pts = 9;
    for (let i = 0; i <= pts; i++) {
      const a = i / pts * TAU, rr = rk.r * (0.86 + ((Math.sin(a * 3 + rk.x) + 1) * 0.5) * 0.2);
      const px = rk.x + Math.cos(a) * rr, py = rk.y + Math.sin(a) * rr;
      if (i === 0) t.moveTo(px, py); else t.lineTo(px, py);
    }
    t.closePath(); t.fill();
    t.strokeStyle = 'rgba(0,0,0,0.45)'; t.lineWidth = 2; t.stroke();
  }
  // vignette to the world edge
  const vg = t.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.35, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  t.fillStyle = vg; t.fillRect(0, 0, WORLD_W, WORLD_H);
}

function farFromAll(x, y, list, minD) {
  for (const o of list) { const dx = o.x - x, dy = o.y - y; if (dx * dx + dy * dy < minD * minD) return false; }
  return true;
}

function addFood(x, y, type, amountMul) {
  const T = FOOD_TYPES[type];
  const amt = T.amount * (amountMul || 1) * G.cfg.foodMul * (0.75 + rng() * 0.5);
  G.foods.push({
    x: clamp(x, 30, WORLD_W - 30), y: clamp(y, 30, WORLD_H - 30),
    type, amount: amt, max: amt, regen: T.regen * G.cfg.foodMul, found: false, r: T.r, pulse: 0,
  });
}

function spawnCluster(x, y, kind, n) {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = rng() * 60;
    addFood(x + Math.cos(a) * d, y + Math.sin(a) * d, kind, 1);
  }
}

function rebuildFoodGrid() {
  G.foodGrid = new Array(FGW * FGH);
  for (let i = 0; i < G.foodGrid.length; i++) G.foodGrid[i] = null;
  for (let i = 0; i < G.foods.length; i++) {
    const f = G.foods[i];
    const cx = clamp(f.x / FGC | 0, 0, FGW - 1), cy = clamp(f.y / FGC | 0, 0, FGH - 1);
    const k = cy * FGW + cx;
    if (!G.foodGrid[k]) G.foodGrid[k] = [];
    G.foodGrid[k].push(i);
  }
}

function nearestFood(x, y, rad) {
  const cx = clamp(x / FGC | 0, 0, FGW - 1), cy = clamp(y / FGC | 0, 0, FGH - 1);
  let best = -1, bestD = rad * rad;
  for (let dy = -1; dy <= 1; dy++) {
    const gy = cy + dy; if (gy < 0 || gy >= FGH) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx; if (gx < 0 || gx >= FGW) continue;
      const arr = G.foodGrid[gy * FGW + gx]; if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const f = G.foods[arr[i]]; if (!f || f.amount <= 0.4) continue;
        const ddx = f.x - x, ddy = f.y - y, d2 = ddx * ddx + ddy * ddy;
        if (d2 < bestD) { bestD = d2; best = arr[i]; }
      }
    }
  }
  return best;
}

function generateWorld(seed, diffKey) {
  G.seed = seed >>> 0;
  rng = mulberry32(G.seed);
  G.diff = diffKey; G.cfg = DIFFS[diffKey] || DIFFS.normal;

  // nests: opposite corners with jitter
  const side = rng() < 0.5;
  G.nests[0] = { x: side ? 250 + rng() * 180 : WORLD_W - 250 - rng() * 180, y: 780 + rng() * 300, r: 36 };
  G.nests[1] = { x: side ? WORLD_W - 260 - rng() * 160 : 260 + rng() * 160, y: 180 + rng() * 260, r: 32 };

  // rocks
  G.rocks = [];
  const avoid = [G.nests[0], G.nests[1]];
  for (let i = 0; i < 9; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const x = 120 + rng() * (WORLD_W - 240), y = 120 + rng() * (WORLD_H - 240), r = 26 + rng() * 44;
      if (farFromAll(x, y, avoid, 200) && farFromAll(x, y, G.rocks, 170)) { G.rocks.push({ x, y, r }); break; }
    }
  }

  // food
  G.foods = [];
  const n0 = G.nests[0];
  // two starter piles close to home so the first trail forms quickly
  for (let i = 0; i < 2; i++) {
    const a = rng() * TAU, d = 190 + rng() * 90;
    spawnCluster(n0.x + Math.cos(a) * d, n0.y + Math.sin(a) * d, i === 0 ? 'seed' : 'crumb', 3);
  }
  for (let i = 0; i < 11; i++) {
    for (let tries = 0; tries < 24; tries++) {
      const x = 110 + rng() * (WORLD_W - 220), y = 110 + rng() * (WORLD_H - 220);
      if (!farFromAll(x, y, G.rocks, 90)) continue;
      if (!farFromAll(x, y, avoid, 190)) continue;
      const roll = rng();
      const kind = roll < 0.34 ? 'seed' : roll < 0.6 ? 'crumb' : roll < 0.82 ? 'sugar' : 'aphid';
      spawnCluster(x, y, kind, 2 + (rng() * 3 | 0));
      break;
    }
  }
  // guaranteed aphid herds (renewable lifelines)
  for (let i = 0; i < 4; i++) {
    for (let tries = 0; tries < 24; tries++) {
      const x = 140 + rng() * (WORLD_W - 280), y = 140 + rng() * (WORLD_H - 280);
      if (farFromAll(x, y, G.rocks, 90) && farFromAll(x, y, avoid, 240)) { spawnCluster(x, y, 'aphid', 2); break; }
    }
  }
  rebuildFoodGrid();
  makeTerrain();
}

/* ================================ ANTS =================================== */

function newAnt() {
  return {
    alive: false, col: 0, type: 0, x: 0, y: 0, ang: 0, hp: 0, maxHp: 0,
    state: FORAGE, carry: 0, trip: 0, age: 0, life: 0, layT: 0, senseT: 0,
    target: -1, wait: 0, flash: 0, speedJit: 1, wob: 0,
  };
}

function spawnAnt(col, type, x, y, ang) {
  let a;
  if (G.antFree.length) a = G.ants[G.antFree.pop()];
  else {
    if (G.ants.length >= MAX_ANTS) return null;
    a = newAnt(); a.idx = G.ants.length; G.ants.push(a);
  }
  const C = CASTE[type];
  a.alive = true; a.col = col; a.type = type;
  a.x = x; a.y = y; a.ang = ang === undefined ? rng() * TAU : ang;
  a.maxHp = C.hp * (col === PLAYER ? (type === SO ? G.mods.soldierHp : 1) : rivalPower());
  a.hp = a.maxHp;
  a.state = INNEST; a.wait = 0.15 + rng() * 0.8;
  a.carry = 0; a.trip = 0; a.age = 0; a.flash = 0; a.target = -1;
  a.life = C.life * DAY_LEN * (col === PLAYER ? G.mods.life : 1) * (0.85 + rng() * 0.3);
  a.layT = rng() * 0.12; a.senseT = rng() * 0.15;
  a.speedJit = 0.9 + rng() * 0.2; a.wob = rng() * TAU;
  G.counts[col][type]++;
  return a;
}

function killAnt(a, silent) {
  if (!a.alive) return;
  a.alive = false;
  G.counts[a.col][a.type]--;
  G.antFree.push(a.idx);
  if (!silent) burst(a.x, a.y, 4, a.col === PLAYER ? '#c98a36' : '#9a7cff', 30, 0.5);
}

function rivalPower() {
  // rival ants get tougher as the days pass
  return (0.72 + G.day * 0.035) * G.cfg.rivalMul;
}

function recomputeMods() {
  const u = G.up;
  G.mods = {
    storage: 400 + u.tunnel * 250,
    broodSlots: 4 + u.tunnel * 2,
    incub: Math.max(0.32, 1 - u.nursery * 0.14),
    sensor: 1 + u.antenna * 0.18,
    follow: 1 + u.antenna * 0.15,
    carry: u.mandible * 2,
    bite: 1 + u.mandible * 0.25,
    ph: 1 + u.gland * 0.22,
    phKeep: u.gland * 0.055,
    life: 1 + u.endure * 0.12,
    speed: 1 + u.endure * 0.06,
    scoutOn: u.scout > 0,
    scoutBoost: 1 + Math.max(0, u.scout - 1) * 0.09,
    soldierOn: u.soldier > 0,
    soldierHp: 1 + Math.max(0, u.soldier - 1) * 0.2,
    soldierDmg: 1 + Math.max(0, u.soldier - 1) * 0.2,
  };
  G.foodCap = G.mods.storage;
  G.broodSlots = G.mods.broodSlots;
}

/* --------------------------- pheromone helpers --------------------------- */

function phSample(f, x, y) {
  const gx = x / PC | 0, gy = y / PC | 0;
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return -1;
  return f[gy * GW + gx];
}
function phDeposit(f, x, y, amt) {
  const gx = x / PC | 0, gy = y / PC | 0;
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
  const i = gy * GW + gx;
  const v = f[i] + amt;
  f[i] = v > PH_CAP ? PH_CAP : v;
}

function diffuseAll(dt) {
  const rain = G.weather.type === 'rain';
  const keepBase = rain ? 0.9885 : 0.9975;
  const s = G.scratch;
  for (let c = 0; c < 2; c++) {
    const keep = c === PLAYER ? Math.min(0.9992, keepBase + G.mods.phKeep * 0.0018) : keepBase;
    for (let k = 0; k < 2; k++) {
      const f = G.fields[c][k];
      for (let y = 0; y < GH; y++) {
        const row = y * GW;
        for (let x = 0; x < GW; x++) {
          const i = row + x;
          let sum = f[i] * 4;
          sum += x > 0 ? f[i - 1] : f[i];
          sum += x < GW - 1 ? f[i + 1] : f[i];
          sum += y > 0 ? f[i - GW] : f[i];
          sum += y < GH - 1 ? f[i + GW] : f[i];
          const v = (sum * 0.125) * keep;
          s[i] = v < 0.0006 ? 0 : v;
        }
      }
      f.set(s);
    }
  }
}

/* ------------------------------ ant update ------------------------------- */

function avoidRocks(a) {
  for (let i = 0; i < G.rocks.length; i++) {
    const r = G.rocks[i];
    const dx = a.x - r.x, dy = a.y - r.y;
    const d2 = dx * dx + dy * dy, rr = r.r + 4;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001;
      a.x = r.x + dx / d * rr; a.y = r.y + dy / d * rr;
      a.ang = Math.atan2(dy, dx) + (rng() - 0.5) * 1.2;
      return;
    }
  }
}

function updateAnt(a, dt, now) {
  const C = CASTE[a.type];
  const player = a.col === PLAYER;
  const M = G.mods;

  a.age += dt;
  if (a.flash > 0) a.flash -= dt;
  if (a.age > a.life) {
    if (player && a.type !== SO) G.food = Math.min(G.foodCap, G.food + 1);
    killAnt(a); return;
  }

  if (a.state === INNEST) {
    a.wait -= dt;
    if (a.wait <= 0) {
      const nest = G.nests[a.col];
      const ang = rng() * TAU;
      a.x = nest.x + Math.cos(ang) * (nest.r * 0.8);
      a.y = nest.y + Math.sin(ang) * (nest.r * 0.8);
      a.ang = ang; a.trip = 0;
      a.state = (a.type === SO) ? RALLY : FORAGE;
    }
    return;
  }

  a.trip += dt;
  const nest = G.nests[a.col];
  const enemyNest = G.nests[1 - a.col];

  // ---- weather / time modifiers
  const dayFrac = G.dayT / DAY_LEN;
  const night = dayFrac > NIGHT || dayFrac < DAWN_END;
  let sp = C.speed * a.speedJit;
  if (player) sp *= M.speed; else sp *= 0.96;
  if (player && a.type === S) sp *= M.scoutBoost;
  if (night) sp *= 0.72;
  if (G.weather.type === 'rain') sp *= 0.66;
  if (G.weather.type === 'cold') sp *= 0.85;

  let turn = C.turn;
  let steer = 0;
  const senseR = C.sensor * (player ? M.sensor : 1) * (player && a.type === S ? M.scoutBoost : 1);

  /* ---------------- SOLDIER / RAIDER behaviour ---------------- */
  if (a.type === SO || a.state === RAID) {
    let tx, ty, arriveR = 26;
    if (a.state === RAID) { tx = enemyNest.x; ty = enemyNest.y; arriveR = enemyNest.r + 8; }
    else if (player && G.rally) { tx = G.rally.x; ty = G.rally.y; arriveR = 34; }
    else { // patrol the nest
      const t = now * 0.35 + a.wob;
      tx = nest.x + Math.cos(t) * (nest.r + 46); ty = nest.y + Math.sin(t) * (nest.r + 46); arriveR = 16;
    }
    // chase nearby enemy
    const foe = findFoe(a, 130);
    if (foe) { tx = foe.x; ty = foe.y; arriveR = 5; }
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > arriveR) {
      const want = Math.atan2(dy, dx);
      steer = angDiff(a.ang, want);
      a.ang += clamp(steer, -turn * dt, turn * dt);
      a.ang += (rng() - 0.5) * 0.6 * dt;
    } else {
      a.ang += (rng() - 0.5) * 3 * dt;
      sp *= 0.35;
      // raiders gnaw at the enemy nest / queen
      if (a.state === RAID) {
        if (a.col === RIVAL) {
          const dmg = 2.6 * dt * G.cfg.rivalMul;
          G.queenHp -= dmg; G.queenWounded = true;
          if (rng() < dt * 2) burst(a.x, a.y, 1, '#ff6b5a', 22, 0.4);
        }
      }
    }
    // player soldiers rallied onto the rival nest tear it down
    if (player && G.rally && !G.rival.dead) {
      const rdx = enemyNest.x - a.x, rdy = enemyNest.y - a.y;
      if (rdx * rdx + rdy * rdy < (enemyNest.r + 26) * (enemyNest.r + 26)) {
        G.rival.hp -= 7 * dt * M.soldierDmg * M.bite;
        if (rng() < dt * 3) burst(a.x, a.y, 1, '#ffb04a', 30, 0.4);
      }
    }
    a.x += Math.cos(a.ang) * sp * dt; a.y += Math.sin(a.ang) * sp * dt;
    clampToWorld(a); avoidRocks(a);
    // soldiers also refresh the home trail lightly so they can be smelled
    return;
  }

  /* ---------------- FORAGER / RETURNER ---------------- */
  const homeF = G.fields[a.col][0], foodF = G.fields[a.col][1];
  const inNestZone = (a.x - nest.x) ** 2 + (a.y - nest.y) ** 2 < (nest.r + 12) ** 2;

  if (a.state === RETURN) {
    // follow home trail, with a homing bias that strengthens as the trip drags on
    const bias = clamp(0.18 + a.trip / 90, 0.18, 1);
    const want = Math.atan2(nest.y - a.y, nest.x - a.x);
    const dHome = Math.hypot(nest.x - a.x, nest.y - a.y);
    let follow = 0;
    if (dHome > 110) follow = senseGradient(homeF, a, senseR) * (player ? M.follow : 1);
    steer = angDiff(a.ang, want) * bias * 1.6 + follow * (1 - bias * 0.6);
    a.ang += clamp(steer, -turn * dt * 1.3, turn * dt * 1.3);
    a.ang += (rng() - 0.5) * 0.5 * dt;

    // lay food trail, strongest right after leaving the food
    a.layT -= dt;
    if (a.layT <= 0) {
      a.layT = 0.1;
      const str = Math.max(0.08, 1 - a.trip / 55);
      phDeposit(foodF, a.x, a.y, 0.085 * str * (player ? M.ph : 1));
    }
    if (inNestZone) {
      // deliver
      if (a.col === PLAYER) {
        G.food = Math.min(G.foodCap, G.food + a.carry);
        G.stats.gathered += a.carry; G.stats.deliveries++;
        G.incomeAcc += a.carry;
        SFX.deposit(now);
        if (G.stats.deliveries === 1) award('first_harvest', 1);
        awardProg('trail_blazer', G.stats.gathered, 400);
        burst(a.x, a.y, 3, '#a7e05a', 26, 0.45);
      } else {
        G.rival.food += a.carry;
      }
      a.carry = 0; a.trip = 0; a.state = INNEST; a.wait = 0.25 + rng() * 0.7;
      return;
    }
  } else {
    // FORAGE
    a.layT -= dt;
    if (a.layT <= 0) {
      a.layT = 0.1;
      const str = Math.max(0.08, 1 - a.trip / 55);
      phDeposit(homeF, a.x, a.y, 0.085 * str * (player ? M.ph : 1));
    }

    // exhausted foragers head home to rest
    if (a.trip > 105) { a.state = RETURN; a.trip = 40; }

    // sense food trail (scouts trust their nose less and wander more)
    if (!inNestZone) {
      const trust = (a.type === S ? 0.45 : 1) * (player ? M.follow : 1);
      const follow = senseGradient(foodF, a, senseR) * trust;
      steer += follow;
    } else {
      // walk straight out of the nest
      steer += angDiff(a.ang, Math.atan2(a.y - nest.y, a.x - nest.x)) * 0.7;
    }
    // beacons pull player foragers
    if (player && G.beacons.length) {
      for (let i = 0; i < G.beacons.length; i++) {
        const b = G.beacons[i];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < 260 * 260) {
          const w = 1.5 * (1 - Math.sqrt(d2) / 260);
          steer += angDiff(a.ang, Math.atan2(dy, dx)) * w;
        }
      }
    }
    a.ang += clamp(steer, -turn * dt, turn * dt);
    a.ang += (rng() - 0.5) * C.wander * (night ? 0.6 : 1) * dt * 3.2;

    // look for food
    a.senseT -= dt;
    if (a.senseT <= 0) {
      a.senseT = 0.13;
      const fi = nearestFood(a.x, a.y, 30 + senseR * 0.5);
      if (fi >= 0) {
        const f = G.foods[fi];
        const dx = f.x - a.x, dy = f.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < f.r + 6) {
          const cap = C.carry + (player ? M.carry : 0);
          const take = Math.min(cap, f.amount);
          if (take > 0.5) {
            f.amount -= take; f.pulse = 1;
            a.carry = take; a.state = RETURN; a.trip = 0;
            a.ang += Math.PI + (rng() - 0.5) * 0.8;
            if (player) {
              if (!f.found) { f.found = true; }
              SFX.pickup(now);
              phDeposit(foodF, a.x, a.y, 0.5 * M.ph);
              burst(a.x, a.y, 2, FOOD_TYPES[f.type].color, 20, 0.4);
            } else phDeposit(foodF, a.x, a.y, 0.5);
          }
        } else {
          // steer toward visible food
          a.ang += clamp(angDiff(a.ang, Math.atan2(dy, dx)), -turn * dt * 1.6, turn * dt * 1.6);
        }
      }
    }
  }

  a.x += Math.cos(a.ang) * sp * dt;
  a.y += Math.sin(a.ang) * sp * dt;
  clampToWorld(a);
  avoidRocks(a);
}

function clampToWorld(a) {
  if (a.x < 10) { a.x = 10; a.ang = Math.PI - a.ang + (rng() - 0.5) * 0.4; }
  else if (a.x > WORLD_W - 10) { a.x = WORLD_W - 10; a.ang = Math.PI - a.ang + (rng() - 0.5) * 0.4; }
  if (a.y < 10) { a.y = 10; a.ang = -a.ang + (rng() - 0.5) * 0.4; }
  else if (a.y > WORLD_H - 10) { a.y = WORLD_H - 10; a.ang = -a.ang + (rng() - 0.5) * 0.4; }
}

function senseGradient(f, a, r) {
  const c = Math.cos(a.ang), s = Math.sin(a.ang);
  const fx = a.x + c * r, fy = a.y + s * r;
  const la = a.ang - 0.62, ra = a.ang + 0.62;
  const lx = a.x + Math.cos(la) * r, ly = a.y + Math.sin(la) * r;
  const rx = a.x + Math.cos(ra) * r, ry = a.y + Math.sin(ra) * r;
  const cv2 = phSample(f, fx, fy), lv = phSample(f, lx, ly), rv = phSample(f, rx, ry);
  // outside the world reads -1 â†’ steer away from the edge
  if (cv2 < 0) return lv > rv ? -1.6 : 1.6;
  if (lv < 0) return 1.4;
  if (rv < 0) return -1.4;
  if (cv2 >= lv && cv2 >= rv) return 0;
  if (lv > rv) return -Math.min(1.5, 0.6 + (lv - cv2) * 5);
  return Math.min(1.5, 0.6 + (rv - cv2) * 5);
}

/* ------------------------------- combat ---------------------------------- */

function rebuildBuckets() {
  const b = G.buckets;
  for (let i = 0; i < b.length; i++) if (b[i].length) b[i].length = 0;
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.state === INNEST) continue;
    const cx = clamp(a.x / BKC | 0, 0, BKW - 1), cy = clamp(a.y / BKC | 0, 0, BKH - 1);
    b[cy * BKW + cx].push(a);
  }
}

function findFoe(a, r) {
  const cx = clamp(a.x / BKC | 0, 0, BKW - 1), cy = clamp(a.y / BKC | 0, 0, BKH - 1);
  const span = Math.max(1, Math.ceil(r / BKC));
  let best = null, bd = r * r;
  for (let dy = -span; dy <= span; dy++) {
    const gy = cy + dy; if (gy < 0 || gy >= BKH) continue;
    for (let dx = -span; dx <= span; dx++) {
      const gx = cx + dx; if (gx < 0 || gx >= BKW) continue;
      const arr = G.buckets[gy * BKW + gx];
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (o.col === a.col || !o.alive) continue;
        const ddx = o.x - a.x, ddy = o.y - a.y, d2 = ddx * ddx + ddy * ddy;
        if (d2 < bd) { bd = d2; best = o; }
      }
    }
  }
  return best;
}

function combatStep(dt, now) {
  const M = G.mods;
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.state === INNEST) continue;
    const foe = findFoe(a, 9);
    if (!foe) continue;
    let dmg = CASTE[a.type].dmg;
    if (a.col === PLAYER) dmg *= (a.type === SO ? M.soldierDmg : M.bite);
    else dmg *= rivalPower();
    foe.hp -= dmg * dt; foe.flash = 0.18;
    if (foe.hp <= 0) {
      if (foe.col === RIVAL) {
        G.stats.kills++;
        G.food = Math.min(G.foodCap, G.food + 3);
      }
      killAnt(foe);
      burst(foe.x, foe.y, 6, '#ff6b5a', 45, 0.5);
      SFX.fight(now);
    } else if (Math.random() < dt * 1.6) SFX.fight(now);
  }
}

/* ============================== NEST & ECONOMY =========================== */

function layEgg(type) {
  const cost = CASTE[type].cost;
  if (G.food < cost + 6) return false;
  if (G.brood.length >= G.broodSlots) return false;
  G.food -= cost;
  G.brood.push({ type, t: 0, dur: CASTE[type].incub * G.mods.incub });
  return true;
}

function broodStep(dt) {
  // hatch
  for (let i = G.brood.length - 1; i >= 0; i--) {
    const b = G.brood[i];
    b.t += dt;
    if (b.t >= b.dur) {
      G.brood.splice(i, 1);
      const n = G.nests[0];
      spawnAnt(PLAYER, b.type, n.x + (rng() - 0.5) * 20, n.y + (rng() - 0.5) * 20);
      G.stats.raised++;
      SFX.hatch();
      burst(n.x, n.y, 4, '#ffd88a', 26, 0.5);
      if (b.type === S) award('scout_squad', 1);
    }
  }
  // auto-lay toward the caste targets
  if (G.brood.length < G.broodSlots) {
    let bestType = -1, bestDef = 0;
    for (let t = 0; t < 3; t++) {
      if (t === S && !G.mods.scoutOn) continue;
      if (t === SO && !G.mods.soldierOn) continue;
      let inBrood = 0;
      for (const b of G.brood) if (b.type === t) inBrood++;
      const def = G.targets[t] - (G.counts[PLAYER][t] + inBrood);
      if (def > bestDef) { bestDef = def; bestType = t; }
    }
    if (bestType >= 0) layEgg(bestType);
  }
}

function economyStep(dt) {
  // upkeep
  let upkeep = 20; // the queen
  for (let t = 0; t < 3; t++) upkeep += G.counts[PLAYER][t] * CASTE[t].upkeep;
  upkeep *= G.cfg.upkeepMul;
  if (G.weather.type === 'cold') upkeep *= 1.3;
  if (G.day >= 15) upkeep *= 1.12;
  G.upkeepPerDay = upkeep;
  G.food -= upkeep * dt / DAY_LEN;

  if (G.food <= 0) {
    G.food = 0;
    // starvation: ants die and the queen weakens
    G.starveT = (G.starveT || 0) + dt;
    if (G.starveT > 1.4) {
      G.starveT = 0;
      G.queenHp -= 1.6;
      const alive = [];
      for (const a of G.ants) if (a.alive && a.col === PLAYER) alive.push(a);
      if (alive.length) {
        const v = alive[(rng() * alive.length) | 0];
        burst(v.x, v.y, 3, '#7a6a4a', 24, 0.5);
        killAnt(v, true);
      }
      if (!G.starveWarn || G.elapsed - G.starveWarn > 12) {
        G.starveWarn = G.elapsed;
        toast('Food stores empty â€” the colony is starving!', 'bad');
        SFX.alarm();
      }
    }
  } else G.starveT = 0;

  // aphid regrowth + food pulses
  for (let i = 0; i < G.foods.length; i++) {
    const f = G.foods[i];
    if (f.regen > 0 && f.amount < f.max) f.amount = Math.min(f.max, f.amount + f.regen * dt);
    if (f.pulse > 0) f.pulse -= dt * 2;
  }

  // queen slowly recovers if well fed and unthreatened
  if (G.food > G.foodCap * 0.25 && G.queenHp < G.queenMax) {
    G.queenHp = Math.min(G.queenMax, G.queenHp + 0.55 * dt);
  }

  const pop = G.counts[PLAYER][0] + G.counts[PLAYER][1] + G.counts[PLAYER][2];
  if (pop > G.stats.peakPop) G.stats.peakPop = pop;
  awardProg('granary', G.food, 1500);
  awardProg('standing_army', G.counts[PLAYER][SO], 15);
}

/* =============================== RIVAL AI ================================ */

function rivalStep(dt, now) {
  const R = G.rival;
  if (R.dead) return;
  if (R.hp <= 0) {
    R.dead = true; R.hp = 0;
    banner('RIVAL NEST RAZED', 'their trails go cold');
    toast('The rival colony is destroyed!', 'good');
    SFX.win();
    award('rival_routed', 1);
    shake(0.6, 9);
    for (let i = 0; i < 26; i++) burst(G.nests[1].x, G.nests[1].y, 3, '#9a7cff', 120, 1.1);
    return;
  }
  const pop = G.counts[RIVAL][0] + G.counts[RIVAL][1] + G.counts[RIVAL][2];
  const cap = Math.round((26 + G.day * 4.2) * G.cfg.rivalMul);
  R.spawnT -= dt;
  if (R.spawnT <= 0 && pop < cap) {
    R.spawnT = Math.max(0.7, 3.4 - G.day * 0.11) / G.cfg.rivalMul;
    const wantSoldier = G.day >= 4 && rng() < 0.24 + G.day * 0.012;
    const cost = wantSoldier ? 30 : 12;
    if (R.food >= cost) {
      R.food -= cost;
      const n = G.nests[1];
      spawnAnt(RIVAL, wantSoldier ? SO : W, n.x + (rng() - 0.5) * 18, n.y + (rng() - 0.5) * 18);
    } else {
      R.food += 6; // rival foragers we do not simulate individually top the store up slowly
    }
  }

  // raids
  if (G.day >= 5 && G.day >= R.nextRaid) {
    R.nextRaid = G.day + Math.max(1, 2.4 - G.day * 0.06);
    const size = Math.round(clamp(2 + (G.day - 4) * 0.9, 2, 16) * G.cfg.rivalMul);
    let sent = 0;
    for (const a of G.ants) {
      if (sent >= size) break;
      if (a.alive && a.col === RIVAL && a.state !== INNEST && (a.type === SO || rng() < 0.35)) {
        a.state = RAID; a.trip = 0; sent++;
      }
    }
    if (sent === 0) {
      const n = G.nests[1];
      for (let i = 0; i < Math.min(size, 5); i++) {
        const a = spawnAnt(RIVAL, SO, n.x, n.y);
        if (a) { a.state = RAID; a.wait = 0; }
      }
      sent = Math.min(size, 5);
    }
    R.raiders = sent;
    if (sent > 0) {
      banner('RAID INCOMING', `${sent} rival ${sent === 1 ? 'raider' : 'raiders'} marching on the nest`);
      toast('Rival raiders are heading for your queen!', 'bad');
      SFX.alarm();
    }
  }
}

/* ================================ BEETLES ================================ */

function spawnBeetle() {
  const edge = rng() * 4 | 0;
  let x, y;
  if (edge === 0) { x = 30; y = rng() * WORLD_H; }
  else if (edge === 1) { x = WORLD_W - 30; y = rng() * WORLD_H; }
  else if (edge === 2) { x = rng() * WORLD_W; y = 30; }
  else { x = rng() * WORLD_W; y = WORLD_H - 30; }
  G.beetles.push({ x, y, ang: rng() * TAU, hp: 210 + G.day * 12, maxHp: 210 + G.day * 12, t: 0, flash: 0, eat: 0 });
  toast('A ground beetle is prowling the meadow', 'bad');
  SFX.beetle();
}

function beetleStep(dt, now) {
  for (let i = G.beetles.length - 1; i >= 0; i--) {
    const b = G.beetles[i];
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    // hunt the nearest player ant, else drift along the strongest food trail
    let tx = null, ty = null, bd = 320 * 320;
    for (let k = 0; k < G.ants.length; k++) {
      const a = G.ants[k];
      if (!a.alive || a.col !== PLAYER || a.state === INNEST) continue;
      const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; tx = a.x; ty = a.y; }
      if (d2 < 20 * 20) {
        a.hp -= 42 * dt; a.flash = 0.2;
        if (a.hp <= 0) { killAnt(a); b.eat = 0.4; burst(a.x, a.y, 5, '#ff6b5a', 40, 0.5); }
      }
    }
    if (tx === null) { tx = G.nests[0].x; ty = G.nests[0].y; }
    const want = Math.atan2(ty - b.y, tx - b.x);
    b.ang += clamp(angDiff(b.ang, want), -1.5 * dt, 1.5 * dt) + (rng() - 0.5) * 0.6 * dt;
    const sp = 34 * (G.weather.type === 'rain' ? 0.8 : 1);
    b.x = clamp(b.x + Math.cos(b.ang) * sp * dt, 16, WORLD_W - 16);
    b.y = clamp(b.y + Math.sin(b.ang) * sp * dt, 16, WORLD_H - 16);
    if (b.eat > 0) b.eat -= dt;

    // soldiers bite back
    let dmg = 0;
    for (let k = 0; k < G.ants.length; k++) {
      const a = G.ants[k];
      if (!a.alive || a.col !== PLAYER || a.state === INNEST) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < 22 * 22) dmg += CASTE[a.type].dmg * (a.type === SO ? G.mods.soldierDmg : G.mods.bite) * 0.85;
    }
    if (dmg > 0) { b.hp -= dmg * dt; b.flash = 0.15; if (rng() < dt * 2) SFX.fight(now); }
    if (b.hp <= 0) {
      G.beetles.splice(i, 1);
      G.stats.beetles++;
      G.food = Math.min(G.foodCap, G.food + 70);
      toast('Beetle driven off â€” +70 food', 'good');
      burst(b.x, b.y, 16, '#7a5a2a', 70, 0.8);
      shake(0.3, 5);
      SFX.upgrade();
    }
  }
}

/* =============================== WEATHER ================================= */

function weatherStep(dt) {
  const w = G.weather;
  if (w.type !== 'clear') {
    w.t += dt;
    if (w.t >= w.dur) {
      if (w.type === 'rain') SFX.rainOff();
      w.type = 'clear'; w.t = 0;
      toast('The weather clears', 'good');
    }
  }
}

function rollDailyWeather() {
  const w = G.weather;
  const r = rng();
  if (G.day >= 8 && r < 0.3 * G.cfg.rainMul) {
    w.forecast = 'Rain expected';
  } else if (G.day >= 13 && r < 0.55) {
    w.forecast = 'Cold snap';
  } else {
    w.forecast = 'Clear skies';
  }
  w.pending = w.forecast;
  w.trigger = 0.25 + rng() * 0.35;   // fraction of the day it starts
  w.fired = false;
}

function weatherTrigger() {
  const w = G.weather;
  if (w.fired || w.pending === 'Clear skies') return;
  const frac = G.dayT / DAY_LEN;
  if (frac < w.trigger) return;
  w.fired = true;
  if (w.pending === 'Rain expected') {
    w.type = 'rain'; w.t = 0; w.dur = 16 + rng() * 14;
    banner('RAIN', 'trails are washing away');
    SFX.rainOn();
  } else {
    w.type = 'cold'; w.t = 0; w.dur = 26 + rng() * 16;
    banner('COLD SNAP', 'the colony burns more food');
  }
}

/* ============================== PARTICLES ================================ */

function burst(x, y, n, color, spd, life) {
  if (G.opts.reduceFx || reducedMotion) n = Math.min(n, 2);
  for (let i = 0; i < n; i++) {
    let p;
    if (G.pFree.length) p = G.particles[G.pFree.pop()];
    else {
      if (G.particles.length >= MAX_PARTICLES) return;
      p = { x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, c: '#fff', idx: G.particles.length };
      G.particles.push(p);
    }
    const a = rng() * TAU, s = spd * (0.35 + rng() * 0.8);
    p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
    p.t = 0; p.life = life * (0.7 + rng() * 0.6); p.c = color; p.alive = true;
  }
}

function particleStep(dt) {
  for (let i = 0; i < G.particles.length; i++) {
    const p = G.particles[i];
    if (!p.alive) continue;
    p.t += dt;
    if (p.t >= p.life) { p.alive = false; G.pFree.push(i); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
  }
}

function shake(t, mag) {
  if (G.opts.reduceFx || reducedMotion) return;
  G.shake = Math.max(G.shake, t); G.shakeMag = Math.max(G.shakeMag, mag);
}

/* =============================== FOG ===================================== */

function fogStep() {
  const vis = G.fogVis, seen = G.fogSeen;
  for (let i = 0; i < vis.length; i++) if (vis[i] > 0) vis[i] *= 0.86;
  const mark = (x, y, r) => {
    const cx = x / FOGC | 0, cy = y / FOGC | 0;
    for (let dy = -r; dy <= r; dy++) {
      const gy = cy + dy; if (gy < 0 || gy >= FH) continue;
      for (let dx = -r; dx <= r; dx++) {
        const gx = cx + dx; if (gx < 0 || gx >= FW) continue;
        if (dx * dx + dy * dy > r * r) continue;
        const i = gy * FW + gx;
        vis[i] = 1; seen[i] = 1;
      }
    }
  };
  mark(G.nests[0].x, G.nests[0].y, 4);
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.col !== PLAYER || a.state === INNEST) continue;
    mark(a.x, a.y, a.type === S ? 3 : 2);
  }
  for (const b of G.beacons) mark(b.x, b.y, 3);
  // reveal food piles that are inside seen ground
  for (const f of G.foods) {
    if (f.found) continue;
    const gx = f.x / FOGC | 0, gy = f.y / FOGC | 0;
    if (gx >= 0 && gy >= 0 && gx < FW && gy < FH && seen[gy * FW + gx]) f.found = true;
  }
}

/* ============================== BEACONS ================================== */

function placeBeacon(x, y) {
  if (G.mode !== 'play' || G.over) return;
  if (G.beaconCd > 0) { SFX.tone(180, 0.08, 'square', 0.05, 120); return; }
  if (G.food < 8) { toast('Not enough food for a beacon', 'bad'); return; }
  if (G.beacons.length >= 3) G.beacons.shift();
  G.food -= 8;
  G.beacons.push({ x, y, t: 0, dur: 18 });
  G.beaconCd = 4;
  SFX.tone(760, 0.14, 'triangle', 0.09, 1120);
  burst(x, y, 8, '#a7e05a', 60, 0.6);
}

function beaconStep(dt) {
  if (G.beaconCd > 0) G.beaconCd -= dt;
  const foodF = G.fields[PLAYER][1];
  for (let i = G.beacons.length - 1; i >= 0; i--) {
    const b = G.beacons[i];
    b.t += dt;
    if (b.t >= b.dur) { G.beacons.splice(i, 1); continue; }
    // beacons bloom a patch of food scent
    phDeposit(foodF, b.x, b.y, 0.9 * dt);
    for (let k = 0; k < 4; k++) {
      const a = rng() * TAU, d = rng() * 26;
      phDeposit(foodF, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 0.5 * dt);
    }
  }
}

/* ============================== SIM STEP ================================= */

function step(dt) {
  const now = G.elapsed;
  G.elapsed += dt;

  // ---- day cycle
  G.dayT += dt;
  weatherTrigger();
  if (G.dayT >= DAY_LEN) {
    G.dayT -= DAY_LEN;
    G.day++;
    onNewDay();
  }

  // ---- entities
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (a.alive) updateAnt(a, dt, now);
  }
  combatTick++;
  if (combatTick % 3 === 0) { rebuildBuckets(); combatStep(dt * 3, now); }
  broodStep(dt);
  economyStep(dt);
  rivalStep(dt, now);
  beetleStep(dt, now);
  weatherStep(dt);
  beaconStep(dt);
  particleStep(dt);

  phDirty++;
  if (phDirty % 6 === 0) diffuseAll(dt * 6);
  fogDirty++;
  if (fogDirty % 12 === 0) fogStep();

  if (G.shake > 0) { G.shake -= dt; if (G.shake <= 0) { G.shake = 0; G.shakeMag = 0; } }

  // ---- lose / win
  if (G.mode === 'play' && !G.over) {
    if (G.queenHp <= 0) { G.queenHp = 0; endRun(false, 'The queen has fallen.'); }
    else if (G.day > TOTAL_DAYS) endRun(true, 'Twenty days weathered.');
    else {
      const pop = G.counts[PLAYER][0] + G.counts[PLAYER][1] + G.counts[PLAYER][2];
      if (pop === 0 && G.brood.length === 0 && G.food < CASTE[W].cost + 6) {
        endRun(false, 'The last ant is gone and no eggs remain.');
      }
    }
  }
}

function onNewDay() {
  SFX.dayBell();
  rollDailyWeather();
  // new food appears; later days push it further out
  const n0 = G.nests[0];
  const clusters = 2 + (rng() < 0.5 ? 1 : 0) + (G.day > 10 ? 1 : 0);
  for (let i = 0; i < clusters; i++) {
    for (let tries = 0; tries < 26; tries++) {
      const minD = Math.min(760, 210 + G.day * 26);
      const a = rng() * TAU, d = minD + rng() * 330;
      const x = clamp(n0.x + Math.cos(a) * d, 90, WORLD_W - 90);
      const y = clamp(n0.y + Math.sin(a) * d, 90, WORLD_H - 90);
      if (!farFromAll(x, y, G.rocks, 80)) continue;
      const roll = rng();
      const kind = roll < 0.4 ? 'crumb' : roll < 0.72 ? 'seed' : roll < 0.92 ? 'sugar' : 'aphid';
      spawnCluster(x, y, kind, 2 + (rng() * 2 | 0));
      break;
    }
  }
  // prune exhausted non-renewable piles
  for (let i = G.foods.length - 1; i >= 0; i--) {
    const f = G.foods[i];
    if (f.regen <= 0 && f.amount < 0.5) G.foods.splice(i, 1);
  }
  rebuildFoodGrid();

  // beetles from day 4
  if (G.day >= 4) {
    const want = Math.min(4, Math.floor((G.day - 2) / 3 * G.cfg.beetleMul));
    if (G.beetles.length < want && rng() < 0.75) spawnBeetle();
  }

  if (G.mode === 'play') {
    awardProg('week_one', G.day - 1, 7);
    awardProg('long_haul', G.day - 1, TOTAL_DAYS);
    if (G.day <= TOTAL_DAYS) {
      banner(`DAY ${G.day}`, G.weather.forecast + (G.day === TOTAL_DAYS ? ' Â· final day' : ''));
      autoSave();
    }
  }
}

/* =============================== RENDER ================================== */

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  VIEW.w = w; VIEW.h = h; VIEW.dpr = dpr;
  cv.width = Math.max(1, Math.floor(w * dpr));
  cv.height = Math.max(1, Math.floor(h * dpr));
  clampCam();
}

function clampCam() {
  const halfW = VIEW.w / (2 * G.cam.z), halfH = VIEW.h / (2 * G.cam.z);
  if (halfW * 2 >= WORLD_W) G.cam.x = WORLD_W / 2;
  else G.cam.x = clamp(G.cam.x, halfW, WORLD_W - halfW);
  if (halfH * 2 >= WORLD_H) G.cam.y = WORLD_H / 2;
  else G.cam.y = clamp(G.cam.y, halfH, WORLD_H - halfH);
}

function screenToWorld(sx, sy) {
  return { x: (sx - VIEW.w / 2) / G.cam.z + G.cam.x, y: (sy - VIEW.h / 2) / G.cam.z + G.cam.y };
}

function dayTint() {
  const f = G.dayT / DAY_LEN;
  let dark = 0;
  if (f < DAWN_END) dark = lerp(0.62, 0, f / DAWN_END);
  else if (f > NIGHT) dark = lerp(0, 0.62, clamp((f - NIGHT) / (1 - NIGHT), 0, 1));
  else if (f > DUSK) dark = lerp(0, 0.28, (f - DUSK) / (NIGHT - DUSK));
  return dark;
}

function phaseName() {
  const f = G.dayT / DAY_LEN;
  if (f < DAWN_END) return 'Dawn';
  if (f < DUSK) return 'Day';
  if (f < NIGHT) return 'Dusk';
  return 'Night';
}

function buildPhImage() {
  if (!phCv) {
    phCv = document.createElement('canvas'); phCv.width = GW; phCv.height = GH;
    phCtx = phCv.getContext('2d');
    phImg = phCtx.createImageData(GW, GH);
  }
  const d = phImg.data;
  const pH = G.fields[PLAYER][0], pF = G.fields[PLAYER][1];
  const rH = G.fields[RIVAL][0], rF = G.fields[RIVAL][1];
  for (let i = 0, o = 0; i < PCELLS; i++, o += 4) {
    const h = pH[i], f = pF[i], rh = rH[i], rf = rF[i];
    const tot = h + f + rh + rf;
    if (tot < 0.004) { d[o + 3] = 0; continue; }
    const fh = Math.min(1, f * 1.5), hh = Math.min(1, h * 1.5);
    const rr = Math.min(1, (rf + rh * 0.6) * 1.4);
    d[o] = clamp(40 * fh + 30 * hh + 150 * rr, 0, 255);
    d[o + 1] = clamp(215 * fh + 90 * hh + 60 * rr, 0, 255);
    d[o + 2] = clamp(70 * fh + 220 * hh + 240 * rr, 0, 255);
    d[o + 3] = clamp((fh * 1.25 + hh * 0.55 + rr * 0.95) * 190, 0, 200);
  }
  phCtx.putImageData(phImg, 0, 0);
}

function buildFogImage() {
  if (!fogCv) {
    fogCv = document.createElement('canvas'); fogCv.width = FW; fogCv.height = FH;
    fogCtx = fogCv.getContext('2d');
    fogImg = fogCtx.createImageData(FW, FH);
  }
  const d = fogImg.data;
  const vis = G.fogVis, seen = G.fogSeen;
  for (let i = 0, o = 0; i < vis.length; i++, o += 4) {
    d[o] = 4; d[o + 1] = 3; d[o + 2] = 2;
    d[o + 3] = seen[i] ? (1 - vis[i]) * 118 : 236;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}

function drawAntGroup(col, type) {
  const list = G.ants;
  const zoom = G.cam.z;
  const bodyCol = col === PLAYER
    ? (type === W ? '#e5952f' : type === S ? '#63d7c4' : '#e0553a')
    : (type === SO ? '#8a5df0' : '#9a7cff');
  ctx.fillStyle = bodyCol;
  ctx.beginPath();
  const big = zoom > 0.85;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.col !== col || a.type !== type || a.state === INNEST) continue;
    if (!inViewport(a.x, a.y, 24)) continue;
    const c = Math.cos(a.ang), s = Math.sin(a.ang);
    const L = type === SO ? 4.2 : 3.4, Wd = type === SO ? 2.4 : 1.8;
    if (big) {
      ctx.moveTo(a.x + c * L, a.y + s * L);
      ctx.lineTo(a.x - c * L + s * Wd, a.y - s * L - c * Wd);
      ctx.lineTo(a.x - c * L * 0.5, a.y - s * L * 0.5);
      ctx.lineTo(a.x - c * L - s * Wd, a.y - s * L + c * Wd);
      ctx.closePath();
    } else {
      ctx.rect(a.x - 1.4, a.y - 1.4, 2.8, 2.8);
    }
  }
  ctx.fill();
}

function inViewport(x, y, pad) {
  const halfW = VIEW.w / (2 * G.cam.z) + pad, halfH = VIEW.h / (2 * G.cam.z) + pad;
  return x > G.cam.x - halfW && x < G.cam.x + halfW && y > G.cam.y - halfH && y < G.cam.y + halfH;
}

function drawNest(n, col) {
  const player = col === PLAYER;
  ctx.save();
  const g = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, n.r * 1.5);
  g.addColorStop(0, player ? 'rgba(60,42,14,0.95)' : 'rgba(46,32,66,0.95)');
  g.addColorStop(0.6, player ? 'rgba(42,30,10,0.85)' : 'rgba(34,24,52,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 1.5, 0, TAU); ctx.fill();

  // mound rings
  ctx.strokeStyle = player ? 'rgba(180,130,60,0.45)' : 'rgba(150,120,220,0.4)';
  ctx.lineWidth = 2;
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (i / 3), 0, TAU); ctx.stroke();
  }
  // entrance
  ctx.fillStyle = '#0a0603';
  ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.34, 0, TAU); ctx.fill();

  if (player) {
    // queen chamber glow + brood pips
    const pulse = 0.5 + 0.5 * Math.sin(G.elapsed * 2);
    ctx.fillStyle = `rgba(255,190,80,${0.18 + pulse * 0.12})`;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.5, 0, TAU); ctx.fill();
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd88a'; ctx.fillText('ðŸ‘‘', n.x, n.y + 1);
    // health ring
    const frac = clamp(G.queenHp / G.queenMax, 0, 1);
    ctx.strokeStyle = frac > 0.5 ? '#a7e05a' : frac > 0.25 ? '#ffb04a' : '#ff6b5a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
  } else {
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = G.rival.dead ? '#5a4a70' : '#c4b0ff';
    ctx.fillText(G.rival.dead ? 'â˜ ' : 'â™›', n.x, n.y + 1);
    if (!G.rival.dead) {
      const frac = clamp(G.rival.hp / G.rival.maxHp, 0, 1);
      ctx.strokeStyle = '#9a7cff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFood(f) {
  if (!inViewport(f.x, f.y, 40)) return;
  const T = FOOD_TYPES[f.type];
  const frac = clamp(f.amount / Math.max(1, f.max), 0, 1);
  if (frac < 0.02) return;
  const r = f.r * (0.45 + frac * 0.55) + (f.pulse > 0 ? f.pulse * 3 : 0);
  ctx.save();
  if (f.type === 'aphid') {
    ctx.fillStyle = 'rgba(60,110,40,0.55)';
    ctx.beginPath(); ctx.arc(f.x, f.y, r + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = T.color;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + f.x * 0.01;
      ctx.beginPath(); ctx.ellipse(f.x + Math.cos(a) * r * 0.55, f.y + Math.sin(a) * r * 0.55, 3.1, 2.3, a, 0, TAU); ctx.fill();
    }
  } else if (f.type === 'sugar') {
    ctx.fillStyle = T.color;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      const px = f.x + Math.cos(a) * r * 0.5, py = f.y + Math.sin(a) * r * 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py - 3.4); ctx.lineTo(px + 3.2, py); ctx.lineTo(px, py + 3.4); ctx.lineTo(px - 3.2, py);
      ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = T.color;
    const n = f.type === 'seed' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + f.y * 0.01;
      ctx.beginPath();
      ctx.ellipse(f.x + Math.cos(a) * r * 0.5, f.y + Math.sin(a) * r * 0.5, 3.6, 2.6, a, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBeetle(b) {
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.ang);
  ctx.fillStyle = b.flash > 0 ? '#ffd0c0' : '#2a2018';
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 8.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = b.flash > 0 ? '#fff' : '#4a3a22';
  ctx.beginPath(); ctx.ellipse(-2, 0, 9, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0d0a06'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(4, 0); ctx.stroke();
  ctx.fillStyle = '#1a1410';
  ctx.beginPath(); ctx.arc(11, 0, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1.6;
  for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(-6 + i * 6, 6 * s); ctx.lineTo(-9 + i * 7, 12 * s); ctx.stroke();
  }
  ctx.restore();
  // health bar
  if (b.hp < b.maxHp) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 14, b.y - 17, 28, 3.4);
    ctx.fillStyle = '#ff6b5a'; ctx.fillRect(b.x - 14, b.y - 17, 28 * clamp(b.hp / b.maxHp, 0, 1), 3.4);
  }
}

function render() {
  const dpr = VIEW.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.fillStyle = '#0a0703';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  let ox = 0, oy = 0;
  if (G.shake > 0) { ox = (Math.random() - 0.5) * G.shakeMag; oy = (Math.random() - 0.5) * G.shakeMag; }

  const z = G.cam.z;
  ctx.setTransform(dpr * z, 0, 0, dpr * z,
    dpr * (VIEW.w / 2 - G.cam.x * z + ox), dpr * (VIEW.h / 2 - G.cam.y * z + oy));

  // ---- terrain
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrainCv, 0, 0);

  // ---- pheromones
  if (G.opts.trails) {
    if (phDirty % 4 === 0 || !phCv) buildPhImage();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.62;
    ctx.drawImage(phCv, 0, 0, GW, GH, 0, 0, WORLD_W, WORLD_H);
    ctx.restore();
  }

  // ---- beacons
  for (const b of G.beacons) {
    const life = 1 - b.t / b.dur;
    const pr = 22 + Math.sin(G.elapsed * 4 + b.x) * 4;
    ctx.strokeStyle = `rgba(167,224,90,${0.25 + life * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, pr, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, pr * 0.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(167,224,90,${0.1 + life * 0.15})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, pr, 0, TAU); ctx.fill();
  }

  // ---- rally flag
  if (G.rally) {
    const y = G.rally.y - 20 + Math.sin(G.elapsed * 3) * 2;
    ctx.strokeStyle = '#ff8f6b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(G.rally.x, G.rally.y); ctx.lineTo(G.rally.x, y); ctx.stroke();
    ctx.fillStyle = '#ff6b5a';
    ctx.beginPath(); ctx.moveTo(G.rally.x, y); ctx.lineTo(G.rally.x + 15, y + 5); ctx.lineTo(G.rally.x, y + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,90,0.5)';
    ctx.beginPath(); ctx.arc(G.rally.x, G.rally.y, 34, 0, TAU); ctx.stroke();
  }

  // ---- food
  for (let i = 0; i < G.foods.length; i++) drawFood(G.foods[i]);

  // ---- nests
  drawNest(G.nests[1], RIVAL);
  drawNest(G.nests[0], PLAYER);

  // ---- ants
  for (let c = 0; c < 2; c++) for (let t = 0; t < 3; t++) drawAntGroup(c, t);

  // carried food + damage flashes
  ctx.fillStyle = '#e9ff9e';
  ctx.beginPath();
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.carry <= 0 || a.state === INNEST) continue;
    if (!inViewport(a.x, a.y, 20)) continue;
    ctx.rect(a.x + Math.cos(a.ang) * 4.4 - 1.5, a.y + Math.sin(a.ang) * 4.4 - 1.5, 3, 3);
  }
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.flash <= 0 || a.state === INNEST) continue;
    if (!inViewport(a.x, a.y, 20)) continue;
    ctx.rect(a.x - 2.5, a.y - 2.5, 5, 5);
  }
  ctx.fill();

  // ---- beetles
  for (const b of G.beetles) if (inViewport(b.x, b.y, 40)) drawBeetle(b);

  // ---- particles
  for (let i = 0; i < G.particles.length; i++) {
    const p = G.particles[i];
    if (!p.alive) continue;
    const t = 1 - p.t / p.life;
    ctx.globalAlpha = t;
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // ---- fog of war
  if (G.opts.fog) {
    if (fogDirty % 12 === 0 || !fogCv) buildFogImage();
    ctx.drawImage(fogCv, 0, 0, FW, FH, 0, 0, WORLD_W, WORLD_H);
  }

  // ---- night tint + nest glow
  const dark = dayTint();
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(6,10,30,${dark})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const n = G.nests[0];
    const g = ctx.createRadialGradient(n.x, n.y, 4, n.x, n.y, 170);
    g.addColorStop(0, `rgba(255,180,80,${0.22 * dark})`);
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 170, 0, TAU); ctx.fill();
  }

  // ---- rain streaks (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.weather.type === 'rain' && !G.opts.reduceFx && !reducedMotion) {
    ctx.strokeStyle = 'rgba(160,190,230,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const t = G.elapsed * 900;
    for (let i = 0; i < 130; i++) {
      const x = (i * 137.5 + t * 0.6) % (VIEW.w + 60) - 30;
      const y = (i * 311.7 + t) % (VIEW.h + 60) - 30;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,45,70,0.16)'; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (G.weather.type === 'cold') {
    ctx.fillStyle = 'rgba(120,160,220,0.09)'; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  // ---- off-screen raid marker
  if (G.mode === 'play') drawThreatMarkers();
}

function drawThreatMarkers() {
  let raiders = 0, rx = 0, ry = 0;
  for (const a of G.ants) if (a.alive && a.col === RIVAL && a.state === RAID) { raiders++; rx += a.x; ry += a.y; }
  if (raiders === 0) return;
  rx /= raiders; ry /= raiders;
  if (inViewport(rx, ry, -20)) return;
  const sx = (rx - G.cam.x) * G.cam.z + VIEW.w / 2;
  const sy = (ry - G.cam.y) * G.cam.z + VIEW.h / 2;
  const cxp = clamp(sx, 40, VIEW.w - 40), cyp = clamp(sy, 60, VIEW.h - 40);
  ctx.save();
  ctx.fillStyle = 'rgba(255,107,90,0.85)';
  ctx.beginPath(); ctx.arc(cxp, cyp, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a0d08'; ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('âš”', cxp, cyp + 1);
  ctx.fillStyle = '#ffd3cc'; ctx.font = 'bold 10px sans-serif';
  ctx.fillText(String(raiders), cxp, cyp + 21);
  ctx.restore();
}

function drawMinimap() {
  if (!mmCtx) return;
  const w = mm.width, h = mm.height;
  const sx = w / WORLD_W, sy = h / WORLD_H;
  mmCtx.fillStyle = '#0b0805'; mmCtx.fillRect(0, 0, w, h);
  // explored ground
  mmCtx.fillStyle = '#241a0d';
  const cw = FOGC * sx, ch = FOGC * sy;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (G.fogSeen[y * FW + x]) mmCtx.fillRect(x * FOGC * sx, y * FOGC * sy, cw + 1, ch + 1);
  }
  // rocks
  mmCtx.fillStyle = '#3a332b';
  for (const r of G.rocks) { mmCtx.beginPath(); mmCtx.arc(r.x * sx, r.y * sy, r.r * sx, 0, TAU); mmCtx.fill(); }
  // food
  for (const f of G.foods) {
    if (!f.found || f.amount < 1) continue;
    mmCtx.fillStyle = FOOD_TYPES[f.type].color;
    mmCtx.fillRect(f.x * sx - 2, f.y * sy - 2, 4, 4);
  }
  // ants
  for (let i = 0; i < G.ants.length; i++) {
    const a = G.ants[i];
    if (!a.alive || a.state === INNEST) continue;
    if (a.col === RIVAL) {
      const gx = a.x / FOGC | 0, gy = a.y / FOGC | 0;
      if (!(gx >= 0 && gy >= 0 && gx < FW && gy < FH && G.fogVis[gy * FW + gx] > 0.05)) continue;
      mmCtx.fillStyle = '#9a7cff';
    } else mmCtx.fillStyle = a.type === SO ? '#ff8f6b' : a.type === S ? '#7fe0d0' : '#e5952f';
    mmCtx.fillRect(a.x * sx - 1, a.y * sy - 1, 2.4, 2.4);
  }
  // beetles
  mmCtx.fillStyle = '#ffffff';
  for (const b of G.beetles) {
    const gx = b.x / FOGC | 0, gy = b.y / FOGC | 0;
    if (gx >= 0 && gy >= 0 && gx < FW && gy < FH && G.fogVis[gy * FW + gx] > 0.05) mmCtx.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4);
  }
  // nests
  mmCtx.strokeStyle = '#ffb04a'; mmCtx.lineWidth = 2;
  mmCtx.beginPath(); mmCtx.arc(G.nests[0].x * sx, G.nests[0].y * sy, 6, 0, TAU); mmCtx.stroke();
  mmCtx.strokeStyle = G.rival.dead ? '#4a4060' : '#9a7cff';
  mmCtx.beginPath(); mmCtx.arc(G.nests[1].x * sx, G.nests[1].y * sy, 5, 0, TAU); mmCtx.stroke();
  // viewport rect
  const vw = VIEW.w / G.cam.z * sx, vh = VIEW.h / G.cam.z * sy;
  mmCtx.strokeStyle = 'rgba(255,255,255,0.5)'; mmCtx.lineWidth = 1.5;
  mmCtx.strokeRect(G.cam.x * sx - vw / 2, G.cam.y * sy - vh / 2, vw, vh);
}

/* ================================= UI ==================================== */

const ui = {};
function cacheUI() {
  const ids = ['hud', 'hudDay', 'hudPhase', 'hudWeather', 'dayFill', 'hudFood', 'hudFoodCap', 'hudFoodRate',
    'foodFill', 'hudPop', 'hudWorkers', 'hudScouts', 'hudSoldiers', 'hudBrood', 'hudQueen', 'queenFill',
    'hudRival', 'rivalFill', 'panelLeft', 'panelRight', 'bottomBar', 'minimapWrap', 'upgradeList',
    'tgtWorker', 'tgtScout', 'tgtSoldier', 'rowScout', 'rowSoldier', 'scoutSub', 'soldierSub', 'broodBar',
    'stGathered', 'stUpkeep', 'stIncome', 'stPiles', 'stKills', 'beaconFill', 'toastWrap', 'eventBanner',
    'mainMenu', 'newMenu', 'howTo', 'settings', 'pauseMenu', 'resultMenu', 'pauseSub', 'diffNote',
    'menuBest', 'menuDays', 'btnContinue', 'resultIcon', 'resultRating', 'resultTitle', 'resultSub',
    'rsDays', 'rsFood', 'rsPeak', 'rsRaised', 'rsKills', 'rsBeetles', 'rsUpg', 'rsRival', 'rsScore', 'rsAch',
    'volVal', 'volSlider', 'optMute', 'optFx', 'optTrails', 'optFog', 'spd1', 'spd2', 'spd3'];
  for (const id of ids) ui[id] = $(id);
}

let lastToast = 0;
function toast(msg, cls) {
  const now = performance.now();
  if (now - lastToast < 60) return;
  lastToast = now;
  const d = document.createElement('div');
  d.className = 'toast' + (cls ? ' ' + cls : '');
  d.textContent = msg;
  ui.toastWrap.appendChild(d);
  while (ui.toastWrap.children.length > 5) ui.toastWrap.removeChild(ui.toastWrap.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3400);
}

function banner(title, sub) {
  const el = ui.eventBanner;
  el.innerHTML = '';
  el.appendChild(document.createTextNode(title));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function showHudChrome(on) {
  const cls = on ? 'remove' : 'add';
  ui.hud.classList[cls]('hidden');
  ui.panelLeft.classList[cls]('hidden');
  ui.panelRight.classList[cls]('hidden');
  ui.bottomBar.classList[cls]('hidden');
  ui.minimapWrap.classList[cls]('hidden');
}

function buildUpgradeList() {
  const list = ui.upgradeList;
  list.innerHTML = '';
  for (const u of UPGRADES) {
    const div = document.createElement('div');
    div.className = 'upg';
    div.dataset.key = u.key;
    div.innerHTML =
      `<div class="top"><span class="ico">${u.ico}</span><span class="nm">${u.name}</span><span class="cost"></span></div>` +
      `<div class="lv">${'<i></i>'.repeat(u.max)}</div><div class="ds"></div>`;
    div.addEventListener('click', () => buyUpgrade(u.key));
    list.appendChild(div);
  }
  refreshUpgrades();
}

function upgCost(u) { return Math.round(u.base * Math.pow(u.mul, G.up[u.key])); }

function refreshUpgrades() {
  const nodes = ui.upgradeList.children;
  for (let i = 0; i < nodes.length; i++) {
    const div = nodes[i], u = UPGRADES[i];
    const lv = G.up[u.key];
    const maxed = lv >= u.max;
    const cost = upgCost(u);
    div.classList.toggle('maxed', maxed);
    div.classList.toggle('poor', !maxed && G.food < cost);
    div.querySelector('.cost').textContent = maxed ? 'MAX' : cost + ' ðŸ¯';
    const pips = div.querySelectorAll('.lv i');
    for (let k = 0; k < pips.length; k++) pips[k].classList.toggle('on', k < lv);
    div.querySelector('.ds').textContent = maxed ? u.desc(lv) : u.desc(lv + 1);
  }
}

function buyUpgrade(key) {
  const u = UPGRADES.find(x => x.key === key);
  if (!u || G.mode !== 'play' || G.over) return;
  const lv = G.up[key];
  if (lv >= u.max) return;
  const cost = upgCost(u);
  if (G.food < cost) { toast('Not enough food â€” ' + cost + ' needed', 'bad'); SFX.tone(160, 0.1, 'square', 0.06, 110); return; }
  G.food -= cost;
  G.up[key] = lv + 1;
  G.stats.upgrades++;
  recomputeMods();
  SFX.upgrade();
  toast(`${u.name} â†’ level ${lv + 1}`, 'good');
  burst(G.nests[0].x, G.nests[0].y, 10, '#ffd88a', 60, 0.8);
  if (key === 'scout' && lv === 0) {
    G.targets[S] = Math.max(G.targets[S], 4);
    toast('Scouts unlocked â€” set a target on the left', 'good');
  }
  if (key === 'soldier' && lv === 0) {
    G.targets[SO] = Math.max(G.targets[SO], 4);
    toast('Soldiers unlocked â€” rally them with R', 'good');
  }
  if (key === 'tunnel') awardProg('deep_delve', G.up.tunnel, 5);
  refreshUpgrades(); refreshCastePanel();
}

function refreshCastePanel() {
  ui.tgtWorker.textContent = G.targets[W];
  ui.tgtScout.textContent = G.targets[S];
  ui.tgtSoldier.textContent = G.targets[SO];
  ui.rowScout.classList.toggle('locked', !G.mods.scoutOn);
  ui.rowSoldier.classList.toggle('locked', !G.mods.soldierOn);
  ui.scoutSub.textContent = G.mods.scoutOn ? 'Fast explorers, weak carriers' : 'Locked â€” buy Scout Corps';
  ui.soldierSub.textContent = G.mods.soldierOn ? 'Defend the nest, raid the rival' : 'Locked â€” buy Soldier Caste';
}

function refreshBroodBar() {
  const bar = ui.broodBar;
  const need = G.broodSlots;
  while (bar.children.length < need) {
    const d = document.createElement('div'); d.className = 'pip'; d.appendChild(document.createElement('i'));
    bar.appendChild(d);
  }
  while (bar.children.length > need) bar.removeChild(bar.lastChild);
  for (let i = 0; i < need; i++) {
    const pip = bar.children[i], b = G.brood[i];
    if (!b) { pip.className = 'pip empty'; pip.firstChild.style.height = '0%'; }
    else {
      pip.className = 'pip' + (b.type === S ? ' s' : b.type === SO ? ' so' : '');
      pip.firstChild.style.height = Math.round(clamp(b.t / b.dur, 0, 1) * 100) + '%';
    }
  }
}

function refreshHud() {
  const c = G.counts[PLAYER];
  const pop = c[0] + c[1] + c[2];
  ui.hudDay.textContent = Math.min(G.day, TOTAL_DAYS);
  ui.hudPhase.textContent = phaseName();
  ui.hudWeather.textContent = G.weather.type === 'rain' ? 'ðŸŒ§ Raining'
    : G.weather.type === 'cold' ? 'â„ Cold snap'
    : (G.weather.forecast || 'Clear skies');
  ui.dayFill.style.width = (G.dayT / DAY_LEN * 100).toFixed(1) + '%';
  ui.hudFood.textContent = Math.floor(G.food);
  ui.hudFoodCap.textContent = G.foodCap;
  ui.foodFill.style.width = clamp(G.food / G.foodCap * 100, 0, 100).toFixed(1) + '%';
  const net = G.incomeWin - (G.upkeepPerDay || 0);
  ui.hudFoodRate.textContent = (net >= 0 ? '+' : '') + Math.round(net) + '/day';
  ui.hudFoodRate.style.color = net >= 0 ? 'var(--leaf)' : 'var(--danger)';
  ui.hudPop.textContent = pop;
  ui.hudWorkers.textContent = c[0];
  ui.hudScouts.textContent = c[1];
  ui.hudSoldiers.textContent = c[2];
  ui.hudBrood.textContent = `Brood ${G.brood.length}/${G.broodSlots}`;
  const qf = clamp(G.queenHp / G.queenMax, 0, 1);
  ui.hudQueen.textContent = Math.round(qf * 100) + '%';
  ui.queenFill.style.width = (qf * 100).toFixed(1) + '%';
  const rf = G.rival.dead ? 0 : clamp(G.rival.hp / G.rival.maxHp, 0, 1);
  ui.hudRival.textContent = G.rival.dead ? 'RAZED' : Math.round(rf * 100) + '%';
  ui.rivalFill.style.width = (rf * 100).toFixed(1) + '%';
  ui.stGathered.textContent = fmt(G.stats.gathered);
  ui.stUpkeep.textContent = Math.round(G.upkeepPerDay || 0) + '/day';
  ui.stIncome.textContent = Math.round(G.incomeWin) + '/day';
  let piles = 0;
  for (const f of G.foods) if (f.found && f.amount > 1) piles++;
  ui.stPiles.textContent = piles;
  ui.stKills.textContent = G.stats.kills;
  ui.beaconFill.style.width = (G.beaconCd > 0 ? (1 - G.beaconCd / 4) * 100 : 100).toFixed(0) + '%';
  ui.beaconFill.style.background = G.beaconCd > 0 ? '#c98a36' : (G.food >= 8 ? '#a7e05a' : '#ff6b5a');
  refreshBroodBar();
  refreshUpgrades();
}

function setSpeed(s) {
  G.speed = s;
  ui.spd1.classList.toggle('on', s === 1);
  ui.spd2.classList.toggle('on', s === 2);
  ui.spd3.classList.toggle('on', s === 3);
}

/* =========================== ACHIEVEMENTS ================================ */

function award(id, prog) {
  if (G.mode !== 'play') return;
  if (G.achDone[id]) return;
  G.achDone[id] = true;
  if (ACH[id] && G.runAch.indexOf(id) < 0) G.runAch.push(id);
  toast('ðŸ… ' + (ACH[id] || id), 'ach');
  SFX.tone(880, 0.18, 'triangle', 0.09, 1320);
  if (empire) empire.unlockAchievement(id, 1).catch(() => {});
}

function awardProg(id, value, target) {
  if (G.achDone[id]) return;
  const frac = clamp(value / target, 0, 1);
  if (frac >= 1) { award(id, 1); return; }
  const last = G.achSent[id] || 0;
  if (frac - last >= 0.1) {
    G.achSent[id] = frac;
    if (empire) empire.unlockAchievement(id, frac).catch(() => {});
  }
}

/* ============================== SAVE / LOAD ============================== */

function saveBlob() {
  return {
    v: 1, seed: G.seed, diff: G.diff, day: G.day, dayT: G.dayT, elapsed: G.elapsed,
    food: G.food, queenHp: G.queenHp, queenWounded: G.queenWounded,
    up: Object.assign({}, G.up), targets: G.targets.slice(),
    counts: [G.counts[0].slice(), G.counts[1].slice()],
    stats: Object.assign({}, G.stats),
    rival: { food: G.rival.food, hp: G.rival.hp, maxHp: G.rival.maxHp, nextRaid: G.rival.nextRaid, dead: G.rival.dead },
    brood: G.brood.map(b => [b.type, b.t, b.dur]),
    foods: G.foods.map(f => [Math.round(f.x), Math.round(f.y), f.type, Math.round(f.amount), Math.round(f.max), f.found ? 1 : 0]),
    beetles: G.beetles.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.hp), Math.round(b.maxHp)]),
    weather: { type: G.weather.type, t: G.weather.t, dur: G.weather.dur, forecast: G.weather.forecast, pending: G.weather.pending, trigger: G.weather.trigger, fired: G.weather.fired },
    ach: Object.assign({}, G.achDone), runAch: G.runAch.slice(),
    playtime: Math.round(G.playtime),
  };
}

async function autoSave() {
  if (!empire || G.mode !== 'play' || G.over) return;
  try {
    await empire.saveState('auto', saveBlob(), {
      label: `Day ${Math.min(G.day, TOTAL_DAYS)} Â· ${G.counts[0][0] + G.counts[0][1] + G.counts[0][2]} ants`,
      playtimeSec: Math.round(G.playtime),
      progress: clamp((G.day - 1) / TOTAL_DAYS, 0, 1),
      difficulty: G.diff, seed: G.seed, mode: 'survival',
    });
    await empire.setContinuePoint('auto', `Day ${Math.min(G.day, TOTAL_DAYS)}`);
    ui.btnContinue.disabled = false;
  } catch (e) { /* ignore */ }
}

function applyBlob(b) {
  generateWorld(b.seed, b.diff || 'normal');
  allocGrids(); clearGrids();
  G.day = b.day; G.dayT = b.dayT; G.elapsed = b.elapsed || 0;
  G.food = b.food; G.queenHp = b.queenHp; G.queenMax = 100;
  G.queenWounded = !!b.queenWounded;
  G.up = Object.assign({ tunnel: 0, nursery: 0, antenna: 0, mandible: 0, gland: 0, endure: 0, scout: 0, soldier: 0 }, b.up || {});
  G.targets = (b.targets || [25, 0, 0]).slice();
  G.stats = Object.assign({ gathered: 0, raised: 0, kills: 0, beetles: 0, peakPop: 0, deliveries: 0, upgrades: 0 }, b.stats || {});
  G.rival = Object.assign({ food: 0, hp: 700, maxHp: 700, spawnT: 0, nextRaid: 6, raiders: 0, dead: false }, b.rival || {});
  G.achDone = Object.assign({}, b.ach || {});
  G.achSent = {};
  G.runAch = (b.runAch || []).slice();
  G.playtime = b.playtime || 0;
  recomputeMods();

  if (b.foods) {
    G.foods = b.foods.map(a => ({
      x: a[0], y: a[1], type: a[2], amount: a[3], max: a[4], found: !!a[5],
      regen: FOOD_TYPES[a[2]].regen * G.cfg.foodMul, r: FOOD_TYPES[a[2]].r, pulse: 0,
    }));
    rebuildFoodGrid();
  }
  G.beetles = (b.beetles || []).map(a => ({ x: a[0], y: a[1], ang: rng() * TAU, hp: a[2], maxHp: a[3], t: 0, flash: 0, eat: 0 }));
  if (b.weather) G.weather = Object.assign(G.weather, b.weather, { t: b.weather.t || 0 });
  if (G.weather.type === 'rain') SFX.rainOn();

  // repopulate: ants are re-created at the nest from the saved head-count
  G.ants = []; G.antFree = []; G.counts = [[0, 0, 0], [0, 0, 0]];
  const n0 = G.nests[0], n1 = G.nests[1];
  const cc = b.counts || [[12, 0, 0], [8, 0, 0]];
  for (let t = 0; t < 3; t++) {
    for (let i = 0; i < Math.min(cc[0][t] | 0, 200); i++) {
      const a = spawnAnt(PLAYER, t, n0.x + (rng() - 0.5) * 30, n0.y + (rng() - 0.5) * 30);
      if (a) a.wait = rng() * 3;
    }
    for (let i = 0; i < Math.min(cc[1][t] | 0, 160); i++) {
      const a = spawnAnt(RIVAL, t, n1.x + (rng() - 0.5) * 30, n1.y + (rng() - 0.5) * 30);
      if (a) a.wait = rng() * 3;
    }
  }
  G.brood = (b.brood || []).slice(0, G.broodSlots).map(a => ({
    type: clamp(a[0] | 0, W, SO),
    t: clamp(Number(a[1]) || 0, 0, Math.max(0.1, Number(a[2]) || CASTE[a[0]]?.incub || 1)),
    dur: Math.max(0.1, Number(a[2]) || CASTE[a[0]]?.incub || 1),
  }));
  G.beacons = []; G.beaconCd = 0; G.rally = null;
  G.particles = []; G.pFree = [];
  G.over = false;
  G.cam.x = n0.x; G.cam.y = n0.y; G.cam.z = 1;
  clampCam();
}

/* ============================== GAME FLOW ================================ */

function resetRun(diffKey, seed) {
  G.mode = 'play'; G.over = false; G.paused = false;
  G.diff = diffKey; G.cfg = DIFFS[diffKey];
  G.day = 1; G.dayT = 0; G.elapsed = 0;
  G.up = { tunnel: 0, nursery: 0, antenna: 0, mandible: 0, gland: 0, endure: 0, scout: 0, soldier: 0 };
  recomputeMods();
  G.food = G.cfg.startFood;
  G.queenHp = 100; G.queenMax = 100; G.queenWounded = false;
  G.targets = [26, 0, 0];
  G.stats = { gathered: 0, raised: 0, kills: 0, beetles: 0, peakPop: 0, deliveries: 0, upgrades: 0 };
  G.rival = { food: 40, hp: 700, maxHp: 700, spawnT: 0, nextRaid: 5, raiders: 0, dead: false };
  G.beetles = []; G.brood = []; G.beacons = []; G.beaconCd = 0; G.rally = null;
  G.particles = []; G.pFree = [];
  G.weather = { type: 'clear', t: 0, dur: 0, forecast: 'Clear skies', pending: 'Clear skies', trigger: 1, fired: true };
  G.achDone = {}; G.achSent = {}; G.runAch = [];
  G.incomeAcc = 0; G.incomeWin = 0; G.starveT = 0; G.starveWarn = 0;
  G.incomeWinT = 0; G.saveAcc = 0; G.acc = 0;
  G.upkeepPerDay = 0;
  G.ants = []; G.antFree = []; G.counts = [[0, 0, 0], [0, 0, 0]];

  generateWorld(seed, diffKey);
  if (!G.fields) allocGrids();
  clearGrids();

  const n0 = G.nests[0], n1 = G.nests[1];
  for (let i = 0; i < 12; i++) {
    const a = spawnAnt(PLAYER, W, n0.x + (rng() - 0.5) * 26, n0.y + (rng() - 0.5) * 26);
    if (a) a.wait = rng() * 2.2;
  }
  for (let i = 0; i < 10; i++) {
    const a = spawnAnt(RIVAL, W, n1.x + (rng() - 0.5) * 26, n1.y + (rng() - 0.5) * 26);
    if (a) a.wait = rng() * 2.2;
  }
  G.cam.x = n0.x; G.cam.y = n0.y; G.cam.z = 1.15;
  clampCam();
  fogStep();
}

function startGame(diffKey) {
  SFX.init(); SFX.resume(); SFX.rainOff();
  resetRun(diffKey, (Math.random() * 0xffffffff) >>> 0);
  hideAllOverlays();
  showHudChrome(true);
  refreshCastePanel(); buildUpgradeList(); refreshHud();
  setSpeed(1);
  G.running = true;
  banner('DAY 1', 'find food and lay a trail home');
  toast('Left-click or Space drops a scent beacon', 'good');
}

function startFromSave(blob) {
  SFX.init(); SFX.resume();
  G.mode = 'play'; G.paused = false;
  applyBlob(blob);
  hideAllOverlays();
  showHudChrome(true);
  refreshCastePanel(); buildUpgradeList(); refreshHud();
  setSpeed(1);
  G.running = true;
  banner(`DAY ${G.day}`, 'the colony wakes');
}

function endRun(win, reason) {
  if (G.over) return;
  G.over = true; G.running = false;
  SFX.rainOff();
  const days = win ? TOTAL_DAYS : Math.max(0, G.day - 1) + G.dayT / DAY_LEN;
  const daysR = Math.round(days * 10) / 10;
  let upgTotal = 0; for (const k in G.up) upgTotal += G.up[k];
  const score = Math.round(
    G.stats.gathered * 0.9 + G.stats.peakPop * 9 + daysR * 130 +
    G.stats.kills * 6 + G.stats.beetles * 90 + upgTotal * 70 +
    (G.rival.dead ? 1500 : 0) + (win ? 1200 : 0)
  );

  if (win) {
    award('long_haul', 1);
    if (!G.queenWounded) award('untouched', 1);
    SFX.win();
  } else SFX.lose();

  const rating = score >= 9000 ? 'S' : score >= 6800 ? 'A' : score >= 4800 ? 'B' : score >= 2800 ? 'C' : 'D';
  ui.resultIcon.textContent = win ? 'ðŸ†' : (G.queenHp <= 0 ? 'ðŸ’€' : 'ðŸ¥€');
  ui.resultRating.textContent = rating;
  ui.resultRating.style.color = rating === 'S' ? '#ffd88a' : rating === 'A' ? '#a7e05a' : rating === 'B' ? '#7fe0d0' : rating === 'C' ? '#ffb04a' : '#ff6b5a';
  ui.resultTitle.textContent = win ? 'COLONY ENDURES' : 'COLONY COLLAPSED';
  ui.resultSub.textContent = reason;
  ui.rsDays.textContent = daysR + ' / ' + TOTAL_DAYS;
  ui.rsFood.textContent = fmt(G.stats.gathered);
  ui.rsPeak.textContent = G.stats.peakPop;
  ui.rsRaised.textContent = G.stats.raised;
  ui.rsKills.textContent = G.stats.kills;
  ui.rsBeetles.textContent = G.stats.beetles;
  ui.rsUpg.textContent = upgTotal + ' / ' + (UPGRADES.length * 5);
  ui.rsRival.textContent = G.rival.dead ? 'Razed' : 'Standing';
  ui.rsScore.textContent = score;
  ui.rsAch.innerHTML = '';
  for (const id of G.runAch) {
    const p = document.createElement('span'); p.className = 'achpill'; p.textContent = 'ðŸ… ' + (ACH[id] || id);
    ui.rsAch.appendChild(p);
  }

  if (score > G.best.score) G.best.score = score;
  if (daysR > G.best.days) G.best.days = daysR;
  saveMeta();
  updateMenuStats();

  if (empire) {
    empire.saveState('slot1', saveBlob(), {
      label: `${win ? 'Survived' : 'Collapsed'} Â· Day ${daysR} Â· ${score} pts`,
      playtimeSec: Math.round(G.playtime), progress: clamp(days / TOTAL_DAYS, 0, 1),
      difficulty: G.diff, seed: G.seed, mode: 'survival',
    }).catch(() => {});
    empire.reportPlaytime(Math.round(G.ptAcc)).catch(() => {});
    G.ptAcc = 0;
  }
  showHudChrome(false);
  ui.resultMenu.classList.remove('hidden');
  shake(0.4, 8);
}

function hideAllOverlays() {
  ['mainMenu', 'newMenu', 'howTo', 'settings', 'pauseMenu', 'resultMenu'].forEach(k => ui[k].classList.add('hidden'));
}

function toMenu() {
  G.mode = 'menu'; G.over = false; G.paused = false; G.running = true;
  SFX.rainOff();
  showHudChrome(false);
  hideAllOverlays();
  ui.mainMenu.classList.remove('hidden');
  // idle demo colony behind the menu
  resetRun('normal', (Math.random() * 0xffffffff) >>> 0);
  G.mode = 'menu';
  G.targets = [40, 0, 0];
  G.cam.z = 0.72; clampCam();
  updateMenuStats();
}

function togglePause(force) {
  if (G.mode !== 'play' || G.over) return;
  const want = force === undefined ? !G.paused : force;
  if (want === G.paused) return;
  G.paused = want;
  if (want) {
    G.running = false;
    ui.pauseSub.textContent = `Day ${Math.min(G.day, TOTAL_DAYS)} Â· ${G.counts[0][0] + G.counts[0][1] + G.counts[0][2]} ants Â· ${Math.floor(G.food)} food`;
    ui.pauseMenu.classList.remove('hidden');
  } else {
    ui.pauseMenu.classList.add('hidden');
    ui.settings.classList.add('hidden');
    ui.howTo.classList.add('hidden');
    G.running = true;
    SFX.resume();
  }
}

/* ------------------------------- meta save -------------------------------- */

const META_KEY = 'antColony.meta.v1';
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify({ best: G.best, opts: G.opts })); } catch (e) {}
}
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const m = JSON.parse(raw);
    if (m.best) G.best = Object.assign(G.best, m.best);
    if (m.opts) G.opts = Object.assign(G.opts, m.opts);
  } catch (e) {}
}
function updateMenuStats() {
  ui.menuBest.textContent = G.best.score ? G.best.score + ' pts' : 'â€”';
  ui.menuDays.textContent = G.best.days || 0;
}

/* ================================ INPUT ================================== */

function bindInput() {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    if (e.repeat) { G.keys[k] = true; return; }
    G.keys[k] = true;
    SFX.resume();

    if (k === 'escape' || k === 'p') {
      if (!ui.howTo.classList.contains('hidden')) { ui.howTo.classList.add('hidden'); if (G.mode === 'play' && !G.paused) G.running = true; return; }
      if (!ui.settings.classList.contains('hidden')) { ui.settings.classList.add('hidden'); if (G.mode === 'play' && !G.paused) G.running = true; return; }
      if (!ui.newMenu.classList.contains('hidden')) { ui.newMenu.classList.add('hidden'); ui.mainMenu.classList.remove('hidden'); return; }
      if (G.mode === 'play' && !G.over) togglePause();
      return;
    }
    if (G.mode !== 'play' || G.over || G.paused) return;
    if (k === ' ') { placeBeacon(mouse.x, mouse.y); }
    else if (k === 'r') { setRally(mouse.x, mouse.y); }
    else if (k === 'h') { clearRally(); }
    else if (k === '1') setSpeed(1);
    else if (k === '2') setSpeed(2);
    else if (k === '3') setSpeed(3);
    else if (k === 'f') { G.cam.x = G.nests[0].x; G.cam.y = G.nests[0].y; clampCam(); }
    else if (k === 'tab') {
      G.panelsHidden = !G.panelsHidden;
      document.body.classList.toggle('panelsHidden', G.panelsHidden);
    }
  });
  window.addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { G.keys = {}; });

  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top;
    const w = screenToWorld(mouse.sx, mouse.sy);
    mouse.x = w.x; mouse.y = w.y; mouse.inside = true;
    if (mouse.panning) {
      G.cam.x -= (e.clientX - mouse.px) / G.cam.z;
      G.cam.y -= (e.clientY - mouse.py) / G.cam.z;
      mouse.px = e.clientX; mouse.py = e.clientY;
      clampCam();
    }
  });
  cv.addEventListener('mouseleave', () => { mouse.inside = false; mouse.panning = false; });
  cv.addEventListener('mousedown', e => {
    SFX.init(); SFX.resume();
    if (e.button === 0) {
      if (G.mode === 'play' && !G.paused && !G.over) {
        if (e.shiftKey) setRally(mouse.x, mouse.y); else placeBeacon(mouse.x, mouse.y);
      }
    } else if (e.button === 2 || e.button === 1) {
      mouse.panning = true; mouse.px = e.clientX; mouse.py = e.clientY;
      e.preventDefault();
    }
  });
  window.addEventListener('mouseup', () => { mouse.panning = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const before = screenToWorld(mouse.sx, mouse.sy);
    G.cam.z = clamp(G.cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 2.4);
    const after = screenToWorld(mouse.sx, mouse.sy);
    G.cam.x += before.x - after.x; G.cam.y += before.y - after.y;
    clampCam();
  }, { passive: false });

  // touch: drag to pan, tap to beacon
  let touchId = null, tLast = null, tMoved = 0;
  cv.addEventListener('touchstart', e => {
    SFX.init(); SFX.resume();
    if (touchId !== null) return;
    const t = e.changedTouches[0]; touchId = t.identifier;
    tLast = { x: t.clientX, y: t.clientY }; tMoved = 0;
  }, { passive: true });
  cv.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - tLast.x, dy = t.clientY - tLast.y;
      tMoved += Math.abs(dx) + Math.abs(dy);
      G.cam.x -= dx / G.cam.z; G.cam.y -= dy / G.cam.z;
      tLast = { x: t.clientX, y: t.clientY };
      clampCam();
    }
  }, { passive: true });
  cv.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      if (tMoved < 12 && G.mode === 'play' && !G.paused && !G.over) {
        const r = cv.getBoundingClientRect();
        const w = screenToWorld(t.clientX - r.left, t.clientY - r.top);
        placeBeacon(w.x, w.y);
      }
      touchId = null;
    }
  }, { passive: true });

  // minimap navigation
  mm.addEventListener('click', e => {
    const r = mm.getBoundingClientRect();
    G.cam.x = (e.clientX - r.left) / r.width * WORLD_W;
    G.cam.y = (e.clientY - r.top) / r.height * WORLD_H;
    clampCam();
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      G.wasRunning = G.running; G.running = false;
      if (empire && G.ptAcc > 1) { empire.reportPlaytime(Math.round(G.ptAcc)).catch(() => {}); G.ptAcc = 0; }
    } else if (G.wasRunning && !G.paused) G.running = true;
  });
  window.addEventListener('pagehide', () => {
    if (empire && G.ptAcc > 1) { empire.reportPlaytime(Math.round(G.ptAcc)).catch(() => {}); G.ptAcc = 0; }
  });
}

function setRally(x, y) {
  if (!G.mods.soldierOn) { toast('Unlock the Soldier Caste first', 'bad'); return; }
  G.rally = { x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20) };
  for (const a of G.ants) if (a.alive && a.col === PLAYER && a.type === SO && a.state === INNEST) { a.wait = Math.min(a.wait, 0.2); }
  toast('Soldiers rallying', 'good');
  SFX.tone(520, 0.12, 'square', 0.07, 720);
}
function clearRally() {
  if (!G.rally) return;
  G.rally = null; toast('Soldiers returning to the nest');
  SFX.tone(400, 0.12, 'square', 0.06, 300);
}

function panCamera(dt) {
  const k = G.keys;
  let dx = 0, dy = 0;
  if (k['a'] || k['arrowleft']) dx -= 1;
  if (k['d'] || k['arrowright']) dx += 1;
  if (k['w'] || k['arrowup']) dy -= 1;
  if (k['s'] || k['arrowdown']) dy += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy) || 1;
    const sp = 620 / G.cam.z * dt;
    G.cam.x += dx / len * sp; G.cam.y += dy / len * sp;
    clampCam();
  }
  if (k['q']) { G.cam.z = clamp(G.cam.z / (1 + dt * 1.2), 0.5, 2.4); clampCam(); }
  if (k['e']) { G.cam.z = clamp(G.cam.z * (1 + dt * 1.2), 0.5, 2.4); clampCam(); }
}

/* ================================= UI WIRING ============================== */

function bindUI() {
  $('btnNew').onclick = () => { SFX.click(); ui.mainMenu.classList.add('hidden'); ui.newMenu.classList.remove('hidden'); };
  $('newClose').onclick = () => { SFX.click(); ui.newMenu.classList.add('hidden'); ui.mainMenu.classList.remove('hidden'); };
  $('btnHowTo').onclick = () => { SFX.click(); ui.howTo.classList.remove('hidden'); };
  $('howToClose').onclick = $('howToDone').onclick = () => {
    SFX.click(); ui.howTo.classList.add('hidden');
    if (G.mode === 'play' && !G.paused) G.running = true;
  };
  $('btnSettings').onclick = () => { SFX.click(); ui.settings.classList.remove('hidden'); };
  $('settingsClose').onclick = $('settingsDone').onclick = () => {
    SFX.click(); ui.settings.classList.add('hidden'); saveMeta();
    if (G.mode === 'play' && !G.paused) G.running = true;
  };

  let pickedDiff = 'normal';
  const notes = {
    easy: 'Meadow â€” plentiful food, a timid rival colony. Good for learning trails.',
    normal: 'Woodland â€” balanced food, real raids, beetles and rain from midweek.',
    hard: 'Drought â€” thin food, an aggressive rival, harsher weather and upkeep.',
  };
  ui.diffNote.textContent = notes.easy;
  document.querySelectorAll('[data-diff]').forEach(b => {
    b.onclick = () => {
      SFX.click();
      pickedDiff = b.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(x => x.classList.remove('primary'));
      b.classList.add('primary');
      ui.diffNote.textContent = notes[pickedDiff];
    };
  });
  document.querySelector('[data-diff="normal"]').classList.add('primary');
  ui.diffNote.textContent = notes.normal;
  $('btnBegin').onclick = () => { SFX.click(); startGame(pickedDiff); };

  ui.btnContinue.onclick = async () => {
    SFX.click();
    if (!empire) return;
    try {
      const rec = await empire.loadState('auto');
      if (rec && rec.blob) startFromSave(rec.blob);
      else toast('No saved colony found', 'bad');
    } catch (e) { toast('Save could not be read', 'bad'); }
  };

  $('btnResume').onclick = () => { SFX.click(); togglePause(false); };
  $('btnSaveNow').onclick = async () => { SFX.click(); await autoSave(); toast('Colony saved', 'good'); };
  $('btnPauseHowTo').onclick = () => { SFX.click(); ui.howTo.classList.remove('hidden'); };
  $('btnPauseSettings').onclick = () => { SFX.click(); ui.settings.classList.remove('hidden'); };
  $('btnRestart').onclick = () => { SFX.click(); startGame(G.diff); };
  $('btnQuit').onclick = () => { SFX.click(); toMenu(); };
  $('btnPlayAgain').onclick = () => { SFX.click(); startGame(G.diff); };
  $('btnResultMenu').onclick = () => { SFX.click(); toMenu(); };

  $('btnPauseHud').onclick = () => { SFX.click(); togglePause(true); };
  $('btnHelpHud').onclick = () => { SFX.click(); ui.howTo.classList.remove('hidden'); G.running = false; };
  ui.spd1.onclick = () => { SFX.click(); setSpeed(1); };
  ui.spd2.onclick = () => { SFX.click(); setSpeed(2); };
  ui.spd3.onclick = () => { SFX.click(); setSpeed(3); };
  $('btnRecall').onclick = () => { SFX.click(); clearRally(); };

  const stepTarget = (i, d) => {
    if (i === S && !G.mods.scoutOn) { toast('Unlock the Scout Corps first', 'bad'); return; }
    if (i === SO && !G.mods.soldierOn) { toast('Unlock the Soldier Caste first', 'bad'); return; }
    const maxT = i === W ? 140 : i === S ? 40 : 70;
    G.targets[i] = clamp(G.targets[i] + d, 0, maxT);
    refreshCastePanel(); SFX.click();
  };
  $('wMinus').onclick = () => stepTarget(W, -1); $('wPlus').onclick = () => stepTarget(W, 1);
  $('sMinus').onclick = () => stepTarget(S, -1); $('sPlus').onclick = () => stepTarget(S, 1);
  $('oMinus').onclick = () => stepTarget(SO, -1); $('oPlus').onclick = () => stepTarget(SO, 1);
  // hold to repeat
  [['wMinus', W, -1], ['wPlus', W, 1], ['sMinus', S, -1], ['sPlus', S, 1], ['oMinus', SO, -1], ['oPlus', SO, 1]].forEach(([id, i, d]) => {
    const el = $(id); let t = null, rep = null;
    const stop = () => { clearTimeout(t); clearInterval(rep); };
    el.addEventListener('mousedown', () => { t = setTimeout(() => { rep = setInterval(() => stepTarget(i, d * 5), 90); }, 420); });
    el.addEventListener('mouseup', stop); el.addEventListener('mouseleave', stop);
  });

  ui.volSlider.oninput = () => {
    G.opts.vol = parseFloat(ui.volSlider.value);
    ui.volVal.textContent = Math.round(G.opts.vol * 100) + '%';
    SFX.setVol(G.opts.vol);
  };
  ui.optMute.onchange = () => { G.opts.mute = ui.optMute.checked; SFX.setMuted(G.opts.mute); if (G.opts.mute) SFX.rainOff(); };
  ui.optFx.onchange = () => { G.opts.reduceFx = ui.optFx.checked; };
  ui.optTrails.onchange = () => { G.opts.trails = ui.optTrails.checked; };
  ui.optFog.onchange = () => { G.opts.fog = ui.optFog.checked; };
}

function applyOptsToUI() {
  ui.volSlider.value = G.opts.vol;
  ui.volVal.textContent = Math.round(G.opts.vol * 100) + '%';
  ui.optMute.checked = !!G.opts.mute;
  ui.optFx.checked = !!G.opts.reduceFx;
  ui.optTrails.checked = G.opts.trails !== false;
  ui.optFog.checked = G.opts.fog !== false;
  SFX.setVol(G.opts.vol); SFX.setMuted(!!G.opts.mute);
}

/* ================================= LOOP ================================== */

let lastTs = 0, mmTick = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.25) dt = 0.25;
  if (document.hidden) return;

  panCamera(dt);

  if (G.running) {
    const mult = G.mode === 'menu' ? 1 : G.speed;
    G.acc = (G.acc || 0) + dt * mult;
    let steps = 0;
    while (G.acc >= STEP && steps < MAX_STEPS) { step(STEP); G.acc -= STEP; steps++; }
    if (G.acc > 0.4) G.acc = 0;

    if (G.mode === 'play' && !G.over) {
      G.playtime += dt; G.ptAcc += dt; G.saveAcc += dt;
      // rolling income window (food delivered per in-game day)
      G.incomeWinT = (G.incomeWinT || 0) + dt * mult;
      if (G.incomeWinT >= 5) {
        G.incomeWin = G.incomeAcc * (DAY_LEN / G.incomeWinT);
        G.incomeAcc = 0; G.incomeWinT = 0;
      }
      if (G.ptAcc >= 30) {
        if (empire) empire.reportPlaytime(Math.round(G.ptAcc)).catch(() => {});
        G.ptAcc = 0;
      }
      if (G.saveAcc >= 45) { G.saveAcc = 0; autoSave(); }
    }
  }

  render();

  G.uiAcc += dt;
  if (G.uiAcc >= 0.18) {
    G.uiAcc = 0;
    if (G.mode === 'play') refreshHud();
    mmTick++;
    if (G.mode === 'play') drawMinimap();
  }
}

/* ================================= BOOT ================================== */

async function boot() {
  cv = $('game');
  ctx = cv.getContext('2d', { alpha: false });
  mm = $('minimap');
  mmCtx = mm.getContext('2d');
  cacheUI();
  reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  loadMeta();
  bindUI();
  applyOptsToUI();
  bindInput();
  resize();

  allocGrids();
  recomputeMods();

  try {
    empire = new EmpireClient({
      gameId: 'ant-colony',
      saveVersion: 1,
      onPause: () => { if (G.mode === 'play' && !G.over) togglePause(true); },
      onResume: () => { if (G.mode === 'play' && !G.over) togglePause(false); },
      onSettings: s => applyHubSettings(s),
    });
    await empire.connect();
    const s = await empire.getSettings();
    applyHubSettings(s);
    const rec = await empire.loadState('auto');
    if (rec && rec.blob && rec.blob.day) {
      ui.btnContinue.disabled = false;
      ui.btnContinue.textContent = `CONTINUE â€” DAY ${Math.min(rec.blob.day, TOTAL_DAYS)}`;
    }
  } catch (e) {
    empire = null;
  }

  toMenu();
  updateMenuStats();
  requestAnimationFrame(frame);
}

function applyHubSettings(s) {
  if (!s) return;
  if (typeof s.masterVolume === 'number') { G.opts.vol = s.masterVolume; SFX.setVol(s.masterVolume); }
  if (typeof s.volume === 'number') { G.opts.vol = s.volume; SFX.setVol(s.volume); }
  if (typeof s.muted === 'boolean') { G.opts.mute = s.muted; SFX.setMuted(s.muted); }
  if (typeof s.reducedMotion === 'boolean' && s.reducedMotion) { G.opts.reduceFx = true; reducedMotion = true; }
  applyOptsToUI();
}

window.__empireMigrate = function (blob) { return blob; };

boot();
/* Authored 3D colony layer: the simulation and colony economy stay authoritative in G. */
const ant3d = { renderer: null, scene: null, camera: null, kit: null, status: { loaded: false, physics: false, attached: false, error: '' } };
function initAnt3D() {
  try {
    if (!window.THREE) {
      const add = (src) => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
      return add('../../vendor/three-r128/three.min.js').then(() => add('../../vendor/three-r128/GLTFLoader.js')).then(initAnt3D);
    }
    const canvas = document.createElement('canvas'); canvas.id = 'scene3d'; canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.82'; document.body.prepend(canvas);
    ant3d.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); ant3d.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); ant3d.renderer.setSize(innerWidth, innerHeight, false);
    ant3d.scene = new THREE.Scene(); ant3d.scene.fog = new THREE.Fog(0x1b2630, 18, 62); ant3d.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .1, 100); ant3d.camera.position.set(0, 8, 18); ant3d.scene.add(new THREE.HemisphereLight(0xbad7e8, 0x251a12, 1.8)); const sun = new THREE.DirectionalLight(0xffe8bc, 2.3); sun.position.set(6, 10, 4); ant3d.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 48), new THREE.MeshStandardMaterial({ color: 0x593d2b, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2; ant3d.scene.add(ground);
    new THREE.GLTFLoader().load('../../assets/blender-kits/ant-colony/ant-colony-kit.glb', (gltf) => { ant3d.kit = gltf.scene; ant3d.kit.scale.setScalar(2.2); ant3d.scene.add(ant3d.kit); ant3d.status.loaded = true; ant3d.status.attached = true; window.__antColonyAssetStatus = ant3d.status; }, undefined, (e) => { ant3d.status.error = String(e && e.message || e); window.__antColonyAssetStatus = ant3d.status; });
    fetch('../../assets/blender-kits/ant-colony/physics.json').then((r) => r.json()).then((p) => { ant3d.status.physics = !!p.playerCollider; window.__antColonyAssetStatus = ant3d.status; }).catch((e) => { ant3d.status.error = String(e && e.message || e); });
    addEventListener('resize', () => { ant3d.renderer.setSize(innerWidth, innerHeight, false); ant3d.camera.aspect = innerWidth / innerHeight; ant3d.camera.updateProjectionMatrix(); });
    const render = () => { requestAnimationFrame(render); if (ant3d.kit) { ant3d.kit.rotation.y += .002; if (typeof G !== 'undefined' && G.cam) { ant3d.kit.position.x = (G.cam.x / WORLD_W - .5) * 8; ant3d.kit.position.z = (G.cam.y / WORLD_H - .5) * 6; } } ant3d.renderer.render(ant3d.scene, ant3d.camera); }; requestAnimationFrame(render);
  } catch (e) { ant3d.status.error = String(e && e.message || e); window.__antColonyAssetStatus = ant3d.status; }
}
window.__antColonyAssetStatus = ant3d.status;
initAnt3D();
