/* =============================================================================
 * TETRO STACK — Gaming Empire (canvas2d, offline)
 * 7-bag randomiser · SRS rotation + wall kicks · hold · ghost · lock delay
 * soft/hard drop · T-spins · combo + back-to-back · Marathon / Sprint / Ultra
 * ========================================================================== */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'tetro-stack',statusKey:'__tetroStackAssetStatus',accent:0x47d3ff,getState:()=>({active:G?.mode==='play',motion:Math.min(1,(G?.score||0)/1000),danger:0})});

/* ============================== CONSTANTS ================================= */

const GAME_ID = 'tetro-stack';
const SAVE_VERSION = 1;

const COLS = 10;
const ROWS = 22;      // 2 buffer rows above the "real" field
const HIDDEN = 2;

const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const COLORS = {
  I: '#22d3ee', J: '#3b82f6', L: '#f59e0b', O: '#facc15',
  S: '#22c55e', T: '#a855f7', Z: '#ef4444',
};

// Cell coordinates for each of the 4 rotation states, inside the piece box.
const SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

// SRS kick tables, converted to screen space (y grows downward).
const KICK_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICK_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const CLEAR_DELAY = 0.26;
const ARE_DELAY = 0.07;
const MARATHON_GOAL = 150;
const SPRINT_GOAL = 40;
const ULTRA_TIME = 120;
const MAX_LEVEL = 20;

const MODE_NAMES = { marathon: 'MARATHON', sprint: 'SPRINT 40L', ultra: 'ULTRA 2:00' };

const ACH_TITLES = {
  first_lines: 'Break The Ice',
  quad_master: 'Quad Damage',
  spin_doctor: 'Spin Doctor',
  b2b_streak: 'Chain Reaction',
  combo_carnival: 'Combo Carnival',
  sprint_ace: 'Sprint Ace',
  ultra_titan: 'Ultra Titan',
  perfect_clear: 'Spotless',
  marathon_champion: 'Marathon Champion',
  line_veteran: 'Line Veteran',
};

/* ================================ UTILS =================================== */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function fmtNum(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtClock(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function fmtMs(ms) {
  if (!ms) return '—';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total * 100) % 100);
  return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function gravitySeconds(level) {
  const l = clamp(level, 1, MAX_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

/* ================================ AUDIO =================================== */

const Sfx = {
  ctx: null,
  master: null,
  musicGain: null,
  ready: false,
  enabled: true,
  volume: 0.7,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.musicGain.connect(this.master);
      this.ready = true;
    } catch (e) { this.ready = false; }
  },
  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  },
  tone(freq, dur, type, gain, slideTo, dest) {
    if (!this.ready || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  noise(dur, gain, filterHz) {
    if (!this.ready || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterHz || 1200;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  move()      { this.tone(220, 0.045, 'square', 0.045); },
  rotate()    { this.tone(400, 0.05, 'triangle', 0.07, 520); },
  kick()      { this.tone(320, 0.07, 'sawtooth', 0.05, 480); },
  hold()      { this.tone(520, 0.09, 'triangle', 0.07, 700); },
  lock()      { this.tone(150, 0.07, 'square', 0.06, 90); this.noise(0.05, 0.05, 900); },
  drop()      { this.tone(110, 0.1, 'square', 0.09, 55); this.noise(0.09, 0.1, 700); },
  land()      { this.tone(180, 0.05, 'sine', 0.05, 120); },
  clear(n, b2b) {
    const base = [0, 523.25, 587.33, 659.25, 783.99][clamp(n, 1, 4)];
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(1.26, i);
      setTimeout(() => this.tone(f, 0.16, 'triangle', 0.1), i * 55);
    }
    if (n >= 4 || b2b) setTimeout(() => this.tone(1046.5, 0.3, 'sawtooth', 0.07, 1568), 120);
  },
  combo(c) { this.tone(400 + c * 60, 0.1, 'triangle', 0.08, 620 + c * 70); },
  tspin() {
    this.tone(660, 0.12, 'sawtooth', 0.07, 990);
    setTimeout(() => this.tone(990, 0.18, 'triangle', 0.08, 1320), 90);
  },
  perfect() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.28, 'triangle', 0.09), i * 70));
  },
  levelUp() {
    [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.07), i * 70));
  },
  over() {
    [440, 392, 330, 262, 196].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.08), i * 130));
  },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.24, 'triangle', 0.09), i * 110));
  },
};

/* Simple procedural music: pentatonic arp + bass, tempo rises with level. */
const Music = {
  on: false,
  timer: 0,
  step: 0,
  nextTime: 0,
  arp: [0, 3, 5, 7, 5, 3, 7, 10, 0, 3, 5, 12, 10, 7, 5, 3],
  bass: [0, -1, 7, -1, 3, -1, 7, -1, 0, -1, 5, -1, 3, -1, 10, -1],

  start() {
    if (this.on || !Sfx.ready) return;
    this.on = true;
    this.step = 0;
    this.nextTime = Sfx.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 30);
  },
  stop() {
    this.on = false;
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
  },
  schedule() {
    if (!this.on || !Sfx.ready) return;
    const bpm = clamp(104 + (G.level - 1) * 3.4, 104, 168);
    const stepDur = 60 / bpm / 4;
    const now = Sfx.ctx.currentTime;
    while (this.nextTime < now + 0.12) {
      const s = this.step % 16;
      const semi = this.arp[s];
      const f = 220 * Math.pow(2, semi / 12);
      Sfx.tone(f, stepDur * 1.6, 'triangle', 0.05, null, Sfx.musicGain);
      const bs = this.bass[s];
      if (bs >= 0) {
        Sfx.tone(110 * Math.pow(2, bs / 12), stepDur * 2.4, 'sine', 0.11, null, Sfx.musicGain);
      }
      this.nextTime += stepDur;
      this.step++;
    }
  },
};

/* ============================== PERSISTENCE =============================== */

const settings = {
  ghost: true, grid: true, shake: true, touch: false, music: true,
  vol: 0.7, das: 133, arr: 33, sdf: 20,
};

const records = {
  marathon: { score: 0, lines: 0, level: 1, cleared: false, timeMs: 0 },
  sprint: { ms: 0, level: 1 },
  ultra: { score: 0, lines: 0 },
};

const stats = {
  totalLines: 0, totalPieces: 0, games: 0,
  maxCombo: 0, maxB2B: 0, quads: 0, tspins: 0, perfects: 0,
};

const achDone = new Set();
let achProgress = {};

/* =============================== GAME STATE =============================== */

const G = {
  phase: 'menu',            // menu | play | pause | over
  mode: 'marathon',
  startLevel: 1,
  board: [],
  active: null,             // {type, rot, x, y}
  hold: null,
  canHold: true,
  queue: [],
  bag: [],
  score: 0, lines: 0, level: 1,
  combo: -1, b2b: 0, bestB2B: 0,
  clearRows: [], clearT: 0, spawnT: 0,
  lockTimer: LOCK_DELAY, lockResets: 0, lowestY: -99, grounded: false,
  gravAcc: 0, isRecord: false,
  elapsed: 0, pieces: 0, maxCombo: 0,
  lastAction: 'none', lastKick: 0,
  softHeld: false, softCells: 0,
  finishedAt: 0, won: false,
  runStats: { quads: 0, tspins: 0, perfects: 0, holds: 0 },
};

function emptyBoard() {
  const b = [];
  for (let y = 0; y < ROWS; y++) b.push(new Array(COLS).fill(null));
  return b;
}
G.board = emptyBoard();

/* Effects */
const particles = [];
for (let i = 0; i < 260; i++) particles.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff' });
const flyTexts = [];
const bgPieces = [];
let shake = 0;
let flashT = 0;

/* =============================== EMPIRE =================================== */

let empire = null;
let playtimeAcc = 0;
let playtimeSinceReport = 0;
let saveDirty = false;
let saveTimer = 0;

