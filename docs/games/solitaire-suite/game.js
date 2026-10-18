/* =============================================================================
   SOLITAIRE SUITE — Klondike (draw 1/3) + Spider (1/2/4 suits) + FreeCell
   Gaming Empire · offline · DOM stack
   ============================================================================= */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'solitaire-suite',statusKey:'__solitaireAssetStatus',accent:0xd9b36c,getState:()=>({active:!!S,motion:0,danger:0})});

/* ------------------------------- constants ------------------------------- */

const $ = (id) => document.getElementById(id);
const SUIT_CH = ['♠', '♥', '♦', '♣'];      // spade heart diamond club
const SUIT_RED = [false, true, true, false];
const RANK_CH = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const COURT = { 11: 'J', 12: 'Q', 13: 'K' };

const KIND = { STOCK: 'stock', WASTE: 'waste', FOUND: 'found', TAB: 'tab', FREE: 'free', DONE: 'done' };

const VARIANTS = {
  klondike: {
    label: 'Klondike', cols: 7,
    optKey: 'draw',
    choices: [{ v: 1, l: 'Draw 1', d: 'Turn one card at a time. The friendliest deal — most games are winnable with patience.' },
              { v: 3, l: 'Draw 3', d: 'Turn three at a time; only the top one plays. The classic tournament rule.' }],
    key: (o) => 'klondike' + o.draw,
    name: (o) => 'Klondike · Draw ' + o.draw,
  },
  spider: {
    label: 'Spider', cols: 10,
    optKey: 'suits',
    choices: [{ v: 1, l: '1 Suit', d: 'Spades only. A gentle introduction to two-deck spider.' },
              { v: 2, l: '2 Suits', d: 'Spades and hearts. Suit discipline starts to matter.' },
              { v: 4, l: '4 Suits', d: 'All four suits. The hardest game in the suite — take your time.' }],
    key: (o) => 'spider' + o.suits,
    name: (o) => 'Spider · ' + o.suits + ' Suit' + (o.suits > 1 ? 's' : ''),
  },
  freecell: {
    label: 'FreeCell', cols: 8,
    optKey: null,
    choices: [],
    key: () => 'freecell',
    name: () => 'FreeCell',
  },
};

const STAT_KEYS = ['klondike1', 'klondike3', 'spider1', 'spider2', 'spider4', 'freecell'];
const STAT_LABEL = {
  klondike1: 'Klondike Draw 1', klondike3: 'Klondike Draw 3',
  spider1: 'Spider 1 Suit', spider2: 'Spider 2 Suits', spider4: 'Spider 4 Suits',
  freecell: 'FreeCell',
};

/* The Gauntlet — 12 staged challenges. Each attempt deals a fresh (shown) seed,
   so no stage can ever be an unwinnable fixed deal. Goals are hard rules. */
const LADDER = [
  { n: 'Opening Hand',    v: 'klondike', o: { draw: 1 }, goal: {},                     s: { time: 600, moves: 200 }, d: 'Win a Klondike Draw 1 deal.' },
  { n: 'Against the Clock', v: 'klondike', o: { draw: 1 }, goal: { time: 480 },        s: { time: 300, moves: 180 }, d: 'Win Klondike Draw 1 inside 8 minutes.' },
  { n: 'Eight Columns',   v: 'freecell', o: {},           goal: {},                    s: { time: 600, moves: 160 }, d: 'Win a game of FreeCell.' },
  { n: 'First Web',       v: 'spider',   o: { suits: 1 }, goal: {},                    s: { time: 600, moves: 250 }, d: 'Win Spider with a single suit.' },
  { n: 'Three at a Time', v: 'klondike', o: { draw: 3 }, goal: {},                     s: { time: 660, moves: 220 }, d: 'Win a Klondike Draw 3 deal.' },
  { n: 'No Take-Backs',   v: 'freecell', o: {},           goal: { undo: 5 },           s: { time: 480, moves: 150 }, d: 'Win FreeCell using at most 5 undos.' },
  { n: 'Two Colours',     v: 'spider',   o: { suits: 2 }, goal: {},                    s: { time: 900, moves: 300 }, d: 'Win Spider with two suits.' },
  { n: 'Ten Minute Mile', v: 'klondike', o: { draw: 3 }, goal: { time: 600 },          s: { time: 420, moves: 200 }, d: 'Win Klondike Draw 3 inside 10 minutes.' },
  { n: 'Economy Drive',   v: 'freecell', o: {},           goal: { time: 420, moves: 220 }, s: { time: 300, moves: 140 }, d: 'Win FreeCell in under 7 minutes and 220 moves.' },
  { n: 'Web of Patience', v: 'spider',   o: { suits: 2 }, goal: { undo: 10 },          s: { time: 800, moves: 280 }, d: 'Win 2-suit Spider using at most 10 undos.' },
  { n: 'Iron Nerve',      v: 'klondike', o: { draw: 3 }, goal: { undo: 0 },            s: { time: 480, moves: 200 }, d: 'Win Klondike Draw 3 with no undos at all.' },
  { n: 'The Tarantula',   v: 'spider',   o: { suits: 4 }, goal: {},                    s: { time: 1200, moves: 400 }, d: 'Win 4-suit Spider. The final test.' },
];

/* Ids here MUST match manifest.json exactly. */
const ACH = {
  klondike_win:    { t: 'Klondike Solved', d: 'Win your first game of Klondike.' },
  freecell_win:    { t: 'Cells Cleared', d: 'Win a game of FreeCell.' },
  spider_win:      { t: 'Web Weaver', d: 'Win a game of Spider.' },
  deal_veteran:    { t: 'Card Sharp', d: 'Play 25 deals across the suite.', target: 25 },
  speed_demon:     { t: 'Speed Demon', d: 'Win any deal in under 4 minutes.' },
  streak_three:    { t: 'On a Heater', d: 'Win 3 deals in a row in the same game.', target: 3 },
  iron_will:       { t: 'Iron Will', d: 'Win a deal without a single undo.' },
  suite_master:    { t: 'Suite Master', d: 'Win all three variants.' },
  spider_four:     { t: 'Tarantula', d: 'Win 4-suit Spider.' },
  gauntlet_champ:  { t: 'Gauntlet Champion', d: 'Clear all 12 Gauntlet stages.', target: 12 },
};

/* --------------------------------- utils --------------------------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function randSeed() { return Math.floor(Math.random() * 900000) + 100000; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* --------------------------------- audio --------------------------------- */

const Sfx = {
  ctx: null, master: null, enabled: true, vol: 0.7,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
  tone(freq, dur, type, vol, slide) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.2), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq, vol, q) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q || 1.2;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t);
  },
  place() { this.noise(0.07, 1500, 0.18, 1.6); this.tone(320, 0.05, 'triangle', 0.05); },
  flip() { this.noise(0.06, 2600, 0.14, 2.2); },
  deal() { this.noise(0.045, 2100, 0.11, 2.0); },
  pick() { this.tone(520, 0.05, 'triangle', 0.07); },
  invalid() { this.tone(150, 0.16, 'sawtooth', 0.09, 90); },
  undo() { this.tone(360, 0.1, 'triangle', 0.08, 240); },
  found() { this.tone(660, 0.1, 'triangle', 0.09); this.tone(990, 0.12, 'sine', 0.06); },
  collect() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.1), i * 55));
  },
  win() {
    const seq = [523, 659, 784, 1046, 1318, 1046, 1318, 1568];
    seq.forEach((f, i) => setTimeout(() => { this.tone(f, 0.3, 'triangle', 0.11); this.tone(f / 2, 0.3, 'sine', 0.06); }, i * 110));
  },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sine', 0.09), i * 150)); },
  ach() { [784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.1), i * 70)); },
};

/* ------------------------------ persistence ------------------------------ */

function blankStat() {
  return { played: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, bestTime: 0, bestMoves: 0, bestScore: 0, timeSec: 0 };
}
function defaultSave() {
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = blankStat();
  return {
    v: 1,
    stats,
    ladder: { stars: LADDER.map(() => 0) },
    ach: {},
    options: { sound: true, vol: 0.7, anim: 'normal', back: 0, autoSafe: true, leftHand: false },
    lastPick: { variant: 'klondike', draw: 1, suits: 1 },
    current: null,
    totals: { wins: 0, played: 0 },
  };
}
let SAVE = defaultSave();
let empire = null;
let profileName = '';
let hubSettings = null;
let reducedMotion = false;

/* --------------------------------- state --------------------------------- */

let S = null;                 // active game state
let els = [];                 // card id -> DOM element
let pos = [];                 // card id -> {x,y}
let screen = 'title';
let paused = false;
let selection = null;         // {pi, ci, ids, targets:[]}
let drag = null;
let autoQueue = null;         // {moves:[], i, delay}
let cascade = { active: false, items: [], next: 0, spawnAt: 0, src: [], done: false };
let confetti = [];
let shake = { t: 0, mag: 0 };
let hintTimer = 0;
let playSecAcc = 0;
let sessionSec = 0;
let dirty = false;

const boardEl = $('board'), slotLayer = $('slotLayer'), cardLayer = $('cardLayer'), fxLayer = $('fxLayer');

/* metrics from layout */
let M = { cw: 80, ch: 114, gx: 10, ox: 0, topY: 8, tabY: 130, bw: 900, bh: 600 };

/* keyboard focus */
let focusOrder = [], focusIdx = 0, focusCard = -1;

/* ============================== DECK / DEAL ============================== */

function makePile(st, kind) {
  const p = { i: st.piles.length, kind, cards: [], rect: { x: 0, y: 0, w: 0, h: 0 }, step: 0, slotEl: null };
  st.piles.push(p);
  return p.i;
}

function newState(variant, opts, seed) {
  const st = {
    variant, opts: Object.assign({}, opts), seed,
    deck: [], up: [], piles: [], tab: [], found: [], free: [], done: [],
    stock: -1, waste: -1,
    moves: 0, score: 0, timeMs: 0, redeals: 0, undos: 0, hints: 0,
    over: false, won: false, history: [],
    ladderStage: -1,
  };
  const rng = mulberry32(seed >>> 0);

  if (variant === 'klondike') {
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) st.deck.push({ r, s });
    st.score = 0;
  } else if (variant === 'freecell') {
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) st.deck.push({ r, s });
  } else {
    const suits = st.opts.suits === 1 ? [0] : st.opts.suits === 2 ? [0, 1] : [0, 1, 2, 3];
    const copies = 8 / suits.length;
    for (const s of suits) for (let c = 0; c < copies; c++) for (let r = 1; r <= 13; r++) st.deck.push({ r, s });
    st.score = 500;
  }
  st.up = st.deck.map(() => false);

  const order = st.deck.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }

  if (variant === 'klondike') {
    st.stock = makePile(st, KIND.STOCK);
    st.waste = makePile(st, KIND.WASTE);
    for (let i = 0; i < 4; i++) st.found.push(makePile(st, KIND.FOUND));
    for (let i = 0; i < 7; i++) st.tab.push(makePile(st, KIND.TAB));
    let k = 0;
    for (let c = 0; c < 7; c++) {
      for (let n = 0; n <= c; n++) {
        const id = order[k++];
        st.piles[st.tab[c]].cards.push(id);
        st.up[id] = (n === c);
      }
    }
    while (k < order.length) { const id = order[k++]; st.piles[st.stock].cards.push(id); st.up[id] = false; }
  } else if (variant === 'freecell') {
    for (let i = 0; i < 4; i++) st.free.push(makePile(st, KIND.FREE));
    for (let i = 0; i < 4; i++) st.found.push(makePile(st, KIND.FOUND));
    for (let i = 0; i < 8; i++) st.tab.push(makePile(st, KIND.TAB));
    let k = 0;
    for (let c = 0; c < 8; c++) {
      const n = c < 4 ? 7 : 6;
      for (let i = 0; i < n; i++) { const id = order[k++]; st.piles[st.tab[c]].cards.push(id); st.up[id] = true; }
    }
  } else {
    st.stock = makePile(st, KIND.STOCK);
    for (let i = 0; i < 8; i++) st.done.push(makePile(st, KIND.DONE));
    for (let i = 0; i < 10; i++) st.tab.push(makePile(st, KIND.TAB));
    let k = 0;
    for (let c = 0; c < 10; c++) {
      const n = c < 4 ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const id = order[k++];
        st.piles[st.tab[c]].cards.push(id);
        st.up[id] = (i === n - 1);
      }
    }
    while (k < order.length) { const id = order[k++]; st.piles[st.stock].cards.push(id); st.up[id] = false; }
  }
  return st;
}

