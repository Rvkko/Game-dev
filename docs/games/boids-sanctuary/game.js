/* =============================================================================
 * BOIDS SANCTUARY â€” a flocking sandbox with 8 shepherding challenges.
 * Canvas2D Â· offline Â· Empire SDK wired.
 * ========================================================================== */

import { EmpireClient } from '../../shared/empire-sdk.js';

const GAME_ID = 'boids-sanctuary';
const SAVE_VERSION = 1;

/* World is a fixed logical arena; the canvas letterboxes it. */
const W = 1400;
const H = 900;
const MAXB = 1000;          // hard cap on boids
const MAXP = 900;           // particle pool
const DT = 1 / 60;          // fixed simulation step

/* ==========================================================================
 * 1. UTILITIES
 * ======================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtTime(sec) {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function fmtTimeMs(sec) {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

const $ = (id) => document.getElementById(id);

/* ==========================================================================
 * 2. AUDIO â€” everything synthesised, nothing downloaded
 * ======================================================================== */

const Audio2 = {
  ctx: null, master: null, noiseBuf: null,
  vol: 0.7, enabled: true,
  ambGain: null, ambSrc: null, ambFilter: null, ambLfo: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try { this.ctx = new AC(); } catch { this.enabled = false; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setVolume(v) {
    this.vol = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.vol;
  },
  _t() { return this.ctx.currentTime; },

  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this._t() + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.14), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, gain, freq, q, delay) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.noiseBuf) return;
    const t = this._t() + (delay || 0);
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = q || 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  },

  click() { this.tone(520, 0.05, 'square', 0.05); },
  back() { this.tone(300, 0.07, 'square', 0.05); },
  pulse() { this.noise(0.42, 0.20, 620, 0.7); this.tone(340, 0.36, 'sawtooth', 0.10, 90); },
  seed() { this.tone(880, 0.16, 'triangle', 0.10, 1320); },
  eat() { this.tone(660, 0.09, 'sine', 0.07, 990); },
  kill() { this.noise(0.20, 0.16, 260, 0.9); this.tone(140, 0.22, 'sawtooth', 0.09, 60); },
  tick() { this.tone(1180, 0.05, 'sine', 0.045); },
  win(medal) {
    const base = medal === 'gold' ? 523.25 : medal === 'silver' ? 466.16 : 440;
    const seq = [0, 4, 7, 12, 16];
    for (let i = 0; i < seq.length; i++) {
      this.tone(base * Math.pow(2, seq[i] / 12), 0.5, 'triangle', 0.11, null, i * 0.10);
    }
  },
  lose() {
    this.tone(330, 0.28, 'sawtooth', 0.10, 200);
    this.tone(247, 0.44, 'sawtooth', 0.10, 130, 0.13);
  },
  chime() { this.tone(1046, 0.30, 'triangle', 0.09, null, 0); this.tone(1568, 0.34, 'sine', 0.06, null, 0.07); },

  ambientOn() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || this.ambSrc || !this.noiseBuf) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.028;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lg = this.ctx.createGain(); lg.gain.value = 0.018;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(); lfo.start();
    this.ambSrc = s; this.ambGain = g; this.ambFilter = f; this.ambLfo = lfo;
  },
  ambientOff() {
    if (this.ambSrc) { try { this.ambSrc.stop(); } catch {} this.ambSrc.disconnect(); this.ambSrc = null; }
    if (this.ambLfo) { try { this.ambLfo.stop(); } catch {} this.ambLfo = null; }
    this.ambGain = null; this.ambFilter = null;
  },
};

/* ==========================================================================
 * 3. SETTINGS + PERSISTENT PROGRESS
 * ======================================================================== */

const prefersReduced = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SET = {
  volume: 0.7,
  shake: !prefersReduced,
  trails: !prefersReduced,
  particles: !prefersReduced,
  showFps: false,
  quality: 'high',
};

const PROG = {
  scen: {},        // id -> {done, bestTime, bestAlive, medal, score}
  pulses: 0,
  bestFlock: 0,
  seenHowTo: false,
};

/* ==========================================================================
 * 4. FLOCK PARAMETERS (live-tunable)
 * ======================================================================== */

const DEFAULT_P = {
  sep: 1.60, ali: 1.00, coh: 0.90,
  per: 55, spc: 22, wan: 0.20,
  spd: 130, frc: 340,
  fea: 3.00, fod: 2.20, drn: 1.40,
  count: 200,
  windX: 0, windY: 0,
  edge: 'steer',
  showPer: false,
};
const P = Object.assign({}, DEFAULT_P);

const PRESETS = {
  classic: { sep: 1.60, ali: 1.00, coh: 0.90, per: 55, spc: 22, wan: 0.20, spd: 130, frc: 340 },
  murmur: { sep: 1.10, ali: 2.30, coh: 1.45, per: 92, spc: 18, wan: 0.10, spd: 152, frc: 270 },
  nervous: { sep: 3.20, ali: 0.60, coh: 1.70, per: 46, spc: 36, wan: 0.35, spd: 190, frc: 720 },
  lazy: { sep: 1.00, ali: 0.60, coh: 1.60, per: 112, spc: 26, wan: 0.14, spd: 72, frc: 140 },
  vortex: { sep: 1.85, ali: 1.85, coh: 2.70, per: 120, spc: 20, wan: 0.06, spd: 170, frc: 300 },
  chaos: { sep: 0.40, ali: 0.10, coh: 0.25, per: 30, spc: 10, wan: 1.00, spd: 226, frc: 880 },
};

/* ==========================================================================
 * 5. LEVEL GEOMETRY PRIMITIVES
 * ======================================================================== */

let solidSeed = 1;
function rockPoly(r) {
  const rng = mulberry32((solidSeed = (solidSeed * 1664525 + 1013904223) >>> 0));
  const n = 9 + Math.floor(rng() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.84 + rng() * 0.30);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function circle(x, y, r) { return { k: 0, x, y, r, poly: rockPoly(r) }; }
function cap(x1, y1, x2, y2, r) { return { k: 1, x1, y1, x2, y2, r }; }

function chain(pts, r) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push(cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r));
  }
  return out;
}

/** Two rock walls offset from a hand-authored centreline. */
function corridor(pts, halfW, r) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    let dx, dy;
    if (i === 0) { dx = pts[1][0] - pts[0][0]; dy = pts[1][1] - pts[0][1]; }
    else if (i === pts.length - 1) { dx = pts[i][0] - pts[i - 1][0]; dy = pts[i][1] - pts[i - 1][1]; }
    else { dx = pts[i + 1][0] - pts[i - 1][0]; dy = pts[i + 1][1] - pts[i - 1][1]; }
    const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const nx = -dy, ny = dx;
    left.push([pts[i][0] + nx * halfW, pts[i][1] + ny * halfW]);
    right.push([pts[i][0] - nx * halfW, pts[i][1] - ny * halfW]);
  }
  return chain(left, r).concat(chain(right, r));
}

/** Vertical barrier at x with open gaps (list of [yFrom,yTo]). */
function vwall(x, gaps, r) {
  const segs = []; let cur = -40;
  const g = gaps.slice().sort((a, b) => a[0] - b[0]);
  for (const [a, b] of g) { if (a > cur) segs.push([cur, a]); cur = b; }
  if (cur < H + 40) segs.push([cur, H + 40]);
  return segs.map(([a, b]) => cap(x, a, x, b, r));
}
/** Horizontal barrier at y with open gaps (list of [xFrom,xTo]). */
function hwall(y, gaps, r) {
  const segs = []; let cur = -40;
  const g = gaps.slice().sort((a, b) => a[0] - b[0]);
  for (const [a, b] of g) { if (a > cur) segs.push([cur, a]); cur = b; }
  if (cur < W + 40) segs.push([cur, W + 40]);
  return segs.map(([a, b]) => cap(a, y, b, y, r));
}

function scatterRocks(list) { return list.map(([x, y, r]) => circle(x, y, r)); }

/* ==========================================================================
 * 6. THE EIGHT CHALLENGES
 * ======================================================================== */

const SCEN = [
  {
    id: 'first-flight',
    name: 'First Flight',
    brief: 'Hold 30 boids inside the sanctuary ring for 2 seconds.',
    hint: 'Fly the drone ahead of the flock â€” they follow the pull. Drop a seed with E inside the ring to park them.',
    boids: 40, spawn: { x: 190, y: 450, r: 95 },
    goal: { type: 'zone', hold: 2 },
    zones: [{ x: 1160, y: 450, r: 130, need: 30 }],
    predators: 0, pellets: 4, minAlive: 20,
    limit: 90, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 1.6, ali: 1.0, coh: 1.0, per: 60, spc: 22, spd: 128, frc: 340 },
    build() {
      return scatterRocks([[520, 250, 52], [560, 660, 60], [880, 430, 70], [760, 120, 40], [700, 800, 46], [1000, 720, 38]]);
    },
    medals: { gold: { t: 26, alive: 40 }, silver: { t: 40, alive: 36 }, bronze: { t: 62, alive: 30 } },
  },
  {
    id: 'canyon-run',
    name: 'Canyon Run',
    brief: 'Thread the flock through the canyon: 25 boids in the far sanctuary.',
    hint: 'Raise Cohesion and drop Separation so the flock squeezes narrow. Never pulse inside stone.',
    boids: 40, spawn: { x: 120, y: 445, r: 70 },
    goal: { type: 'zone', hold: 2 },
    zones: [{ x: 1275, y: 432, r: 105, need: 25 }],
    predators: 0, pellets: 5, minAlive: 18,
    limit: 85, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 1.3, ali: 1.4, coh: 1.3, per: 55, spc: 18, spd: 128, frc: 380 },
    build() {
      const c = corridor(
        [[-80, 450], [140, 430], [345, 265], [565, 575], [795, 265], [1015, 585], [1235, 430], [1470, 450]],
        118, 22
      );
      return c.concat(scatterRocks([[565, 575, 34], [1015, 585, 30], [345, 265, 26]]));
    },
    medals: { gold: { t: 36, alive: 38 }, silver: { t: 50, alive: 33 }, bronze: { t: 70, alive: 25 } },
  },
  {
    id: 'hawk-country',
    name: 'Hawk Country',
    brief: 'Survive 60 seconds. Lose more than 22 boids and the flock scatters for good.',
    hint: 'SPACE stuns hawks in a wide radius. High Separation makes the flock a hard target; hide behind rock.',
    boids: 60, spawn: { x: 700, y: 450, r: 150 },
    goal: { type: 'survive', seconds: 60 },
    zones: [], predators: 3, pellets: 3, minAlive: 38,
    limit: 60, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 2.1, ali: 1.2, coh: 0.8, per: 60, spc: 30, spd: 138, frc: 430 },
    build() {
      return scatterRocks([
        [230, 200, 62], [430, 620, 74], [700, 180, 54], [960, 640, 68], [1180, 250, 60],
        [640, 470, 46], [1100, 700, 44], [200, 720, 50], [1250, 520, 40], [880, 350, 36],
      ]);
    },
    medals: { gold: { t: 0, alive: 58 }, silver: { t: 0, alive: 50 }, bronze: { t: 0, alive: 42 } },
  },
  {
    id: 'feeding-frenzy',
    name: 'Feeding Frenzy',
    brief: 'The flock must eat 18 of the 20 wild seed pods before the clock runs out.',
    hint: 'Seeds only feed the boids that touch them. Spread the flock wide with Separation to harvest faster.',
    boids: 50, spawn: { x: 700, y: 450, r: 120 },
    goal: { type: 'collect', need: 18 },
    zones: [], predators: 1, pellets: 3, minAlive: 30,
    limit: 75, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 2.4, ali: 0.9, coh: 0.7, per: 62, spc: 32, spd: 142, frc: 400 },
    build() {
      return scatterRocks([
        [340, 250, 56], [980, 250, 56], [340, 660, 56], [980, 660, 56],
        [660, 450, 78], [150, 450, 44], [1250, 450, 44], [660, 130, 40], [660, 780, 40],
      ]);
    },
    wildSeeds: [
      [140, 140], [400, 110], [700, 90], [1000, 120], [1280, 150],
      [110, 420], [420, 420], [900, 420], [1290, 420],
      [140, 760], [420, 780], [700, 800], [1010, 770], [1290, 740],
      [250, 300], [1140, 320], [250, 600], [1140, 610], [560, 260], [820, 640],
    ],
    medals: { gold: { t: 42, alive: 46 }, silver: { t: 55, alive: 40 }, bronze: { t: 74, alive: 32 } },
  },
  {
    id: 'needle',
    name: 'Threading the Needle',
    brief: 'Two barriers, five slots. Get 28 boids into the sanctuary beyond.',
    hint: 'A wide flock jams the gaps. Crank Cohesion up and Personal Space down to form a single dart.',
    boids: 45, spawn: { x: 160, y: 450, r: 105 },
    goal: { type: 'zone', hold: 2 },
    zones: [{ x: 1265, y: 450, r: 112, need: 28 }],
    predators: 2, pellets: 5, minAlive: 22,
    limit: 75, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 1.2, ali: 1.6, coh: 1.6, per: 62, spc: 16, spd: 134, frc: 420 },
    build() {
      return vwall(660, [[150, 240], [420, 500], [690, 780]], 20)
        .concat(vwall(960, [[280, 370], [590, 680]], 20))
        .concat(scatterRocks([[810, 200, 44], [810, 720, 44], [1120, 450, 40]]));
    },
    medals: { gold: { t: 40, alive: 43 }, silver: { t: 54, alive: 38 }, bronze: { t: 72, alive: 30 } },
  },
  {
    id: 'split-convoy',
    name: 'Split Convoy',
    brief: 'Two sanctuaries, 15 boids in each â€” at the same moment, held for 3 seconds.',
    hint: 'Cohesion is your enemy here. Slide it near zero, seed both rings, then herd the leftovers.',
    boids: 50, spawn: { x: 700, y: 450, r: 130 },
    goal: { type: 'zone', hold: 3 },
    zones: [{ x: 245, y: 195, r: 118, need: 15 }, { x: 1155, y: 715, r: 118, need: 15 }],
    predators: 0, pellets: 6, minAlive: 30,
    limit: 95, wind: { x: 0, y: 0, gust: 0 },
    tune: { sep: 1.8, ali: 0.9, coh: 0.35, per: 55, spc: 26, spd: 132, frc: 360 },
    build() {
      return scatterRocks([
        [700, 450, 96], [520, 300, 48], [880, 600, 48], [560, 640, 42], [840, 260, 42],
        [1180, 200, 54], [220, 700, 54],
      ]);
    },
    medals: { gold: { t: 46, alive: 48 }, silver: { t: 62, alive: 42 }, bronze: { t: 88, alive: 34 } },
  },
  {
    id: 'storm',
    name: 'Storm Migration',
    brief: 'A gale shoves the flock north-east. Land 30 boids in the southern sanctuary.',
    hint: 'Fight the wind with Turn Force and Max Speed. Alignment keeps the flock pointed into the gusts.',
    boids: 50, spawn: { x: 200, y: 250, r: 110 },
    goal: { type: 'zone', hold: 2 },
    zones: [{ x: 1180, y: 730, r: 122, need: 30 }],
    predators: 1, pellets: 5, minAlive: 26,
    limit: 85, wind: { x: 58, y: -30, gust: 42 },
    tune: { sep: 1.5, ali: 1.7, coh: 1.1, per: 62, spc: 22, spd: 168, frc: 520 },
    build() {
      return scatterRocks([
        [520, 420, 62], [880, 300, 56], [1050, 560, 50], [700, 660, 58], [330, 620, 46],
        [1230, 300, 44], [860, 800, 42],
      ]);
    },
    medals: { gold: { t: 42, alive: 47 }, silver: { t: 56, alive: 41 }, bronze: { t: 80, alive: 32 } },
  },
  {
    id: 'long-migration',
    name: 'The Long Migration',
    brief: 'Canyon, hawks and a headwind. Deliver 35 of 70 boids to the high sanctuary.',
    hint: 'Everything you have learned. Retune between stages â€” the drawer stays open mid-flight.',
    boids: 70, spawn: { x: 110, y: 720, r: 90 },
    goal: { type: 'zone', hold: 3 },
    zones: [{ x: 1265, y: 200, r: 118, need: 35 }],
    predators: 4, pellets: 8, minAlive: 35,
    limit: 135, wind: { x: 30, y: 22, gust: 30 },
    tune: { sep: 1.6, ali: 1.4, coh: 1.2, per: 62, spc: 22, spd: 150, frc: 460 },
    build() {
      const c = corridor([[-80, 730], [150, 725], [330, 600], [470, 690], [610, 560]], 105, 20);
      return c
        .concat(vwall(760, [[120, 215], [430, 520], [700, 790]], 20))
        .concat(scatterRocks([
          [900, 640, 66], [1080, 420, 58], [900, 200, 50], [1220, 620, 52], [1010, 800, 44],
          [640, 300, 46], [860, 430, 34],
        ]));
    },
    wildSeeds: [[880, 740], [1120, 700], [1000, 300], [660, 160]],
    medals: { gold: { t: 74, alive: 62 }, silver: { t: 96, alive: 54 }, bronze: { t: 125, alive: 44 } },
  },
];

