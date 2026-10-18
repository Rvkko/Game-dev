/**
 * WORD WEAVER — five-letter deduction word game.
 * Gaming Empire · 100% offline · DOM stack.
 */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'word-weaver',statusKey:'__wordWeaverAssetStatus',accent:0x68ebd0,getState:()=>({active:S?.screen==='game',motion:Math.min(1,(S?.gauntlet?.row||0)/6),danger:0})});
import { ANSWER_POOL, EXTRA_POOL, VALID_GUESSES } from './words.js';

const GAME_ID = 'word-weaver';
const SAVE_VERSION = 1;
const WORD_LEN = 5;
const MAX_ROWS = 6;

// ===========================================================================
// SMALL UTILITIES
// ===========================================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Local-date key, e.g. "2026-07-27". */
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole-day index for a "YYYY-MM-DD" key, used for streak continuity. */
function dayIndex(key) {
  const p = String(key || '').split('-');
  if (p.length !== 3) return NaN;
  return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

// ===========================================================================
// DICTIONARY PREP — rarity scoring and difficulty tiers
// ===========================================================================

// Rough English letter frequency (percent). Rare letters make a word harder.
const LETTER_FREQ = {
  e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0, d: 4.3,
  l: 4.0, c: 2.8, u: 2.8, m: 2.4, w: 2.4, f: 2.2, g: 2.0, y: 2.0, p: 1.9, b: 1.5,
  v: 0.98, k: 0.77, j: 0.15, x: 0.15, q: 0.095, z: 0.074,
};

function difficultyScore(word) {
  let s = 0;
  const seen = {};
  for (const ch of word) {
    const f = LETTER_FREQ[ch] || 1;
    s += 1 / Math.max(0.3, f);       // rare letters cost more
    seen[ch] = (seen[ch] || 0) + 1;
  }
  // repeated letters remove information -> harder
  for (const k in seen) if (seen[k] > 1) s += 0.55 * (seen[k] - 1);
  // vowel-poor words are harder to crack
  const vowels = (word.match(/[aeiou]/g) || []).length;
  if (vowels <= 1) s += 0.7;
  return s;
}

/** Answers sorted easiest -> hardest. */
const SORTED_ANSWERS = ANSWER_POOL.slice().sort((a, b) => difficultyScore(a) - difficultyScore(b));

/** Everyday pool for Daily and Unlimited (easiest ~62%). */
const COMMON_ANSWERS = SORTED_ANSWERS.slice(0, Math.max(200, Math.floor(SORTED_ANSWERS.length * 0.62)));

/** Eight escalating bands used by the Gauntlet. */
const GAUNTLET_BANDS = (() => {
  const n = SORTED_ANSWERS.length;
  const bounds = [
    [0.00, 0.14], [0.08, 0.26], [0.18, 0.38], [0.30, 0.50],
    [0.42, 0.62], [0.54, 0.74], [0.66, 0.88], [0.80, 1.00],
  ];
  return bounds.map(([lo, hi]) => SORTED_ANSWERS.slice(Math.floor(n * lo), Math.max(Math.floor(n * hi), Math.floor(n * lo) + 30)));
})();

/** Multiplicative step coprime with the pool size => every word before a repeat. */
const DAILY_STEP = (() => {
  const n = COMMON_ANSWERS.length;
  for (let p = 977; p < 4000; p++) if (gcd(p, n) === 1) return p;
  return 1;
})();

function dailyWordFor(key) {
  const n = COMMON_ANSWERS.length;
  const base = dayIndex(key);
  const idx = Number.isNaN(base)
    ? hashString(key) % n
    : (((base * DAILY_STEP) % n) + n) % n;
  // second-order shuffle so consecutive days feel unrelated
  const jump = hashString('word-weaver:' + key) % n;
  return COMMON_ANSWERS[(idx + jump) % n];
}

function randomFrom(list) { return list[Math.floor(Math.random() * list.length)]; }

// ===========================================================================
// AUDIO — synthesised, never a file download
// ===========================================================================

const Audio = {
  ctx: null,
  master: null,
  enabled: true,
  volume: 0.55,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
  tone(freq, dur, type = 'sine', gain = 0.2, delay = 0, glideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  },
  noise(dur = 0.16, gain = 0.12, delay = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(this.ctx.currentTime + delay);
  },
  key() { this.tone(320 + Math.random() * 40, 0.05, 'square', 0.07); },
  del() { this.tone(190, 0.06, 'square', 0.06); },
  invalid() { this.tone(150, 0.16, 'sawtooth', 0.13, 0, 96); this.noise(0.12, 0.05); },
  flip(kind, i) {
    const base = kind === 'correct' ? 620 : kind === 'present' ? 480 : 300;
    this.tone(base + i * 22, 0.1, 'triangle', 0.11);
  },
  hint() { this.tone(880, 0.14, 'sine', 0.14); this.tone(1320, 0.2, 'sine', 0.1, 0.07); },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this.tone(f, 0.42, 'triangle', 0.17, i * 0.09));
    this.tone(261.6, 0.7, 'sine', 0.12, 0.1);
  },
  lose() {
    [392, 349.2, 293.7, 233.1].forEach((f, i) => this.tone(f, 0.34, 'sawtooth', 0.1, i * 0.13));
  },
  stage() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.24, 'square', 0.12, i * 0.07)); },
  ui() { this.tone(520, 0.05, 'sine', 0.07); },
};

// ===========================================================================
// PARTICLE FX — pooled, canvas overlay
// ===========================================================================

const FX = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
  pool: [], active: 0, MAX: 280,
  shake: 0, shakeMag: 0,
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    for (let i = 0; i < this.MAX; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, rot: 0, vr: 0, hue: 40, kind: 0, alive: false });
    }
  },
  resize(w, h) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w; this.h = h;
    if (!this.canvas) return;
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  },
  spawn(x, y, vx, vy, life, size, hue, kind) {
    for (let i = 0; i < this.MAX; i++) {
      const p = this.pool[i];
      if (p.alive) continue;
      p.alive = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.size = size; p.hue = hue; p.kind = kind;
      p.rot = Math.random() * Math.PI * 2; p.vr = (Math.random() - 0.5) * 9;
      this.active++;
      return p;
    }
    return null;
  },
  confetti(cx, cy, count = 110) {
    if (settings.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 130 + Math.random() * 320;
      this.spawn(
        cx + (Math.random() - 0.5) * 60, cy + (Math.random() - 0.5) * 30,
        Math.cos(a) * sp, Math.sin(a) * sp - 130,
        1.1 + Math.random() * 1.2,
        3 + Math.random() * 5,
        [46, 140, 200, 20, 320][i % 5],
        0
      );
    }
  },
  sparkle(cx, cy, count = 24, hue = 46) {
    if (settings.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 150;
      this.spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.5, 2 + Math.random() * 3, hue, 1);
    }
  },
  dust(cx, cy) {
    if (settings.reduceMotion) return;
    for (let i = 0; i < 40; i++) {
      const a = Math.PI + Math.random() * Math.PI;
      const sp = 30 + Math.random() * 90;
      this.spawn(cx + (Math.random() - 0.5) * 180, cy, Math.cos(a) * sp * 0.4, -Math.abs(Math.sin(a)) * sp * 0.3, 0.9 + Math.random(), 2 + Math.random() * 3, 220, 1);
    }
  },
  kick(mag) { if (settings.reduceMotion) return; this.shake = 0.32; this.shakeMag = mag; },
  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.active === 0) return;
    for (let i = 0; i < this.MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; this.active--; continue; }
      p.vy += (p.kind === 0 ? 620 : 130) * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > this.h + 40) { p.alive = false; this.active--; }
    }
  },
  render() {
    const c = this.ctx;
    if (!c) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    if (this.active === 0) return;
    for (let i = 0; i < this.MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      const a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = a;
      if (p.kind === 0) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = `hsl(${p.hue}, 85%, ${58 + 12 * a}%)`;
        c.fillRect(-p.size * 0.5, -p.size * 1.4, p.size, p.size * 2.8);
        c.restore();
      } else {
        c.beginPath();
        c.fillStyle = `hsl(${p.hue}, 90%, 72%)`;
        c.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  },
};