/* ================================= RULES ================================= */

const card = (st, id) => st.deck[id];
const isRed = (st, id) => SUIT_RED[st.deck[id].s];
const topId = (st, pi) => { const c = st.piles[pi].cards; return c.length ? c[c.length - 1] : -1; };

function foundationAccepts(st, fi, id) {
  const f = st.piles[fi].cards;
  const c = card(st, id);
  if (!f.length) return c.r === 1;
  const t = card(st, f[f.length - 1]);
  return t.s === c.s && c.r === t.r + 1;
}

function freeCellsOpen(st) { return st.free.reduce((n, i) => n + (st.piles[i].cards.length ? 0 : 1), 0); }
function emptyCols(st, exclude) {
  return st.tab.reduce((n, i) => n + (st.piles[i].cards.length === 0 && i !== exclude ? 1 : 0), 0);
}
function maxMove(st, dest) {
  const destEmpty = dest !== undefined && st.piles[dest] && st.piles[dest].kind === KIND.TAB && st.piles[dest].cards.length === 0;
  const e = emptyCols(st, destEmpty ? dest : -1);
  return Math.min(64, (freeCellsOpen(st) + 1) * Math.pow(2, e));
}

const V = {
  klondike: {
    canGrab(st, pi, ci) {
      const p = st.piles[pi], c = p.cards;
      if (ci < 0 || ci >= c.length) return false;
      if (p.kind === KIND.WASTE || p.kind === KIND.FOUND) return ci === c.length - 1;
      if (p.kind !== KIND.TAB) return false;
      if (!st.up[c[ci]]) return false;
      for (let i = ci; i < c.length - 1; i++) {
        const a = card(st, c[i]), b = card(st, c[i + 1]);
        if (!st.up[c[i + 1]] || b.r !== a.r - 1 || isRed(st, c[i]) === isRed(st, c[i + 1])) return false;
      }
      return true;
    },
    canDrop(st, ids, dj) {
      const p = st.piles[dj];
      if (p.kind === KIND.FOUND) return ids.length === 1 && foundationAccepts(st, dj, ids[0]);
      if (p.kind !== KIND.TAB) return false;
      const first = card(st, ids[0]);
      if (!p.cards.length) return first.r === 13;
      const t = p.cards[p.cards.length - 1];
      if (!st.up[t]) return false;
      return card(st, t).r === first.r + 1 && isRed(st, t) !== isRed(st, ids[0]);
    },
    isWin(st) { return st.found.every((i) => st.piles[i].cards.length === 13); },
  },
  freecell: {
    canGrab(st, pi, ci) {
      const p = st.piles[pi], c = p.cards;
      if (ci < 0 || ci >= c.length) return false;
      if (p.kind === KIND.FREE || p.kind === KIND.FOUND) return ci === c.length - 1;
      if (p.kind !== KIND.TAB) return false;
      for (let i = ci; i < c.length - 1; i++) {
        const a = card(st, c[i]), b = card(st, c[i + 1]);
        if (b.r !== a.r - 1 || isRed(st, c[i]) === isRed(st, c[i + 1])) return false;
      }
      return c.length - ci <= maxMove(st);
    },
    canDrop(st, ids, dj) {
      const p = st.piles[dj];
      if (p.kind === KIND.FOUND) return ids.length === 1 && foundationAccepts(st, dj, ids[0]);
      if (p.kind === KIND.FREE) return ids.length === 1 && p.cards.length === 0;
      if (p.kind !== KIND.TAB) return false;
      if (ids.length > maxMove(st, dj)) return false;
      const first = card(st, ids[0]);
      if (!p.cards.length) return true;
      const t = p.cards[p.cards.length - 1];
      return card(st, t).r === first.r + 1 && isRed(st, t) !== isRed(st, ids[0]);
    },
    isWin(st) { return st.found.every((i) => st.piles[i].cards.length === 13); },
  },
  spider: {
    canGrab(st, pi, ci) {
      const p = st.piles[pi], c = p.cards;
      if (p.kind !== KIND.TAB || ci < 0 || ci >= c.length) return false;
      if (!st.up[c[ci]]) return false;
      for (let i = ci; i < c.length - 1; i++) {
        const a = card(st, c[i]), b = card(st, c[i + 1]);
        if (!st.up[c[i + 1]] || b.r !== a.r - 1 || b.s !== a.s) return false;
      }
      return true;
    },
    canDrop(st, ids, dj) {
      const p = st.piles[dj];
      if (p.kind !== KIND.TAB) return false;
      if (!p.cards.length) return true;
      const t = p.cards[p.cards.length - 1];
      if (!st.up[t]) return false;
      return card(st, t).r === card(st, ids[0]).r + 1;
    },
    isWin(st) { return st.done.every((i) => st.piles[i].cards.length === 13); },
  },
};

function rules(st) { return V[st.variant]; }

/* --------------------------- moves & scoring ---------------------------- */

function snapshot(st) {
  return {
    p: st.piles.map((p) => p.cards.slice()),
    u: st.up.slice(),
    m: st.moves, sc: st.score, rd: st.redeals,
  };
}
function restore(st, snap) {
  for (let i = 0; i < st.piles.length; i++) st.piles[i].cards = snap.p[i].slice();
  st.up = snap.u.slice();
  st.moves = snap.m; st.score = snap.sc; st.redeals = snap.rd;
}
function pushHistory(st) { st.history.push(snapshot(st)); if (st.history.length > 4000) st.history.shift(); }

/** Move cards [ci..] from pile `from` to pile `to`. Returns event info. */
function doMove(st, from, ci, to, silent) {
  const src = st.piles[from], dst = st.piles[to];
  const moved = src.cards.splice(ci);
  for (const id of moved) { dst.cards.push(id); st.up[id] = true; }
  st.moves++;
  const ev = { flipped: -1, collected: [], toFound: dst.kind === KIND.FOUND, ids: moved };

  if (st.variant === 'klondike') {
    if (dst.kind === KIND.FOUND) st.score += 10;
    else if (src.kind === KIND.WASTE) st.score += 5;
    else if (src.kind === KIND.FOUND) st.score -= 15;
    if (src.kind === KIND.TAB && src.cards.length && !st.up[src.cards[src.cards.length - 1]]) {
      st.up[src.cards[src.cards.length - 1]] = true;
      ev.flipped = src.cards[src.cards.length - 1];
      st.score += 5;
    }
    if (st.score < 0) st.score = 0;
  } else if (st.variant === 'spider') {
    st.score -= 1;
    if (src.kind === KIND.TAB && src.cards.length && !st.up[src.cards[src.cards.length - 1]]) {
      st.up[src.cards[src.cards.length - 1]] = true;
      ev.flipped = src.cards[src.cards.length - 1];
    }
    collectRuns(st, ev);
  }
  return ev;
}

/** Spider: pull any complete K..A same-suit run off the table. */
function collectRuns(st, ev) {
  for (const ti of st.tab) {
    const c = st.piles[ti].cards;
    if (c.length < 13) continue;
    const start = c.length - 13;
    if (!st.up[c[start]]) continue;
    let ok = card(st, c[start]).r === 13;
    if (ok) {
      for (let i = start; i < c.length - 1; i++) {
        const a = card(st, c[i]), b = card(st, c[i + 1]);
        if (!st.up[c[i + 1]] || b.r !== a.r - 1 || b.s !== a.s) { ok = false; break; }
      }
    }
    if (!ok) continue;
    const target = st.done.find((d) => st.piles[d].cards.length === 0);
    if (target === undefined) continue;
    const run = c.splice(start);
    for (const id of run) st.piles[target].cards.push(id);
    st.score += 100;
    if (c.length && !st.up[c[c.length - 1]]) { st.up[c[c.length - 1]] = true; ev.flipped = c[c.length - 1]; }
    ev.collected.push(target);
  }
}

/** Klondike stock tap: draw or recycle. Returns 'draw' | 'recycle' | null. */
function stockTap(st) {
  if (st.variant === 'klondike') {
    const stock = st.piles[st.stock], waste = st.piles[st.waste];
    if (stock.cards.length) {
      const n = Math.min(st.opts.draw, stock.cards.length);
      for (let i = 0; i < n; i++) { const id = stock.cards.pop(); waste.cards.push(id); st.up[id] = true; }
      st.moves++;
      return 'draw';
    }
    if (waste.cards.length) {
      while (waste.cards.length) { const id = waste.cards.pop(); stock.cards.push(id); st.up[id] = false; }
      st.redeals++; st.moves++;
      if (st.opts.draw === 1) st.score = Math.max(0, st.score - 20);
      return 'recycle';
    }
    return null;
  }
  if (st.variant === 'spider') {
    const stock = st.piles[st.stock];
    if (!stock.cards.length) return null;
    if (st.tab.some((i) => st.piles[i].cards.length === 0)) return 'blocked';
    const ev = { flipped: -1, collected: [] };
    for (const ti of st.tab) {
      const id = stock.cards.pop();
      if (id === undefined) break;
      st.piles[ti].cards.push(id); st.up[id] = true;
    }
    st.moves++; st.score -= 1;
    collectRuns(st, ev);
    return 'deal';
  }
  return null;
}

function fcScore(st) { return Math.max(0, 1000 - st.moves * 2 - Math.floor(st.timeMs / 5000)); }
function displayScore(st) { return st.variant === 'freecell' ? fcScore(st) : Math.max(0, st.score); }

/* ------------------------- destinations / helpers ------------------------ */

function legalTargets(st, pi, ci) {
  const R = rules(st);
  if (!R.canGrab(st, pi, ci)) return [];
  const ids = st.piles[pi].cards.slice(ci);
  const out = [];
  for (let j = 0; j < st.piles.length; j++) {
    if (j === pi) continue;
    const k = st.piles[j].kind;
    if (k === KIND.STOCK || k === KIND.WASTE || k === KIND.DONE) continue;
    if (R.canDrop(st, ids, j)) out.push(j);
  }
  return out;
}

/** true if this rank can be sent to a foundation with zero risk (Klondike/FreeCell). */
function safeToFound(st, id) {
  const c = card(st, id);
  if (c.r <= 2) return true;
  const rank = [0, 0, 0, 0];
  for (const fi of st.found) {
    const f = st.piles[fi].cards;
    if (f.length) { const t = card(st, f[f.length - 1]); rank[t.s] = t.r; }
  }
  const red = SUIT_RED[c.s];
  let minOpp = 99, sameOther = 99;
  for (let s = 0; s < 4; s++) {
    if (s === c.s) continue;
    if (SUIT_RED[s] !== red) minOpp = Math.min(minOpp, rank[s]);
    else sameOther = Math.min(sameOther, rank[s]);
  }
  return minOpp >= c.r - 1 && sameOther >= c.r - 2;
}

function hasAnyMove(st) {
  const R = rules(st);
  if (st.stock >= 0 && st.piles[st.stock].cards.length) {
    if (st.variant === 'spider') { if (!st.tab.some((i) => st.piles[i].cards.length === 0)) return true; }
    else return true;
  }
  if (st.variant === 'klondike' && st.piles[st.waste].cards.length) return true;
  const sources = st.tab.concat(st.variant === 'klondike' ? [st.waste] : [], st.free);
  for (const pi of sources) {
    const c = st.piles[pi].cards;
    for (let ci = 0; ci < c.length; ci++) {
      if (!R.canGrab(st, pi, ci)) continue;
      if (legalTargets(st, pi, ci).length) {
        if (st.piles[pi].kind === KIND.TAB && ci === 0) {
          const tgt = legalTargets(st, pi, ci);
          if (tgt.every((j) => st.piles[j].kind === KIND.TAB && st.piles[j].cards.length === 0)) continue;
        }
        return true;
      }
    }
  }
  return false;
}

/* --------------------------- clone / simulation -------------------------- */

function cloneState(st) {
  const c = {
    variant: st.variant, opts: st.opts, seed: st.seed, deck: st.deck,
    up: st.up.slice(), piles: st.piles.map((p) => ({ i: p.i, kind: p.kind, cards: p.cards.slice(), rect: p.rect, step: 0, slotEl: null })),
    tab: st.tab, found: st.found, free: st.free, done: st.done,
    stock: st.stock, waste: st.waste,
    moves: st.moves, score: st.score, timeMs: st.timeMs, redeals: st.redeals, undos: 0, hints: 0,
    over: false, won: false, history: [], ladderStage: -1,
  };
  return c;
}