const ACHIEVEMENTS = [
  { id: 'first_flock', title: 'First Flight', desc: 'Complete your first sanctuary challenge.', rarity: 'common', hidden: false, icon: 'ðŸ•Šï¸' },
  { id: 'canyon_runner', title: 'Canyon Runner', desc: 'Guide the flock through Canyon Run.', rarity: 'common', hidden: false, icon: 'ðŸžï¸' },
  { id: 'pulse_master', title: 'Shockwave', desc: 'Fire 100 scatter pulses across all runs.', rarity: 'common', hidden: false, progressive: true, target: 100, icon: 'ðŸ’¥' },
  { id: 'flawless_hawk', title: 'Not One Feather', desc: 'Finish Hawk Country without losing a single boid.', rarity: 'rare', hidden: false, icon: 'ðŸ¦…' },
  { id: 'pacifist_run', title: 'Gentle Hand', desc: 'Clear any challenge without firing a single pulse.', rarity: 'rare', hidden: false, icon: 'ðŸ¤²' },
  { id: 'swarm_lord', title: 'Swarm Lord', desc: 'Hold 800 living boids at once in the Sandbox.', rarity: 'rare', hidden: false, icon: 'ðŸŒªï¸' },
  { id: 'cartographer', title: 'Every Sanctuary', desc: 'Complete all 8 challenges.', rarity: 'epic', hidden: false, progressive: true, target: 8, icon: 'ðŸ—ºï¸' },
  { id: 'gold_rush', title: 'Gold Rush', desc: 'Earn 5 gold medals.', rarity: 'epic', hidden: false, progressive: true, target: 5, icon: 'ðŸ¥‡' },
  { id: 'murmuration', title: 'Murmuration', desc: 'Hold 200+ boids in one tight cluster for 10 seconds.', rarity: 'epic', hidden: true, icon: 'âœ¨' },
  { id: 'sanctuary_keeper', title: 'Sanctuary Keeper', desc: 'Complete The Long Migration.', rarity: 'legendary', hidden: false, icon: 'ðŸ†' },
];
const achUnlocked = new Set();
const achProgress = {};

/* ==========================================================================
 * 7. SIMULATION STATE
 * ======================================================================== */

const bx = new Float32Array(MAXB);
const by = new Float32Array(MAXB);
const bvx = new Float32Array(MAXB);
const bvy = new Float32Array(MAXB);
const bph = new Float32Array(MAXB);   // wander phase
const bpk = new Float32Array(MAXB);   // panic level 0..1 (visual)
const btn = new Uint8Array(MAXB);     // tint index
let bN = 0;

const BOID_COLORS = ['#79e6c4', '#8fd2ff', '#c8f0a0', '#ffd98a'];
const BOID_GLOW = ['rgba(121,230,196,0.5)', 'rgba(143,210,255,0.5)', 'rgba(200,240,160,0.5)', 'rgba(255,217,138,0.55)'];

let solids = [];
let solidGrid = null, sgCols = 0, sgRows = 0;
const SG_CELL = 150;

let foods = [];      // {x,y,amt,life,wild,pulse}
let preds = [];      // {x,y,vx,vy,cool,stun,tx,ty,retarget,flap}
let zones = [];
let shocks = [];     // {x,y,t,max}

const drone = { x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, mode: 'lure', pulseCd: 0, pellets: 0 };

const run = {
  scen: null, sandbox: false, active: false,
  t: 0, holdT: 0, eaten: 0, lost: 0, pulses: 0,
  startBoids: 0, over: false, result: null,
  clusterT: 0, playSec: 0,
};

let shakeAmt = 0, shakeX = 0, shakeY = 0;
let gustPhase = 0;

/* ---- spatial hash -------------------------------------------------------- */
let hCell = 55, hCols = 0, hRows = 0;
let hCount = null, hStart = null, hItems = new Int32Array(MAXB);

function buildHash() {
  hCell = Math.max(18, P.per);
  const cols = Math.ceil(W / hCell) + 1;
  const rows = Math.ceil(H / hCell) + 1;
  if (cols !== hCols || rows !== hRows || !hStart) {
    hCols = cols; hRows = rows;
    hCount = new Int32Array(cols * rows + 1);
    hStart = new Int32Array(cols * rows + 1);
  } else {
    hCount.fill(0);
  }
  const nCells = hCols * hRows;
  for (let i = 0; i < bN; i++) {
    let cx = (bx[i] / hCell) | 0; if (cx < 0) cx = 0; else if (cx >= hCols) cx = hCols - 1;
    let cy = (by[i] / hCell) | 0; if (cy < 0) cy = 0; else if (cy >= hRows) cy = hRows - 1;
    hCount[cy * hCols + cx]++;
  }
  let acc = 0;
  for (let c = 0; c < nCells; c++) { hStart[c] = acc; acc += hCount[c]; }
  hStart[nCells] = acc;
  const cursor = hCount; // reuse as write cursor
  for (let c = 0; c < nCells; c++) cursor[c] = hStart[c];
  for (let i = 0; i < bN; i++) {
    let cx = (bx[i] / hCell) | 0; if (cx < 0) cx = 0; else if (cx >= hCols) cx = hCols - 1;
    let cy = (by[i] / hCell) | 0; if (cy < 0) cy = 0; else if (cy >= hRows) cy = hRows - 1;
    hItems[cursor[cy * hCols + cx]++] = i;
  }
}

/* ---- solid broadphase ---------------------------------------------------- */
function buildSolidGrid() {
  sgCols = Math.ceil(W / SG_CELL) + 1;
  sgRows = Math.ceil(H / SG_CELL) + 1;
  solidGrid = new Array(sgCols * sgRows);
  for (let i = 0; i < solidGrid.length; i++) solidGrid[i] = null;
  const pad = 34;
  for (let si = 0; si < solids.length; si++) {
    const s = solids[si];
    let x0, y0, x1, y1;
    if (s.k === 0) { x0 = s.x - s.r - pad; x1 = s.x + s.r + pad; y0 = s.y - s.r - pad; y1 = s.y + s.r + pad; }
    else {
      x0 = Math.min(s.x1, s.x2) - s.r - pad; x1 = Math.max(s.x1, s.x2) + s.r + pad;
      y0 = Math.min(s.y1, s.y2) - s.r - pad; y1 = Math.max(s.y1, s.y2) + s.r + pad;
    }
    const cx0 = clamp((x0 / SG_CELL) | 0, 0, sgCols - 1);
    const cx1 = clamp((x1 / SG_CELL) | 0, 0, sgCols - 1);
    const cy0 = clamp((y0 / SG_CELL) | 0, 0, sgRows - 1);
    const cy1 = clamp((y1 / SG_CELL) | 0, 0, sgRows - 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = cy * sgCols + cx;
        if (!solidGrid[k]) solidGrid[k] = [];
        solidGrid[k].push(s);
      }
    }
  }
}
function solidsAt(x, y) {
  if (!solidGrid) return null;
  const cx = clamp((x / SG_CELL) | 0, 0, sgCols - 1);
  const cy = clamp((y / SG_CELL) | 0, 0, sgRows - 1);
  return solidGrid[cy * sgCols + cx];
}

/* Scratch for distance query */
let _d = 0, _nx = 0, _ny = 0;
function solidDist(s, x, y) {
  if (s.k === 0) {
    const dx = x - s.x, dy = y - s.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0001) { d = 0.0001; _nx = 1; _ny = 0; } else { _nx = dx / d; _ny = dy / d; }
    _d = d;
  } else {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((x - s.x1) * ex + (y - s.y1) * ey) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = s.x1 + ex * t, py = s.y1 + ey * t;
    const dx = x - px, dy = y - py;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0001) { d = 0.0001; _nx = 1; _ny = 0; } else { _nx = dx / d; _ny = dy / d; }
    _d = d;
  }
  return _d;
}

/* ==========================================================================
 * 8. PARTICLES (pooled)
 * ======================================================================== */

const px = new Float32Array(MAXP), py = new Float32Array(MAXP);
const pvx = new Float32Array(MAXP), pvy = new Float32Array(MAXP);
const pl = new Float32Array(MAXP), pmx = new Float32Array(MAXP);
const psz = new Float32Array(MAXP);
const pcl = new Uint8Array(MAXP);
let pN = 0;
const PART_COLORS = ['#79e6c4', '#ff9b9b', '#ffd98a', '#8fd2ff', '#dfeee9'];

function spawnParticle(x, y, vx2, vy2, life, size, col) {
  if (!SET.particles) return;
  if (pN >= MAXP) return;
  const i = pN++;
  px[i] = x; py[i] = y; pvx[i] = vx2; pvy[i] = vy2;
  pl[i] = life; pmx[i] = life; psz[i] = size; pcl[i] = col;
}
function burst(x, y, n, spd, life, size, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = spd * (0.35 + Math.random() * 0.9);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), size, col);
  }
}
function stepParticles(dt) {
  for (let i = 0; i < pN; i++) {
    pl[i] -= dt;
    if (pl[i] <= 0) {
      const j = --pN;
      px[i] = px[j]; py[i] = py[j]; pvx[i] = pvx[j]; pvy[i] = pvy[j];
      pl[i] = pl[j]; pmx[i] = pmx[j]; psz[i] = psz[j]; pcl[i] = pcl[j];
      i--; continue;
    }
    px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
    pvx[i] *= 0.965; pvy[i] *= 0.965;
  }
}