function achieve(id, progress) {
  const p = progress === undefined ? 1 : progress;
  const prev = achProgress[id] || 0;
  if (achDone.has(id)) return;
  if (p <= prev && p < 1) return;
  achProgress[id] = Math.max(prev, p);
  if (p >= 1) {
    achDone.add(id);
    domToast('🏅 ' + (ACH_TITLES[id] || id), 'Achievement unlocked');
  }
  if (empire) empire.unlockAchievement(id, Math.min(1, p)).catch(() => {});
}

function markSave() { saveDirty = true; }

async function doSave() {
  saveDirty = false;
  if (!empire) return;
  const blob = {
    v: SAVE_VERSION,
    settings: { ...settings },
    records: JSON.parse(JSON.stringify(records)),
    stats: { ...stats },
    ach: Array.from(achDone),
    achP: achProgress,
  };
  const meta = {
    label: 'Best ' + fmtNum(records.marathon.score) + ' · ' + fmtNum(stats.totalLines) + ' lines',
    playtimeSec: Math.floor(playtimeAcc),
    progress: clamp(stats.totalLines / 1000, 0, 1),
    mode: G.mode,
  };
  try {
    await empire.saveState('auto', blob, meta);
    await empire.setContinuePoint('auto', meta.label);
  } catch (e) { /* offline-safe */ }
}

async function doLoad() {
  if (!empire) return;
  let rec = null;
  try { rec = await empire.loadState('auto'); } catch (e) { rec = null; }
  const b = rec && rec.blob;
  if (!b) return;
  if (b.settings) Object.assign(settings, b.settings);
  if (b.records) {
    if (b.records.marathon) Object.assign(records.marathon, b.records.marathon);
    if (b.records.sprint) Object.assign(records.sprint, b.records.sprint);
    if (b.records.ultra) Object.assign(records.ultra, b.records.ultra);
  }
  if (b.stats) Object.assign(stats, b.stats);
  if (Array.isArray(b.ach)) b.ach.forEach((id) => achDone.add(id));
  if (b.achP) achProgress = b.achP;
}

window.__empireMigrate = function (blob) { return blob; };

/* ============================ PIECE MECHANICS ============================= */

function refillBag() {
  const b = TYPES.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = b[i]; b[i] = b[j]; b[j] = t;
  }
  G.bag = b;
}
function nextFromBag() {
  if (G.bag.length === 0) refillBag();
  return G.bag.pop();
}
function fillQueue() {
  while (G.queue.length < 7) G.queue.push(nextFromBag());
}

function cellsOf(type, rot) { return SHAPES[type][((rot % 4) + 4) % 4]; }

function canPlace(type, rot, px, py) {
  const cells = cellsOf(type, rot);
  for (let i = 0; i < 4; i++) {
    const x = px + cells[i][0];
    const y = py + cells[i][1];
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y < 0) continue;
    if (G.board[y][x]) return false;
  }
  return true;
}

function spawnPiece(type) {
  const p = { type, rot: 0, x: 3, y: 0 };
  G.active = p;
  G.canHold = true;
  G.gravAcc = 0;
  G.lockTimer = LOCK_DELAY;
  G.lockResets = 0;
  G.lowestY = p.y;
  G.grounded = false;
  G.lastAction = 'spawn';
  G.lastKick = 0;
  G.softCells = 0;
  if (!canPlace(p.type, p.rot, p.x, p.y)) {
    // try nudging up into the buffer before declaring a top-out
    if (canPlace(p.type, p.rot, p.x, p.y - 1)) { p.y -= 1; }
    else { G.active = null; endRun(false); return; }
  }
  // buffered inputs
  if (input.bufHold) { input.bufHold = false; holdPiece(); }
  if (input.bufRot !== 0) { rotate(input.bufRot); input.bufRot = 0; }
}

function spawnFromQueue() {
  fillQueue();
  const t = G.queue.shift();
  fillQueue();
  spawnPiece(t);
}

