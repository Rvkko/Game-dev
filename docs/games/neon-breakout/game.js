/* ============================================================================
   NEON BREAKOUT — canvas2d brick breaker
   30 hand-authored layouts · 6 power-ups · armoured/explosive bricks
   · a boss every 10th level · star-rated level select
   ============================================================================ */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'neon-breakout',statusKey:'__neonBreakoutAssetStatus',accent:0x47d3ff,getState:()=>({active:state==='playing',motion:Math.min(1,bricks?.length/40),danger:state==='over'?1:0})});
import { LEVELS, BOSSES, BRICK_BASE_SCORE, charToBrick, COLS } from './levels.js';

// ----------------------------------------------------------------------------
// Constants (all gameplay happens in a fixed 960x720 logical space)
// ----------------------------------------------------------------------------
const GAME_ID = 'neon-breakout';
const SAVE_VERSION = 1;

const W = 960, H = 720;
const BW = 72, BH = 30;
const MAXROWS = 14;
const GRID_X = (W - COLS * BW) / 2;   // 12
const GRID_Y = 96;
const TOP_Y = 44;                      // ceiling (below the HUD strip)
const PADDLE_Y = 660, PADDLE_H = 16;
const PADDLE_W = 124, PADDLE_W_WIDE = 192;
const BALL_R = 8;
const SHIELD_Y = 702;
const FLOOR_Y = H + 30;
const STEP = 1 / 120;
const MAX_BALLS = 9;
const LEVEL_COUNT = LEVELS.length;
const TOTAL_STARS = LEVEL_COUNT * 3;

const POWERUPS = {
  multi:  { label: 'MULTI',  tag: 'MB', color: '#5cff9d', dur: 0 },
  laser:  { label: 'LASER',  tag: 'LZ', color: '#ff6b6b', dur: 11 },
  wide:   { label: 'WIDE',   tag: 'WD', color: '#22e8ff', dur: 15 },
  slow:   { label: 'SLOW',   tag: 'SL', color: '#9b6bff', dur: 10 },
  pierce: { label: 'PIERCE', tag: 'PR', color: '#ffc44d', dur: 8 },
  shield: { label: 'SHIELD', tag: 'SH', color: '#ff3df0', dur: 0 },
};
const PU_KEYS = Object.keys(POWERUPS);

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => clamp(Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ----------------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });

const el = {
  hud: $('hud'), score: $('hudScore'), level: $('hudLevel'), levelName: $('hudLevelName'),
  lives: $('hudLives'), btnPause: $('btnPause'),
  comboWrap: $('comboWrap'), comboText: $('comboText'), comboFill: $('comboFill'),
  bossWrap: $('bossBarWrap'), bossName: $('bossName'), bossFill: $('bossFill'),
  chips: $('powerChips'), toasts: $('toasts'),
  ovMenu: $('ovMenu'), ovLevels: $('ovLevels'), ovHowTo: $('ovHowTo'), ovSettings: $('ovSettings'),
  ovPause: $('ovPause'), ovComplete: $('ovComplete'), ovOver: $('ovOver'), ovVictory: $('ovVictory'),
  contLv: $('contLv'), menuStars: $('menuStars'), menuCleared: $('menuCleared'),
  menuScore: $('menuScore'), menuMode: $('menuMode'),
  levelGrid: $('levelGrid'), lvTotalStars: $('lvTotalStars'),
  volSlider: $('volSlider'), volVal: $('volVal'),
  cbShake: $('cbShake'), cbGlow: $('cbGlow'), cbTrails: $('cbTrails'),
  resetNote: $('resetNote'),
  pauseSub: $('pauseSub'),
  compTitle: $('compTitle'), compSub: $('compSub'), compStars: $('compStars'), compBest: $('compBest'),
  compScore: $('compScore'), compBricks: $('compBricks'), compCombo: $('compCombo'),
  compLives: $('compLives'), compTime: $('compTime'), compBonus: $('compBonus'), compPar: $('compPar'),
  btnNext: $('btnNext'),
  overSub: $('overSub'), overScore: $('overScore'), overBricks: $('overBricks'),
  overLeft: $('overLeft'), overCombo: $('overCombo'),
  vicScore: $('vicScore'), vicStars: $('vicStars'), vicBosses: $('vicBosses'),
};

const OVERLAYS = [el.ovMenu, el.ovLevels, el.ovHowTo, el.ovSettings, el.ovPause,
                  el.ovComplete, el.ovOver, el.ovVictory];

function showOverlay(node) {
  for (const o of OVERLAYS) o.classList.toggle('hidden', o !== node);
  el.hud.classList.toggle('hidden', node !== null);
  if (node === null) el.hud.classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// Audio — everything synthesised, no files
// ----------------------------------------------------------------------------
const audio = {
  ac: null, master: null, volume: 0.7, ready: false,
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ac.destination);
      this.ready = true;
    } catch { this.ready = false; }
  },
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {}); },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
  tone(freq, dur, type = 'square', gain = 0.18, slideTo = null, delay = 0) {
    if (!this.ready || this.volume <= 0) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, gain = 0.2, freq = 900, q = 1, delay = 0) {
    if (!this.ready || this.volume <= 0) return;
    const t = this.ac.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ac.sampleRate * dur));
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ac.createBufferSource(); src.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ac.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  // one-shot cues
  wall()      { this.tone(340, 0.045, 'square', 0.07); },
  paddle()    { this.tone(210, 0.075, 'triangle', 0.16, 330); },
  brick(hp)   { this.tone(520 + hp * 130, 0.06, 'square', 0.11, 700 + hp * 120); },
  crack()     { this.tone(180, 0.06, 'sawtooth', 0.08, 120); },
  boom()      { this.noise(0.34, 0.3, 260, 0.8); this.tone(90, 0.32, 'sawtooth', 0.16, 38); },
  laser()     { this.tone(1150, 0.06, 'square', 0.07, 380); },
  pickup()    { [660, 880, 1180].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.13, null, i * 0.055)); },
  lose()      { this.tone(300, 0.5, 'sawtooth', 0.2, 60); this.noise(0.4, 0.12, 200, 0.6); },
  shield()    { this.tone(760, 0.16, 'sine', 0.18, 1350); },
  bossHit()   { this.tone(150, 0.09, 'sawtooth', 0.14, 90); },
  bossDown()  { [180, 140, 100, 70].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.2, f * 0.5, i * 0.16)); this.noise(1.0, 0.24, 180, 0.5); },
  clear()     { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.16, null, i * 0.09)); },
  fail()      { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.17, null, i * 0.14)); },
  ui()        { this.tone(620, 0.04, 'square', 0.06); },
};

// ----------------------------------------------------------------------------
// Persistent progress
// ----------------------------------------------------------------------------
function defaultProgress() {
  return {
    v: SAVE_VERSION,
    levels: {},           // "1": {stars, best}
    unlocked: 1,
    career: 0,
    powerups: 0,
    laserKills: 0,
    booms: 0,
    bosses: {},           // "10": true
    bricks: 0,
    plays: 0,
    settings: { volume: 0.7, shake: true, glow: true, trails: true },
  };
}
let prog = defaultProgress();

function totalStars() {
  let s = 0;
  for (const k in prog.levels) s += prog.levels[k].stars | 0;
  return s;
}
function clearedCount() {
  let n = 0;
  for (const k in prog.levels) if ((prog.levels[k].stars | 0) > 0) n++;
  return n;
}
function bossCount() { return Object.keys(prog.bosses).length; }

// ----------------------------------------------------------------------------
// Empire SDK
// ----------------------------------------------------------------------------
let empire = null;
let playtimeAcc = 0, playtimeFlush = 0, sessionSeconds = 0;

const empireOpts = {
  gameId: GAME_ID,
  saveVersion: SAVE_VERSION,
  onPause: () => { if (state === 'playing') doPause(); },
  onResume: () => { if (state === 'paused') doResume(); },
  onSettings: (s) => applyHubSettings(s),
};

function applyHubSettings(s) {
  if (!s || typeof s !== 'object') return;
  const v = (typeof s.masterVolume === 'number') ? s.masterVolume
          : (typeof s.volume === 'number') ? s.volume : null;
  if (v !== null) {
    prog.settings.volume = clamp(v, 0, 1);
    audio.setVolume(prog.settings.volume);
    el.volSlider.value = String(prog.settings.volume);
    el.volVal.textContent = Math.round(prog.settings.volume * 100) + '%';
  }
  if (typeof s.reducedMotion === 'boolean' && s.reducedMotion) {
    prog.settings.shake = false; prog.settings.glow = false;
    el.cbShake.checked = false; el.cbGlow.checked = false;
  }
}

let saveQueued = false;
async function saveProgress(label) {
  if (!empire || saveQueued) return;
  saveQueued = true;
  try {
    await empire.saveState('auto', prog, {
      label: label || `Level ${Math.min(prog.unlocked, LEVEL_COUNT)}`,
      progress: clamp(totalStars() / TOTAL_STARS, 0, 1),
      playtimeSec: Math.round(sessionSeconds),
      mode: 'campaign',
    });
    empire.setContinuePoint('auto', `Level ${Math.min(prog.unlocked, LEVEL_COUNT)}`).catch(() => {});
  } catch { /* non-fatal */ }
  saveQueued = false;
}

