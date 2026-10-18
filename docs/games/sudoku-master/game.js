/* =============================================================================
   SUDOKU MASTER â€” Gaming Empire
   DOM + canvas2d. Backtracking generator with guaranteed-unique solutions,
   human-technique rater & hint engine, pencil notes, seeded daily puzzle,
   streaks, undo/redo, full keyboard + pointer input. 100% offline.
   ========================================================================== */

import { EmpireClient } from '../../shared/empire-sdk.js';

/* ============================== tiny helpers ============================== */

const N = 81;
const ALL = 0x1FF;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = (s / 3600) | 0;
  const m = ((s % 3600) / 60) | 0;
  const ss = s % 60;
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return h > 0 ? h + ':' + p(m) + ':' + p(ss) : p(m) + ':' + p(ss);
}

function popcount(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
function maskDigits(m) { const o = []; for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) o.push(d); return o; }
function firstDigit(m) { for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) return d; return 0; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function range81() { const a = new Array(N); for (let i = 0; i < N; i++) a[i] = i; return a; }

/* ============================ grid topology ============================== */

const ROW_OF = new Uint8Array(N), COL_OF = new Uint8Array(N), BOX_OF = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = (i / 9) | 0, c = i % 9;
  ROW_OF[i] = r; COL_OF[i] = c; BOX_OF[i] = ((r / 3) | 0) * 3 + ((c / 3) | 0);
}
const ROW_U = [], COL_U = [], BOX_U = [];
for (let r = 0; r < 9; r++) { const a = []; for (let c = 0; c < 9; c++) a.push(r * 9 + c); ROW_U.push(a); }
for (let c = 0; c < 9; c++) { const a = []; for (let r = 0; r < 9; r++) a.push(r * 9 + c); COL_U.push(a); }
for (let b = 0; b < 9; b++) {
  const a = [], br = ((b / 3) | 0) * 3, bc = (b % 3) * 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a.push((br + r) * 9 + bc + c);
  BOX_U.push(a);
}
const UNITS = ROW_U.concat(COL_U, BOX_U);
const PEERS = [];
for (let i = 0; i < N; i++) {
  const s = new Set();
  for (const u of [ROW_U[ROW_OF[i]], COL_U[COL_OF[i]], BOX_U[BOX_OF[i]]]) for (const j of u) if (j !== i) s.add(j);
  PEERS.push(Array.from(s));
}
const cellName = (i) => 'R' + (ROW_OF[i] + 1) + 'C' + (COL_OF[i] + 1);
function unitName(u) {
  if (u < 9) return 'row ' + (u + 1);
  if (u < 18) return 'column ' + (u - 8);
  return 'box ' + (u - 17);
}

/* =============================== solver ================================== */

function buildMasks(g) {
  const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
  for (let i = 0; i < N; i++) {
    const v = g[i]; if (!v) continue;
    const bit = 1 << (v - 1), r = ROW_OF[i], c = COL_OF[i], b = BOX_OF[i];
    if ((rows[r] | cols[c] | boxes[b]) & bit) return null;
    rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
  }
  return { rows, cols, boxes };
}

/** Counts solutions up to `limit`. Writes the first solution into `out` if given. */
function solveGrid(grid, limit, rng, out) {
  const g = Int8Array.from(grid);
  const m = buildMasks(g);
  if (!m) return 0;
  let count = 0;

  function rec() {
    let best = -1, bestMask = 0, bestCnt = 10;
    for (let i = 0; i < N; i++) {
      if (g[i]) continue;
      const cand = ALL & ~(m.rows[ROW_OF[i]] | m.cols[COL_OF[i]] | m.boxes[BOX_OF[i]]);
      if (!cand) return;
      const cnt = popcount(cand);
      if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = cand; if (cnt === 1) break; }
    }
    if (best < 0) { count++; if (out && count === 1) out.set(g); return; }
    const r = ROW_OF[best], c = COL_OF[best], b = BOX_OF[best];
    const ds = maskDigits(bestMask);
    if (rng) shuffle(ds, rng);
    for (let k = 0; k < ds.length; k++) {
      const bit = 1 << (ds[k] - 1);
      g[best] = ds[k]; m.rows[r] |= bit; m.cols[c] |= bit; m.boxes[b] |= bit;
      rec();
      g[best] = 0; m.rows[r] &= ~bit; m.cols[c] &= ~bit; m.boxes[b] &= ~bit;
      if (count >= limit) return;
    }
  }
  rec();
  return count;
}

function generateFull(rng) {
  const empty = new Int8Array(N), sol = new Int8Array(N);
  solveGrid(empty, 1, rng, sol);
  return sol;
}

/* ====================== human-technique logic engine ===================== */

function lsNew(vals) {
  const v = Int8Array.from(vals);
  const cands = new Uint16Array(N);
  for (let i = 0; i < N; i++) if (!v[i]) cands[i] = ALL;
  for (let i = 0; i < N; i++) {
    if (!v[i]) continue;
    const bit = 1 << (v[i] - 1);
    const p = PEERS[i];
    for (let k = 0; k < p.length; k++) cands[p[k]] &= ~bit;
  }
  return { v, cands };
}
function lsPlace(st, i, d) {
  st.v[i] = d; st.cands[i] = 0;
  const bit = 1 << (d - 1), p = PEERS[i];
  for (let k = 0; k < p.length; k++) st.cands[p[k]] &= ~bit;
}

function combinations(arr, k) {
  const out = [], cur = [];
  (function rec(start) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
  })(0);
  return out;
}

function tNakedSingle(st) {
  for (let i = 0; i < N; i++) {
    if (st.v[i]) continue;
    const m = st.cands[i];
    if (m === 0) return null;
    if (popcount(m) === 1) {
      const d = firstDigit(m);
      return { type: 'place', idx: i, value: d, level: 1, tech: 'Naked Single',
        text: cellName(i) + ' can only be ' + d + ' â€” every other digit already appears in its row, column or box.' };
    }
  }
  return null;
}

function tHiddenSingle(st) {
  for (let u = 0; u < 27; u++) {
    const cells = UNITS[u];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let found = -1, cnt = 0, placed = false;
      for (let k = 0; k < 9; k++) {
        const i = cells[k];
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) { cnt++; found = i; }
      }
      if (placed || cnt !== 1) continue;
      return { type: 'place', idx: found, value: d, level: 2, tech: 'Hidden Single',
        text: cellName(found) + ' is the only spot left for ' + d + ' in ' + unitName(u) + '.' };
    }
  }
  return null;
}

function tLocked(st) {
  // Pointing: inside a box a digit is confined to one row/column.
  for (let b = 0; b < 9; b++) {
    const cells = BOX_U[b];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let placed = false; const list = []; let rowSet = -1, colSet = -1, sameRow = true, sameCol = true;
      for (let k = 0; k < 9; k++) {
        const i = cells[k];
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) {
          list.push(i);
          if (rowSet < 0) rowSet = ROW_OF[i]; else if (rowSet !== ROW_OF[i]) sameRow = false;
          if (colSet < 0) colSet = COL_OF[i]; else if (colSet !== COL_OF[i]) sameCol = false;
        }
      }
      if (placed || list.length < 2) continue;
      if (sameRow) {
        const elim = [];
        for (const i of ROW_U[rowSet]) if (BOX_OF[i] !== b && !st.v[i] && (st.cands[i] & bit)) elim.push(i);
        if (elim.length) return { type: 'elim', cells: elim, mask: bit, level: 3, tech: 'Pointing Pair',
          text: 'In box ' + (b + 1) + ', ' + d + ' is locked to row ' + (rowSet + 1) + ' â€” clear it from the rest of that row.' };
      }
      if (sameCol) {
        const elim = [];
        for (const i of COL_U[colSet]) if (BOX_OF[i] !== b && !st.v[i] && (st.cands[i] & bit)) elim.push(i);
        if (elim.length) return { type: 'elim', cells: elim, mask: bit, level: 3, tech: 'Pointing Pair',
          text: 'In box ' + (b + 1) + ', ' + d + ' is locked to column ' + (colSet + 1) + ' â€” clear it from the rest of that column.' };
      }
    }
  }
  // Claiming: inside a row/column a digit is confined to one box.
  for (let u = 0; u < 18; u++) {
    const cells = UNITS[u];
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let placed = false; const list = []; let boxSet = -1, sameBox = true;
      for (let k = 0; k < 9; k++) {
        const i = cells[k];
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) {
          list.push(i);
          if (boxSet < 0) boxSet = BOX_OF[i]; else if (boxSet !== BOX_OF[i]) sameBox = false;
        }
      }
      if (placed || list.length < 2 || !sameBox) continue;
      const elim = [];
      for (const i of BOX_U[boxSet]) if (cells.indexOf(i) < 0 && !st.v[i] && (st.cands[i] & bit)) elim.push(i);
      if (elim.length) return { type: 'elim', cells: elim, mask: bit, level: 3, tech: 'Claiming',
        text: d + ' in ' + unitName(u) + ' must sit inside box ' + (boxSet + 1) + ' â€” clear it from the rest of that box.' };
    }
  }
  return null;
}

function tNakedSet(st, size) {
  for (let u = 0; u < 27; u++) {
    const unit = UNITS[u];
    const cells = [];
    for (const i of unit) {
      if (st.v[i]) continue;
      const p = popcount(st.cands[i]);
      if (p >= 2 && p <= size) cells.push(i);
    }
    if (cells.length < size) continue;
    const combos = combinations(cells, size);
    for (const combo of combos) {
      let m = 0;
      for (const i of combo) m |= st.cands[i];
      if (popcount(m) !== size) continue;
      const elim = [];
      for (const i of unit) if (!st.v[i] && combo.indexOf(i) < 0 && (st.cands[i] & m)) elim.push(i);
      if (elim.length) return { type: 'elim', cells: elim, mask: m, level: 4,
        tech: size === 2 ? 'Naked Pair' : 'Naked Triple',
        text: combo.map(cellName).join(' & ') + ' hold only {' + maskDigits(m).join(',') + '} â€” clear those digits from the rest of ' + unitName(u) + '.' };
    }
  }
  return null;
}