/* ==========================================================================
 * 9. CANVAS / VIEW
 * ======================================================================== */

const cv = $('cv');
const ctx = cv.getContext('2d', { alpha: false });
let cw = 900, ch = 600, dpr = 1;
const view = { s: 1, ox: 0, oy: 0, zoom: 1 };
let bgCanvas = null;

function resize() {
  const r = cv.getBoundingClientRect();
  cw = Math.max(320, Math.round(r.width));
  ch = Math.max(240, Math.round(r.height));
  dpr = clamp(window.devicePixelRatio || 1, 1, SET.quality === 'low' ? 1 : 2);
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(ch * dpr);
  makeBackground();
}
window.addEventListener('resize', resize);

function makeBackground() {
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = cv.width; bgCanvas.height = cv.height;
  const g = bgCanvas.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, cv.height);
  grd.addColorStop(0, '#08201f');
  grd.addColorStop(0.55, '#051413');
  grd.addColorStop(1, '#020a0b');
  g.fillStyle = grd;
  g.fillRect(0, 0, cv.width, cv.height);
  // soft aurora blobs
  for (let i = 0; i < 4; i++) {
    const rg = g.createRadialGradient(
      cv.width * (0.18 + i * 0.24), cv.height * (0.2 + (i % 2) * 0.5), 0,
      cv.width * (0.18 + i * 0.24), cv.height * (0.2 + (i % 2) * 0.5), cv.width * 0.30
    );
    rg.addColorStop(0, i % 2 ? 'rgba(30,90,110,0.13)' : 'rgba(30,110,80,0.13)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, cv.width, cv.height);
  }
}

function updateView() {
  const base = Math.min(cw / W, ch / H);
  const s = base * view.zoom;
  let cx = W / 2, cy = H / 2;
  if (view.zoom > 1.002) {
    const hw = cw / (2 * s), hh = ch / (2 * s);
    cx = clamp(drone.x, Math.min(hw, W / 2), Math.max(W - hw, W / 2));
    cy = clamp(drone.y, Math.min(hh, H / 2), Math.max(H - hh, H / 2));
  }
  view.s = s;
  view.ox = cw / 2 - cx * s;
  view.oy = ch / 2 - cy * s;
}
function screenToWorld(sx, sy) {
  return { x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s };
}

/* ==========================================================================
 * 10. INPUT
 * ======================================================================== */

const keys = Object.create(null);
const mouse = { x: 0, y: 0, wx: W / 2, wy: H / 2, down: false, right: false, inside: false };
let placeTool = 'none';

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (keys[k]) return;
  keys[k] = true;
  Audio2.resume();

  if (k === 'escape' || k === 'p') {
    if (uiState === 'play') openPause();
    else if (uiState === 'pause') closePause();
    else if (uiState === 'menu') { /* stay */ }
    return;
  }
  if (uiState !== 'play') return;

  if (k === ' ') firePulse();
  else if (k === 'e') dropPellet();
  else if (k === 'q') { drone.mode = drone.mode === 'lure' ? 'scare' : 'lure'; Audio2.click(); syncHud(); }
  else if (k === 't') toggleTune();
  else if (k === 'r') restartRun();
  else if (k === 'z') { view.zoom = 1; }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; mouse.right = false; });

cv.addEventListener('pointerdown', (e) => {
  Audio2.resume();
  const r = cv.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  const w = screenToWorld(mouse.x, mouse.y);
  mouse.wx = w.x; mouse.wy = w.y;
  if (uiState !== 'play') return;
  if (e.button === 1) { view.zoom = 1; e.preventDefault(); return; }
  if (e.button === 2) { mouse.right = true; return; }
  mouse.down = true;
  if (run.sandbox && placeTool !== 'none') doPlace(w.x, w.y);
  try { cv.setPointerCapture(e.pointerId); } catch {}
});
cv.addEventListener('pointermove', (e) => {
  const r = cv.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  const w = screenToWorld(mouse.x, mouse.y);
  mouse.wx = w.x; mouse.wy = w.y;
  mouse.inside = true;
});
cv.addEventListener('pointerleave', () => { mouse.inside = false; mouse.down = false; });
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) mouse.right = false; else mouse.down = false;
});
cv.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (uiState !== 'play') return;
  const r = cv.getBoundingClientRect();
  const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
  if (run.sandbox) removeNear(w.x, w.y);
});
cv.addEventListener('wheel', (e) => {
  if (uiState !== 'play') return;
  e.preventDefault();
  view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 0.9 : 1.11), 1, 3);
}, { passive: false });

/* ==========================================================================
 * 11. RUN SETUP
 * ======================================================================== */

function addBoid(x, y, tint) {
  if (bN >= MAXB) return;
  const i = bN++;
  bx[i] = x; by[i] = y;
  const a = Math.random() * TAU, sp = P.spd * (0.5 + Math.random() * 0.4);
  bvx[i] = Math.cos(a) * sp; bvy[i] = Math.sin(a) * sp;
  bph[i] = Math.random() * TAU;
  bpk[i] = 0;
  btn[i] = tint !== undefined ? tint : (Math.random() < 0.045 ? 3 : (Math.random() * 3) | 0);
}
function killBoid(i, byPredator) {
  const j = --bN;
  if (i !== j) {
    bx[i] = bx[j]; by[i] = by[j]; bvx[i] = bvx[j]; bvy[i] = bvy[j];
    bph[i] = bph[j]; bpk[i] = bpk[j]; btn[i] = btn[j];
  }
  if (byPredator) run.lost++;
}
function spawnFlock(n, sx, sy, sr) {
  bN = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * sr;
    addBoid(clamp(sx + Math.cos(a) * r, 20, W - 20), clamp(sy + Math.sin(a) * r, 20, H - 20));
  }
}
function addPredator(x, y) {
  preds.push({ x, y, vx: 0, vy: 0, cool: 1.5 + Math.random(), stun: 0, tx: W / 2, ty: H / 2, retarget: 0, flap: Math.random() * TAU });
}

function applyTune(t) {
  if (!t) return;
  for (const k in t) if (k in P) P[k] = t[k];
}

function startScenario(idx) {
  const sc = SCEN[idx];
  run.scen = sc; run.sandbox = false;
  resetRunCommon();
  applyTune(sc.tune);
  P.windX = sc.wind.x; P.windY = sc.wind.y;
  P.edge = 'steer';
  solids = sc.build();
  buildSolidGrid();
  zones = (sc.zones || []).map((z) => ({ x: z.x, y: z.y, r: z.r, need: z.need, cur: 0, pulse: 0 }));
  foods = [];
  if (sc.wildSeeds) for (const [x, y] of sc.wildSeeds) foods.push({ x, y, amt: 1, life: 1e9, wild: true, pulse: Math.random() * TAU });
  preds = [];
  const pcount = sc.predators || 0;
  for (let i = 0; i < pcount; i++) {
    const a = (i / Math.max(1, pcount)) * TAU;
    addPredator(W / 2 + Math.cos(a) * 480, clamp(H / 2 + Math.sin(a) * 300, 60, H - 60));
  }
  spawnFlock(sc.boids, sc.spawn.x, sc.spawn.y, sc.spawn.r);
  run.startBoids = bN;
  drone.x = sc.spawn.x; drone.y = sc.spawn.y;
  drone.pellets = sc.pellets;
  P.count = sc.boids;
  syncSliders();
  enterPlay();
  toast(sc.name.toUpperCase(), 'gold');
  toast(sc.brief);
}

function startSandbox() {
  run.scen = null; run.sandbox = true;
  resetRunCommon();
  applyTune(PRESETS.classic);
  P.count = Math.max(120, P.count || 200);
  P.windX = 0; P.windY = 0;
  solids = scatterRocks([[380, 300, 66], [980, 620, 74], [700, 200, 46], [280, 700, 52], [1120, 260, 56]]);
  buildSolidGrid();
  zones = []; foods = []; preds = [];
  spawnFlock(P.count, W / 2, H / 2, 260);
  run.startBoids = bN;
  drone.x = W / 2; drone.y = H / 2;
  drone.pellets = 99;
  syncSliders();
  enterPlay();
  toast('SANDBOX â€” press T for the tuning drawer', 'gold');
}

function resetRunCommon() {
  run.active = true; run.t = 0; run.holdT = 0; run.eaten = 0; run.lost = 0;
  run.pulses = 0; run.over = false; run.result = null; run.clusterT = 0;
  drone.vx = 0; drone.vy = 0; drone.pulseCd = 0; drone.mode = 'lure';
  shocks.length = 0; pN = 0; shakeAmt = 0; view.zoom = 1;
  placeTool = 'none'; syncToolButtons();
}
function restartRun() {
  if (run.sandbox) startSandbox();
  else if (run.scen) startScenario(SCEN.indexOf(run.scen));
}

/* ==========================================================================
 * 12. PLAYER ACTIONS
 * ======================================================================== */

function firePulse() {
  if (drone.pulseCd > 0 || !run.active || run.over) return;
  drone.pulseCd = 3.0;
  run.pulses++;
  PROG.pulses++;
  const R = 265, RR = R * R;
  for (let i = 0; i < bN; i++) {
    const dx = bx[i] - drone.x, dy = by[i] - drone.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > RR) continue;
    const d = Math.sqrt(d2) || 1;
    const k = (1 - d / R) * 420;
    bvx[i] += (dx / d) * k; bvy[i] += (dy / d) * k;
    bpk[i] = Math.min(1, bpk[i] + 0.6);
  }
  for (const p of preds) {
    const dx = p.x - drone.x, dy = p.y - drone.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 330) {
      p.stun = 2.4;
      p.vx += (dx / d) * 260; p.vy += (dy / d) * 260;
      burst(p.x, p.y, 10, 130, 0.5, 2.4, 1);
    }
  }
  shocks.push({ x: drone.x, y: drone.y, t: 0, max: 0.55 });
  burst(drone.x, drone.y, 26, 240, 0.45, 2.2, 3);
  addShake(7);
  Audio2.pulse();
  checkProgressiveAch();
  syncHud();
}

function dropPellet() {
  if (!run.active || run.over) return;
  if (drone.pellets <= 0) { Audio2.back(); toast('No seed pods left', 'bad'); return; }
  if (!run.sandbox) drone.pellets--;
  foods.push({ x: drone.x, y: drone.y, amt: run.sandbox ? 30 : 14, life: run.sandbox ? 1e9 : 32, wild: false, pulse: 0 });
  burst(drone.x, drone.y, 9, 70, 0.5, 1.8, 2);
  Audio2.seed();
  syncHud();
}

function doPlace(x, y) {
  if (placeTool === 'rock') {
    solids.push(circle(x, y, 34 + Math.random() * 34));
    buildSolidGrid(); Audio2.click();
  } else if (placeTool === 'seed') {
    foods.push({ x, y, amt: 30, life: 1e9, wild: false, pulse: 0 });
    Audio2.seed();
  } else if (placeTool === 'hawk') {
    if (preds.length < 10) { addPredator(x, y); Audio2.kill(); }
  }
}
function removeNear(x, y) {
  let bestI = -1, bestD = 60 * 60, kind = null;
  for (let i = 0; i < foods.length; i++) {
    const d = (foods[i].x - x) ** 2 + (foods[i].y - y) ** 2;
    if (d < bestD) { bestD = d; bestI = i; kind = 'food'; }
  }
  for (let i = 0; i < preds.length; i++) {
    const d = (preds[i].x - x) ** 2 + (preds[i].y - y) ** 2;
    if (d < bestD) { bestD = d; bestI = i; kind = 'pred'; }
  }
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s.k !== 0) continue;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < Math.max(bestD, s.r * s.r)) { bestD = d; bestI = i; kind = 'solid'; }
  }
  if (bestI < 0) return;
  if (kind === 'food') foods.splice(bestI, 1);
  else if (kind === 'pred') preds.splice(bestI, 1);
  else { solids.splice(bestI, 1); buildSolidGrid(); }
  Audio2.back();
}

function addShake(v) { if (SET.shake) shakeAmt = Math.min(18, shakeAmt + v); }

/* ==========================================================================
 * 13. SIMULATION STEP
 * ======================================================================== */