/** Plan a full auto-finish. Returns array of moves, or null if it can't finish. */
function planAuto(st0) {
  const st = cloneState(st0);
  const R = rules(st);
  const out = [];
  let guard = 0;

  if (st.variant === 'spider') {
    // Cheap early-out: spider can only be finished mechanically once the stock
    // is empty and every tableau card is face up. Keeps this off the hot path.
    if (st.stock >= 0 && st.piles[st.stock].cards.length) return null;
    for (const ti of st.tab) {
      for (const id of st.piles[ti].cards) if (!st.up[id]) return null;
    }
    const seen = new Set();
    while (!R.isWin(st) && guard++ < 1200) {
      let did = false;
      const key = st.piles.map((p) => p.cards.join(',')).join('|');
      if (seen.has(key)) break;
      seen.add(key);
      // prefer moves that join same-suit runs
      outer:
      for (const pi of st.tab) {
        const c = st.piles[pi].cards;
        for (let ci = 0; ci < c.length; ci++) {
          if (!R.canGrab(st, pi, ci)) continue;
          const ids = c.slice(ci);
          for (const pj of st.tab) {
            if (pj === pi || !st.piles[pj].cards.length) continue;
            if (!R.canDrop(st, ids, pj)) continue;
            const t = topId(st, pj);
            if (card(st, t).s !== card(st, ids[0]).s) continue;
            if (ci > 0 && !st.up[c[ci - 1]]) { /* fine, flips a card */ }
            doMove(st, pi, ci, pj, true);
            out.push({ from: pi, ci, to: pj });
            did = true;
            break outer;
          }
        }
      }
      if (!did) break;
    }
    return R.isWin(st) ? out : null;
  }

  let stale = 0;
  while (!R.isWin(st) && guard++ < 800) {
    let did = false;
    const sources = st.tab.concat(st.variant === 'klondike' ? [st.waste] : [], st.free);
    for (const pi of sources) {
      const c = st.piles[pi].cards;
      if (!c.length) continue;
      const ci = c.length - 1;
      if (st.piles[pi].kind === KIND.TAB && !st.up[c[ci]]) continue;
      for (const fj of st.found) {
        if (!R.canDrop(st, [c[ci]], fj)) continue;
        doMove(st, pi, ci, fj, true);
        out.push({ from: pi, ci, to: fj });
        did = true; break;
      }
      if (did) break;
    }
    if (did) { stale = 0; continue; }
    if (st.variant === 'klondike') {
      const total = st.piles[st.stock].cards.length + st.piles[st.waste].cards.length;
      if (total > 0 && stale <= total + 2) {
        const kind = stockTap(st);
        if (!kind) break;
        out.push({ stock: true });
        stale++;
        continue;
      }
    }
    break;
  }
  return R.isWin(st) ? out : null;
}

/** Find a useful move for the hint button. */
function findHint(st) {
  const R = rules(st);
  const rate = (pi, ci, pj) => {
    const p = st.piles[pi], q = st.piles[pj];
    let sc = 0;
    if (q.kind === KIND.FOUND) sc += safeToFound(st, p.cards[ci]) ? 100 : 40;
    if (q.kind === KIND.FREE) sc -= 20;
    if (p.kind === KIND.TAB && ci > 0 && !st.up[p.cards[ci - 1]]) sc += 60;      // flips a card
    if (p.kind === KIND.TAB && ci === 0 && q.kind === KIND.TAB && q.cards.length) sc += 30; // empties a column
    if (p.kind === KIND.WASTE) sc += 25;
    if (q.kind === KIND.TAB && q.cards.length === 0 && p.cards.length - ci === 1 && ci === 0) sc -= 80;
    if (st.variant === 'spider' && q.cards.length) {
      const t = topId(st, pj);
      if (card(st, t).s === card(st, p.cards[ci]).s) sc += 45;
    }
    return sc;
  };
  let best = null;
  const sources = st.tab.concat(st.variant === 'klondike' ? [st.waste] : [], st.free);
  for (const pi of sources) {
    const c = st.piles[pi].cards;
    for (let ci = 0; ci < c.length; ci++) {
      if (!R.canGrab(st, pi, ci)) continue;
      for (const pj of legalTargets(st, pi, ci)) {
        const sc = rate(pi, ci, pj);
        if (!best || sc > best.sc) best = { from: pi, ci, to: pj, sc };
      }
    }
  }
  if (best && best.sc > 0) return best;
  if (st.stock >= 0 && st.piles[st.stock].cards.length) {
    if (st.variant !== 'spider' || !st.tab.some((i) => st.piles[i].cards.length === 0)) return { stock: true };
  }
  if (st.variant === 'klondike' && st.piles[st.waste].cards.length) return { stock: true };
  return best || null;
}

/* ================================ RENDER ================================= */

function buildCards() {
  cardLayer.innerHTML = '';
  els = new Array(S.deck.length);
  pos = new Array(S.deck.length);
  const backCls = 'b' + (SAVE.options.back | 0);
  for (let id = 0; id < S.deck.length; id++) {
    const c = S.deck[id];
    const el = document.createElement('div');
    el.className = 'card' + (SUIT_RED[c.s] ? ' red' : '');
    el.dataset.id = String(id);
    const sc = SUIT_CH[c.s], rc = RANK_CH[c.r];
    const centre = c.r >= 11
      ? `<div class="pip court"><span class="cl">${rc}</span><span>${sc}</span></div>`
      : `<div class="pip">${sc}</div>`;
    el.innerHTML =
      `<div class="inner">` +
      `<div class="cface"><span class="corner tl"><span class="cr">${rc}</span><span class="cs">${sc}</span></span>` +
      centre +
      `<span class="corner br"><span class="cr">${rc}</span><span class="cs">${sc}</span></span></div>` +
      `<div class="cback ${backCls}"></div></div>`;
    cardLayer.appendChild(el);
    els[id] = el;
    pos[id] = { x: 0, y: 0 };
  }
}

function buildSlots() {
  slotLayer.innerHTML = '';
  for (const p of S.piles) {
    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.pi = String(p.i);
    if (p.kind === KIND.STOCK) d.textContent = '↻';
    else if (p.kind === KIND.FOUND) d.textContent = 'A';
    else if (p.kind === KIND.FREE) d.textContent = '◌';
    else if (p.kind === KIND.DONE) d.textContent = '';
    else d.textContent = '';
    if (p.kind === KIND.WASTE) d.style.opacity = '0.35';
    slotLayer.appendChild(d);
    p.slotEl = d;
  }
}

function computeLayout() {
  const bw = boardEl.clientWidth || 900, bh = boardEl.clientHeight || 520;
  M.bw = bw; M.bh = bh;
  const cols = VARIANTS[S.variant].cols;
  let cw = bw / (cols * 1.13 + 0.3);
  cw = Math.min(cw, (bh / 3.5) * 0.70);
  cw = Math.max(34, Math.floor(cw));
  const ch = Math.round(cw / 0.70);
  const gx = Math.max(4, Math.round(cw * 0.13));
  const totalW = cols * cw + (cols - 1) * gx;
  const ox = Math.max(4, Math.round((bw - totalW) / 2));
  const topY = Math.round(Math.min(cw * 0.18, 12)) + 4;
  const tabY = topY + ch + Math.max(10, Math.round(ch * 0.20));
  M.cw = cw; M.ch = ch; M.gx = gx; M.ox = ox; M.topY = topY; M.tabY = tabY;
  boardEl.style.setProperty('--cw', cw + 'px');
  boardEl.style.setProperty('--ch', ch + 'px');

  const colX = (i) => ox + i * (cw + gx);
  const lh = !!SAVE.options.leftHand;
  const setRect = (pi, x, y, w, h) => { const p = S.piles[pi]; p.rect = { x, y, w: w || cw, h: h || ch }; };

  if (S.variant === 'klondike') {
    const stockCol = lh ? cols - 1 : 0, wasteCol = lh ? cols - 2 : 1;
    setRect(S.stock, colX(stockCol), topY);
    setRect(S.waste, colX(wasteCol), topY, cw + Math.round(cw * 0.6));
    for (let i = 0; i < 4; i++) setRect(S.found[i], colX(lh ? i : 3 + i), topY);
  } else if (S.variant === 'freecell') {
    for (let i = 0; i < 4; i++) setRect(S.free[i], colX(lh ? 4 + i : i), topY);
    for (let i = 0; i < 4; i++) setRect(S.found[i], colX(lh ? i : 4 + i), topY);
  } else {
    const stockCol = lh ? 0 : cols - 1;
    setRect(S.stock, colX(stockCol), topY);
    const dstep = Math.round(cw * 0.38);
    const dx0 = lh ? colX(1) : ox;
    for (let i = 0; i < 8; i++) setRect(S.done[i], dx0 + i * dstep, topY);
  }

  const availH = Math.max(ch + 12, bh - tabY - 6);
  const baseUp = ch * (S.variant === 'spider' ? 0.27 : 0.30);
  const baseDown = ch * 0.17;
  for (let i = 0; i < S.tab.length; i++) {
    const p = S.piles[S.tab[i]];
    const n = p.cards.length;
    let stepUp = baseUp, stepDown = baseDown;
    if (n > 1) {
      let need = ch;
      for (let k = 0; k < n - 1; k++) need += S.up[p.cards[k]] ? baseUp : baseDown;
      if (need > availH) {
        const k = Math.max(0.16, (availH - ch) / Math.max(1, need - ch));
        stepUp *= k; stepDown *= k;
      }
    }
    p.step = stepUp; p.stepDown = stepDown;
    let h = ch;
    for (let k = 0; k < n - 1; k++) h += S.up[p.cards[k]] ? stepUp : stepDown;
    setRect(S.tab[i], colX(i), tabY, cw, Math.max(ch, h) + ch * 0.2);
  }

  // slot elements
  for (const p of S.piles) {
    if (!p.slotEl) continue;
    p.slotEl.style.transform = `translate3d(${Math.round(p.rect.x)}px, ${Math.round(p.rect.y)}px, 0)`;
    p.slotEl.style.width = cw + 'px';
    p.slotEl.style.height = ch + 'px';
    p.slotEl.style.display = (p.kind === KIND.DONE && p.cards.length === 0 && p.i !== S.done[0]) ? 'none' : 'flex';
  }

  // card positions
  for (const p of S.piles) {
    const n = p.cards.length;
    let x = p.rect.x, y = p.rect.y;
    for (let i = 0; i < n; i++) {
      const id = p.cards[i];
      if (p.kind === KIND.TAB) {
        pos[id] = { x, y };
        y += S.up[id] ? p.step : p.stepDown;
      } else if (p.kind === KIND.WASTE) {
        const shown = Math.min(3, n);
        const k = Math.max(0, i - (n - shown));
        pos[id] = { x: p.rect.x + k * Math.round(cw * 0.3), y: p.rect.y };
      } else if (p.kind === KIND.STOCK) {
        pos[id] = { x: p.rect.x + Math.min(6, Math.floor(i / 10)) * 1.5, y: p.rect.y - Math.min(6, Math.floor(i / 10)) * 1.5 };
      } else {
        pos[id] = { x: p.rect.x, y: p.rect.y };
      }
    }
  }
}