function tHiddenPair(st) {
  for (let u = 0; u < 27; u++) {
    const unit = UNITS[u];
    const pos = {};
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let placed = false; const arr = [];
      for (const i of unit) {
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) arr.push(i);
      }
      if (!placed && arr.length === 2) pos[d] = arr;
    }
    const ds = Object.keys(pos).map(Number);
    for (let a = 0; a < ds.length; a++) {
      for (let b = a + 1; b < ds.length; b++) {
        const A = pos[ds[a]], B = pos[ds[b]];
        if (A[0] !== B[0] || A[1] !== B[1]) continue;
        const m = (1 << (ds[a] - 1)) | (1 << (ds[b] - 1));
        const elim = [];
        for (const i of A) if (st.cands[i] & ~m & ALL) elim.push(i);
        if (elim.length) return { type: 'elimKeep', cells: elim, mask: m, level: 4, tech: 'Hidden Pair',
          text: '{' + ds[a] + ',' + ds[b] + '} fit only in ' + A.map(cellName).join(' & ') + ' within ' + unitName(u) + ' â€” those two cells hold nothing else.' };
      }
    }
  }
  return null;
}

function tXWing(st) {
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    const rowPos = [];
    for (let r = 0; r < 9; r++) {
      const arr = []; let placed = false;
      for (const i of ROW_U[r]) {
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) arr.push(COL_OF[i]);
      }
      rowPos.push(placed ? null : arr);
    }
    for (let r1 = 0; r1 < 9; r1++) {
      const a = rowPos[r1]; if (!a || a.length !== 2) continue;
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        const b = rowPos[r2]; if (!b || b.length !== 2) continue;
        if (a[0] !== b[0] || a[1] !== b[1]) continue;
        const elim = [];
        for (const c of a) for (let r = 0; r < 9; r++) {
          if (r === r1 || r === r2) continue;
          const i = r * 9 + c;
          if (!st.v[i] && (st.cands[i] & bit)) elim.push(i);
        }
        if (elim.length) return { type: 'elim', cells: elim, mask: bit, level: 5, tech: 'X-Wing',
          text: 'X-Wing: ' + d + ' sits in rows ' + (r1 + 1) + ' & ' + (r2 + 1) + ' only in columns ' + (a[0] + 1) + ' & ' + (a[1] + 1) + ' â€” clear ' + d + ' elsewhere in those columns.' };
      }
    }
    const colPos = [];
    for (let c = 0; c < 9; c++) {
      const arr = []; let placed = false;
      for (const i of COL_U[c]) {
        if (st.v[i] === d) { placed = true; break; }
        if (!st.v[i] && (st.cands[i] & bit)) arr.push(ROW_OF[i]);
      }
      colPos.push(placed ? null : arr);
    }
    for (let c1 = 0; c1 < 9; c1++) {
      const a = colPos[c1]; if (!a || a.length !== 2) continue;
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        const b = colPos[c2]; if (!b || b.length !== 2) continue;
        if (a[0] !== b[0] || a[1] !== b[1]) continue;
        const elim = [];
        for (const r of a) for (let c = 0; c < 9; c++) {
          if (c === c1 || c === c2) continue;
          const i = r * 9 + c;
          if (!st.v[i] && (st.cands[i] & bit)) elim.push(i);
        }
        if (elim.length) return { type: 'elim', cells: elim, mask: bit, level: 5, tech: 'X-Wing',
          text: 'X-Wing: ' + d + ' sits in columns ' + (c1 + 1) + ' & ' + (c2 + 1) + ' only in rows ' + (a[0] + 1) + ' & ' + (a[1] + 1) + '.' };
      }
    }
  }
  return null;
}

function logicStep(st) {
  return tNakedSingle(st) || tHiddenSingle(st) || tLocked(st) ||
         tNakedSet(st, 2) || tHiddenPair(st) || tNakedSet(st, 3) || tXWing(st);
}
function applyStep(st, s) {
  if (s.type === 'place') { lsPlace(st, s.idx, s.value); return; }
  if (s.type === 'elim') { for (const i of s.cells) st.cands[i] &= ~s.mask; return; }
  if (s.type === 'elimKeep') { for (const i of s.cells) st.cands[i] &= s.mask; }
}
/** Hardest technique a pure-logic solve needs: 1..5, or 6 when it stalls. */
function analyze(puzzle) {
  const st = lsNew(puzzle);
  let level = 0, guard = 0;
  for (;;) {
    let done = true;
    for (let i = 0; i < N; i++) if (!st.v[i]) { done = false; break; }
    if (done) return { solved: true, level: Math.max(level, 1) };
    const s = logicStep(st);
    if (!s || guard++ > 500) return { solved: false, level: 6 };
    level = Math.max(level, s.level);
    applyStep(st, s);
  }
}

/* ============================== difficulty =============================== */

const DIFFS = {
  easy:   { key: 'easy',   name: 'Easy',   minClues: 40, maxClues: 50, minLevel: 1, maxLevel: 2, hints: 5, base: 700,  par: 330 },
  medium: { key: 'medium', name: 'Medium', minClues: 32, maxClues: 40, minLevel: 2, maxLevel: 3, hints: 4, base: 1200, par: 660 },
  hard:   { key: 'hard',   name: 'Hard',   minClues: 26, maxClues: 32, minLevel: 3, maxLevel: 5, hints: 3, base: 1900, par: 1020 },
  expert: { key: 'expert', name: 'Expert', minClues: 22, maxClues: 28, minLevel: 4, maxLevel: 6, hints: 2, base: 2900, par: 1500 },
};
const DIFF_ORDER = ['easy', 'medium', 'hard', 'expert'];
const LEVEL_NAME = ['', 'Naked Singles', 'Hidden Singles', 'Locked Candidates', 'Naked / Hidden Sets', 'X-Wing', 'Trial chains'];

function countClues(g) { let c = 0; for (let i = 0; i < N; i++) if (g[i]) c++; return c; }

function digPuzzle(full, spec, rng) {
  const puz = Int8Array.from(full);
  let clues = N;
  const order = shuffle(range81(), rng);
  for (const i of order) {
    if (clues <= spec.minClues) break;
    if (!puz[i]) continue;
    const j = 80 - i;
    const pair = j !== i && puz[j] !== 0 && clues - 2 >= spec.minClues;
    const si = puz[i], sj = puz[j];
    puz[i] = 0; if (pair) puz[j] = 0;
    if (solveGrid(puz, 2, null, null) === 1) clues -= pair ? 2 : 1;
    else { puz[i] = si; if (pair) puz[j] = sj; }
  }
  return puz;
}

function specCost(clues, level, spec) {
  let c = 0;
  if (level < spec.minLevel) c += (spec.minLevel - level) * 12;
  if (level > spec.maxLevel) c += (level - spec.maxLevel) * 12;
  if (clues < spec.minClues) c += spec.minClues - clues;
  if (clues > spec.maxClues) c += clues - spec.maxClues;
  return c;
}

/**
 * Builds a puzzle with EXACTLY one solution, rated into the requested band.
 * Digs symmetrically, then adds clues back if the result overshoots the band.
 */
function generatePuzzle(diffKey, rng) {
  const spec = DIFFS[diffKey] || DIFFS.medium;
  const deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 2400;
  let best = null, bestCost = Infinity;

  for (let attempt = 0; attempt < 24; attempt++) {
    const full = generateFull(rng);
    const puz = digPuzzle(full, spec, rng);
    let res = analyze(puz);
    let clues = countClues(puz);

    let guard = 0;
    while (res.level > spec.maxLevel && clues < spec.maxClues && guard++ < 40) {
      const empties = [];
      for (let i = 0; i < N; i++) if (!puz[i]) empties.push(i);
      if (!empties.length) break;
      const pick = empties[(rng() * empties.length) | 0];
      puz[pick] = full[pick];
      clues++;
      res = analyze(puz);
    }

    const cost = specCost(clues, res.level, spec);
    if (cost < bestCost) {
      bestCost = cost;
      best = { puzzle: Int8Array.from(puz), solution: Int8Array.from(full), level: res.level, clues };
    }
    if (cost === 0) break;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now > deadline) break;
  }
  return best;
}

/* ================================ audio ================================== */

const SFX = {
  ctx: null, gain: null, enabled: true, volume: 0.7,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = v; },
  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.2), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.gain);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  click() { this.tone(520, 0.05, 'triangle', 0.10); },
  move() { this.tone(340, 0.04, 'sine', 0.07); },
  place() { this.tone(660, 0.10, 'triangle', 0.16, 880); },
  note() { this.tone(880, 0.045, 'square', 0.055); },
  erase() { this.tone(300, 0.08, 'sine', 0.10, 200); },
  error() { this.tone(180, 0.28, 'sawtooth', 0.16, 90); this.tone(120, 0.30, 'square', 0.07); },
  unit() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.13, null, i * 0.055)); },
  hint() { [988, 1319, 1568].forEach((f, i) => this.tone(f, 0.13, 'sine', 0.12, null, i * 0.05)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.42, 'triangle', 0.16, null, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.32, 'sawtooth', 0.12, null, i * 0.13)); },
};

/* ============================== settings ================================= */

const SETTINGS_KEY = 'sudoku-master.settings';
const settings = {
  strict: true, highlight: true, sameDigit: true, autoClean: true, reduceFx: false, sound: true, volume: 0.7,
};
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
  SFX.enabled = settings.sound;
  SFX.setVolume(settings.volume);
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
const prefersReduced = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
function reduceFx() { return settings.reduceFx || prefersReduced; }

/* =============================== stats =================================== */

