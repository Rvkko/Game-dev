/* =============================================================================
   FLAPPY ASCENT — one-button climb through procedurally spaced gates.
   Canvas2D · offline · Empire SDK wired.
   ============================================================================= */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'flappy-ascent',statusKey:'__flappyAscentAssetStatus',accent:0x47d3ff,getState:()=>({active:true,motion:0,danger:0})});

/* ------------------------------ constants -------------------------------- */

const GAME_ID = 'flappy-ascent';
const SAVE_VERSION = 1;

const WORLD_H = 640;          // logical world height (always fully visible)
const GROUND_Y = 596;         // top of the ground strip
const MIN_W = 760;            // minimum logical world width
const MAX_W = 1500;           // maximum logical world width
const BIRD_X = 280;           // bird's fixed horizontal position (world units)
const BIRD_R = 13;
const GATE_W = 76;

const STEP = 1 / 120;
const MAX_STEPS = 6;

const GRAV = 1750;
const FLAP_V = -505;
const MAX_FALL = 900;
const FLAP_BUFFER = 0.14;

const GHOST_STEP = 24;        // world units between ghost samples
const DAILY_GATES = 80;
const ALT_PER_UNIT = 0.42;    // metres per world unit travelled

const DIFFS = {
  breezy: {
    name: 'Breezy', tag: 'practice',
    desc: 'Wide gaps, lazy wind, hazards arrive late. Perfect for learning the beat — but no medals or awards are recorded.',
    gapAdd: 46, speedMul: 0.84, hazardShift: 10, ranked: false, medals: [12, 28, 50],
  },
  standard: {
    name: 'Standard', tag: 'ranked',
    desc: 'The true ascent. Gaps tighten every gate, drifting and shuttering pylons show up as you climb.',
    gapAdd: 0, speedMul: 1, hazardShift: 0, ranked: true, medals: [10, 25, 45],
  },
  storm: {
    name: 'Storm', tag: 'ranked',
    desc: 'Sixteen percent faster, gaps cut by a wing-width, hazards from the very first zone. Medals come cheaper because surviving does not.',
    gapAdd: -16, speedMul: 1.16, hazardShift: -5, ranked: true, medals: [8, 20, 36],
  },
};
const DAILY_MEDALS = [15, 35, 60];

const ZONES = [
  {
    name: 'Meadow Rise',
    skyA: '#7ec8f5', skyB: '#dcf1ff', far: '#8fb4d2', mid: '#5b9a6c', near: '#347a4e',
    gateA: '#8ddc9a', gateB: '#2f7a4a', rim: '#fff6c0', star: 0,
    ground: '#3f8450', ground2: '#2a5c37', cloud: 'rgba(255,255,255,0.86)', aur: null,
  },
  {
    name: 'Canyon Gale',
    skyA: '#f5a463', skyB: '#ffe3ba', far: '#c07d55', mid: '#a3573a', near: '#6e3524',
    gateA: '#efb26a', gateB: '#7d4a24', rim: '#fff0c0', star: 0.06,
    ground: '#8a4b2c', ground2: '#5c3020', cloud: 'rgba(255,226,196,0.8)', aur: null,
  },
  {
    name: 'Cloudbank Dusk',
    skyA: '#5d4499', skyB: '#f4a2bc', far: '#6b5292', mid: '#7f5fa4', near: '#3d2c5c',
    gateA: '#c79cec', gateB: '#4a2f77', rim: '#ffd7f4', star: 0.28,
    ground: '#402f63', ground2: '#2a1e44', cloud: 'rgba(255,214,236,0.76)', aur: null,
  },
  {
    name: 'Aurora Deep',
    skyA: '#0d1c40', skyB: '#2b5f92', far: '#1d3c66', mid: '#173052', near: '#0d1b30',
    gateA: '#5fe4c8', gateB: '#0f5c58', rim: '#c4ffee', star: 0.72,
    ground: '#123043', ground2: '#0a1c2a', cloud: 'rgba(150,255,220,0.32)', aur: '#5fe4c8',
  },
  {
    name: 'Stratosphere',
    skyA: '#04081c', skyB: '#123066', far: '#0f1e42', mid: '#0b1731', near: '#060d1d',
    gateA: '#9cc2ff', gateB: '#284a8e', rim: '#e6f0ff', star: 1,
    ground: '#0b1730', ground2: '#060d1d', cloud: 'rgba(200,225,255,0.26)', aur: '#7fa8ff',
  },
  {
    name: 'The Void',
    skyA: '#02030a', skyB: '#1b0b34', far: '#150a29', mid: '#0d0719', near: '#050310',
    gateA: '#ff9ce4', gateB: '#6a1f80', rim: '#ffd6ff', star: 1,
    ground: '#0d0720', ground2: '#050310', cloud: 'rgba(235,180,255,0.2)', aur: '#c06bff',
  },
];

const ACHS = [
  { id: 'first_gate',  t: 'First Flight',  d: 'Pass your very first gate.',                ico: '🕊️', target: 1,   hidden: false },
  { id: 'gates_10',    t: 'Rising Star',   d: 'Pass 10 gates in a single run.',            ico: '⭐', target: 10,  hidden: false },
  { id: 'gates_25',    t: 'Cloudbreaker',  d: 'Pass 25 gates in a single run.',            ico: '☁️', target: 25,  hidden: false },
  { id: 'gates_50',    t: 'Stratosphere',  d: 'Pass 50 gates in a single run.',            ico: '🚀', target: 50,  hidden: false },
  { id: 'medal_bronze',t: 'Bronze Wings',  d: 'Finish a run with a Bronze medal.',         ico: '🥉', target: 1,   hidden: false },
  { id: 'medal_silver',t: 'Silver Wings',  d: 'Finish a run with a Silver medal.',         ico: '🥈', target: 1,   hidden: false },
  { id: 'medal_gold',  t: 'Gold Wings',    d: 'Finish a run with a Gold medal.',           ico: '🥇', target: 1,   hidden: false },
  { id: 'perfect_5',   t: 'Threadneedle',  d: 'Chain 5 dead-centre gate passes in one run.', ico: '🎯', target: 5, hidden: false },
  { id: 'feathers_100',t: 'Featherweight', d: 'Collect 100 sky feathers in total.',        ico: '🪶', target: 100, hidden: false },
  { id: 'daily_summit',t: 'Summit Seeker', d: 'Clear all 80 gates of a Daily Ascent.',     ico: '🏔️', target: 80, hidden: true  },
];