function tryMove(dx, dy) {
  const p = G.active;
  if (!p) return false;
  if (!canPlace(p.type, p.rot, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy;
  G.lastAction = 'move';
  if (dy > 0) descended();
  else resetLockOnAction();
  return true;
}

function descended() {
  const p = G.active;
  if (p.y > G.lowestY) {
    G.lowestY = p.y;
    G.lockResets = 0;
    G.lockTimer = LOCK_DELAY;
  }
}

function resetLockOnAction() {
  const p = G.active;
  if (!p) return;
  if (canPlace(p.type, p.rot, p.x, p.y + 1)) return; // airborne: timer idles anyway
  if (G.lockResets < MAX_LOCK_RESETS) {
    G.lockResets++;
    G.lockTimer = LOCK_DELAY;
  }
}

function rotate(dir) {
  const p = G.active;
  if (!p) return false;
  if (p.type === 'O') { Sfx.rotate(); return true; }
  const from = p.rot;
  const to = ((from + dir) % 4 + 4) % 4;
  const table = p.type === 'I' ? KICK_I : KICK_JLSTZ;
  const kicks = table['' + from + to] || [[0, 0]];
  for (let i = 0; i < kicks.length; i++) {
    const kx = kicks[i][0], ky = kicks[i][1];
    if (canPlace(p.type, to, p.x + kx, p.y + ky)) {
      p.rot = to; p.x += kx; p.y += ky;
      G.lastAction = 'rotate';
      G.lastKick = i;
      resetLockOnAction();
      if (i === 0) Sfx.rotate(); else Sfx.kick();
      if (p.y > G.lowestY) { G.lowestY = p.y; G.lockResets = 0; }
      return true;
    }
  }
  return false;
}

function holdPiece() {
  if (!G.active || !G.canHold) return;
  const cur = G.active.type;
  Sfx.hold();
  G.runStats.holds++;
  if (G.hold == null) {
    G.hold = cur;
    fillQueue();
    const t = G.queue.shift();
    fillQueue();
    spawnPiece(t);
  } else {
    const swap = G.hold;
    G.hold = cur;
    spawnPiece(swap);
  }
  G.canHold = false;
}

function ghostY() {
  const p = G.active;
  if (!p) return 0;
  let y = p.y;
  while (canPlace(p.type, p.rot, p.x, y + 1)) y++;
  return y;
}

function hardDrop() {
  const p = G.active;
  if (!p) return;
  let cells = 0;
  while (canPlace(p.type, p.rot, p.x, p.y + 1)) { p.y++; cells++; }
  if (cells > 0) {
    G.score += cells * 2;
    G.lastAction = 'move';
  }
  Sfx.drop();
  addShake(Math.min(7, 2.2 + cells * 0.28));
  lockPiece(true);
}

/* T-spin detection (3-corner rule with front-corner refinement). */
function occupiedFor(x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return true;
  if (y < 0) return true;
  return !!G.board[y][x];
}
function detectTSpin() {
  const p = G.active;
  if (!p || p.type !== 'T' || G.lastAction !== 'rotate') return 'none';
  const cx = p.x + 1, cy = p.y + 1;
  const tl = occupiedFor(cx - 1, cy - 1);
  const tr = occupiedFor(cx + 1, cy - 1);
  const bl = occupiedFor(cx - 1, cy + 1);
  const br = occupiedFor(cx + 1, cy + 1);
  const total = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0);
  if (total < 3) return 'none';
  let frontA, frontB;
  if (p.rot === 0) { frontA = tl; frontB = tr; }
  else if (p.rot === 1) { frontA = tr; frontB = br; }
  else if (p.rot === 2) { frontA = bl; frontB = br; }
  else { frontA = tl; frontB = bl; }
  if (frontA && frontB) return 'full';
  if (G.lastKick === 4) return 'full';
  return 'mini';
}

function lockPiece(fromHardDrop) {
  const p = G.active;
  if (!p) return;
  const spin = detectTSpin();
  const cells = cellsOf(p.type, p.rot);
  let allHidden = true;
  for (let i = 0; i < 4; i++) {
    const x = p.x + cells[i][0];
    const y = p.y + cells[i][1];
    if (y >= 0 && y < ROWS) {
      G.board[y][x] = p.type;
      if (y >= HIDDEN) allHidden = false;
    }
  }
  G.active = null;
  G.pieces++;
  stats.totalPieces++;
  if (!fromHardDrop) Sfx.lock();

  // find full rows
  const full = [];
  for (let y = 0; y < ROWS; y++) {
    let ok = true;
    for (let x = 0; x < COLS; x++) if (!G.board[y][x]) { ok = false; break; }
    if (ok) full.push(y);
  }

  if (allHidden && full.length === 0) { endRun(false); return; }

  if (full.length > 0) {
    G.clearRows = full;
    G.clearT = reduceMotion ? 0.08 : CLEAR_DELAY;
    scoreClear(full.length, spin);
    if (settings.shake && !reduceMotion) {
      for (let i = 0; i < full.length; i++) spawnRowParticles(full[i]);
      addShake(full.length >= 4 ? 9 : 3 + full.length);
    }
    flashT = full.length >= 4 ? 0.3 : 0.14;
  } else {
    if (spin !== 'none') {
      const pts = (spin === 'mini' ? 100 : 400) * G.level;
      G.score += pts;
      pushText(spin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN', '+' + fmtNum(pts), '#a855f7');
      Sfx.tspin();
      G.runStats.tspins++;
      stats.tspins++;
    }
    G.combo = -1;
    G.spawnT = ARE_DELAY;
  }
  markSave();
}

function scoreClear(n, spin) {
  const lvl = G.level;
  let base = 0;
  let label = '';
  let difficult = false;

  if (spin === 'full') {
    difficult = true;
    if (n === 1) { base = 800; label = 'T-SPIN SINGLE'; }
    else if (n === 2) { base = 1200; label = 'T-SPIN DOUBLE'; }
    else { base = 1600; label = 'T-SPIN TRIPLE'; }
  } else if (spin === 'mini') {
    difficult = true;
    base = n === 1 ? 200 : 400;
    label = 'T-SPIN MINI ' + (n === 1 ? 'SINGLE' : 'DOUBLE');
  } else {
    if (n === 1) { base = 100; label = 'SINGLE'; }
    else if (n === 2) { base = 300; label = 'DOUBLE'; }
    else if (n === 3) { base = 500; label = 'TRIPLE'; }
    else { base = 800; label = 'QUAD'; difficult = true; }
  }

  let b2bBonus = false;
  if (difficult) {
    if (G.b2b > 0) b2bBonus = true;
    G.b2b++;
    if (G.b2b - 1 > G.bestB2B) G.bestB2B = G.b2b - 1;
  } else {
    G.b2b = 0;
  }

  let pts = base * lvl;
  if (b2bBonus) pts = Math.floor(pts * 1.5);

  G.combo++;
  let comboPts = 0;
  if (G.combo > 0) {
    comboPts = 50 * G.combo * lvl;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  }

  // perfect clear check (board will be empty after removal)
  let perfect = true;
  const rowSet = new Set(G.clearRows);
  for (let y = 0; y < ROWS && perfect; y++) {
    if (rowSet.has(y)) continue;
    for (let x = 0; x < COLS; x++) if (G.board[y][x]) { perfect = false; break; }
  }
  let pcPts = 0;
  if (perfect) {
    pcPts = (n === 1 ? 800 : n === 2 ? 1200 : n === 3 ? 1800 : (b2bBonus ? 3200 : 2000)) * lvl;
    G.runStats.perfects++;
    stats.perfects++;
    achieve('perfect_clear');
  }

  G.score += pts + comboPts + pcPts;
  G.lines += n;
  stats.totalLines += n;

  if (n >= 4) { G.runStats.quads++; stats.quads++; achieve('quad_master'); }
  if (spin !== 'none') { G.runStats.tspins++; stats.tspins++; }
  achieve('first_lines');
  if (spin === 'full' && n >= 2) achieve('spin_doctor');
  achieve('line_veteran', clamp(stats.totalLines / 1000, 0, 1));
  if (G.b2b > 1) achieve('b2b_streak', clamp((G.b2b - 1) / 5, 0, 1));
  if (G.combo > 0) achieve('combo_carnival', clamp((G.combo + 1) / 8, 0, 1));
  if (G.maxCombo > stats.maxCombo) stats.maxCombo = G.maxCombo;
  if (G.bestB2B > stats.maxB2B) stats.maxB2B = G.bestB2B;

  // feedback
  pushText(label + (b2bBonus ? '  B2B' : ''), '+' + fmtNum(pts), spin !== 'none' ? '#c084fc' : (n >= 4 ? '#22d3ee' : '#9fe8ff'));
  if (G.combo > 0) {
    pushText('COMBO x' + G.combo, '+' + fmtNum(comboPts), '#ffd27f', 0.16);
    Sfx.combo(clamp(G.combo, 1, 10));
  }
  if (perfect) {
    pushText('PERFECT CLEAR', '+' + fmtNum(pcPts), '#7ff0ff', 0.3);
    Sfx.perfect();
    addShake(10);
  } else if (spin !== 'none') Sfx.tspin();
  Sfx.clear(n, b2bBonus);

  // level progression
  if (G.mode !== 'sprint') {
    const target = Math.min(MAX_LEVEL, G.startLevel + Math.floor(G.lines / 10));
    if (target > G.level) {
      G.level = target;
      pushText('LEVEL ' + G.level, 'gravity up', '#ffd27f', 0.45);
      Sfx.levelUp();
    }
  }
}

function finishClear() {
  const rows = G.clearRows.slice().sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) {
    G.board.splice(rows[i], 1);
    G.board.unshift(new Array(COLS).fill(null));
  }
  G.clearRows = [];
  // mode goals
  if (G.mode === 'marathon' && G.lines >= MARATHON_GOAL) { endRun(true); return; }
  if (G.mode === 'sprint' && G.lines >= SPRINT_GOAL) { endRun(true); return; }
  G.spawnT = ARE_DELAY;
}

/* ============================== RUN CONTROL =============================== */

function startRun(mode) {
  G.mode = mode;
  G.startLevel = clamp(parseInt($('selStart').value, 10) || 1, 1, 15);
  G.board = emptyBoard();
  G.active = null;
  G.hold = null;
  G.canHold = true;
  G.bag = [];
  G.queue = [];
  fillQueue();
  G.score = 0; G.lines = 0;
  G.level = G.startLevel;
  G.combo = -1; G.b2b = 0; G.bestB2B = 0;
  G.clearRows = []; G.clearT = 0; G.spawnT = 0.12;
  G.lockTimer = LOCK_DELAY; G.lockResets = 0; G.lowestY = -99;
  G.gravAcc = 0;
  G.elapsed = 0; G.pieces = 0; G.maxCombo = 0;
  G.softHeld = false;
  G.won = false;
  G.runStats = { quads: 0, tspins: 0, perfects: 0, holds: 0 };
  input.reset();
  flyTexts.length = 0;
  for (let i = 0; i < particles.length; i++) particles[i].on = false;
  shake = 0; flashT = 0;
  G.phase = 'play';
  stats.games++;
  showOverlay(null);
  $('hudRoot').classList.remove('hidden');
  updateTouchVisibility();
  Sfx.resume();
  if (settings.music) Music.start();
  markSave();
}

function endRun(won) {
  if (G.phase === 'over') return;
  G.phase = 'over';
  G.won = !!won;
  G.active = null;
  G.finishedAt = G.elapsed;
  Music.stop();
  if (won) Sfx.win(); else Sfx.over();
  if (!won) addShake(8);

  // records
  let isRecord = false;
  if (G.mode === 'marathon') {
    if (G.lines > records.marathon.lines) records.marathon.lines = G.lines;
    if (G.score > records.marathon.score) {
      records.marathon.score = G.score;
      records.marathon.level = G.level;
      records.marathon.timeMs = Math.round(G.elapsed * 1000);
      isRecord = true;
    }
    if (won) records.marathon.cleared = true;
    if (won) achieve('marathon_champion', 1);
    else achieve('marathon_champion', clamp(G.lines / MARATHON_GOAL, 0, 0.99));
  } else if (G.mode === 'sprint') {
    if (won) {
      const ms = Math.round(G.elapsed * 1000);
      if (records.sprint.ms === 0 || ms < records.sprint.ms) {
        records.sprint = { ms, level: G.startLevel };
        isRecord = true;
      }
      if (ms < 60000) achieve('sprint_ace');
    }
  } else if (G.mode === 'ultra') {
    if (G.score > records.ultra.score) {
      records.ultra = { score: G.score, lines: G.lines };
      isRecord = true;
    }
    achieve('ultra_titan', clamp(G.score / 20000, 0, 1));
  }
  G.isRecord = isRecord;

  showResult();
  doSave();
  try {
    if (empire && cv.width > 0) empire.screenshot(cv.toDataURL('image/jpeg', 0.55)).catch(() => {});
  } catch (e) { /* tainted or unsupported */ }
}

function pauseGame() {
  if (G.phase !== 'play') return;
  G.phase = 'pause';
  input.reset();
  Music.stop();
  $('pauseSub').textContent = MODE_NAMES[G.mode];
  showOverlay('pause');
}
function resumeGame() {
  if (G.phase !== 'pause') return;
  G.phase = 'play';
  input.reset();
  showOverlay(null);
  Sfx.resume();
  if (settings.music) Music.start();
}
function quitToMenu() {
  G.phase = 'menu';
  Music.stop();
  input.reset();
  $('hudRoot').classList.add('hidden');
  refreshMenu();
  showOverlay('menu');
  doSave();
}

/* ================================ INPUT =================================== */

const input = {
  dir: 0, dasT: 0, arrT: 0,
  leftHeld: false, rightHeld: false,
  bufRot: 0, bufHold: false,
  reset() {
    this.dir = 0; this.dasT = 0; this.arrT = 0;
    this.leftHeld = false; this.rightHeld = false;
    this.bufRot = 0; this.bufHold = false;
    G.softHeld = false;
  },
};

function pressDir(d) {
  if (d < 0) input.leftHeld = true; else input.rightHeld = true;
  input.dir = d;
  input.dasT = settings.das / 1000;
  input.arrT = 0;
  if (G.active && tryMove(d, 0)) Sfx.move();
}
function releaseDir(d) {
  if (d < 0) input.leftHeld = false; else input.rightHeld = false;
  if (input.leftHeld && !input.rightHeld) { input.dir = -1; input.dasT = settings.das / 1000; }
  else if (input.rightHeld && !input.leftHeld) { input.dir = 1; input.dasT = settings.das / 1000; }
  else if (!input.leftHeld && !input.rightHeld) input.dir = 0;
}

function handleShift(dt, frozen) {
  if (input.dir === 0) return;
  if (input.dasT > 0) {
    input.dasT -= dt;
    if (input.dasT > 0) return;
    input.arrT = 0;
  }
  if (frozen || !G.active) return;
  const arr = settings.arr / 1000;
  if (arr <= 0.001) {
    let moved = false;
    while (tryMove(input.dir, 0)) moved = true;
    if (moved) Sfx.move();
    return;
  }
  input.arrT -= dt;
  let guard = 0;
  while (input.arrT <= 0 && guard++ < COLS) {
    input.arrT += arr;
    if (tryMove(input.dir, 0)) Sfx.move(); else break;
  }
}

function actionRotate(dir) {
  if (G.phase !== 'play') return;
  if (!G.active) { input.bufRot = dir; return; }
  rotate(dir);
}
function actionHold() {
  if (G.phase !== 'play') return;
  if (!G.active) { input.bufHold = true; return; }
  holdPiece();
}
function actionHardDrop() {
  if (G.phase !== 'play' || !G.active) return;
  hardDrop();
}

const KEY_LEFT = ['ArrowLeft', 'KeyA'];
const KEY_RIGHT = ['ArrowRight', 'KeyD'];
const KEY_DOWN = ['ArrowDown', 'KeyS'];
const KEY_CW = ['ArrowUp', 'KeyX', 'KeyW'];
const KEY_CCW = ['KeyZ', 'ControlLeft', 'ControlRight'];
const KEY_HOLD = ['KeyC', 'ShiftLeft', 'ShiftRight'];

window.addEventListener('keydown', (e) => {
  Sfx.resume();
  const c = e.code;
  const stop = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c);
  if (stop && (G.phase === 'play' || G.phase === 'pause')) e.preventDefault();

  if (c === 'Escape' || c === 'KeyP') {
    e.preventDefault();
    if (G.phase === 'play') pauseGame();
    else if (G.phase === 'pause') resumeGame();
    else if (!$('mainMenu').classList.contains('hidden')) { /* already home */ }
    else if (G.phase === 'menu') showOverlay('menu');
    return;
  }
  if (G.phase === 'over' && (c === 'Enter' || c === 'Space')) { startRun(G.mode); return; }
  if (G.phase === 'menu' && c === 'Enter') { startRun(G.mode); return; }
  if (G.phase !== 'play') return;

  if (c === 'KeyR') { startRun(G.mode); return; }
  if (e.repeat) return;

  if (KEY_LEFT.includes(c)) pressDir(-1);
  else if (KEY_RIGHT.includes(c)) pressDir(1);
  else if (KEY_DOWN.includes(c)) G.softHeld = true;
  else if (KEY_CW.includes(c)) actionRotate(1);
  else if (KEY_CCW.includes(c)) actionRotate(-1);
  else if (KEY_HOLD.includes(c)) actionHold();
  else if (c === 'Space') actionHardDrop();
});

