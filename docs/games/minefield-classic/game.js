/* =============================================================================
   MINEFIELD CLASSIC  —  Gaming Empire
   Canvas2D minesweeper: safe first click, flood reveal, chording, flags,
   3 presets + custom, per-preset best times, seeded daily board, and a real
   constraint-solver-backed no-guess generator.
   ========================================================================== */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'minefield-classic',statusKey:'__minefieldAssetStatus',accent:0xffc84d,getState:()=>({active:running,motion:0,danger:0})});

const GAME_ID = 'minefield-classic';
const SAVE_VERSION = 1;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad3 = (v) => String(Math.max(0, Math.min(999, Math.floor(v)))).padStart(3, '0');

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PRESETS = {
  beginner: { key: 'beginner', name: 'Beginner', cols: 9, rows: 9, mines: 10 },
  intermediate: { key: 'intermediate', name: 'Intermediate', cols: 16, rows: 16, mines: 40 },
  expert: { key: 'expert', name: 'Expert', cols: 30, rows: 16, mines: 99 },
};

const NUM_COLOR = ['', '#1565c0', '#1f7a32', '#c62828', '#5b2a9e', '#9c4a12', '#0f7f8c', '#1c1c22', '#6a6a78'];

/* ============================== RANDOM ================================== */

function mulberry32(a) {
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
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================== GAME STATE ============================== */

const G = {
  cols: 0, rows: 0, mines: 0, n: 0,
  mine: null, adj: null, state: null, nbr: null,
  // state: 0 hidden, 1 revealed, 2 flag, 3 question
  phase: 'menu',            // menu | ready | playing | won | lost | generating
  generated: false,
  revealed: 0, flags: 0, clicks: 0, chords: 0, hints: 0,
  elapsed: 0, bbbv: 0,
  cfg: null, cfgKey: 'beginner', label: 'Beginner',
  noGuess: false, daily: false, guaranteed: false, seed: 0,
  lostAt: -1,
  cursor: 0,
};

const settings = { noGuess: false, qmark: false, sound: true };

let records = {};       // key -> {best, bestRate, bestEff, wins, losses}
const career = {
  wins: 0, losses: 0, chords: 0, streak: 0, bestStreak: 0,
  cellsRevealed: 0, dailyDate: null, dailyBest: null,
};

const view = { cell: 28, base: 28, zoom: 1, ox: 0, oy: 0, panX: 0, panY: 0, maxPanX: 0, maxPanY: 0 };

const fx = {
  anims: [],            // {i, t}
  particles: [],
  pool: [],
  shake: 0, shakeT: 0,
  hintIdx: -1, hintT: 0,
  winT: 0,
  hoverIdx: -1,
  pressed: [],
};

const input = {
  lmb: false, rmb: false, chordMode: false, didAction: false, pressIdx: -1,
  flagMode: false, panning: false, panStart: null, touchTimer: null, touchIdx: -1, touchMoved: false,
};

let empire = null;
let dirty = true;
let running = true;
let saveTimer = 0;
let playtimeAccum = 0;
let resultTimer = null;
const awarded = new Set();

/* ============================== AUDIO =================================== */

const AudioFX = {
  ctx: null,
  master: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  },
  tone(freq, dur, type = 'square', vol = 0.16, glideTo = 0) {
    if (!settings.sound) return;
    const c = this.ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  noise(dur, vol = 0.3, freq = 900, q = 1) {
    if (!settings.sound) return;
    const c = this.ensure(); if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  },
  click() { this.tone(660 + Math.random() * 40, 0.045, 'square', 0.06); },
  open(count) { this.tone(300, 0.09, 'triangle', 0.09, 520 + Math.min(400, count * 12)); },
  flag() { this.tone(880, 0.06, 'sine', 0.1, 1320); },
  unflag() { this.tone(660, 0.06, 'sine', 0.08, 440); },
  chord() { this.tone(520, 0.08, 'sawtooth', 0.07, 780); },
  deny() { this.tone(180, 0.09, 'square', 0.06, 120); },
  boom() {
    this.noise(0.7, 0.5, 700, 0.8);
    this.tone(120, 0.5, 'sawtooth', 0.18, 40);
    setTimeout(() => this.noise(0.4, 0.25, 300, 0.6), 90);
  },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 'triangle', 0.15), i * 95));
  },
  ach() {
    [880, 1174.7, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'sine', 0.13), i * 80));
  },
};

/* ============================== BOARD MATH ============================== */

function buildNeighbors(cols, rows) {
  const n = cols * rows;
  const nbr = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % cols, y = (i / cols) | 0;
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy; if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx; if (nx < 0 || nx >= cols) continue;
        list.push(ny * cols + nx);
      }
    }
    nbr[i] = Int32Array.from(list);
  }
  return nbr;
}

function computeAdj(mine, nbr, n) {
  const adj = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (mine[i]) { adj[i] = 0; continue; }
    let c = 0; const nb = nbr[i];
    for (let k = 0; k < nb.length; k++) if (mine[nb[k]]) c++;
    adj[i] = c;
  }
  return adj;
}

function compute3BV(mine, adj, nbr, n) {
  const seen = new Uint8Array(n);
  let bbbv = 0;
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (mine[i] || seen[i] || adj[i] !== 0) continue;
    bbbv++;
    stack.length = 0; stack.push(i); seen[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      const nb = nbr[c];
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k];
        if (mine[j] || seen[j]) continue;
        seen[j] = 1;
        if (adj[j] === 0) stack.push(j);
      }
    }
  }
  for (let i = 0; i < n; i++) if (!mine[i] && !seen[i]) bbbv++;
  return bbbv;
}

/* ============================== SOLVER ==================================
   known[i]: -1 unknown, 0 revealed-safe, 1 proven mine.
   deduce() returns {safe:[], mines:[]} — cells proven by logic alone.
   ======================================================================== */