function stepDrone(dt) {
  const acc = 1500, maxV = 430;
  let ax = 0, ay = 0;
  if (keys['a'] || keys['arrowleft']) ax -= 1;
  if (keys['d'] || keys['arrowright']) ax += 1;
  if (keys['w'] || keys['arrowup']) ay -= 1;
  if (keys['s'] || keys['arrowdown']) ay += 1;
  const m = Math.hypot(ax, ay);
  if (m > 0) { ax /= m; ay /= m; }
  else if (mouse.down && mouse.inside) {
    const dx = mouse.wx - drone.x, dy = mouse.wy - drone.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) { ax = dx / d; ay = dy / d; }
  }
  drone.vx += ax * acc * dt;
  drone.vy += ay * acc * dt;
  const damp = Math.pow(0.0016, dt);
  drone.vx *= damp; drone.vy *= damp;
  const sp = Math.hypot(drone.vx, drone.vy);
  if (sp > maxV) { drone.vx = drone.vx / sp * maxV; drone.vy = drone.vy / sp * maxV; }
  drone.x = clamp(drone.x + drone.vx * dt, 8, W - 8);
  drone.y = clamp(drone.y + drone.vy * dt, 8, H - 8);
  if (drone.pulseCd > 0) drone.pulseCd = Math.max(0, drone.pulseCd - dt);

  // wing-trail sparkles
  if (SET.particles && Math.random() < 0.34) {
    spawnParticle(drone.x, drone.y, -drone.vx * 0.12 + (Math.random() - 0.5) * 24,
      -drone.vy * 0.12 + (Math.random() - 0.5) * 24, 0.42, 1.5, drone.mode === 'scare' ? 1 : 3);
  }
}

function stepBoids(dt) {
  buildHash();
  const per = P.per, per2 = per * per;
  const spc = P.spc, spc2 = spc * spc;
  const baseSpd = P.spd, baseFrc = P.frc;
  const wSep = P.sep, wAli = P.ali, wCoh = P.coh;
  const scareMode = (drone.mode === 'scare') || keys['shift'] || mouse.right;
  const droneR = scareMode ? 215 : 175;
  const droneR2 = droneR * droneR;
  const gustX = P.windX + Math.sin(gustPhase) * (run.scen ? run.scen.wind.gust : 0);
  const gustY = P.windY + Math.cos(gustPhase * 0.77) * (run.scen ? run.scen.wind.gust : 0) * 0.5;
  const edgeMargin = 78;
  const wrap = P.edge === 'wrap', bounce = P.edge === 'bounce';

  for (let i = 0; i < bN; i++) {
    const x = bx[i], y = by[i], vx = bvx[i], vy = bvy[i];

    /* ---- neighbours via 3x3 hash cells ---- */
    let cx = (x / hCell) | 0; if (cx < 0) cx = 0; else if (cx >= hCols) cx = hCols - 1;
    let cy = (y / hCell) | 0; if (cy < 0) cy = 0; else if (cy >= hRows) cy = hRows - 1;
    const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < hCols - 1 ? cx + 1 : hCols - 1;
    const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < hRows - 1 ? cy + 1 : hRows - 1;

    let sx = 0, sy = 0, alx = 0, aly = 0, chx = 0, chy = 0, n = 0, seen = 0;
    for (let gy = y0; gy <= y1; gy++) {
      const rowBase = gy * hCols;
      for (let gx = x0; gx <= x1; gx++) {
        const c = rowBase + gx;
        const s0 = hStart[c], s1 = hStart[c + 1];
        for (let k = s0; k < s1; k++) {
          const j = hItems[k];
          if (j === i) continue;
          if (seen > 40) break;
          const dx = bx[j] - x, dy = by[j] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > per2 || d2 < 0.0001) continue;
          seen++;
          n++;
          alx += bvx[j]; aly += bvy[j];
          chx += bx[j]; chy += by[j];
          if (d2 < spc2) {
            const d = Math.sqrt(d2);
            const w = (spc - d) / spc;
            sx -= (dx / d) * w; sy -= (dy / d) * w;
          }
        }
      }
    }

    /* ---- panic (predator proximity) ---- */
    let panic = 0;
    let fx = 0, fy = 0;
    if (preds.length) {
      const fearR = 145;
      for (let q = 0; q < preds.length; q++) {
        const p = preds[q];
        const dx = x - p.x, dy = y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > fearR * fearR) continue;
        const d = Math.sqrt(d2) || 1;
        const t = 1 - d / fearR;
        panic = Math.max(panic, t);
        fx += (dx / d) * t; fy += (dy / d) * t;
      }
    }
    bpk[i] = bpk[i] * 0.92 + panic * 0.08;
    const maxSpd = baseSpd * (1 + panic * 0.40);
    const maxFrc = baseFrc * (1 + panic * 0.55);

    /* ---- flocking accel (clamped as a group) ---- */
    let ax = 0, ay = 0;
    if (n > 0) {
      const inv = 1 / n;
      // alignment
      let axx = alx * inv, ayy = aly * inv;
      let m = Math.hypot(axx, ayy);
      if (m > 0.0001) {
        axx = (axx / m) * maxSpd - vx; ayy = (ayy / m) * maxSpd - vy;
        m = Math.hypot(axx, ayy);
        if (m > maxFrc) { axx = axx / m * maxFrc; ayy = ayy / m * maxFrc; }
        ax += axx * wAli; ay += ayy * wAli;
      }
      // cohesion
      let cxx = chx * inv - x, cyy = chy * inv - y;
      m = Math.hypot(cxx, cyy);
      if (m > 0.0001) {
        cxx = (cxx / m) * maxSpd - vx; cyy = (cyy / m) * maxSpd - vy;
        m = Math.hypot(cxx, cyy);
        if (m > maxFrc) { cxx = cxx / m * maxFrc; cyy = cyy / m * maxFrc; }
        ax += cxx * wCoh; ay += cyy * wCoh;
      }
    }
    if (sx !== 0 || sy !== 0) {
      let m = Math.hypot(sx, sy);
      let ssx = (sx / m) * maxSpd - vx, ssy = (sy / m) * maxSpd - vy;
      m = Math.hypot(ssx, ssy);
      if (m > maxFrc) { ssx = ssx / m * maxFrc; ssy = ssy / m * maxFrc; }
      ax += ssx * wSep; ay += ssy * wSep;
    }
    // wander (tangential wiggle)
    if (P.wan > 0) {
      bph[i] += dt * (2.1 + (i % 7) * 0.13);
      const sp0 = Math.hypot(vx, vy) || 1;
      const tnx = -vy / sp0, tny = vx / sp0;
      const wv = Math.sin(bph[i]) * P.wan * maxFrc * 0.85;
      ax += tnx * wv; ay += tny * wv;
    }
    // clamp the flocking budget so avoidance always wins
    let am = Math.hypot(ax, ay);
    const budget = maxFrc * 1.6;
    if (am > budget) { ax = ax / am * budget; ay = ay / am * budget; }

    /* ---- predators ---- */
    if (fx !== 0 || fy !== 0) {
      const m = Math.hypot(fx, fy) || 1;
      ax += (fx / m) * P.fea * maxFrc * Math.min(1.4, m);
      ay += (fy / m) * P.fea * maxFrc * Math.min(1.4, m);
    }

    /* ---- food ---- */
    if (foods.length && P.fod > 0) {
      let bd = 240 * 240, bi = -1;
      for (let q = 0; q < foods.length; q++) {
        const f = foods[q];
        const d2 = (f.x - x) ** 2 + (f.y - y) ** 2;
        if (d2 < bd) { bd = d2; bi = q; }
      }
      if (bi >= 0) {
        const f = foods[bi];
        const d = Math.sqrt(bd) || 1;
        ax += ((f.x - x) / d) * P.fod * maxFrc * 0.55;
        ay += ((f.y - y) / d) * P.fod * maxFrc * 0.55;
        if (d < 13) {
          f.amt--;
          run.eaten++;
          burst(f.x, f.y, 5, 60, 0.35, 1.5, 2);
          if (Math.random() < 0.5) Audio2.eat();
          if (f.amt <= 0) foods.splice(bi, 1);
        }
      }
    }

    /* ---- drone ---- */
    {
      const dx = drone.x - x, dy = drone.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < droneR2 && d2 > 1) {
        const d = Math.sqrt(d2);
        const t = 1 - d / droneR;
        if (scareMode) {
          ax -= (dx / d) * t * maxFrc * 2.4;
          ay -= (dy / d) * t * maxFrc * 2.4;
        } else {
          const near = d < 42 ? -0.5 : 1;
          ax += (dx / d) * t * P.drn * maxFrc * 0.55 * near;
          ay += (dy / d) * t * P.drn * maxFrc * 0.55 * near;
        }
      }
    }

    /* ---- wind ---- */
    ax += gustX; ay += gustY;

    /* ---- solids ---- */
    const cell = solidsAt(x, y);
    if (cell) {
      for (let q = 0; q < cell.length; q++) {
        const s = cell[q];
        const d = solidDist(s, x, y);
        const margin = 30;
        const surf = d - s.r;
        if (surf < margin) {
          const pen = Math.min(48, margin - surf);
          const k = pen * maxFrc * 0.16;
          ax += _nx * k; ay += _ny * k;
          // tangential slide so boids sweep around instead of jamming
          const tgx = -_ny, tgy = _nx;
          const sgn = (vx * tgx + vy * tgy) >= 0 ? 1 : -1;
          ax += tgx * sgn * k * 0.55; ay += tgy * sgn * k * 0.55;
        }
      }
    }

    /* ---- edges ---- */
    if (!wrap) {
      if (x < edgeMargin) ax += (1 - x / edgeMargin) * maxFrc * 3.0;
      else if (x > W - edgeMargin) ax -= (1 - (W - x) / edgeMargin) * maxFrc * 3.0;
      if (y < edgeMargin) ay += (1 - y / edgeMargin) * maxFrc * 3.0;
      else if (y > H - edgeMargin) ay -= (1 - (H - y) / edgeMargin) * maxFrc * 3.0;
    }

    /* ---- integrate ---- */
    let nvx = vx + ax * dt, nvy = vy + ay * dt;
    let sp = Math.hypot(nvx, nvy);
    const minSpd = maxSpd * 0.34;
    if (sp > maxSpd) { nvx = nvx / sp * maxSpd; nvy = nvy / sp * maxSpd; }
    else if (sp < minSpd) {
      if (sp < 0.001) { nvx = maxSpd; nvy = 0; }
      else { nvx = nvx / sp * minSpd; nvy = nvy / sp * minSpd; }
    }
    let nx2 = x + nvx * dt, ny2 = y + nvy * dt;

    if (wrap) {
      if (nx2 < 0) nx2 += W; else if (nx2 > W) nx2 -= W;
      if (ny2 < 0) ny2 += H; else if (ny2 > H) ny2 -= H;
    } else if (bounce) {
      if (nx2 < 4) { nx2 = 4; nvx = Math.abs(nvx); }
      else if (nx2 > W - 4) { nx2 = W - 4; nvx = -Math.abs(nvx); }
      if (ny2 < 4) { ny2 = 4; nvy = Math.abs(nvy); }
      else if (ny2 > H - 4) { ny2 = H - 4; nvy = -Math.abs(nvy); }
    } else {
      if (nx2 < 3) { nx2 = 3; if (nvx < 0) nvx *= -0.35; }
      else if (nx2 > W - 3) { nx2 = W - 3; if (nvx > 0) nvx *= -0.35; }
      if (ny2 < 3) { ny2 = 3; if (nvy < 0) nvy *= -0.35; }
      else if (ny2 > H - 3) { ny2 = H - 3; if (nvy > 0) nvy *= -0.35; }
    }

    /* hard de-penetration so nobody tunnels through stone */
    const cell2 = solidsAt(nx2, ny2);
    if (cell2) {
      for (let q = 0; q < cell2.length; q++) {
        const s = cell2[q];
        const d = solidDist(s, nx2, ny2);
        if (d < s.r + 3.2) {
          const push = s.r + 3.2 - d;
          nx2 += _nx * push; ny2 += _ny * push;
          const dot = nvx * _nx + nvy * _ny;
          if (dot < 0) { nvx -= _nx * dot * 1.45; nvy -= _ny * dot * 1.45; }
        }
      }
    }

    bx[i] = nx2; by[i] = ny2; bvx[i] = nvx; bvy[i] = nvy;
  }
}