function defaultStats() {
  return {
    v: 1,
    solved: { easy: 0, medium: 0, hard: 0, expert: 0 },
    best: { easy: 0, medium: 0, hard: 0, expert: 0 },
    streak: 0, bestStreak: 0, played: 0, losses: 0,
    mistakes: 0, hints: 0, checks: 0, notes: 0, seconds: 0, score: 0,
    dailyStreak: 0, dailyBestStreak: 0, dailyCount: 0, lastDaily: '', dailyDone: {},
  };
}
let stats = defaultStats();

function dateKey(d) {
  d = d || new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d);
}
function dailyDifficulty(key) {
  const dow = new Date(key + 'T12:00:00').getDay();
  return ['medium', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert'][dow] || 'medium';
}

/* ============================== game state =============================== */

const G = {
  mode: 'menu',          // menu | play | pause | result
  active: false,         // a puzzle exists
  diff: 'medium',
  daily: false,
  seed: 0,
  seedLabel: '',
  level: 1,
  clues: 0,
  given: new Uint8Array(N),
  solution: new Int8Array(N),
  values: new Int8Array(N),
  notes: new Uint16Array(N),
  wrong: new Uint8Array(N),
  counts: new Uint8Array(10),
  sel: -1,
  activeDigit: 0,
  notesMode: false,
  mistakes: 0,
  hintsLeft: 0,
  hintsUsed: 0,
  checksUsed: 0,
  elapsed: 0,
  penalty: 0,
  undo: [],
  redo: [],
  won: false,
  lost: false,
  finalScore: 0,
};
const MAX_MISTAKES = 3;

/* ============================ canvas & effects =========================== */

const cv = $('board');
const ctx = cv.getContext('2d', { alpha: false });
let dpr = 1, boardPx = 480, boardPad = 10, cell = 50;
let dirty = true;
let shake = 0;
let hintGlow = 0, hintIdx = -1;
const popT = new Float32Array(N);
const flashes = [];
const PART = [];
for (let i = 0; i < 260; i++) PART.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', sz: 2 });

function burst(x, y, n, color, power) {
  if (reduceFx()) return;
  let made = 0;
  for (let i = 0; i < PART.length && made < n; i++) {
    const p = PART[i];
    if (p.a) continue;
    const ang = Math.random() * Math.PI * 2;
    const sp = (0.4 + Math.random()) * (power || 90);
    p.a = true; p.x = x; p.y = y;
    p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 30;
    p.max = 0.55 + Math.random() * 0.7; p.life = p.max;
    p.c = color; p.sz = 1.6 + Math.random() * 2.8;
    made++;
  }
}
function addFlash(cells, color, dur) {
  if (reduceFx()) { return; }
  flashes.push({ cells: cells.slice(), t: 0, dur: dur || 0.65, color: color });
}
function doShake(mag) { if (!reduceFx()) shake = Math.max(shake, mag); }

function layout() {
  const wrap = $('boardWrap');
  const r = wrap.getBoundingClientRect();
  const size = Math.max(220, Math.floor(Math.min(r.width, r.height)) - 2);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  cv.style.width = size + 'px';
  cv.style.height = size + 'px';
  boardPx = size;
  boardPad = Math.max(5, Math.round(size * 0.018));
  cell = (size - boardPad * 2) / 9;
  dirty = true;
}

/* ================================ render ================================= */

const C_BG_TOP = '#141c34', C_BG_BOT = '#0b1020';
const C_CELL_A = '#151d36', C_CELL_B = '#111830';
const C_GIVEN = '#e6eeff', C_USER = '#6fe3ff', C_WRONG = '#ff6b7f', C_NOTE = '#7f92bd', C_NOTE_HL = '#ffd27f';

function render() {
  const S = boardPx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, C_BG_TOP); bg.addColorStop(1, C_BG_BOT);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

  ctx.save();
  if (shake > 0.02) ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);

  const P = boardPad, C = cell;
  const hidden = G.mode === 'pause';
  const has = G.active;
  const selR = G.sel >= 0 ? ROW_OF[G.sel] : -1;
  const selC = G.sel >= 0 ? COL_OF[G.sel] : -1;
  const selB = G.sel >= 0 ? BOX_OF[G.sel] : -1;
  const hl = has && !hidden ? (G.activeDigit || (G.sel >= 0 ? G.values[G.sel] : 0)) : 0;

  // cells
  for (let i = 0; i < N; i++) {
    const r = ROW_OF[i], c = COL_OF[i], b = BOX_OF[i];
    const x = P + c * C, y = P + r * C;
    ctx.fillStyle = (((b % 3) + ((b / 3) | 0)) % 2 === 0) ? C_CELL_A : C_CELL_B;
    ctx.fillRect(x, y, C, C);

    if (!has || hidden) continue;

    if (settings.highlight && G.sel >= 0 && (r === selR || c === selC || b === selB)) {
      ctx.fillStyle = 'rgba(96,150,240,0.11)';
      ctx.fillRect(x, y, C, C);
    }
    if (settings.sameDigit && hl && G.values[i] === hl) {
      ctx.fillStyle = 'rgba(177,132,255,0.22)';
      ctx.fillRect(x, y, C, C);
    }
    if (G.wrong[i]) {
      const pulse = 0.16 + 0.12 * Math.abs(Math.sin(perfNow / 260));
      ctx.fillStyle = 'rgba(255,80,110,' + pulse.toFixed(3) + ')';
      ctx.fillRect(x, y, C, C);
    }
    if (i === G.sel) {
      ctx.fillStyle = 'rgba(111,227,255,0.17)';
      ctx.fillRect(x, y, C, C);
    }
  }

  // flashes
  for (const f of flashes) {
    const a = Math.max(0, 1 - f.t / f.dur);
    ctx.fillStyle = f.color.replace('%A%', (a * 0.55).toFixed(3));
    for (const i of f.cells) ctx.fillRect(P + COL_OF[i] * C, P + ROW_OF[i] * C, C, C);
  }

  // hint glow
  if (hintGlow > 0 && hintIdx >= 0 && !hidden) {
    const a = Math.min(1, hintGlow);
    ctx.strokeStyle = 'rgba(255,210,127,' + (a * 0.9).toFixed(3) + ')';
    ctx.lineWidth = Math.max(2, C * 0.07);
    ctx.strokeRect(P + COL_OF[hintIdx] * C + 2, P + ROW_OF[hintIdx] * C + 2, C - 4, C - 4);
  }

  // grid lines
  ctx.lineCap = 'butt';
  for (let k = 0; k <= 9; k++) {
    const thick = k % 3 === 0;
    ctx.strokeStyle = thick ? '#5b6ea8' : '#28324f';
    ctx.lineWidth = thick ? Math.max(2, C * 0.045) : Math.max(1, C * 0.018);
    const off = P + k * C;
    ctx.beginPath(); ctx.moveTo(off, P); ctx.lineTo(off, P + 9 * C); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P, off); ctx.lineTo(P + 9 * C, off); ctx.stroke();
  }

  // contents
  if (has && !hidden) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bigFont = Math.round(C * 0.60);
    const noteFont = Math.round(C * 0.215);
    for (let i = 0; i < N; i++) {
      const x = P + COL_OF[i] * C, y = P + ROW_OF[i] * C;
      const v = G.values[i];
      if (v) {
        const isGiven = G.given[i] === 1;
        let col = isGiven ? C_GIVEN : C_USER;
        if (G.wrong[i]) col = C_WRONG;
        const pop = popT[i] > 0 ? 1 + 0.35 * easeOutBack(1 - popT[i] / 0.32) * (popT[i] / 0.32) : 1;
        ctx.save();
        ctx.translate(x + C / 2, y + C / 2);
        if (pop !== 1) ctx.scale(pop, pop);
        ctx.font = (isGiven ? '600 ' : '500 ') + bigFont + 'px "Segoe UI", system-ui, sans-serif';
        if (!isGiven && !G.wrong[i]) { ctx.shadowColor = 'rgba(111,227,255,0.55)'; ctx.shadowBlur = C * 0.16; }
        ctx.fillStyle = col;
        ctx.fillText(String(v), 0, bigFont * 0.04);
        ctx.restore();
      } else if (G.notes[i]) {
        ctx.font = noteFont + 'px "Segoe UI", system-ui, sans-serif';
        const m = G.notes[i];
        for (let d = 1; d <= 9; d++) {
          if (!(m & (1 << (d - 1)))) continue;
          const nc = (d - 1) % 3, nr = ((d - 1) / 3) | 0;
          ctx.fillStyle = (hl === d) ? C_NOTE_HL : C_NOTE;
          ctx.fillText(String(d), x + C * (0.215 + nc * 0.285), y + C * (0.235 + nr * 0.28));
        }
      }
    }
    // selection ring on top
    if (G.sel >= 0) {
      ctx.strokeStyle = '#6fe3ff';
      ctx.lineWidth = Math.max(2, C * 0.055);
      ctx.strokeRect(P + COL_OF[G.sel] * C + 1.5, P + ROW_OF[G.sel] * C + 1.5, C - 3, C - 3);
    }
  }

  if (hidden) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,11,22,0.82)';
    ctx.fillRect(P, P, C * 9, C * 9);
    ctx.fillStyle = '#6fe3ff';
    ctx.font = '600 ' + Math.round(S * 0.062) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', S / 2, S / 2);
  } else if (!has) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(140,170,230,0.35)';
    ctx.font = '600 ' + Math.round(S * 0.045) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SUDOKU MASTER', S / 2, S / 2);
  }

  ctx.restore();

  // particles (unshaken)
  for (const p of PART) {
    if (!p.a) continue;
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ================================ loop =================================== */

const STEP = 1 / 60;
let acc = 0, lastT = 0, rafId = 0, perfNow = 0;
let playtimeAcc = 0, saveAcc = 0, saveDirty = false;

function fxActive() {
  if (shake > 0.02 || hintGlow > 0 || flashes.length) return true;
  for (let i = 0; i < PART.length; i++) if (PART[i].a) return true;
  for (let i = 0; i < N; i++) if (popT[i] > 0) return true;
  return false;
}

function update(dt) {
  perfNow += dt * 1000;

  if (G.mode === 'play' && G.active) {
    G.elapsed += dt;
    if (Math.floor(G.elapsed) !== Math.floor(G.elapsed - dt)) syncTimer();
    saveAcc += dt;
    if (saveAcc >= 6 && saveDirty) { saveAcc = 0; persist(); }
  }

  playtimeAcc += dt;
  if (playtimeAcc >= 30) { const s = Math.floor(playtimeAcc); playtimeAcc -= s; reportPlaytime(s); }

  if (shake > 0) { shake -= dt * 26; if (shake < 0) shake = 0; }
  if (hintGlow > 0) hintGlow -= dt * 0.6;

  for (let i = 0; i < N; i++) if (popT[i] > 0) { popT[i] -= dt; if (popT[i] < 0) popT[i] = 0; }

  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].t += dt;
    if (flashes[i].t >= flashes[i].dur) flashes.splice(i, 1);
  }
  for (const p of PART) {
    if (!p.a) continue;
    p.life -= dt;
    if (p.life <= 0) { p.a = false; continue; }
    p.vy += 260 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!lastT) lastT = now;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) { update(STEP); acc -= STEP; }
  if (dirty || fxActive() || G.mode === 'play') { render(); dirty = false; }
}
function startLoop() { if (!rafId) { lastT = 0; rafId = requestAnimationFrame(frame); } }
function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