function flushPlaytime(force) {
  if (!empire) return;
  if (playtimeAcc >= 30 || (force && playtimeAcc >= 1)) {
    const s = Math.round(playtimeAcc);
    playtimeAcc = 0;
    empire.reportPlaytime(s).catch(() => {});
  }
}

const ACH = {
  first_clear: 1, combo_master: 1, flawless_level: 1, boss_slayer: 1,
  powerup_hoard: 60, laser_gunner: 40, demolition: 25,
  all_bosses: 3, star_collector: 60, campaign_complete: 30,
};
const achDone = new Set();
function unlock(id, count) {
  if (!empire || !(id in ACH)) return;
  const target = ACH[id];
  const p = clamp((count === undefined ? 1 : count) / target, 0, 1);
  const key = id + '|' + p.toFixed(3);
  if (achDone.has(key)) return;
  achDone.add(key);
  empire.unlockAchievement(id, p).catch(() => {});
}
function checkAchievements() {
  unlock('powerup_hoard', prog.powerups);
  unlock('laser_gunner', prog.laserKills);
  unlock('demolition', prog.booms);
  unlock('all_bosses', bossCount());
  unlock('star_collector', totalStars());
  unlock('campaign_complete', clearedCount());
}

// ----------------------------------------------------------------------------
// Brick sprite cache (glow baked once, drawn as images at runtime)
// ----------------------------------------------------------------------------
const SPRITE_PAD = 9;
const sprites = new Map();

function brickStyleKey(b) {
  if (b.type === 'steel') return 'st';
  if (b.type === 'boom') return 'bm';
  if (b.type === 'cache') return 'ca' + Math.min(b.hp, 2);
  return 'n' + clamp(b.hp, 1, 3);
}
function brickColorFor(key) {
  if (key === 'st') return '#8fa0b8';
  if (key === 'bm') return '#ff5a2a';
  if (key.startsWith('ca')) return '#5cff9d';
  if (key === 'n3') return '#ffc44d';
  if (key === 'n2') return '#ff3df0';
  return '#22e8ff';
}

function makeBrickSprite(key, glow) {
  const color = brickColorFor(key);
  const c = document.createElement('canvas');
  c.width = BW + SPRITE_PAD * 2; c.height = BH + SPRITE_PAD * 2;
  const g = c.getContext('2d');
  const x = SPRITE_PAD + 3, y = SPRITE_PAD + 3, bw = BW - 6, bh = BH - 6;

  if (glow) { g.shadowColor = color; g.shadowBlur = 13; }
  const grad = g.createLinearGradient(0, y, 0, y + bh);
  grad.addColorStop(0, shade(color, 0.45));
  grad.addColorStop(0.48, shade(color, 0.02));
  grad.addColorStop(1, shade(color, -0.45));
  g.fillStyle = grad;
  roundRect(g, x, y, bw, bh, 5); g.fill();
  g.shadowBlur = 0;

  g.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(g, x + 3, y + 3, bw - 6, bh * 0.30, 3); g.fill();

  g.strokeStyle = shade(color, 0.35); g.lineWidth = 1.4;
  roundRect(g, x + 0.7, y + 0.7, bw - 1.4, bh - 1.4, 5); g.stroke();

  if (key === 'st') {
    g.save();
    roundRect(g, x, y, bw, bh, 5); g.clip();
    g.strokeStyle = 'rgba(20,26,44,0.55)'; g.lineWidth = 3;
    for (let i = -bh; i < bw; i += 9) {
      g.beginPath(); g.moveTo(x + i, y + bh); g.lineTo(x + i + bh, y); g.stroke();
    }
    g.restore();
  } else if (key === 'bm') {
    const cx = x + bw / 2, cy = y + bh / 2;
    g.fillStyle = '#fff3d0';
    g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,240,200,0.85)'; g.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5);
      g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
      g.stroke();
    }
  } else if (key.startsWith('ca')) {
    const cx = x + bw / 2, cy = y + bh / 2;
    g.fillStyle = '#eafff5';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 8.5 : 3.6;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.fill();
  } else if (key === 'n3') {
    g.fillStyle = 'rgba(60,40,10,0.55)';
    for (const px of [x + 7, x + bw - 7]) {
      for (const py of [y + 6, y + bh - 6]) {
        g.beginPath(); g.arc(px, py, 2.1, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (key === 'n2') {
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x + bw / 2, y + 4); g.lineTo(x + bw / 2, y + bh - 4); g.stroke();
  }
  return c;
}

function rebuildSprites() {
  sprites.clear();
  const glow = !!prog.settings.glow;
  for (const k of ['st', 'bm', 'ca1', 'ca2', 'n1', 'n2', 'n3']) {
    sprites.set(k, makeBrickSprite(k, glow));
  }
}

// Ball sprite
let ballSprite = null, ballSpritePierce = null;
function makeBallSprite(color) {
  const R = BALL_R, pad = 10, s = (R + pad) * 2;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const g = c.getContext('2d');
  const cx = s / 2, cy = s / 2;
  const gr = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, R);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, shade(color, -0.4));
  if (prog.settings.glow) { g.shadowColor = color; g.shadowBlur = 14; }
  g.fillStyle = gr;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  return c;
}
function rebuildBallSprites() {
  ballSprite = makeBallSprite('#7ef4ff');
  ballSpritePierce = makeBallSprite('#ffc44d');
}

// ----------------------------------------------------------------------------
// Pools
// ----------------------------------------------------------------------------
const MAX_PARTICLES = 520;
const particles = new Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
  particles[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff', grav: 340, spark: false };
}
let pCursor = 0;
function spawnParticle(x, y, vx, vy, life, size, color, grav, spark) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[pCursor];
    pCursor = (pCursor + 1) % MAX_PARTICLES;
    if (!p.active) {
      p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.size = size; p.color = color;
      p.grav = grav === undefined ? 340 : grav; p.spark = !!spark;
      return p;
    }
  }
  return null;
}
function burst(x, y, color, count, speed, size, grav) {
  if (!prog.settings.glow) count = Math.max(3, count >> 1);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.35 + Math.random() * 0.8);
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
      rnd(0.28, 0.7), size * rnd(0.6, 1.3), color, grav, true);
  }
}

const MAX_FLOAT = 36;
const floaters = new Array(MAX_FLOAT);
for (let i = 0; i < MAX_FLOAT; i++) floaters[i] = { active: false, x: 0, y: 0, life: 0, text: '', color: '#fff', size: 16 };
function floatText(x, y, text, color, size) {
  for (let i = 0; i < MAX_FLOAT; i++) {
    const f = floaters[i];
    if (!f.active) { f.active = true; f.x = x; f.y = y; f.life = 0.85; f.text = text; f.color = color; f.size = size || 16; return; }
  }
}

const MAX_BOLTS = 24;
const bolts = new Array(MAX_BOLTS);
for (let i = 0; i < MAX_BOLTS; i++) bolts[i] = { active: false, x: 0, y: 0 };
const MAX_BOMBS = 28;
const bombs = new Array(MAX_BOMBS);
for (let i = 0; i < MAX_BOMBS; i++) bombs[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, spin: 0 };

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------
let state = 'menu';           // menu | levels | howto | settings | playing | paused | complete | over | victory
let howToReturn = 'menu';
let levelNum = 1;
let levelDef = null;
let grid = new Array(COLS * MAXROWS).fill(null);
let bricks = [];
let destructibleAlive = 0;
let parScore = 0;
let parBase = 0;

let balls = [];
let powerups = [];
let boss = null;

const paddle = {
  x: W / 2 - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H,
  targetX: W / 2 - PADDLE_W / 2, vx: 0, stun: 0, flash: 0, fireCd: 0,
};

let lives = 3, livesLost = 0;
let score = 0, careerAtLevelStart = 0;
let combo = 0, bestCombo = 0, bricksBroken = 0;
let elapsed = 0, speedRamp = 0;
let shieldCharges = 0;
const timers = { laser: 0, wide: 0, slow: 0, pierce: 0 };
let bannerT = 0, bannerText = '', bannerSub = '';
let shakeMag = 0, shakeX = 0, shakeY = 0;
let clearDelay = -1, deathDelay = -1;
let launchBuffer = 0;
let flashT = 0;
let bgScroll = 0;

const keys = new Set();
let pointerX = null, usingPointer = false;