function stepPredators(dt) {
  for (let q = 0; q < preds.length; q++) {
    const p = preds[q];
    p.flap += dt * 9;
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx *= Math.pow(0.05, dt); p.vy *= Math.pow(0.05, dt);
      p.x = clamp(p.x + p.vx * dt, 10, W - 10);
      p.y = clamp(p.y + p.vy * dt, 10, H - 10);
      if (SET.particles && Math.random() < 0.4) {
        spawnParticle(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4, 1.6, 3);
      }
      continue;
    }
    if (p.cool > 0) p.cool -= dt;

    p.retarget -= dt;
    if (p.retarget <= 0) {
      p.retarget = 0.22;
      let bd = 1e9, bi = -1;
      for (let i = 0; i < bN; i++) {
        const d2 = (bx[i] - p.x) ** 2 + (by[i] - p.y) ** 2;
        if (d2 < bd) { bd = d2; bi = i; }
      }
      if (bi >= 0) { p.tx = bx[bi]; p.ty = by[bi]; }
      else { p.tx = W / 2 + (Math.random() - 0.5) * 500; p.ty = H / 2 + (Math.random() - 0.5) * 400; }
    }

    const hunting = p.cool <= 0;
    const maxV = hunting ? 152 : 74;
    const acc = hunting ? 460 : 220;
    let dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    let ax = (dx / d) * acc, ay = (dy / d) * acc;

    // avoid rock
    const cell = solidsAt(p.x, p.y);
    if (cell) {
      for (let k = 0; k < cell.length; k++) {
        const s = cell[k];
        const sd = solidDist(s, p.x, p.y);
        const surf = sd - s.r;
        if (surf < 40) {
          const pen = Math.min(52, 40 - surf);
          ax += _nx * pen * 24; ay += _ny * pen * 24;
        }
      }
    }
    // shy away from the drone a little
    const ddx = p.x - drone.x, ddy = p.y - drone.y;
    const dd = Math.hypot(ddx, ddy) || 1;
    if (dd < 150) { ax += (ddx / dd) * 340; ay += (ddy / dd) * 340; }

    if (p.x < 60) ax += 500; else if (p.x > W - 60) ax -= 500;
    if (p.y < 60) ay += 500; else if (p.y > H - 60) ay -= 500;

    p.vx += ax * dt; p.vy += ay * dt;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > maxV) { p.vx = p.vx / sp * maxV; p.vy = p.vy / sp * maxV; }
    p.x = clamp(p.x + p.vx * dt, 8, W - 8);
    p.y = clamp(p.y + p.vy * dt, 8, H - 8);

    // strike
    if (hunting) {
      for (let i = 0; i < bN; i++) {
        const dx2 = bx[i] - p.x, dy2 = by[i] - p.y;
        if (dx2 * dx2 + dy2 * dy2 < 169) {
          burst(bx[i], by[i], 9, 110, 0.55, 2.0, 1);
          killBoid(i, true);
          p.cool = 4.6;
          addShake(4);
          Audio2.kill();
          break;
        }
      }
    }
  }
}

function stepFoods(dt) {
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    f.pulse += dt * 3;
    if (f.life < 1e8) {
      f.life -= dt;
      if (f.life <= 0) { foods.splice(i, 1); continue; }
    }
  }
}

function stepShocks(dt) {
  for (let i = shocks.length - 1; i >= 0; i--) {
    shocks[i].t += dt;
    if (shocks[i].t > shocks[i].max) shocks.splice(i, 1);
  }
}

/* ==========================================================================
 * 14. OBJECTIVES
 * ======================================================================== */

function stepObjectives(dt) {
  if (run.sandbox) {
    // Sandbox achievements
    if (bN >= 800) unlock('swarm_lord');
    if (bN > PROG.bestFlock) { PROG.bestFlock = bN; }
    // murmuration: 200+ boids inside r=170 of the flock centroid
    if (bN >= 200) {
      let cx = 0, cy = 0;
      for (let i = 0; i < bN; i++) { cx += bx[i]; cy += by[i]; }
      cx /= bN; cy /= bN;
      let inC = 0;
      for (let i = 0; i < bN; i++) {
        if ((bx[i] - cx) ** 2 + (by[i] - cy) ** 2 < 170 * 170) inC++;
      }
      if (inC >= 200) {
        run.clusterT += dt;
        if (run.clusterT >= 10) unlock('murmuration');
      } else run.clusterT = Math.max(0, run.clusterT - dt * 2);
    } else run.clusterT = 0;
    return;
  }

  const sc = run.scen;
  if (!sc || run.over) return;
  run.t += dt;

  // failure: flock too small
  if (bN < sc.minAlive) { finishRun(false, 'The flock is broken'); return; }

  if (sc.goal.type === 'zone') {
    let allOk = true;
    for (const z of zones) {
      let c = 0;
      const rr = z.r * z.r;
      for (let i = 0; i < bN; i++) {
        if ((bx[i] - z.x) ** 2 + (by[i] - z.y) ** 2 < rr) c++;
      }
      z.cur = c;
      if (c < z.need) allOk = false;
    }
    if (allOk) {
      const prev = run.holdT;
      run.holdT += dt;
      if (Math.floor(run.holdT * 2) !== Math.floor(prev * 2)) Audio2.tick();
      if (run.holdT >= sc.goal.hold) { finishRun(true); return; }
    } else {
      run.holdT = Math.max(0, run.holdT - dt * 1.6);
    }
    if (run.t >= sc.limit) { finishRun(false, 'Out of time'); return; }
  } else if (sc.goal.type === 'collect') {
    if (run.eaten >= sc.goal.need) { finishRun(true); return; }
    if (run.t >= sc.limit) { finishRun(false, 'Out of time'); return; }
  } else if (sc.goal.type === 'survive') {
    if (run.t >= sc.goal.seconds) { finishRun(true); return; }
  }
}

function medalFor(sc, timeUsed, alive) {
  const m = sc.medals;
  const ok = (tier) => alive >= tier.alive && (tier.t === 0 || timeUsed <= tier.t);
  if (ok(m.gold)) return 'gold';
  if (ok(m.silver)) return 'silver';
  if (ok(m.bronze)) return 'bronze';
  return 'none';
}

function finishRun(won, reason) {
  if (run.over) return;
  run.over = true;
  run.active = false;
  const sc = run.scen;
  const alive = bN;
  const timeUsed = run.t;
  let medal = 'none', score = 0;
  if (won && sc) {
    medal = medalFor(sc, timeUsed, alive);
    score = alive * 100
      + Math.max(0, Math.round((sc.limit - timeUsed) * 18))
      + (medal === 'gold' ? 1500 : medal === 'silver' ? 900 : medal === 'bronze' ? 450 : 0)
      + drone.pellets * 60;
  }
  run.result = { won, reason: reason || '', medal, score, alive, timeUsed, lost: run.lost, eaten: run.eaten };

  if (won && sc) {
    const rec = PROG.scen[sc.id] || { done: false, bestTime: 1e9, bestAlive: 0, medal: 'none', score: 0 };
    rec.done = true;
    if (timeUsed < rec.bestTime) rec.bestTime = timeUsed;
    if (alive > rec.bestAlive) rec.bestAlive = alive;
    if (score > rec.score) rec.score = score;
    const order = { none: 0, bronze: 1, silver: 2, gold: 3 };
    if (order[medal] > order[rec.medal]) rec.medal = medal;
    PROG.scen[sc.id] = rec;

    unlock('first_flock');
    if (sc.id === 'canyon-run') unlock('canyon_runner');
    if (sc.id === 'long-migration') unlock('sanctuary_keeper');
    if (sc.id === 'hawk-country' && run.lost === 0) unlock('flawless_hawk');
    if (run.pulses === 0) unlock('pacifist_run');
    checkProgressiveAch();
    Audio2.win(medal);
    if (medal === 'gold') addShake(6);
  } else {
    Audio2.lose();
  }
  saveProgress(true);
  showResult();
}

function completedCount() {
  let c = 0;
  for (const s of SCEN) if (PROG.scen[s.id] && PROG.scen[s.id].done) c++;
  return c;
}
function goldCount() {
  let c = 0;
  for (const s of SCEN) if (PROG.scen[s.id] && PROG.scen[s.id].medal === 'gold') c++;
  return c;
}
function checkProgressiveAch() {
  progress('pulse_master', PROG.pulses / 100);
  progress('cartographer', completedCount() / 8);
  progress('gold_rush', goldCount() / 5);
}

/* ==========================================================================
 * 15. RENDERING
 * ======================================================================== */

const boidPaths = [null, null, null, null];