/* ============================== empire SDK =============================== */

let empire = null;
let hubProfile = null;

function reportPlaytime(sec) {
  stats.seconds += sec;
  if (!empire) return;
  try { Promise.resolve(empire.reportPlaytime(sec)).catch(() => {}); } catch (e) { /* ignore */ }
}
// Latch: an id never fires again once it has been reported at full progress,
// and progressive ids only re-report when their progress actually advances.
const achSent = Object.create(null);
function ach(id, progress) {
  if (!empire) return;
  const p = clamp(progress === undefined ? 1 : progress, 0, 1);
  const prev = achSent[id];
  if (prev !== undefined && (prev >= 1 || p <= prev)) return;
  achSent[id] = p;
  try { Promise.resolve(empire.unlockAchievement(id, p)).catch(() => {}); }
  catch (e) { /* ignore */ }
}

function enc81(arr) {
  let s = '';
  for (let i = 0; i < N; i++) s += String(arr[i] || 0);
  return s;
}
function dec81(str, out) {
  for (let i = 0; i < N; i++) out[i] = str.charCodeAt(i) - 48;
  return out;
}

function serialize() {
  const blob = { stats: stats, current: null };
  if (G.active && !G.won && !G.lost) {
    const givens = new Int8Array(N);
    for (let i = 0; i < N; i++) givens[i] = G.given[i] ? G.solution[i] : 0;
    blob.current = {
      diff: G.diff, daily: G.daily, seed: G.seed, seedLabel: G.seedLabel, level: G.level, clues: G.clues,
      givens: enc81(givens), solution: enc81(G.solution), values: enc81(G.values),
      notes: Array.from(G.notes),
      mistakes: G.mistakes, hintsLeft: G.hintsLeft, hintsUsed: G.hintsUsed, checksUsed: G.checksUsed,
      elapsed: Math.round(G.elapsed), penalty: G.penalty, notesMode: G.notesMode, sel: G.sel,
    };
  }
  return blob;
}

function persist() {
  saveDirty = false;
  if (!empire) return;
  const blob = serialize();
  const meta = {
    label: G.active ? (DIFFS[G.diff].name + (G.daily ? ' Daily' : '') + ' Â· ' + fmtTime(G.elapsed + G.penalty)) : 'Sudoku Master',
    playtimeSec: Math.round(stats.seconds),
    progress: G.active ? clamp(filledCount() / N, 0, 1) : 0,
    mode: G.daily ? 'daily' : 'classic',
    difficulty: G.diff,
    seed: G.seed,
  };
  try {
    Promise.resolve(empire.saveState('auto', blob, meta)).catch(() => {});
    if (blob.current) Promise.resolve(empire.setContinuePoint('auto', meta.label)).catch(() => {});
  } catch (e) { /* ignore */ }
}

let savedCurrent = null;
async function loadSave() {
  if (!empire) return;
  let rec = null;
  try { rec = await empire.loadState('auto'); } catch (e) { rec = null; }
  if (!rec || !rec.blob) return;
  const b = rec.blob;
  if (b.stats && typeof b.stats === 'object') {
    stats = Object.assign(defaultStats(), b.stats);
    stats.solved = Object.assign({ easy: 0, medium: 0, hard: 0, expert: 0 }, b.stats.solved || {});
    stats.best = Object.assign({ easy: 0, medium: 0, hard: 0, expert: 0 }, b.stats.best || {});
    stats.dailyDone = b.stats.dailyDone || {};
  }
  if (b.current && typeof b.current.values === 'string' && b.current.values.length === N) savedCurrent = b.current;
}

function restoreCurrent(cur) {
  const givens = new Int8Array(N);
  dec81(cur.givens, givens);
  dec81(cur.solution, G.solution);
  dec81(cur.values, G.values);
  for (let i = 0; i < N; i++) G.given[i] = givens[i] ? 1 : 0;
  G.notes.set(Uint16Array.from(cur.notes && cur.notes.length === N ? cur.notes : new Array(N).fill(0)));
  G.wrong.fill(0);
  G.diff = DIFFS[cur.diff] ? cur.diff : 'medium';
  G.daily = !!cur.daily;
  G.seed = cur.seed || 0;
  G.seedLabel = cur.seedLabel || '';
  G.level = cur.level || 1;
  G.clues = cur.clues || countClues(givens);
  G.mistakes = cur.mistakes || 0;
  G.hintsLeft = cur.hintsLeft === undefined ? DIFFS[G.diff].hints : cur.hintsLeft;
  G.hintsUsed = cur.hintsUsed || 0;
  G.checksUsed = cur.checksUsed || 0;
  G.elapsed = cur.elapsed || 0;
  G.penalty = cur.penalty || 0;
  G.notesMode = !!cur.notesMode;
  G.sel = typeof cur.sel === 'number' ? cur.sel : -1;
  G.activeDigit = 0;
  G.undo.length = 0; G.redo.length = 0;
  G.won = false; G.lost = false; G.active = true;
  if (settings.strict) markWrongFromStrict();
  recount();
}
function markWrongFromStrict() {
  for (let i = 0; i < N; i++) G.wrong[i] = (!G.given[i] && G.values[i] && G.values[i] !== G.solution[i]) ? 1 : 0;
}

/* ============================== game flow ================================ */

function filledCount() { let c = 0; for (let i = 0; i < N; i++) if (G.values[i]) c++; return c; }
function recount() {
  G.counts.fill(0);
  for (let i = 0; i < N; i++) if (G.values[i]) G.counts[G.values[i]]++;
  syncPad();
  syncHud();
}
function isFull() { for (let i = 0; i < N; i++) if (!G.values[i]) return false; return true; }
function isSolved() { for (let i = 0; i < N; i++) if (G.values[i] !== G.solution[i]) return false; return true; }

function newGame(diffKey, daily, seed) {
  const spec = DIFFS[diffKey] || DIFFS.medium;
  $('genText').textContent = daily
    ? 'Seeding today\'s puzzle â€” one solution, no guessingâ€¦'
    : 'Carving a ' + spec.name + ' grid with exactly one solutionâ€¦';
  show('genOverlay');
  hide('mainMenu'); hide('diffMenu'); hide('resultMenu'); hide('pauseMenu');
  // let the browser paint the overlay before the synchronous generation burst
  setTimeout(() => {
    const useSeed = (seed === undefined || seed === null) ? ((Math.random() * 0xFFFFFFFF) >>> 0) : seed;
    const rng = mulberry32(useSeed >>> 0);
    let built = null;
    try { built = generatePuzzle(diffKey, rng); } catch (e) { built = null; }
    if (!built) { built = generatePuzzle('easy', mulberry32(12345)); }
    hide('genOverlay');
    if (!built) { toast('Could not build a puzzle â€” try again', 'bad'); show('mainMenu'); return; }

    G.solution.set(built.solution);
    G.values.set(built.puzzle);
    for (let i = 0; i < N; i++) G.given[i] = built.puzzle[i] ? 1 : 0;
    G.notes.fill(0); G.wrong.fill(0); popT.fill(0);
    G.diff = diffKey; G.daily = !!daily; G.seed = useSeed >>> 0;
    G.seedLabel = daily ? dateKey() : ('#' + (useSeed >>> 0).toString(36).toUpperCase());
    G.level = built.level; G.clues = built.clues;
    G.mistakes = 0; G.hintsLeft = spec.hints; G.hintsUsed = 0; G.checksUsed = 0;
    G.elapsed = 0; G.penalty = 0;
    G.sel = -1; G.activeDigit = 0; G.notesMode = false;
    G.undo.length = 0; G.redo.length = 0;
    G.won = false; G.lost = false; G.active = true; G.finalScore = 0;
    stats.played++;
    recount();
    setMode('play');
    flashes.length = 0;
    toast(spec.name + (daily ? ' Daily' : '') + ' Â· ' + built.clues + ' clues Â· needs ' + LEVEL_NAME[Math.min(6, built.level)]);
    saveDirty = true; persist();
  }, 40);
}

function restartPuzzle() {
  if (!G.active) return;
  pushUndo();
  for (let i = 0; i < N; i++) if (!G.given[i]) G.values[i] = 0;
  G.notes.fill(0); G.wrong.fill(0);
  G.elapsed = 0; G.penalty = 0; G.mistakes = 0;
  G.hintsLeft = DIFFS[G.diff].hints; G.hintsUsed = 0; G.checksUsed = 0;
  G.won = false; G.lost = false;
  recount();
  setMode('play');
  SFX.erase();
  toast('Puzzle reset â€” same grid, clean slate');
  saveDirty = true; persist();
}