/* -------------------------------- helpers -------------------------------- */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(c, a) {
  return a === undefined
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function mixRGB(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function todayKey(d) {
  const x = d || new Date();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d);
}
function fmtTime(s) {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}
function fmtMinutes(s) {
  if (s < 60) return `${Math.round(s)}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
const $ = (id) => document.getElementById(id);

// pre-resolve zone colours into RGB triples
for (const z of ZONES) {
  z._skyA = hexRGB(z.skyA); z._skyB = hexRGB(z.skyB);
  z._far = hexRGB(z.far); z._mid = hexRGB(z.mid); z._near = hexRGB(z.near);
  z._gateA = hexRGB(z.gateA); z._gateB = hexRGB(z.gateB); z._rim = hexRGB(z.rim);
  z._ground = hexRGB(z.ground); z._ground2 = hexRGB(z.ground2);
  z._aur = z.aur ? hexRGB(z.aur) : null;
}

/* ------------------------------ audio engine ------------------------------ */

class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null;
    this.windGain = null; this.windFilter = null;
    this.vol = 0.7; this.hubMul = 1; this.on = true; this.muted = false;
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); } catch { return null; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this._level();
    this.master.connect(c.destination);

    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    try { src.start(); } catch { /* ignore */ }
    this.windFilter = f; this.windGain = g;
    return c;
  }
  _level() { return this.muted ? 0 : this.vol * this.hubMul; }
  apply() { if (this.master) this.master.gain.value = this._level(); }
  setVol(v) { this.vol = clamp(v, 0, 1); this.apply(); }
  setHub(v) { this.hubMul = clamp(v, 0, 1); this.apply(); }
  toggleMute() { this.muted = !this.muted; this.apply(); return this.muted; }
  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
  suspendWind() { if (this.windGain && this.ctx) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); }
  setWind(level, speed) {
    if (!this.ctx || !this.windGain) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(this.on ? level : 0, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(280 + speed * 1.2, t, 0.3);
  }
  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.on) return;
    const c = this.ensure(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.04);
  }
  burst(dur, freq, q, gain, sweepTo, delay) {
    if (!this.on) return;
    const c = this.ensure(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
  flap() { this.burst(0.13, 500, 1.1, 0.13, 1500); this.tone(210, 0.1, 'triangle', 0.06, 320); }
  gate(n) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const semi = scale[Math.min(scale.length - 1, n % scale.length)] + 12 * Math.floor(n / scale.length) * 0;
    const f = 440 * Math.pow(2, semi / 12);
    this.tone(f, 0.16, 'triangle', 0.15);
    this.tone(f * 2, 0.09, 'sine', 0.05, null, 0.01);
  }
  perfect(n) {
    const f = 660 * Math.pow(2, Math.min(7, n) / 12);
    this.tone(f, 0.1, 'sine', 0.12);
    this.tone(f * 1.5, 0.16, 'sine', 0.1, null, 0.06);
  }
  feather() {
    this.tone(880, 0.07, 'sine', 0.09);
    this.tone(1320, 0.08, 'sine', 0.07, null, 0.05);
    this.tone(1760, 0.1, 'sine', 0.05, null, 0.1);
  }
  crash() {
    this.burst(0.4, 900, 0.6, 0.3, 90);
    this.tone(150, 0.4, 'square', 0.16, 42);
    this.tone(90, 0.5, 'sine', 0.14, 30, 0.03);
  }
  bonk() { this.tone(140, 0.12, 'square', 0.08, 90); }
  medal(t) {
    const base = t === 3 ? 523.25 : t === 2 ? 440 : 349.23;
    this.tone(base, 0.16, 'triangle', 0.14, null, 0);
    this.tone(base * 1.26, 0.16, 'triangle', 0.14, null, 0.13);
    this.tone(base * 1.5, 0.34, 'triangle', 0.16, null, 0.26);
    if (t === 3) this.tone(base * 2, 0.5, 'sine', 0.1, null, 0.4);
  }
  record() {
    for (let i = 0; i < 5; i++) this.tone(660 * Math.pow(2, i / 6), 0.14, 'sine', 0.1, null, i * 0.06);
  }
  summit() {
    const n = [523.25, 659.25, 783.99, 1046.5];
    n.forEach((f, i) => { this.tone(f, 0.5, 'triangle', 0.14, null, i * 0.14); });
    this.burst(0.9, 2200, 0.5, 0.08, 400, 0.1);
  }
  ui() { this.tone(520, 0.05, 'square', 0.05, 640); }
  gust() { this.burst(0.6, 320, 0.9, 0.1, 900); }
}
const sfx = new Sfx();

/* ------------------------------ canvas setup ------------------------------ */

const cvs = $('game');
const ctx = cvs.getContext('2d', { alpha: false });
let dpr = 1, scale = 1, viewW = MIN_W, offXpx = 0, offYpx = 0, cssW = 900, cssH = 600;

function resize() {
  const r = cvs.getBoundingClientRect();
  cssW = Math.max(80, Math.round(r.width));
  cssH = Math.max(80, Math.round(r.height));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = Math.round(cssW * dpr);
  cvs.height = Math.round(cssH * dpr);
  scale = Math.min(cssH / WORLD_H, cssW / MIN_W);
  viewW = Math.min(MAX_W, cssW / scale);
  offXpx = Math.max(0, (cssW - viewW * scale) / 2);
  offYpx = Math.max(0, (cssH - WORLD_H * scale) / 2);
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) {
  try { new ResizeObserver(resize).observe(cvs); } catch { /* ignore */ }
}

/* ------------------------- procedural backdrops ---------------------------- */

const RIDGE_W = 1900;
function makeRidge(seed, amp, base, teeth) {
  const r = mulberry32(seed);
  const pts = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i * RIDGE_W) / teeth;
    let y = base - r() * amp - Math.sin(i * 1.7) * amp * 0.18;
    pts.push({ x, y });
  }
  pts[teeth].y = pts[0].y;
  return pts;
}
const RIDGE_FAR = makeRidge(1337, 128, 430, 16);
const RIDGE_MID = makeRidge(90210, 168, 512, 12);
const RIDGE_NEAR = makeRidge(555, 116, 596, 9);

const STAR_TILE = 2200;
const STARS = (() => {
  const r = mulberry32(4242), out = [];
  for (let i = 0; i < 220; i++) {
    out.push({ x: r() * STAR_TILE, y: r() * 520, s: 0.5 + r() * 1.6, tw: r() * 6.283, sp: 0.6 + r() * 1.8 });
  }
  return out;
})();

const CLOUD_TILE = 2400;
const CLOUDS = (() => {
  const r = mulberry32(7777), out = [];
  for (let i = 0; i < 26; i++) {
    const lobes = [];
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) lobes.push({ dx: (j - n / 2) * 26 + r() * 14, dy: r() * 14 - 7, rr: 18 + r() * 22 });
    out.push({ x: r() * CLOUD_TILE, y: 40 + r() * 340, s: 0.55 + r() * 1.15, lobes, layer: i % 2 });
  }
  return out;
})();

const GROUND_TILE = 420;
const GROUND_BITS = (() => {
  const r = mulberry32(31415), out = [];
  for (let i = 0; i < 46; i++) out.push({ x: r() * GROUND_TILE, h: 5 + r() * 16, w: 3 + r() * 7 });
  return out;
})();

/* -------------------------------- particles ------------------------------- */

const P_MAX = 460;
const parts = [];
for (let i = 0; i < P_MAX; i++) {
  parts.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, col: '#fff', type: 'spark', rot: 0, vrot: 0, grav: 0, front: false, drag: 1 });
}
let pCursor = 0;
function spawn(x, y, vx, vy, life, size, col, type, opts) {
  if (!cfg.particles) return null;
  let p = null;
  for (let i = 0; i < P_MAX; i++) {
    const c = parts[(pCursor + i) % P_MAX];
    if (!c.a) { p = c; pCursor = (pCursor + i + 1) % P_MAX; break; }
  }
  if (!p) { p = parts[pCursor]; pCursor = (pCursor + 1) % P_MAX; }
  p.a = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.max = life; p.size = size; p.col = col; p.type = type;
  p.rot = (opts && opts.rot) || Math.random() * 6.283;
  p.vrot = (opts && opts.vrot) !== undefined ? opts.vrot : (Math.random() - 0.5) * 6;
  p.grav = (opts && opts.grav) !== undefined ? opts.grav : 480;
  p.front = !!(opts && opts.front);
  p.drag = (opts && opts.drag) !== undefined ? opts.drag : 0.995;
  return p;
}
function stepParts(dt) {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i];
    if (!p.a) continue;
    p.life -= dt;
    if (p.life <= 0) { p.a = false; continue; }
    p.vy += p.grav * dt;
    p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vrot * dt;
  }
}
function clearParts() { for (let i = 0; i < P_MAX; i++) parts[i].a = false; }

const TXT_MAX = 24;
const texts = [];
for (let i = 0; i < TXT_MAX; i++) texts.push({ a: false, x: 0, y: 0, vy: 0, life: 0, max: 1, s: '', col: '#fff', size: 20 });
function floatText(x, y, s, col, size) {
  for (let i = 0; i < TXT_MAX; i++) {
    const t = texts[i];
    if (!t.a) {
      t.a = true; t.x = x; t.y = y; t.vy = -48; t.life = 1.05; t.max = 1.05;
      t.s = s; t.col = col; t.size = size || 20;
      return;
    }
  }
}
function stepTexts(dt) {
  for (let i = 0; i < TXT_MAX; i++) {
    const t = texts[i];
    if (!t.a) continue;
    t.life -= dt;
    if (t.life <= 0) { t.a = false; continue; }
    t.y += t.vy * dt; t.vy *= 0.94;
  }
}

/* --------------------------------- state ---------------------------------- */

const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

const cfg = {
  vol: 0.7, sfx: true,
  shake: !reduceMotion,
  particles: true,
  ghost: true,
  contrast: false,
};

const save = {
  best: { breezy: { gates: 0, score: 0, dist: 0 }, standard: { gates: 0, score: 0, dist: 0 }, storm: { gates: 0, score: 0, dist: 0 } },
  daily: { date: '', gates: 0, score: 0, best: 0, done: false, medal: 0, streak: 0, lastDone: '' },
  totals: { runs: 0, gates: 0, feathers: 0, perfects: 0, timeSec: 0, crashes: 0 },
  medals: { bronze: 0, silver: 0, gold: 0 },
  ghosts: { standard: null, breezy: null, storm: null, daily: null },
  ach: {},
  cfg: null,
};

let state = 'menu';           // menu | ready | play | dying | result
let paused = false;
let mode = 'endless';         // endless | daily
let difficulty = 'standard';
let seed = 0;
let seedLabel = '';

const bird = { y: 300, py: 300, vy: 0, rot: 0, flapPhase: 0, alive: true };
const trail = [];
const TRAIL_MAX = 20;

let gates = [];
let nextGateIdx = 0;
let nextGateWX = 0;
let prevGapY = 300;

let dist = 0, distPrev = 0;
let gatesPassed = 0, score = 0, feathers = 0, perfects = 0, perfectStreak = 0, bestPerfectStreak = 0;
let runTime = 0, tGlobal = 0;
let trauma = 0, flash = 0, flashCol = '255,255,255';
let hitstop = 0;
let bufferedFlap = -1;
let zoneF = 0;
let newRecord = false;
let summitReached = false;
let deathTimer = 0;
let readyPulse = 0;
let lastMedal = 0;

let ghostSamples = null;      // active ghost being chased
let ghostBest = 0;
let ghostDist = 0;
let recSamples = [];
let recIdx = -1;

let playtimeAcc = 0, playtimeSend = 0;
let hubReady = false;

/* --------------------------------- SDK ------------------------------------ */

const empire = new EmpireClient({
  gameId: GAME_ID,
  saveVersion: SAVE_VERSION,
  onPause: () => { if (state === 'play' || state === 'ready') doPause(true); },
  onResume: () => { if (paused && !overlayOpen()) doResume(); },
  onSettings: (s) => applyHubSettings(s),
});

function applyHubSettings(s) {
  if (!s) return;
  const v = s.masterVolume !== undefined ? s.masterVolume : (s.volume !== undefined ? s.volume : null);
  if (v !== null && !isNaN(v)) sfx.setHub(clamp(Number(v), 0, 1));
  if (s.reducedMotion) { cfg.shake = false; }
}

async function loadSave() {
  let rec = null;
  try { rec = await empire.loadState('auto'); } catch { rec = null; }
  if (rec && rec.blob) {
    const b = rec.blob;
    if (b.best) Object.assign(save.best, b.best);
    if (b.daily) Object.assign(save.daily, b.daily);
    if (b.totals) Object.assign(save.totals, b.totals);
    if (b.medals) Object.assign(save.medals, b.medals);
    if (b.ghosts) Object.assign(save.ghosts, b.ghosts);
    if (b.ach) save.ach = b.ach;
    if (b.cfg) Object.assign(cfg, b.cfg);
  }
  if (save.daily.date !== todayKey()) {
    save.daily.date = todayKey();
    save.daily.gates = 0; save.daily.score = 0; save.daily.done = false; save.daily.medal = 0; save.daily.best = 0;
    if (save.ghosts.daily && save.ghosts.daily.date !== todayKey()) save.ghosts.daily = null;
  }
  sfx.setVol(cfg.vol); sfx.on = cfg.sfx;
}

let saveQueued = false;
async function persist(label) {
  if (saveQueued) return;
  saveQueued = true;
  save.cfg = { vol: cfg.vol, sfx: cfg.sfx, shake: cfg.shake, particles: cfg.particles, ghost: cfg.ghost, contrast: cfg.contrast };
  const blob = {
    best: save.best, daily: save.daily, totals: save.totals,
    medals: save.medals, ghosts: save.ghosts, ach: save.ach, cfg: save.cfg,
  };
  const bestG = Math.max(save.best.standard.gates, save.best.storm.gates, save.best.breezy.gates);
  try {
    await empire.saveState('auto', blob, {
      label: label || `Best ${bestG} gates`,
      playtimeSec: Math.round(save.totals.timeSec),
      progress: clamp(bestG / 50, 0, 1),
      mode, difficulty,
      seed: mode === 'daily' ? seedLabel : undefined,
    });
  } catch { /* offline is fine */ }
  saveQueued = false;
}

const achUnlocked = new Set();
const achSent = {};
function grantAch(id, value) {
  const def = ACHS.find((a) => a.id === id);
  if (!def) return;
  const cur = save.ach[id] || 0;
  const v = Math.max(cur, value);
  if (v === cur && achUnlocked.has(id)) return;
  save.ach[id] = v;
  const frac = clamp(v / def.target, 0, 1);
  const sent = achSent[id] || 0;
  if (frac >= 1 && !achUnlocked.has(id)) {
    achUnlocked.add(id);
    achSent[id] = 1;
    empire.unlockAchievement(id, 1).catch(() => {});
    toast(`${def.ico} ${def.t}`, true);
    sfx.record();
  } else if (frac > sent + 0.09 && frac < 1) {
    achSent[id] = frac;
    empire.unlockAchievement(id, frac).catch(() => {});
  }
}
function seedAchUnlocked() {
  for (const a of ACHS) if ((save.ach[a.id] || 0) >= a.target) { achUnlocked.add(a.id); achSent[a.id] = 1; }
}

/* -------------------------------- toasts ---------------------------------- */

const toastWrap = $('toasts');
function toast(msg, isAch) {
  const el = document.createElement('div');
  el.className = 'toast' + (isAch ? ' ach' : '');
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3100);
  while (toastWrap.childElementCount > 4) toastWrap.removeChild(toastWrap.firstChild);
}

/* ------------------------------ gate factory ------------------------------ */

function curve(idx) {
  const d = DIFFS[difficulty];
  const speed = (196 + Math.min(150, idx * 3.1)) * d.speedMul;
  const gap = clamp(208 - Math.min(84, idx * 2.05) + d.gapAdd, 104, 300);
  const spacing = Math.max(252, 338 - Math.min(86, idx * 1.7)) * (d.speedMul > 1 ? 1.02 : 1);
  return { speed, gap, spacing };
}

function gateRng(idx) {
  return mulberry32((seed ^ Math.imul(idx + 1, 2654435761)) >>> 0);
}

function makeGate(idx, wx) {
  const r = gateRng(idx);
  const c = curve(idx);
  const h = idx - DIFFS[difficulty].hazardShift;
  let type = 'normal';
  const roll = r();
  if (h >= 20 && roll < 0.2) type = 'shutter';
  else if (h >= 13 && roll < 0.38) type = 'narrow';
  else if (h >= 6 && roll < 0.66) type = 'drift';

  let gap = c.gap;
  if (type === 'narrow') gap *= 0.74;
  if (type === 'shutter') gap *= 1.12;

  const amp = type === 'drift' ? Math.min(78, 22 + idx * 1.7) : 0;
  const pad = 58 + amp;
  const lo = gap / 2 + pad;
  const hi = GROUND_Y - gap / 2 - pad + 20;
  const maxDelta = Math.min(280, 130 + idx * 2.4);
  let gy = lo + r() * Math.max(10, hi - lo);
  gy = clamp(gy, prevGapY - maxDelta, prevGapY + maxDelta);
  gy = clamp(gy, lo, Math.max(lo + 4, hi));
  prevGapY = gy;

  const g = {
    idx, wx, gapY: gy, gap, type,
    amp, freq: 0.7 + r() * 0.7, phase: r() * 6.283,
    curGapY: gy, curGap: gap, scored: false, hitFlash: 0,
    feather: r() < (type === 'narrow' ? 0.2 : 0.34),
    fx: 0, fy: 0, fTaken: false,
    spacingNext: c.spacing,
  };
  if (g.feather) {
    g.fx = wx + GATE_W + 90 + r() * 70;
    g.fy = clamp(gy + (r() - 0.5) * gap * 0.5, 70, GROUND_Y - 60);
  }
  return g;
}

function updateGateShape(g) {
  if (g.type === 'drift') {
    g.curGapY = clamp(g.gapY + Math.sin(tGlobal * g.freq + g.phase) * g.amp, g.gap / 2 + 34, GROUND_Y - g.gap / 2 - 24);
  } else {
    g.curGapY = g.gapY;
  }
  if (g.type === 'shutter') {
    const s = 0.5 + 0.5 * Math.sin(tGlobal * g.freq * 2.1 + g.phase);
    g.curGap = g.gap * (0.55 + 0.45 * s);
  } else {
    g.curGap = g.gap;
  }
}

function spawnGatesAhead() {
  const limit = mode === 'daily' ? DAILY_GATES : Infinity;
  while (nextGateIdx < limit && nextGateWX - dist < viewW + 260) {
    const g = makeGate(nextGateIdx, nextGateWX);
    gates.push(g);
    nextGateWX += g.spacingNext;
    nextGateIdx++;
  }
}

/* ------------------------------- run control ------------------------------ */

function currentSpeed() {
  const c = curve(gatesPassed);
  return c.speed;
}

function pickGhost() {
  const key = mode === 'daily' ? 'daily' : difficulty;
  const g = save.ghosts[key];
  if (g && g.samples && g.samples.length > 4 && (mode !== 'daily' || g.date === todayKey())) {
    ghostSamples = g.samples; ghostBest = g.gates || 0; ghostDist = g.dist || 0;
  } else { ghostSamples = null; ghostBest = 0; ghostDist = 0; }
}

function startRun(m, diff) {
  mode = m;
  if (diff) difficulty = diff;
  if (mode === 'daily') {
    difficulty = 'standard';
    seedLabel = todayKey();
    seed = hashStr('flappy-ascent-daily-' + seedLabel);
  } else {
    seedLabel = '';
    seed = (Math.random() * 0xffffffff) >>> 0;
  }
  gates = [];
  nextGateIdx = 0;
  prevGapY = 300;
  dist = 0; distPrev = 0;
  nextGateWX = BIRD_X + 470;
  gatesPassed = 0; score = 0; feathers = 0; perfects = 0;
  perfectStreak = 0; bestPerfectStreak = 0;
  runTime = 0; trauma = 0; flash = 0; hitstop = 0;
  newRecord = false; summitReached = false; deathTimer = 0; lastMedal = 0;
  bird.y = 300; bird.py = 300; bird.vy = 0; bird.rot = 0; bird.alive = true;
  trail.length = 0;
  recSamples = []; recIdx = -1;
  clearParts();
  for (let i = 0; i < TXT_MAX; i++) texts[i].a = false;
  pickGhost();
  spawnGatesAhead();
  state = 'ready';
  readyPulse = 0;
  hideAllOverlays();
  $('hud').classList.remove('hidden');
  sfx.resume();
  sfx.setWind(0.02, 0);
  updateHud(true);
}

function beginFlight() {
  state = 'play';
  save.totals.runs++;
  flap();
}

function flap() {
  bird.vy = FLAP_V;
  bird.flapPhase = 0;
  sfx.flap();
  if (cfg.particles) {
    for (let i = 0; i < 5; i++) {
      spawn(dist + BIRD_X - 8, bird.y + 6, -60 - Math.random() * 90, 40 + Math.random() * 90,
        0.45 + Math.random() * 0.3, 2 + Math.random() * 2, 'rgba(255,255,255,0.75)', 'dust', { grav: 60, drag: 0.97 });
    }
  }
}

function pressFlap() {
  sfx.resume();
  if (paused) return;
  if (state === 'ready') { beginFlight(); return; }
  if (state === 'play') {
    if (hitstop > 0) { bufferedFlap = tGlobal; return; }
    flap();
    return;
  }
  if (state === 'result') { retry(); return; }
}

function addTrauma(v) { if (cfg.shake) trauma = Math.min(1, trauma + v); }

function die(reason) {
  if (state !== 'play') return;
  state = 'dying';
  bird.alive = false;
  deathTimer = 0;
  hitstop = 0.09;
  addTrauma(reason === 'ground' ? 0.85 : 0.7);
  flash = 0.55; flashCol = '255,120,90';
  sfx.crash();
  sfx.setWind(0, 0);
  save.totals.crashes++;
  if (cfg.particles) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283;
      const sp2 = 90 + Math.random() * 320;
      spawn(dist + BIRD_X, bird.y, Math.cos(a) * sp2 - 60, Math.sin(a) * sp2 - 60,
        0.8 + Math.random() * 0.7, 5 + Math.random() * 5,
        i % 3 === 0 ? '#fff2c0' : '#ffd27f', 'feather', { grav: 420, drag: 0.99, front: true });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283;
      spawn(dist + BIRD_X, bird.y, Math.cos(a) * 260, Math.sin(a) * 260,
        0.4, 3 + Math.random() * 4, '#ffffff', 'spark', { grav: 200, front: true });
    }
  }
}

function reachSummit() {
  state = 'dying';
  summitReached = true;
  deathTimer = 0;
  flash = 0.5; flashCol = '255,235,160';
  sfx.summit();
  sfx.setWind(0, 0);
  if (cfg.particles) {
    for (let i = 0; i < 40; i++) {
      const a = -Math.random() * 3.14;
      const sp2 = 120 + Math.random() * 340;
      spawn(dist + BIRD_X, bird.y, Math.cos(a) * sp2, Math.sin(a) * sp2,
        1.1 + Math.random() * 0.8, 4 + Math.random() * 6,
        ['#ffd27f', '#7fe4ff', '#ffffff', '#8effb0'][i % 4], 'spark', { grav: 260, front: true });
    }
  }
}

function medalFor(g) {
  const th = mode === 'daily' ? DAILY_MEDALS : DIFFS[difficulty].medals;
  if (g >= th[2]) return 3;
  if (g >= th[1]) return 2;
  if (g >= th[0]) return 1;
  return 0;
}

function finishRun() {
  state = 'result';
  const ranked = mode === 'daily' || DIFFS[difficulty].ranked;
  const medal = ranked ? medalFor(gatesPassed) : 0;
  lastMedal = medal;

  save.totals.gates += gatesPassed;
  save.totals.feathers += feathers;
  save.totals.perfects += perfects;

  const bestRec = mode === 'daily'
    ? { gates: save.daily.best || 0, score: save.daily.score || 0, dist: 0 }
    : save.best[difficulty];

  newRecord = gatesPassed > bestRec.gates || (gatesPassed === bestRec.gates && score > bestRec.score);

  if (newRecord) {
    if (mode === 'daily') {
      save.daily.best = gatesPassed; save.daily.score = score; save.daily.medal = medal;
    } else {
      save.best[difficulty] = { gates: gatesPassed, score, dist };
    }
    const key = mode === 'daily' ? 'daily' : difficulty;
    save.ghosts[key] = { gates: gatesPassed, dist, samples: recSamples.slice(0, 1400), date: todayKey() };
  }

  if (mode === 'daily') {
    save.daily.date = todayKey();
    save.daily.gates = Math.max(save.daily.gates, gatesPassed);
    if (!save.daily.done) {
      save.daily.done = true;
      if (save.daily.lastDone === yesterdayKey()) save.daily.streak = (save.daily.streak || 0) + 1;
      else if (save.daily.lastDone !== todayKey()) save.daily.streak = 1;
      save.daily.lastDone = todayKey();
    }
    if (summitReached) grantAch('daily_summit', DAILY_GATES);
    else grantAch('daily_summit', gatesPassed);
  }

  if (ranked) {
    if (medal >= 1) { save.medals.bronze++; grantAch('medal_bronze', 1); }
    if (medal >= 2) { save.medals.silver++; grantAch('medal_silver', 1); }
    if (medal >= 3) { save.medals.gold++; grantAch('medal_gold', 1); }
    if (medal > 0) sfx.medal(medal);
  }
  grantAch('feathers_100', save.totals.feathers);

  showResult(medal);
  persist(`${mode === 'daily' ? 'Daily' : DIFFS[difficulty].name} · ${gatesPassed} gates`);
  empire.setContinuePoint('auto', `Best ${Math.max(save.best.standard.gates, save.best.storm.gates)} gates`).catch(() => {});
  sendShot();
  flushPlaytime(true);
}

let shotCanvas = null;
function sendShot() {
  try {
    if (!shotCanvas) { shotCanvas = document.createElement('canvas'); shotCanvas.width = 320; shotCanvas.height = 200; }
    const c2 = shotCanvas.getContext('2d');
    c2.drawImage(cvs, 0, 0, 320, 200);
    empire.screenshot(shotCanvas.toDataURL('image/jpeg', 0.6)).catch(() => {});
  } catch { /* ignore */ }
}

function retry() {
  startRun(mode, difficulty);
}

/* ------------------------------- simulation ------------------------------- */

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function step(dt) {
  tGlobal += dt;

  if (trauma > 0) trauma = Math.max(0, trauma - dt * 1.5);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  stepParts(dt);
  stepTexts(dt);

  if (state === 'menu') {
    distPrev = dist;
    dist += 62 * dt;
    bird.py = bird.y;
    bird.y = 300 + Math.sin(tGlobal * 1.6) * 26;
    bird.vy = Math.cos(tGlobal * 1.6) * 26 * 1.6;
    bird.rot = clamp(bird.vy / 900, -0.4, 0.5);
    bird.flapPhase += dt * 6;
    pushTrail();
    return;
  }

  if (state === 'result') {
    distPrev = dist; return;
  }

  if (state === 'dying') {
    distPrev = dist;
    deathTimer += dt;
    if (!summitReached) {
      bird.py = bird.y;
      bird.vy = Math.min(MAX_FALL, bird.vy + GRAV * 1.15 * dt);
      bird.y += bird.vy * dt;
      bird.rot = Math.min(1.6, bird.rot + dt * 3.4);
      if (bird.y > GROUND_Y - BIRD_R) {
        bird.y = GROUND_Y - BIRD_R;
        if (bird.vy > 120) { addTrauma(0.25); sfx.bonk(); }
        bird.vy = 0;
      }
    } else {
      distPrev = dist;
      dist += currentSpeed() * 0.55 * dt;
      bird.py = bird.y;
      bird.y = lerp(bird.y, 250, Math.min(1, dt * 2));
      bird.flapPhase += dt * 9;
    }
    if (deathTimer > (summitReached ? 1.5 : 0.85)) finishRun();
    return;
  }

  // ready + play
  playtimeAcc += dt;
  if (state === 'ready') {
    readyPulse += dt;
    bird.py = bird.y;
    bird.y = 300 + Math.sin(tGlobal * 3.4) * 12;
    bird.vy = 0;
    bird.rot = Math.sin(tGlobal * 3.4) * 0.12;
    bird.flapPhase += dt * 7;
    pushTrail();
    return;
  }

  runTime += dt;

  if (hitstop > 0) { hitstop -= dt; return; }
  if (bufferedFlap > 0 && tGlobal - bufferedFlap < FLAP_BUFFER) { bufferedFlap = -1; flap(); }
  else if (bufferedFlap > 0) bufferedFlap = -1;

  const sp = currentSpeed();
  distPrev = dist;
  dist += sp * dt;

  // ---- bird physics ----
  bird.py = bird.y;
  bird.vy = Math.min(MAX_FALL, bird.vy + GRAV * dt);
  bird.y += bird.vy * dt;
  bird.flapPhase += dt * (6 + Math.max(0, -bird.vy) * 0.02);

  if (bird.y < BIRD_R + 4) {
    bird.y = BIRD_R + 4;
    if (bird.vy < -80) {
      bird.vy = 60; sfx.bonk(); addTrauma(0.14);
      for (let i = 0; i < 5; i++) {
        spawn(dist + BIRD_X, bird.y - 4, (Math.random() - 0.5) * 200, 40 + Math.random() * 60,
          0.4, 3, 'rgba(255,255,255,0.7)', 'dust', { grav: 200 });
      }
    } else bird.vy = Math.max(bird.vy, 0);
  }

  const targetRot = clamp(bird.vy / 780, -0.62, 1.25);
  bird.rot += (targetRot - bird.rot) * Math.min(1, dt * (bird.vy < 0 ? 16 : 8));
  pushTrail();

  // ---- ghost recording ----
  const gi = Math.floor(dist / GHOST_STEP);
  if (gi > recIdx) { recIdx = gi; if (recSamples.length < 1400) recSamples.push(Math.round(bird.y)); }

  // ---- gates ----
  spawnGatesAhead();
  const birdWX = dist + BIRD_X;

  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (g.wx - dist < -GATE_W - 260) { gates.splice(i, 1); continue; }
    updateGateShape(g);
    if (g.hitFlash > 0) g.hitFlash -= dt;

    const topH = g.curGapY - g.curGap / 2;
    const botY = g.curGapY + g.curGap / 2;

    // collision
    if (Math.abs(g.wx + GATE_W / 2 - birdWX) < GATE_W / 2 + BIRD_R + 4) {
      if (circleRect(birdWX, bird.y, BIRD_R - 1.5, g.wx, -200, GATE_W, topH + 200) ||
          circleRect(birdWX, bird.y, BIRD_R - 1.5, g.wx, botY, GATE_W, GROUND_Y - botY + 20)) {
        g.hitFlash = 0.3;
        die('gate');
        return;
      }
    }

    // feather pickup
    if (g.feather && !g.fTaken) {
      const dx = g.fx - birdWX, dy = g.fy - bird.y;
      if (dx * dx + dy * dy < (BIRD_R + 16) * (BIRD_R + 16)) {
        g.fTaken = true;
        feathers++;
        score += 75;
        bird.vy = Math.min(bird.vy, -180);
        sfx.feather();
        floatText(g.fx, g.fy, '+75', '#9ff0ff', 20);
        if (cfg.particles) {
          for (let k = 0; k < 12; k++) {
            const a = Math.random() * 6.283;
            spawn(g.fx, g.fy, Math.cos(a) * 150, Math.sin(a) * 150, 0.5 + Math.random() * 0.3,
              3 + Math.random() * 3, '#bff4ff', 'spark', { grav: 120, front: true });
          }
        }
      }
    }

    // scoring
    if (!g.scored && birdWX - BIRD_R > g.wx + GATE_W) {
      g.scored = true;
      gatesPassed++;
      const mult = scoreMult();
      const narrow = g.type === 'narrow';
      let pts = 100 * mult * (narrow ? 2 : 1);
      const off = Math.abs(bird.y - g.curGapY);
      const perfect = off < Math.max(16, g.curGap * 0.17);
      if (perfect) {
        perfects++; perfectStreak++;
        bestPerfectStreak = Math.max(bestPerfectStreak, perfectStreak);
        pts += 50 * mult;
        sfx.perfect(perfectStreak);
        floatText(birdWX + 26, bird.y - 26, `PERFECT x${perfectStreak}`, '#ffe9a8', 19);
        if (cfg.particles) {
          for (let k = 0; k < 10; k++) {
            spawn(g.wx + GATE_W / 2, g.curGapY, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 320,
              0.5, 3, '#fff0b0', 'spark', { grav: 40, front: true });
          }
        }
        if (bestPerfectStreak >= 5) grantAch('perfect_5', bestPerfectStreak);
        else grantAch('perfect_5', bestPerfectStreak);
      } else {
        perfectStreak = 0;
      }
      score += pts;
      sfx.gate(gatesPassed - 1);
      floatText(birdWX + 20, bird.y + 18, `+${pts}`, narrow ? '#ffd27f' : '#ffffff', narrow ? 22 : 18);
      if (narrow) floatText(g.wx + GATE_W / 2, g.curGapY - g.curGap / 2 - 24, 'DOUBLE', '#ffd27f', 16);
      addTrauma(0.05);

      grantAch('first_gate', 1);
      grantAch('gates_10', gatesPassed);
      grantAch('gates_25', gatesPassed);
      grantAch('gates_50', gatesPassed);

      const oldZone = Math.floor((gatesPassed - 1) / 10);
      const newZone = Math.floor(gatesPassed / 10);
      if (newZone > oldZone && newZone <= 5) {
        toast(`${ZONES[Math.min(5, newZone)].name.toUpperCase()} REACHED`);
        flash = 0.3; flashCol = '255,255,255';
        sfx.gust();
      }
      if (gatesPassed % 10 === 0) persist();

      if (!newRecord && ghostBest > 0 && gatesPassed > ghostBest) {
        newRecord = true;
        toast('★ NEW PERSONAL BEST ★');
        sfx.record();
        flash = 0.35; flashCol = '255,220,140';
      }
    }
  }

  // ground
  if (bird.y + BIRD_R > GROUND_Y) { bird.y = GROUND_Y - BIRD_R; die('ground'); return; }

  // daily summit
  if (mode === 'daily' && nextGateIdx >= DAILY_GATES && gatesPassed >= DAILY_GATES) {
    const lastG = gates.length ? gates[gates.length - 1] : null;
    const finishWX = (lastG ? lastG.wx : nextGateWX) + 420;
    if (birdWX > finishWX) { reachSummit(); return; }
  }

  sfx.setWind(0.02 + Math.min(0.05, sp / 8000), sp);
}

function scoreMult() { return clamp(1 + Math.floor(gatesPassed / 10), 1, 5); }

function pushTrail() {
  trail.push(dist + BIRD_X, bird.y);
  if (trail.length > TRAIL_MAX * 2) trail.splice(0, trail.length - TRAIL_MAX * 2);
}

/* -------------------------------- rendering ------------------------------- */

let skyCache = { key: '', grad: null };

function zoneBlend() {
  const zPos = clamp(gatesPassed / 10, 0, ZONES.length - 1);
  zoneF = zPos;
  const i0 = Math.floor(zPos), i1 = Math.min(ZONES.length - 1, i0 + 1);
  const t = zPos - i0;
  const a = ZONES[i0], b = ZONES[i1];
  return {
    skyA: mixRGB(a._skyA, b._skyA, t), skyB: mixRGB(a._skyB, b._skyB, t),
    far: mixRGB(a._far, b._far, t), mid: mixRGB(a._mid, b._mid, t), near: mixRGB(a._near, b._near, t),
    gateA: mixRGB(a._gateA, b._gateA, t), gateB: mixRGB(a._gateB, b._gateB, t),
    rim: mixRGB(a._rim, b._rim, t), star: lerp(a.star, b.star, t),
    ground: mixRGB(a._ground, b._ground, t), ground2: mixRGB(a._ground2, b._ground2, t),
    cloud: t < 0.5 ? a.cloud : b.cloud,
    aur: a._aur && b._aur ? mixRGB(a._aur, b._aur, t) : (t > 0.5 ? b._aur : a._aur),
    aurA: lerp(a._aur ? 1 : 0, b._aur ? 1 : 0, t),
    name: ZONES[Math.round(zPos)].name,
  };
}

function drawSky(z) {
  const key = `${z.skyA[0] | 0},${z.skyA[1] | 0},${z.skyA[2] | 0}|${z.skyB[0] | 0},${z.skyB[1] | 0},${z.skyB[2] | 0}`;
  if (skyCache.key !== key) {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, rgbStr(z.skyA));
    g.addColorStop(1, rgbStr(z.skyB));
    skyCache = { key, grad: g };
  }
  ctx.fillStyle = skyCache.grad;
  ctx.fillRect(0, 0, viewW, WORLD_H);
}

function drawStars(z, d) {
  if (z.star <= 0.01) return;
  const off = (d * 0.02) % STAR_TILE;
  ctx.save();
  for (let pass = 0; pass < 2; pass++) {
    const base = -off + pass * STAR_TILE;
    if (base > viewW) continue;
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const x = base + s.x;
      if (x < -4 || x > viewW + 4) continue;
      const tw = 0.55 + 0.45 * Math.sin(tGlobal * s.sp + s.tw);
      ctx.globalAlpha = z.star * tw;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, s.y, s.s, s.s);
    }
  }
  ctx.restore();
}

function drawAurora(z, d) {
  if (!z.aur || z.aurA < 0.02) return;
  const col = z.aur;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let r = 0; r < 3; r++) {
    ctx.globalAlpha = 0.1 * z.aurA;
    ctx.beginPath();
    const yBase = 110 + r * 62;
    for (let x = 0; x <= viewW; x += 24) {
      const y = yBase + Math.sin((x + d * 0.05) * 0.006 + tGlobal * 0.35 + r) * 40
        + Math.sin((x + d * 0.02) * 0.013 + r * 2) * 18;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let x = viewW; x >= 0; x -= 24) {
      const y = yBase + 86 + Math.sin((x + d * 0.05) * 0.006 + tGlobal * 0.35 + r) * 40;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = rgbStr(col, 1);
    ctx.fill();
  }
  ctx.restore();
}

function drawRidge(pts, colour, speed, d, yShift) {
  const off = (d * speed) % RIDGE_W;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-off, WORLD_H);
  for (let pass = 0; pass < 2; pass++) {
    const base = -off + pass * RIDGE_W;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      ctx.lineTo(base + p.x, p.y + yShift);
    }
  }
  ctx.lineTo(-off + RIDGE_W * 2, WORLD_H);
  ctx.closePath();
  ctx.fill();
}

function drawClouds(z, d, layer, speed, alpha) {
  const off = (d * speed) % CLOUD_TILE;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = z.cloud;
  for (let pass = 0; pass < 2; pass++) {
    const base = -off + pass * CLOUD_TILE;
    for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      if (c.layer !== layer) continue;
      const x = base + c.x;
      if (x < -180 || x > viewW + 180) continue;
      ctx.beginPath();
      for (let j = 0; j < c.lobes.length; j++) {
        const l = c.lobes[j];
        ctx.moveTo(x + l.dx * c.s + l.rr * c.s, c.y + l.dy * c.s);
        ctx.arc(x + l.dx * c.s, c.y + l.dy * c.s, l.rr * c.s, 0, 6.283);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGround(z, d) {
  const g = ctx.createLinearGradient(0, GROUND_Y - 6, 0, WORLD_H);
  g.addColorStop(0, rgbStr(z.ground));
  g.addColorStop(1, rgbStr(z.ground2));
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, viewW, WORLD_H - GROUND_Y);
  ctx.fillStyle = rgbStr(z.rim, 0.5);
  ctx.fillRect(0, GROUND_Y - 2, viewW, 2);
  const off = (d * 1) % GROUND_TILE;
  ctx.fillStyle = rgbStr(z.ground2, 0.85);
  for (let pass = 0; pass < Math.ceil(viewW / GROUND_TILE) + 1; pass++) {
    const base = -off + pass * GROUND_TILE;
    for (let i = 0; i < GROUND_BITS.length; i++) {
      const b = GROUND_BITS[i];
      const x = base + b.x;
      if (x < -12 || x > viewW + 12) continue;
      ctx.fillRect(x, GROUND_Y - b.h, b.w, b.h);
    }
  }
}

function gateGradients(z) {
  const gA = ctx.createLinearGradient(0, 0, GATE_W, 0);
  const a = cfg.contrast ? [250, 250, 250] : z.gateA;
  const b = cfg.contrast ? [20, 20, 26] : z.gateB;
  gA.addColorStop(0, rgbStr(b));
  gA.addColorStop(0.22, rgbStr(a));
  gA.addColorStop(0.62, rgbStr(mixRGB(a, b, 0.45)));
  gA.addColorStop(1, rgbStr(b));
  return gA;
}

function drawGate(g, sx, z, grad) {
  const topH = Math.max(0, g.curGapY - g.curGap / 2);
  const botY = g.curGapY + g.curGap / 2;
  const narrow = g.type === 'narrow';
  ctx.save();
  ctx.translate(sx, 0);

  ctx.fillStyle = grad;
  ctx.fillRect(0, -60, GATE_W, topH + 60);
  ctx.fillRect(0, botY, GATE_W, GROUND_Y - botY + 8);

  // caps
  const capH = 20, capOver = 7;
  ctx.fillStyle = rgbStr(cfg.contrast ? [255, 255, 255] : mixRGB(z.gateA, [255, 255, 255], 0.28));
  ctx.fillRect(-capOver, topH - capH, GATE_W + capOver * 2, capH);
  ctx.fillRect(-capOver, botY, GATE_W + capOver * 2, capH);
  ctx.fillStyle = rgbStr(cfg.contrast ? [10, 10, 16] : z.gateB, 0.45);
  ctx.fillRect(-capOver, topH - 4, GATE_W + capOver * 2, 4);
  ctx.fillRect(-capOver, botY + capH - 4, GATE_W + capOver * 2, 4);

  // rim glow at the gap edges
  const rimA = 0.55 + (g.hitFlash > 0 ? 0.45 : 0) + (narrow ? 0.25 : 0);
  const rc = narrow ? [255, 210, 127] : z.rim;
  const rg = ctx.createLinearGradient(0, topH - capH, 0, topH + 26);
  rg.addColorStop(0, rgbStr(rc, 0));
  rg.addColorStop(1, rgbStr(rc, rimA * 0.5));
  ctx.fillStyle = rg;
  ctx.fillRect(-capOver, topH - capH, GATE_W + capOver * 2, capH + 26);
  const rg2 = ctx.createLinearGradient(0, botY + capH + 26, 0, botY);
  rg2.addColorStop(0, rgbStr(rc, 0));
  rg2.addColorStop(1, rgbStr(rc, rimA * 0.5));
  ctx.fillStyle = rg2;
  ctx.fillRect(-capOver, botY - 26, GATE_W + capOver * 2, capH + 26);

  // decorative stripes
  ctx.fillStyle = rgbStr(rc, 0.16);
  for (let y = 18; y < topH - capH; y += 46) ctx.fillRect(10, y, GATE_W - 20, 5);
  for (let y = botY + capH + 14; y < GROUND_Y; y += 46) ctx.fillRect(10, y, GATE_W - 20, 5);

  // type badge
  if (g.type !== 'normal') {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = rgbStr(rc, 0.9);
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const label = g.type === 'narrow' ? 'x2' : g.type === 'shutter' ? '><' : '~';
    ctx.fillText(label, GATE_W / 2, topH - capH - 8);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawFeatherItem(x, y) {
  const bob = Math.sin(tGlobal * 3 + x * 0.01) * 5;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(Math.sin(tGlobal * 2 + x * 0.02) * 0.3 - 0.5);
  const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  gl.addColorStop(0, 'rgba(160,240,255,0.5)');
  gl.addColorStop(1, 'rgba(160,240,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#e8fbff';
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.quadraticCurveTo(11, -3, 0, 15);
  ctx.quadraticCurveTo(-11, -3, 0, -14);
  ctx.fill();
  ctx.strokeStyle = '#7fd4e8'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 14); ctx.stroke();
  ctx.restore();
}

function drawBird(x, y, rot, phase, ghost) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (ghost) ctx.globalAlpha = 0.3;

  const bodyA = ghost ? '#dff0ff' : '#ffd873';
  const bodyB = ghost ? '#9fc2e8' : '#f39322';
  const wingC = ghost ? '#ffffff' : '#fff0c4';

  // tail
  ctx.fillStyle = bodyB;
  ctx.beginPath();
  ctx.moveTo(-12, -2); ctx.lineTo(-25, -9); ctx.lineTo(-23, 2); ctx.lineTo(-25, 9); ctx.closePath();
  ctx.fill();

  // body
  const bg = ctx.createLinearGradient(0, -14, 0, 14);
  bg.addColorStop(0, bodyA);
  bg.addColorStop(1, bodyB);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 13, 0, 0, 6.283);
  ctx.fill();

  // belly
  ctx.fillStyle = ghost ? 'rgba(255,255,255,0.5)' : 'rgba(255,246,214,0.9)';
  ctx.beginPath(); ctx.ellipse(1, 4, 11, 7, 0, 0, 6.283); ctx.fill();

  // wing
  const w = Math.sin(phase) * 0.9;
  ctx.save();
  ctx.translate(-2, -1);
  ctx.rotate(w * 0.9 - 0.25);
  ctx.fillStyle = wingC;
  ctx.beginPath();
  ctx.ellipse(-3, 3 + Math.abs(w) * 2, 13, 7.5, 0.2, 0, 6.283);
  ctx.fill();
  ctx.strokeStyle = ghost ? 'rgba(255,255,255,0.5)' : 'rgba(220,150,40,0.6)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // beak
  ctx.fillStyle = ghost ? '#cfe4ff' : '#ff8a2a';
  ctx.beginPath();
  ctx.moveTo(15, -2); ctx.lineTo(27, 1); ctx.lineTo(15, 5); ctx.closePath();
  ctx.fill();

  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(8, -4.5, 5, 0, 6.283); ctx.fill();
  ctx.fillStyle = ghost ? '#4a6a94' : '#20140a';
  ctx.beginPath(); ctx.arc(9.6, -4.5, 2.4, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(10.6, -5.8, 0.9, 0, 6.283); ctx.fill();

  ctx.restore();
}

function drawTrail(d) {
  if (!cfg.particles || trail.length < 6) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 2; i < trail.length; i += 2) {
    const t = i / trail.length;
    ctx.globalAlpha = t * 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 + t * 5;
    ctx.beginPath();
    ctx.moveTo(trail[i - 2] - d, trail[i - 1]);
    ctx.lineTo(trail[i] - d, trail[i + 1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(d, front) {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i];
    if (!p.a || p.front !== front) continue;
    const a = clamp(p.life / p.max, 0, 1);
    const x = p.x - d, y = p.y;
    if (x < -40 || x > viewW + 40) continue;
    ctx.globalAlpha = a;
    if (p.type === 'feather') {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    } else if (p.type === 'spark') {
      ctx.fillStyle = p.col;
      ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    } else {
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(x, y, p.size * a, 0, 6.283); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts(d) {
  ctx.save();
  ctx.textAlign = 'center';
  for (let i = 0; i < TXT_MAX; i++) {
    const t = texts[i];
    if (!t.a) continue;
    const a = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `700 ${t.size}px "Segoe UI", sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(t.s, t.x - d, t.y);
    ctx.fillStyle = t.col;
    ctx.fillText(t.s, t.x - d, t.y);
  }
  ctx.restore();
}