function render(alpha) {
  const q = SET.quality;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (SET.trails && q !== 'low') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(4,16,15,0.27)';
    ctx.fillRect(0, 0, cv.width, cv.height);
  } else {
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
    else { ctx.fillStyle = '#051413'; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  updateView();
  const s = view.s * dpr;
  ctx.setTransform(s, 0, 0, s, (view.ox + shakeX) * dpr, (view.oy + shakeY) * dpr);

  drawArenaFrame();
  drawZones();
  drawSolids();
  drawFoods();
  drawShocks();
  drawParticles();
  drawBoids(q);
  drawPredators();
  drawDrone();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawZoneLabels();
  if (q === 'high') drawVignette();
}

function drawArenaFrame() {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(60,150,130,0.32)';
  ctx.strokeRect(0, 0, W, H);
  if (SET.quality === 'low') return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(45,110,100,0.10)';
  ctx.beginPath();
  for (let x = 100; x < W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 100; y < H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawZones() {
  const t = performance.now() / 1000;
  for (const z of zones) {
    const ok = z.cur >= z.need;
    const pulse = 0.5 + 0.5 * Math.sin(t * (ok ? 5 : 2));
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.fillStyle = ok ? `rgba(95,227,176,${0.13 + pulse * 0.08})` : 'rgba(60,150,130,0.07)';
    ctx.fill();
    ctx.lineWidth = ok ? 4 : 2.5;
    ctx.strokeStyle = ok ? `rgba(140,255,210,${0.7 + pulse * 0.3})` : 'rgba(95,200,170,0.5)';
    ctx.setLineDash(ok ? [] : [14, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    // inner target ring
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r * (0.30 + pulse * 0.05), 0, TAU);
    ctx.strokeStyle = 'rgba(140,255,210,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawZoneLabels() {
  if (!zones.length) return;
  ctx.font = '600 13px "Segoe UI", monospace';
  ctx.textAlign = 'center';
  for (const z of zones) {
    const sx = z.x * view.s + view.ox + shakeX;
    const sy = (z.y - z.r) * view.s + view.oy + shakeY - 10;
    const ok = z.cur >= z.need;
    const txt = `${z.cur} / ${z.need}`;
    ctx.fillStyle = 'rgba(4,18,17,0.75)';
    const w = ctx.measureText(txt).width + 16;
    ctx.fillRect(sx - w / 2, sy - 15, w, 20);
    ctx.fillStyle = ok ? '#8cffd2' : '#bfe0d7';
    ctx.fillText(txt, sx, sy);
  }
  ctx.textAlign = 'left';
}

function drawSolids() {
  const lowQ = SET.quality === 'low';
  // bodies
  ctx.fillStyle = '#122b2c';
  ctx.strokeStyle = '#2c5c58';
  ctx.lineWidth = 2;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s.k === 0) {
      ctx.beginPath();
      const p = s.poly;
      ctx.moveTo(s.x + p[0][0], s.y + p[0][1]);
      for (let k = 1; k < p.length; k++) ctx.lineTo(s.x + p[k][0], s.y + p[k][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!lowQ) {
        ctx.beginPath();
        ctx.arc(s.x - s.r * 0.28, s.y - s.r * 0.30, s.r * 0.40, 0, TAU);
        ctx.fillStyle = 'rgba(90,180,165,0.10)';
        ctx.fill();
        ctx.fillStyle = '#122b2c';
      }
    }
  }
  // capsule walls
  ctx.lineCap = 'round';
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s.k !== 1) continue;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
    ctx.lineWidth = s.r * 2;
    ctx.strokeStyle = '#122b2c';
    ctx.stroke();
    ctx.lineWidth = s.r * 2 - 5;
    ctx.strokeStyle = '#0d2223';
    ctx.stroke();
    if (!lowQ) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(70,160,145,0.35)';
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

function drawFoods() {
  for (const f of foods) {
    const p = 0.6 + 0.4 * Math.sin(f.pulse);
    ctx.beginPath();
    ctx.arc(f.x, f.y, 12 + p * 5, 0, TAU);
    ctx.fillStyle = f.wild ? 'rgba(255,200,110,0.13)' : 'rgba(160,255,190,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4.5, 0, TAU);
    ctx.fillStyle = f.wild ? '#ffc46b' : '#9dffc6';
    ctx.fill();
    if (!f.wild && f.life < 1e8 && f.life < 8) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (f.life / 8));
      ctx.strokeStyle = 'rgba(255,150,150,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawShocks() {
  for (const sh of shocks) {
    const t = sh.t / sh.max;
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, 30 + t * 250, 0, TAU);
    ctx.strokeStyle = `rgba(160,240,255,${(1 - t) * 0.7})`;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.stroke();
  }
}

function drawParticles() {
  if (!pN) return;
  for (let c = 0; c < PART_COLORS.length; c++) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < pN; i++) {
      if (pcl[i] !== c) continue;
      const a = pl[i] / pmx[i];
      const r = psz[i] * (0.4 + a * 0.9);
      ctx.moveTo(px[i] + r, py[i]);
      ctx.arc(px[i], py[i], r, 0, TAU);
      any = true;
    }
    if (any) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = PART_COLORS[c];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawBoids(q) {
  const size = 4.4;
  if (P.showPer && bN < 400) {
    ctx.strokeStyle = 'rgba(120,220,200,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bN; i += 3) {
      ctx.moveTo(bx[i] + P.per, by[i]);
      ctx.arc(bx[i], by[i], P.per, 0, TAU);
    }
    ctx.stroke();
  }
  for (let c = 0; c < 4; c++) {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < bN; i++) {
      if (btn[i] !== c) continue;
      const vx = bvx[i], vy = bvy[i];
      let sp = Math.hypot(vx, vy);
      if (sp < 0.001) sp = 1;
      const nx = vx / sp, ny = vy / sp;
      const sc = size * (1 + bpk[i] * 0.35);
      const tx = bx[i] + nx * sc * 1.9, ty = by[i] + ny * sc * 1.9;
      const rx = bx[i] - nx * sc * 1.0, ry = by[i] - ny * sc * 1.0;
      ctx.moveTo(tx, ty);
      ctx.lineTo(rx - ny * sc * 0.85, ry + nx * sc * 0.85);
      ctx.lineTo(rx + nx * sc * 0.35, ry + ny * sc * 0.35);
      ctx.lineTo(rx + ny * sc * 0.85, ry - nx * sc * 0.85);
      ctx.closePath();
      any = true;
    }
    if (!any) continue;
    if (q === 'high' && bN <= 500) {
      ctx.shadowColor = BOID_GLOW[c];
      ctx.shadowBlur = 7;
    }
    ctx.fillStyle = BOID_COLORS[c];
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // panicked boids get a red halo
  if (SET.quality !== 'low') {
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < bN; i++) {
      if (bpk[i] < 0.25) continue;
      ctx.moveTo(bx[i] + 9, by[i]);
      ctx.arc(bx[i], by[i], 9, 0, TAU);
      any = true;
    }
    if (any) {
      ctx.strokeStyle = 'rgba(255,110,110,0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
}

function drawPredators() {
  for (const p of preds) {
    let sp = Math.hypot(p.vx, p.vy); if (sp < 0.01) sp = 1;
    const nx = p.vx / sp, ny = p.vy / sp;
    const flap = 1 + Math.sin(p.flap) * 0.28;
    const R = 13;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * R * 1.7, p.y + ny * R * 1.7);
    ctx.lineTo(p.x - nx * R * 0.7 - ny * R * 1.5 * flap, p.y - ny * R * 0.7 + nx * R * 1.5 * flap);
    ctx.lineTo(p.x - nx * R * 1.3, p.y - ny * R * 1.3);
    ctx.lineTo(p.x - nx * R * 0.7 + ny * R * 1.5 * flap, p.y - ny * R * 0.7 - nx * R * 1.5 * flap);
    ctx.closePath();
    if (SET.quality === 'high') { ctx.shadowColor = 'rgba(255,80,80,0.6)'; ctx.shadowBlur = 12; }
    ctx.fillStyle = p.stun > 0 ? '#6d7f8f' : (p.cool > 0 ? '#b45a5a' : '#ff6b6b');
    ctx.fill();
    ctx.shadowBlur = 0;
    if (p.stun > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 + Math.sin(performance.now() / 90) * 3, 0, TAU);
      ctx.strokeStyle = 'rgba(160,220,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawDrone() {
  const scareMode = (drone.mode === 'scare') || keys['shift'] || mouse.right;
  const R = scareMode ? 215 : 175;
  const t = performance.now() / 1000;
  ctx.beginPath();
  ctx.arc(drone.x, drone.y, R, 0, TAU);
  ctx.strokeStyle = scareMode ? 'rgba(255,125,125,0.30)' : 'rgba(95,227,176,0.26)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 12]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(drone.x, drone.y, R * (0.35 + 0.05 * Math.sin(t * 3)), 0, TAU);
  ctx.strokeStyle = scareMode ? 'rgba(255,125,125,0.16)' : 'rgba(95,227,176,0.14)';
  ctx.stroke();

  const ang = t * 2.2;
  ctx.save();
  ctx.translate(drone.x, drone.y);
  ctx.rotate(ang);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
    ctx.lineTo(Math.cos(a + 2.1) * 7, Math.sin(a + 2.1) * 7);
    ctx.lineTo(Math.cos(a - 0.6) * 6, Math.sin(a - 0.6) * 6);
    ctx.closePath();
  }
  ctx.fillStyle = scareMode ? '#ff9b9b' : '#a9ffdd';
  if (SET.quality === 'high') { ctx.shadowColor = scareMode ? 'rgba(255,120,120,0.8)' : 'rgba(120,255,210,0.8)'; ctx.shadowBlur = 14; }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.beginPath();
  ctx.arc(drone.x, drone.y, 4.5, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  if (run.sandbox && placeTool !== 'none' && mouse.inside) {
    ctx.beginPath();
    ctx.arc(mouse.wx, mouse.wy, placeTool === 'rock' ? 44 : 12, 0, TAU);
    ctx.strokeStyle = 'rgba(255,196,107,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

let vignetteCache = null, vigW = 0, vigH = 0;
function drawVignette() {
  if (!vignetteCache || vigW !== cv.width || vigH !== cv.height) {
    vigW = cv.width; vigH = cv.height;
    vignetteCache = document.createElement('canvas');
    vignetteCache.width = vigW; vignetteCache.height = vigH;
    const g = vignetteCache.getContext('2d');
    const rg = g.createRadialGradient(vigW / 2, vigH / 2, Math.min(vigW, vigH) * 0.35,
      vigW / 2, vigH / 2, Math.max(vigW, vigH) * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = rg;
    g.fillRect(0, 0, vigW, vigH);
  }
  ctx.drawImage(vignetteCache, 0, 0);
}

/* ==========================================================================
 * 16. HUD + UI
 * ======================================================================== */

let uiState = 'menu';   // menu | play | pause | result
const el = {};
[
  'hud', 'hudObjName', 'hudObjective', 'hudProgWrap', 'hudProgFill', 'hudProgLabel',
  'hudTime', 'hudFlock', 'hudLost', 'btnHudPause', 'modeChip', 'modeVal', 'pulseChip',
  'pulseVal', 'pulseMeterFill', 'pelletChip', 'pelletVal', 'toastWrap', 'fpsMeter',
  'tuneToggle', 'tunePanel', 'sandboxOnly', 'presetSel', 'edgeSel',
  'mainMenu', 'btnContinue', 'btnScenarios', 'btnSandbox', 'btnHowTo', 'btnAch', 'btnSettings',
  'menuCleared', 'menuGolds', 'menuBestFlock',
  'scenarioMenu', 'scenarioClose', 'scenarioList',
  'howToMenu', 'howToClose', 'howToDone',
  'achMenu', 'achClose', 'achDone', 'achList', 'achCount',
  'settingsMenu', 'settingsClose', 'settingsDone', 'setVol', 'vVol', 'setShake', 'setTrails2',
  'setParticles', 'setFps2', 'setQuality',
  'pauseMenu', 'pauseSub', 'btnResume', 'btnRestart', 'btnPauseTune', 'btnPauseHowTo',
  'btnPauseSettings', 'btnQuit',
  'resultMenu', 'resultIcon', 'resultTitle', 'resultSub', 'resultStats', 'resultTip',
  'btnNext', 'btnRetry', 'btnResultMenu',
  'toolNone', 'toolRock', 'toolSeed', 'toolHawk', 'btnClearRocks', 'btnClearHawks', 'btnScatter',
  'cbTrails', 'cbVectors', 'cbFps', 'btnResetWeights',
].forEach((id) => { el[id] = $(id); });

const SLIDERS = [
  ['tSep', 'vSep', 'sep', 2], ['tAli', 'vAli', 'ali', 2], ['tCoh', 'vCoh', 'coh', 2],
  ['tPer', 'vPer', 'per', 0], ['tSpc', 'vSpc', 'spc', 0], ['tWan', 'vWan', 'wan', 2],
  ['tSpd', 'vSpd', 'spd', 0], ['tFrc', 'vFrc', 'frc', 0], ['tFea', 'vFea', 'fea', 2],
  ['tFod', 'vFod', 'fod', 2], ['tDrn', 'vDrn', 'drn', 2], ['tCnt', 'vCnt', 'count', 0],
  ['tWx', 'vWx', 'windX', 0], ['tWy', 'vWy', 'windY', 0],
];
SLIDERS.forEach(([sid, vid]) => { el[sid] = $(sid); el[vid] = $(vid); });

function syncSliders() {
  for (const [sid, vid, key, dp] of SLIDERS) {
    if (!el[sid]) continue;
    el[sid].value = String(P[key]);
    el[vid].textContent = dp ? Number(P[key]).toFixed(dp) : String(Math.round(P[key]));
  }
  if (el.edgeSel) el.edgeSel.value = P.edge;
  if (el.cbTrails) el.cbTrails.checked = SET.trails;
  if (el.cbVectors) el.cbVectors.checked = P.showPer;
  if (el.cbFps) el.cbFps.checked = SET.showFps;
}

function syncHud() {
  const sc = run.scen;
  el.hudObjName.textContent = run.sandbox ? 'SANDBOX' : (sc ? sc.name.toUpperCase() : '');
  el.hudObjective.textContent = run.sandbox
    ? 'Free flight. Tune the flock, place rocks, seeds and hawks.'
    : (sc ? sc.brief : '');

  el.hudFlock.textContent = String(bN);
  el.hudLost.textContent = String(run.lost);
  el.hudLost.className = run.lost > 0 ? 'warn' : '';

  if (run.sandbox) {
    el.hudTime.textContent = fmtTime(run.t);
    el.hudProgWrap.classList.add('hidden');
  } else if (sc) {
    const left = sc.goal.type === 'survive' ? (sc.goal.seconds - run.t) : (sc.limit - run.t);
    el.hudTime.textContent = fmtTime(left);
    el.hudTime.className = left < 10 ? 'warn' : '';
    el.hudProgWrap.classList.remove('hidden');
    if (sc.goal.type === 'zone') {
      let cur = 0, need = 0;
      for (const z of zones) { cur += Math.min(z.cur, z.need); need += z.need; }
      const holdPct = run.holdT / sc.goal.hold;
      const pct = need ? (cur / need) : 0;
      el.hudProgFill.style.width = (clamp(pct, 0, 1) * 100).toFixed(1) + '%';
      el.hudProgLabel.textContent = zones.length > 1
        ? zones.map((z) => `${z.cur}/${z.need}`).join('  +  ') + (holdPct > 0 ? `   holding ${(run.holdT).toFixed(1)}s` : '')
        : `${cur} / ${need} in sanctuary` + (holdPct > 0 ? `  Â·  holding ${(run.holdT).toFixed(1)}s` : '');
    } else if (sc.goal.type === 'collect') {
      el.hudProgFill.style.width = (clamp(run.eaten / sc.goal.need, 0, 1) * 100).toFixed(1) + '%';
      el.hudProgLabel.textContent = `${Math.min(run.eaten, sc.goal.need)} / ${sc.goal.need} seed pods eaten`;
    } else {
      el.hudProgFill.style.width = (clamp(run.t / sc.goal.seconds, 0, 1) * 100).toFixed(1) + '%';
      el.hudProgLabel.textContent = `Survive Â· flock must stay above ${sc.minAlive}`;
    }
  }

  const scareMode = (drone.mode === 'scare') || keys['shift'] || mouse.right;
  el.modeVal.textContent = scareMode ? 'SCARE' : 'LURE';
  el.modeChip.className = 'chip' + (scareMode ? ' scare' : '');

  if (drone.pulseCd > 0) {
    el.pulseVal.textContent = drone.pulseCd.toFixed(1) + 's';
    el.pulseChip.className = 'chip cold';
    el.pulseMeterFill.style.width = ((1 - drone.pulseCd / 3) * 100).toFixed(0) + '%';
  } else {
    el.pulseVal.textContent = 'READY';
    el.pulseChip.className = 'chip hot';
    el.pulseMeterFill.style.width = '100%';
  }
  el.pelletVal.textContent = run.sandbox ? 'âˆž' : String(drone.pellets);
}

let toastCount = 0;
function toast(msg, kind) {
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  el.toastWrap.appendChild(d);
  toastCount++;
  setTimeout(() => { d.remove(); toastCount--; }, 3200);
  while (el.toastWrap.children.length > 4) el.toastWrap.removeChild(el.toastWrap.firstChild);
}

/* ---- overlays ------------------------------------------------------------ */
function hideAllOverlays() {
  ['mainMenu', 'scenarioMenu', 'howToMenu', 'achMenu', 'settingsMenu', 'pauseMenu', 'resultMenu']
    .forEach((k) => el[k].classList.add('hidden'));
}
function enterPlay() {
  uiState = 'play';
  hideAllOverlays();
  el.hud.classList.remove('hidden');
  el.tuneToggle.classList.remove('hidden');
  el.tunePanel.classList.remove('hidden');
  el.sandboxOnly.style.display = run.sandbox ? '' : 'none';
  Audio2.resume();
  Audio2.ambientOn();
  syncHud();
}
function openPause() {
  if (uiState !== 'play') return;
  uiState = 'pause';
  el.pauseSub.textContent = run.sandbox ? 'Sandbox' : (run.scen ? run.scen.name : '');
  el.pauseMenu.classList.remove('hidden');
  Audio2.ambientOff();
  Audio2.back();
}
function closePause() {
  if (uiState !== 'pause') return;
  uiState = 'play';
  el.pauseMenu.classList.add('hidden');
  el.settingsMenu.classList.add('hidden');
  el.howToMenu.classList.add('hidden');
  Audio2.resume();
  Audio2.ambientOn();
}
function toMenu() {
  uiState = 'menu';
  run.active = false;
  hideAllOverlays();
  el.mainMenu.classList.remove('hidden');
  el.hud.classList.add('hidden');
  el.tuneToggle.classList.add('hidden');
  el.tunePanel.classList.add('hidden');
  el.tunePanel.classList.remove('open');
  Audio2.ambientOff();
  refreshMenu();
  saveProgress(false);
}
function toggleTune() {
  el.tunePanel.classList.toggle('open');
  Audio2.click();
}

function refreshMenu() {
  el.menuCleared.textContent = String(completedCount());
  el.menuGolds.textContent = String(goldCount());
  el.menuBestFlock.textContent = String(PROG.bestFlock);
  const next = nextPlayableIndex();
  el.btnContinue.disabled = next < 0;
  el.btnContinue.textContent = next >= 0
    ? 'CONTINUE â€” ' + SCEN[next].name.toUpperCase()
    : 'CONTINUE';
}
function isUnlocked(i) {
  if (i === 0) return true;
  const prev = SCEN[i - 1];
  return !!(PROG.scen[prev.id] && PROG.scen[prev.id].done);
}
function nextPlayableIndex() {
  for (let i = 0; i < SCEN.length; i++) {
    if (isUnlocked(i) && !(PROG.scen[SCEN[i].id] && PROG.scen[SCEN[i].id].done)) return i;
  }
  return SCEN.length - 1;
}

const MEDAL_ICON = { gold: 'ðŸ¥‡', silver: 'ðŸ¥ˆ', bronze: 'ðŸ¥‰', none: '' };

function buildScenarioList() {
  el.scenarioList.innerHTML = '';
  SCEN.forEach((sc, i) => {
    const unlocked = isUnlocked(i);
    const rec = PROG.scen[sc.id];
    const row = document.createElement('div');
    row.className = 'srow' + (unlocked ? '' : ' locked');
    row.innerHTML =
      `<div class="idx">${i + 1}</div>` +
      `<div class="nm"><b>${unlocked ? sc.name : '???'}</b><div>${unlocked ? sc.brief : 'Clear ' + SCEN[i - 1].name + ' to unlock'}</div></div>` +
      `<div class="medal">${rec ? (MEDAL_ICON[rec.medal] || '') : ''}</div>` +
      `<div class="best">${rec && rec.done ? fmtTimeMs(rec.bestTime) + '<br>' + rec.bestAlive + ' alive' : ''}</div>`;
    if (unlocked) {
      row.addEventListener('click', () => { Audio2.click(); startScenario(i); });
    }
    el.scenarioList.appendChild(row);
  });
}

function buildAchList() {
  el.achList.innerHTML = '';
  let unlockedN = 0;
  for (const a of ACHIEVEMENTS) {
    const has = achUnlocked.has(a.id);
    if (has) unlockedN++;
    const secret = a.hidden && !has;
    const row = document.createElement('div');
    row.className = 'arow' + (has ? '' : ' locked');
    const prog = achProgress[a.id] || 0;
    row.innerHTML =
      `<div class="aic">${has ? a.icon : (secret ? 'â”' : 'ðŸ”’')}</div>` +
      `<div class="atx" style="flex:1"><b>${secret ? 'Hidden achievement' : a.title}</b>` +
      `<span class="rar ${a.rarity}">${a.rarity}</span>` +
      `<div>${secret ? 'Keep experimenting in the Sandbox.' : a.desc}</div>` +
      (a.progressive && !has
        ? `<div class="pbar"><i style="width:${clamp(prog, 0, 1) * 100}%"></i></div>`
        : '') +
      `</div>`;
    el.achList.appendChild(row);
  }
  el.achCount.textContent = `${unlockedN} / ${ACHIEVEMENTS.length}`;
}

function showResult() {
  uiState = 'result';
  const r = run.result;
  const sc = run.scen;
  el.resultMenu.classList.remove('hidden');
  Audio2.ambientOff();

  if (r.won) {
    el.resultIcon.textContent = r.medal !== 'none' ? MEDAL_ICON[r.medal] : 'ðŸ•Šï¸';
    el.resultTitle.textContent = r.medal === 'gold' ? 'GOLD â€” SANCTUARY REACHED'
      : r.medal === 'silver' ? 'SILVER â€” SANCTUARY REACHED'
      : r.medal === 'bronze' ? 'BRONZE â€” SANCTUARY REACHED'
      : 'SANCTUARY REACHED';
  } else {
    el.resultIcon.textContent = 'ðŸª¶';
    el.resultTitle.textContent = 'FLOCK LOST';
  }
  el.resultSub.textContent = (sc ? sc.name : '') + (r.won ? '' : ' â€” ' + r.reason);

  const rows = [];
  rows.push(['Time', fmtTimeMs(r.timeUsed)]);
  rows.push(['Boids surviving', `${r.alive} / ${run.startBoids}`]);
  rows.push(['Lost to hawks', String(r.lost)]);
  if (sc && sc.goal.type === 'collect') rows.push(['Seed pods eaten', `${r.eaten} / ${sc.goal.need}`]);
  rows.push(['Pulses fired', String(run.pulses)]);
  if (r.won) rows.push(['Score', String(r.score)]);
  if (sc) {
    const m = sc.medals;
    const tgt = (t) => (t.t ? `${t.t}s Â· ${t.alive} alive` : `${t.alive} alive`);
    rows.push(['Gold target', tgt(m.gold)]);
    rows.push(['Silver target', tgt(m.silver)]);
  }
  el.resultStats.innerHTML = rows
    .map(([a, b]) => `<div class="statline"><span>${a}</span><b>${b}</b></div>`).join('');

  el.resultTip.textContent = r.won
    ? (sc && SCEN.indexOf(sc) < SCEN.length - 1 ? 'Next: ' + SCEN[SCEN.indexOf(sc) + 1].name : 'You have shepherded every sanctuary. Try for gold everywhere.')
    : (sc ? sc.hint : '');

  const idx = sc ? SCEN.indexOf(sc) : -1;
  const hasNext = r.won && idx >= 0 && idx < SCEN.length - 1;
  el.btnNext.style.display = hasNext ? '' : 'none';
}

/* ---- achievements -------------------------------------------------------- */
function unlock(id) {
  if (achUnlocked.has(id)) return;
  achUnlocked.add(id);
  achProgress[id] = 1;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  toast('ACHIEVEMENT Â· ' + (a ? a.title : id), 'gold');
  Audio2.chime();
  if (empire) empire.unlockAchievement(id, 1).catch(() => {});
}
function progress(id, frac) {
  frac = clamp(frac, 0, 1);
  if (achUnlocked.has(id)) return;
  if ((achProgress[id] || 0) >= frac) return;
  achProgress[id] = frac;
  if (frac >= 1) { unlock(id); return; }
  if (empire) empire.unlockAchievement(id, frac).catch(() => {});
}

/* ==========================================================================
 * 17. UI WIRING
 * ======================================================================== */

el.btnContinue.addEventListener('click', () => {
  Audio2.click();
  const i = nextPlayableIndex();
  if (i >= 0) startScenario(i);
});
el.btnScenarios.addEventListener('click', () => {
  Audio2.click(); buildScenarioList();
  el.mainMenu.classList.add('hidden');
  el.scenarioMenu.classList.remove('hidden');
});
el.scenarioClose.addEventListener('click', () => {
  Audio2.back();
  el.scenarioMenu.classList.add('hidden');
  if (uiState === 'menu') el.mainMenu.classList.remove('hidden');
});
el.btnSandbox.addEventListener('click', () => { Audio2.click(); startSandbox(); });
el.btnHowTo.addEventListener('click', () => {
  Audio2.click();
  el.mainMenu.classList.add('hidden');
  el.howToMenu.classList.remove('hidden');
});
const closeHowTo = () => {
  Audio2.back();
  el.howToMenu.classList.add('hidden');
  if (uiState === 'menu') el.mainMenu.classList.remove('hidden');
  else if (uiState === 'pause') el.pauseMenu.classList.remove('hidden');
  PROG.seenHowTo = true;
};
el.howToClose.addEventListener('click', closeHowTo);
el.howToDone.addEventListener('click', closeHowTo);

el.btnAch.addEventListener('click', () => {
  Audio2.click(); buildAchList();
  el.mainMenu.classList.add('hidden');
  el.achMenu.classList.remove('hidden');
});
const closeAch = () => {
  Audio2.back();
  el.achMenu.classList.add('hidden');
  if (uiState === 'menu') el.mainMenu.classList.remove('hidden');
};
el.achClose.addEventListener('click', closeAch);
el.achDone.addEventListener('click', closeAch);

el.btnSettings.addEventListener('click', () => {
  Audio2.click(); syncSettingsUI();
  el.mainMenu.classList.add('hidden');
  el.settingsMenu.classList.remove('hidden');
});
const closeSettings = () => {
  Audio2.back();
  el.settingsMenu.classList.add('hidden');
  if (uiState === 'menu') el.mainMenu.classList.remove('hidden');
  else if (uiState === 'pause') el.pauseMenu.classList.remove('hidden');
  saveProgress(false);
};
el.settingsClose.addEventListener('click', closeSettings);
el.settingsDone.addEventListener('click', closeSettings);

el.btnHudPause.addEventListener('click', () => openPause());
el.btnResume.addEventListener('click', () => { Audio2.click(); closePause(); });
el.btnRestart.addEventListener('click', () => { Audio2.click(); closePause(); restartRun(); });
el.btnPauseTune.addEventListener('click', () => {
  Audio2.click(); closePause();
  if (!el.tunePanel.classList.contains('open')) el.tunePanel.classList.add('open');
});
el.btnPauseHowTo.addEventListener('click', () => {
  Audio2.click();
  el.pauseMenu.classList.add('hidden');
  el.howToMenu.classList.remove('hidden');
});
el.btnPauseSettings.addEventListener('click', () => {
  Audio2.click(); syncSettingsUI();
  el.pauseMenu.classList.add('hidden');
  el.settingsMenu.classList.remove('hidden');
});
el.btnQuit.addEventListener('click', () => { Audio2.back(); toMenu(); });

el.btnNext.addEventListener('click', () => {
  Audio2.click();
  const idx = run.scen ? SCEN.indexOf(run.scen) : -1;
  if (idx >= 0 && idx < SCEN.length - 1) startScenario(idx + 1);
  else toMenu();
});
el.btnRetry.addEventListener('click', () => { Audio2.click(); restartRun(); });
el.btnResultMenu.addEventListener('click', () => { Audio2.back(); toMenu(); });

el.tuneToggle.addEventListener('click', () => toggleTune());

for (const [sid, vid, key, dp] of SLIDERS) {
  const s = el[sid];
  if (!s) continue;
  s.addEventListener('input', () => {
    const v = parseFloat(s.value);
    P[key] = v;
    el[vid].textContent = dp ? v.toFixed(dp) : String(Math.round(v));
    if (key === 'count' && run.sandbox) resizeFlock(Math.round(v));
  });
}
el.presetSel.addEventListener('change', () => {
  const pr = PRESETS[el.presetSel.value];
  if (!pr) return;
  applyTune(pr);
  syncSliders();
  Audio2.click();
  toast('Preset: ' + el.presetSel.options[el.presetSel.selectedIndex].text);
});
el.edgeSel.addEventListener('change', () => { P.edge = el.edgeSel.value; });
el.btnResetWeights.addEventListener('click', () => {
  Audio2.click();
  const keep = P.count;
  Object.assign(P, DEFAULT_P);
  P.count = keep;
  if (run.scen) { applyTune(run.scen.tune); P.windX = run.scen.wind.x; P.windY = run.scen.wind.y; }
  syncSliders();
  toast('Weights reset');
});

el.cbTrails.addEventListener('change', () => { SET.trails = el.cbTrails.checked; syncSettingsUI(); });
el.cbVectors.addEventListener('change', () => { P.showPer = el.cbVectors.checked; });
el.cbFps.addEventListener('change', () => { SET.showFps = el.cbFps.checked; syncSettingsUI(); });

function setTool(t) { placeTool = t; syncToolButtons(); Audio2.click(); }
function syncToolButtons() {
  const map = { none: 'toolNone', rock: 'toolRock', seed: 'toolSeed', hawk: 'toolHawk' };
  for (const k in map) {
    const b = el[map[k]];
    if (b) b.className = 'btn sm' + (placeTool === k ? ' act' : '');
  }
}
el.toolNone.addEventListener('click', () => setTool('none'));
el.toolRock.addEventListener('click', () => setTool('rock'));
el.toolSeed.addEventListener('click', () => setTool('seed'));
el.toolHawk.addEventListener('click', () => setTool('hawk'));
el.btnClearRocks.addEventListener('click', () => { solids = []; buildSolidGrid(); Audio2.back(); });
el.btnClearHawks.addEventListener('click', () => { preds = []; Audio2.back(); });
el.btnScatter.addEventListener('click', () => {
  for (let i = 0; i < bN; i++) {
    const a = Math.random() * TAU, r = Math.random() * 420;
    bx[i] = clamp(W / 2 + Math.cos(a) * r, 20, W - 20);
    by[i] = clamp(H / 2 + Math.sin(a) * r, 20, H - 20);
  }
  Audio2.pulse();
});

function resizeFlock(target) {
  target = clamp(target, 0, MAXB);
  while (bN > target) killBoid(bN - 1, false);
  while (bN < target) {
    const a = Math.random() * TAU, r = Math.random() * 300;
    addBoid(clamp(W / 2 + Math.cos(a) * r, 20, W - 20), clamp(H / 2 + Math.sin(a) * r, 20, H - 20));
  }
}

function syncSettingsUI() {
  el.setVol.value = String(SET.volume);
  el.vVol.textContent = Math.round(SET.volume * 100) + '%';
  el.setShake.checked = SET.shake;
  el.setTrails2.checked = SET.trails;
  el.setParticles.checked = SET.particles;
  el.setFps2.checked = SET.showFps;
  el.setQuality.value = SET.quality;
  if (el.cbTrails) el.cbTrails.checked = SET.trails;
  if (el.cbFps) el.cbFps.checked = SET.showFps;
}
el.setVol.addEventListener('input', () => {
  SET.volume = parseFloat(el.setVol.value);
  el.vVol.textContent = Math.round(SET.volume * 100) + '%';
  Audio2.setVolume(SET.volume);
});
el.setShake.addEventListener('change', () => { SET.shake = el.setShake.checked; });
el.setTrails2.addEventListener('change', () => { SET.trails = el.setTrails2.checked; syncSliders(); });
el.setParticles.addEventListener('change', () => { SET.particles = el.setParticles.checked; if (!SET.particles) pN = 0; });
el.setFps2.addEventListener('change', () => { SET.showFps = el.setFps2.checked; syncSliders(); });
el.setQuality.addEventListener('change', () => { SET.quality = el.setQuality.value; resize(); });

/* ==========================================================================
 * 18. EMPIRE SDK
 * ======================================================================== */

let empire = null;
let playSecAcc = 0, playSecReport = 0;

async function saveProgress(force) {
  if (!empire) return;
  const blob = {
    scen: PROG.scen,
    pulses: PROG.pulses,
    bestFlock: PROG.bestFlock,
    seenHowTo: PROG.seenHowTo,
    ach: Array.from(achUnlocked),
    achProgress,
    settings: SET,
    weights: {
      sep: P.sep, ali: P.ali, coh: P.coh, per: P.per, spc: P.spc, wan: P.wan,
      spd: P.spd, frc: P.frc, fea: P.fea, fod: P.fod, drn: P.drn,
    },
  };
  const done = completedCount();
  try {
    await empire.saveState('auto', blob, {
      label: `${done}/8 challenges Â· ${goldCount()} gold`,
      playtimeSec: Math.round(run.playSec),
      progress: done / 8,
      mode: run.sandbox ? 'sandbox' : 'challenge',
    });
    if (force) await empire.setContinuePoint('auto', `${done}/8 challenges cleared`);
  } catch { /* ignore */ }
}

async function loadProgress() {
  if (!empire) return;
  let rec = null;
  try { rec = await empire.loadState('auto'); } catch { rec = null; }
  if (!rec || !rec.blob) return;
  const b = rec.blob;
  if (b.scen && typeof b.scen === 'object') PROG.scen = b.scen;
  if (typeof b.pulses === 'number') PROG.pulses = b.pulses;
  if (typeof b.bestFlock === 'number') PROG.bestFlock = b.bestFlock;
  if (b.seenHowTo) PROG.seenHowTo = true;
  if (Array.isArray(b.ach)) for (const id of b.ach) achUnlocked.add(id);
  if (b.achProgress) Object.assign(achProgress, b.achProgress);
  if (b.settings) {
    for (const k in SET) if (k in b.settings) SET[k] = b.settings[k];
  }
  if (b.weights) applyTune(b.weights);
}

async function initEmpire() {
  empire = new EmpireClient({
    gameId: GAME_ID,
    saveVersion: SAVE_VERSION,
    onPause: () => { if (uiState === 'play') openPause(); },
    onResume: () => { if (uiState === 'pause') closePause(); },
    onSettings: (s) => applyHubSettings(s),
  });
  let init = null;
  try { init = await empire.connect(); } catch { /* standalone */ }
  if (init && init.settings) applyHubSettings(init.settings);
  else {
    try { applyHubSettings(await empire.getSettings()); } catch {}
  }
  try { await empire.getProfile(); } catch {}
  await loadProgress();
  Audio2.setVolume(SET.volume);
  syncSettingsUI();
  syncSliders();
  refreshMenu();
}

function applyHubSettings(s) {
  if (!s || typeof s !== 'object') return;
  if (typeof s.masterVolume === 'number') { SET.volume = clamp(s.masterVolume, 0, 1); Audio2.setVolume(SET.volume); }
  if (typeof s.volume === 'number') { SET.volume = clamp(s.volume, 0, 1); Audio2.setVolume(SET.volume); }
  if (typeof s.reducedMotion === 'boolean' && s.reducedMotion) {
    SET.shake = false; SET.trails = false; SET.particles = false;
  }
  if (typeof s.screenShake === 'boolean') SET.shake = s.screenShake;
  if (typeof s.showFps === 'boolean') SET.showFps = s.showFps;
  syncSettingsUI();
}

/* ==========================================================================
 * 19. MAIN LOOP
 * ======================================================================== */

let last = performance.now();
let acc = 0;
let fpsT = 0, fpsN = 0, fpsVal = 60;
let hudT = 0;
let hidden = false;

document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden) {
    Audio2.ambientOff();
    if (uiState === 'play') openPause();
    flushPlaytime();
  } else {
    last = performance.now(); acc = 0;
  }
});

function frame(now) {
  requestAnimationFrame(frame);
  if (hidden) { last = now; return; }
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) { fpsVal = fpsN / fpsT; fpsN = 0; fpsT = 0; }

  const running = uiState === 'play' && run.active;
  if (running) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 4) {
      acc -= DT; steps++;
      gustPhase += DT * 0.8;
      stepDrone(DT);
      stepBoids(DT);
      stepPredators(DT);
      stepFoods(DT);
      stepShocks(DT);
      stepParticles(DT);
      stepObjectives(DT);
      run.playSec += DT;
      playSecAcc += DT;
      if (run.sandbox) run.t += DT;
    }
    if (steps >= 4) acc = 0;

    if (shakeAmt > 0.01) {
      shakeAmt *= Math.pow(0.02, dt);
      shakeX = (Math.random() - 0.5) * shakeAmt;
      shakeY = (Math.random() - 0.5) * shakeAmt;
    } else { shakeAmt = 0; shakeX = 0; shakeY = 0; }

    hudT += dt;
    if (hudT > 0.1) { hudT = 0; syncHud(); }

    if (playSecAcc - playSecReport >= 30) {
      playSecReport = playSecAcc;
      if (empire) empire.reportPlaytime(30).catch(() => {});
      saveProgress(false);
    }
  } else {
    if (uiState === 'pause' || uiState === 'result') {
      // keep the world visible behind the overlay, frozen
    }
    shakeX = 0; shakeY = 0;
  }

  if (uiState !== 'menu') {
    render();
    el.fpsMeter.textContent = SET.showFps ? Math.round(fpsVal) + ' fps Â· ' + bN + ' boids' : '';
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
    else { ctx.fillStyle = '#051413'; ctx.fillRect(0, 0, cv.width, cv.height); }
    drawMenuBackdrop();
  }
}