function setMode(m) {
  G.mode = m;
  hide('pauseMenu'); hide('resultMenu');
  if (m === 'play') { hide('mainMenu'); hide('diffMenu'); }
  if (m === 'pause') show('pauseMenu');
  if (m === 'menu') show('mainMenu');
  dirty = true;
  syncHud();
}

function pauseGame() {
  if (G.mode !== 'play' || !G.active) return;
  setMode('pause');
  $('pauseSub').textContent = DIFFS[G.diff].name.toUpperCase() + (G.daily ? ' DAILY' : '') + ' Â· ' + fmtTime(G.elapsed + G.penalty) + ' ELAPSED';
  persist();
  SFX.click();
}
function resumeGame() {
  if (!G.active) return;
  setMode('play');
  SFX.click();
}
function quitToMenu() {
  if (G.active && !G.won && !G.lost) persist();
  setMode('menu');
  syncMenu();
}

/* ------------------------------- input ops -------------------------------- */

function snapshot() {
  return { v: Int8Array.from(G.values), n: Uint16Array.from(G.notes), w: Uint8Array.from(G.wrong) };
}
function pushUndo() {
  G.undo.push(snapshot());
  if (G.undo.length > 250) G.undo.shift();
  G.redo.length = 0;
}
function applySnapshot(s) {
  G.values.set(s.v); G.notes.set(s.n); G.wrong.set(s.w);
  recount(); dirty = true;
}
function doUndo() {
  if (!G.undo.length) { toast('Nothing to undo'); return; }
  G.redo.push(snapshot());
  applySnapshot(G.undo.pop());
  SFX.click(); saveDirty = true;
}
function doRedo() {
  if (!G.redo.length) { toast('Nothing to redo'); return; }
  G.undo.push(snapshot());
  applySnapshot(G.redo.pop());
  SFX.click(); saveDirty = true;
}

function selectCell(i) {
  if (i < 0 || i >= N) return;
  if (G.sel !== i) { G.sel = i; SFX.move(); }
  dirty = true;
  syncPad();
}
function moveSel(dc, dr) {
  if (G.sel < 0) { G.sel = 40; dirty = true; syncPad(); SFX.move(); return; }
  const r = clamp(ROW_OF[G.sel] + dr, 0, 8);
  const c = clamp(COL_OF[G.sel] + dc, 0, 8);
  selectCell(r * 9 + c);
}

function toggleNote(i, d) {
  const bit = 1 << (d - 1);
  pushUndo();
  if (G.notes[i] & bit) { G.notes[i] &= ~bit; SFX.erase(); }
  else {
    G.notes[i] |= bit;
    G.values[i] = 0; G.wrong[i] = 0;
    stats.notes++;
    ach('pencil_pusher', stats.notes / 100);
    SFX.note();
  }
  recount(); dirty = true; saveDirty = true;
}

function clearNotesInPeers(i, d) {
  const bit = 1 << (d - 1);
  const p = PEERS[i];
  for (let k = 0; k < p.length; k++) G.notes[p[k]] &= ~bit;
}

function unitFlash(i) {
  const done = [];
  const check = (cells) => {
    for (const j of cells) if (!G.values[j] || G.values[j] !== G.solution[j]) return false;
    return true;
  };
  if (check(ROW_U[ROW_OF[i]])) done.push(ROW_U[ROW_OF[i]]);
  if (check(COL_U[COL_OF[i]])) done.push(COL_U[COL_OF[i]]);
  if (check(BOX_U[BOX_OF[i]])) done.push(BOX_U[BOX_OF[i]]);
  if (!done.length) return;
  for (const cells of done) {
    addFlash(cells, 'rgba(110,231,168,%A%)', 0.7);
    const c0 = cells[4];
    burst(boardPad + COL_OF[c0] * cell + cell / 2, boardPad + ROW_OF[c0] * cell + cell / 2, 14, '#6ee7a8', 110);
  }
  SFX.unit();
}

function placeDigit(i, d, silent) {
  if (G.given[i]) { toast('That cell is a clue â€” it cannot change'); return; }
  if (G.values[i] === d) { eraseCell(i); return; }
  pushUndo();
  G.values[i] = d;
  G.notes[i] = 0;
  popT[i] = 0.32;
  dirty = true; saveDirty = true;

  if (d !== G.solution[i]) {
    if (settings.strict) {
      G.wrong[i] = 1;
      G.mistakes++;
      stats.mistakes++;
      doShake(7);
      burst(boardPad + COL_OF[i] * cell + cell / 2, boardPad + ROW_OF[i] * cell + cell / 2, 12, '#ff6b7f', 120);
      SFX.error();
      recount();
      if (G.mistakes >= MAX_MISTAKES) { loseGame(); return; }
      toast('That digit breaks the grid â€” ' + (MAX_MISTAKES - G.mistakes) + ' error' + (MAX_MISTAKES - G.mistakes === 1 ? '' : 's') + ' left', 'bad');
      return;
    }
    G.wrong[i] = 0;
    if (!silent) SFX.place();
    recount();
    if (isFull()) toast('Grid is full but something is off â€” hit CHECK', 'bad');
    return;
  }

  G.wrong[i] = 0;
  if (settings.autoClean) clearNotesInPeers(i, d);
  if (!silent) SFX.place();
  recount();
  unitFlash(i);
  if (isSolved()) winGame();
}

function eraseCell(i) {
  if (G.given[i]) { toast('That cell is a clue â€” it cannot change'); return; }
  if (!G.values[i] && !G.notes[i]) return;
  pushUndo();
  G.values[i] = 0; G.notes[i] = 0; G.wrong[i] = 0;
  recount(); dirty = true; saveDirty = true;
  SFX.erase();
}

function inputDigit(d) {
  if (G.mode !== 'play' || !G.active) return;
  if (G.sel < 0) { toast('Pick a cell first â€” click one or use the arrow keys'); return; }
  if (G.notesMode) {
    if (G.given[G.sel]) { toast('That cell is a clue â€” it cannot change'); return; }
    toggleNote(G.sel, d);
    return;
  }
  placeDigit(G.sel, d);
}

function autoNotes() {
  if (G.mode !== 'play' || !G.active) return;
  const st = lsNew(G.values);
  pushUndo();
  let added = 0;
  for (let i = 0; i < N; i++) {
    if (G.values[i]) continue;
    const before = G.notes[i];
    const m = st.cands[i];
    G.notes[i] = m;
    added += popcount(m & ~before);
  }
  stats.notes += added;
  ach('pencil_pusher', stats.notes / 100);
  recount(); dirty = true; saveDirty = true;
  SFX.note();
  toast('Filled ' + added + ' candidate note' + (added === 1 ? '' : 's'));
}

function checkBoard() {
  if (G.mode !== 'play' || !G.active) return;
  let bad = 0;
  for (let i = 0; i < N; i++) {
    if (G.given[i] || !G.values[i]) { G.wrong[i] = 0; continue; }
    if (G.values[i] !== G.solution[i]) { G.wrong[i] = 1; bad++; }
    else G.wrong[i] = 0;
  }
  G.checksUsed++;
  stats.checks++;
  G.penalty += 30;
  if (bad) {
    if (!settings.strict) { G.mistakes += bad; stats.mistakes += bad; }
    doShake(5);
    SFX.error();
    toast(bad + ' wrong ' + (bad === 1 ? 'entry' : 'entries') + ' highlighted Â· +30s penalty', 'bad');
  } else {
    SFX.hint();
    toast('Everything on the board checks out Â· +30s penalty', 'good');
  }
  recount(); dirty = true; saveDirty = true; syncTimer();
}

function findHint() {
  for (let i = 0; i < N; i++) {
    if (!G.given[i] && G.values[i] && G.values[i] !== G.solution[i]) {
      return { idx: i, value: 0, tech: 'Contradiction', text: cellName(i) + ' holds a digit that cannot be right â€” clearing it.' };
    }
  }
  const st = lsNew(G.values);
  const direct = tNakedSingle(st) || tHiddenSingle(st);
  if (direct) return { idx: direct.idx, value: direct.value, tech: direct.tech, text: direct.text };

  const trail = [];
  for (let k = 0; k < 80; k++) {
    const s = logicStep(st);
    if (!s) break;
    if (s.type === 'place') {
      return { idx: s.idx, value: s.value, tech: s.tech,
        text: (trail.length ? trail[0] + ' first, then ' : '') + s.text };
    }
    if (trail.indexOf(s.tech) < 0) trail.push(s.tech);
    applyStep(st, s);
  }
  let best = -1, bc = 99;
  for (let i = 0; i < N; i++) {
    if (G.values[i]) continue;
    const c = popcount(st.cands[i]) || 9;
    if (c < bc) { bc = c; best = i; }
  }
  if (best < 0) return null;
  return { idx: best, value: G.solution[best], tech: 'Reveal',
    text: 'No clean logical step left in reach â€” revealing ' + cellName(best) + '.' };
}

function useHint() {
  if (G.mode !== 'play' || !G.active) return;
  if (G.hintsLeft <= 0) { toast('No hints left on this puzzle', 'bad'); SFX.error(); return; }
  const h = findHint();
  if (!h) { toast('Nothing left to hint â€” the board is full'); return; }
  G.hintsLeft--; G.hintsUsed++; stats.hints++;
  hintIdx = h.idx; hintGlow = 1.6;
  G.sel = h.idx;
  if (h.value === 0) {
    pushUndo();
    G.values[h.idx] = 0; G.wrong[h.idx] = 0;
    recount();
  } else {
    pushUndo();
    G.values[h.idx] = h.value; G.notes[h.idx] = 0; G.wrong[h.idx] = 0;
    popT[h.idx] = 0.32;
    if (settings.autoClean) clearNotesInPeers(h.idx, h.value);
    recount();
    unitFlash(h.idx);
  }
  SFX.hint();
  toast(h.tech + ' â€” ' + h.text);
  dirty = true; saveDirty = true;
  if (isSolved()) winGame();
}