window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (KEY_LEFT.includes(c)) releaseDir(-1);
  else if (KEY_RIGHT.includes(c)) releaseDir(1);
  else if (KEY_DOWN.includes(c)) G.softHeld = false;
});

window.addEventListener('blur', () => { input.reset(); if (G.phase === 'play') pauseGame(); });

/* Touch / pointer controls */
function bindHold(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.resume();
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    onDown();
  });
  const up = (e) => { if (onUp) onUp(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

function setupTouch() {
  bindHold($('tcLeft'), () => { if (G.phase === 'play') pressDir(-1); }, () => releaseDir(-1));
  bindHold($('tcRight'), () => { if (G.phase === 'play') pressDir(1); }, () => releaseDir(1));
  bindHold($('tcDown'), () => { if (G.phase === 'play') G.softHeld = true; }, () => { G.softHeld = false; });
  bindHold($('tcCW'), () => actionRotate(1), null);
  bindHold($('tcCCW'), () => actionRotate(-1), null);
  bindHold($('tcHold'), () => actionHold(), null);
  bindHold($('tcDrop'), () => actionHardDrop(), null);
}

function updateTouchVisibility() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const show = (settings.touch || coarse) && (G.phase === 'play' || G.phase === 'pause');
  $('touchControls').classList.toggle('hidden', !show);
}

/* ================================ EFFECTS ================================= */

function addShake(v) {
  if (!settings.shake || reduceMotion) return;
  shake = Math.min(14, shake + v);
}
function spawnParticle(x, y, color) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.on) {
      p.on = true;
      p.x = x; p.y = y;
      p.vx = (Math.random() - 0.5) * 190;
      p.vy = -Math.random() * 170 - 30;
      p.max = 0.5 + Math.random() * 0.5;
      p.life = p.max;
      p.size = 2 + Math.random() * 3.5;
      p.color = color;
      return;
    }
  }
}
function spawnRowParticles(row) {
  for (let x = 0; x < COLS; x++) {
    const c = G.board[row][x];
    if (!c) continue;
    const px = L.bx + x * L.cell + L.cell / 2;
    const py = L.by + row * L.cell + L.cell / 2;
    for (let k = 0; k < 3; k++) spawnParticle(px, py, COLORS[c] || '#fff');
  }
}
function pushText(main, sub, color, delay) {
  flyTexts.push({ main, sub: sub || '', color: color || '#fff', t: -(delay || 0), life: 1.5 });
}
function updateEffects(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
  if (flashT > 0) flashT = Math.max(0, flashT - dt);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vy += 460 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = flyTexts.length - 1; i >= 0; i--) {
    const f = flyTexts[i];
    f.t += dt;
    if (f.t > f.life) flyTexts.splice(i, 1);
  }
  // menu backdrop
  for (let i = 0; i < bgPieces.length; i++) {
    const b = bgPieces[i];
    b.y += b.vy * dt;
    b.rotT += dt;
    if (b.y > 1.15) { b.y = -0.2; b.x = Math.random(); b.type = TYPES[(Math.random() * 7) | 0]; }
  }
}