let viewScale = 1, viewT = 1, cssW = W, cssH = H;

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----------------------------------------------------------------------------
// Canvas sizing
// ----------------------------------------------------------------------------
function resize() {
  const availW = Math.max(320, window.innerWidth - 24);
  const availH = Math.max(240, window.innerHeight - 24);
  const scale = Math.min(availW / W, availH / H);
  viewScale = scale;
  cssW = Math.round(W * scale); cssH = Math.round(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.style.width = cssW + 'px';
  stage.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  viewT = (cssW / W) * dpr;
  el.hud.style.fontSize = Math.max(11, Math.round(15 * scale)) + 'px';
}
window.addEventListener('resize', resize);

// ----------------------------------------------------------------------------
// Level construction
// ----------------------------------------------------------------------------
function buildLevel(n) {
  levelNum = clamp(n, 1, LEVEL_COUNT);
  levelDef = LEVELS[levelNum - 1];
  grid = new Array(COLS * MAXROWS).fill(null);
  bricks = [];
  destructibleAlive = 0;
  parBase = 0;

  levelDef.rows.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const spec = charToBrick(row[c]);
      if (!spec) continue;
      const b = {
        col: c, row: r,
        x: GRID_X + c * BW, y: GRID_Y + r * BH, w: BW, h: BH,
        type: spec.type, hp: spec.hp, maxHp: spec.hp, cache: spec.cache,
        alive: true, flash: 0, wob: 0,
      };
      grid[r * COLS + c] = b;
      bricks.push(b);
      if (spec.type !== 'steel') {
        destructibleAlive++;
        parBase += BRICK_BASE_SCORE[spec.type] || 100;
      }
    }
  });
  parScore = Math.round(parBase * 1.45 + 1000);

  boss = null;
  if (levelDef.boss) {
    const cfg = BOSSES[levelDef.boss];
    boss = {
      cfg, name: cfg.name,
      w: cfg.w, h: cfg.h,
      x: W / 2 - cfg.w / 2, y: 96,
      vx: cfg.speed, baseY: 96, bob: 0,
      hp: cfg.hp, maxHp: cfg.hp,
      fireT: cfg.bombRate * 0.8,
      alive: true, hitFlash: 0, enrage: 0, dieT: 0,
    };
  }

  balls.length = 0;
  powerups.length = 0;
  for (const b of bolts) b.active = false;
  for (const b of bombs) b.active = false;
  for (const p of particles) p.active = false;
  for (const f of floaters) f.active = false;

  lives = 3; livesLost = 0;
  score = 0; combo = 0; bestCombo = 0; bricksBroken = 0;
  elapsed = 0; speedRamp = 0; shieldCharges = 0;
  timers.laser = timers.wide = timers.slow = timers.pierce = 0;
  paddle.w = PADDLE_W;
  paddle.x = W / 2 - paddle.w / 2;
  paddle.targetX = paddle.x;
  paddle.vx = 0; paddle.stun = 0; paddle.flash = 0; paddle.fireCd = 0;
  clearDelay = -1; deathDelay = -1; launchBuffer = 0;
  shakeMag = 0; flashT = 0;

  bannerText = `LEVEL ${levelNum}`;
  bannerSub = levelDef.name + (boss ? '  —  BOSS' : '');
  bannerT = 2.2;

  serveBall();
  updateHudAll();
  el.bossWrap.classList.toggle('hidden', !boss);
  if (boss) {
    el.bossName.textContent = boss.name;
    el.bossFill.style.width = '100%';
  }
}

function serveBall() {
  balls.length = 0;
  const b = newBall(paddle.x + paddle.w / 2, paddle.y - BALL_R - 1, 0, -1);
  b.stuck = true;
  balls.push(b);
}
function newBall(x, y, dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, dx: dx / len, dy: dy / len, r: BALL_R, stuck: false, trail: [], hitT: 0 };
}
function ballSpeed() {
  const base = 396 + Math.min(levelNum, LEVEL_COUNT) * 3.4 + speedRamp;
  return timers.slow > 0 ? base * 0.6 : base;
}

// ----------------------------------------------------------------------------
// Brick damage / destruction
// ----------------------------------------------------------------------------
function comboMult() { return 1 + Math.min(combo, 20) * 0.12; }

function addScore(v, x, y, color) {
  const gained = Math.round(v);
  score += gained;
  if (x !== undefined) floatText(x, y, '+' + gained, color || '#eaf4ff', 15);
}

function damageBrick(b, amount, source) {
  if (!b || !b.alive || b.type === 'steel') return false;
  b.hp -= amount;
  b.flash = 0.18;
  b.wob = 0.22;
  if (b.hp > 0) {
    audio.crack();
    burst(b.x + BW / 2, b.y + BH / 2, brickColorFor(brickStyleKey(b)), 4, 90, 2, 260);
    return false;
  }
  destroyBrick(b, source);
  return true;
}

function destroyBrick(b, source) {
  if (!b.alive) return;
  b.alive = false;
  grid[b.row * COLS + b.col] = null;
  if (b.type !== 'steel') destructibleAlive--;
  bricksBroken++;
  prog.bricks++;

  combo++;
  if (combo > bestCombo) bestCombo = combo;
  if (combo >= 12) unlock('combo_master', 1);

  const key = brickStyleKey(b);
  const color = brickColorFor(key);
  const base = BRICK_BASE_SCORE[b.type] || 100;
  const gained = base * comboMult();
  addScore(gained, b.x + BW / 2, b.y + BH / 2, color);

  burst(b.x + BW / 2, b.y + BH / 2, color, 12, 190, 3, 380);
  audio.brick(b.maxHp);
  if (source === 'laser') { prog.laserKills++; }

  if (b.cache) {
    dropPowerup(b.x + BW / 2, b.y + BH / 2, null);
  } else if (b.type !== 'boom' && Math.random() < 0.115) {
    dropPowerup(b.x + BW / 2, b.y + BH / 2, null);
  }

  if (b.type === 'boom') explode(b);
}

function explode(origin) {
  prog.booms++;
  audio.boom();
  addShake(9);
  flashT = Math.max(flashT, 0.12);
  burst(origin.x + BW / 2, origin.y + BH / 2, '#ffb15a', 34, 340, 4.5, 220);
  burst(origin.x + BW / 2, origin.y + BH / 2, '#fff0c0', 14, 200, 3, 160);

  const queue = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = origin.row + dr, c = origin.col + dc;
      if (r < 0 || r >= MAXROWS || c < 0 || c >= COLS) continue;
      const t = grid[r * COLS + c];
      if (!t || !t.alive || t.type === 'steel') continue;
      if (t.type === 'boom') queue.push(t);
      else {
        t.hp = 0;
        destroyBrick(t, 'boom');
      }
    }
  }
  // Chained explosives detonate on a tiny delay via direct recursion (bounded by grid size)
  for (const t of queue) {
    if (t.alive) { t.hp = 0; destroyBrick(t, 'boom'); }
  }

  if (boss && boss.alive) {
    const bx = origin.x + BW / 2, by = origin.y + BH / 2;
    if (bx > boss.x - 70 && bx < boss.x + boss.w + 70 && by > boss.y - 70 && by < boss.y + boss.h + 70) {
      hurtBoss(3);
    }
  }
}

// ----------------------------------------------------------------------------
// Power-ups
// ----------------------------------------------------------------------------
function dropPowerup(x, y, forced) {
  if (powerups.length >= 5) return;
  let type = forced;
  if (!type) {
    const pool = [];
    for (const k of PU_KEYS) {
      let weight = 3;
      if (k === 'multi') weight = balls.length > 3 ? 1 : 4;
      if (k === 'pierce') weight = 2;
      if (k === 'shield') weight = shieldCharges > 0 ? 1 : 3;
      if (k === 'laser') weight = 3;
      if (k === 'slow') weight = 2;
      for (let i = 0; i < weight; i++) pool.push(k);
    }
    type = pick(pool);
  }
  powerups.push({ x, y, w: 46, h: 22, vy: 165, type, t: 0 });
}

function applyPowerup(type) {
  prog.powerups++;
  audio.pickup();
  const def = POWERUPS[type];
  toast(def.label + ' !');
  floatText(paddle.x + paddle.w / 2, paddle.y - 26, def.label, def.color, 17);
  switch (type) {
    case 'multi': {
      const src = balls.slice();
      for (const b of src) {
        if (balls.length >= MAX_BALLS) break;
        if (b.stuck) { launchStuck(); }
        for (let i = 0; i < 2 && balls.length < MAX_BALLS; i++) {
          const a = Math.atan2(b.dy, b.dx) + (i === 0 ? -0.42 : 0.42);
          balls.push(newBall(b.x, b.y, Math.cos(a), Math.sin(a)));
        }
      }
      break;
    }
    case 'laser': timers.laser = POWERUPS.laser.dur; break;
    case 'wide': timers.wide = POWERUPS.wide.dur; break;
    case 'slow': timers.slow = POWERUPS.slow.dur; break;
    case 'pierce': timers.pierce = POWERUPS.pierce.dur; break;
    case 'shield': shieldCharges = Math.min(5, shieldCharges + 3); break;
  }
  checkAchievements();
}

function clearPowerupEffects() {
  timers.laser = timers.wide = timers.slow = timers.pierce = 0;
  shieldCharges = 0;
  powerups.length = 0;
}