function deduce(known, n, nbr, adj, totalMines, deep) {
  const safe = new Set(), mines = new Set();
  const cons = [];

  for (let i = 0; i < n; i++) {
    if (known[i] !== 0) continue;
    let cnt = adj[i];
    const unk = [];
    const nb = nbr[i];
    for (let k = 0; k < nb.length; k++) {
      const j = nb[k];
      if (known[j] === 1) cnt--;
      else if (known[j] === -1) unk.push(j);
    }
    if (unk.length === 0) continue;
    if (cnt <= 0) { for (let k = 0; k < unk.length; k++) safe.add(unk[k]); continue; }
    if (cnt === unk.length) { for (let k = 0; k < unk.length; k++) mines.add(unk[k]); continue; }
    cons.push({ cells: unk, count: cnt, set: new Set(unk) });
  }
  if (safe.size || mines.size) return { safe: [...safe], mines: [...mines] };

  // ---- global mine-count rule ----
  let knownMines = 0;
  const unknownAll = [];
  for (let i = 0; i < n; i++) {
    if (known[i] === 1) knownMines++;
    else if (known[i] === -1) unknownAll.push(i);
  }
  const rem = totalMines - knownMines;
  if (rem <= 0) return { safe: unknownAll.slice(), mines: [] };
  if (rem === unknownAll.length) return { safe: [], mines: unknownAll.slice() };
  if (cons.length === 0) return { safe: [], mines: [] };

  // ---- pairwise subset rule ----
  const byCell = new Map();
  for (let ci = 0; ci < cons.length; ci++) {
    const cells = cons[ci].cells;
    for (let k = 0; k < cells.length; k++) {
      let arr = byCell.get(cells[k]);
      if (!arr) { arr = []; byCell.set(cells[k], arr); }
      arr.push(ci);
    }
  }
  for (let ai = 0; ai < cons.length; ai++) {
    const A = cons[ai];
    const cand = new Set();
    for (let k = 0; k < A.cells.length; k++) {
      const arr = byCell.get(A.cells[k]);
      for (let z = 0; z < arr.length; z++) if (arr[z] !== ai) cand.add(arr[z]);
    }
    for (const bi of cand) {
      const B = cons[bi];
      if (B.cells.length <= A.cells.length) continue;
      let subset = true;
      for (let k = 0; k < A.cells.length; k++) if (!B.set.has(A.cells[k])) { subset = false; break; }
      if (!subset) continue;
      const diff = [];
      for (let k = 0; k < B.cells.length; k++) if (!A.set.has(B.cells[k])) diff.push(B.cells[k]);
      const dc = B.count - A.count;
      if (dc === 0) { for (let k = 0; k < diff.length; k++) safe.add(diff[k]); }
      else if (dc === diff.length) { for (let k = 0; k < diff.length; k++) mines.add(diff[k]); }
    }
  }
  if (safe.size || mines.size) return { safe: [...safe], mines: [...mines] };
  if (!deep) return { safe: [], mines: [] };

  // ---- exhaustive enumeration of frontier components ----
  const compOf = new Map();          // cell -> component id
  const comps = [];                  // {cells:[], cons:[]}
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const c of cons) for (const x of c.cells) if (!parent.has(x)) parent.set(x, x);
  for (const c of cons) for (let k = 1; k < c.cells.length; k++) union(c.cells[0], c.cells[k]);

  const rootIdx = new Map();
  for (const c of cons) {
    const r = find(c.cells[0]);
    let id = rootIdx.get(r);
    if (id === undefined) { id = comps.length; rootIdx.set(r, id); comps.push({ cells: [], cons: [], seen: new Set() }); }
    comps[id].cons.push(c);
    for (const x of c.cells) {
      if (!comps[id].seen.has(x)) { comps[id].seen.add(x); comps[id].cells.push(x); compOf.set(x, id); }
    }
  }

  const MAX_COMP = 20;
  const results = [];
  let allEnumerable = true;
  let frontierCells = 0;
  for (const comp of comps) {
    frontierCells += comp.cells.length;
    if (comp.cells.length > MAX_COMP) { allEnumerable = false; results.push(null); continue; }
    const r = enumerateComponent(comp, rem);
    if (!r) { allEnumerable = false; results.push(null); continue; }
    results.push(r);
  }
  const outside = unknownAll.length - frontierCells;

  // Which per-component mine totals are globally feasible?
  const feasible = results.map((r) => (r ? new Set(r.counts.keys()) : null));
  if (allEnumerable) {
    const sums = results.map((r) => [...r.counts.keys()].sort((a, b) => a - b));
    // prefix/suffix achievable-sum sets
    const pre = [new Set([0])];
    for (let i = 0; i < sums.length; i++) {
      const s = new Set();
      for (const a of pre[i]) for (const b of sums[i]) if (a + b <= rem) s.add(a + b);
      pre.push(s);
    }
    const suf = new Array(sums.length + 1);
    suf[sums.length] = new Set([0]);
    for (let i = sums.length - 1; i >= 0; i--) {
      const s = new Set();
      for (const a of suf[i + 1]) for (const b of sums[i]) if (a + b <= rem) s.add(a + b);
      suf[i] = s;
    }
    const okSums = [];
    for (let i = 0; i < sums.length; i++) {
      const f = new Set();
      for (const k of sums[i]) {
        let good = false;
        for (const a of pre[i]) {
          for (const b of suf[i + 1]) {
            const tot = a + k + b;
            const left = rem - tot;
            if (left >= 0 && left <= outside) { good = true; break; }
          }
          if (good) break;
        }
        if (good) f.add(k);
      }
      feasible[i] = f;
      okSums.push(f);
    }
    // outside cells: are they forced?
    if (outside > 0) {
      let allZero = true, allFull = true;
      for (const total of pre[sums.length]) {
        const left = rem - total;
        if (left < 0 || left > outside) continue;
        if (left !== 0) allZero = false;
        if (left !== outside) allFull = false;
      }
      if (allZero || allFull) {
        const frontierSet = new Set();
        for (const comp of comps) for (const x of comp.cells) frontierSet.add(x);
        for (const i of unknownAll) if (!frontierSet.has(i)) (allZero ? safe : mines).add(i);
      }
    }
  }

  for (let ci = 0; ci < comps.length; ci++) {
    const r = results[ci];
    if (!r) continue;
    const f = feasible[ci];
    if (!f || f.size === 0) continue;
    const m = r.cells.length;
    const totalMineCounts = new Int32Array(m);
    let totalSol = 0;
    for (const k of f) {
      const rec = r.counts.get(k);
      if (!rec) continue;
      totalSol += rec.sol;
      for (let z = 0; z < m; z++) totalMineCounts[z] += rec.mc[z];
    }
    if (totalSol === 0) continue;
    for (let z = 0; z < m; z++) {
      if (totalMineCounts[z] === 0) safe.add(r.cells[z]);
      else if (totalMineCounts[z] === totalSol) mines.add(r.cells[z]);
    }
  }

  return { safe: [...safe], mines: [...mines] };
}

function enumerateComponent(comp, remMax) {
  const cells = comp.cells;
  const m = cells.length;
  const idxOf = new Map();
  for (let i = 0; i < m; i++) idxOf.set(cells[i], i);
  const cns = comp.cons;
  const K = cns.length;
  const conCells = new Array(K);
  const need = new Int16Array(K);
  const cellCons = new Array(m);
  for (let i = 0; i < m; i++) cellCons[i] = [];
  for (let ci = 0; ci < K; ci++) {
    const arr = cns[ci].cells.map((x) => idxOf.get(x));
    conCells[ci] = arr;
    need[ci] = cns[ci].count;
    for (const a of arr) cellCons[a].push(ci);
  }
  const sum = new Int16Array(K);
  const left = new Int16Array(K);
  for (let ci = 0; ci < K; ci++) left[ci] = conCells[ci].length;

  const assign = new Uint8Array(m);
  const counts = new Map();       // mineTotal -> {sol, mc:Int32Array}
  let solutions = 0, aborted = false;

  function rec(i, used) {
    if (aborted) return;
    if (used > remMax) return;
    if (i === m) {
      let r = counts.get(used);
      if (!r) { r = { sol: 0, mc: new Int32Array(m) }; counts.set(used, r); }
      r.sol++;
      for (let z = 0; z < m; z++) if (assign[z]) r.mc[z]++;
      solutions++;
      if (solutions > 400000) aborted = true;
      return;
    }
    const cc = cellCons[i];
    for (let v = 0; v <= 1; v++) {
      let ok = true;
      for (let z = 0; z < cc.length; z++) {
        const ci = cc[z];
        sum[ci] += v; left[ci]--;
        if (sum[ci] > need[ci] || sum[ci] + left[ci] < need[ci]) ok = false;
      }
      if (ok) { assign[i] = v; rec(i + 1, used + v); }
      for (let z = 0; z < cc.length; z++) { const ci = cc[z]; sum[ci] -= v; left[ci]++; }
      if (aborted) break;
    }
    assign[i] = 0;
  }
  rec(0, 0);
  if (aborted || solutions === 0) return null;
  return { cells, counts, solutions };
}

/** Simulate a perfect logical player. Returns {solved, stuck[]}. */
function autoSolve(n, nbr, mine, adj, totalMines, startIdx) {
  const known = new Int8Array(n).fill(-1);
  let revealedCount = 0;
  const target = n - totalMines;
  const stack = [];

  function revealK(i) {
    if (known[i] !== -1) return;
    stack.length = 0; stack.push(i);
    while (stack.length) {
      const c = stack.pop();
      if (known[c] !== -1) continue;
      known[c] = 0; revealedCount++;
      if (adj[c] === 0) {
        const nb = nbr[c];
        for (let k = 0; k < nb.length; k++) { const j = nb[k]; if (known[j] === -1 && !mine[j]) stack.push(j); }
      }
    }
  }

  revealK(startIdx);
  let guard = 0;
  while (revealedCount < target) {
    if (guard++ > 4000) return { solved: false, known, stuck: frontierOf(known, n, nbr) };
    const d = deduce(known, n, nbr, adj, totalMines, true);
    if (!d.safe.length && !d.mines.length) return { solved: false, known, stuck: frontierOf(known, n, nbr) };
    for (let k = 0; k < d.mines.length; k++) { const i = d.mines[k]; if (known[i] === -1) known[i] = 1; }
    for (let k = 0; k < d.safe.length; k++) {
      const i = d.safe[k];
      if (known[i] !== -1) continue;
      if (mine[i]) return { solved: false, known, stuck: frontierOf(known, n, nbr) }; // should never happen
      revealK(i);
    }
  }
  return { solved: true, known, stuck: [] };
}

function frontierOf(known, n, nbr) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (known[i] !== -1) continue;
    const nb = nbr[i];
    for (let k = 0; k < nb.length; k++) if (known[nb[k]] === 0) { out.push(i); break; }
  }
  return out;
}

/* ============================== GENERATION ============================== */