function drawGhost(d) {
  if (!cfg.ghost || !ghostSamples || state === 'menu') return;
  const gi = dist / GHOST_STEP;
  const i0 = Math.floor(gi);
  if (i0 < 0 || i0 >= ghostSamples.length - 1) return;
  const y = lerp(ghostSamples[i0], ghostSamples[i0 + 1], gi - i0);
  ctx.save();
  ctx.globalAlpha = 1;
  drawBird(BIRD_X - 4, y, clamp((ghostSamples[Math.min(ghostSamples.length - 1, i0 + 2)] - y) / 22, -0.6, 1.2), tGlobal * 6, true);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#dff0ff';
  ctx.font = '600 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PB GHOST', BIRD_X - 4, y - 26);
  ctx.restore();
}

function drawBeacon(d) {
  if (!cfg.ghost || ghostDist <= 0) return;
  const x = ghostDist + BIRD_X - d;
  if (x < -60 || x > viewW + 60) return;
  const pulse = 0.55 + 0.45 * Math.sin(tGlobal * 4);
  ctx.save();
  const g = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
  g.addColorStop(0, 'rgba(255,210,127,0)');
  g.addColorStop(0.5, `rgba(255,210,127,${0.22 * pulse})`);
  g.addColorStop(1, 'rgba(255,210,127,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 22, 0, 44, GROUND_Y);
  ctx.strokeStyle = `rgba(255,235,180,${0.5 + 0.3 * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(10,14,26,0.75)';
  ctx.fillRect(x - 46, 24, 92, 24);
  ctx.strokeStyle = 'rgba(255,210,127,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 46, 24, 92, 24);
  ctx.fillStyle = '#ffd27f';
  ctx.font = '700 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`PB ${ghostBest}`, x, 40);
  ctx.restore();
}

function drawSummitArch(d) {
  if (mode !== 'daily' || nextGateIdx < DAILY_GATES) return;
  const lastG = gates.length ? gates[gates.length - 1] : null;
  const finishWX = (lastG ? lastG.wx : nextGateWX) + 420;
  const x = finishWX - d;
  if (x < -120 || x > viewW + 200) return;
  ctx.save();
  const pulse = 0.6 + 0.4 * Math.sin(tGlobal * 3);
  const g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
  g.addColorStop(0, 'rgba(255,235,160,0)');
  g.addColorStop(0.5, `rgba(255,235,160,${0.3 * pulse})`);
  g.addColorStop(1, 'rgba(255,235,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 40, 0, 80, GROUND_Y);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '700 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUMMIT', x, 120);
  ctx.restore();
}

function drawReadyPrompt() {
  if (state !== 'ready') return;
  const p = 0.6 + 0.4 * Math.sin(tGlobal * 3.6);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(6,10,22,0.55)';
  const w = 400, h = 96;
  ctx.fillRect(viewW / 2 - w / 2, 170, w, h);
  ctx.strokeStyle = `rgba(255,210,127,${0.5 + 0.3 * p})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(viewW / 2 - w / 2, 170, w, h);
  ctx.fillStyle = '#ffe9c8';
  ctx.font = '700 28px "Segoe UI", sans-serif';
  ctx.fillText('SPACE / CLICK TO FLY', viewW / 2, 212);
  ctx.font = '400 14px "Segoe UI", sans-serif';
  ctx.fillStyle = '#a9c0e0';
  ctx.fillText(mode === 'daily'
    ? `Daily Ascent · ${seedLabel} · ${DAILY_GATES} gates to the summit`
    : `${DIFFS[difficulty].name} · endless · Esc to pause`, viewW / 2, 240);
  ctx.globalAlpha = 1;
  // arrow hint
  ctx.strokeStyle = `rgba(255,210,127,${p})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const ax = BIRD_X, ay = 300 + Math.sin(tGlobal * 3.4) * 12;
  ctx.moveTo(ax, ay - 34); ctx.lineTo(ax, ay - 58);
  ctx.moveTo(ax - 8, ay - 50); ctx.lineTo(ax, ay - 60); ctx.lineTo(ax + 8, ay - 50);
  ctx.stroke();
  ctx.restore();
}

function render(alpha) {
  const d = lerp(distPrev, dist, alpha);
  const by = lerp(bird.py, bird.y, alpha);
  const z = zoneBlend();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#04060e';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  let shx = 0, shy = 0;
  if (trauma > 0.001 && cfg.shake) {
    const s = trauma * trauma * 22;
    shx = (Math.random() * 2 - 1) * s;
    shy = (Math.random() * 2 - 1) * s;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(offXpx, offYpx);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, viewW, WORLD_H);
  ctx.clip();
  ctx.translate(shx, shy);

  drawSky(z);
  drawStars(z, d);
  drawAurora(z, d);

  // sun / moon
  const sunX = viewW * 0.78, sunY = 96;
  ctx.save();
  const sunG = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
  const warm = zoneF < 2.5;
  sunG.addColorStop(0, warm ? 'rgba(255,246,200,0.95)' : 'rgba(220,235,255,0.9)');
  sunG.addColorStop(0.25, warm ? 'rgba(255,220,140,0.5)' : 'rgba(190,215,255,0.4)');
  sunG.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = sunG;
  ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, 6.283); ctx.fill();
  ctx.restore();

  drawRidge(RIDGE_FAR, rgbStr(z.far), 0.07, d, 0);
  drawClouds(z, d, 0, 0.14, 0.55);
  drawRidge(RIDGE_MID, rgbStr(z.mid), 0.19, d, 0);
  drawClouds(z, d, 1, 0.3, 0.75);
  drawRidge(RIDGE_NEAR, rgbStr(z.near), 0.42, d, 0);

  drawParticles(d, false);

  // gates
  const grad = gateGradients(z);
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    const sx = g.wx - d;
    if (sx > viewW + 40 || sx < -GATE_W - 40) continue;
    drawGate(g, sx, z, grad);
  }
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (!g.feather || g.fTaken) continue;
    const fx = g.fx - d;
    if (fx < -30 || fx > viewW + 30) continue;
    drawFeatherItem(fx, g.fy);
  }

  drawSummitArch(d);
  drawBeacon(d);
  drawGhost(d);

  drawTrail(d);
  drawBird(BIRD_X, by, bird.rot, bird.flapPhase, false);
  drawParticles(d, true);

  drawGround(z, d);
  drawTexts(d);
  drawReadyPrompt();

  // foreground haze
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = z.cloud;
  const off = (d * 1.5) % 900;
  for (let i = 0; i < 4; i++) {
    const x = -off + i * 900 + 120;
    ctx.beginPath();
    ctx.ellipse(x, 540 + Math.sin(i * 2.1) * 40, 220, 34, 0, 0, 6.283);
    ctx.fill();
  }
  ctx.restore();

  // vignette
  ctx.save();
  const vg = ctx.createRadialGradient(viewW / 2, WORLD_H / 2, WORLD_H * 0.32, viewW / 2, WORLD_H / 2, WORLD_H * 0.92);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(-40, -40, viewW + 80, WORLD_H + 80);
  ctx.restore();

  if (flash > 0.001) {
    ctx.fillStyle = `rgba(${flashCol},${flash * 0.55})`;
    ctx.fillRect(-40, -40, viewW + 80, WORLD_H + 80);
  }
}

/* ---------------------------------- HUD ----------------------------------- */

const hudCache = {};
function setTxt(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  const el = $(id);
  if (el) el.textContent = v;
}
function updateHud(force) {
  if (force) for (const k in hudCache) delete hudCache[k];
  const z = ZONES[Math.round(clamp(gatesPassed / 10, 0, ZONES.length - 1))];
  setTxt('hudGates', String(gatesPassed));
  setTxt('hudScore', String(score));
  setTxt('hudAlt', String(Math.floor(dist * ALT_PER_UNIT) + 8));
  setTxt('hudFeathers', String(feathers));
  setTxt('hudZone', mode === 'daily' && gatesPassed >= DAILY_GATES ? 'SUMMIT' : z.name);
  setTxt('hudMult', String(scoreMult()));
  setTxt('hudPerfect', String(perfects));
  const bestG = mode === 'daily' ? (save.daily.best || 0) : save.best[difficulty].gates;
  setTxt('hudBest', String(bestG));
  setTxt('hudMode', mode === 'daily' ? `DAILY · ${seedLabel}` : `ENDLESS · ${DIFFS[difficulty].name.toUpperCase()}`);
  const target = mode === 'daily' ? DAILY_GATES : (DIFFS[difficulty].medals[2] || 45);
  const pct = clamp(gatesPassed / target, 0, 1) * 100;
  const fill = $('comboFill');
  if (hudCache._fill !== pct) { hudCache._fill = pct; fill.style.width = pct.toFixed(1) + '%'; }
}

/* -------------------------------- overlays -------------------------------- */

const OVERLAYS = ['mainMenu', 'modeMenu', 'howMenu', 'achMenu', 'setMenu', 'pauseMenu', 'resultMenu'];
function hideAllOverlays() { for (const id of OVERLAYS) $(id).classList.add('hidden'); }
function overlayOpen() { return OVERLAYS.some((id) => !$(id).classList.contains('hidden')); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

let howReturn = null;
let setReturn = null;

function goMenu() {
  state = 'menu';
  paused = false;
  gates = [];
  gatesPassed = 0; score = 0; feathers = 0; perfects = 0;
  dist = 0; distPrev = 0;
  bird.y = 300; bird.py = 300; bird.vy = 0; bird.rot = 0;
  ghostSamples = null; ghostDist = 0; ghostBest = 0;
  clearParts();
  hideAllOverlays();
  hide('hud');
  show('mainMenu');
  sfx.setWind(0, 0);
  refreshMenu();
}

function refreshMenu() {
  const b = save.best;
  const bestG = Math.max(b.standard.gates, b.storm.gates, b.breezy.gates);
  const bestS = Math.max(b.standard.score, b.storm.score, b.breezy.score);
  setTxt('menuBest', String(bestG));
  setTxt('menuScore', String(bestS));
  setTxt('menuBronze', String(save.medals.bronze));
  setTxt('menuSilver', String(save.medals.silver));
  setTxt('menuGold', String(save.medals.gold));
  const dq = save.daily;
  let dtxt;
  if (dq.done && dq.date === todayKey()) {
    dtxt = `Daily ${todayKey()}: ${dq.best} gates${dq.medal ? ' · ' + ['', '🥉', '🥈', '🥇'][dq.medal] : ''}`;
    if (dq.streak > 1) dtxt += ` · ${dq.streak}-day streak`;
  } else {
    dtxt = `Daily Ascent ${todayKey()} is waiting.`;
  }
  setTxt('menuDaily', dtxt);
}

function refreshModeMenu() {
  const d = DIFFS[difficulty];
  for (const btn of document.querySelectorAll('#modeMenu [data-diff]')) {
    btn.classList.toggle('sel', btn.getAttribute('data-diff') === difficulty);
  }
  const el = $('modeDesc');
  el.innerHTML = `<b style="color:#ffd27f">${d.name}</b> — ${d.desc}` +
    (d.ranked ? '' : ' <span class="tag prac">no medals</span>');
  setTxt('modeBest', `${save.best[difficulty].gates} gates · ${save.best[difficulty].score} pts`);
  setTxt('modeMedalReq', d.ranked ? `🥉 ${d.medals[0]} · 🥈 ${d.medals[1]} · 🥇 ${d.medals[2]}` : 'practice — none');
}

function refreshAch() {
  const list = $('achList');
  list.innerHTML = '';
  let done = 0;
  for (const a of ACHS) {
    const v = save.ach[a.id] || 0;
    const got = v >= a.target;
    if (got) done++;
    const secret = a.hidden && !got;
    const row = document.createElement('div');
    row.className = 'achItem' + (got ? ' done' : '');
    const pct = clamp(v / a.target, 0, 1) * 100;
    row.innerHTML =
      `<div class="ico">${secret ? '❔' : a.ico}</div>` +
      `<div style="flex:1;min-width:0">` +
      `<div class="nm">${secret ? 'Hidden Award' : a.t}</div>` +
      `<div class="ds">${secret ? 'Keep climbing to discover this one.' : a.d}</div>` +
      (a.target > 1 && !secret ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '') +
      `</div>` +
      `<div class="pg">${got ? 'EARNED' : (a.target > 1 && !secret ? `${Math.min(v, a.target)}/${a.target}` : '—')}</div>`;
    list.appendChild(row);
  }
  setTxt('achCount', String(done));
  setTxt('lifeRuns', String(save.totals.runs));
  setTxt('lifeGates', String(save.totals.gates));
  setTxt('lifeFeathers', String(save.totals.feathers));
  setTxt('lifePerfect', String(save.totals.perfects));
  setTxt('lifeTime', fmtMinutes(save.totals.timeSec));
}

function refreshSettings() {
  $('setVol').value = String(cfg.vol);
  setTxt('setVolVal', Math.round(cfg.vol * 100) + '%');
  $('setSfx').checked = cfg.sfx;
  $('setShake').checked = cfg.shake;
  $('setParticles').checked = cfg.particles;
  $('setGhost').checked = cfg.ghost;
  $('setContrast').checked = cfg.contrast;
  $('setMotionNote').textContent = reduceMotion
    ? 'Your system asks for reduced motion — shake starts disabled and effects are toned down.'
    : 'Turn off shake or particles if the sky feels busy.';
  $('btnWipe').textContent = 'ERASE SAVED PROGRESS';
  wipeArmed = false;
}

function showResult(medal) {
  const icons = ['🪶', '🥉', '🥈', '🥇'];
  const names = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'];
  $('resMedal').textContent = summitReached ? '🏔️' : icons[medal];
  $('resTitle').textContent = summitReached ? 'SUMMIT REACHED' : (medal ? names[medal] + ' ASCENT' : 'RUN COMPLETE');
  $('resSub').textContent = mode === 'daily'
    ? `DAILY ASCENT · ${seedLabel}`
    : `ENDLESS · ${DIFFS[difficulty].name.toUpperCase()}${DIFFS[difficulty].ranked ? '' : ' · PRACTICE'}`;
  $('resNew').classList.toggle('hidden', !newRecord);
  setTxt('resGates', mode === 'daily' ? `${gatesPassed} / ${DAILY_GATES}` : String(gatesPassed));
  setTxt('resScore', String(score));
  setTxt('resPerfect', `${perfects} (best chain ${bestPerfectStreak})`);
  setTxt('resFeathers', String(feathers));
  setTxt('resAlt', `${Math.floor(dist * ALT_PER_UNIT) + 8} m`);
  setTxt('resZone', ZONES[Math.round(clamp(gatesPassed / 10, 0, ZONES.length - 1))].name);
  setTxt('resTime', fmtTime(runTime));
  const bestG = mode === 'daily' ? save.daily.best : save.best[difficulty].gates;
  setTxt('resBest', `${bestG} gates`);

  let nextTxt = '';
  const th = mode === 'daily' ? DAILY_MEDALS : DIFFS[difficulty].medals;
  if (mode === 'daily' && summitReached) {
    nextTxt = save.daily.streak > 1 ? `Daily streak: ${save.daily.streak} days.` : 'Come back tomorrow for a fresh course.';
  } else if (!DIFFS[difficulty].ranked && mode !== 'daily') {
    nextTxt = 'Breezy is practice — switch to Standard for medals and awards.';
  } else if (medal < 3) {
    const nm = ['Bronze', 'Silver', 'Gold'][medal];
    nextTxt = `Next: ${nm} at ${th[medal]} gates — ${Math.max(0, th[medal] - gatesPassed)} to go.`;
  } else {
    nextTxt = 'Gold secured. Now chase the ghost.';
  }
  $('resNext').textContent = nextTxt;

  hide('hud');
  show('resultMenu');
  refreshMenu();
}

/* -------------------------------- pause ----------------------------------- */

function doPause(silent) {
  if (state !== 'play' && state !== 'ready') return;
  if (paused) return;
  paused = true;
  sfx.setWind(0, 0);
  $('pauseSub').textContent = mode === 'daily'
    ? `DAILY ${seedLabel} · ${gatesPassed} GATES`
    : `${DIFFS[difficulty].name.toUpperCase()} · ${gatesPassed} GATES`;
  show('pauseMenu');
  if (!silent) sfx.ui();
}
function doResume() {
  paused = false;
  hide('pauseMenu'); hide('setMenu'); hide('howMenu');
  sfx.resume();
  sfx.setWind(0.03, currentSpeed());
}

/* -------------------------------- input ----------------------------------- */

function isTypingTarget(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  const code = e.code;
  if (isTypingTarget(e) && code !== 'Escape') return;

  if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
    e.preventDefault();
    if (e.repeat) return;
    if (paused) return;
    if (state === 'menu') {
      if (!$('mainMenu').classList.contains('hidden')) { sfx.ui(); openMode(); }
      else if (!$('modeMenu').classList.contains('hidden')) { sfx.ui(); startRun('endless', difficulty); }
      return;
    }
    pressFlap();
    return;
  }
  if (code === 'Escape' || code === 'KeyP') {
    e.preventDefault();
    handleBack(code === 'KeyP');
    return;
  }
  if (code === 'KeyR') {
    if (state === 'play' || state === 'ready' || state === 'dying' || state === 'result' || paused) {
      sfx.ui(); retry();
    }
    return;
  }
  if (code === 'KeyH') {
    if (state === 'menu' || paused || state === 'result') { sfx.ui(); openHow(); }
    return;
  }
  if (code === 'KeyM') {
    const m = sfx.toggleMute();
    toast(m ? '🔇 Muted' : '🔊 Sound on');
    return;
  }
  if (k === undefined) return;
});

function handleBack(isP) {
  // deepest overlay first
  if (!$('howMenu').classList.contains('hidden')) { hide('howMenu'); if (howReturn) show(howReturn); howReturn = null; sfx.ui(); return; }
  if (!$('setMenu').classList.contains('hidden')) { hide('setMenu'); if (setReturn) show(setReturn); setReturn = null; persist(); sfx.ui(); return; }
  if (!$('achMenu').classList.contains('hidden')) { hide('achMenu'); show('mainMenu'); sfx.ui(); return; }
  if (!$('modeMenu').classList.contains('hidden')) { hide('modeMenu'); show('mainMenu'); sfx.ui(); return; }
  if (!$('resultMenu').classList.contains('hidden')) { goMenu(); sfx.ui(); return; }
  if (paused) { doResume(); sfx.ui(); return; }
  if (state === 'play' || state === 'ready') { doPause(); return; }
  if (state === 'dying') return;
  if (state === 'menu' && !isP) { /* already home */ }
}

cvs.addEventListener('pointerdown', (e) => {
  if (overlayOpen()) return;
  e.preventDefault();
  pressFlap();
});
cvs.addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------ menu wiring ------------------------------- */

function openMode() {
  hideAllOverlays();
  show('modeMenu');
  refreshModeMenu();
}
function openHow() {
  howReturn = OVERLAYS.find((id) => !$(id).classList.contains('hidden')) || (paused ? 'pauseMenu' : 'mainMenu');
  hideAllOverlays();
  if (paused) show('pauseMenu');
  show('howMenu');
  if (paused) hide('pauseMenu');
}
function openSettings(from) {
  setReturn = from;
  hideAllOverlays();
  refreshSettings();
  show('setMenu');
}

$('btnPlay').addEventListener('click', () => { sfx.ui(); sfx.resume(); openMode(); });
$('btnDaily').addEventListener('click', () => { sfx.ui(); sfx.resume(); startRun('daily'); });
$('btnHow').addEventListener('click', () => { sfx.ui(); openHow(); });
$('btnAch').addEventListener('click', () => { sfx.ui(); hideAllOverlays(); refreshAch(); show('achMenu'); });
$('btnSettings').addEventListener('click', () => { sfx.ui(); openSettings('mainMenu'); });

$('modeClose').addEventListener('click', () => { sfx.ui(); hideAllOverlays(); show('mainMenu'); });
$('btnStartRun').addEventListener('click', () => { sfx.ui(); startRun('endless', difficulty); });
for (const btn of document.querySelectorAll('#modeMenu [data-diff]')) {
  btn.addEventListener('click', () => {
    difficulty = btn.getAttribute('data-diff');
    sfx.ui();
    refreshModeMenu();
  });
}

$('howClose').addEventListener('click', () => { sfx.ui(); closeHow(); });
$('howClose2').addEventListener('click', () => { sfx.ui(); closeHow(); });
function closeHow() {
  hide('howMenu');
  if (paused) show('pauseMenu');
  else if (howReturn) show(howReturn);
  else if (state === 'menu') show('mainMenu');
  howReturn = null;
}

$('achClose').addEventListener('click', () => { sfx.ui(); hide('achMenu'); show('mainMenu'); });
$('achClose2').addEventListener('click', () => { sfx.ui(); hide('achMenu'); show('mainMenu'); });

$('setVol').addEventListener('input', (e) => {
  cfg.vol = Number(e.target.value);
  sfx.setVol(cfg.vol);
  setTxt('setVolVal', Math.round(cfg.vol * 100) + '%');
});
$('setVol').addEventListener('change', () => { sfx.ui(); persist(); });
$('setSfx').addEventListener('change', (e) => { cfg.sfx = e.target.checked; sfx.on = cfg.sfx; if (!cfg.sfx) sfx.setWind(0, 0); persist(); });
$('setShake').addEventListener('change', (e) => { cfg.shake = e.target.checked; if (!cfg.shake) trauma = 0; persist(); });
$('setParticles').addEventListener('change', (e) => { cfg.particles = e.target.checked; if (!cfg.particles) clearParts(); persist(); });
$('setGhost').addEventListener('change', (e) => { cfg.ghost = e.target.checked; persist(); });
$('setContrast').addEventListener('change', (e) => { cfg.contrast = e.target.checked; persist(); });
$('setDone').addEventListener('click', () => { sfx.ui(); closeSettings(); });
$('setClose').addEventListener('click', () => { sfx.ui(); closeSettings(); });
function closeSettings() {
  hide('setMenu');
  persist();
  if (paused) show('pauseMenu');
  else if (setReturn) show(setReturn);
  else if (state === 'menu') show('mainMenu');
  setReturn = null;
}

let wipeArmed = false;
$('btnWipe').addEventListener('click', () => {
  const b = $('btnWipe');
  if (!wipeArmed) {
    wipeArmed = true;
    b.textContent = 'CLICK AGAIN TO CONFIRM ERASE';
    sfx.ui();
    setTimeout(() => { if (wipeArmed) { wipeArmed = false; b.textContent = 'ERASE SAVED PROGRESS'; } }, 4000);
    return;
  }
  wipeArmed = false;
  b.textContent = 'PROGRESS ERASED';
  save.best = { breezy: { gates: 0, score: 0, dist: 0 }, standard: { gates: 0, score: 0, dist: 0 }, storm: { gates: 0, score: 0, dist: 0 } };
  save.daily = { date: todayKey(), gates: 0, score: 0, best: 0, done: false, medal: 0, streak: 0, lastDone: '' };
  save.totals = { runs: 0, gates: 0, feathers: 0, perfects: 0, timeSec: 0, crashes: 0 };
  save.medals = { bronze: 0, silver: 0, gold: 0 };
  save.ghosts = { standard: null, breezy: null, storm: null, daily: null };
  save.ach = {};
  ghostSamples = null; ghostBest = 0; ghostDist = 0;
  persist('Fresh start');
  refreshMenu();
  toast('Local progress erased');
  setTimeout(() => { b.textContent = 'ERASE SAVED PROGRESS'; }, 2200);
});

$('btnPause').addEventListener('click', (e) => { e.stopPropagation(); doPause(); });
$('btnResume').addEventListener('click', () => { sfx.ui(); doResume(); });
$('btnRestart').addEventListener('click', () => { sfx.ui(); paused = false; retry(); });
$('btnPauseHow').addEventListener('click', () => { sfx.ui(); hide('pauseMenu'); show('howMenu'); });
$('btnPauseSet').addEventListener('click', () => { sfx.ui(); hide('pauseMenu'); refreshSettings(); show('setMenu'); });
$('btnPauseQuit').addEventListener('click', () => { sfx.ui(); paused = false; persist(); goMenu(); });

$('btnRetry').addEventListener('click', () => { sfx.ui(); retry(); });
$('btnResultMode').addEventListener('click', () => { sfx.ui(); hideAllOverlays(); state = 'menu'; openMode(); });
$('btnResultMenu').addEventListener('click', () => { sfx.ui(); goMenu(); });

/* ------------------------------- main loop -------------------------------- */

let rafId = 0;
let lastTs = 0;
let acc = 0;

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.25) dt = 0.25;

  if (!paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { step(STEP); acc -= STEP; n++; }
    if (acc > STEP * MAX_STEPS) acc = 0;
    if (playtimeAcc >= 1) {
      save.totals.timeSec += playtimeAcc;
      playtimeSend += playtimeAcc;
      playtimeAcc = 0;
      if (playtimeSend >= 30) flushPlaytime(false);
    }
  }
  render(paused ? 1 : acc / STEP);
  if (state === 'play' || state === 'ready' || state === 'dying') updateHud(false);
}

function flushPlaytime(force) {
  const s = playtimeSend + playtimeAcc;
  if (s < (force ? 0.5 : 30)) return;
  playtimeSend = 0;
  if (playtimeAcc > 0) { save.totals.timeSec += playtimeAcc; playtimeAcc = 0; }
  empire.reportPlaytime(Math.round(s)).catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'play' || state === 'ready') doPause(true);
    flushPlaytime(true);
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; lastTs = 0; }
  } else if (!rafId) {
    lastTs = 0; acc = 0;
    rafId = requestAnimationFrame(frame);
  }
});
window.addEventListener('pagehide', () => { flushPlaytime(true); persist(); });
window.addEventListener('blur', () => { if (state === 'play') doPause(true); });

/* --------------------------------- boot ----------------------------------- */

async function boot() {
  resize();
  try {
    const init = await empire.connect();
    hubReady = !!init;
    if (init && init.settings) applyHubSettings(init.settings);
  } catch { /* standalone */ }
  await loadSave();
  seedAchUnlocked();
  try {
    const s = await empire.getSettings();
    if (s) applyHubSettings(s);
  } catch { /* ignore */ }
  try {
    const p = await empire.getProfile();
    if (p && p.name) setTxt('menuWho', `Pilot: ${p.avatar || '🎮'} ${p.name}`);
  } catch { /* ignore */ }
  refreshMenu();
  refreshSettings();
  hideAllOverlays();
  show('mainMenu');
  state = 'menu';
  rafId = requestAnimationFrame(frame);
}

boot();