function render(stagger) {
  if (!S) return;
  computeLayout();
  let order = 0;
  for (const p of S.piles) {
    const n = p.cards.length;
    for (let i = 0; i < n; i++) {
      const id = p.cards[i];
      const el = els[id];
      if (!el) continue;
      const pt = pos[id];
      el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y)}px, 0)`;
      el.style.zIndex = String(order * 60 + i + 1);
      el.classList.toggle('down', !S.up[id]);
      const hittable = S.up[id] || (p.kind === KIND.STOCK && i === n - 1);
      el.classList.toggle('nohit', !hittable);
      if (stagger) el.style.transitionDelay = (Math.min(40, order + i) * 12) + 'ms';
    }
    order++;
  }
  if (stagger) {
    setTimeout(() => { for (const el of els) if (el) el.style.transitionDelay = ''; }, 900);
  }
  updateSelectionVisual();
  updateFocusVisual();
  updateHud();
}

function updateHud() {
  if (!S) return;
  $('hudVariant').textContent = VARIANTS[S.variant].name(S.opts);
  $('hudSeed').textContent = 'Deal #' + S.seed + (S.ladderStage >= 0 ? ' · Gauntlet ' + (S.ladderStage + 1) : '');
  $('hudTime').textContent = fmtTime(S.timeMs / 1000);
  $('hudMoves').textContent = String(S.moves);
  $('hudScore').textContent = String(displayScore(S));
  const undoLimit = ladderUndoLimit();
  $('hudUndo').textContent = undoLimit === Infinity ? String(S.undos) : (S.undos + '/' + undoLimit);
  $('btnUndo').disabled = S.history.length === 0 || S.undos >= undoLimit || S.over;
  $('btnHint').disabled = S.over;
  const canAuto = !S.over && !autoQueue && !!planAuto(S);
  $('btnAuto').disabled = !canAuto;
  $('btnAuto').classList.toggle('on', canAuto);
}

function updateSelectionVisual() {
  for (const el of els) if (el) el.classList.remove('sel');
  for (const p of S.piles) if (p.slotEl) p.slotEl.classList.remove('target');
  if (!selection) return;
  for (const id of selection.ids) if (els[id]) els[id].classList.add('sel');
  for (const j of selection.targets) {
    const p = S.piles[j];
    if (p.slotEl) p.slotEl.classList.add('target');
    const t = topId(S, j);
    if (t >= 0 && els[t]) els[t].classList.add('sel');
  }
}

function updateFocusVisual() {
  for (const p of S.piles) if (p.slotEl) p.slotEl.classList.remove('focus');
  for (const el of els) if (el) el.classList.remove('kfocus');
  if (screen !== 'game' || focusIdx < 0 || focusIdx >= focusOrder.length) return;
  const pi = focusOrder[focusIdx];
  const p = S.piles[pi];
  if (p.slotEl) p.slotEl.classList.add('focus');
  if (p.cards.length) {
    const ci = clamp(focusCard < 0 ? p.cards.length - 1 : focusCard, 0, p.cards.length - 1);
    const id = p.cards[ci];
    if (els[id]) els[id].classList.add('kfocus');
  }
}

function buildFocusOrder() {
  focusOrder = S.tab.slice();
  if (S.stock >= 0) focusOrder.push(S.stock);
  if (S.waste >= 0) focusOrder.push(S.waste);
  focusOrder = focusOrder.concat(S.free, S.found);
  focusIdx = 0; focusCard = -1;
}

/* --------------------------------- toast -------------------------------- */

let toastTimer = 0;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1700);
}

/* ============================== GAME FLOW =============================== */

function ladderStageDef() { return S && S.ladderStage >= 0 ? LADDER[S.ladderStage] : null; }
function ladderUndoLimit() {
  const d = ladderStageDef();
  return d && d.goal.undo !== undefined ? d.goal.undo : Infinity;
}

function startGame(variant, opts, seed, stage) {
  S = newState(variant, opts, seed);
  S.ladderStage = (stage === undefined || stage === null) ? -1 : stage;
  selection = null; drag = null; autoQueue = null;
  cascade.active = false; cascade.items.length = 0;
  paused = false;
  screen = 'game';
  $('screenTitle').classList.add('hidden');
  $('screenGame').classList.remove('hidden');
  closeAllOverlays();
  buildCards();
  buildSlots();
  buildFocusOrder();
  // deal animation: start every card off-screen top, then fly in
  const startX = Math.round((boardEl.clientWidth || 900) * 0.5);
  for (const el of els) { if (el) el.style.transform = `translate3d(${startX}px, -200px, 0)`; }
  const gb = $('goalbar');
  const def = ladderStageDef();
  if (def) {
    gb.classList.remove('hidden');
    gb.innerHTML = `<span>&#127894; <b>Stage ${S.ladderStage + 1}: ${esc(def.n)}</b></span><span>${esc(def.d)}</span>` +
      `<span style="color:#c9b98f">Stretch: ${fmtTime(def.s.time)} &middot; ${def.s.moves} moves</span>`;
  } else gb.classList.add('hidden');
  requestAnimationFrame(() => render(!reducedMotion));
  if (!reducedMotion) {
    for (let i = 0; i < 8; i++) setTimeout(() => Sfx.deal(), i * 70);
  } else Sfx.deal();
  markStatPlayed();
  scheduleSave(true);
}

function markStatPlayed() {
  const k = VARIANTS[S.variant].key(S.opts);
  SAVE.stats[k].played++;
  SAVE.totals.played++;
  unlock('deal_veteran', Math.min(1, SAVE.totals.played / 25));
}

function restartDeal() {
  if (!S) return;
  const v = S.variant, o = S.opts, sd = S.seed, stg = S.ladderStage;
  countLoss(true);
  startGame(v, o, sd, stg < 0 ? null : stg);
  toast('Deal restarted');
}

function countLoss(silent) {
  if (!S || S.over || S.moves === 0) return;
  const k = VARIANTS[S.variant].key(S.opts);
  const st = SAVE.stats[k];
  st.losses++;
  st.streak = 0;
  st.timeSec += Math.floor(S.timeMs / 1000);
  S.over = true;
  if (!silent) Sfx.lose();
}

/* -------------------------------- moves --------------------------------- */

function performMove(from, ci, to, quiet) {
  pushHistory(S);
  const ev = doMove(S, from, ci, to);
  selection = null;
  if (!quiet) {
    if (ev.toFound) Sfx.found(); else Sfx.place();
    if (ev.flipped >= 0) setTimeout(() => Sfx.flip(), 90);
  }
  if (ev.collected.length) {
    Sfx.collect();
    burstConfetti(24, M.bw * 0.5, M.bh * 0.35);
    toast('Set complete! +100');
  }
  render();
  afterMove();
  return ev;
}

function afterMove() {
  if (SAVE.options.autoSafe && S.variant !== 'spider' && !autoQueue) autoSafePlay();
  if (rules(S).isWin(S)) { onWin(); return; }
  const def = ladderStageDef();
  if (def && def.goal.moves !== undefined && S.moves > def.goal.moves) { onFail('Move limit exceeded'); return; }
  if (!autoQueue && !hasAnyMove(S)) { onStuck(); return; }
  if (S.moves % 8 === 0) scheduleSave();
}