function placeMines(n, count, banned, rng) {
  const mine = new Uint8Array(n);
  const pool = [];
  for (let i = 0; i < n; i++) if (!banned.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  for (let i = 0; i < count && i < pool.length; i++) mine[pool[i]] = 1;
  return mine;
}

function bannedZone(startIdx, nbr, n, mines) {
  const banned = new Set([startIdx]);
  // Only carve out the full 3x3 if there is still room for every mine.
  if (n - 9 >= mines) { const nb = nbr[startIdx]; for (let k = 0; k < nb.length; k++) banned.add(nb[k]); }
  return banned;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Build a field. With noGuess, iteratively repairs the layout until a pure
 * logic solve succeeds (or the budget runs out — then it returns the best
 * effort and flags guaranteed:false so the UI can tell the truth).
 */
async function generateField(n, nbr, mines, startIdx, noGuess, rng, onProgress) {
  const banned = bannedZone(startIdx, nbr, n, mines);
  let mine = placeMines(n, mines, banned, rng);
  if (!noGuess) return { mine, guaranteed: true, attempts: 1 };

  const t0 = performance.now();
  const BUDGET = 4000, MAX_ITER = 2200;
  let iter = 0;
  let best = mine;

  while (iter < MAX_ITER && performance.now() - t0 < BUDGET) {
    const adj = computeAdj(mine, nbr, n);
    const res = autoSolve(n, nbr, mine, adj, mines, startIdx);
    if (res.solved) return { mine, guaranteed: true, attempts: iter + 1 };
    best = mine;
    iter++;
    if (onProgress && iter % 8 === 0) onProgress(iter, MAX_ITER);
    if (iter % 6 === 0) await nextFrame();

    // --- repair: relocate mines sitting in the ambiguous frontier ---
    const stuck = res.stuck;
    const stuckMines = [];
    for (let k = 0; k < stuck.length; k++) if (mine[stuck[k]]) stuckMines.push(stuck[k]);
    const free = [];
    const stuckSet = new Set(stuck);
    for (let i = 0; i < n; i++) {
      if (mine[i] || banned.has(i) || stuckSet.has(i)) continue;
      if (res.known[i] === 0) continue;         // already revealed => cannot host a mine
      free.push(i);
    }
    if (iter % 60 === 0 || stuckMines.length === 0 || free.length === 0) {
      mine = placeMines(n, mines, banned, rng);           // full reshuffle
      continue;
    }
    const moves = Math.min(stuckMines.length, 1 + ((rng() * 2) | 0));
    const next = Uint8Array.from(mine);
    for (let m = 0; m < moves; m++) {
      const from = stuckMines[(rng() * stuckMines.length) | 0];
      const to = free[(rng() * free.length) | 0];
      if (next[from] && !next[to]) { next[from] = 0; next[to] = 1; }
    }
    mine = next;
  }
  return { mine: best, guaranteed: false, attempts: iter };
}

/* ============================== NEW GAME ================================ */

function configKey(cfg, noGuess, daily) {
  if (daily) return 'daily';
  const base = cfg.key || `custom:${cfg.cols}x${cfg.rows}x${cfg.mines}`;
  return noGuess ? base + '|ng' : base;
}

function newGame(cfg, opts = {}) {
  const noGuess = opts.daily ? true : !!settings.noGuess;
  G.cols = cfg.cols; G.rows = cfg.rows; G.mines = cfg.mines;
  G.n = cfg.cols * cfg.rows;
  G.nbr = buildNeighbors(cfg.cols, cfg.rows);
  G.mine = new Uint8Array(G.n);
  G.adj = new Uint8Array(G.n);
  G.state = new Uint8Array(G.n);
  G.generated = false;
  G.revealed = 0; G.flags = 0; G.clicks = 0; G.chords = 0; G.hints = 0;
  G.elapsed = 0; G.bbbv = 0; G.lostAt = -1;
  G.cfg = cfg;
  G.noGuess = noGuess;
  G.daily = !!opts.daily;
  G.guaranteed = false;
  G.seed = opts.seed !== undefined ? opts.seed : (Math.random() * 0x7fffffff) | 0;
  G.cfgKey = configKey(cfg, noGuess, G.daily);
  G.label = opts.daily ? `Daily · ${todayKey()}` : (cfg.name || `Custom ${cfg.cols}×${cfg.rows}`);
  G.cursor = ((cfg.rows / 2) | 0) * cfg.cols + ((cfg.cols / 2) | 0);
  G.usedFlagInput = false;
  G.genToken = (G.genToken || 0) + 1;
  G.phase = 'ready';

  fx.anims.length = 0; fx.particles.length = 0; fx.shakeT = 0; fx.shake = 0;
  fx.hintIdx = -1; fx.winT = 0; fx.pressed.length = 0;
  view.zoom = 1; view.panX = 0; view.panY = 0;
  input.lmb = input.rmb = input.chordMode = input.didAction = false;

  clearTimeout(resultTimer);
  hideAllScreens();
  layout();
  updateHUD();
  setStatus(G.daily
    ? 'Daily Board — the same field for everyone today.'
    : (noGuess ? 'No-Guess mode: the field is built after your first click.' : 'Click anywhere — your first click is always safe.'));
  dirty = true;

  if (opts.daily) startDailyOpening();
}

/** The daily board is fully deterministic, so it opens itself at a seeded cell. */
async function startDailyOpening() {
  const start = seededStartCell(G.seed, G.cols, G.rows);
  G.cursor = start;
  const ok = await ensureGenerated(start);
  if (!ok) return;
  if (G.phase !== 'playing' && G.phase !== 'ready') return;
  G.phase = 'playing';
  floodReveal(start);
  G.clicks++;
  postMove();
}

function seededStartCell(seed, cols, rows) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const x = clamp(2 + ((r() * (cols - 4)) | 0), 0, cols - 1);
  const y = clamp(2 + ((r() * (rows - 4)) | 0), 0, rows - 1);
  return y * cols + x;
}

async function ensureGenerated(startIdx) {
  if (G.generated) return true;
  const tok = G.genToken;
  const rng = mulberry32(G.seed);
  const needsWork = G.noGuess;
  if (needsWork) {
    G.phase = 'generating';
    $('genOverlay').classList.remove('hidden');
    $('genText').textContent = 'BUILDING A NO-GUESS FIELD…';
    await nextFrame();
  }
  const out = await generateField(G.n, G.nbr, G.mines, startIdx, G.noGuess, rng, (it, max) => {
    $('genText').textContent = `BUILDING A NO-GUESS FIELD… ${Math.min(99, Math.round((it / max) * 100))}%`;
  });
  if (tok !== G.genToken) { $('genOverlay').classList.add('hidden'); return false; }  // board was replaced mid-build
  G.mine = out.mine;
  G.adj = computeAdj(G.mine, G.nbr, G.n);
  G.bbbv = compute3BV(G.mine, G.adj, G.nbr, G.n);
  G.generated = true;
  G.guaranteed = out.guaranteed;
  if (needsWork) {
    $('genOverlay').classList.add('hidden');
    if (!out.guaranteed) {
      toast('No logic-only field found at this density — this one may need a guess.');
    } else {
      setStatus('No-Guess field verified: pure logic can finish it.');
    }
  }
  if (G.phase === 'generating') G.phase = 'playing';
  dirty = true;
  return true;
}

/* ============================== ACTIONS ================================= */

async function digCell(idx) {
  if (G.phase === 'won' || G.phase === 'lost' || G.phase === 'generating') return;
  if (idx < 0 || idx >= G.n) return;
  if (G.state[idx] === 1 || G.state[idx] === 2) return;
  if (!G.generated) {
    await ensureGenerated(idx);
    if (G.phase === 'menu') return;
  }
  if (G.phase === 'ready') G.phase = 'playing';
  G.clicks++;
  if (G.mine[idx]) { lose(idx); return; }
  const opened = floodReveal(idx);
  AudioFX.open(opened);
  postMove();
}

function floodReveal(start) {
  const stack = [start];
  let opened = 0;
  while (stack.length) {
    const i = stack.pop();
    const s = G.state[i];
    if (s === 1 || s === 2) continue;
    G.state[i] = 1; G.revealed++; opened++;
    if (!REDUCED) fx.anims.push({ i, t: 1 });
    if (G.adj[i] === 0) {
      const nb = G.nbr[i];
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k];
        const sj = G.state[j];
        if (sj === 0 || sj === 3) stack.push(j);
      }
    }
  }
  career.cellsRevealed += opened;
  dirty = true;
  return opened;
}

function toggleFlag(idx) {
  if (G.phase !== 'playing' && G.phase !== 'ready' && G.phase !== 'generating') return;
  if (idx < 0 || idx >= G.n || G.state[idx] === 1) return;
  const s = G.state[idx];
  if (s === 0) { G.state[idx] = 2; G.flags++; AudioFX.flag(); }
  else if (s === 2) {
    G.flags--;
    if (settings.qmark) { G.state[idx] = 3; AudioFX.unflag(); }
    else { G.state[idx] = 0; AudioFX.unflag(); }
  } else { G.state[idx] = 0; AudioFX.unflag(); }
  dirty = true;
  updateHUD();
}

function chordAt(idx) {
  if (G.phase !== 'playing') { AudioFX.deny(); return; }
  if (idx < 0 || idx >= G.n || G.state[idx] !== 1 || G.adj[idx] === 0) { AudioFX.deny(); return; }
  let flags = 0;
  const targets = [];
  const nb = G.nbr[idx];
  for (let k = 0; k < nb.length; k++) {
    const j = nb[k];
    if (G.state[j] === 2) flags++;
    else if (G.state[j] === 0 || G.state[j] === 3) targets.push(j);
  }
  if (flags !== G.adj[idx] || targets.length === 0) { AudioFX.deny(); return; }
  G.clicks++; G.chords++; career.chords++;
  awardProgress('chord_100', career.chords, 100);
  let boom = -1;
  for (let k = 0; k < targets.length; k++) if (G.mine[targets[k]]) { boom = targets[k]; break; }
  if (boom >= 0) { lose(boom); return; }
  AudioFX.chord();
  let opened = 0;
  for (let k = 0; k < targets.length; k++) opened += floodReveal(targets[k]);
  AudioFX.open(opened);
  postMove();
}

function postMove() {
  updateHUD();
  dirty = true;
  if (G.revealed >= G.n - G.mines) win();
}

function lose(idx) {
  G.phase = 'lost';
  G.lostAt = idx;
  for (let i = 0; i < G.n; i++) if (G.mine[i] && G.state[i] === 3) G.state[i] = 0;
  AudioFX.boom();
  if (!REDUCED) { fx.shake = 16; fx.shakeT = 0.55; spawnBlast(idx); }
  career.losses++;
  career.streak = 0;
  const rec = getRecord(G.cfgKey);
  rec.losses++;
  updateHUD();
  dirty = true;
  persist();
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => showResult(false), REDUCED ? 350 : 1000);
}