/* ------------------------------ end states -------------------------------- */

function computeScore() {
  const spec = DIFFS[G.diff];
  const total = G.elapsed + G.penalty;
  const timeFactor = clamp(spec.par / Math.max(45, total), 0.35, 2.1);
  const streakBonus = 1 + Math.min(0.5, stats.streak * 0.06);
  let s = spec.base * timeFactor * streakBonus;
  s -= G.mistakes * 90 + G.hintsUsed * 130 + G.checksUsed * 45;
  if (G.daily) s *= 1.15;
  return Math.max(50, Math.round(s));
}

function winGame() {
  if (G.won) return;
  G.won = true;
  G.mode = 'result';
  G.wrong.fill(0);
  const total = G.elapsed + G.penalty;
  const score = computeScore();
  G.finalScore = score;

  stats.solved[G.diff] = (stats.solved[G.diff] || 0) + 1;
  stats.streak++;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.score += score;
  const prevBest = stats.best[G.diff] || 0;
  const isBest = prevBest === 0 || total < prevBest;
  if (isBest) stats.best[G.diff] = Math.round(total);

  if (G.daily) {
    const key = G.seedLabel || dateKey();
    if (!stats.dailyDone[key]) {
      stats.dailyDone[key] = { t: Math.round(total), m: G.mistakes, d: G.diff };
      stats.dailyCount++;
      stats.dailyStreak = (stats.lastDaily === yesterdayKey()) ? stats.dailyStreak + 1 : 1;
      stats.lastDaily = key;
      stats.dailyBestStreak = Math.max(stats.dailyBestStreak, stats.dailyStreak);
      const keys = Object.keys(stats.dailyDone);
      if (keys.length > 60) { keys.sort(); for (let i = 0; i < keys.length - 60; i++) delete stats.dailyDone[keys[i]]; }
    }
    ach('daily_devotion', stats.dailyCount / 7);
  }

  const totalSolved = DIFF_ORDER.reduce((a, k) => a + (stats.solved[k] || 0), 0);
  ach('first_solve', 1);
  ach('centurion', totalSolved / 25);
  ach('hot_streak', stats.streak / 5);
  if (G.diff === 'easy' && total < 180) ach('easy_sprint', 1);
  if (G.diff === 'hard') ach('hard_liner', 1);
  if (G.mistakes === 0 && G.hintsUsed === 0) ach('flawless_mind', 1);
  if (G.diff === 'expert') {
    ach('expert_conqueror', 1);
    if (G.mistakes === 0 && G.hintsUsed === 0) ach('iron_nerve', 1);
  }

  // celebration
  if (!reduceFx()) {
    for (let k = 0; k < 9; k++) {
      const i = k * 9 + ((k * 4) % 9);
      burst(boardPad + COL_OF[i] * cell + cell / 2, boardPad + ROW_OF[i] * cell + cell / 2, 22,
        ['#6fe3ff', '#b184ff', '#ffd27f', '#6ee7a8'][k % 4], 170);
    }
    addFlash(range81(), 'rgba(111,227,255,%A%)', 0.9);
  }
  SFX.win();

  $('resIcon').textContent = isBest ? 'ðŸ¥‡' : 'ðŸ†';
  $('resTitle').textContent = 'PUZZLE SOLVED';
  $('resSub').textContent = DIFFS[G.diff].name.toUpperCase() + (G.daily ? ' DAILY' : '') +
    (isBest ? ' Â· NEW BEST TIME' : ' Â· ' + LEVEL_NAME[Math.min(6, G.level)].toUpperCase());
  $('resTime').textContent = fmtTime(total) + (G.penalty ? ' (incl. +' + G.penalty + 's)' : '');
  $('resMistakes').textContent = String(G.mistakes);
  $('resHints').textContent = G.hintsUsed + ' / ' + DIFFS[G.diff].hints;
  $('resChecks').textContent = String(G.checksUsed);
  $('resScore').textContent = score.toLocaleString();
  $('resStreak').textContent = stats.streak + (stats.streak === stats.bestStreak ? ' (best)' : '');
  $('resBest').textContent = stats.best[G.diff] ? fmtTime(stats.best[G.diff]) : '--:--';
  $('btnNextPuzzle').textContent = 'NEXT ' + DIFFS[G.diff].name.toUpperCase() + ' PUZZLE';
  $('btnRetryPuzzle').textContent = 'REPLAY THIS PUZZLE';
  show('resultMenu');
  syncHud();
  saveDirty = true; persist();
}

function loseGame() {
  if (G.lost) return;
  G.lost = true;
  G.mode = 'result';
  stats.streak = 0;
  stats.losses++;
  doShake(12);
  SFX.lose();
  $('resIcon').textContent = 'ðŸ’¥';
  $('resTitle').textContent = 'OUT OF ERRORS';
  $('resSub').textContent = 'THREE WRONG DIGITS â€” STRICT MODE ENDS THE RUN';
  $('resTime').textContent = fmtTime(G.elapsed + G.penalty);
  $('resMistakes').textContent = MAX_MISTAKES + ' / ' + MAX_MISTAKES;
  $('resHints').textContent = G.hintsUsed + ' / ' + DIFFS[G.diff].hints;
  $('resChecks').textContent = String(G.checksUsed);
  $('resScore').textContent = '0';
  $('resStreak').textContent = '0 (reset)';
  $('resBest').textContent = stats.best[G.diff] ? fmtTime(stats.best[G.diff]) : '--:--';
  $('btnNextPuzzle').textContent = 'NEW ' + DIFFS[G.diff].name.toUpperCase() + ' PUZZLE';
  $('btnRetryPuzzle').textContent = 'RETRY THIS PUZZLE';
  show('resultMenu');
  syncHud();
  saveDirty = true; persist();
}

/* ================================= UI ==================================== */

function show(id) { const e = $(id); if (e) e.classList.remove('hidden'); }
function hide(id) { const e = $(id); if (e) e.classList.add('hidden'); }
function isShown(id) { const e = $(id); return e && !e.classList.contains('hidden'); }

let toastTimer = null;
function toast(msg, kind) {
  const wrap = $('toastWrap');
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = msg;
  wrap.appendChild(d);
  while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3700);
}

function syncTimer() {
  $('hudTimer').textContent = G.active ? fmtTime(G.elapsed + G.penalty) : '00:00';
}

function syncHud() {
  $('hudDiff').textContent = G.active ? (DIFFS[G.diff].name + (G.daily ? ' Â· Daily' : '')) : 'â€”';
  syncTimer();
  const mChip = $('hudMistakeChip');
  $('hudMistakes').textContent = settings.strict ? (G.mistakes + '/' + MAX_MISTAKES) : String(G.mistakes);
  if (settings.strict && G.mistakes > 0) mChip.classList.add('warnState'); else mChip.classList.remove('warnState');
  $('hudHints').textContent = G.active ? String(G.hintsLeft) : '0';
  $('hudStreak').textContent = String(stats.streak);
  $('hudFilled').textContent = (G.active ? filledCount() : 0) + '/81';
  $('btnNotes').innerHTML = 'NOTES: ' + (G.notesMode ? 'ON' : 'OFF') + '<small>N key</small>';
  $('btnNotes').classList.toggle('on', G.notesMode);
  $('btnHint').innerHTML = 'HINT (' + (G.active ? G.hintsLeft : 0) + ')<small>H key</small>';
  $('btnTopPause').textContent = G.mode === 'pause' ? '> RESUME' : '|| PAUSE';
}

function syncPad() {
  for (let d = 1; d <= 9; d++) {
    const b = padBtns[d];
    if (!b) continue;
    const left = 9 - G.counts[d];
    const cnt = b.querySelector('.cnt');
    if (cnt) cnt.textContent = G.active ? (left > 0 ? left + ' left' : 'done') : '';
    b.classList.toggle('done', G.active && left <= 0);
    b.classList.toggle('armed', G.activeDigit === d);
    b.classList.toggle('noteMode', G.notesMode);
  }
}

function syncMenu() {
  const totalSolved = DIFF_ORDER.reduce((a, k) => a + (stats.solved[k] || 0), 0);
  $('menuSolved').textContent = String(totalSolved);
  $('menuStreak').textContent = String(stats.bestStreak);
  $('menuPlayer').textContent = (hubProfile && hubProfile.name) ? hubProfile.name : 'Player One';
  const canContinue = (G.active && !G.won && !G.lost) || !!savedCurrent;
  $('btnContinue').disabled = !canContinue;
  const key = dateKey();
  const dd = dailyDifficulty(key);
  const done = !!stats.dailyDone[key];
  $('dailyTag').textContent = done ? 'DONE' : DIFFS[dd].name.toUpperCase();
  $('dailyStatus').textContent = done
    ? 'Solved in ' + fmtTime(stats.dailyDone[key].t) + ' Â· daily streak ' + stats.dailyStreak + ' Â· replayable'
    : key + ' Â· ' + DIFFS[dd].name + ' Â· daily streak ' + stats.dailyStreak;
  for (const k of DIFF_ORDER) {
    const el = $('best' + k.charAt(0).toUpperCase() + k.slice(1));
    if (el) el.textContent = stats.best[k] ? fmtTime(stats.best[k]) : '--:--';
  }
}