function autoSafePlay() {
  let did = false, guard = 0;
  while (guard++ < 30) {
    let moved = false;
    const sources = S.tab.concat(S.variant === 'klondike' ? [S.waste] : [], S.free);
    for (const pi of sources) {
      const c = S.piles[pi].cards;
      if (!c.length) continue;
      const ci = c.length - 1;
      const id = c[ci];
      if (!S.up[id]) continue;
      if (!safeToFound(S, id)) continue;
      for (const fj of S.found) {
        if (!rules(S).canDrop(S, [id], fj)) continue;
        pushHistory(S);
        doMove(S, pi, ci, fj);
        moved = true; did = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  if (did) { Sfx.found(); render(); }
}

function undo() {
  if (!S || !S.history.length) return;
  if (S.undos >= ladderUndoLimit()) { toast('No undos left on this stage'); Sfx.invalid(); return; }
  const snap = S.history.pop();
  restore(S, snap);
  S.undos++;
  S.over = false;
  selection = null;
  autoQueue = null;
  Sfx.undo();
  render();
  scheduleSave();
}

/* ------------------------------- outcomes ------------------------------- */

function onWin() {
  if (S.over) return;
  S.over = true; S.won = true;
  const seconds = Math.floor(S.timeMs / 1000);
  const def = ladderStageDef();
  if (def) {
    if (def.goal.time !== undefined && seconds > def.goal.time) { onFail('Time limit exceeded'); return; }
    if (def.goal.moves !== undefined && S.moves > def.goal.moves) { onFail('Move limit exceeded'); return; }
  }
  const k = VARIANTS[S.variant].key(S.opts);
  const st = SAVE.stats[k];
  const timeBonus = Math.max(0, 1000 - seconds * 2);
  const finalScore = displayScore(S) + timeBonus;
  const recs = [];
  st.wins++; st.streak++; st.timeSec += seconds;
  if (st.streak > st.bestStreak) { st.bestStreak = st.streak; recs.push('Longest streak'); }
  if (!st.bestTime || seconds < st.bestTime) { st.bestTime = seconds; recs.push('Fastest win'); }
  if (!st.bestMoves || S.moves < st.bestMoves) { st.bestMoves = S.moves; recs.push('Fewest moves'); }
  if (finalScore > st.bestScore) { st.bestScore = finalScore; recs.push('High score'); }
  SAVE.totals.wins++;

  let stars = 0;
  if (def) {
    stars = 1;
    if (seconds <= def.s.time) stars++;
    if (S.moves <= def.s.moves) stars++;
    if (stars > SAVE.ladder.stars[S.ladderStage]) SAVE.ladder.stars[S.ladderStage] = stars;
  }

  // achievements
  if (S.variant === 'klondike') unlock('klondike_win');
  if (S.variant === 'freecell') unlock('freecell_win');
  if (S.variant === 'spider') unlock('spider_win');
  if (S.variant === 'spider' && S.opts.suits === 4) unlock('spider_four');
  if (S.undos === 0) unlock('iron_will');
  if (seconds < 240) unlock('speed_demon');
  const kWin = SAVE.stats.klondike1.wins + SAVE.stats.klondike3.wins;
  const sWin = SAVE.stats.spider1.wins + SAVE.stats.spider2.wins + SAVE.stats.spider4.wins;
  if (kWin > 0 && sWin > 0 && SAVE.stats.freecell.wins > 0) unlock('suite_master');
  const streakMax = Math.max(...STAT_KEYS.map((x) => SAVE.stats[x].streak));
  unlock('streak_three', Math.min(1, streakMax / 3));
  const cleared = SAVE.ladder.stars.filter((x) => x > 0).length;
  unlock('gauntlet_champ', Math.min(1, cleared / 12));

  SAVE.current = null;
  scheduleSave(true);
  Sfx.win();
  startCascade();
  showResult(true, { seconds, timeBonus, finalScore, recs, stars, def });
}

function onFail(reason) {
  if (S.won) return;
  S.over = true;
  countLoss();
  SAVE.current = null;
  scheduleSave(true);
  showResult(false, { seconds: Math.floor(S.timeMs / 1000), reason, def: ladderStageDef() });
}

function onStuck() {
  if (S.over) return;
  onFail('No legal moves remain');
}

/* ------------------------------- cascade -------------------------------- */

function startCascade() {
  if (reducedMotion) { burstConfetti(70, M.bw * 0.5, M.bh * 0.4); return; }
  const src = [];
  const piles = S.variant === 'spider' ? S.done : S.found;
  for (const pi of piles) src.push(...S.piles[pi].cards.slice().reverse());
  cascade.active = true; cascade.items = []; cascade.src = src; cascade.next = 0; cascade.spawnAt = 0; cascade.done = false;
  burstConfetti(50, M.bw * 0.5, M.bh * 0.35);
}

function stepCascade(dt) {
  cascade.spawnAt -= dt;
  if (cascade.spawnAt <= 0 && cascade.next < cascade.src.length && cascade.items.length < 26) {
    const id = cascade.src[cascade.next++];
    const el = els[id];
    if (el) {
      el.style.transition = 'none';
      el.style.zIndex = String(4000 + cascade.next);
      cascade.items.push({
        id, x: pos[id].x, y: pos[id].y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.10 + Math.random() * 0.22),
        vy: -(0.05 + Math.random() * 0.12),
      });
    }
    cascade.spawnAt = 130;
  }
  const g = 0.0016;
  for (let i = cascade.items.length - 1; i >= 0; i--) {
    const it = cascade.items[i];
    it.vy += g * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (it.y + M.ch > M.bh) { it.y = M.bh - M.ch; it.vy = -it.vy * 0.76; if (Math.abs(it.vy) < 0.12) it.vy = -0.12 - Math.random() * 0.1; }
    const el = els[it.id];
    if (el) el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
    if (it.x < -M.cw * 1.4 || it.x > M.bw + M.cw * 1.4) {
      if (el) { el.style.opacity = '0'; }
      cascade.items.splice(i, 1);
    }
  }
  if (cascade.next >= cascade.src.length && cascade.items.length === 0) cascade.active = false;
}

function stopCascade() {
  cascade.active = false;
  cascade.items.length = 0;
  for (const el of els) if (el) { el.style.transition = ''; el.style.opacity = ''; }
  if (S) render();
}

/* ------------------------------- confetti ------------------------------- */

function confettiEl() {
  let e = confetti.find((c) => !c.on);
  if (!e) {
    if (confetti.length >= 90) return null;
    const d = document.createElement('div');
    d.className = 'confetti';
    fxLayer.appendChild(d);
    e = { el: d, on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, rot: 0, vr: 0 };
    confetti.push(e);
  }
  return e;
}
function burstConfetti(n, x, y) {
  if (reducedMotion) return;
  const cols = ['#ffd27f', '#7fd4ff', '#ff8fa3', '#9ce8b0', '#e0c8ff'];
  for (let i = 0; i < n; i++) {
    const c = confettiEl();
    if (!c) break;
    c.on = true;
    c.x = x + (Math.random() - 0.5) * 90;
    c.y = y + (Math.random() - 0.5) * 50;
    c.vx = (Math.random() - 0.5) * 0.7;
    c.vy = -0.25 - Math.random() * 0.5;
    c.life = 1400 + Math.random() * 900;
    c.rot = Math.random() * 360; c.vr = (Math.random() - 0.5) * 0.9;
    c.el.style.background = cols[(Math.random() * cols.length) | 0];
    c.el.style.opacity = '1';
  }
}
function stepConfetti(dt) {
  for (const c of confetti) {
    if (!c.on) continue;
    c.life -= dt;
    c.vy += 0.0013 * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    if (c.life <= 0 || c.y > M.bh + 30) { c.on = false; c.el.style.opacity = '0'; continue; }
    c.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) rotate(${c.rot.toFixed(0)}deg)`;
    if (c.life < 400) c.el.style.opacity = (c.life / 400).toFixed(2);
  }
}

/* -------------------------------- shake --------------------------------- */

function doShake(mag) {
  if (reducedMotion || (hubSettings && hubSettings.accessibility && hubSettings.accessibility.screenShake === false)) return;
  shake.t = 220; shake.mag = mag || 5;
}
function stepShake(dt) {
  if (shake.t <= 0) { if (boardEl.style.transform) boardEl.style.transform = ''; return; }
  shake.t -= dt;
  const k = Math.max(0, shake.t / 220) * shake.mag;
  boardEl.style.transform = `translate(${((Math.random() - 0.5) * k).toFixed(1)}px, ${((Math.random() - 0.5) * k).toFixed(1)}px)`;
  if (shake.t <= 0) boardEl.style.transform = '';
}

/* ================================ INPUT ================================= */

function boardPoint(e) {
  const r = boardEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function findCardLoc(id) {
  for (const p of S.piles) {
    const i = p.cards.indexOf(id);
    if (i >= 0) return { pi: p.i, ci: i };
  }
  return null;
}
function pileAtPoint(pt) {
  for (const p of S.piles) {
    if (p.kind === KIND.DONE && p.cards.length === 0 && p.i !== S.done[0]) continue;
    const r = p.rect;
    if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return p.i;
  }
  return -1;
}

function onPointerDown(e) {
  if (screen !== 'game' || !S) return;
  Sfx.init(); Sfx.resume();
  if (cascade.active) { stopCascade(); return; }
  if (paused || overlayOpen() || autoQueue) return;
  const cardEl = e.target.closest ? e.target.closest('.card') : null;
  const pt = boardPoint(e);
  if (cardEl) {
    const id = +cardEl.dataset.id;
    const loc = findCardLoc(id);
    if (!loc) return;
    const p = S.piles[loc.pi];
    if (p.kind === KIND.STOCK) { drag = { tapOnly: true, pi: loc.pi, ci: loc.ci, moved: false }; return; }
    if (!rules(S).canGrab(S, loc.pi, loc.ci)) {
      drag = { tapOnly: true, pi: loc.pi, ci: loc.ci, moved: false, bad: true };
      return;
    }
    const ids = p.cards.slice(loc.ci);
    drag = {
      pi: loc.pi, ci: loc.ci, ids, sx: pt.x, sy: pt.y, moved: false, tapOnly: false,
      origin: ids.map((cid) => ({ x: pos[cid].x, y: pos[cid].y })),
    };
  } else {
    const pi = pileAtPoint(pt);
    drag = { tapOnly: true, pi, ci: -1, moved: false, empty: true };
  }
}

function onPointerMove(e) {
  if (!drag || drag.tapOnly || !S) return;
  const pt = boardPoint(e);
  const dx = pt.x - drag.sx, dy = pt.y - drag.sy;
  if (!drag.moved) {
    if (Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.moved = true;
    Sfx.pick();
    drag.ids.forEach((cid, i) => {
      const el = els[cid];
      if (el) { el.classList.add('dragging'); el.style.zIndex = String(6000 + i); }
    });
    selection = null;
    updateSelectionVisual();
    drag.targets = legalTargets(S, drag.pi, drag.ci);
    for (const j of drag.targets) if (S.piles[j].slotEl) S.piles[j].slotEl.classList.add('target');
  }
  drag.ids.forEach((cid, i) => {
    const el = els[cid];
    if (el) el.style.transform = `translate3d(${(drag.origin[i].x + dx).toFixed(1)}px, ${(drag.origin[i].y + dy).toFixed(1)}px, 0)`;
  });
}

function onPointerUp(e) {
  if (!S || !drag) { drag = null; return; }
  const d = drag; drag = null;
  if (d.tapOnly) {
    if (d.empty) { handleEmptyTap(d.pi); return; }
    handleTap(d.pi, d.ci, d.bad);
    return;
  }
  if (!d.moved) { handleTap(d.pi, d.ci, false); return; }

  d.ids.forEach((cid) => { const el = els[cid]; if (el) el.classList.remove('dragging'); });
  for (const p of S.piles) if (p.slotEl) p.slotEl.classList.remove('target');

  const pt = boardPoint(e);
  const first = els[d.ids[0]];
  let rect = { x: pt.x - M.cw / 2, y: pt.y - M.ch / 2, w: M.cw, h: M.ch };
  if (first) {
    const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(first.style.transform || '');
    if (m) rect = { x: parseFloat(m[1]), y: parseFloat(m[2]), w: M.cw, h: M.ch };
  }
  let best = -1, bestArea = 0;
  for (const j of (d.targets || legalTargets(S, d.pi, d.ci))) {
    const r = S.piles[j].rect;
    const ox = Math.min(rect.x + rect.w, r.x + r.w) - Math.max(rect.x, r.x);
    const oy = Math.min(rect.y + rect.h, r.y + r.h) - Math.max(rect.y, r.y);
    if (ox > 0 && oy > 0) {
      const a = ox * oy;
      if (a > bestArea) { bestArea = a; best = j; }
    }
  }
  if (best >= 0) performMove(d.pi, d.ci, best);
  else {
    Sfx.invalid();
    render();
  }
}

function handleEmptyTap(pi) {
  if (pi < 0) { if (selection) { selection = null; updateSelectionVisual(); } return; }
  const p = S.piles[pi];
  if (p.kind === KIND.STOCK) { doStockTap(); return; }
  if (selection && selection.targets.includes(pi)) {
    performMove(selection.pi, selection.ci, pi);
    return;
  }
  if (selection) { selection = null; updateSelectionVisual(); }
}

function handleTap(pi, ci, bad) {
  if (pi < 0) return;
  const p = S.piles[pi];
  if (p.kind === KIND.STOCK) { doStockTap(); return; }

  if (selection) {
    if (selection.targets.includes(pi)) { performMove(selection.pi, selection.ci, pi); return; }
    if (selection.pi === pi && selection.ci === ci) { selection = null; updateSelectionVisual(); Sfx.pick(); return; }
    selection = null;
    updateSelectionVisual();
  }
  if (bad || !rules(S).canGrab(S, pi, ci)) {
    if (p.kind === KIND.TAB && ci < p.cards.length && !S.up[p.cards[ci]]) return;
    const el = els[p.cards[ci]];
    if (el) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 320); }
    Sfx.invalid(); doShake(4);
    if (S.variant === 'freecell') toast('Not enough free cells for that many cards');
    return;
  }
  const targets = legalTargets(S, pi, ci);
  if (!targets.length) {
    const el = els[p.cards[ci]];
    if (el) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 320); }
    Sfx.invalid(); doShake(3);
    return;
  }
  // 1) foundation is always the obvious play
  const found = targets.filter((j) => S.piles[j].kind === KIND.FOUND);
  if (found.length) { performMove(pi, ci, found[0]); return; }
  // 2) unambiguous tableau play
  let pref = targets.filter((j) => S.piles[j].kind === KIND.TAB && S.piles[j].cards.length > 0);
  if (S.variant === 'spider') {
    const same = pref.filter((j) => card(S, topId(S, j)).s === card(S, p.cards[ci]).s);
    if (same.length) pref = same;
  }
  if (pref.length === 1) { performMove(pi, ci, pref[0]); return; }
  if (!pref.length) {
    const empties = targets.filter((j) => S.piles[j].kind === KIND.TAB);
    if (empties.length === 1 && !(p.kind === KIND.TAB && ci === 0)) { performMove(pi, ci, empties[0]); return; }
    if (!empties.length && targets.length === 1) { performMove(pi, ci, targets[0]); return; }
  }
  // 3) ambiguous: select and light up the legal destinations
  selection = { pi, ci, ids: p.cards.slice(ci), targets };
  Sfx.pick();
  updateSelectionVisual();
  toast('Pick a destination');
}

function doStockTap() {
  pushHistory(S);
  const r = stockTap(S);
  if (r === null || r === undefined) {
    S.history.pop();
    Sfx.invalid();
    toast(S.variant === 'spider' ? 'Stock is empty' : 'Nothing left to turn');
    return;
  }
  if (r === 'blocked') {
    S.history.pop();
    Sfx.invalid(); doShake(4);
    toast('Every column must have a card before dealing');
    return;
  }
  selection = null;
  if (r === 'draw') Sfx.deal();
  else if (r === 'recycle') { Sfx.flip(); toast('Waste recycled' + (S.opts.draw === 1 ? ' (-20)' : '')); }
  else if (r === 'deal') { for (let i = 0; i < 4; i++) setTimeout(() => Sfx.deal(), i * 60); }
  render();
  afterMove();
}

/* ------------------------------ hint / auto ----------------------------- */

function doHint() {
  if (!S || S.over) return;
  const h = findHint(S);
  if (!h) { toast('No moves found — try the stock or undo'); Sfx.invalid(); return; }
  S.hints++;
  clearHintVisual();
  if (h.stock) {
    const p = S.piles[S.stock];
    if (p.slotEl) p.slotEl.classList.add('hintdst');
    const t = topId(S, S.stock);
    if (t >= 0 && els[t]) els[t].classList.add('hintsrc');
    toast('Deal from the stock');
  } else {
    const id = S.piles[h.from].cards[h.ci];
    if (els[id]) els[id].classList.add('hintsrc');
    const dp = S.piles[h.to];
    if (dp.slotEl) dp.slotEl.classList.add('hintdst');
    const t = topId(S, h.to);
    if (t >= 0 && els[t]) els[t].classList.add('hintsrc');
  }
  Sfx.pick();
  hintTimer = 2600;
}
function clearHintVisual() {
  for (const el of els) if (el) el.classList.remove('hintsrc');
  for (const p of S.piles) if (p.slotEl) p.slotEl.classList.remove('hintdst');
}

function doAuto() {
  if (!S || S.over || autoQueue) return;
  const plan = planAuto(S);
  if (!plan || !plan.length) { toast('Not solvable from here yet'); Sfx.invalid(); return; }
  selection = null;
  autoQueue = { moves: plan, i: 0, delay: 0 };
  toast('Auto-completing…');
}

function stepAuto(dt) {
  if (!autoQueue) return;
  autoQueue.delay -= dt;
  if (autoQueue.delay > 0) return;
  const mv = autoQueue.moves[autoQueue.i++];
  if (!mv) { autoQueue = null; updateHud(); return; }
  if (mv.stock) { pushHistory(S); stockTap(S); Sfx.deal(); }
  else { pushHistory(S); const ev = doMove(S, mv.from, mv.ci, mv.to); if (ev.toFound) Sfx.found(); else Sfx.place(); }
  render();
  autoQueue.delay = 85;
  if (autoQueue.i >= autoQueue.moves.length) {
    autoQueue = null;
    if (rules(S).isWin(S)) onWin();
  }
}

/* =============================== KEYBOARD =============================== */

function overlayOpen() {
  return ['ovNew', 'ovLadder', 'ovStats', 'ovHowTo', 'ovOptions', 'ovPause', 'ovResult', 'ovConfirm']
    .some((id) => !$(id).classList.contains('hidden'));
}
function closeAllOverlays() {
  for (const id of ['ovNew', 'ovLadder', 'ovStats', 'ovHowTo', 'ovOptions', 'ovPause', 'ovResult', 'ovConfirm']) $(id).classList.add('hidden');
}
function topOverlay() {
  const order = ['ovConfirm', 'ovResult', 'ovOptions', 'ovHowTo', 'ovStats', 'ovLadder', 'ovNew', 'ovPause'];
  return order.find((id) => !$(id).classList.contains('hidden')) || null;
}

function onKey(e) {
  const k = e.key;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    if (k === 'Escape') e.target.blur();
    if (k !== 'Enter') return;
  }
  Sfx.init();
  if (k === 'Escape') {
    e.preventDefault();
    const ov = topOverlay();
    if (ov) {
      if (ov === 'ovResult') { /* result stays until a choice */ if (screen === 'game') { closeAllOverlays(); showTitle(); } return; }
      if (ov === 'ovPause') { resumeGame(); return; }
      closeOverlayBack(ov);
      return;
    }
    if (cascade.active) { stopCascade(); return; }
    if (selection) { selection = null; updateSelectionVisual(); return; }
    if (screen === 'game') pauseGame();
    return;
  }
  if (overlayOpen()) {
    if (k === 'Enter') {
      const ov = topOverlay();
      if (ov === 'ovNew') { e.preventDefault(); $('btnNewStart').click(); }
      else if (ov === 'ovConfirm') { e.preventDefault(); $('btnConfirmYes').click(); }
    }
    return;
  }
  if (screen === 'title') {
    if (k === 'Enter' || k === ' ') { e.preventDefault(); ($('btnContinue').disabled ? $('btnFreePlay') : $('btnContinue')).click(); }
    return;
  }
  if (screen !== 'game' || !S) return;

  switch (k.toLowerCase()) {
    case 'p': e.preventDefault(); paused ? resumeGame() : pauseGame(); return;
    case 'u': e.preventDefault(); undo(); return;
    case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); } return;
    case 'h': e.preventDefault(); doHint(); return;
    case 'f': if (!e.ctrlKey) { e.preventDefault(); doAuto(); } return;
    case 'r': e.preventDefault(); askRestart(); return;
    case 'n': e.preventDefault(); openNewGame(); return;
    case 'f1': e.preventDefault(); openHowTo(); return;
  }
  if (k === 'F1') { e.preventDefault(); openHowTo(); return; }

  const left = (k === 'ArrowLeft' || k.toLowerCase() === 'a');
  const right = (k === 'ArrowRight' || k.toLowerCase() === 'd');
  const up = (k === 'ArrowUp' || k.toLowerCase() === 'w');
  const down = (k === 'ArrowDown' || k.toLowerCase() === 's');
  if (left || right || up || down) {
    e.preventDefault();
    if (cascade.active) { stopCascade(); return; }
    if (left) { focusIdx = (focusIdx - 1 + focusOrder.length) % focusOrder.length; focusCard = -1; }
    if (right) { focusIdx = (focusIdx + 1) % focusOrder.length; focusCard = -1; }
    const p = S.piles[focusOrder[focusIdx]];
    if (up || down) {
      const n = p.cards.length;
      if (n) {
        let ci = focusCard < 0 ? n - 1 : focusCard;
        ci = clamp(ci + (up ? -1 : 1), 0, n - 1);
        focusCard = ci;
      }
    }
    updateFocusVisual();
    return;
  }
  if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    if (cascade.active) { stopCascade(); return; }
    const pi = focusOrder[focusIdx];
    const p = S.piles[pi];
    if (selection && selection.targets.includes(pi)) { performMove(selection.pi, selection.ci, pi); return; }
    if (p.kind === KIND.STOCK) { doStockTap(); return; }
    if (!p.cards.length) { Sfx.invalid(); return; }
    const ci = clamp(focusCard < 0 ? p.cards.length - 1 : focusCard, 0, p.cards.length - 1);
    handleTap(pi, ci, false);
  }
}

/* ================================ SCREENS =============================== */

function showTitle() {
  screen = 'title';
  paused = false;
  closeAllOverlays();
  $('screenTitle').classList.remove('hidden');
  $('screenGame').classList.add('hidden');
  refreshTitle();
  scheduleSave(true);
}

function refreshTitle() {
  const has = !!SAVE.current;
  $('btnContinue').disabled = !has;
  $('continueLabel').textContent = has
    ? '(' + VARIANTS[SAVE.current.variant].name(SAVE.current.opts) + ')'
    : '(no game in progress)';
  const cleared = SAVE.ladder.stars.filter((x) => x > 0).length;
  $('ladderLabel').textContent = cleared === 0 ? '12 staged challenges' : cleared + '/12 stages cleared';
  const w = SAVE.totals.wins, p = SAVE.totals.played;
  const who = profileName ? profileName + ' · ' : '';
  $('titleFoot').textContent = p > 0
    ? `${who}${w} win${w === 1 ? '' : 's'} from ${p} deal${p === 1 ? '' : 's'} · offline · seeded deals`
    : `${who}offline · three classics, unlimited undo, seeded deals`;
}

function pauseGame() {
  if (screen !== 'game' || !S || S.over) return;
  paused = true;
  const k = VARIANTS[S.variant].key(S.opts);
  const st = SAVE.stats[k];
  $('pauseStats').innerHTML =
    `<div class="resline"><span>Game</span><b>${esc(VARIANTS[S.variant].name(S.opts))}</b></div>` +
    `<div class="resline"><span>Deal seed</span><b>#${S.seed}</b></div>` +
    `<div class="resline"><span>Time</span><b>${fmtTime(S.timeMs / 1000)}</b></div>` +
    `<div class="resline"><span>Moves / undos</span><b>${S.moves} / ${S.undos}</b></div>` +
    `<div class="resline"><span>Score</span><b>${displayScore(S)}</b></div>` +
    `<div class="resline"><span>Record here</span><b>${st.wins}W · ${st.losses}L · streak ${st.streak}</b></div>`;
  $('ovPause').classList.remove('hidden');
  scheduleSave(true);
}
function resumeGame() {
  paused = false;
  $('ovPause').classList.add('hidden');
  Sfx.resume();
}

function showResult(won, info) {
  const ic = $('resultIcon'), ti = $('resultTitle'), sb = $('resultSub'), bd = $('resultBody');
  const def = info.def;
  if (won) {
    ic.innerHTML = '&#127881;';
    ti.textContent = def ? 'Stage cleared!' : 'You win!';
    sb.textContent = VARIANTS[S.variant].name(S.opts) + ' · Deal #' + S.seed;
    const k = VARIANTS[S.variant].key(S.opts);
    const st = SAVE.stats[k];
    let html =
      `<div class="resline"><span>Time</span><b>${fmtTime(info.seconds)}</b></div>` +
      `<div class="resline"><span>Moves</span><b>${S.moves}</b></div>` +
      `<div class="resline"><span>Undos used</span><b>${S.undos}</b></div>` +
      `<div class="resline"><span>Score</span><b>${displayScore(S)}</b></div>` +
      `<div class="resline"><span>Time bonus</span><b>+${info.timeBonus}</b></div>` +
      `<div class="resline"><span>Final</span><b>${info.finalScore}</b></div>` +
      `<div class="resline"><span>Win streak</span><b>${st.streak}${st.streak >= st.bestStreak ? '<span class="badge new">BEST</span>' : ''}</b></div>`;
    if (def) {
      html += `<div class="resline"><span>Stage rating</span><b>${'★'.repeat(info.stars)}${'☆'.repeat(3 - info.stars)}</b></div>`;
    }
    if (info.recs.length) html += `<p style="color:#ffd27f;font-size:12px;margin-top:8px">New record: ${info.recs.join(' · ')}</p>`;
    bd.innerHTML = html;
    const nextStage = def && S.ladderStage + 1 < LADDER.length;
    $('btnResultNext').classList.toggle('hidden', !nextStage);
  } else {
    ic.innerHTML = '&#128128;';
    ti.textContent = 'Game over';
    sb.textContent = info.reason || 'No legal moves remain';
    const k = VARIANTS[S.variant].key(S.opts);
    const st = SAVE.stats[k];
    bd.innerHTML =
      `<div class="resline"><span>Game</span><b>${esc(VARIANTS[S.variant].name(S.opts))}</b></div>` +
      `<div class="resline"><span>Time</span><b>${fmtTime(info.seconds)}</b></div>` +
      `<div class="resline"><span>Moves</span><b>${S.moves}</b></div>` +
      `<div class="resline"><span>Record here</span><b>${st.wins}W · ${st.losses}L</b></div>` +
      `<p style="font-size:12px;color:#9fb9d0;margin-top:8px">Tip: undo is unlimited in Free Play — back up a few moves and take a different line.</p>`;
    $('btnResultNext').classList.add('hidden');
    Sfx.lose();
  }
  setTimeout(() => $('ovResult').classList.remove('hidden'), won && !reducedMotion ? 2200 : 250);
}

/* ------------------------------ achievements ---------------------------- */

const achQueue = [];
let achShowing = false;
function unlock(id, progress) {
  if (!ACH[id]) return;
  const prog = progress === undefined ? 1 : progress;
  const rec = SAVE.ach[id] || { p: 0, done: false };
  const wasDone = rec.done;
  if (wasDone) { SAVE.ach[id] = rec; return; }   // latch: never re-send a finished unlock
  rec.p = Math.max(rec.p, prog);
  if (rec.p >= 1) rec.done = true;
  SAVE.ach[id] = rec;
  if (empire) empire.unlockAchievement(id, prog).catch(() => {});
  if (!wasDone && rec.done) { achQueue.push(id); pumpAch(); }
  dirty = true;
}
function pumpAch() {
  if (achShowing || !achQueue.length) return;
  const id = achQueue.shift();
  const a = ACH[id];
  if (!a) return;
  achShowing = true;
  $('achTitle').textContent = '★ ' + a.t;
  $('achDesc').textContent = a.d;
  const pop = $('achPop');
  pop.classList.add('show');
  Sfx.ach();
  setTimeout(() => { pop.classList.remove('show'); achShowing = false; setTimeout(pumpAch, 300); }, 2600);
}

/* ================================ PANELS ================================ */

let pick = { variant: 'klondike', draw: 1, suits: 1 };

function openNewGame() {
  pick.variant = SAVE.lastPick.variant || 'klondike';
  pick.draw = SAVE.lastPick.draw || 1;
  pick.suits = SAVE.lastPick.suits || 1;
  $('newSeed').value = '';
  renderNewPanel();
  $('ovNew').classList.remove('hidden');
}
function renderNewPanel() {
  for (const b of $('segVariant').children) b.classList.toggle('on', b.dataset.v === pick.variant);
  const meta = VARIANTS[pick.variant];
  const seg = $('segOpt');
  seg.innerHTML = '';
  if (meta.optKey) {
    $('optHead').textContent = meta.optKey === 'draw' ? 'Draw Rule' : 'Suits';
    $('optHead').classList.remove('hidden');
    for (const ch of meta.choices) {
      const b = document.createElement('button');
      b.textContent = ch.l;
      b.dataset.val = String(ch.v);
      b.classList.toggle('on', pick[meta.optKey] === ch.v);
      b.addEventListener('click', () => { pick[meta.optKey] = ch.v; renderNewPanel(); Sfx.pick(); });
      seg.appendChild(b);
    }
    const cur = meta.choices.find((c) => c.v === pick[meta.optKey]);
    $('newDesc').textContent = cur ? cur.d : '';
  } else {
    $('optHead').classList.add('hidden');
    $('newDesc').textContent = 'All 52 cards face up from the start. Four free cells hold one card each — pure skill, almost every deal is winnable.';
  }
  const key = meta.key(pick);
  const st = SAVE.stats[key];
  $('newDesc').textContent += `  —  Record: ${st.wins}W / ${st.losses}L` + (st.bestTime ? `, best ${fmtTime(st.bestTime)}` : '');
}

function startFromPanel() {
  const raw = $('newSeed').value.trim();
  let seed;
  if (raw === '') seed = randSeed();
  else if (/^\d+$/.test(raw)) seed = parseInt(raw, 10) % 2147483647;
  else { let h = 2166136261; for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); } seed = (h >>> 0) % 1000000; }
  const opts = pick.variant === 'klondike' ? { draw: pick.draw } : pick.variant === 'spider' ? { suits: pick.suits } : {};
  SAVE.lastPick = { variant: pick.variant, draw: pick.draw, suits: pick.suits };
  if (S && !S.over && S.moves > 0 && screen === 'game') countLoss(true);
  startGame(pick.variant, opts, seed, null);
}