function win() {
  G.phase = 'won';
  for (let i = 0; i < G.n; i++) if (G.mine[i] && G.state[i] !== 2) { G.state[i] = 2; G.flags++; }
  AudioFX.win();
  fx.winT = 1.6;
  career.wins++;
  career.streak++;
  career.bestStreak = Math.max(career.bestStreak, career.streak);
  if (!G.bbbv) G.bbbv = compute3BV(G.mine, G.adj, G.nbr, G.n);

  const t = Math.max(0.001, G.elapsed);
  const rate = G.bbbv / t;
  const eff = G.clicks > 0 ? G.bbbv / G.clicks : 0;
  const rec = getRecord(G.cfgKey);
  rec.wins++;
  let isRecord = false;
  if (G.hints === 0) {
    if (rec.best === null || t < rec.best) { rec.best = t; isRecord = true; }
    if (rec.bestRate === null || rate > rec.bestRate) rec.bestRate = rate;
    if (rec.bestEff === null || eff > rec.bestEff) rec.bestEff = eff;
  }
  if (G.daily && G.hints === 0) {
    if (career.dailyDate !== todayKey() || career.dailyBest === null || t < career.dailyBest) {
      career.dailyDate = todayKey(); career.dailyBest = t;
    }
  }
  G.lastWin = { t, rate, eff, isRecord };

  // ---- achievements ----
  award('first_clear');
  awardProgress('clear_25', career.wins, 25);
  awardProgress('streak_5', career.streak, 5);
  const big = G.n >= 256 && G.mines >= 40;
  if (G.cfg.key === 'beginner' && t < 10) award('beginner_ace');
  if (G.cfg.key === 'intermediate' && t < 60) award('intermediate_ace');
  if (G.cfg.key === 'expert' && t < 250) award('expert_ace');
  if (G.noGuess && G.guaranteed && G.cfg.key === 'expert') award('noguess_expert');
  if (big && G.clicks > 0 && G.clicks <= G.bbbv) award('perfect_efficiency');
  if (big && G.flags === G.mines && G.clicks > 0) {
    // flags at the end are auto-planted; a true flagless win never touched flag input
    if (!G.usedFlagInput) award('flagless_win');
  }

  updateHUD();
  dirty = true;
  persist();
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => showResult(true), REDUCED ? 250 : 700);
}

function useHint() {
  if (G.phase !== 'playing' && G.phase !== 'ready') { AudioFX.deny(); return; }
  if (!G.generated) { toast('Make your first click — it is always safe.'); return; }
  const known = new Int8Array(G.n).fill(-1);
  for (let i = 0; i < G.n; i++) if (G.state[i] === 1) known[i] = 0;
  const d = deduce(known, G.n, G.nbr, G.adj, G.mines, true);
  const safe = d.safe.filter((i) => G.state[i] !== 1);
  if (safe.length) {
    safe.sort((a, b) => cellDist(a, G.cursor) - cellDist(b, G.cursor));
    fx.hintIdx = safe[0]; fx.hintT = 3;
    G.cursor = safe[0];
    G.hints++;
    AudioFX.tone(1046, 0.16, 'sine', 0.12, 1568);
    toast('Provably safe — that square cannot hold a mine. (Record disabled for this board.)');
  } else if (d.mines.length) {
    const m = d.mines.filter((i) => G.state[i] !== 2);
    if (m.length) {
      fx.hintIdx = m[0]; fx.hintT = 3; G.cursor = m[0]; G.hints++;
      AudioFX.tone(300, 0.18, 'square', 0.1, 200);
      toast('Provably a MINE — flag it. (Record disabled for this board.)');
    } else { toast('No new deduction available from what is uncovered.'); AudioFX.deny(); }
  } else {
    toast('Nothing is provable right now — this position needs a guess.');
    AudioFX.deny();
  }
  dirty = true;
  updateHUD();
}

function cellDist(a, b) {
  const ax = a % G.cols, ay = (a / G.cols) | 0, bx = b % G.cols, by = (b / G.cols) | 0;
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/* ============================== FX ====================================== */

function spawnBlast(idx) {
  const x = (idx % G.cols) + 0.5, y = ((idx / G.cols) | 0) + 0.5;
  for (let k = 0; k < 56; k++) {
    const p = fx.pool.pop() || {};
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 9;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 2;
    p.life = 0.5 + Math.random() * 0.7; p.max = p.life;
    p.r = 0.06 + Math.random() * 0.16;
    p.c = Math.random() < 0.45 ? '#ffcf5c' : (Math.random() < 0.6 ? '#ff6b3d' : '#8a8f9c');
    fx.particles.push(p);
  }
}

/* ============================== LAYOUT / RENDER ========================= */

const canvas = $('board');
const ctx = canvas.getContext('2d', { alpha: false });
let dpr = 1;

function layout() {
  const stage = $('stage');
  const w = stage.clientWidth, h = stage.clientHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  if (!G.cols) return;
  const fit = Math.min((w - 26) / G.cols, (h - 26) / G.rows);
  view.base = clamp(Math.floor(fit), 9, 46);
  view.cell = Math.max(7, Math.round(view.base * view.zoom));
  const bw = view.cell * G.cols, bh = view.cell * G.rows;
  view.maxPanX = Math.max(0, (bw - w) / 2 + 14);
  view.maxPanY = Math.max(0, (bh - h) / 2 + 14);
  view.panX = clamp(view.panX, -view.maxPanX, view.maxPanX);
  view.panY = clamp(view.panY, -view.maxPanY, view.maxPanY);
  view.ox = Math.round((w - bw) / 2 - view.panX);
  view.oy = Math.round((h - bh) / 2 - view.panY);
  dirty = true;
}

function cellAtPixel(px, py) {
  const cx = Math.floor((px - view.ox) / view.cell);
  const cy = Math.floor((py - view.oy) / view.cell);
  if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.rows) return -1;
  return cy * G.cols + cx;
}