// ===========================================================================
// SETTINGS / STATS / STATE
// ===========================================================================

const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const settings = {
  hardMode: false,
  colorBlind: false,
  sound: true,
  volume: 0.55,
  reduceMotion: !!prefersReduced,
};

function blankModeStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
}

const stats = {
  daily: { ...blankModeStats(), lastDate: null, lastSolvedDate: null },
  unlimited: { ...blankModeStats() },
  gauntlet: { ...blankModeStats(), runs: 0, clears: 0, bestStage: 0, bestScore: 0 },
};

const counters = { totalPlayed: 0, noHintWins: 0, lastGuessWins: 0 };

const dailyRecord = { date: null, answer: '', guesses: [], done: false, won: false, hintless: true };

const S = {
  screen: 'menu',          // menu | playing | result
  mode: null,              // daily | unlimited | gauntlet
  answer: '',
  rows: MAX_ROWS,
  guesses: [],             // [{word, result}]
  current: '',
  finished: false,
  won: false,
  paused: false,
  revealing: false,
  startTime: 0,
  elapsed: 0,
  hintsLeft: 0,
  hintsUsedThisPuzzle: 0,
  hintReveals: [],         // [{pos, letter}]
  hardLocked: false,       // hard mode as locked in at puzzle start
  gauntlet: { stage: 1, lives: 3, score: 0, hints: 3, active: false, cleared: false },
};

const kbState = {};         // letter -> 'correct'|'present'|'absent'
const unlockedAch = new Set();
const achProgress = {};

// ===========================================================================
// DOM REFERENCES
// ===========================================================================

const el = {
  app: $('app'),
  hudMode: $('hudMode'), hudStage: $('hudStage'), hudGuesses: $('hudGuesses'),
  hudTimer: $('hudTimer'), hudStreak: $('hudStreak'),
  btnHint: $('btnHint'), btnHudHow: $('btnHudHow'), btnHudStats: $('btnHudStats'), btnPause: $('btnPause'),
  playRoot: $('playRoot'), fx: $('fx'), toastWrap: $('toastWrap'),
  boardWrap: $('boardWrap'), board: $('board'), hintBar: $('hintBar'), kbWrap: $('kbWrap'),
  menuScreen: $('menuScreen'), btnDaily: $('btnDaily'), menuBadge: $('menuBadge'),
  dailyStatus: $('dailyStatus'), btnUnlimited: $('btnUnlimited'), btnGauntlet: $('btnGauntlet'),
  gauntletSub: $('gauntletSub'), btnHowTo: $('btnHowTo'), btnStats: $('btnStats'),
  btnSettings: $('btnSettings'), menuFoot: $('menuFoot'),
  howToPanel: $('howToPanel'), howToClose: $('howToClose'), howToDone: $('howToDone'),
  statsPanel: $('statsPanel'), statsClose: $('statsClose'), statsSub: $('statsSub'),
  stPlayed: $('stPlayed'), stWinPct: $('stWinPct'), stStreak: $('stStreak'), stMax: $('stMax'),
  distRows: $('distRows'), extraStats: $('extraStats'), statsDone: $('statsDone'),
  settingsPanel: $('settingsPanel'), settingsClose: $('settingsClose'),
  optHard: $('optHard'), optColorBlind: $('optColorBlind'), optSound: $('optSound'),
  volVal: $('volVal'), volSlider: $('volSlider'), optMotion: $('optMotion'),
  btnResetStats: $('btnResetStats'), settingsDone: $('settingsDone'),
  pausePanel: $('pausePanel'), pauseSub: $('pauseSub'), btnResume: $('btnResume'),
  btnRestart: $('btnRestart'), btnPauseHowTo: $('btnPauseHowTo'), btnPauseStats: $('btnPauseStats'),
  btnPauseSettings: $('btnPauseSettings'), btnQuit: $('btnQuit'),
  resultPanel: $('resultPanel'), resTitle: $('resTitle'), resWord: $('resWord'), resSub: $('resSub'),
  resGrid: $('resGrid'), resStatsLine: $('resStatsLine'), btnResultNext: $('btnResultNext'),
  btnResultStats: $('btnResultStats'), btnResultMenu: $('btnResultMenu'),
};

const tileEls = [];  // [row][col]
const rowEls = [];
const keyEls = {};   // key id -> element

// ===========================================================================
// EMPIRE SDK
// ===========================================================================

let empire = null;
let saveTimer = null;
let playtimeAccum = 0;
let playtimeSinceReport = 0;

function buildBlob() {
  return {
    v: SAVE_VERSION,
    settings: { ...settings },
    stats: JSON.parse(JSON.stringify(stats)),
    counters: { ...counters },
    daily: { ...dailyRecord, guesses: dailyRecord.guesses.slice() },
    playtime: Math.floor(playtimeAccum),
  };
}

function applyBlob(b) {
  if (!b || typeof b !== 'object') return;
  if (b.settings) Object.assign(settings, b.settings);
  if (b.stats) {
    for (const k of ['daily', 'unlimited', 'gauntlet']) {
      if (b.stats[k]) {
        Object.assign(stats[k], b.stats[k]);
        if (!Array.isArray(stats[k].dist) || stats[k].dist.length !== 6) stats[k].dist = [0, 0, 0, 0, 0, 0];
      }
    }
  }
  if (b.counters) Object.assign(counters, b.counters);
  if (b.daily) Object.assign(dailyRecord, b.daily, { guesses: Array.isArray(b.daily.guesses) ? b.daily.guesses.slice() : [] });
  if (typeof b.playtime === 'number') playtimeAccum = b.playtime;
}

function queueSave(label) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; doSave(label); }, 420);
}

async function doSave(label) {
  if (!empire) return;
  try {
    await empire.saveState('auto', buildBlob(), {
      label: label || 'Word Weaver',
      playtimeSec: Math.floor(playtimeAccum),
      progress: clamp(counters.totalPlayed / 100, 0, 1),
      mode: S.mode || 'menu',
    });
  } catch { /* hub unavailable — standalone fallback already handled by SDK */ }
}

async function unlock(id, progress = 1) {
  if (!empire) return;
  const prev = achProgress[id] || 0;
  if (unlockedAch.has(id)) return;
  if (progress <= prev && prev > 0) return;
  achProgress[id] = progress;
  if (progress >= 1) unlockedAch.add(id);
  try { await empire.unlockAchievement(id, clamp(progress, 0, 1)); } catch { /* ignore */ }
  if (progress >= 1) toast('Achievement unlocked', 'gold', 2.6);
}

function checkProgressAchievements() {
  unlock('century_player', counters.totalPlayed / 100);
  unlock('no_hint_master', counters.noHintWins / 25);
  unlock('last_thread', counters.lastGuessWins / 10);
  unlock('streak_seven', stats.daily.streak / 7);
}