function openLadder() {
  const list = $('ladderList');
  list.innerHTML = '';
  const stars = SAVE.ladder.stars;
  const unlockedUpTo = stars.findIndex((x) => x === 0);
  const maxOpen = unlockedUpTo === -1 ? LADDER.length - 1 : unlockedUpTo;
  LADDER.forEach((d, i) => {
    const open = i <= maxOpen;
    const row = document.createElement('div');
    row.className = 'stagerow' + (open ? '' : ' lockedrow') + (stars[i] > 0 ? ' done' : '');
    const goal = [];
    if (d.goal.time !== undefined) goal.push('finish inside ' + fmtTime(d.goal.time));
    if (d.goal.moves !== undefined) goal.push('max ' + d.goal.moves + ' moves');
    if (d.goal.undo !== undefined) goal.push(d.goal.undo === 0 ? 'no undo' : 'max ' + d.goal.undo + ' undos');
    row.innerHTML =
      `<div class="stagenum">${i + 1}</div>` +
      `<div class="stageinfo"><div class="nm">${esc(d.n)} — ${esc(VARIANTS[d.v].name(d.o))}</div>` +
      `<div class="gl">${esc(d.d)}${goal.length ? ' · Rules: ' + esc(goal.join(', ')) : ''}</div></div>` +
      `<div class="stars">${open ? '★'.repeat(stars[i]) + '☆'.repeat(3 - stars[i]) : '\u{1F512}'}</div>`;
    if (open) row.addEventListener('click', () => {
      if (S && !S.over && S.moves > 0 && screen === 'game') countLoss(true);
      closeAllOverlays();
      startGame(d.v, d.o, randSeed(), i);
    });
    list.appendChild(row);
  });
  const cleared = stars.filter((x) => x > 0).length;
  const total = stars.reduce((a, b) => a + b, 0);
  $('ladderSub').textContent = `${cleared}/12 stages cleared · ${total}/36 stars · clear a stage to unlock the next.`;
  $('ovLadder').classList.remove('hidden');
}