function render() {
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#080b14';
  ctx.fillRect(0, 0, w, h);

  if (!G.cols) return;

  let sx = 0, sy = 0;
  if (fx.shakeT > 0) {
    const k = fx.shake * (fx.shakeT / 0.55);
    sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k;
  }
  ctx.save();
  ctx.translate(sx, sy);

  const c = view.cell;
  const bw = c * G.cols, bh = c * G.rows;

  // frame
  ctx.fillStyle = '#131a2b';
  roundRect(ctx, view.ox - 8, view.oy - 8, bw + 16, bh + 16, 8);
  ctx.fill();
  ctx.strokeStyle = G.phase === 'lost' ? '#7a2b28' : G.phase === 'won' ? '#2f7a52' : '#2a3550';
  ctx.lineWidth = 2;
  ctx.stroke();

  const hidden = G.phase === 'paused';

  // visible range
  const x0 = clamp(Math.floor((0 - view.ox) / c) - 1, 0, G.cols - 1);
  const x1 = clamp(Math.ceil((w - view.ox) / c) + 1, 0, G.cols - 1);
  const y0 = clamp(Math.floor((0 - view.oy) / c) - 1, 0, G.rows - 1);
  const y1 = clamp(Math.ceil((h - view.oy) / c) + 1, 0, G.rows - 1);

  const bevel = Math.max(2, Math.round(c * 0.11));
  ctx.font = `bold ${Math.round(c * 0.62)}px Consolas, "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * G.cols + x;
      const px = view.ox + x * c, py = view.oy + y * c;
      drawCell(i, px, py, c, bevel, hidden);
    }
  }

  // reveal animation: a cover tile fading off the freshly opened square
  if (fx.anims.length) {
    for (let k = 0; k < fx.anims.length; k++) {
      const a = fx.anims[k];
      const x = a.i % G.cols, y = (a.i / G.cols) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.globalAlpha = clamp(a.t, 0, 1);
      drawHiddenTile(view.ox + x * c, view.oy + y * c, c, bevel);
    }
    ctx.globalAlpha = 1;
  }

  // pressed preview
  if (!hidden) {
    for (let k = 0; k < fx.pressed.length; k++) {
      const i = fx.pressed[k];
      if (G.state[i] !== 0 && G.state[i] !== 3) continue;
      const px = view.ox + (i % G.cols) * c, py = view.oy + ((i / G.cols) | 0) * c;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
    }
  }

  // hover
  if (!hidden && fx.hoverIdx >= 0 && fx.hoverIdx < G.n && (G.phase === 'playing' || G.phase === 'ready')) {
    const i = fx.hoverIdx;
    const px = view.ox + (i % G.cols) * c, py = view.oy + ((i / G.cols) | 0) * c;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1, py + 1, c - 2, c - 2);
  }

  // keyboard cursor
  if (!hidden) {
    const i = G.cursor;
    const px = view.ox + (i % G.cols) * c, py = view.oy + ((i / G.cols) | 0) * c;
    ctx.strokeStyle = '#ffd27f';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(px + 1.5, py + 1.5, c - 3, c - 3);
    ctx.setLineDash([]);
  }

  // hint pulse
  if (!hidden && fx.hintIdx >= 0 && fx.hintT > 0) {
    const i = fx.hintIdx;
    const px = view.ox + (i % G.cols) * c, py = view.oy + ((i / G.cols) | 0) * c;
    const a = 0.35 + 0.45 * Math.abs(Math.sin(fx.hintT * 5));
    ctx.strokeStyle = `rgba(110,231,160,${a})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 2, py + 2, c - 4, c - 4);
  }

  // particles
  for (let k = 0; k < fx.particles.length; k++) {
    const p = fx.particles[k];
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(view.ox + p.x * c, view.oy + p.y * c, p.r * c, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // win glow
  if (fx.winT > 0) {
    ctx.globalAlpha = clamp(fx.winT / 1.6, 0, 1) * 0.35;
    ctx.fillStyle = '#6ee7a0';
    roundRect(ctx, view.ox - 8, view.oy - 8, bw + 16, bh + 16, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawCell(i, px, py, c, bevel, hideAll) {
  const st = G.state[i];
  const lost = G.phase === 'lost';
  const isMine = G.generated && G.mine[i];

  if (hideAll) { drawHiddenTile(px, py, c, bevel); return; }

  if (st === 1) {
    drawRevealedTile(px, py, c);
    const a = G.adj[i];
    if (a > 0) {
      ctx.fillStyle = NUM_COLOR[a];
      ctx.fillText(String(a), px + c / 2, py + c / 2 + c * 0.03);
    }
  } else if (lost && isMine && st !== 2) {
    drawRevealedTile(px, py, c, i === G.lostAt ? '#e05a4a' : '#c9cfdd');
    drawMine(px, py, c);
  } else {
    drawHiddenTile(px, py, c, bevel);
    if (st === 2) {
      drawFlag(px, py, c);
      if (lost && !isMine) drawCross(px, py, c);
    } else if (st === 3) {
      ctx.fillStyle = '#20263a';
      ctx.fillText('?', px + c / 2, py + c / 2 + c * 0.03);
    }
  }
}

function drawHiddenTile(px, py, c, bevel) {
  const b = bevel || Math.max(2, Math.round(c * 0.11));
  ctx.fillStyle = '#9aa4bd';
  ctx.fillRect(px, py, c - 1, c - 1);
  ctx.fillStyle = '#cfd7e8';
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(px + c - 1, py); ctx.lineTo(px + c - 1 - b, py + b);
  ctx.lineTo(px + b, py + b); ctx.lineTo(px + b, py + c - 1 - b); ctx.lineTo(px, py + c - 1);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5f6a86';
  ctx.beginPath();
  ctx.moveTo(px + c - 1, py); ctx.lineTo(px + c - 1, py + c - 1); ctx.lineTo(px, py + c - 1);
  ctx.lineTo(px + b, py + c - 1 - b); ctx.lineTo(px + c - 1 - b, py + c - 1 - b); ctx.lineTo(px + c - 1 - b, py + b);
  ctx.closePath(); ctx.fill();
}

function drawRevealedTile(px, py, c, color) {
  ctx.fillStyle = color || '#c9cfdd';
  ctx.fillRect(px, py, c - 1, c - 1);
  ctx.strokeStyle = 'rgba(90,100,125,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, c - 2, c - 2);
}

function drawMine(px, py, c) {
  const cx = px + c / 2, cy = py + c / 2, r = c * 0.26;
  ctx.strokeStyle = '#101318';
  ctx.lineWidth = Math.max(1, c * 0.07);
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 4) * k;
    ctx.moveTo(cx - Math.cos(a) * r * 1.55, cy - Math.sin(a) * r * 1.55);
    ctx.lineTo(cx + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 1.55);
  }
  ctx.stroke();
  ctx.fillStyle = '#101318';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2); ctx.fill();
}

function drawFlag(px, py, c) {
  const bx = px + c * 0.5, by = py + c * 0.78;
  ctx.strokeStyle = '#1b1f2b';
  ctx.lineWidth = Math.max(1.2, c * 0.075);
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx, py + c * 0.24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + c * 0.28, by); ctx.lineTo(px + c * 0.72, by);
  ctx.stroke();
  ctx.fillStyle = G.phase === 'won' ? '#ffcf4a' : '#d63a2e';
  ctx.beginPath();
  ctx.moveTo(bx, py + c * 0.22);
  ctx.lineTo(px + c * 0.24, py + c * 0.38);
  ctx.lineTo(bx, py + c * 0.53);
  ctx.closePath(); ctx.fill();
}

function drawCross(px, py, c) {
  ctx.strokeStyle = 'rgba(200,40,30,0.9)';
  ctx.lineWidth = Math.max(1.5, c * 0.09);
  ctx.beginPath();
  ctx.moveTo(px + c * 0.16, py + c * 0.16); ctx.lineTo(px + c * 0.84, py + c * 0.84);
  ctx.moveTo(px + c * 0.84, py + c * 0.16); ctx.lineTo(px + c * 0.16, py + c * 0.84);
  ctx.stroke();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ============================== LOOP ==================================== */

const STEP = 1 / 60;
let acc = 0, last = performance.now();

function update(dt) {
  if (G.phase === 'playing') { G.elapsed += dt; dirty = true; }

  if (fx.shakeT > 0) { fx.shakeT -= dt; dirty = true; if (fx.shakeT <= 0) fx.shakeT = 0; }
  if (fx.winT > 0) { fx.winT -= dt; dirty = true; }
  if (fx.hintT > 0) { fx.hintT -= dt; dirty = true; if (fx.hintT <= 0) fx.hintIdx = -1; }

  if (fx.anims.length) {
    for (let k = fx.anims.length - 1; k >= 0; k--) {
      fx.anims[k].t -= dt * 7;
      if (fx.anims[k].t <= 0) fx.anims.splice(k, 1);
    }
    dirty = true;
  }
  if (fx.particles.length) {
    for (let k = fx.particles.length - 1; k >= 0; k--) {
      const p = fx.particles[k];
      p.life -= dt;
      p.vy += dt * 16;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { fx.particles.splice(k, 1); if (fx.pool.length < 200) fx.pool.push(p); }
    }
    dirty = true;
  }

  playtimeAccum += dt;
  if (playtimeAccum >= 30) { reportPlaytime(); }

  if (G.phase === 'playing') {
    saveTimer += dt;
    if (saveTimer >= 15) { saveTimer = 0; persist(); }
  }
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 6) { update(STEP); acc -= STEP; steps++; }
  if (acc > STEP * 6) acc = 0;
  if (dirty) { render(); updateTimerHUD(); dirty = false; }
}

/* ============================== HUD ===================================== */

function updateTimerHUD() {
  $('timer').textContent = pad3(G.elapsed);
  const rate = G.elapsed > 0.2 && G.bbbv ? (G.bbbv * (G.revealed / Math.max(1, G.n - G.mines))) / G.elapsed : 0;
  $('bbbvRate').textContent = rate.toFixed(2) + '/s';
}

function updateHUD() {
  const remain = G.mines - G.flags;
  $('mineCount').textContent = remain < 0 ? '-' + pad3(-remain).slice(1) : pad3(remain);
  const face = $('face');
  face.textContent = G.phase === 'lost' ? '😵' : G.phase === 'won' ? '😎' : (input.lmb || input.chordMode) ? '😮' : '🙂';
  const total = Math.max(1, G.n - G.mines);
  $('progressBar').style.width = `${(G.revealed / total) * 100}%`;
  $('chipDiff').textContent = G.label + (G.noGuess ? ' · No-Guess' : '');
  const rec = records[G.cfgKey];
  $('chipBest').textContent = rec && rec.best !== null && rec.best !== undefined ? `Best ${rec.best.toFixed(2)}s` : 'Best —';
  $('btnHint').disabled = !(G.phase === 'playing' || G.phase === 'ready');
  $('btnPause').disabled = !(G.phase === 'playing' || G.phase === 'ready');
  $('btnFlagMode').classList.toggle('on', input.flagMode);
  updateTimerHUD();
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3400);
}
function setStatus(msg) { $('statusLine').textContent = msg; }

let achTimer = null;
function achToast(title, desc) {
  const el = $('achToast');
  el.querySelector('.t').textContent = '🏅 ' + title;
  el.querySelector('.d').textContent = desc;
  el.classList.remove('hidden');
  clearTimeout(achTimer);
  achTimer = setTimeout(() => el.classList.add('hidden'), 3800);
}

/* ============================== SCREENS ================================= */

const SCREENS = ['menuScreen', 'customScreen', 'howtoScreen', 'recordsScreen', 'pauseScreen', 'resultScreen'];
let screenStack = [];

function hideAllScreens() {
  for (const id of SCREENS) $(id).classList.add('hidden');
  screenStack = [];
}
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.add('hidden');
  $(id).classList.remove('hidden');
}

function openMenu() {
  if (G.phase === 'playing') { G.phase = 'paused'; persist(); }
  refreshMenu();
  showScreen('menuScreen');
  dirty = true;
}