// ===========================================================================
// TOASTS
// ===========================================================================

const toasts = [];

function toast(msg, kind = '', dur = 1.7) {
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  d.style.transition = 'opacity .28s ease, transform .28s ease';
  el.toastWrap.appendChild(d);
  toasts.push({ el: d, t: dur, fading: false });
  while (toasts.length > 4) {
    const old = toasts.shift();
    if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
  }
}

function updateToasts(dt) {
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i];
    t.t -= dt;
    if (t.t <= 0 && !t.fading) {
      t.fading = true;
      t.el.style.opacity = '0';
      t.el.style.transform = 'translateY(-8px)';
    }
    if (t.t <= -0.35) {
      if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
      toasts.splice(i, 1);
    }
  }
}

// ===========================================================================
// TIMER SCHEDULER (paused with the game)
// ===========================================================================

const timers = [];
function after(sec, fn) { timers.push({ t: sec, fn }); }
function clearTimers() { timers.length = 0; }
function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i];
    tm.t -= dt;
    if (tm.t <= 0) { timers.splice(i, 1); try { tm.fn(); } catch (e) { console.error(e); } }
  }
}

// ===========================================================================
// BOARD + KEYBOARD CONSTRUCTION
// ===========================================================================

function buildBoard(rows) {
  el.board.innerHTML = '';
  tileEls.length = 0;
  rowEls.length = 0;
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'brow';
    const cells = [];
    for (let c = 0; c < WORD_LEN; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      row.appendChild(t);
      cells.push(t);
    }
    el.board.appendChild(row);
    rowEls.push(row);
    tileEls.push(cells);
  }
  layoutBoard();
}

const KB_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['SPACER', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'SPACER'],
  ['ENTER', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACK'],
];

function buildKeyboard() {
  el.kbWrap.innerHTML = '';
  for (const row of KB_ROWS) {
    const r = document.createElement('div');
    r.className = 'krow';
    for (const k of row) {
      if (k === 'SPACER') {
        const sp = document.createElement('div');
        sp.className = 'kspacer';
        r.appendChild(sp);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'key' + (k === 'ENTER' || k === 'BACK' ? ' wide' : '');
      b.textContent = k === 'BACK' ? '⌫' : k === 'ENTER' ? 'ENTER' : k;
      b.dataset.k = k;
      b.type = 'button';
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        Audio.resume();
        handleKey(k);
        b.blur();
      });
      r.appendChild(b);
      keyEls[k] = b;
    }
    el.kbWrap.appendChild(r);
  }
}

function layoutBoard() {
  const wrap = el.boardWrap;
  if (!wrap || !rowEls.length) return;
  const gap = 6;
  const availW = Math.max(140, wrap.clientWidth - 12);
  const hintH = el.hintBar && !el.hintBar.classList.contains('hidden') ? 30 : 0;
  const availH = Math.max(140, wrap.clientHeight - 10 - hintH);
  const rows = rowEls.length;
  const byW = (availW - gap * (WORD_LEN - 1)) / WORD_LEN;
  const byH = (availH - gap * (rows - 1)) / rows;
  const size = clamp(Math.floor(Math.min(byW, byH)), 30, 72);
  el.board.style.setProperty('--tile', size + 'px');
}

function resizeAll() {
  const r = el.playRoot.getBoundingClientRect();
  FX.resize(r.width, r.height);
  layoutBoard();
}

// ===========================================================================
// GUESS EVALUATION
// ===========================================================================

function evaluate(guess, answer) {
  const res = new Array(WORD_LEN).fill('absent');
  const counts = {};
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (res[i] === 'correct') continue;
    const c = guess[i];
    if (counts[c] > 0) { res[i] = 'present'; counts[c] -= 1; }
  }
  return res;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

/** Returns null when the guess is legal, or an explanation string. */
function hardModeViolation(guess) {
  const fixed = new Array(WORD_LEN).fill(null);
  const minCount = {};
  for (const g of S.guesses) {
    const per = {};
    for (let i = 0; i < WORD_LEN; i++) {
      const st = g.result[i];
      const ch = g.word[i];
      if (st === 'correct') fixed[i] = ch;
      if (st === 'correct' || st === 'present') per[ch] = (per[ch] || 0) + 1;
    }
    for (const k in per) minCount[k] = Math.max(minCount[k] || 0, per[k]);
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (fixed[i] && guess[i] !== fixed[i]) {
      return `${ORDINAL[i]} letter must be ${fixed[i].toUpperCase()}`;
    }
  }
  const have = {};
  for (const ch of guess) have[ch] = (have[ch] || 0) + 1;
  for (const k in minCount) {
    if ((have[k] || 0) < minCount[k]) {
      return minCount[k] > 1
        ? `Guess must contain ${minCount[k]} ${k.toUpperCase()}s`
        : `Guess must contain ${k.toUpperCase()}`;
    }
  }
  return null;
}

// ===========================================================================
// RENDERING THE CURRENT PUZZLE
// ===========================================================================

function paintRow(r) {
  const g = S.guesses[r];
  const cells = tileEls[r];
  if (!cells) return;
  if (g) {
    for (let i = 0; i < WORD_LEN; i++) {
      cells[i].textContent = g.word[i];
      cells[i].className = 'tile ' + g.result[i];
    }
    return;
  }
  const isCurrent = r === S.guesses.length;
  for (let i = 0; i < WORD_LEN; i++) {
    const ch = isCurrent ? (S.current[i] || '') : '';
    cells[i].textContent = ch;
    cells[i].className = 'tile' + (ch ? ' filled' : '');
  }
}

function paintBoard() {
  for (let r = 0; r < rowEls.length; r++) paintRow(r);
}

function refreshKeyboard() {
  for (const k in keyEls) {
    if (k === 'ENTER' || k === 'BACK') continue;
    const st = kbState[k];
    keyEls[k].className = 'key' + (st ? ' ' + st : '');
  }
}

function updateKbState(word, result) {
  const rank = { absent: 1, present: 2, correct: 3 };
  for (let i = 0; i < WORD_LEN; i++) {
    const c = word[i];
    const st = result[i];
    if (!kbState[c] || rank[st] > rank[kbState[c]]) kbState[c] = st;
  }
  refreshKeyboard();
}

function renderHintBar() {
  if (!el.hintBar) return;
  if (!S.hintReveals.length) {
    el.hintBar.classList.add('hidden');
    el.hintBar.textContent = '';
    layoutBoard();
    return;
  }
  const slots = ['·', '·', '·', '·', '·'];
  for (const h of S.hintReveals) slots[h.pos] = h.letter.toUpperCase();
  el.hintBar.textContent = 'HINT  ' + slots.join(' ');
  el.hintBar.classList.remove('hidden');
  layoutBoard();
}