/* ================================ RENDER ================================== */

const cv = $('gl');
const ctx = cv.getContext('2d', { alpha: false });
const L = { cell: 24, bx: 0, by: 0, w: 0, h: 0, leftX: 0, rightX: 0, panelW: 0, dpr: 1 };

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || window.innerWidth;
  const h = cv.clientHeight || window.innerHeight;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  L.dpr = dpr; L.w = w; L.h = h;

  const cell = Math.max(9, Math.floor(Math.min(w / 21.6, h / 23.2)));
  L.cell = cell;
  L.panelW = cell * 4.7;
  const gap = cell * 0.55;
  const totalW = COLS * cell + (L.panelW + gap) * 2;
  L.bx = Math.round((w - totalW) / 2 + L.panelW + gap);
  L.by = Math.round(Math.max(cell * 0.4, (h - ROWS * cell) / 2));
  L.leftX = Math.round(L.bx - gap - L.panelW);
  L.rightX = Math.round(L.bx + COLS * cell + gap);
}

function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Gradients are cached per colour+size and drawn in translated local space,
   so a full board costs no gradient allocations per frame. */
const gradCache = new Map();
function cellGrad(color, s) {
  const key = color + '|' + Math.round(s * 4);
  let g = gradCache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, shade(color, 1.32));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, 0.6));
    gradCache.set(key, g);
  }
  return g;
}
const edgeCache = new Map();
function edgeColor(color) {
  let c = edgeCache.get(color);
  if (!c) { c = shade(color, 0.42); edgeCache.set(color, c); }
  return c;
}

function drawCell(px, py, s, color, alpha, ghost) {
  const rad = Math.max(2, s * 0.17);
  const a = alpha == null ? 1 : alpha;
  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = a;
  if (ghost) {
    ctx.fillStyle = color;
    ctx.globalAlpha = a * 0.13;
    rr(1.5, 1.5, s - 3, s - 3, rad);
    ctx.fill();
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, s * 0.075);
    rr(2, 2, s - 4, s - 4, rad);
    ctx.stroke();
  } else {
    ctx.fillStyle = cellGrad(color, s);
    rr(1, 1, s - 2, s - 2, rad);
    ctx.fill();
    ctx.globalAlpha = a * 0.3;
    ctx.fillStyle = '#ffffff';
    rr(s * 0.17, s * 0.13, s * 0.66, s * 0.2, rad * 0.6);
    ctx.fill();
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = edgeColor(color);
    ctx.lineWidth = 1;
    rr(1, 1, s - 2, s - 2, rad);
    ctx.stroke();
  }
  ctx.restore();
}

function pieceBounds(type) {
  const cells = SHAPES[type][0];
  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  for (let i = 0; i < 4; i++) {
    minX = Math.min(minX, cells[i][0]); maxX = Math.max(maxX, cells[i][0]);
    minY = Math.min(minY, cells[i][1]); maxY = Math.max(maxY, cells[i][1]);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function drawMiniPiece(type, cx, cy, s, alpha) {
  const b = pieceBounds(type);
  const cells = SHAPES[type][0];
  const ox = cx - (b.w * s) / 2 - b.minX * s;
  const oy = cy - (b.h * s) / 2 - b.minY * s;
  for (let i = 0; i < 4; i++) {
    drawCell(ox + cells[i][0] * s, oy + cells[i][1] * s, s, COLORS[type], alpha, false);
  }
}

function panelBox(x, y, w, h, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,30,0.72)';
  rr(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,130,210,0.42)';
  ctx.lineWidth = 1;
  rr(x, y, w, h, 8);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#6f88b8';
    ctx.font = '600 ' + Math.max(9, Math.round(L.cell * 0.36)) + 'px Segoe UI, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + 8, y + 6);
  }
  ctx.restore();
}