function refreshMenu() {
  $('tglNoGuess').classList.toggle('on', settings.noGuess);
  $('tglQMark').classList.toggle('on', settings.qmark);
  $('tglSound').classList.toggle('on', settings.sound);
  const hasSave = !!(G.savedGame);
  $('btnResume').disabled = !hasSave;
  if (hasSave) {
    const s = G.savedGame;
    $('btnResume').innerHTML = `▶ Resume — ${s.label} <span class="k">${Math.floor(s.elapsed)}s</span>`;
  } else {
    $('btnResume').innerHTML = '▶ Resume Saved Game<span class="k">none</span>';
  }
  $('dailyTag').textContent = career.dailyDate === todayKey() ? 'done' : 'today';
  const b = records['beginner'], i = records['intermediate'], e = records['expert'];
  const bits = [];
  if (b && b.best != null) bits.push(`Beginner ${b.best.toFixed(2)}s`);
  if (i && i.best != null) bits.push(`Intermediate ${i.best.toFixed(2)}s`);
  if (e && e.best != null) bits.push(`Expert ${e.best.toFixed(2)}s`);
  $('menuRecordLine').textContent = bits.length
    ? 'Best times — ' + bits.join(' · ')
    : 'No records yet — clear a board to set one.';
}

function pauseGame() {
  if (G.phase !== 'playing' && G.phase !== 'ready') return;
  G.phase = 'paused';
  $('pauseStats').innerHTML = statRows([
    ['Field', G.label + (G.noGuess ? ' (No-Guess)' : '')],
    ['Elapsed', G.elapsed.toFixed(2) + 's'],
    ['Uncovered', `${G.revealed} / ${G.n - G.mines}`],
    ['Flags', `${G.flags} / ${G.mines}`],
    ['Clicks', String(G.clicks)],
  ]);
  showScreen('pauseScreen');
  persist();
  dirty = true;
  updateHUD();
}

function resumeGame() {
  if (G.phase !== 'paused') return;
  hideAllScreens();
  G.phase = G.generated ? 'playing' : 'ready';
  last = performance.now();
  dirty = true;
  updateHUD();
}

function statRows(rows) {
  return rows.map(([k, v]) => `<div class="statline"><span>${k}</span><b>${v}</b></div>`).join('');
}

function showResult(isWin) {
  const rec = records[G.cfgKey] || {};
  if (isWin) {
    const { t, rate, eff, isRecord } = G.lastWin;
    $('resIcon').textContent = isRecord ? '🏆' : '✅';
    $('resTitle').textContent = 'FIELD CLEARED';
    $('resSub').textContent = G.label.toUpperCase().split('').join(' ');
    $('resStats').innerHTML =
      (isRecord ? '<div class="statline"><span>Result</span><b><span class="badge rec">NEW RECORD</span></b></div>' : '') +
      statRows([
        ['Time', t.toFixed(2) + 's'],
        ['3BV', String(G.bbbv)],
        ['3BV / sec', rate.toFixed(2)],
        ['Efficiency', Math.round(eff * 100) + '%'],
        ['Clicks', String(G.clicks) + (G.chords ? ` (${G.chords} chords)` : '')],
        ['Hints used', String(G.hints) + (G.hints ? ' — record disabled' : '')],
        ['Best time', rec.best != null ? rec.best.toFixed(2) + 's' : '—'],
        ['Win streak', String(career.streak)],
      ]);
  } else {
    $('resIcon').textContent = '💥';
    $('resTitle').textContent = 'BOOM';
    $('resSub').textContent = G.label.toUpperCase().split('').join(' ');
    const total = Math.max(1, G.n - G.mines);
    $('resStats').innerHTML = statRows([
      ['Cleared', `${G.revealed} / ${total} (${Math.round((G.revealed / total) * 100)}%)`],
      ['Time', G.elapsed.toFixed(2) + 's'],
      ['3BV', String(G.bbbv || '—')],
      ['Clicks', String(G.clicks) + (G.chords ? ` (${G.chords} chords)` : '')],
      ['Flags placed', `${G.flags} / ${G.mines}`],
      ['Best time', rec.best != null ? rec.best.toFixed(2) + 's' : '—'],
      ['Record', `${rec.wins || 0}W / ${rec.losses || 0}L`],
    ]);
  }
  showScreen('resultScreen');
}

function renderRecords() {
  const keys = Object.keys(records).sort();
  const nameOf = (k) => {
    const ng = k.endsWith('|ng');
    const base = ng ? k.slice(0, -3) : k;
    let n = base;
    if (PRESETS[base]) n = PRESETS[base].name;
    else if (base === 'daily') n = 'Daily Board';
    else if (base.startsWith('custom:')) n = 'Custom ' + base.slice(7).replace('x', '×').replace('x', ' · ') + ' mines';
    return n + (ng ? ' <span class="badge ng">NG</span>' : '');
  };
  let html = '<table class="rec"><tr><th>Field</th><th class="n">Best</th><th class="n">3BV/s</th><th class="n">Eff</th><th class="n">W / L</th></tr>';
  let any = false;
  for (const k of keys) {
    const r = records[k];
    if (!r || (!r.wins && !r.losses)) continue;
    any = true;
    html += `<tr><td>${nameOf(k)}</td>` +
      `<td class="n">${r.best != null ? r.best.toFixed(2) + 's' : '—'}</td>` +
      `<td class="n">${r.bestRate != null ? r.bestRate.toFixed(2) : '—'}</td>` +
      `<td class="n">${r.bestEff != null ? Math.round(r.bestEff * 100) + '%' : '—'}</td>` +
      `<td class="n">${r.wins || 0} / ${r.losses || 0}</td></tr>`;
  }
  html += '</table>';
  $('recTable').innerHTML = any ? html : '<p class="small">Nothing recorded yet. Clear a field and it shows up here.</p>';
  const plays = career.wins + career.losses;
  $('careerStats').innerHTML = statRows([
    ['Boards cleared', String(career.wins)],
    ['Boards lost', String(career.losses)],
    ['Win rate', plays ? Math.round((career.wins / plays) * 100) + '%' : '—'],
    ['Best win streak', String(career.bestStreak)],
    ['Chords performed', String(career.chords)],
    ['Squares uncovered', String(career.cellsRevealed)],
    ['Daily best', career.dailyBest != null ? `${career.dailyBest.toFixed(2)}s (${career.dailyDate})` : '—'],
  ]);
}

/* ============================== PERSISTENCE ============================= */

function getRecord(key) {
  if (!records[key]) records[key] = { best: null, bestRate: null, bestEff: null, wins: 0, losses: 0 };
  return records[key];
}

function snapshotGame() {
  if (!G.generated || G.phase === 'won' || G.phase === 'lost' || !G.cols) return null;
  if (G.revealed === 0) return null;
  const mines = [];
  for (let i = 0; i < G.n; i++) if (G.mine[i]) mines.push(i);
  return {
    cols: G.cols, rows: G.rows, mines: G.mines, mineIdx: mines,
    state: Array.from(G.state), revealed: G.revealed, flags: G.flags,
    clicks: G.clicks, chords: G.chords, hints: G.hints, elapsed: G.elapsed,
    bbbv: G.bbbv, cfgKey: G.cfgKey, label: G.label, noGuess: G.noGuess,
    daily: G.daily, guaranteed: G.guaranteed, seed: G.seed,
    cfg: { key: G.cfg.key || null, name: G.cfg.name || null, cols: G.cols, rows: G.rows, mines: G.mines },
    usedFlagInput: !!G.usedFlagInput,
  };
}

async function persist() {
  const snap = snapshotGame();
  G.savedGame = snap;
  const blob = { records, career, settings, inProgress: snap };
  const meta = {
    label: snap ? `${snap.label} · ${Math.floor(snap.elapsed)}s` : 'Records',
    playtimeSec: Math.floor(career.cellsRevealed / 6),
    progress: snap ? snap.revealed / Math.max(1, snap.cols * snap.rows - snap.mines) : 0,
    mode: G.noGuess ? 'no-guess' : 'classic',
    difficulty: G.label,
  };
  try {
    if (empire) {
      await empire.saveState('auto', blob, meta);
      if (snap) await empire.setContinuePoint('auto', meta.label);
    }
  } catch (e) { /* hub unavailable — standalone fallback already handled by SDK */ }
}

async function loadPersisted() {
  try {
    const rec = await empire.loadState('auto');
    if (!rec || !rec.blob) return;
    const b = rec.blob;
    if (b.records) records = b.records;
    if (b.career) Object.assign(career, b.career);
    if (b.settings) Object.assign(settings, b.settings);
    if (b.inProgress) G.savedGame = b.inProgress;
  } catch (e) { /* version mismatch or empty — start fresh */ }
}