// ----------------------------------------------------------------------------
// Boss
// ----------------------------------------------------------------------------
function hurtBoss(dmg) {
  if (!boss || !boss.alive) return;
  boss.hp -= dmg;
  boss.hitFlash = 0.16;
  audio.bossHit();
  burst(boss.x + boss.w / 2 + rnd(-40, 40), boss.y + boss.h, boss.cfg.accent, 8, 180, 3, 260);
  addScore(60 * comboMult(), boss.x + boss.w / 2, boss.y + boss.h / 2, boss.cfg.accent);
  el.bossFill.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.alive = false;
    boss.dieT = 1.2;
    audio.bossDown();
    addShake(22);
    flashT = 0.3;
    for (let i = 0; i < 6; i++) {
      burst(boss.x + rnd(0, boss.w), boss.y + rnd(0, boss.h), pick(['#fff0c0', boss.cfg.color, boss.cfg.accent]), 22, 340, 5, 200);
    }
    addScore(2500, boss.x + boss.w / 2, boss.y + boss.h / 2, '#fff0c0');
    toast(boss.name + ' DESTROYED');
    prog.bosses[String(levelNum)] = true;
    unlock('boss_slayer', 1);
    checkAchievements();
  }
}

function updateBoss(dt) {
  if (!boss) return;
  if (!boss.alive) {
    if (boss.dieT > 0) {
      boss.dieT -= dt;
      if (Math.random() < 0.35) burst(boss.x + rnd(0, boss.w), boss.y + rnd(0, boss.h), '#ff9f4d', 6, 220, 4, 220);
    }
    return;
  }
  const frac = boss.hp / boss.maxHp;
  boss.enrage = frac < 0.5 ? (frac < 0.25 ? 2 : 1) : 0;
  const spd = boss.cfg.speed * (1 + boss.enrage * 0.22);
  boss.x += Math.sign(boss.vx) * spd * dt;
  if (boss.x < 8) { boss.x = 8; boss.vx = Math.abs(boss.vx); }
  if (boss.x + boss.w > W - 8) { boss.x = W - 8 - boss.w; boss.vx = -Math.abs(boss.vx); }
  boss.bob += dt * (1.4 + boss.enrage * 0.5);
  boss.y = boss.baseY + Math.sin(boss.bob) * 16;
  if (boss.hitFlash > 0) boss.hitFlash -= dt;

  boss.fireT -= dt;
  if (boss.fireT <= 0) {
    boss.fireT = boss.cfg.bombRate * (1 - boss.enrage * 0.2);
    const cx = boss.x + boss.w / 2, cy = boss.y + boss.h;
    const shots = boss.enrage >= 2 ? 3 : boss.enrage >= 1 ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const off = shots === 1 ? 0 : (i - (shots - 1) / 2) * 46;
      spawnBomb(cx + off, cy, off * 0.55, boss.cfg.bombSpeed);
    }
    audio.tone(180, 0.12, 'square', 0.09, 90);
  }
}

function spawnBomb(x, y, vx, vy) {
  for (const b of bombs) {
    if (!b.active) { b.active = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.spin = 0; return; }
  }
}

// ----------------------------------------------------------------------------
// Input
// ----------------------------------------------------------------------------
function isTypingTarget(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

window.addEventListener('keydown', (e) => {
  audio.init(); audio.resume();
  const k = e.key.toLowerCase();
  if (isTypingTarget(e.target) && k !== 'escape') return;

  if (k === 'escape' || k === 'p') {
    e.preventDefault();
    if (state === 'playing') doPause();
    else if (state === 'paused') doResume();
    else if (state === 'howto') closeHowTo();
    else if (state === 'levels' || state === 'settings') goMenu();
    return;
  }
  if (k === 'r' && (state === 'playing' || state === 'paused')) {
    e.preventDefault();
    restartLevel();
    return;
  }
  if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
  if (k === ' ') {
    if (state === 'playing') { launchBuffer = 0.25; tryFire(); }
    else if (state === 'complete') { el.btnNext.click(); }
    return;
  }
  keys.add(k);
  if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) usingPointer = false;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); if (state === 'playing') doPause(); });

function pointerToLogical(clientX) {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0) return null;
  return ((clientX - r.left) / r.width) * W;
}
window.addEventListener('pointermove', (e) => {
  const x = pointerToLogical(e.clientX);
  if (x === null) return;
  pointerX = x;
  if (state === 'playing') usingPointer = true;
});
stage.addEventListener('pointerdown', (e) => {
  audio.init(); audio.resume();
  const x = pointerToLogical(e.clientX);
  if (x !== null) { pointerX = x; usingPointer = true; }
  if (state === 'playing') { launchBuffer = 0.25; tryFire(); }
  e.preventDefault();
});
stage.addEventListener('contextmenu', (e) => e.preventDefault());