function updateHud() {
  const modeName = S.mode === 'daily' ? 'DAILY' : S.mode === 'gauntlet' ? 'GAUNTLET' : S.mode === 'unlimited' ? 'UNLIMITED' : '—';
  el.hudMode.innerHTML = `MODE <b>${modeName}</b>${S.hardLocked ? ' <b style="color:var(--gold)">·HARD</b>' : ''}`;

  if (S.mode === 'gauntlet') {
    el.hudStage.classList.remove('hidden');
    el.hudStage.innerHTML = `STAGE <b>${S.gauntlet.stage}/8</b> · SCORE <b>${S.gauntlet.score}</b>`;
  } else {
    el.hudStage.classList.add('hidden');
  }

  const left = S.rows - S.guesses.length;
  el.hudGuesses.innerHTML = `GUESSES <b>${Math.max(0, left)}</b>`;
  el.hudGuesses.classList.toggle('warn', left <= 1 && !S.finished);

  el.hudTimer.textContent = fmtTime(S.elapsed);

  if (S.mode === 'gauntlet') {
    el.hudStreak.innerHTML = `LIVES <b>${'♥'.repeat(Math.max(0, S.gauntlet.lives)) || '—'}</b>`;
  } else if (S.mode === 'daily') {
    el.hudStreak.innerHTML = `STREAK <b>${stats.daily.streak}</b>`;
  } else {
    el.hudStreak.innerHTML = `STREAK <b>${stats.unlimited.streak}</b>`;
  }

  const canHint = S.screen === 'playing' && !S.finished && !S.revealing && S.hintsLeft > 0 && S.mode !== 'daily';
  el.btnHint.disabled = !canHint;
  el.btnHint.textContent = S.mode === 'daily' ? 'NO HINTS' : `HINT (${S.hintsLeft})`;
}

// ===========================================================================
// PUZZLE LIFECYCLE
// ===========================================================================

function resetPuzzleState(rows) {
  S.rows = rows;
  S.guesses = [];
  S.current = '';
  S.finished = false;
  S.won = false;
  S.revealing = false;
  S.elapsed = 0;
  S.hintsUsedThisPuzzle = 0;
  S.hintReveals = [];
  S.hardLocked = settings.hardMode;
  for (const k in kbState) delete kbState[k];
  clearTimers();
  buildBoard(rows);
  refreshKeyboard();
  renderHintBar();
}

function startDaily() {
  const key = dateKey();
  if (dailyRecord.date !== key) {
    dailyRecord.date = key;
    dailyRecord.answer = dailyWordFor(key);
    dailyRecord.guesses = [];
    dailyRecord.done = false;
    dailyRecord.won = false;
    dailyRecord.hintless = true;
  }
  S.mode = 'daily';
  S.gauntlet.active = false;
  resetPuzzleState(MAX_ROWS);
  S.answer = dailyRecord.answer;
  S.hintsLeft = 0;

  // Replay any guesses already made today
  for (const w of dailyRecord.guesses) {
    if (typeof w !== 'string' || w.length !== WORD_LEN) continue;
    const result = evaluate(w, S.answer);
    S.guesses.push({ word: w, result });
    updateKbState(w, result);
  }
  paintBoard();

  enterPlaying();
  if (dailyRecord.done) {
    S.finished = true;
    S.won = dailyRecord.won;
    showResult(dailyRecord.won, true);
  } else if (S.guesses.length) {
    toast('Resumed today\'s weave', '', 1.8);
  }
}

function startUnlimited() {
  S.mode = 'unlimited';
  S.gauntlet.active = false;
  resetPuzzleState(MAX_ROWS);
  S.answer = randomFrom(COMMON_ANSWERS);
  S.hintsLeft = 1;
  paintBoard();
  enterPlaying();
}

function gauntletRowsFor(stage) { return stage <= 3 ? 6 : stage <= 6 ? 5 : 4; }

function startGauntletRun() {
  S.gauntlet.stage = 1;
  S.gauntlet.lives = 3;
  S.gauntlet.score = 0;
  S.gauntlet.hints = 3;
  S.gauntlet.active = true;
  S.gauntlet.cleared = false;
  stats.gauntlet.runs += 1;
  queueSave('Gauntlet run');
  startGauntletStage();
}

function startGauntletStage() {
  S.mode = 'gauntlet';
  const stage = S.gauntlet.stage;
  resetPuzzleState(gauntletRowsFor(stage));
  const band = GAUNTLET_BANDS[clamp(stage - 1, 0, GAUNTLET_BANDS.length - 1)];
  S.answer = randomFrom(band);
  S.hintsLeft = S.gauntlet.hints;
  paintBoard();
  enterPlaying();
  toast(`Stage ${stage} · ${S.rows} guesses`, '', 1.9);
}

function enterPlaying() {
  S.screen = 'playing';
  S.paused = false;
  hideAllOverlays();
  S.startTime = performance.now();
  updateHud();
  requestAnimationFrame(resizeAll);
}

// ===========================================================================
// INPUT
// ===========================================================================

function handleKey(k) {
  if (S.screen !== 'playing' || S.paused || S.finished || S.revealing) return;
  if (k === 'ENTER') { submitGuess(); return; }
  if (k === 'BACK') {
    if (!S.current.length) return;
    S.current = S.current.slice(0, -1);
    Audio.del();
    paintRow(S.guesses.length);
    return;
  }
  if (!/^[a-z]$/.test(k)) return;
  if (S.current.length >= WORD_LEN) return;
  S.current += k;
  Audio.key();
  paintRow(S.guesses.length);
}

function flashKey(k) {
  const b = keyEls[k];
  if (!b) return;
  b.classList.add('press');
  setTimeout(() => b.classList.remove('press'), 90);
}

function shakeCurrentRow(msg) {
  const row = rowEls[S.guesses.length];
  if (row) {
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    setTimeout(() => row && row.classList.remove('shake'), 460);
  }
  FX.kick(6);
  Audio.invalid();
  if (msg) toast(msg, 'bad', 1.9);
}

function submitGuess() {
  if (S.current.length < WORD_LEN) { shakeCurrentRow('Not enough letters'); return; }
  const guess = S.current;
  if (!VALID_GUESSES.has(guess)) { shakeCurrentRow('Not in the word list'); return; }
  if (S.hardLocked) {
    const v = hardModeViolation(guess);
    if (v) { shakeCurrentRow('Hard Mode: ' + v); return; }
  }

  const result = evaluate(guess, S.answer);
  const rowIdx = S.guesses.length;
  S.guesses.push({ word: guess, result });
  S.current = '';
  S.revealing = true;

  if (S.mode === 'daily') {
    dailyRecord.guesses = S.guesses.map((g) => g.word);
    queueSave('Daily in progress');
  }

  const cells = tileEls[rowIdx];
  const step = settings.reduceMotion ? 0.02 : 0.22;
  for (let i = 0; i < WORD_LEN; i++) {
    const t = cells[i];
    t.textContent = guess[i];
    after(i * step, () => {
      if (!settings.reduceMotion) {
        t.classList.remove('flip');
        void t.offsetWidth;
        t.classList.add('flip');
      }
      after(settings.reduceMotion ? 0 : 0.24, () => {
        t.className = 'tile ' + result[i] + (settings.reduceMotion ? '' : ' flip');
        Audio.flip(result[i], i);
      });
    });
  }

  after(WORD_LEN * step + (settings.reduceMotion ? 0.05 : 0.3), () => {
    S.revealing = false;
    updateKbState(guess, result);
    const solved = result.every((r) => r === 'correct');
    if (solved) finishPuzzle(true);
    else if (S.guesses.length >= S.rows) finishPuzzle(false);
    else {
      updateHud();
      const left = S.rows - S.guesses.length;
      if (left === 1) toast('Last thread!', 'bad', 1.6);
      else if (result.filter((r) => r === 'correct').length >= 4) toast('So close', 'good', 1.2);
    }
  });

  updateHud();
}