function resumeSaved() {
  const s = G.savedGame;
  if (!s) return;
  const cfg = { key: s.cfg.key, name: s.cfg.name, cols: s.cols, rows: s.rows, mines: s.mines };
  G.cols = s.cols; G.rows = s.rows; G.mines = s.mines; G.n = s.cols * s.rows;
  G.nbr = buildNeighbors(s.cols, s.rows);
  G.mine = new Uint8Array(G.n);
  for (const i of s.mineIdx) G.mine[i] = 1;
  G.adj = computeAdj(G.mine, G.nbr, G.n);
  G.state = Uint8Array.from(s.state);
  G.revealed = s.revealed; G.flags = s.flags; G.clicks = s.clicks; G.chords = s.chords;
  G.hints = s.hints; G.elapsed = s.elapsed; G.bbbv = s.bbbv || compute3BV(G.mine, G.adj, G.nbr, G.n);
  G.cfg = cfg; G.cfgKey = s.cfgKey; G.label = s.label; G.noGuess = s.noGuess;
  G.daily = s.daily; G.guaranteed = s.guaranteed; G.seed = s.seed;
  G.usedFlagInput = s.usedFlagInput;
  G.generated = true; G.lostAt = -1;
  G.cursor = ((G.rows / 2) | 0) * G.cols + ((G.cols / 2) | 0);
  G.phase = 'playing';
  fx.anims.length = 0; fx.particles.length = 0; fx.hintIdx = -1; fx.winT = 0;
  view.zoom = 1; view.panX = 0; view.panY = 0;
  hideAllScreens();
  layout(); updateHUD();
  setStatus('Saved field restored.');
  last = performance.now();
  dirty = true;
}

/* ============================== ACHIEVEMENTS ============================ */

const ACH_INFO = {
  first_clear: ['Field Cleared', 'Clear your first minefield.'],
  beginner_ace: ['Beginner Ace', 'Beginner cleared under 10 seconds.'],
  intermediate_ace: ['Intermediate Ace', 'Intermediate cleared under 60 seconds.'],
  expert_ace: ['Expert Ace', 'Expert cleared under 250 seconds.'],
  flagless_win: ['No Flags Needed', 'Cleared a big board without a flag.'],
  chord_100: ['Chord Progression', '100 chord clicks performed.'],
  noguess_expert: ['Pure Logic', 'Expert cleared in No-Guess mode.'],
  clear_25: ['Veteran Sweeper', '25 minefields cleared.'],
  streak_5: ['Steady Hands', 'Five wins in a row.'],
  perfect_efficiency: ['Not One Wasted Click', '100% efficiency on a big board.'],
};

function award(id) {
  if (awarded.has(id)) return;
  awarded.add(id);
  const info = ACH_INFO[id];
  if (info) { achToast(info[0], info[1]); AudioFX.ach(); }
  try { if (empire) empire.unlockAchievement(id, 1); } catch (e) { /* ignore */ }
}

function awardProgress(id, value, target) {
  const p = clamp(value / target, 0, 1);
  if (p >= 1) { award(id); return; }
  try { if (empire) empire.unlockAchievement(id, p); } catch (e) { /* ignore */ }
}

/* ============================== PLAYTIME ================================ */

function reportPlaytime() {
  const secs = Math.floor(playtimeAccum);
  if (secs <= 0) return;
  playtimeAccum -= secs;
  try { if (empire) empire.reportPlaytime(secs); } catch (e) { /* ignore */ }
}

/* ============================== INPUT =================================== */

function canPlay() { return G.phase === 'playing' || G.phase === 'ready'; }

function updatePressed(idx, chord) {
  fx.pressed.length = 0;
  if (idx < 0) { dirty = true; return; }
  if (chord) {
    fx.pressed.push(idx);
    const nb = G.nbr[idx];
    for (let k = 0; k < nb.length; k++) fx.pressed.push(nb[k]);
  } else {
    fx.pressed.push(idx);
  }
  dirty = true;
}

function onPointerDown(e) {
  AudioFX.ensure();
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;

  if (e.shiftKey || (e.pointerType === 'mouse' && e.button === 0 && e.altKey)) {
    input.panning = true;
    input.panStart = { x: px, y: py, ox: view.panX, oy: view.panY };
    return;
  }
  const idx = cellAtPixel(px, py);
  if (!canPlay()) return;

  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    input.touchIdx = idx; input.touchMoved = false;
    clearTimeout(input.touchTimer);
    input.touchTimer = setTimeout(() => {
      if (input.touchIdx === idx && !input.touchMoved) {
        G.usedFlagInput = true;
        toggleFlag(idx);
        input.touchIdx = -2;
      }
    }, 380);
    updatePressed(idx, false);
    return;
  }

  if (e.button === 0) input.lmb = true;
  if (e.button === 2) input.rmb = true;
  input.pressIdx = idx;

  if (e.button === 1) { input.chordMode = true; updatePressed(idx, true); e.preventDefault(); }
  else if (input.lmb && input.rmb) { input.chordMode = true; input.didAction = false; updatePressed(idx, true); }
  else if (e.button === 2) {
    if (input.flagMode) { /* in flag mode, right click digs */ }
    else { G.usedFlagInput = true; toggleFlag(idx); input.didAction = true; }
  } else if (e.button === 0) {
    updatePressed(idx, false);
  }
  updateHUD();
}

function onPointerUp(e) {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const idx = cellAtPixel(px, py);

  if (input.panning) { input.panning = false; if (e.buttons === 0) { } return; }

  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    clearTimeout(input.touchTimer);
    const t = input.touchIdx;
    input.touchIdx = -1;
    fx.pressed.length = 0; dirty = true;
    if (t >= 0 && t === idx && !input.touchMoved && canPlay()) {
      if (input.flagMode) { G.usedFlagInput = true; toggleFlag(idx); }
      else if (G.state[idx] === 1) chordAt(idx);
      else digCell(idx);
    }
    return;
  }

  if (input.chordMode) {
    if (!input.didAction && idx >= 0 && idx === input.pressIdx) { chordAt(idx); }
    input.didAction = true;
  } else if (e.button === 0 && !input.didAction && idx >= 0 && idx === input.pressIdx && canPlay()) {
    if (input.flagMode) { G.usedFlagInput = true; toggleFlag(idx); }
    else if (G.state[idx] === 1) chordAt(idx);
    else digCell(idx);
  } else if (e.button === 2 && input.flagMode && !input.didAction && idx >= 0 && canPlay()) {
    if (G.state[idx] === 1) chordAt(idx); else digCell(idx);
  }

  if (e.button === 0) input.lmb = false;
  if (e.button === 2) input.rmb = false;
  if (e.button === 1) input.chordMode = false;
  if (!input.lmb && !input.rmb) { input.chordMode = false; input.didAction = false; input.pressIdx = -1; }
  fx.pressed.length = 0;
  dirty = true;
  updateHUD();
}

function onPointerMove(e) {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;

  if (input.panning && input.panStart) {
    view.panX = clamp(input.panStart.ox - (px - input.panStart.x), -view.maxPanX, view.maxPanX);
    view.panY = clamp(input.panStart.oy - (py - input.panStart.y), -view.maxPanY, view.maxPanY);
    layout();
    return;
  }
  const idx = cellAtPixel(px, py);
  if (idx !== fx.hoverIdx) { fx.hoverIdx = idx; dirty = true; }
  if (input.touchIdx >= 0) {
    if (idx !== input.touchIdx) { input.touchMoved = true; clearTimeout(input.touchTimer); }
  }
  if (input.lmb || input.chordMode) {
    input.pressIdx = idx;
    updatePressed(idx, input.chordMode);
  }
}

function onPointerLeave() {
  fx.hoverIdx = -1;
  fx.pressed.length = 0;
  input.panning = false;
  clearTimeout(input.touchTimer);
  dirty = true;
}

function onWheel(e) {
  e.preventDefault();
  const dir = e.deltaY > 0 ? -1 : 1;
  view.zoom = clamp(view.zoom * (dir > 0 ? 1.15 : 1 / 1.15), 0.55, 3.2);
  layout();
}

function onKeyDown(e) {
  const k = e.key;
  const overlayOpen = SCREENS.some((s) => !$(s).classList.contains('hidden'));

  if (k === 'Escape') {
    e.preventDefault();
    if (!$('resultScreen').classList.contains('hidden')) { openMenu(); return; }
    if (!$('howtoScreen').classList.contains('hidden')) { backFromHowto(); return; }
    if (!$('recordsScreen').classList.contains('hidden')) { openMenu(); return; }
    if (!$('customScreen').classList.contains('hidden')) { openMenu(); return; }
    if (!$('pauseScreen').classList.contains('hidden')) { resumeGame(); return; }
    if (!$('menuScreen').classList.contains('hidden')) { if (G.savedGame || G.cols) resumeFromMenu(); return; }
    pauseGame();
    return;
  }

  if (!overlayOpen) {
    if (k === 'p' || k === 'P') { e.preventDefault(); pauseGame(); return; }
    if (k === 'r' || k === 'R') { e.preventDefault(); restart(); return; }
    if (k === 'h' || k === 'H') { e.preventDefault(); useHint(); return; }
    if (k === 't' || k === 'T') { e.preventDefault(); setFlagMode(!input.flagMode); return; }
    if (k === 'm' || k === 'M') { e.preventDefault(); settings.sound = !settings.sound; toast(settings.sound ? 'Sound on' : 'Sound muted'); persist(); return; }
    if (k === '0') { e.preventDefault(); view.zoom = 1; view.panX = 0; view.panY = 0; layout(); return; }
    if (k === '+' || k === '=') { e.preventDefault(); view.zoom = clamp(view.zoom * 1.15, 0.55, 3.2); layout(); return; }
    if (k === '-' || k === '_') { e.preventDefault(); view.zoom = clamp(view.zoom / 1.15, 0.55, 3.2); layout(); return; }

    if (canPlay()) {
      let dx = 0, dy = 0;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') dx = -1;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') dx = 1;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') dy = -1;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') dy = 1;
      if (dx || dy) {
        e.preventDefault();
        const x = clamp((G.cursor % G.cols) + dx, 0, G.cols - 1);
        const y = clamp(((G.cursor / G.cols) | 0) + dy, 0, G.rows - 1);
        G.cursor = y * G.cols + x;
        dirty = true;
        return;
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (G.state[G.cursor] === 1) chordAt(G.cursor); else digCell(G.cursor);
        return;
      }
      if (k === 'f' || k === 'F') { e.preventDefault(); G.usedFlagInput = true; toggleFlag(G.cursor); return; }
    }
  } else {
    // menu shortcuts
    if (!$('menuScreen').classList.contains('hidden')) {
      if (k === '1') { startPreset('beginner'); return; }
      if (k === '2') { startPreset('intermediate'); return; }
      if (k === '3') { startPreset('expert'); return; }
      if (k === '4') { showScreen('customScreen'); return; }
    }
    if (!$('resultScreen').classList.contains('hidden')) {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); restart(); return; }
      if (k === 'r' || k === 'R') { e.preventDefault(); restartNewField(); return; }
    }
    if (!$('pauseScreen').classList.contains('hidden')) {
      if (k === 'r' || k === 'R') { e.preventDefault(); restart(); return; }
      if (k === 'p' || k === 'P') { e.preventDefault(); resumeGame(); return; }
    }
  }
}