function openStats() {
  const totalSolved = DIFF_ORDER.reduce((a, k) => a + (stats.solved[k] || 0), 0);
  const rows = [];
  rows.push('<h2 class="section">Completion</h2>');
  for (const k of DIFF_ORDER) {
    rows.push('<div class="statline"><span>' + DIFFS[k].name + '</span><span>' +
      (stats.solved[k] || 0) + ' solved Â· best ' + (stats.best[k] ? fmtTime(stats.best[k]) : '--:--') + '</span></div>');
  }
  rows.push('<div class="statline"><span>Total solved</span><span>' + totalSolved + '</span></div>');
  rows.push('<div class="statline"><span>Puzzles started</span><span>' + stats.played + '</span></div>');
  rows.push('<div class="statline"><span>Runs lost (strict)</span><span>' + stats.losses + '</span></div>');
  rows.push('<h2 class="section">Streaks</h2>');
  rows.push('<div class="statline"><span>Current win streak</span><span>' + stats.streak + '</span></div>');
  rows.push('<div class="statline"><span>Best win streak</span><span>' + stats.bestStreak + '</span></div>');
  rows.push('<div class="statline"><span>Daily puzzles solved</span><span>' + stats.dailyCount + '</span></div>');
  rows.push('<div class="statline"><span>Daily streak</span><span>' + stats.dailyStreak + ' (best ' + stats.dailyBestStreak + ')</span></div>');
  rows.push('<h2 class="section">Habits</h2>');
  rows.push('<div class="statline"><span>Lifetime score</span><span>' + stats.score.toLocaleString() + '</span></div>');
  rows.push('<div class="statline"><span>Mistakes made</span><span>' + stats.mistakes + '</span></div>');
  rows.push('<div class="statline"><span>Hints used</span><span>' + stats.hints + '</span></div>');
  rows.push('<div class="statline"><span>Checks used</span><span>' + stats.checks + '</span></div>');
  rows.push('<div class="statline"><span>Pencil notes placed</span><span>' + stats.notes + '</span></div>');
  rows.push('<div class="statline"><span>Time at the table</span><span>' + fmtTime(stats.seconds) + '</span></div>');
  $('statsBody').innerHTML = rows.join('');
  show('statsMenu');
}

/** Panels opened over the menu/pause screens must always hand control back. */
function closeStats() {
  hide('statsMenu');
  if (G.mode === 'pause') show('pauseMenu');
  else if (G.mode !== 'play') show('mainMenu');
}
function closeHowTo() {
  hide('howToMenu');
  if (G.mode === 'pause') show('pauseMenu');
  else if (G.mode !== 'play') show('mainMenu');
}

function syncSettingsUI() {
  $('setStrict').checked = settings.strict;
  $('setHighlight').checked = settings.highlight;
  $('setSameDigit').checked = settings.sameDigit;
  $('setAutoClean').checked = settings.autoClean;
  $('setReduceFx').checked = settings.reduceFx;
  $('setSound').checked = settings.sound;
  $('setVolume').value = String(settings.volume);
  $('volVal').textContent = Math.round(settings.volume * 100) + '%';
}

/* ============================== wiring =================================== */

const padBtns = {};
function buildPad() {
  const pad = $('numPad');
  pad.innerHTML = '';
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = 'numbtn';
    b.type = 'button';
    b.dataset.num = String(d);
    b.innerHTML = d + '<span class="cnt"></span>';
    b.addEventListener('click', () => onPad(d));
    pad.appendChild(b);
    padBtns[d] = b;
  }
}

function onPad(d) {
  SFX.resume();
  if (G.mode !== 'play' || !G.active) { toast('Start a puzzle first'); return; }
  if (G.sel >= 0 && G.activeDigit === 0) { inputDigit(d); syncPad(); return; }
  G.activeDigit = (G.activeDigit === d) ? 0 : d;
  if (G.activeDigit === 0) toast('Stamp mode off');
  else toast('Stamp mode: ' + d + ' â€” click cells to place it, tap ' + d + ' again to stop');
  SFX.click();
  dirty = true;
  syncPad();
}

function onBoardPointer(e) {
  SFX.resume();
  if (G.mode !== 'play' || !G.active) return;
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (boardPx / r.width);
  const py = (e.clientY - r.top) * (boardPx / r.height);
  const c = Math.floor((px - boardPad) / cell);
  const rr = Math.floor((py - boardPad) / cell);
  if (c < 0 || c > 8 || rr < 0 || rr > 8) return;
  const i = rr * 9 + c;
  const prevSel = G.sel;
  selectCell(i);
  if (G.activeDigit > 0 && !G.given[i]) {
    if (G.notesMode) toggleNote(i, G.activeDigit);
    else placeDigit(i, G.activeDigit);
  } else if (prevSel === i) {
    dirty = true;
  }
}

function onKey(e) {
  const k = e.key;
  const code = e.code;
  SFX.resume();

  // modal escape handling first
  if (k === 'Escape') {
    e.preventDefault();
    if (isShown('genOverlay')) return;
    if (isShown('settingsMenu')) { closeSettings(); return; }
    if (isShown('howToMenu')) { closeHowTo(); return; }
    if (isShown('statsMenu')) { closeStats(); return; }
    if (isShown('diffMenu')) { hide('diffMenu'); show('mainMenu'); return; }
    if (G.mode === 'play') { pauseGame(); return; }
    if (G.mode === 'pause') { resumeGame(); return; }
    return;
  }
  if (isShown('genOverlay')) return;
  if (isShown('settingsMenu') || isShown('howToMenu') || isShown('statsMenu')) return;

  if (G.mode === 'menu' || G.mode === 'result') {
    if (k === 'Enter') {
      e.preventDefault();
      if (G.mode === 'result') $('btnNextPuzzle').click();
      else if (!$('btnContinue').disabled) $('btnContinue').click();
      else $('btnNewGame').click();
    }
    return;
  }
  if (k === 'p' || k === 'P') {
    e.preventDefault();
    if (G.mode === 'play') pauseGame(); else if (G.mode === 'pause') resumeGame();
    return;
  }
  if (G.mode !== 'play') return;

  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); moveSel(-1, 0); return; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); moveSel(1, 0); return; }
  if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); moveSel(0, -1); return; }
  if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); moveSel(0, 1); return; }

  if (k >= '1' && k <= '9') {
    e.preventDefault();
    const d = k.charCodeAt(0) - 48;
    if (e.shiftKey) {
      if (G.sel < 0) { toast('Pick a cell first'); return; }
      if (G.given[G.sel]) { toast('That cell is a clue â€” it cannot change'); return; }
      toggleNote(G.sel, d);
    } else inputDigit(d);
    return;
  }
  if (k === '0' || k === 'Backspace' || k === 'Delete') {
    e.preventDefault();
    if (G.activeDigit) { G.activeDigit = 0; syncPad(); dirty = true; }
    if (G.sel >= 0) eraseCell(G.sel);
    return;
  }
  if (code === 'Space') {
    e.preventDefault();
    if (G.activeDigit && G.sel >= 0) {
      if (G.notesMode && !G.given[G.sel]) toggleNote(G.sel, G.activeDigit);
      else placeDigit(G.sel, G.activeDigit);
    } else if (G.sel >= 0 && G.values[G.sel] && !G.given[G.sel]) {
      G.activeDigit = G.values[G.sel]; syncPad(); dirty = true;
      toast('Stamp mode: ' + G.activeDigit);
    } else {
      toast('Arm a number from the pad, then Space stamps it');
    }
    return;
  }
  if (k === 'n' || k === 'N') { e.preventDefault(); toggleNotesMode(); return; }
  if (k === 'h' || k === 'H') { e.preventDefault(); useHint(); return; }
  if (k === 'c' || k === 'C') { e.preventDefault(); checkBoard(); return; }
  if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((k === 'y' || k === 'Y') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRedo(); return; }
  if (k === 'r' || k === 'R') { e.preventDefault(); restartPuzzle(); return; }
  if ((k === 'q' || k === 'Q') && !e.ctrlKey) { e.preventDefault(); autoNotes(); return; }
}

function toggleNotesMode() {
  G.notesMode = !G.notesMode;
  SFX.click();
  syncHud(); syncPad();
  toast('Pencil notes ' + (G.notesMode ? 'ON â€” digits go in as candidates' : 'OFF'));
}

let settingsReturn = null;
function openSettings(from) {
  settingsReturn = from || null;
  syncSettingsUI();
  show('settingsMenu');
}
function closeSettings() {
  hide('settingsMenu');
  saveSettings();
  if (settingsReturn) show(settingsReturn);
  settingsReturn = null;
}