function useHint() {
  if (S.screen !== 'playing' || S.paused || S.finished || S.revealing) return;
  if (S.mode === 'daily') { toast('Hints are disabled in the Daily', 'bad'); return; }
  if (S.hintsLeft <= 0) { toast('No hints left', 'bad'); return; }

  // Positions the player has not already nailed down
  const known = new Set(S.hintReveals.map((h) => h.pos));
  for (const g of S.guesses) {
    for (let i = 0; i < WORD_LEN; i++) if (g.result[i] === 'correct') known.add(i);
  }
  const options = [];
  for (let i = 0; i < WORD_LEN; i++) if (!known.has(i)) options.push(i);
  if (!options.length) { toast('Every letter is already placed', 'bad'); return; }

  const pos = options[Math.floor(Math.random() * options.length)];
  const letter = S.answer[pos];
  S.hintReveals.push({ pos, letter });
  S.hintsLeft -= 1;
  S.hintsUsedThisPuzzle += 1;
  if (S.mode === 'gauntlet') S.gauntlet.hints = S.hintsLeft;
  if (S.mode === 'daily') dailyRecord.hintless = false;

  if (!kbState[letter] || kbState[letter] === 'absent') { kbState[letter] = 'present'; refreshKeyboard(); }

  renderHintBar();
  Audio.hint();
  const r = el.playRoot.getBoundingClientRect();
  FX.sparkle(r.width / 2, r.height * 0.32, 30, 46);
  toast(`The ${ORDINAL[pos]} letter is ${letter.toUpperCase()}`, 'gold', 2.4);
  updateHud();
}

// ===========================================================================
// FINISHING A PUZZLE
// ===========================================================================

function modeStatsKey() { return S.mode === 'gauntlet' ? 'gauntlet' : S.mode; }

function recordResult(won) {
  const key = modeStatsKey();
  const st = stats[key];
  st.played += 1;
  counters.totalPlayed += 1;

  if (won) {
    st.wins += 1;
    const n = clamp(S.guesses.length, 1, 6);
    st.dist[n - 1] += 1;
    st.streak += 1;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
  } else {
    st.streak = 0;
  }

  if (S.mode === 'daily') {
    const today = dateKey();
    st.lastDate = today;
    if (won) {
      const prev = st.lastSolvedDate;
      const gapOk = prev ? dayIndex(today) - dayIndex(prev) === 1 : false;
      st.streak = prev === today ? st.streak : (gapOk ? Math.max(1, st.streak) : 1);
      st.maxStreak = Math.max(st.maxStreak, st.streak);
      st.lastSolvedDate = today;
    }
    dailyRecord.done = true;
    dailyRecord.won = won;
    dailyRecord.guesses = S.guesses.map((g) => g.word);
  }

  if (won) {
    if (S.hintsUsedThisPuzzle === 0) counters.noHintWins += 1;
    if (S.guesses.length === S.rows) counters.lastGuessWins += 1;
  }
}

function stageScore() {
  const g = S.gauntlet;
  const left = S.rows - S.guesses.length;
  const timeBonus = Math.max(0, Math.round((90 - S.elapsed) * 3));
  const hintPenalty = S.hintsUsedThisPuzzle * 90;
  return Math.max(50, 200 * g.stage + left * 130 + timeBonus - hintPenalty);
}

function finishPuzzle(won) {
  S.finished = true;
  S.won = won;
  recordResult(won);

  const r = el.playRoot.getBoundingClientRect();
  if (won) {
    Audio.win();
    FX.confetti(r.width / 2, r.height * 0.4, settings.reduceMotion ? 0 : 120);
    if (!settings.reduceMotion) {
      const cells = tileEls[S.guesses.length - 1];
      cells.forEach((t, i) => after(i * 0.09, () => { t.classList.add('win'); }));
    }
  } else {
    Audio.lose();
    FX.dust(r.width / 2, r.height * 0.7);
    FX.kick(9);
  }

  if (S.mode === 'gauntlet') {
    const g = S.gauntlet;
    if (won) {
      const sc = stageScore();
      g.score += sc;
      stats.gauntlet.bestStage = Math.max(stats.gauntlet.bestStage, g.stage);
      toast(`+${sc} points`, 'gold', 2.2);
      if (g.stage >= 8) {
        g.cleared = true;
        g.score += 1500;
        stats.gauntlet.clears += 1;
        stats.gauntlet.bestStage = 8;
        unlock('gauntlet_clear', 1);
        Audio.stage();
      }
    } else {
      g.lives -= 1;
    }
    stats.gauntlet.bestScore = Math.max(stats.gauntlet.bestScore, g.score);
  }

  if (won) {
    unlock('first_weave', 1);
    if (S.mode === 'daily') unlock('daily_solved', 1);
    if (S.guesses.length <= 2) unlock('eagle_eye', 1);
    if (S.guesses.length === 1) unlock('perfect_open', 1);
    if (S.hardLocked) unlock('hard_mode_win', 1);
  }
  checkProgressAchievements();

  queueSave(won ? 'Puzzle solved' : 'Puzzle lost');
  if (empire) { try { empire.setContinuePoint('auto', S.mode === 'daily' ? 'Daily Weave' : 'Word Weaver'); } catch { /* ignore */ } }

  after(settings.reduceMotion ? 0.25 : 1.35, () => showResult(won, false));
  updateHud();
}

// ===========================================================================
// RESULT SCREEN
// ===========================================================================

let resultPrimary = null;

function miniGrid() {
  el.resGrid.innerHTML = '';
  for (const g of S.guesses) {
    const row = document.createElement('div');
    row.className = 'mini-row';
    for (const st of g.result) {
      const m = document.createElement('div');
      m.className = 'mini ' + (st === 'absent' ? '' : st);
      row.appendChild(m);
    }
    el.resGrid.appendChild(row);
  }
}

function kvLine(label, value) {
  return `<div class="kv"><span>${label}</span><span>${value}</span></div>`;
}

function showResult(won, replay) {
  S.screen = 'result';
  hideAllOverlays();
  el.resultPanel.classList.remove('hidden');

  el.resWord.textContent = S.answer;
  miniGrid();

  const st = stats[modeStatsKey()];
  const winPct = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  let lines = '';

  if (S.mode === 'gauntlet') {
    const g = S.gauntlet;
    if (g.cleared) {
      el.resTitle.textContent = 'GAUNTLET WOVEN';
      el.resSub.textContent = `ALL EIGHT STAGES CLEARED · ${g.score} POINTS`;
      resultPrimary = { label: 'NEW GAUNTLET RUN', fn: startGauntletRun };
    } else if (won) {
      el.resTitle.textContent = `STAGE ${g.stage} CLEARED`;
      el.resSub.textContent = `SOLVED IN ${S.guesses.length} ${S.guesses.length === 1 ? 'GUESS' : 'GUESSES'}`;
      resultPrimary = {
        label: `NEXT STAGE (${g.stage + 1}/8)`,
        fn: () => { g.stage += 1; startGauntletStage(); },
      };
    } else if (g.lives > 0) {
      el.resTitle.textContent = 'STAGE FAILED';
      el.resSub.textContent = `${g.lives} ${g.lives === 1 ? 'LIFE' : 'LIVES'} REMAINING`;
      resultPrimary = { label: 'RETRY STAGE', fn: startGauntletStage };
    } else {
      el.resTitle.textContent = 'RUN OVER';
      el.resSub.textContent = `REACHED STAGE ${g.stage} · ${g.score} POINTS`;
      resultPrimary = { label: 'NEW GAUNTLET RUN', fn: startGauntletRun };
    }
    lines += kvLine('Run score', g.score);
    lines += kvLine('Stage reached', `${g.stage} / 8`);
    lines += kvLine('Best score', stats.gauntlet.bestScore);
    lines += kvLine('Hints left', S.hintsLeft);
  } else if (S.mode === 'daily') {
    if (replay) {
      el.resTitle.textContent = won ? 'ALREADY WOVEN' : 'DAILY COMPLETE';
      el.resSub.textContent = won
        ? `TODAY'S WEAVE TOOK ${S.guesses.length} ${S.guesses.length === 1 ? 'GUESS' : 'GUESSES'}`
        : 'TODAY\'S WEAVE GOT AWAY';
    } else {
      el.resTitle.textContent = won ? 'WOVEN' : 'UNRAVELLED';
      el.resSub.textContent = won
        ? `DAILY SOLVED IN ${S.guesses.length} ${S.guesses.length === 1 ? 'GUESS' : 'GUESSES'}`
        : 'BETTER LUCK TOMORROW';
    }
    resultPrimary = { label: 'PLAY UNLIMITED', fn: startUnlimited };
    lines += kvLine('Daily streak', stats.daily.streak);
    lines += kvLine('Best streak', stats.daily.maxStreak);
    lines += kvLine('Daily win rate', winPct + '%');
    lines += kvLine('Next puzzle', 'tomorrow, local midnight');
  } else {
    el.resTitle.textContent = won ? 'WOVEN' : 'UNRAVELLED';
    el.resSub.textContent = won
      ? `SOLVED IN ${S.guesses.length} ${S.guesses.length === 1 ? 'GUESS' : 'GUESSES'} · ${fmtTime(S.elapsed)}`
      : 'OUT OF THREADS';
    resultPrimary = { label: 'NEXT PUZZLE', fn: startUnlimited };
    lines += kvLine('Win streak', st.streak);
    lines += kvLine('Best streak', st.maxStreak);
    lines += kvLine('Win rate', `${winPct}% of ${st.played}`);
    lines += kvLine('Time', fmtTime(S.elapsed));
  }

  el.resStatsLine.innerHTML = lines;
  el.btnResultNext.textContent = resultPrimary.label;
  updateHud();
}