function setFlagMode(v) {
  input.flagMode = v;
  $('btnFlagMode').classList.toggle('on', v);
  toast(v ? 'Flag mode ON — left click plants flags.' : 'Flag mode OFF — left click digs.');
}

/* ============================== FLOW HELPERS ============================ */

function startPreset(key) {
  const p = PRESETS[key];
  newGame({ ...p });
}

function startCustom() {
  const cols = clamp(parseInt($('cCols').value, 10) || 20, 5, 60);
  const rows = clamp(parseInt($('cRows').value, 10) || 14, 5, 40);
  const maxMines = cols * rows - 10;
  const mines = clamp(parseInt($('cMines').value, 10) || 40, 1, maxMines);
  $('cCols').value = cols; $('cRows').value = rows; $('cMines').value = mines;
  newGame({ key: null, name: `Custom ${cols}×${rows}`, cols, rows, mines });
}

function updateCustomWarn() {
  const cols = clamp(parseInt($('cCols').value, 10) || 20, 5, 60);
  const rows = clamp(parseInt($('cRows').value, 10) || 14, 5, 40);
  const maxMines = cols * rows - 10;
  let mines = parseInt($('cMines').value, 10) || 1;
  mines = clamp(mines, 1, maxMines);
  const d = (mines / (cols * rows)) * 100;
  let note = 'gentle';
  if (d >= 24) note = 'brutal — expect long stares';
  else if (d >= 20) note = 'comparable to Expert';
  else if (d >= 15) note = 'comparable to Intermediate';
  else if (d >= 11) note = 'comparable to Beginner';
  $('cWarn').textContent = `${cols} × ${rows} = ${cols * rows} squares · ${mines} mines · density ${d.toFixed(1)}% — ${note}. Max ${maxMines} mines.`;
  $('cStart').disabled = false;
}

function restart() {
  // Same settings, brand-new field (identical field for daily).
  if (!G.cfg) { openMenu(); return; }
  if (G.daily) newGame({ ...G.cfg }, { daily: true, seed: hashString('minefield-' + todayKey()) });
  else newGame({ ...G.cfg });
}
function restartNewField() { restart(); }

function resumeFromMenu() {
  if (G.phase === 'paused') { resumeGame(); return; }
  if (G.savedGame) { resumeSaved(); return; }
  if (G.cols && (G.phase === 'ready' || G.phase === 'playing')) { hideAllScreens(); dirty = true; }
}

function backFromHowto() {
  if (screenStack.length) { const s = screenStack.pop(); showScreen(s); }
  else if (G.phase === 'paused') showScreen('pauseScreen');
  else openMenu();
}

/* ============================== WIRING ================================== */

function wireUI() {
  $('face').addEventListener('click', () => { AudioFX.ensure(); restart(); });
  $('btnMenu').addEventListener('click', () => openMenu());
  $('btnPause').addEventListener('click', () => pauseGame());
  $('btnHint').addEventListener('click', () => useHint());
  $('btnFlagMode').addEventListener('click', () => setFlagMode(!input.flagMode));

  $('btnBeginner').addEventListener('click', () => startPreset('beginner'));
  $('btnIntermediate').addEventListener('click', () => startPreset('intermediate'));
  $('btnExpert').addEventListener('click', () => startPreset('expert'));
  $('btnCustom').addEventListener('click', () => { updateCustomWarn(); showScreen('customScreen'); });
  $('btnDaily').addEventListener('click', () => {
    newGame({ ...PRESETS.intermediate, key: 'daily', name: 'Daily' },
      { daily: true, seed: hashString('minefield-' + todayKey()) });
  });
  $('btnResume').addEventListener('click', () => resumeSaved());
  $('btnHowto').addEventListener('click', () => { screenStack.push('menuScreen'); showScreen('howtoScreen'); });
  $('btnRecords').addEventListener('click', () => { renderRecords(); showScreen('recordsScreen'); });

  $('tglNoGuess').addEventListener('click', () => { settings.noGuess = !settings.noGuess; refreshMenu(); persist(); });
  $('tglQMark').addEventListener('click', () => { settings.qmark = !settings.qmark; refreshMenu(); persist(); });
  $('tglSound').addEventListener('click', () => {
    settings.sound = !settings.sound; refreshMenu(); persist();
    if (settings.sound) { AudioFX.ensure(); AudioFX.flag(); }
  });

  $('cStart').addEventListener('click', () => startCustom());
  $('cBack').addEventListener('click', () => openMenu());
  for (const id of ['cCols', 'cRows', 'cMines']) $(id).addEventListener('input', updateCustomWarn);

  $('howBack').addEventListener('click', () => backFromHowto());
  $('recBack').addEventListener('click', () => openMenu());

  let resetArmed = false;
  $('recReset').addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      $('recReset').textContent = 'Really erase every record? Click again.';
      setTimeout(() => { resetArmed = false; $('recReset').textContent = 'Erase All Records'; }, 4000);
      return;
    }
    records = {};
    career.wins = career.losses = career.chords = career.streak = career.bestStreak = 0;
    career.cellsRevealed = 0; career.dailyBest = null; career.dailyDate = null;
    resetArmed = false;
    $('recReset').textContent = 'Erase All Records';
    renderRecords(); persist(); updateHUD();
    toast('All records erased.');
  });

  $('pResume').addEventListener('click', () => resumeGame());
  $('pRestart').addEventListener('click', () => restart());
  $('pHowto').addEventListener('click', () => { screenStack.push('pauseScreen'); showScreen('howtoScreen'); });
  $('pMenu').addEventListener('click', () => openMenu());

  $('resAgain').addEventListener('click', () => restart());
  $('resSame').addEventListener('click', () => restartNewField());
  $('resMenu').addEventListener('click', () => openMenu());

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('stage'));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (G.phase === 'playing') pauseGame();
      reportPlaytime();
      persist();
    } else if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  });
  window.addEventListener('pagehide', () => { reportPlaytime(); persist(); });
  window.addEventListener('blur', () => { input.lmb = input.rmb = input.chordMode = false; fx.pressed.length = 0; dirty = true; });
}

/* ============================== BOOT ==================================== */

async function boot() {
  wireUI();

  empire = new EmpireClient({
    gameId: GAME_ID,
    saveVersion: SAVE_VERSION,
    onPause: () => { if (G.phase === 'playing') pauseGame(); },
    onResume: () => { if (G.phase === 'paused') resumeGame(); },
    onSettings: (s) => applyHubSettings(s),
  });

  try {
    const init = await empire.connect();
    if (init && init.settings) applyHubSettings(init.settings);
  } catch (e) { /* standalone */ }

  await loadPersisted();

  // seed a neutral board so the canvas behind the menu is not empty
  const p = PRESETS.beginner;
  G.cols = p.cols; G.rows = p.rows; G.mines = p.mines; G.n = p.cols * p.rows;
  G.nbr = buildNeighbors(p.cols, p.rows);
  G.mine = new Uint8Array(G.n); G.adj = new Uint8Array(G.n); G.state = new Uint8Array(G.n);
  G.cfg = { ...p }; G.cfgKey = 'beginner'; G.label = p.name; G.phase = 'menu';

  layout();
  updateHUD();
  updateCustomWarn();
  refreshMenu();
  showScreen('menuScreen');

  last = performance.now();
  requestAnimationFrame(frame);
}

function applyHubSettings(s) {
  if (!s) return;
  if (typeof s.sound === 'boolean') settings.sound = s.sound;
  if (typeof s.sfx === 'boolean') settings.sound = s.sfx;
  const vol = typeof s.volume === 'number' ? s.volume : (typeof s.masterVolume === 'number' ? s.masterVolume : null);
  if (vol !== null && AudioFX.master) AudioFX.master.gain.value = clamp(vol, 0, 1) * 0.5;
  refreshMenu();
}

boot();