function statBlock(x, y, w, label, value, color, big) {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6f88b8';
  ctx.font = '600 ' + Math.max(9, Math.round(L.cell * 0.34)) + 'px Segoe UI, monospace';
  ctx.fillText(label, x, y);
  ctx.fillStyle = color || '#e8f2ff';
  ctx.font = '700 ' + Math.max(12, Math.round(L.cell * (big ? 0.72 : 0.56))) + 'px Segoe UI, monospace';
  ctx.fillText(value, x, y + Math.round(L.cell * 0.4));
  ctx.restore();
  return y + Math.round(L.cell * (big ? 1.25 : 1.05));
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#0a0f22');
  g.addColorStop(0.55, '#070a16');
  g.addColorStop(1, '#04060f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.w, L.h);

  // drifting tetromino silhouettes
  ctx.save();
  ctx.globalAlpha = 0.075;
  for (let i = 0; i < bgPieces.length; i++) {
    const b = bgPieces[i];
    const s = b.scale * L.cell;
    drawMiniPiece(b.type, b.x * L.w, b.y * L.h, s, 1);
  }
  ctx.restore();
}

function drawWell() {
  const cell = L.cell;
  const bw = COLS * cell, bh = ROWS * cell;
  const hiddenH = HIDDEN * cell;

  // well background
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,14,0.92)';
  rr(L.bx - 3, L.by - 3, bw + 6, bh + 6, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(L.bx, L.by, bw, hiddenH);
  ctx.restore();

  if (settings.grid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,160,230,0.075)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(L.bx + x * cell + 0.5, L.by);
      ctx.lineTo(L.bx + x * cell + 0.5, L.by + bh);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(L.bx, L.by + y * cell + 0.5);
      ctx.lineTo(L.bx + bw, L.by + y * cell + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  // spawn-zone divider
  ctx.save();
  ctx.strokeStyle = 'rgba(255,120,120,0.28)';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.bx, L.by + hiddenH + 0.5);
  ctx.lineTo(L.bx + bw, L.by + hiddenH + 0.5);
  ctx.stroke();
  ctx.restore();

  // locked cells
  const clearing = G.clearRows.length > 0;
  const clearProg = clearing ? 1 - clamp(G.clearT / (reduceMotion ? 0.08 : CLEAR_DELAY), 0, 1) : 0;
  for (let y = 0; y < ROWS; y++) {
    const isClearing = clearing && G.clearRows.indexOf(y) >= 0;
    for (let x = 0; x < COLS; x++) {
      const c = G.board[y][x];
      if (!c) continue;
      const px = L.bx + x * cell;
      const py = L.by + y * cell;
      if (isClearing) {
        const k = clearProg;
        const inset = k * cell * 0.5;
        ctx.save();
        ctx.globalAlpha = 1 - k * 0.85;
        drawCell(px + inset, py + inset * 0.6, Math.max(1, cell - inset * 2), '#ffffff', 1, false);
        ctx.restore();
      } else {
        drawCell(px, py, cell, COLORS[c] || '#8899aa', y < HIDDEN ? 0.55 : 1, false);
      }
    }
  }

  // ghost + active
  const p = G.active;
  if (p) {
    const cells = cellsOf(p.type, p.rot);
    if (settings.ghost) {
      const gy = ghostY();
      if (gy !== p.y) {
        for (let i = 0; i < 4; i++) {
          const x = p.x + cells[i][0], y = gy + cells[i][1];
          if (y < 0) continue;
          drawCell(L.bx + x * cell, L.by + y * cell, cell, COLORS[p.type], 1, true);
        }
      }
    }
    const grounded = !canPlace(p.type, p.rot, p.x, p.y + 1);
    const pulse = grounded ? 0.72 + 0.28 * Math.sin(performance.now() / 90) : 1;
    for (let i = 0; i < 4; i++) {
      const x = p.x + cells[i][0], y = p.y + cells[i][1];
      if (y < 0) continue;
      drawCell(L.bx + x * cell, L.by + y * cell, cell, COLORS[p.type], y < HIDDEN ? 0.7 : pulse, false);
    }
  }

  // frame
  ctx.save();
  ctx.strokeStyle = 'rgba(127,240,255,0.55)';
  ctx.lineWidth = 2;
  rr(L.bx - 3, L.by - 3, bw + 6, bh + 6, 6);
  ctx.stroke();
  ctx.restore();

  if (flashT > 0) {
    ctx.save();
    ctx.globalAlpha = flashT * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(L.bx, L.by, bw, bh);
    ctx.restore();
  }
}

function drawPanels() {
  const cell = L.cell;
  const pw = L.panelW;

  // ---- LEFT: hold + stats ----
  const holdH = cell * 3.1;
  panelBox(L.leftX, L.by, pw, holdH, 'HOLD');
  if (G.hold) {
    drawMiniPiece(G.hold, L.leftX + pw / 2, L.by + holdH * 0.62, cell * 0.72, G.canHold ? 1 : 0.34);
  }

  let y = L.by + holdH + cell * 0.5;
  const sx = L.leftX + 4;
  y = statBlock(sx, y, pw, 'SCORE', fmtNum(G.score), '#ffffff', true);
  y = statBlock(sx, y, pw, 'LEVEL', String(G.level), '#ffd27f', false);
  y = statBlock(sx, y, pw, 'LINES', G.mode === 'sprint'
    ? Math.min(G.lines, SPRINT_GOAL) + '/' + SPRINT_GOAL
    : (G.mode === 'marathon' ? G.lines + '/' + MARATHON_GOAL : String(G.lines)), '#9fe8ff', false);
  const timeStr = G.mode === 'ultra' ? fmtClock(ULTRA_TIME - G.elapsed) : fmtMs(G.elapsed * 1000);
  y = statBlock(sx, y, pw, G.mode === 'ultra' ? 'TIME LEFT' : 'TIME', timeStr,
    (G.mode === 'ultra' && ULTRA_TIME - G.elapsed < 15) ? '#ff8a8a' : '#e8f2ff', false);

  const pps = G.elapsed > 0.5 ? (G.pieces / G.elapsed).toFixed(2) : '0.00';
  y = statBlock(sx, y, pw, 'PIECES/SEC', pps, '#9fb6d8', false);

  // combo / b2b indicators
  if (G.combo > 0) {
    ctx.save();
    ctx.fillStyle = '#ffd27f';
    ctx.font = '700 ' + Math.round(cell * 0.5) + 'px Segoe UI, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('COMBO x' + G.combo, sx, y);
    ctx.restore();
    y += cell * 0.62;
  }
  if (G.b2b > 1) {
    ctx.save();
    ctx.fillStyle = '#c084fc';
    ctx.font = '700 ' + Math.round(cell * 0.5) + 'px Segoe UI, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('B2B x' + (G.b2b - 1), sx, y);
    ctx.restore();
    y += cell * 0.62;
  }

  // ---- RIGHT: next queue ----
  const previews = 5;
  const nh = cell * (1.0 + previews * 2.35);
  panelBox(L.rightX, L.by, pw, nh, 'NEXT');
  for (let i = 0; i < previews && i < G.queue.length; i++) {
    const cy = L.by + cell * (1.5 + i * 2.35);
    const s = cell * (i === 0 ? 0.72 : 0.56);
    drawMiniPiece(G.queue[i], L.rightX + pw / 2, cy, s, i === 0 ? 1 : 0.68);
  }

  // mode + goal bar under next
  const gy = L.by + nh + cell * 0.5;
  ctx.save();
  ctx.fillStyle = '#6f88b8';
  ctx.font = '600 ' + Math.max(9, Math.round(cell * 0.34)) + 'px Segoe UI, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('MODE', L.rightX + 4, gy);
  ctx.fillStyle = '#7ff0ff';
  ctx.font = '700 ' + Math.max(11, Math.round(cell * 0.46)) + 'px Segoe UI, monospace';
  ctx.fillText(MODE_NAMES[G.mode], L.rightX + 4, gy + cell * 0.4);
  ctx.restore();

  let prog = 0;
  if (G.mode === 'marathon') prog = G.lines / MARATHON_GOAL;
  else if (G.mode === 'sprint') prog = G.lines / SPRINT_GOAL;
  else prog = G.elapsed / ULTRA_TIME;
  prog = clamp(prog, 0, 1);
  const barY = gy + cell * 1.15;
  ctx.save();
  ctx.fillStyle = 'rgba(20,28,52,0.9)';
  rr(L.rightX + 4, barY, pw - 8, cell * 0.34, 4);
  ctx.fill();
  const gg = ctx.createLinearGradient(L.rightX, 0, L.rightX + pw, 0);
  gg.addColorStop(0, '#22d3ee');
  gg.addColorStop(1, '#a855f7');
  ctx.fillStyle = gg;
  rr(L.rightX + 4, barY, Math.max(2, (pw - 8) * prog), cell * 0.34, 4);
  ctx.fill();
  ctx.restore();

  // records ribbon
  ctx.save();
  ctx.fillStyle = '#5f7398';
  ctx.font = '600 ' + Math.max(9, Math.round(cell * 0.32)) + 'px Segoe UI, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let best = '';
  if (G.mode === 'marathon') best = 'BEST ' + fmtNum(records.marathon.score);
  else if (G.mode === 'sprint') best = 'BEST ' + fmtMs(records.sprint.ms);
  else best = 'BEST ' + fmtNum(records.ultra.score);
  ctx.fillText(best, L.rightX + 4, barY + cell * 0.6);
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.on) continue;
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();
}

function drawFlyTexts() {
  const cx = L.bx + (COLS * L.cell) / 2;
  let base = L.by + L.cell * 6;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < flyTexts.length; i++) {
    const f = flyTexts[i];
    if (f.t < 0) continue;
    const k = f.t / f.life;
    const ease = 1 - Math.pow(1 - clamp(f.t / 0.22, 0, 1), 3);
    const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const y = base + i * L.cell * 1.5 - ease * L.cell * 0.5;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = '800 ' + Math.round(L.cell * (0.62 + 0.12 * ease)) + 'px Segoe UI, monospace';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 14;
    ctx.fillText(f.main, cx, y);
    ctx.shadowBlur = 0;
    if (f.sub) {
      ctx.fillStyle = '#e8f2ff';
      ctx.font = '600 ' + Math.round(L.cell * 0.42) + 'px Segoe UI, monospace';
      ctx.fillText(f.sub, cx, y + L.cell * 0.62);
    }
  }
  ctx.restore();
}

function drawOverlayText() {
  if (G.phase === 'pause') {
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,12,0.55)';
    ctx.fillRect(L.bx, L.by, COLS * L.cell, ROWS * L.cell);
    ctx.restore();
  }
  if (G.phase === 'play' && G.mode === 'ultra' && ULTRA_TIME - G.elapsed <= 10) {
    const t = Math.ceil(ULTRA_TIME - G.elapsed);
    ctx.save();
    ctx.globalAlpha = 0.32 + 0.2 * Math.sin(performance.now() / 130);
    ctx.fillStyle = '#ff8a8a';
    ctx.font = '900 ' + Math.round(L.cell * 4) + 'px Segoe UI, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, t)), L.bx + COLS * L.cell / 2, L.by + ROWS * L.cell / 2);
    ctx.restore();
  }
}