function tryFire() {
  if (timers.laser <= 0 || paddle.fireCd > 0 || paddle.stun > 0) return;
  paddle.fireCd = 0.2;
  const y = paddle.y - 4;
  fireBolt(paddle.x + 10, y);
  fireBolt(paddle.x + paddle.w - 10, y);
  audio.laser();
}
function fireBolt(x, y) {
  for (const b of bolts) { if (!b.active) { b.active = true; b.x = x; b.y = y; return; } }
}
function launchStuck() {
  let launched = false;
  for (const b of balls) {
    if (b.stuck) {
      b.stuck = false;
      const rel = clamp((b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
      const a = rel * 0.7 + rnd(-0.08, 0.08);
      b.dx = Math.sin(a); b.dy = -Math.cos(a);
      launched = true;
    }
  }
  if (launched) audio.tone(420, 0.08, 'triangle', 0.14, 720);
  return launched;
}

// ----------------------------------------------------------------------------
// Update
// ----------------------------------------------------------------------------
function addShake(m) {
  if (REDUCED || !prog.settings.shake) return;
  shakeMag = Math.min(26, shakeMag + m);
}

function update(dt) {
  elapsed += dt;
  speedRamp = Math.min(92, speedRamp + dt * 0.85);
  bgScroll = (bgScroll + dt * 14) % 60;

  if (launchBuffer > 0) {
    launchBuffer -= dt;
    if (launchStuck()) launchBuffer = 0;
  }

  // timers
  for (const k of ['laser', 'wide', 'slow', 'pierce']) {
    if (timers[k] > 0) {
      timers[k] -= dt;
      if (timers[k] <= 0) { timers[k] = 0; audio.tone(240, 0.12, 'square', 0.07, 150); }
    }
  }
  if (paddle.fireCd > 0) paddle.fireCd -= dt;
  if (paddle.stun > 0) paddle.stun -= dt;
  if (paddle.flash > 0) paddle.flash -= dt;
  if (flashT > 0) flashT -= dt;
  if (bannerT > 0) bannerT -= dt;
  if (shakeMag > 0) {
    shakeMag = Math.max(0, shakeMag - dt * 46);
    shakeX = rnd(-shakeMag, shakeMag) * 0.5;
    shakeY = rnd(-shakeMag, shakeMag) * 0.5;
  } else { shakeX = shakeY = 0; }

  updatePaddle(dt);
  updateBalls(dt);
  updateBolts(dt);
  updateBombs(dt);
  updatePowerupItems(dt);
  updateBoss(dt);
  updateParticles(dt);
  updateFloaters(dt);

  for (const b of bricks) {
    if (b.flash > 0) b.flash -= dt;
    if (b.wob > 0) b.wob -= dt;
  }

  // level clear / death sequencing
  if (clearDelay >= 0) {
    clearDelay -= dt;
    if (clearDelay <= 0) finishLevel();
    return;
  }
  if (deathDelay >= 0) {
    deathDelay -= dt;
    if (deathDelay <= 0) afterDeath();
    return;
  }
  if (destructibleAlive <= 0 && (!boss || !boss.alive)) {
    clearDelay = 0.85;
    audio.clear();
  }
}

function updatePaddle(dt) {
  const targetW = timers.wide > 0 ? PADDLE_W_WIDE : PADDLE_W;
  if (Math.abs(paddle.w - targetW) > 0.5) {
    const cx = paddle.x + paddle.w / 2;
    paddle.w = lerp(paddle.w, targetW, Math.min(1, dt * 10));
    paddle.x = cx - paddle.w / 2;
  }

  const prevX = paddle.x;
  if (paddle.stun > 0) {
    paddle.vx = 0;
    paddle.x = clamp(paddle.x, 0, W - paddle.w);
    return;
  }

  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  if (left || right) usingPointer = false;

  if (usingPointer && pointerX !== null) {
    paddle.x = clamp(pointerX - paddle.w / 2, 0, W - paddle.w);
  } else {
    const spd = 760;
    if (left) paddle.x -= spd * dt;
    if (right) paddle.x += spd * dt;
    paddle.x = clamp(paddle.x, 0, W - paddle.w);
  }
  paddle.vx = (paddle.x - prevX) / dt;
}

function updateBalls(dt) {
  const speed = ballSpeed();
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b.hitT > 0) b.hitT -= dt;

    if (b.stuck) {
      b.x = clamp(paddle.x + paddle.w / 2, b.r, W - b.r);
      b.y = paddle.y - b.r - 1;
      continue;
    }

    b.x += b.dx * speed * dt;
    b.y += b.dy * speed * dt;

    // walls
    if (b.x - b.r < 0) { b.x = b.r; b.dx = Math.abs(b.dx); audio.wall(); sparkAt(b.x, b.y, '#6fd8ff'); }
    else if (b.x + b.r > W) { b.x = W - b.r; b.dx = -Math.abs(b.dx); audio.wall(); sparkAt(b.x, b.y, '#6fd8ff'); }
    if (b.y - b.r < TOP_Y) { b.y = TOP_Y + b.r; b.dy = Math.abs(b.dy); audio.wall(); sparkAt(b.x, b.y, '#6fd8ff'); }

    collideBallBricks(b);
    if (boss && boss.alive) collideBallBoss(b);

    // paddle
    if (b.dy > 0 &&
        b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h &&
        b.x >= paddle.x - b.r && b.x <= paddle.x + paddle.w + b.r) {
      b.y = paddle.y - b.r;
      const rel = clamp((b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
      let a = rel * 1.02;
      a += clamp(paddle.vx / 2600, -0.22, 0.22);
      a = clamp(a, -1.25, 1.25);
      b.dx = Math.sin(a); b.dy = -Math.cos(a);
      normalizeDir(b);
      combo = 0;
      paddle.flash = 0.16;
      audio.paddle();
      burst(b.x, paddle.y, '#22e8ff', 5, 110, 2, 200);
    }

    // shield barrier
    if (b.dy > 0 && shieldCharges > 0 && b.y + b.r >= SHIELD_Y) {
      b.y = SHIELD_Y - b.r;
      b.dy = -Math.abs(b.dy);
      shieldCharges--;
      audio.shield();
      burst(b.x, SHIELD_Y, '#ff3df0', 16, 200, 3, 120);
      addShake(3);
    }

    if (b.y - b.r > FLOOR_Y) {
      balls.splice(i, 1);
      burst(b.x, H - 6, '#ff6b7f', 14, 200, 3, 260);
      continue;
    }
  }

  if (balls.length === 0 && deathDelay < 0 && clearDelay < 0) {
    loseLife();
  }
}

function normalizeDir(b) {
  const l = Math.hypot(b.dx, b.dy) || 1;
  b.dx /= l; b.dy /= l;
  // never let the ball crawl horizontally
  if (Math.abs(b.dy) < 0.24) {
    b.dy = (b.dy < 0 ? -1 : 1) * 0.24;
    const nl = Math.hypot(b.dx, b.dy);
    b.dx /= nl; b.dy /= nl;
  }
  if (Math.abs(b.dx) < 0.10) {
    b.dx = (b.dx < 0 ? -1 : 1) * 0.10;
    const nl = Math.hypot(b.dx, b.dy);
    b.dx /= nl; b.dy /= nl;
  }
}

function circleRect(bx, by, r, rx, ry, rw, rh) {
  const cx = clamp(bx, rx, rx + rw), cy = clamp(by, ry, ry + rh);
  const dx = bx - cx, dy = by - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  const d = Math.sqrt(d2);
  if (d > 0.0001) return { nx: dx / d, ny: dy / d, pen: r - d };
  const l = bx - rx, rr = rx + rw - bx, t = by - ry, bo = ry + rh - by;
  const m = Math.min(l, rr, t, bo);
  if (m === l) return { nx: -1, ny: 0, pen: l + r };
  if (m === rr) return { nx: 1, ny: 0, pen: rr + r };
  if (m === t) return { nx: 0, ny: -1, pen: t + r };
  return { nx: 0, ny: 1, pen: bo + r };
}

const hitScratch = [];
function collideBallBricks(b) {
  const c0 = clamp(Math.floor((b.x - b.r - GRID_X) / BW), 0, COLS - 1);
  const c1 = clamp(Math.floor((b.x + b.r - GRID_X) / BW), 0, COLS - 1);
  const r0 = clamp(Math.floor((b.y - b.r - GRID_Y) / BH), 0, MAXROWS - 1);
  const r1 = clamp(Math.floor((b.y + b.r - GRID_Y) / BH), 0, MAXROWS - 1);
  if (b.y + b.r < GRID_Y || b.y - b.r > GRID_Y + MAXROWS * BH) return;

  hitScratch.length = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const brick = grid[r * COLS + c];
      if (!brick || !brick.alive) continue;
      const hit = circleRect(b.x, b.y, b.r, brick.x + 2, brick.y + 2, BW - 4, BH - 4);
      if (hit) hitScratch.push({ brick, hit });
    }
  }
  if (!hitScratch.length) return;

  const pierce = timers.pierce > 0;
  if (pierce) {
    let bounceOff = null, bestPen = -1;
    for (const h of hitScratch) {
      const isSteel = h.brick.type === 'steel';
      const killed = isSteel ? false : damageBrick(h.brick, h.brick.type === 'armour' ? 3 : 1, 'pierce');
      if (!killed && h.hit.pen > bestPen) { bestPen = h.hit.pen; bounceOff = h; }
    }
    if (bounceOff) resolveBounce(b, bounceOff.hit);
    return;
  }

  let best = hitScratch[0];
  for (const h of hitScratch) if (h.hit.pen > best.hit.pen) best = h;
  resolveBounce(b, best.hit);
  b.hitT = 0.1;
  if (best.brick.type === 'steel') {
    audio.wall();
    sparkAt(b.x, b.y, '#c8d6ea');
  } else {
    damageBrick(best.brick, 1, 'ball');
  }
}

function resolveBounce(b, hit) {
  b.x += hit.nx * (hit.pen + 0.1);
  b.y += hit.ny * (hit.pen + 0.1);
  const dot = b.dx * hit.nx + b.dy * hit.ny;
  if (dot < 0) { b.dx -= 2 * dot * hit.nx; b.dy -= 2 * dot * hit.ny; }
  normalizeDir(b);
}

function collideBallBoss(b) {
  const hit = circleRect(b.x, b.y, b.r, boss.x, boss.y, boss.w, boss.h);
  if (!hit) return;
  resolveBounce(b, hit);
  hurtBoss(timers.pierce > 0 ? 2 : 1);
}

function sparkAt(x, y, color) {
  burst(x, y, color, 4, 120, 2, 180);
}

function updateBolts(dt) {
  for (const bo of bolts) {
    if (!bo.active) continue;
    bo.y -= 900 * dt;
    if (bo.y < TOP_Y - 20) { bo.active = false; continue; }

    // bombs
    for (const bm of bombs) {
      if (!bm.active) continue;
      if (Math.abs(bm.x - bo.x) < 14 && Math.abs(bm.y - bo.y) < 16) {
        bm.active = false; bo.active = false;
        burst(bm.x, bm.y, '#ffb15a', 12, 190, 3, 200);
        addScore(50 * comboMult(), bm.x, bm.y, '#ffb15a');
        audio.tone(300, 0.08, 'square', 0.1, 120);
        break;
      }
    }
    if (!bo.active) continue;

    if (boss && boss.alive &&
        bo.x > boss.x && bo.x < boss.x + boss.w && bo.y < boss.y + boss.h && bo.y > boss.y - 6) {
      bo.active = false;
      hurtBoss(1);
      continue;
    }

    const c = Math.floor((bo.x - GRID_X) / BW);
    const r = Math.floor((bo.y - GRID_Y) / BH);
    if (c >= 0 && c < COLS && r >= 0 && r < MAXROWS) {
      const brick = grid[r * COLS + c];
      if (brick && brick.alive) {
        bo.active = false;
        if (brick.type === 'steel') { sparkAt(bo.x, bo.y, '#c8d6ea'); audio.wall(); }
        else damageBrick(brick, 1, 'laser');
      }
    }
  }
}

function updateBombs(dt) {
  for (const bm of bombs) {
    if (!bm.active) continue;
    bm.y += bm.vy * dt;
    bm.x += bm.vx * dt;
    bm.spin += dt * 7;
    if (bm.x < 10 || bm.x > W - 10) bm.vx *= -1;
    if (bm.y > H + 20) { bm.active = false; continue; }
    if (bm.y + 10 >= paddle.y && bm.y - 10 <= paddle.y + paddle.h &&
        bm.x > paddle.x - 8 && bm.x < paddle.x + paddle.w + 8) {
      bm.active = false;
      paddle.stun = 1.15;
      paddle.flash = 0.4;
      combo = 0;
      addShake(13);
      audio.noise(0.3, 0.28, 320, 0.7);
      audio.tone(120, 0.3, 'sawtooth', 0.16, 50);
      burst(bm.x, paddle.y, '#ff7a4d', 22, 250, 4, 300);
    }
  }
}

function updatePowerupItems(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy * dt;
    p.t += dt;
    if (p.y - p.h / 2 > H) { powerups.splice(i, 1); continue; }
    if (p.y + p.h / 2 >= paddle.y && p.y - p.h / 2 <= paddle.y + paddle.h &&
        p.x + p.w / 2 > paddle.x && p.x - p.w / 2 < paddle.x + paddle.w) {
      powerups.splice(i, 1);
      applyPowerup(p.type);
      burst(p.x, p.y, POWERUPS[p.type].color, 16, 200, 3, 200);
    }
  }
}