function openStats() {
  let rows = '';
  let tw = 0, tl = 0, tt = 0;
  for (const k of STAT_KEYS) {
    const s = SAVE.stats[k];
    tw += s.wins; tl += s.losses; tt += s.timeSec;
    const rate = s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : 0;
    rows += `<tr><td>${STAT_LABEL[k]}</td><td>${s.wins}</td><td>${s.losses}</td><td>${rate}%</td>` +
      `<td>${s.streak}</td><td>${s.bestStreak}</td><td>${s.bestTime ? fmtTime(s.bestTime) : '—'}</td>` +
      `<td>${s.bestMoves || '—'}</td><td>${s.bestScore || '—'}</td></tr>`;
  }
  const trate = tw + tl > 0 ? Math.round((tw / (tw + tl)) * 100) : 0;
  $('statsBody').innerHTML =
    `<table class="stt"><thead><tr><th>Game</th><th>W</th><th>L</th><th>Rate</th><th>Streak</th><th>Best</th><th>Fastest</th><th>Fewest</th><th>Score</th></tr></thead><tbody>` +
    rows +
    `<tr class="tot"><td>Total</td><td>${tw}</td><td>${tl}</td><td>${trate}%</td><td colspan="5">${fmtTime(tt)} at the table</td></tr>` +
    `</tbody></table>`;
  let ach = '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  for (const [id, a] of Object.entries(ACH)) {
    const rec = SAVE.ach[id] || { p: 0, done: false };
    const pct = Math.round(Math.min(1, rec.p) * 100);
    ach += `<div style="flex:1 1 220px;padding:7px 9px;border-radius:7px;border:1px solid ${rec.done ? '#7a5a17' : '#26405a'};background:${rec.done ? 'rgba(80,60,10,0.35)' : 'rgba(16,28,42,0.7)'}">` +
      `<div style="font-size:12px;color:${rec.done ? '#ffd27f' : '#9fb9d0'}">${rec.done ? '★' : '☆'} ${esc(a.t)}</div>` +
      `<div style="font-size:11px;color:#7f9cb5">${esc(a.d)}${a.target && !rec.done ? ` (${pct}%)` : ''}</div></div>`;
  }
  $('achBody').innerHTML = ach + '</div>';
  $('ovStats').classList.remove('hidden');
}

const HOWTO = {
  controls: `
    <h3>Mouse &amp; touch</h3>
    <ul>
      <li><b>Drag</b> a card (or a valid run) onto a pile to move it.</li>
      <li><b>Click</b> a card for the smart move: it flies to a foundation if it can, otherwise to the only sensible column. If several columns work, the legal targets light up gold — click one.</li>
      <li>Click the <b>stock</b> (top-left pile) to turn cards. When it empties in Klondike, click it again to recycle.</li>
    </ul>
    <h3>Keyboard</h3>
    <ul>
      <li><span class="kbd">&#8592;</span><span class="kbd">&#8594;</span> / <span class="kbd">A</span><span class="kbd">D</span> move between piles &middot; <span class="kbd">&#8593;</span><span class="kbd">&#8595;</span> / <span class="kbd">W</span><span class="kbd">S</span> pick a card deeper in the pile</li>
      <li><span class="kbd">Space</span> or <span class="kbd">Enter</span> — play the focused card / turn the stock / drop on the focused pile</li>
      <li><span class="kbd">U</span> or <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> — undo &middot; <span class="kbd">H</span> — hint &middot; <span class="kbd">F</span> — finish (auto-complete)</li>
      <li><span class="kbd">R</span> — restart this deal &middot; <span class="kbd">N</span> — new deal &middot; <span class="kbd">Esc</span> or <span class="kbd">P</span> — pause &middot; <span class="kbd">F1</span> — this panel</li>
    </ul>
    <h3>Everything else</h3>
    <ul>
      <li><b>Undo</b> is unlimited in Free Play (Gauntlet stages may restrict it).</li>
      <li><b>Auto</b> lights up the moment the deal can be finished mechanically — press it and put your feet up.</li>
      <li><b>Seeds</b>: every deal has a number. Type it into the New Game panel to play the exact same deal again.</li>
    </ul>`,
  klondike: `
    <h3>Goal</h3><p>Build all four foundations up from Ace to King, one suit each.</p>
    <h3>Rules</h3>
    <ul>
      <li>Seven columns; only the bottom card of each starts face up.</li>
      <li>Build columns <b>down in alternating colours</b> (red 7 on black 8). Any face-up run in that order moves as a unit.</li>
      <li>Only a <b>King</b> may move to an empty column.</li>
      <li>Turn the stock 1 or 3 at a time; only the top waste card plays. The stock recycles for as long as you like.</li>
    </ul>
    <h3>Scoring</h3>
    <ul><li>+10 to a foundation &middot; +5 waste&rarr;column &middot; +5 for each card turned face up &middot; &minus;15 foundation&rarr;column &middot; &minus;20 per recycle in Draw 1. A time bonus is added when you win.</li></ul>`,
  spider: `
    <h3>Goal</h3><p>Two decks, ten columns. Build eight complete King&rarr;Ace runs of one suit; each finished run is removed from play.</p>
    <h3>Rules</h3>
    <ul>
      <li>Place any card on a card one rank higher, <b>regardless of suit</b> — but you can only pick up a run that is <b>same-suit</b> and in order.</li>
      <li>An empty column takes any card or run.</li>
      <li>Click the stock to deal one card to every column — but only when <b>no column is empty</b>. Five deals in total.</li>
      <li>Fewer suits means easier: start at 1 suit and work up.</li>
    </ul>
    <h3>Scoring</h3><ul><li>Start at 500, &minus;1 per move, +100 per completed run, plus a time bonus on the win.</li></ul>`,
  freecell: `
    <h3>Goal</h3><p>All 52 cards are face up from the first second. Build the four foundations Ace to King.</p>
    <h3>Rules</h3>
    <ul>
      <li>Build columns <b>down in alternating colours</b>.</li>
      <li>The four <b>free cells</b> each hold exactly one card.</li>
      <li>A multi-card move is really a series of single moves, so you can shift
          <b>(free cells + 1) &times; 2<sup>empty columns</sup></b> cards at once. Moving <i>into</i> an empty column halves that.</li>
      <li>Empty columns take any card. Nearly every deal is winnable — if you're stuck, undo.</li>
    </ul>
    <h3>Scoring</h3><ul><li>1000 base, &minus;2 per move and &minus;1 every 5 seconds, plus a time bonus on the win.</li></ul>`,
};
let howToTab = 'controls';
function openHowTo() {
  renderHowTo();
  $('ovHowTo').classList.remove('hidden');
}
function renderHowTo() {
  for (const b of $('howToTabs').children) b.classList.toggle('on', b.dataset.tab === howToTab);
  $('howToBody').innerHTML = HOWTO[howToTab];
}

function openOptions() {
  const o = SAVE.options;
  $('optSound').checked = !!o.sound;
  $('optVol').value = String(Math.round(o.vol * 100));
  $('optVolVal').textContent = Math.round(o.vol * 100) + '%';
  $('optAnim').value = o.anim;
  $('optSafe').checked = !!o.autoSafe;
  $('optLeft').checked = !!o.leftHand;
  for (const b of $('segBack').children) b.classList.toggle('on', (+b.dataset.b) === (o.back | 0));
  $('ovOptions').classList.remove('hidden');
}
function applyOptions() {
  const o = SAVE.options;
  Sfx.enabled = !!o.sound;
  Sfx.setVol(o.vol);
  const anim = o.anim === 'off' ? 0 : o.anim === 'fast' ? 120 : 200;
  document.documentElement.style.setProperty('--anim', anim + 'ms');
  reducedMotion = (o.anim === 'off') ||
    (!!hubSettings && !!hubSettings.accessibility && !!hubSettings.accessibility.reducedMotion) ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  if (S) {
    const backCls = 'b' + (o.back | 0);
    for (const el of els) {
      if (!el) continue;
      const b = el.querySelector('.cback');
      if (b) b.className = 'cback ' + backCls;
    }
    render();
  }
  dirty = true;
}

function confirmAsk(title, body, onYes) {
  $('confirmTitle').textContent = title;
  $('confirmBody').textContent = body;
  $('ovConfirm').classList.remove('hidden');
  confirmCb = onYes;
}
let confirmCb = null;

function askRestart() {
  if (!S) return;
  if (S.moves === 0 || S.over) { restartDeal(); return; }
  confirmAsk('Restart this deal?', 'The deal is re-dealt from the same seed and the current game is recorded as a loss.', () => restartDeal());
}
function askQuit() {
  if (S && !S.over && S.moves > 0) {
    confirmAsk('Quit to menu?', 'This game is still in progress — quitting records it as a loss.', () => { countLoss(true); SAVE.current = null; showTitle(); });
  } else { SAVE.current = null; showTitle(); }
}

function closeOverlayBack(id) {
  $(id).classList.add('hidden');
  if (id === 'ovConfirm') confirmCb = null;
  if (screen === 'game' && !paused && id !== 'ovPause') { /* back to board */ }
}

/* ============================== PERSISTENCE ============================= */

function serializeGame() {
  if (!S || S.over) return null;
  return {
    variant: S.variant, opts: S.opts, seed: S.seed,
    piles: S.piles.map((p) => p.cards.slice()),
    up: S.up.map((b) => (b ? 1 : 0)),
    moves: S.moves, score: S.score, timeMs: S.timeMs, redeals: S.redeals, undos: S.undos,
    ladderStage: S.ladderStage,
    history: S.history.slice(-120).map((h) => ({ p: h.p, u: h.u.map((b) => (b ? 1 : 0)), m: h.m, sc: h.sc, rd: h.rd })),
  };
}
function deserializeGame(g) {
  try {
    const st = newState(g.variant, g.opts, g.seed);
    if (st.piles.length !== g.piles.length) return false;
    for (let i = 0; i < st.piles.length; i++) st.piles[i].cards = g.piles[i].slice();
    st.up = g.up.map((v) => !!v);
    st.moves = g.moves; st.score = g.score; st.timeMs = g.timeMs || 0;
    st.redeals = g.redeals || 0; st.undos = g.undos || 0;
    st.ladderStage = g.ladderStage === undefined ? -1 : g.ladderStage;
    st.history = (g.history || []).map((h) => ({ p: h.p, u: h.u.map((v) => !!v), m: h.m, sc: h.sc, rd: h.rd }));
    S = st;
    return true;
  } catch { return false; }
}