// ===========================================================================
// STATS PANEL
// ===========================================================================

let statsTab = 'daily';

function renderStats() {
  const st = stats[statsTab];
  const winPct = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  el.stPlayed.textContent = st.played;
  el.stWinPct.textContent = winPct;
  el.stStreak.textContent = st.streak;
  el.stMax.textContent = st.maxStreak;

  const max = Math.max(1, ...st.dist);
  const highlight = (S.screen !== 'menu' && S.won && modeStatsKey() === statsTab) ? S.guesses.length : -1;
  let html = '';
  for (let i = 0; i < 6; i++) {
    const n = st.dist[i] || 0;
    const pct = Math.max(6, Math.round((n / max) * 100));
    html += `<div class="distrow"><div class="lbl">${i + 1}</div>` +
            `<div class="barbg"><div class="bar${highlight === i + 1 ? ' hi' : ''}" style="width:${n ? pct : 6}%">${n}</div></div></div>`;
  }
  el.distRows.innerHTML = html;

  let extra = '';
  if (statsTab === 'daily') {
    extra += kvLine('Today', dailyRecord.done ? (dailyRecord.won ? `solved in ${dailyRecord.guesses.length}` : 'not solved') : 'not finished');
    extra += kvLine('Last daily played', st.lastDate || '—');
    extra += kvLine('Last daily solved', st.lastSolvedDate || '—');
    extra += kvLine('Total solved', st.wins);
  } else if (statsTab === 'unlimited') {
    const total = st.dist.reduce((a, b) => a + b, 0);
    const sum = st.dist.reduce((a, b, i) => a + b * (i + 1), 0);
    extra += kvLine('Average guesses (wins)', total ? (sum / total).toFixed(2) : '—');
    extra += kvLine('Fastest solve', total ? `${st.dist.findIndex((v) => v > 0) + 1} guesses` : '—');
    extra += kvLine('Losses', st.played - st.wins);
  } else {
    extra += kvLine('Runs started', st.runs);
    extra += kvLine('Full clears', st.clears);
    extra += kvLine('Best stage reached', st.bestStage || '—');
    extra += kvLine('Best run score', st.bestScore || 0);
  }
  extra += kvLine('Total puzzles (all modes)', counters.totalPlayed);
  extra += kvLine('Hint-free wins', counters.noHintWins);
  el.extraStats.innerHTML = extra;

  for (const t of [el.tabDaily, el.tabUnlimited, el.tabGauntlet]) { /* set below */ }
  $('tabDaily').classList.toggle('active', statsTab === 'daily');
  $('tabUnlimited').classList.toggle('active', statsTab === 'unlimited');
  $('tabGauntlet').classList.toggle('active', statsTab === 'gauntlet');
  el.statsSub.textContent = statsTab === 'daily' ? 'DAILY WEAVE RECORD'
    : statsTab === 'unlimited' ? 'UNLIMITED RECORD' : 'GAUNTLET RECORD';
}

// ===========================================================================
// OVERLAY MANAGEMENT
// ===========================================================================

const OVERLAYS = ['menuScreen', 'howToPanel', 'statsPanel', 'settingsPanel', 'pausePanel', 'resultPanel'];

function hideAllOverlays() {
  for (const id of OVERLAYS) { const n = $(id); if (n) n.classList.add('hidden'); }
}

function anyOverlayOpen() {
  return OVERLAYS.some((id) => { const n = $(id); return n && !n.classList.contains('hidden'); });
}

function openPanel(id) {
  const n = $(id);
  if (n) n.classList.remove('hidden');
}

function closePanel(id) {
  const n = $(id);
  if (n) n.classList.add('hidden');
}

let panelReturn = null;   // where to go back to when a sub-panel closes

function showMenu() {
  S.screen = 'menu';
  S.paused = false;
  hideAllOverlays();
  openPanel('menuScreen');
  refreshMenu();
  updateHud();
}

function refreshMenu() {
  const key = dateKey();
  const doneToday = dailyRecord.date === key && dailyRecord.done;
  if (doneToday) {
    el.menuBadge.classList.remove('hidden');
    el.menuBadge.textContent = dailyRecord.won ? 'SOLVED' : 'DONE';
    el.dailyStatus.textContent = dailyRecord.won
      ? `Solved in ${dailyRecord.guesses.length}. Streak ${stats.daily.streak}. Tap to review.`
      : 'Today\'s weave is finished. Tap to review the answer.';
  } else if (dailyRecord.date === key && dailyRecord.guesses.length) {
    el.menuBadge.classList.remove('hidden');
    el.menuBadge.textContent = 'IN PROGRESS';
    el.dailyStatus.textContent = `${MAX_ROWS - dailyRecord.guesses.length} guesses left on today's weave.`;
  } else {
    el.menuBadge.classList.add('hidden');
    el.dailyStatus.textContent = `One seeded puzzle for everyone, every day. Streak ${stats.daily.streak}.`;
  }
  el.gauntletSub.textContent = stats.gauntlet.bestScore
    ? `Eight stages, rising difficulty, three lives. Best ${stats.gauntlet.bestScore}.`
    : 'Eight stages, rising difficulty, three lives.';
  el.menuFoot.innerHTML = `Hard Mode: <b style="color:${settings.hardMode ? 'var(--gold)' : 'var(--ink-faint)'}">${settings.hardMode ? 'ON' : 'off'}</b>`
    + ` &middot; ${ANSWER_POOL.length} answers &middot; ${VALID_GUESSES.size} accepted guesses &middot; fully offline`;
}