function render() {
  ctx.save();
  drawBackground();
  if (shake > 0.05) {
    const a = shake;
    ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  }
  drawWell();
  drawPanels();
  drawParticles();
  drawFlyTexts();
  drawOverlayText();
  ctx.restore();
}

/* ================================= LOOP =================================== */

const STEP = 1 / 120;
let acc = 0;
let lastTs = 0;
let rafId = 0;

function update(dt) {
  updateEffects(dt);
  if (G.phase !== 'play') return;

  G.elapsed += dt;
  playtimeAcc += dt;
  playtimeSinceReport += dt;
  if (playtimeSinceReport >= 30) {
    const s = Math.floor(playtimeSinceReport);
    playtimeSinceReport -= s;
    if (empire) empire.reportPlaytime(s).catch(() => {});
    if (saveDirty) doSave();
  }
  if (saveDirty) {
    saveTimer += dt;
    if (saveTimer > 6) { saveTimer = 0; doSave(); }
  }

  if (G.mode === 'ultra' && G.elapsed >= ULTRA_TIME) { endRun(true); return; }

  if (G.clearT > 0) {
    handleShift(dt, true);
    G.clearT -= dt;
    if (G.clearT <= 0) finishClear();
    return;
  }
  if (G.spawnT > 0) {
    handleShift(dt, true);
    G.spawnT -= dt;
    if (G.spawnT <= 0) spawnFromQueue();
    return;
  }
  if (!G.active) { spawnFromQueue(); return; }

  handleShift(dt, false);
  if (!G.active) return;

  // gravity
  const rowsPerSec = 1 / gravitySeconds(G.level);
  let rate = rowsPerSec;
  if (G.softHeld) rate = Math.max(rowsPerSec * settings.sdf, settings.sdf);
  G.gravAcc += rate * dt;
  let steps = 0;
  while (G.gravAcc >= 1 && steps < ROWS) {
    G.gravAcc -= 1;
    steps++;
    const p = G.active;
    if (canPlace(p.type, p.rot, p.x, p.y + 1)) {
      p.y++;
      if (G.softHeld) G.score += 1;
      descended();
    } else {
      G.gravAcc = 0;
      break;
    }
  }

  // lock delay
  const p2 = G.active;
  if (p2 && !canPlace(p2.type, p2.rot, p2.x, p2.y + 1)) {
    if (!G.grounded) { G.grounded = true; Sfx.land(); }
    G.lockTimer -= dt;
    if (G.lockTimer <= 0) lockPiece(false);
  } else if (p2) {
    G.grounded = false;
    G.lockTimer = LOCK_DELAY;
  }
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const now = ts / 1000;
  if (!lastTs) lastTs = now;
  let dt = now - lastTs;
  lastTs = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 40) {
    update(STEP);
    acc -= STEP;
  }
  render();
}

function startLoop() {
  if (rafId) return;
  lastTs = 0;
  acc = 0;
  rafId = requestAnimationFrame(frame);
}
function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.phase === 'play') pauseGame();
    Music.stop();
    stopLoop();
    if (playtimeSinceReport >= 1 && empire) {
      const s = Math.floor(playtimeSinceReport);
      playtimeSinceReport -= s;
      empire.reportPlaytime(s).catch(() => {});
    }
    if (saveDirty) doSave();
  } else {
    startLoop();
  }
});

window.addEventListener('pagehide', () => {
  if (empire && playtimeSinceReport >= 1) {
    empire.reportPlaytime(Math.floor(playtimeSinceReport)).catch(() => {});
    playtimeSinceReport = 0;
  }
  if (saveDirty) doSave();
});

window.addEventListener('resize', resize);

/* =================================== UI =================================== */

const OVERLAYS = {
  menu: 'mainMenu', howto: 'howToMenu', settings: 'settingsMenu',
  records: 'recordsMenu', pause: 'pauseMenu', result: 'resultMenu',
};
let settingsReturn = 'menu';
let howToReturn = 'menu';

function showOverlay(name) {
  for (const k in OVERLAYS) {
    $(OVERLAYS[k]).classList.toggle('hidden', k !== name);
  }
  updateTouchVisibility();
}