function wireUI() {
  $('btnTopPause').addEventListener('click', () => {
    if (G.mode === 'play') pauseGame();
    else if (G.mode === 'pause') resumeGame();
    else toast('Start a puzzle first');
  });
  $('btnTopMenu').addEventListener('click', () => {
    if (G.mode === 'menu') { toast('Already at the menu'); return; }
    quitToMenu();
  });

  $('btnNotes').addEventListener('click', () => { if (G.mode === 'play') toggleNotesMode(); else toast('Start a puzzle first'); });
  $('btnErase').addEventListener('click', () => {
    if (G.mode !== 'play' || !G.active) { toast('Start a puzzle first'); return; }
    if (G.activeDigit) { G.activeDigit = 0; syncPad(); }
    if (G.sel < 0) { toast('Pick a cell first'); return; }
    eraseCell(G.sel);
  });
  $('btnUndo').addEventListener('click', () => { if (G.mode === 'play') doUndo(); else toast('Start a puzzle first'); });
  $('btnRedo').addEventListener('click', () => { if (G.mode === 'play') doRedo(); else toast('Start a puzzle first'); });
  $('btnHint').addEventListener('click', () => { if (G.mode === 'play') useHint(); else toast('Start a puzzle first'); });
  $('btnCheck').addEventListener('click', () => { if (G.mode === 'play') checkBoard(); else toast('Start a puzzle first'); });
  $('btnAutoNotes').addEventListener('click', () => { if (G.mode === 'play') autoNotes(); else toast('Start a puzzle first'); });

  // main menu
  $('btnContinue').addEventListener('click', () => {
    SFX.resume();
    if (G.active && !G.won && !G.lost) { setMode('play'); return; }
    if (savedCurrent) {
      restoreCurrent(savedCurrent);
      savedCurrent = null;
      setMode('play');
      toast('Resumed ' + DIFFS[G.diff].name + (G.daily ? ' Daily' : '') + ' at ' + fmtTime(G.elapsed + G.penalty));
      return;
    }
    toast('No saved puzzle â€” start a new one');
  });
  $('btnNewGame').addEventListener('click', () => { SFX.resume(); hide('mainMenu'); show('diffMenu'); syncMenu(); });
  $('diffClose').addEventListener('click', () => { hide('diffMenu'); show('mainMenu'); });
  const diffButtons = document.querySelectorAll('#diffMenu [data-diff]');
  for (const b of diffButtons) {
    b.addEventListener('click', () => { newGame(b.dataset.diff, false); });
  }
  $('btnDaily').addEventListener('click', () => {
    const key = dateKey();
    const dd = dailyDifficulty(key);
    newGame(dd, true, hashStr('sudoku-master-daily-' + key));
  });
  $('btnStats').addEventListener('click', () => { hide('mainMenu'); openStats(); });
  $('statsClose').addEventListener('click', () => { hide('statsMenu'); if (G.mode === 'menu') show('mainMenu'); });
  $('statsDone').addEventListener('click', () => { hide('statsMenu'); if (G.mode === 'menu') show('mainMenu'); });
  $('btnHowTo').addEventListener('click', () => { hide('mainMenu'); show('howToMenu'); });
  $('howToClose').addEventListener('click', () => { hide('howToMenu'); if (G.mode === 'menu') show('mainMenu'); if (G.mode === 'pause') show('pauseMenu'); });
  $('howToDone').addEventListener('click', () => { hide('howToMenu'); if (G.mode === 'menu') show('mainMenu'); if (G.mode === 'pause') show('pauseMenu'); });
  $('btnSettings').addEventListener('click', () => { hide('mainMenu'); openSettings('mainMenu'); });

  // pause
  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', restartPuzzle);
  $('btnPauseSettings').addEventListener('click', () => { hide('pauseMenu'); openSettings('pauseMenu'); });
  $('btnPauseHowTo').addEventListener('click', () => { hide('pauseMenu'); show('howToMenu'); });
  $('btnQuitMenu').addEventListener('click', quitToMenu);

  // result
  $('btnNextPuzzle').addEventListener('click', () => {
    const d = G.diff;
    G.active = false;
    newGame(d, false);
  });
  $('btnRetryPuzzle').addEventListener('click', () => {
    hide('resultMenu');
    G.won = false; G.lost = false;
    restartPuzzle();
  });
  $('btnResultMenu').addEventListener('click', () => {
    G.active = false;
    hide('resultMenu');
    setMode('menu');
    syncMenu();
  });

  // settings
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsDone').addEventListener('click', closeSettings);
  $('setStrict').addEventListener('change', (e) => {
    settings.strict = e.target.checked;
    if (settings.strict && G.active) markWrongFromStrict(); else G.wrong.fill(0);
    saveSettings(); syncHud(); dirty = true;
  });
  $('setHighlight').addEventListener('change', (e) => { settings.highlight = e.target.checked; saveSettings(); dirty = true; });
  $('setSameDigit').addEventListener('change', (e) => { settings.sameDigit = e.target.checked; saveSettings(); dirty = true; });
  $('setAutoClean').addEventListener('change', (e) => { settings.autoClean = e.target.checked; saveSettings(); });
  $('setReduceFx').addEventListener('change', (e) => {
    settings.reduceFx = e.target.checked;
    if (settings.reduceFx) { flashes.length = 0; shake = 0; for (const p of PART) p.a = false; }
    saveSettings(); dirty = true;
  });
  $('setSound').addEventListener('change', (e) => { settings.sound = e.target.checked; SFX.enabled = settings.sound; saveSettings(); if (settings.sound) SFX.click(); });
  $('setVolume').addEventListener('input', (e) => {
    settings.volume = parseFloat(e.target.value);
    SFX.setVolume(settings.volume);
    $('volVal').textContent = Math.round(settings.volume * 100) + '%';
    saveSettings();
  });

  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); onBoardPointer(e); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', layout);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => layout());
    ro.observe($('boardWrap'));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.mode === 'play') pauseGame();
      stopLoop();
      if (playtimeAcc >= 1) { reportPlaytime(Math.floor(playtimeAcc)); playtimeAcc -= Math.floor(playtimeAcc); }
      persist();
    } else {
      lastT = 0; acc = 0; startLoop(); dirty = true;
    }
  });
  window.addEventListener('pagehide', () => {
    if (playtimeAcc >= 1) reportPlaytime(Math.floor(playtimeAcc));
    persist();
  });
  window.addEventListener('blur', () => { if (G.mode === 'play') pauseGame(); });
}

/* ================================ boot =================================== */

async function boot() {
  loadSettings();
  buildPad();
  wireUI();
  layout();
  syncSettingsUI();
  render();

  empire = new EmpireClient({
    gameId: 'sudoku-master',
    saveVersion: 1,
    onPause: () => { if (G.mode === 'play') pauseGame(); },
    onResume: () => { if (G.mode === 'pause') resumeGame(); },
    onSettings: (s) => applyHubSettings(s),
    onProfile: (p) => { hubProfile = p; syncMenu(); },
  });

  let init = null;
  try { init = await empire.connect(); } catch (e) { init = null; }
  if (init) {
    if (init.profile) hubProfile = init.profile;
    if (init.settings) applyHubSettings(init.settings);
  }
  try { const p = await empire.getProfile(); if (p) hubProfile = p; } catch (e) { /* ignore */ }
  try { const s = await empire.getSettings(); if (s) applyHubSettings(s); } catch (e) { /* ignore */ }

  await loadSave();
  recount();
  syncMenu();
  syncHud();
  syncSettingsUI();
  startLoop();
}

function applyHubSettings(s) {
  if (!s || typeof s !== 'object') return;
  const vol = (s.masterVolume !== undefined) ? s.masterVolume
    : (s.sfxVolume !== undefined) ? s.sfxVolume
    : (s.volume !== undefined) ? s.volume : undefined;
  if (typeof vol === 'number') { settings.volume = clamp(vol, 0, 1); SFX.setVolume(settings.volume); }
  if (typeof s.sound === 'boolean') { settings.sound = s.sound; SFX.enabled = s.sound; }
  if (typeof s.muted === 'boolean') { settings.sound = !s.muted; SFX.enabled = !s.muted; }
  if (typeof s.reducedMotion === 'boolean') settings.reduceFx = settings.reduceFx || s.reducedMotion;
  syncSettingsUI();
}

boot();
/* Authored 3D Sudoku board layer: puzzle generation, validation, notes, hints, and scoring remain authoritative. */
const sudoku3d = { renderer: null, scene: null, camera: null, kit: null, status: { loaded: false, physics: false, attached: false, error: '' } };
function initSudoku3D() {
  try {
    if (!window.THREE) { const add = (src) => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); return add('../../vendor/three-r128/three.min.js').then(() => add('../../vendor/three-r128/GLTFLoader.js')).then(initSudoku3D); }
    const canvas = document.createElement('canvas'); canvas.id = 'scene3d'; canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.6'; document.body.prepend(canvas); sudoku3d.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); sudoku3d.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); sudoku3d.renderer.setSize(innerWidth, innerHeight, false); sudoku3d.scene = new THREE.Scene(); sudoku3d.scene.fog = new THREE.Fog(0x07131e, 14, 52); sudoku3d.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 100); sudoku3d.camera.position.set(0, 7, 13); sudoku3d.scene.add(new THREE.HemisphereLight(0xb6e5ff, 0x101826, 1.7)); const lamp = new THREE.PointLight(0x7cdbff, 2.4, 32); lamp.position.set(0, 7, 2); sudoku3d.scene.add(lamp); const desk = new THREE.Mesh(new THREE.BoxGeometry(16, .35, 11), new THREE.MeshStandardMaterial({ color: 0x142735, roughness: .85 })); desk.position.y = -1.35; sudoku3d.scene.add(desk);
    new THREE.GLTFLoader().load('../../assets/blender-kits/sudoku-master/sudoku-master-kit.glb', (gltf) => { sudoku3d.kit = gltf.scene; sudoku3d.kit.scale.setScalar(1.8); sudoku3d.scene.add(sudoku3d.kit); sudoku3d.status.loaded = true; sudoku3d.status.attached = true; window.__sudokuMasterAssetStatus = sudoku3d.status; }, undefined, (e) => { sudoku3d.status.error = String(e && e.message || e); window.__sudokuMasterAssetStatus = sudoku3d.status; }); fetch('../../assets/blender-kits/sudoku-master/physics.json').then((r) => r.json()).then((p) => { sudoku3d.status.physics = !!p.playerCollider; window.__sudokuMasterAssetStatus = sudoku3d.status; }).catch((e) => { sudoku3d.status.error = String(e && e.message || e); }); addEventListener('resize', () => { sudoku3d.renderer.setSize(innerWidth, innerHeight, false); sudoku3d.camera.aspect = innerWidth / innerHeight; sudoku3d.camera.updateProjectionMatrix(); });
    const render = () => { requestAnimationFrame(render); if (sudoku3d.kit) { sudoku3d.kit.rotation.y += .0009; if (typeof G !== 'undefined' && G) sudoku3d.kit.rotation.z = Math.sin(G.seconds * .4) * .01; } sudoku3d.renderer.render(sudoku3d.scene, sudoku3d.camera); }; requestAnimationFrame(render);
  } catch (e) { sudoku3d.status.error = String(e && e.message || e); window.__sudokuMasterAssetStatus = sudoku3d.status; }
}
window.__sudokuMasterAssetStatus = sudoku3d.status; initSudoku3D();