function updateParticles(dt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
function updateFloaters(dt) {
  for (let i = 0; i < MAX_FLOAT; i++) {
    const f = floaters[i];
    if (!f.active) continue;
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) f.active = false;
  }
}

// ----------------------------------------------------------------------------
// Life / level flow
// ----------------------------------------------------------------------------
function loseLife() {
  lives--;
  livesLost++;
  combo = 0;
  clearPowerupEffects();
  audio.lose();
  addShake(10);
  flashT = 0.16;
  deathDelay = 0.9;
  updateHudAll();
}

function afterDeath() {
  deathDelay = -1;
  if (lives <= 0) {
    gameOver();
  } else {
    // clear boss bombs so the restart is fair
    for (const b of bombs) b.active = false;
    paddle.stun = 0;
    serveBall();
    toast(lives + (lives === 1 ? ' BALL LEFT' : ' BALLS LEFT'));
  }
}

function finishLevel() {
  clearDelay = -1;
  const timeBonus = Math.max(0, Math.round(150 - elapsed)) * 12;
  const bonus = 700 + lives * 320 + timeBonus;
  score += bonus;

  let stars = 1;
  if (livesLost === 0) stars = 2;
  if (livesLost === 0 && score >= parScore) stars = 3;

  const key = String(levelNum);
  const prev = prog.levels[key] || { stars: 0, best: 0 };
  const isBest = score > prev.best;
  prog.levels[key] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, score) };
  prog.career += score;
  prog.plays++;
  if (levelNum >= prog.unlocked) prog.unlocked = Math.min(LEVEL_COUNT, levelNum + 1);

  unlock('first_clear', 1);
  if (livesLost === 0) unlock('flawless_level', 1);
  checkAchievements();
  saveProgress(`Level ${levelNum} — ${prog.levels[key].stars}★`);

  // fill the result panel
  el.compTitle.textContent = boss ? 'BOSS DEFEATED' : 'LEVEL CLEARED';
  el.compSub.textContent = `LEVEL ${levelNum} — ${levelDef.name}`;
  el.compStars.innerHTML = [0, 1, 2].map(i =>
    i < stars ? '<span class="lit">★</span>' : '<span>☆</span>').join('');
  el.compBest.textContent = isBest && prev.best > 0 ? 'NEW BEST SCORE' : (prev.best === 0 ? 'FIRST CLEAR' : '');
  el.compScore.textContent = score.toLocaleString();
  el.compBricks.textContent = String(bricksBroken);
  el.compCombo.textContent = 'x' + (1 + Math.min(bestCombo, 20) * 0.12).toFixed(1) + ` (${bestCombo})`;
  el.compLives.textContent = String(lives);
  el.compTime.textContent = fmtTime(elapsed);
  el.compBonus.textContent = '+' + bonus.toLocaleString();
  el.compPar.textContent = parScore.toLocaleString();
  el.btnNext.disabled = levelNum >= LEVEL_COUNT;
  el.btnNext.textContent = levelNum >= LEVEL_COUNT ? 'CAMPAIGN COMPLETE' : 'NEXT LEVEL';

  setState(levelNum >= LEVEL_COUNT && clearedCount() >= LEVEL_COUNT ? 'victory' : 'complete');
  if (state === 'victory') showVictory();
}

function gameOver() {
  deathDelay = -1;
  audio.fail();
  prog.plays++;
  prog.career += Math.round(score * 0.25);
  saveProgress(`Level ${levelNum}`);
  el.overSub.textContent = `LEVEL ${levelNum} — ${levelDef.name}`;
  el.overScore.textContent = score.toLocaleString();
  el.overBricks.textContent = String(bricksBroken);
  el.overLeft.textContent = String(destructibleAlive + (boss && boss.alive ? 1 : 0));
  el.overCombo.textContent = 'x' + (1 + Math.min(bestCombo, 20) * 0.12).toFixed(1) + ` (${bestCombo})`;
  setState('over');
}

function showVictory() {
  el.vicScore.textContent = prog.career.toLocaleString();
  el.vicStars.textContent = totalStars() + ' / ' + TOTAL_STARS;
  el.vicBosses.textContent = bossCount() + ' / 3';
}

// ----------------------------------------------------------------------------
// State switching
// ----------------------------------------------------------------------------
function setState(s) {
  state = s;
  switch (s) {
    case 'playing': showOverlay(null); break;
    case 'menu': refreshMenu(); showOverlay(el.ovMenu); break;
    case 'levels': buildLevelGrid(); showOverlay(el.ovLevels); break;
    case 'howto': showOverlay(el.ovHowTo); break;
    case 'settings': showOverlay(el.ovSettings); break;
    case 'paused':
      el.pauseSub.textContent = `LEVEL ${levelNum} — ${levelDef ? levelDef.name : ''}`;
      showOverlay(el.ovPause); break;
    case 'complete': showOverlay(el.ovComplete); break;
    case 'over': showOverlay(el.ovOver); break;
    case 'victory': showVictory(); showOverlay(el.ovVictory); break;
  }
}

function doPause() {
  if (state !== 'playing') return;
  setState('paused');
  audio.ui();
}
function doResume() {
  if (state !== 'paused') return;
  setState('playing');
  audio.ui();
}
function startLevel(n) {
  audio.init(); audio.resume();
  buildLevel(n);
  setState('playing');
}
function restartLevel() { startLevel(levelNum); }
function goMenu() { setState('menu'); }
function closeHowTo() { setState(howToReturn === 'paused' ? 'paused' : 'menu'); }

// ----------------------------------------------------------------------------
// HUD / menus
// ----------------------------------------------------------------------------
let toastId = 0;
function toast(text) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  d.dataset.id = String(++toastId);
  el.toasts.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2900);
  while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
}

let lastHud = {};
function updateHudAll() {
  el.score.textContent = score.toLocaleString();
  el.level.textContent = String(levelNum);
  el.levelName.textContent = levelDef ? levelDef.name : '';
  el.lives.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives));
  lastHud = { score, lives, levelNum };
}
function updateHudLive() {
  if (score !== lastHud.score) { el.score.textContent = score.toLocaleString(); lastHud.score = score; }
  if (lives !== lastHud.lives) {
    el.lives.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives));
    lastHud.lives = lives;
  }
  const on = combo >= 2;
  el.comboWrap.classList.toggle('on', on);
  if (on) {
    el.comboText.textContent = `COMBO x${comboMult().toFixed(1)}  (${combo})`;
    el.comboFill.style.width = clamp(combo / 20, 0, 1) * 100 + '%';
  }
  renderChips();
}

let chipSig = '';
function renderChips() {
  let sig = '';
  const items = [];
  for (const k of ['laser', 'wide', 'slow', 'pierce']) {
    if (timers[k] > 0) {
      const frac = clamp(timers[k] / POWERUPS[k].dur, 0, 1);
      items.push({ k, label: POWERUPS[k].label, color: POWERUPS[k].color, frac });
      sig += k + Math.ceil(timers[k] * 4) + ';';
    }
  }
  if (shieldCharges > 0) { items.push({ k: 'shield', label: 'SHIELD x' + shieldCharges, color: POWERUPS.shield.color, frac: shieldCharges / 5 }); sig += 'sh' + shieldCharges; }
  if (sig === chipSig) return;
  chipSig = sig;
  el.chips.innerHTML = items.map(it =>
    `<div class="chip" style="color:${it.color};border-color:${it.color}">` +
    `<span>${it.label}</span><span class="cbar"><span class="cfill" style="width:${(it.frac * 100).toFixed(0)}%"></span></span></div>`
  ).join('');
}

function refreshMenu() {
  const cont = clamp(prog.unlocked, 1, LEVEL_COUNT);
  el.contLv.textContent = String(cont);
  el.menuStars.textContent = totalStars() + ' / ' + TOTAL_STARS;
  el.menuCleared.textContent = clearedCount() + ' / ' + LEVEL_COUNT;
  el.menuScore.textContent = prog.career.toLocaleString();
  el.menuMode.textContent = empire && empire.standalone
    ? 'standalone save — progress stored locally'
    : 'connected to the Empire hub';
}