function doPause(fromHub) {
  if (S.screen !== 'playing' || S.finished) return;
  if (S.paused) return;
  S.paused = true;
  el.pauseSub.textContent = fromHub ? 'PAUSED BY THE HUB' : 'THE LOOM IS STILL';
  el.btnRestart.textContent = S.mode === 'gauntlet' ? 'RESTART GAUNTLET RUN'
    : S.mode === 'daily' ? 'RESTART TODAY\'S WEAVE' : 'NEW RANDOM PUZZLE';
  openPanel('pausePanel');
  Audio.ui();
}

function doResume() {
  if (!S.paused) return;
  S.paused = false;
  closePanel('pausePanel');
  closePanel('settingsPanel');
  closePanel('statsPanel');
  closePanel('howToPanel');
  Audio.ui();
  updateHud();
}

function togglePause() {
  if (S.screen !== 'playing') return;
  if (S.paused) doResume(); else doPause(false);
}

function restartCurrent() {
  if (S.mode === 'gauntlet') { startGauntletRun(); return; }
  if (S.mode === 'daily') {
    if (dailyRecord.done) { toast('Today\'s weave is already finished', 'bad'); return; }
    dailyRecord.guesses = [];
    startDaily();
    toast('Daily board reset', '', 1.6);
    queueSave('Daily reset');
    return;
  }
  startUnlimited();
}

// ===========================================================================
// SETTINGS PLUMBING
// ===========================================================================

function applySettings() {
  const root = document.documentElement;
  root.classList.toggle('cb', !!settings.colorBlind);
  root.classList.toggle('no-motion', !!settings.reduceMotion);
  root.classList.toggle('motion-ok', !settings.reduceMotion);
  Audio.enabled = !!settings.sound;
  Audio.setVolume(settings.volume);
  el.optHard.checked = !!settings.hardMode;
  el.optColorBlind.checked = !!settings.colorBlind;
  el.optSound.checked = !!settings.sound;
  el.optMotion.checked = !!settings.reduceMotion;
  el.volSlider.value = String(settings.volume);
  el.volVal.textContent = Math.round(settings.volume * 100) + '%';
}

// ===========================================================================
// MAIN LOOP
// ===========================================================================

let rafId = 0;
let lastTs = 0;
let acc = 0;
const STEP = 1 / 60;

function update(dt) {
  updateTimers(dt);
  updateToasts(dt);
  FX.update(dt);

  const playingNow = S.screen === 'playing' && !S.paused && !S.finished;
  if (playingNow) {
    S.elapsed += dt;
    el.hudTimer.textContent = fmtTime(S.elapsed);
  }
  if (!S.paused) {
    playtimeAccum += dt;
    playtimeSinceReport += dt;
    if (playtimeSinceReport >= 30) {
      const secs = Math.floor(playtimeSinceReport);
      playtimeSinceReport -= secs;
      if (empire) { try { empire.reportPlaytime(secs); } catch { /* ignore */ } }
      queueSave('Autosave');
    }
  }
}

function render() {
  if (FX.shake > 0) {
    const m = FX.shakeMag * (FX.shake / 0.32);
    el.board.style.transform = `translate(${(Math.random() - 0.5) * m}px, ${(Math.random() - 0.5) * m}px)`;
  } else if (el.board.style.transform) {
    el.board.style.transform = '';
  }
  FX.render();
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (!isFinite(dt) || dt < 0) dt = 0;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) { update(STEP); acc -= STEP; }
  if (guard >= 8) acc = 0;
  render();
}

function startLoop() {
  if (rafId) return;
  lastTs = performance.now();
  acc = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

// ===========================================================================
// EVENT WIRING
// ===========================================================================

function wireEvents() {
  // --- menu ---
  el.btnDaily.addEventListener('click', () => { Audio.resume(); Audio.ui(); startDaily(); });
  el.btnUnlimited.addEventListener('click', () => { Audio.resume(); Audio.ui(); startUnlimited(); });
  el.btnGauntlet.addEventListener('click', () => { Audio.resume(); Audio.ui(); startGauntletRun(); });
  el.btnHowTo.addEventListener('click', () => { panelReturn = 'menuScreen'; closePanel('menuScreen'); openPanel('howToPanel'); Audio.ui(); });
  el.btnStats.addEventListener('click', () => { panelReturn = 'menuScreen'; closePanel('menuScreen'); statsTab = 'daily'; renderStats(); openPanel('statsPanel'); Audio.ui(); });
  el.btnSettings.addEventListener('click', () => { panelReturn = 'menuScreen'; closePanel('menuScreen'); openPanel('settingsPanel'); Audio.ui(); });

  // --- how-to ---
  const closeHow = () => { closePanel('howToPanel'); if (panelReturn) openPanel(panelReturn); Audio.ui(); };
  el.howToClose.addEventListener('click', closeHow);
  el.howToDone.addEventListener('click', closeHow);

  // --- stats ---
  const closeStats = () => { closePanel('statsPanel'); if (panelReturn) openPanel(panelReturn); Audio.ui(); };
  el.statsClose.addEventListener('click', closeStats);
  el.statsDone.addEventListener('click', closeStats);
  for (const id of ['tabDaily', 'tabUnlimited', 'tabGauntlet']) {
    $(id).addEventListener('click', () => { statsTab = $(id).dataset.tab; renderStats(); Audio.ui(); });
  }

  // --- settings ---
  const closeSettings = () => { closePanel('settingsPanel'); if (panelReturn) openPanel(panelReturn); Audio.ui(); };
  el.settingsClose.addEventListener('click', closeSettings);
  el.settingsDone.addEventListener('click', closeSettings);
  el.optHard.addEventListener('change', () => {
    settings.hardMode = el.optHard.checked;
    if (S.screen === 'playing' && S.guesses.length > 0 && settings.hardMode !== S.hardLocked) {
      toast('Hard Mode applies from the next puzzle', '', 2.2);
    } else {
      S.hardLocked = settings.hardMode;
    }
    applySettings(); refreshMenu(); updateHud(); queueSave('Settings');
  });
  el.optColorBlind.addEventListener('change', () => { settings.colorBlind = el.optColorBlind.checked; applySettings(); queueSave('Settings'); });
  el.optSound.addEventListener('change', () => { settings.sound = el.optSound.checked; applySettings(); if (settings.sound) { Audio.resume(); Audio.ui(); } queueSave('Settings'); });
  el.optMotion.addEventListener('change', () => { settings.reduceMotion = el.optMotion.checked; applySettings(); queueSave('Settings'); });
  el.volSlider.addEventListener('input', () => {
    settings.volume = parseFloat(el.volSlider.value);
    el.volVal.textContent = Math.round(settings.volume * 100) + '%';
    Audio.setVolume(settings.volume);
  });
  el.volSlider.addEventListener('change', () => { Audio.resume(); Audio.ui(); queueSave('Settings'); });

  let resetArmed = false;
  el.btnResetStats.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      el.btnResetStats.textContent = 'PRESS AGAIN TO CONFIRM';
      setTimeout(() => { resetArmed = false; el.btnResetStats.textContent = 'RESET ALL STATISTICS'; }, 4000);
      return;
    }
    resetArmed = false;
    el.btnResetStats.textContent = 'RESET ALL STATISTICS';
    Object.assign(stats.daily, blankModeStats(), { lastDate: null, lastSolvedDate: null });
    Object.assign(stats.unlimited, blankModeStats());
    Object.assign(stats.gauntlet, blankModeStats(), { runs: 0, clears: 0, bestStage: 0, bestScore: 0 });
    counters.totalPlayed = 0; counters.noHintWins = 0; counters.lastGuessWins = 0;
    renderStats(); refreshMenu();
    toast('Statistics cleared', '', 2);
    queueSave('Stats reset');
  });

  // --- pause ---
  el.btnResume.addEventListener('click', doResume);
  el.btnRestart.addEventListener('click', () => { closePanel('pausePanel'); S.paused = false; restartCurrent(); });
  el.btnPauseHowTo.addEventListener('click', () => { panelReturn = 'pausePanel'; closePanel('pausePanel'); openPanel('howToPanel'); });
  el.btnPauseStats.addEventListener('click', () => {
    panelReturn = 'pausePanel'; closePanel('pausePanel');
    statsTab = modeStatsKey() || 'daily'; renderStats(); openPanel('statsPanel');
  });
  el.btnPauseSettings.addEventListener('click', () => { panelReturn = 'pausePanel'; closePanel('pausePanel'); openPanel('settingsPanel'); });
  el.btnQuit.addEventListener('click', () => { S.paused = false; S.gauntlet.active = false; showMenu(); });

  // --- result ---
  el.btnResultNext.addEventListener('click', () => { if (resultPrimary) { Audio.ui(); resultPrimary.fn(); } });
  el.btnResultStats.addEventListener('click', () => {
    panelReturn = 'resultPanel'; closePanel('resultPanel');
    statsTab = modeStatsKey() || 'daily'; renderStats(); openPanel('statsPanel');
  });
  el.btnResultMenu.addEventListener('click', () => { S.gauntlet.active = false; showMenu(); });

  // --- hud ---
  el.btnHint.addEventListener('click', () => { Audio.resume(); useHint(); });
  el.btnPause.addEventListener('click', () => { if (S.screen === 'playing') togglePause(); else showMenu(); });
  el.btnHudHow.addEventListener('click', () => {
    if (S.screen === 'playing' && !S.paused && !S.finished) doPause(false);
    panelReturn = S.screen === 'playing' ? 'pausePanel' : 'menuScreen';
    closePanel('pausePanel');
    openPanel('howToPanel');
  });
  el.btnHudStats.addEventListener('click', () => {
    if (S.screen === 'playing' && !S.paused && !S.finished) doPause(false);
    panelReturn = S.screen === 'playing' ? 'pausePanel' : (S.screen === 'result' ? 'resultPanel' : 'menuScreen');
    closePanel('pausePanel'); closePanel('resultPanel');
    statsTab = modeStatsKey() || 'daily';
    renderStats(); openPanel('statsPanel');
  });

  // --- physical keyboard ---
  window.addEventListener('keydown', onKeyDown);

  // --- viewport ---
  window.addEventListener('resize', resizeAll);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resizeAll());
    ro.observe(el.playRoot);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop();
      flushPlaytime();
      if (S.screen === 'playing' && !S.finished) doPause(false);
    } else {
      startLoop();
    }
  });
  window.addEventListener('pagehide', flushPlaytime);
  window.addEventListener('beforeunload', flushPlaytime);
  window.addEventListener('pointerdown', () => Audio.resume(), { once: true });
}