let saveTimer = 0;
function scheduleSave(now) {
  dirty = true;
  if (now) { flushSave(); return; }
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = 0; flushSave(); }, 2500);
}
function flushSave() {
  if (!empire) return;
  SAVE.current = screen === 'game' ? serializeGame() : SAVE.current;
  const label = SAVE.current
    ? VARIANTS[SAVE.current.variant].name(SAVE.current.opts) + ' · deal #' + SAVE.current.seed
    : 'No game in progress';
  const cleared = SAVE.ladder.stars.filter((x) => x > 0).length;
  empire.saveState('auto', SAVE, {
    label,
    playtimeSec: sessionSec,
    progress: cleared / LADDER.length,
    mode: SAVE.current ? SAVE.current.variant : 'menu',
    seed: SAVE.current ? SAVE.current.seed : 0,
  }).catch(() => {});
  empire.setContinuePoint('auto', label).catch(() => {});
  dirty = false;
}

function healSave(s) {
  const d = defaultSave();
  if (!s || typeof s !== 'object') return d;
  const out = Object.assign(d, s);
  out.stats = Object.assign(d.stats, s.stats || {});
  for (const k of STAT_KEYS) out.stats[k] = Object.assign(blankStat(), out.stats[k] || {});
  out.options = Object.assign(d.options, s.options || {});
  out.ladder = { stars: Array.isArray(s.ladder && s.ladder.stars) ? s.ladder.stars.slice(0, 12) : d.ladder.stars };
  while (out.ladder.stars.length < 12) out.ladder.stars.push(0);
  out.ach = s.ach || {};
  out.totals = Object.assign(d.totals, s.totals || {});
  out.lastPick = Object.assign(d.lastPick, s.lastPick || {});
  return out;
}

/* ================================= LOOP ================================= */

let rafId = 0, lastT = 0, acc = 0;
const STEP = 1000 / 60;

function tick(dt) {
  if (screen === 'game' && S && !paused && !S.over && !overlayOpen()) {
    S.timeMs += dt;
    const def = ladderStageDef();
    if (def && def.goal.time !== undefined && S.timeMs / 1000 > def.goal.time) { onFail('Time limit exceeded'); }
  }
  if (autoQueue && !paused && !overlayOpen()) stepAuto(dt);
  if (cascade.active) stepCascade(dt);
  stepConfetti(dt);
  stepShake(dt);
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0 && S) clearHintVisual(); }
}

let hudAcc = 0;
function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!lastT) lastT = now;
  let dt = now - lastT;
  lastT = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 6) { acc -= STEP; tick(STEP); steps++; }
  if (acc > STEP * 6) acc = 0;

  hudAcc += dt;
  if (hudAcc >= 250) {
    hudAcc = 0;
    if (screen === 'game' && S) {
      $('hudTime').textContent = fmtTime(S.timeMs / 1000);
      $('hudMoves').textContent = String(S.moves);
      $('hudScore').textContent = String(displayScore(S));
    }
  }
  if (!document.hidden) {
    playSecAcc += dt / 1000; sessionSec += dt / 1000;
    if (playSecAcc >= 30) {
      flushPlaytime();
      if (dirty) flushSave();
    }
  }
}

function flushPlaytime() {
  const n = Math.floor(playSecAcc);
  if (n <= 0) return;
  playSecAcc -= n;
  if (empire) empire.reportPlaytime(n).catch(() => {});
}

/* ================================= WIRING =============================== */

function wire() {
  // title
  $('btnContinue').addEventListener('click', () => {
    if (!SAVE.current) return;
    if (deserializeGame(SAVE.current)) {
      screen = 'game'; paused = false;
      $('screenTitle').classList.add('hidden');
      $('screenGame').classList.remove('hidden');
      selection = null; autoQueue = null; cascade.active = false;
      buildCards(); buildSlots(); buildFocusOrder();
      const def = ladderStageDef();
      const gb = $('goalbar');
      if (def) {
        gb.classList.remove('hidden');
        gb.innerHTML = `<span>&#127894; <b>Stage ${S.ladderStage + 1}: ${esc(def.n)}</b></span><span>${esc(def.d)}</span>` +
          `<span style="color:#c9b98f">Stretch: ${fmtTime(def.s.time)} &middot; ${def.s.moves} moves</span>`;
      } else gb.classList.add('hidden');
      render();
      toast('Resumed');
    } else {
      SAVE.current = null;
      refreshTitle();
      toast('That save could not be restored');
    }
  });
  $('btnFreePlay').addEventListener('click', openNewGame);
  $('btnLadder').addEventListener('click', openLadder);
  $('btnStats').addEventListener('click', openStats);
  $('btnHowTo').addEventListener('click', openHowTo);
  $('btnOptions').addEventListener('click', openOptions);

  // new game panel
  for (const b of $('segVariant').children) {
    b.addEventListener('click', () => { pick.variant = b.dataset.v; renderNewPanel(); Sfx.pick(); });
  }
  $('btnSeedRandom').addEventListener('click', () => { $('newSeed').value = String(randSeed()); });
  $('btnNewStart').addEventListener('click', () => { $('ovNew').classList.add('hidden'); startFromPanel(); });
  $('btnNewCancel').addEventListener('click', () => { $('ovNew').classList.add('hidden'); });

  // panels close
  $('btnLadderClose').addEventListener('click', () => $('ovLadder').classList.add('hidden'));
  $('btnStatsClose').addEventListener('click', () => $('ovStats').classList.add('hidden'));
  $('btnHowToClose').addEventListener('click', () => $('ovHowTo').classList.add('hidden'));
  $('btnOptionsClose').addEventListener('click', () => { $('ovOptions').classList.add('hidden'); scheduleSave(true); });
  $('btnStatsReset').addEventListener('click', () => {
    confirmAsk('Reset every statistic?', 'Win/loss records, streaks and Gauntlet stars are wiped. Achievements already earned stay earned.', () => {
      for (const k of STAT_KEYS) SAVE.stats[k] = blankStat();
      SAVE.ladder.stars = LADDER.map(() => 0);
      SAVE.totals = { wins: 0, played: 0 };
      scheduleSave(true);
      openStats();
      toast('Statistics reset');
    });
  });
  for (const b of $('howToTabs').children) {
    b.addEventListener('click', () => { howToTab = b.dataset.tab; renderHowTo(); Sfx.pick(); });
  }

  // options
  $('optSound').addEventListener('change', (e) => { SAVE.options.sound = e.target.checked; applyOptions(); if (e.target.checked) Sfx.place(); });
  $('optVol').addEventListener('input', (e) => {
    SAVE.options.vol = (+e.target.value) / 100;
    $('optVolVal').textContent = e.target.value + '%';
    applyOptions();
  });
  $('optVol').addEventListener('change', () => { Sfx.place(); scheduleSave(); });
  $('optAnim').addEventListener('change', (e) => { SAVE.options.anim = e.target.value; applyOptions(); scheduleSave(); });
  $('optSafe').addEventListener('change', (e) => { SAVE.options.autoSafe = e.target.checked; scheduleSave(); });
  $('optLeft').addEventListener('change', (e) => { SAVE.options.leftHand = e.target.checked; if (S) render(); scheduleSave(); });
  for (const b of $('segBack').children) {
    b.addEventListener('click', () => {
      SAVE.options.back = +b.dataset.b;
      for (const o of $('segBack').children) o.classList.toggle('on', o === b);
      applyOptions(); scheduleSave(); Sfx.flip();
    });
  }

  // HUD
  $('btnUndo').addEventListener('click', undo);
  $('btnHint').addEventListener('click', doHint);
  $('btnAuto').addEventListener('click', doAuto);
  $('btnRestartTop').addEventListener('click', askRestart);
  $('btnRules').addEventListener('click', openHowTo);
  $('btnPause').addEventListener('click', () => (paused ? resumeGame() : pauseGame()));

  // pause menu
  $('btnResume').addEventListener('click', resumeGame);
  $('btnPauseRestart').addEventListener('click', () => { $('ovPause').classList.add('hidden'); paused = false; askRestart(); });
  $('btnPauseNewDeal').addEventListener('click', () => { $('ovPause').classList.add('hidden'); paused = false; openNewGame(); });
  $('btnPauseHowTo').addEventListener('click', openHowTo);
  $('btnPauseOptions').addEventListener('click', openOptions);
  $('btnPauseMenu').addEventListener('click', () => { $('ovPause').classList.add('hidden'); paused = false; askQuit(); });

  // result
  $('btnResultAgain').addEventListener('click', () => {
    $('ovResult').classList.add('hidden'); stopCascade();
    startGame(S.variant, S.opts, S.seed, S.ladderStage < 0 ? null : S.ladderStage);
  });
  $('btnResultNew').addEventListener('click', () => {
    $('ovResult').classList.add('hidden'); stopCascade();
    if (S.ladderStage >= 0) startGame(S.variant, S.opts, randSeed(), S.ladderStage);
    else openNewGame();
  });
  $('btnResultNext').addEventListener('click', () => {
    const nxt = S.ladderStage + 1;
    $('ovResult').classList.add('hidden'); stopCascade();
    if (nxt < LADDER.length) startGame(LADDER[nxt].v, LADDER[nxt].o, randSeed(), nxt);
    else showTitle();
  });
  $('btnResultMenu').addEventListener('click', () => { $('ovResult').classList.add('hidden'); stopCascade(); SAVE.current = null; showTitle(); });

  // confirm
  $('btnConfirmYes').addEventListener('click', () => { const cb = confirmCb; confirmCb = null; $('ovConfirm').classList.add('hidden'); if (cb) cb(); });
  $('btnConfirmNo').addEventListener('click', () => { confirmCb = null; $('ovConfirm').classList.add('hidden'); });

  // board input
  boardEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', () => { if (drag && !drag.tapOnly) { drag.ids.forEach((c) => els[c] && els[c].classList.remove('dragging')); drag = null; render(); } });
  boardEl.addEventListener('dblclick', (e) => {
    const cardEl = e.target.closest ? e.target.closest('.card') : null;
    if (!cardEl || !S || paused || overlayOpen()) return;
    const loc = findCardLoc(+cardEl.dataset.id);
    if (!loc) return;
    const targets = legalTargets(S, loc.pi, loc.ci).filter((j) => S.piles[j].kind === KIND.FOUND);
    if (targets.length) performMove(loc.pi, loc.ci, targets[0]);
  });
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { if (S) render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (screen === 'game' && !paused && S && !S.over) pauseGame();
      flushPlaytime();
      flushSave();
    } else { lastT = 0; }
  });
  window.addEventListener('pagehide', () => {
    flushPlaytime();
    flushSave();
  });
  window.addEventListener('blur', () => { if (screen === 'game' && !paused && S && !S.over && !overlayOpen()) pauseGame(); });
}

/* ================================== BOOT ================================= */

async function boot() {
  wire();
  empire = new EmpireClient({
    gameId: 'solitaire-suite',
    saveVersion: 1,
    onPause: () => { if (screen === 'game') pauseGame(); },
    onResume: () => { if (screen === 'game' && paused) resumeGame(); },
    onSettings: (s) => { hubSettings = s; applyOptions(); },
  });
  try {
    const init = await empire.connect();
    hubSettings = (init && init.settings) || null;
  } catch { hubSettings = null; }
  try {
    if (!hubSettings) hubSettings = await empire.getSettings();
  } catch { hubSettings = null; }
  try {
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) SAVE = healSave(rec.blob);
  } catch { SAVE = defaultSave(); }

  if (hubSettings && hubSettings.audio) {
    const a = hubSettings.audio;
    if (a.muted) SAVE.options.sound = false;
    if (typeof a.sfx === 'number' && typeof a.master === 'number') SAVE.options.vol = clamp(a.sfx * a.master, 0, 1);
  }
  applyOptions();

  try {
    const prof = await empire.getProfile();
    if (prof && prof.name) profileName = String(prof.name);
  } catch { /* ignore */ }

  showTitle();
  rafId = requestAnimationFrame(frame);
}

boot();