function domToast(main, sub) {
  const w = $('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<b>' + main + '</b>' + (sub ? ' — ' + sub : '');
  w.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
}

function refreshMenu() {
  $('menuMarathon').textContent = records.marathon.score > 0
    ? fmtNum(records.marathon.score) + (records.marathon.cleared ? ' ✔' : '')
    : '—';
  $('menuSprint').textContent = records.sprint.ms > 0 ? fmtMs(records.sprint.ms) : '—';
  $('menuUltra').textContent = records.ultra.score > 0 ? fmtNum(records.ultra.score) : '—';
  $('menuTotalLines').textContent = fmtNum(stats.totalLines);
  $('menuGames').textContent = fmtNum(stats.games);
}

function refreshRecords() {
  const rows = [
    ['Marathon best score', fmtNum(records.marathon.score), records.marathon.score > 0],
    ['Marathon best lines', fmtNum(records.marathon.lines), records.marathon.lines > 0],
    ['Marathon cleared (150)', records.marathon.cleared ? 'YES' : 'not yet', records.marathon.cleared],
    ['Sprint 40L best time', fmtMs(records.sprint.ms), records.sprint.ms > 0],
    ['Ultra best score', fmtNum(records.ultra.score), records.ultra.score > 0],
    ['—', '', false],
    ['Total lines cleared', fmtNum(stats.totalLines), false],
    ['Total pieces placed', fmtNum(stats.totalPieces), false],
    ['Runs played', fmtNum(stats.games), false],
    ['Best combo', 'x' + fmtNum(stats.maxCombo), false],
    ['Longest back-to-back', 'x' + fmtNum(stats.maxB2B), false],
    ['Quads', fmtNum(stats.quads), false],
    ['T-spins', fmtNum(stats.tspins), false],
    ['Perfect clears', fmtNum(stats.perfects), false],
  ];
  let html = '';
  for (const r of rows) {
    if (r[0] === '—') { html += '<h2 class="section">LIFETIME</h2>'; continue; }
    html += '<div class="statline' + (r[2] ? ' hi' : '') + '"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
  }
  $('recordsBody').innerHTML = html;
}

function showResult() {
  const mode = G.mode;
  let icon = '💀', title = 'TOPPED OUT', sub = MODE_NAMES[mode];
  if (G.won) {
    if (mode === 'marathon') { icon = '🏆'; title = 'MARATHON CLEARED'; }
    else if (mode === 'sprint') { icon = '⚡'; title = '40 LINES DOWN'; }
    else { icon = '⏱️'; title = "TIME'S UP"; }
  }
  $('resultIcon').textContent = icon;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = sub + (G.isRecord ? ' — NEW RECORD' : '');

  const rows = [];
  rows.push(['Score', fmtNum(G.score), true]);
  rows.push(['Lines', fmtNum(G.lines), false]);
  rows.push(['Level reached', String(G.level), false]);
  rows.push(['Time', fmtMs(G.finishedAt * 1000), mode === 'sprint' && G.won]);
  rows.push(['Pieces', fmtNum(G.pieces), false]);
  rows.push(['Pieces / sec', G.finishedAt > 0 ? (G.pieces / G.finishedAt).toFixed(2) : '0.00', false]);
  rows.push(['Best combo', 'x' + G.maxCombo, false]);
  rows.push(['Best back-to-back', 'x' + G.bestB2B, false]);
  rows.push(['Quads', String(G.runStats.quads), false]);
  rows.push(['T-spins', String(G.runStats.tspins), false]);
  rows.push(['Perfect clears', String(G.runStats.perfects), false]);
  if (mode === 'marathon') rows.push(['Personal best', fmtNum(records.marathon.score), false]);
  if (mode === 'sprint') rows.push(['Personal best', fmtMs(records.sprint.ms), false]);
  if (mode === 'ultra') rows.push(['Personal best', fmtNum(records.ultra.score), false]);

  let html = '';
  for (const r of rows) {
    html += '<div class="statline' + (r[2] ? ' hi' : '') + '"><span>' + r[0] + '</span><b>' + r[1] + '</b>'
      + (r[2] && G.isRecord ? '<span class="badge new">NEW</span>' : '') + '</div>';
  }
  $('resultStats').innerHTML = html;
  showOverlay('result');
}

function applySettingsToUI() {
  $('setGhost').checked = settings.ghost;
  $('setGrid').checked = settings.grid;
  $('setShake').checked = settings.shake;
  $('setTouch').checked = settings.touch;
  $('setMusic').checked = settings.music;
  $('setVol').value = String(settings.vol);
  $('setDAS').value = String(settings.das);
  $('setARR').value = String(settings.arr);
  $('setSDF').value = String(settings.sdf);
  $('volVal').textContent = Math.round(settings.vol * 100) + '%';
  $('dasVal').textContent = settings.das + ' ms';
  $('arrVal').textContent = settings.arr === 0 ? 'instant' : settings.arr + ' ms';
  $('sdfVal').textContent = settings.sdf + '×';
  Sfx.setVolume(settings.vol);
}

function readSettingsFromUI() {
  settings.ghost = $('setGhost').checked;
  settings.grid = $('setGrid').checked;
  settings.shake = $('setShake').checked;
  settings.touch = $('setTouch').checked;
  settings.music = $('setMusic').checked;
  settings.vol = parseFloat($('setVol').value);
  settings.das = parseInt($('setDAS').value, 10);
  settings.arr = parseInt($('setARR').value, 10);
  settings.sdf = parseInt($('setSDF').value, 10);
  $('volVal').textContent = Math.round(settings.vol * 100) + '%';
  $('dasVal').textContent = settings.das + ' ms';
  $('arrVal').textContent = settings.arr === 0 ? 'instant' : settings.arr + ' ms';
  $('sdfVal').textContent = settings.sdf + '×';
  Sfx.setVolume(settings.vol);
  if (!settings.music) Music.stop();
  else if (G.phase === 'play') Music.start();
  updateTouchVisibility();
  markSave();
}

function wireUI() {
  $('btnMarathon').onclick = () => startRun('marathon');
  $('btnSprint').onclick = () => startRun('sprint');
  $('btnUltra').onclick = () => startRun('ultra');

  $('selStart').oninput = () => { $('startLvlVal').textContent = $('selStart').value; };

  $('btnRecords').onclick = () => { refreshRecords(); showOverlay('records'); };
  $('recordsClose').onclick = () => showOverlay('menu');
  $('recordsDone').onclick = () => showOverlay('menu');

  let resetArmed = false;
  $('btnResetRecords').onclick = () => {
    if (!resetArmed) {
      resetArmed = true;
      $('btnResetRecords').textContent = 'TAP AGAIN TO CONFIRM';
      setTimeout(() => {
        resetArmed = false;
        $('btnResetRecords').textContent = 'RESET ALL RECORDS';
      }, 3500);
      return;
    }
    resetArmed = false;
    $('btnResetRecords').textContent = 'RESET ALL RECORDS';
    records.marathon = { score: 0, lines: 0, level: 1, cleared: false, timeMs: 0 };
    records.sprint = { ms: 0, level: 1 };
    records.ultra = { score: 0, lines: 0 };
    stats.totalLines = 0; stats.totalPieces = 0; stats.games = 0;
    stats.maxCombo = 0; stats.maxB2B = 0; stats.quads = 0; stats.tspins = 0; stats.perfects = 0;
    refreshRecords();
    refreshMenu();
    doSave();
    domToast('Records cleared', 'Achievements are kept');
  };

  $('btnSettings').onclick = () => { settingsReturn = 'menu'; applySettingsToUI(); showOverlay('settings'); };
  $('settingsClose').onclick = () => showOverlay(settingsReturn);
  $('settingsDone').onclick = () => { doSave(); showOverlay(settingsReturn); };
  ['setGhost', 'setGrid', 'setShake', 'setTouch', 'setMusic'].forEach((id) => {
    $(id).onchange = readSettingsFromUI;
  });
  ['setVol', 'setDAS', 'setARR', 'setSDF'].forEach((id) => {
    $(id).oninput = readSettingsFromUI;
  });

  $('btnHowTo').onclick = () => { howToReturn = 'menu'; showOverlay('howto'); };
  $('howToClose').onclick = () => showOverlay(howToReturn);
  $('howToDone').onclick = () => showOverlay(howToReturn);

  $('btnResume').onclick = resumeGame;
  $('btnRestart').onclick = () => startRun(G.mode);
  $('btnPauseSettings').onclick = () => { settingsReturn = 'pause'; applySettingsToUI(); showOverlay('settings'); };
  $('btnPauseHowTo').onclick = () => { howToReturn = 'pause'; showOverlay('howto'); };
  $('btnQuit').onclick = quitToMenu;
  $('pauseBtn').onclick = () => { if (G.phase === 'play') pauseGame(); else if (G.phase === 'pause') resumeGame(); };

  $('btnAgain').onclick = () => startRun(G.mode);
  $('btnResultMode').onclick = () => { G.phase = 'menu'; $('hudRoot').classList.add('hidden'); refreshMenu(); showOverlay('menu'); };
  $('btnResultMenu').onclick = quitToMenu;

  document.addEventListener('pointerdown', () => Sfx.resume(), { once: true });
}

/* ================================= BOOT =================================== */

function initBackdrop() {
  for (let i = 0; i < 14; i++) {
    bgPieces.push({
      type: TYPES[(Math.random() * 7) | 0],
      x: Math.random(), y: Math.random(),
      vy: 0.012 + Math.random() * 0.03,
      scale: 0.8 + Math.random() * 1.6,
      rotT: Math.random() * 6,
    });
  }
}

async function boot() {
  initBackdrop();
  resize();
  wireUI();
  setupTouch();
  applySettingsToUI();
  refreshMenu();
  fillQueue();
  startLoop();

  empire = new EmpireClient({
    gameId: GAME_ID,
    saveVersion: SAVE_VERSION,
    onPause: () => { if (G.phase === 'play') pauseGame(); },
    onResume: () => { if (G.phase === 'pause') resumeGame(); },
    onSettings: (s) => applyHubSettings(s),
  });

  try {
    const init = await empire.connect();
    if (init && init.settings) applyHubSettings(init.settings);
  } catch (e) { /* standalone */ }

  await doLoad();
  applySettingsToUI();
  refreshMenu();
  updateTouchVisibility();

  try {
    const prof = await empire.getProfile();
    if (prof && prof.name) {
      $('mainMenu').querySelector('.subtitle').textContent =
        'SRS · 7-BAG · HOLD · T-SPINS  —  ' + String(prof.name).toUpperCase();
    }
  } catch (e) { /* optional */ }
}

function applyHubSettings(s) {
  if (!s || typeof s !== 'object') return;
  const v = (s.masterVolume != null) ? s.masterVolume
    : (s.volume != null) ? s.volume
      : (s.sfxVolume != null) ? s.sfxVolume : null;
  if (v != null && !isNaN(v)) {
    settings.vol = clamp(Number(v) > 1 ? Number(v) / 100 : Number(v), 0, 1);
    Sfx.setVolume(settings.vol);
  }
  if (s.reducedMotion === true) settings.shake = false;
  if (s.music === false) { settings.music = false; Music.stop(); }
  applySettingsToUI();
}

boot();