function buildLevelGrid() {
  el.levelGrid.innerHTML = '';
  for (let i = 1; i <= LEVEL_COUNT; i++) {
    const rec = prog.levels[String(i)];
    const stars = rec ? rec.stars : 0;
    const unlockedLv = i <= prog.unlocked;
    const isBoss = !!LEVELS[i - 1].boss;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lvBtn' + (isBoss ? ' boss' : '') + (stars > 0 ? ' done' : '');
    b.disabled = !unlockedLv;
    b.title = unlockedLv
      ? `${LEVELS[i - 1].name}${rec ? ' — best ' + rec.best.toLocaleString() : ''}`
      : 'Locked — clear the previous level';
    b.innerHTML = unlockedLv
      ? `<span class="n">${i}</span><span class="s">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`
      : `<span class="n">🔒</span><span class="s"></span>`;
    if (unlockedLv) b.addEventListener('click', () => { audio.ui(); startLevel(i); });
    el.levelGrid.appendChild(b);
  }
  el.lvTotalStars.textContent = totalStars() + ' / ' + TOTAL_STARS;
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
function render(dtReal) {
  ctx.setTransform(viewT, 0, 0, viewT, shakeX * viewT, shakeY * viewT);

  drawBackground();

  const playish = state === 'playing' || state === 'paused' || state === 'complete' || state === 'over';
  if (playish && levelDef) {
    drawBricks();
    if (boss) drawBoss();
    drawShield();
    drawPowerupItems();
    drawBolts();
    drawBombs();
    drawBalls(dtReal);
    drawPaddle();
    drawParticles();
    drawFloaters();
    drawBanner();
  } else {
    drawMenuBackdrop();
  }

  if (flashT > 0 && prog.settings.glow) {
    ctx.fillStyle = `rgba(255,255,255,${(flashT * 1.6).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.setTransform(viewT, 0, 0, viewT, 0, 0);
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1030');
  g.addColorStop(0.55, '#070b1e');
  g.addColorStop(1, '#04060f');
  ctx.fillStyle = g;
  ctx.fillRect(-30, -30, W + 60, H + 60);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#2e5aa8';
  ctx.lineWidth = 1;
  const off = REDUCED ? 0 : bgScroll;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -60 + off; y <= H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();

  // playfield frame
  ctx.strokeStyle = 'rgba(90,140,220,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, TOP_Y); ctx.lineTo(1, H);
  ctx.moveTo(W - 1, TOP_Y); ctx.lineTo(W - 1, H);
  ctx.moveTo(0, TOP_Y); ctx.lineTo(W, TOP_Y);
  ctx.stroke();
}

function drawMenuBackdrop() {
  // decorative brick wall behind menus
  ctx.save();
  ctx.globalAlpha = 0.5;
  const keysArr = ['n1', 'n2', 'n3', 'bm', 'ca1'];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < COLS; c++) {
      const k = keysArr[(r * 3 + c * 2) % keysArr.length];
      const s = sprites.get(k);
      if (!s) continue;
      const wob = REDUCED ? 0 : Math.sin(menuT * 1.1 + c * 0.5 + r * 0.35) * 4;
      ctx.drawImage(s, GRID_X + c * BW - SPRITE_PAD, GRID_Y + 40 + r * BH - SPRITE_PAD + wob);
    }
  }
  ctx.restore();
}
let menuT = 0;

function drawBricks() {
  for (const b of bricks) {
    if (!b.alive) continue;
    const s = sprites.get(brickStyleKey(b));
    if (!s) continue;
    let dy = 0;
    if (b.wob > 0) dy = Math.sin(b.wob * 60) * b.wob * 9;
    ctx.drawImage(s, b.x - SPRITE_PAD, b.y - SPRITE_PAD + dy);
    if (b.flash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(b.flash * 4, 0, 0.85);
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, b.x + 3, b.y + 3 + dy, BW - 6, BH - 6, 5);
      ctx.fill();
      ctx.restore();
    }
    if (b.type === 'boom') {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 4 + b.col * 0.7));
      ctx.save();
      ctx.globalAlpha = 0.35 * pulse;
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.arc(b.x + BW / 2, b.y + BH / 2 + dy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawBoss() {
  if (!boss.alive && boss.dieT <= 0) return;
  const a = boss.alive ? 1 : clamp(boss.dieT / 1.2, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  const c = boss.cfg.color;
  if (prog.settings.glow) { ctx.shadowColor = c; ctx.shadowBlur = 24; }
  const grd = ctx.createLinearGradient(0, boss.y, 0, boss.y + boss.h);
  grd.addColorStop(0, shade(c, 0.5));
  grd.addColorStop(0.5, c);
  grd.addColorStop(1, shade(c, -0.5));
  ctx.fillStyle = grd;
  roundRect(ctx, boss.x, boss.y, boss.w, boss.h, 12);
  ctx.fill();
  ctx.shadowBlur = 0;

  // core eye
  const cx = boss.x + boss.w / 2, cy = boss.y + boss.h / 2;
  const eye = 0.5 + 0.5 * Math.sin(elapsed * 3);
  ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : shade(boss.cfg.accent, eye * 0.3);
  ctx.beginPath(); ctx.ellipse(cx, cy, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a0c22';
  ctx.beginPath(); ctx.ellipse(cx + Math.sign(boss.vx) * 6, cy, 9, 11, 0, 0, Math.PI * 2); ctx.fill();

  // armour plates
  ctx.strokeStyle = rgba(boss.cfg.accent, 0.55);
  ctx.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    const px = boss.x + (boss.w / 5) * i;
    ctx.beginPath(); ctx.moveTo(px, boss.y + 6); ctx.lineTo(px, boss.y + boss.h - 6); ctx.stroke();
  }
  roundRect(ctx, boss.x + 2, boss.y + 2, boss.w - 4, boss.h - 4, 11);
  ctx.stroke();

  if (boss.hitFlash > 0) {
    ctx.globalAlpha = clamp(boss.hitFlash * 5, 0, 0.8) * a;
    ctx.fillStyle = '#fff';
    roundRect(ctx, boss.x, boss.y, boss.w, boss.h, 12);
    ctx.fill();
  }
  ctx.restore();
}

function drawShield() {
  if (shieldCharges <= 0) return;
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(elapsed * 5));
  ctx.save();
  if (prog.settings.glow) { ctx.shadowColor = '#ff3df0'; ctx.shadowBlur = 18; }
  ctx.fillStyle = rgba('#ff3df0', 0.35 + 0.3 * pulse);
  ctx.fillRect(6, SHIELD_Y - 4, W - 12, 8);
  ctx.restore();
  ctx.fillStyle = '#ffd6f7';
  ctx.font = 'bold 12px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SHIELD x' + shieldCharges, W / 2, SHIELD_Y + 20);
  ctx.textAlign = 'left';
}

function drawPaddle() {
  const p = paddle;
  const stunned = p.stun > 0;
  const col = stunned ? '#ff7a4d' : (timers.wide > 0 ? '#5cff9d' : '#22e8ff');
  ctx.save();
  if (prog.settings.glow) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  g.addColorStop(0, shade(col, 0.55));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.5));
  ctx.fillStyle = g;
  roundRect(ctx, p.x, p.y, p.w, p.h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, p.x + 4, p.y + 3, p.w - 8, 4, 2);
  ctx.fill();

  if (timers.laser > 0) {
    ctx.fillStyle = '#ff6b6b';
    for (const bx of [p.x + 6, p.x + p.w - 12]) {
      ctx.fillRect(bx, p.y - 7, 6, 8);
    }
    ctx.fillStyle = 'rgba(255,150,150,0.75)';
    for (const bx of [p.x + 7, p.x + p.w - 11]) {
      ctx.fillRect(bx, p.y - 9, 4, 3);
    }
  }
  if (p.flash > 0) {
    ctx.globalAlpha = clamp(p.flash * 3, 0, 0.7);
    ctx.fillStyle = '#fff';
    roundRect(ctx, p.x, p.y, p.w, p.h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (stunned) {
    ctx.strokeStyle = 'rgba(255,180,120,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    roundRect(ctx, p.x - 4, p.y - 4, p.w + 8, p.h + 8, 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBalls(dtReal) {
  const pierce = timers.pierce > 0;
  const sprite = pierce ? ballSpritePierce : ballSprite;
  const off = BALL_R + 10;
  for (const b of balls) {
    if (prog.settings.trails && !REDUCED) {
      b.trail.push(b.x, b.y);
      while (b.trail.length > 16) b.trail.shift();
      ctx.save();
      for (let i = 0; i < b.trail.length; i += 2) {
        const t = i / b.trail.length;
        ctx.globalAlpha = 0.05 + t * 0.22;
        ctx.fillStyle = pierce ? '#ffc44d' : '#3fd9ff';
        ctx.beginPath();
        ctx.arc(b.trail[i], b.trail[i + 1], BALL_R * (0.3 + t * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (sprite) ctx.drawImage(sprite, b.x - off, b.y - off);
    if (b.stuck) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * Math.abs(Math.sin(elapsed * 5))) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x, b.y - 30);
      ctx.moveTo(b.x - 6, b.y - 24); ctx.lineTo(b.x, b.y - 31); ctx.lineTo(b.x + 6, b.y - 24);
      ctx.stroke();
    }
  }
}

function drawPowerupItems() {
  for (const p of powerups) {
    const def = POWERUPS[p.type];
    const bob = Math.sin(p.t * 6) * 2;
    ctx.save();
    if (prog.settings.glow) { ctx.shadowColor = def.color; ctx.shadowBlur = 14; }
    const g = ctx.createLinearGradient(0, p.y - p.h / 2, 0, p.y + p.h / 2);
    g.addColorStop(0, shade(def.color, 0.5));
    g.addColorStop(1, shade(def.color, -0.45));
    ctx.fillStyle = g;
    roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2 + bob, p.w, p.h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2 + bob, p.w, p.h, 7);
    ctx.stroke();
    ctx.fillStyle = '#0b0f1e';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.tag, p.x, p.y + bob + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

function drawBolts() {
  ctx.save();
  if (prog.settings.glow) { ctx.shadowColor = '#ff6b6b'; ctx.shadowBlur = 12; }
  for (const b of bolts) {
    if (!b.active) continue;
    const g = ctx.createLinearGradient(0, b.y - 16, 0, b.y + 6);
    g.addColorStop(0, 'rgba(255,120,120,0)');
    g.addColorStop(0.6, '#ff9b9b');
    g.addColorStop(1, '#fff0f0');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 2.5, b.y - 16, 5, 22);
  }
  ctx.restore();
}

function drawBombs() {
  for (const b of bombs) {
    if (!b.active) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    if (prog.settings.glow) { ctx.shadowColor = '#ff7a4d'; ctx.shadowBlur = 14; }
    ctx.fillStyle = '#2b1408';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff9a5a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd08a';
    ctx.fillRect(-2, -14, 4, 5);
    ctx.restore();
  }
}

function drawParticles() {
  ctx.save();
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (!p.active) continue;
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    const s = p.size * (0.4 + a * 0.8);
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.restore();
}

function drawFloaters() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px Consolas, monospace';
  for (let i = 0; i < MAX_FLOAT; i++) {
    const f = floaters[i];
    if (!f.active) continue;
    ctx.globalAlpha = clamp(f.life / 0.85, 0, 1);
    ctx.font = `bold ${f.size}px Consolas, monospace`;
    ctx.fillStyle = '#04060f';
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawBanner() {
  if (bannerT <= 0) return;
  const a = bannerT > 1.6 ? (2.2 - bannerT) / 0.6 : clamp(bannerT / 1.0, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eafcff';
  if (prog.settings.glow) { ctx.shadowColor = '#22e8ff'; ctx.shadowBlur = 22; }
  ctx.font = 'bold 46px Consolas, monospace';
  ctx.fillText(bannerText, W / 2, H / 2 - 16);
  ctx.font = 'bold 20px Consolas, monospace';
  ctx.fillStyle = '#8fd8ff';
  ctx.fillText(bannerSub, W / 2, H / 2 + 18);
  if (boss && boss.alive && boss.cfg.taunt) {
    ctx.font = '13px Consolas, monospace';
    ctx.fillStyle = '#c8b0ff';
    ctx.fillText(boss.cfg.taunt, W / 2, H / 2 + 48);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
let acc = 0, last = 0, rafId = 0, hudTick = 0;

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  menuT += dt;

  if (state === 'playing') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 10) { update(STEP); acc -= STEP; steps++; }
    if (acc > STEP * 10) acc = 0;

    sessionSeconds += dt;
    playtimeAcc += dt;
    playtimeFlush += dt;
    if (playtimeFlush >= 30) { playtimeFlush = 0; flushPlaytime(false); saveProgress(); }

    hudTick += dt;
    if (hudTick > 0.06) { hudTick = 0; updateHudLive(); }
  } else {
    acc = 0;
    // keep particles/floaters alive on result screens so bursts finish gracefully
    if (state === 'complete' || state === 'over') {
      updateParticles(dt); updateFloaters(dt);
      if (shakeMag > 0) { shakeMag = Math.max(0, shakeMag - dt * 46); shakeX = rnd(-shakeMag, shakeMag) * 0.5; shakeY = rnd(-shakeMag, shakeMag) * 0.5; }
      else shakeX = shakeY = 0;
    }
  }

  render(dt);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'playing') doPause();
    flushPlaytime(true);
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  } else if (!rafId) {
    last = 0;
    rafId = requestAnimationFrame(frame);
  }
});
window.addEventListener('pagehide', () => { flushPlaytime(true); saveProgress(); });
window.addEventListener('beforeunload', () => { flushPlaytime(true); });

// ----------------------------------------------------------------------------
// UI wiring
// ----------------------------------------------------------------------------
function bind(id, fn) {
  const node = $(id);
  if (node) node.addEventListener('click', (e) => { e.preventDefault(); audio.init(); audio.resume(); audio.ui(); fn(); });
}

bind('btnContinue', () => startLevel(clamp(prog.unlocked, 1, LEVEL_COUNT)));
bind('btnLevelSelect', () => setState('levels'));
bind('btnHowTo', () => { howToReturn = 'menu'; setState('howto'); });
bind('btnSettings', () => setState('settings'));
bind('lvClose', () => setState('menu'));
bind('howClose', closeHowTo);
bind('howClose2', closeHowTo);
bind('setClose', () => setState('menu'));
bind('setDone', () => setState('menu'));
bind('btnPause', () => { if (state === 'playing') doPause(); else if (state === 'paused') doResume(); });
bind('btnResume', doResume);
bind('btnRestart', restartLevel);
bind('btnPauseHow', () => { howToReturn = 'paused'; setState('howto'); });
bind('btnPauseLevels', () => setState('levels'));
bind('btnPauseMenu', () => setState('menu'));
bind('btnNext', () => { if (levelNum < LEVEL_COUNT) startLevel(levelNum + 1); });
bind('btnReplay', () => startLevel(levelNum));
bind('btnCompLevels', () => setState('levels'));
bind('btnOverRetry', () => startLevel(levelNum));
bind('btnOverLevels', () => setState('levels'));
bind('btnOverMenu', () => setState('menu'));
bind('btnVicLevels', () => setState('levels'));
bind('btnVicMenu', () => setState('menu'));

el.volSlider.addEventListener('input', () => {
  const v = parseFloat(el.volSlider.value);
  prog.settings.volume = v;
  audio.init();
  audio.setVolume(v);
  el.volVal.textContent = Math.round(v * 100) + '%';
});
el.volSlider.addEventListener('change', () => { audio.ui(); saveProgress(); });
el.cbShake.addEventListener('change', () => { prog.settings.shake = el.cbShake.checked; saveProgress(); });
el.cbGlow.addEventListener('change', () => {
  prog.settings.glow = el.cbGlow.checked;
  rebuildSprites(); rebuildBallSprites();
  saveProgress();
});
el.cbTrails.addEventListener('change', () => { prog.settings.trails = el.cbTrails.checked; saveProgress(); });

let resetArmed = false, resetTimer = 0;
$('btnReset').addEventListener('click', (e) => {
  e.preventDefault();
  audio.init(); audio.ui();
  const btn = $('btnReset');
  if (!resetArmed) {
    resetArmed = true;
    btn.textContent = 'TAP AGAIN TO CONFIRM';
    el.resetNote.textContent = 'This wipes every star, unlock and score. Waiting 5 seconds cancels it.';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      btn.textContent = 'ERASE ALL PROGRESS';
      el.resetNote.textContent = 'Stars, unlocks and career score. This cannot be undone.';
    }, 5000);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  const keepSettings = prog.settings;
  prog = defaultProgress();
  prog.settings = keepSettings;
  btn.textContent = 'ERASE ALL PROGRESS';
  el.resetNote.textContent = 'Progress erased.';
  saveProgress('fresh start');
  refreshMenu();
  buildLevelGrid();
});

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
function applySettingsToUI() {
  el.volSlider.value = String(prog.settings.volume);
  el.volVal.textContent = Math.round(prog.settings.volume * 100) + '%';
  el.cbShake.checked = !!prog.settings.shake;
  el.cbGlow.checked = !!prog.settings.glow;
  el.cbTrails.checked = !!prog.settings.trails;
  audio.volume = prog.settings.volume;
  audio.setVolume(prog.settings.volume);
}

function mergeProgress(blob) {
  if (!blob || typeof blob !== 'object') return;
  const d = defaultProgress();
  prog = {
    v: SAVE_VERSION,
    levels: (blob.levels && typeof blob.levels === 'object') ? blob.levels : d.levels,
    unlocked: clamp(blob.unlocked | 0 || 1, 1, LEVEL_COUNT),
    career: blob.career | 0,
    powerups: blob.powerups | 0,
    laserKills: blob.laserKills | 0,
    booms: blob.booms | 0,
    bosses: (blob.bosses && typeof blob.bosses === 'object') ? blob.bosses : {},
    bricks: blob.bricks | 0,
    plays: blob.plays | 0,
    settings: Object.assign({}, d.settings, blob.settings || {}),
  };
}

window.__empireMigrate = function (blob) { return blob; };

async function boot() {
  if (REDUCED) { /* defaults tuned down below */ }
  resize();
  rebuildSprites();
  rebuildBallSprites();

  try {
    empire = new EmpireClient(empireOpts);
    await empire.connect();
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) mergeProgress(rec.blob);
    const s = await empire.getSettings();
    applyHubSettings(s);
  } catch {
    // standalone / hub trouble: play on with defaults
  }

  if (REDUCED) { prog.settings.shake = false; prog.settings.glow = prog.settings.glow && false; }
  applySettingsToUI();
  rebuildSprites();
  rebuildBallSprites();

  levelDef = LEVELS[0];
  updateHudAll();
  setState('menu');
  checkAchievements();

  last = 0;
  rafId = requestAnimationFrame(frame);
}

boot();