function flushPlaytime() {
  if (!empire) return;
  const secs = Math.floor(playtimeSinceReport);
  if (secs > 0) {
    playtimeSinceReport -= secs;
    try { empire.reportPlaytime(secs); } catch { /* ignore */ }
  }
  doSave('Exit autosave');
}

function topOverlay() {
  for (const id of ['howToPanel', 'settingsPanel', 'statsPanel', 'resultPanel', 'pausePanel', 'menuScreen']) {
    const n = $(id);
    if (n && !n.classList.contains('hidden')) return id;
  }
  return null;
}

function onKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const top = topOverlay();

  if (k === 'Escape') {
    e.preventDefault();
    if (top === 'howToPanel') { closePanel('howToPanel'); if (panelReturn) openPanel(panelReturn); return; }
    if (top === 'settingsPanel') { closePanel('settingsPanel'); if (panelReturn) openPanel(panelReturn); return; }
    if (top === 'statsPanel') { closePanel('statsPanel'); if (panelReturn) openPanel(panelReturn); return; }
    if (top === 'pausePanel') { doResume(); return; }
    if (top === 'resultPanel') { showMenu(); return; }
    if (top === 'menuScreen') return;
    togglePause();
    return;
  }

  if (top === 'resultPanel') {
    if (k === 'Enter' && resultPrimary) { e.preventDefault(); resultPrimary.fn(); }
    return;
  }
  if (top === 'menuScreen') {
    if (k === 'Enter') { e.preventDefault(); startDaily(); }
    else if (k === '1') startDaily();
    else if (k === '2') startUnlimited();
    else if (k === '3') startGauntletRun();
    return;
  }
  if (top === 'pausePanel') {
    if (k === 'Enter' || k === 'p' || k === 'P') { e.preventDefault(); doResume(); }
    return;
  }
  if (top) return;   // some other panel is open — let it be

  if (k === 'p' || k === 'P') { e.preventDefault(); togglePause(); return; }
  if (k === 'r' || k === 'R') { e.preventDefault(); restartCurrent(); return; }
  if (k === ' ' || k === 'Spacebar') { e.preventDefault(); useHint(); return; }
  if (k === 'Enter') { e.preventDefault(); flashKey('ENTER'); handleKey('ENTER'); return; }
  if (k === 'Backspace') { e.preventDefault(); flashKey('BACK'); handleKey('BACK'); return; }
  if (/^[a-zA-Z]$/.test(k)) {
    const lk = k.toLowerCase();
    flashKey(lk);
    handleKey(lk);
  }
}

// ===========================================================================
// BOOT
// ===========================================================================

async function boot() {
  FX.init(el.fx);
  buildKeyboard();
  buildBoard(MAX_ROWS);
  wireEvents();

  empire = new EmpireClient({
    gameId: GAME_ID,
    saveVersion: SAVE_VERSION,
    onPause: () => doPause(true),
    onResume: () => doResume(),
  });

  try {
    await empire.connect();
  } catch { /* standalone fallback handled inside the SDK */ }

  try {
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) applyBlob(rec.blob);
  } catch { /* fresh save */ }

  try {
    const hubSettings = await empire.getSettings();
    if (hubSettings && typeof hubSettings === 'object') {
      if (typeof hubSettings.masterVolume === 'number') settings.volume = clamp(hubSettings.masterVolume, 0, 1);
      if (typeof hubSettings.sound === 'boolean') settings.sound = hubSettings.sound;
      if (typeof hubSettings.reduceMotion === 'boolean') settings.reduceMotion = hubSettings.reduceMotion;
    }
  } catch { /* optional */ }

  try {
    const profile = await empire.getProfile();
    if (profile && profile.name) {
      el.hudLogoName = profile.name;
      toast(`Welcome back, ${profile.name}`, '', 2.2);
    }
  } catch { /* optional */ }

  // roll the daily forward if the saved record is from a previous day
  const key = dateKey();
  if (dailyRecord.date && dailyRecord.date !== key) {
    dailyRecord.date = key;
    dailyRecord.answer = dailyWordFor(key);
    dailyRecord.guesses = [];
    dailyRecord.done = false;
    dailyRecord.won = false;
    dailyRecord.hintless = true;
  }

  applySettings();
  showMenu();
  resizeAll();
  startLoop();
  checkProgressAchievements();
  queueSave('Session start');
}

boot().catch((err) => {
  console.error('[word-weaver] boot failed', err);
  hideAllOverlays();
  openPanel('menuScreen');
  startLoop();
});