/* Decorative idle flock behind the main menu. */
const menuBoids = [];
(function seedMenuBoids() {
  for (let i = 0; i < 90; i++) {
    menuBoids.push({
      x: Math.random() * W, y: Math.random() * H,
      a: Math.random() * TAU, s: 40 + Math.random() * 70,
      t: (Math.random() * 3) | 0,
    });
  }
})();
let menuLast = performance.now();
function drawMenuBackdrop() {
  const now = performance.now();
  let dt = (now - menuLast) / 1000; menuLast = now;
  if (dt > 0.1) dt = 0.1;
  updateView();
  const s = view.s * dpr;
  ctx.setTransform(s, 0, 0, s, view.ox * dpr, view.oy * dpr);
  ctx.beginPath();
  for (const b of menuBoids) {
    b.a += Math.sin(now / 1400 + b.x * 0.004) * dt * 1.4;
    b.x += Math.cos(b.a) * b.s * dt;
    b.y += Math.sin(b.a) * b.s * dt;
    if (b.x < -20) b.x = W + 20; else if (b.x > W + 20) b.x = -20;
    if (b.y < -20) b.y = H + 20; else if (b.y > H + 20) b.y = -20;
    const nx = Math.cos(b.a), ny = Math.sin(b.a);
    const sc = 4.2;
    ctx.moveTo(b.x + nx * sc * 1.9, b.y + ny * sc * 1.9);
    ctx.lineTo(b.x - nx * sc - ny * sc * 0.85, b.y - ny * sc + nx * sc * 0.85);
    ctx.lineTo(b.x - nx * sc + ny * sc * 0.85, b.y - ny * sc - nx * sc * 0.85);
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(121,230,196,0.35)';
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function flushPlaytime() {
  const secs = Math.round(playSecAcc - playSecReport);
  if (secs > 0 && empire) {
    playSecReport = playSecAcc;
    empire.reportPlaytime(secs).catch(() => {});
  }
}
window.addEventListener('pagehide', () => { flushPlaytime(); saveProgress(false); });
window.addEventListener('beforeunload', () => { flushPlaytime(); saveProgress(false); });

/* ==========================================================================
 * 20. BOOT
 * ======================================================================== */

window.__empireMigrate = function (blob) { return blob; };

(async function boot() {
  resize();
  solids = scatterRocks([[380, 300, 66], [980, 620, 74]]);
  buildSolidGrid();
  syncSliders();
  syncSettingsUI();
  syncToolButtons();
  await initEmpire();
  refreshMenu();
  requestAnimationFrame(frame);
})();
/* Authored 3D sanctuary layer: the fixed-step flock simulation remains authoritative. */
const boids3d = { renderer: null, scene: null, camera: null, kit: null, status: { loaded: false, physics: false, attached: false, error: '' } };
function initBoids3D() {
  try {
    if (!window.THREE) { const add = (src) => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); return add('../../vendor/three-r128/three.min.js').then(() => add('../../vendor/three-r128/GLTFLoader.js')).then(initBoids3D); }
    const canvas = document.createElement('canvas'); canvas.id = 'scene3d'; canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.7'; document.body.prepend(canvas); boids3d.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); boids3d.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); boids3d.renderer.setSize(innerWidth, innerHeight, false); boids3d.scene = new THREE.Scene(); boids3d.scene.fog = new THREE.Fog(0x0b1723, 18, 62); boids3d.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .1, 100); boids3d.camera.position.set(0, 8, 15); boids3d.scene.add(new THREE.HemisphereLight(0xa9d9ec, 0x183527, 1.8)); const sun = new THREE.DirectionalLight(0xc8f2ff, 2.1); sun.position.set(-4, 10, 3); boids3d.scene.add(sun); const ground = new THREE.Mesh(new THREE.CircleGeometry(19, 48), new THREE.MeshStandardMaterial({ color: 0x2d6248, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2; boids3d.scene.add(ground);
    new THREE.GLTFLoader().load('../../assets/blender-kits/boids-sanctuary/boids-sanctuary-kit.glb', (gltf) => { boids3d.kit = gltf.scene; boids3d.kit.scale.setScalar(1.7); boids3d.scene.add(boids3d.kit); boids3d.status.loaded = true; boids3d.status.attached = true; window.__boidsSanctuaryAssetStatus = boids3d.status; }, undefined, (e) => { boids3d.status.error = String(e && e.message || e); window.__boidsSanctuaryAssetStatus = boids3d.status; }); fetch('../../assets/blender-kits/boids-sanctuary/physics.json').then((r) => r.json()).then((p) => { boids3d.status.physics = !!p.playerCollider; window.__boidsSanctuaryAssetStatus = boids3d.status; }).catch((e) => { boids3d.status.error = String(e && e.message || e); }); addEventListener('resize', () => { boids3d.renderer.setSize(innerWidth, innerHeight, false); boids3d.camera.aspect = innerWidth / innerHeight; boids3d.camera.updateProjectionMatrix(); });
    const render = () => { requestAnimationFrame(render); if (boids3d.kit) { boids3d.kit.rotation.y += .001; if (typeof drone !== 'undefined') { boids3d.kit.position.x = (drone.x / W - .5) * 7; boids3d.kit.position.z = (drone.y / H - .5) * 5; } } boids3d.renderer.render(boids3d.scene, boids3d.camera); }; requestAnimationFrame(render);
  } catch (e) { boids3d.status.error = String(e && e.message || e); window.__boidsSanctuaryAssetStatus = boids3d.status; }
}
window.__boidsSanctuaryAssetStatus = boids3d.status; initBoids3D();
