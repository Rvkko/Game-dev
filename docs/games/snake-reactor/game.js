/**
 * SNAKE REACTOR — canvas2d arcade snake with three reactor modes.
 * Part of Gaming Empire. 100% offline: no fetch, no CDN, procedural art + WebAudio.
 */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
mountAdventureKit({gameId:'snake-reactor',statusKey:'__snakeReactorAssetStatus',accent:0x42c775,getState:()=>({active:screen==='game',motion:Math.min(1,(run?.score||0)/1000),danger:0})});
import { COLS, ROWS, CELLS, parseLayout, layoutsForMode } from './layouts.js';
import { Sfx } from './audio.js';

// =============================================================== constants ===

const GAME_ID = 'snake-reactor';
const SAVE_VERSION = 1;

const BASE_STEP = 148;        // ms between ticks at level 1
const STEP_PER_LEVEL = 6;     // ms shaved per level
const MIN_STEP = 58;          // hard speed ceiling
const FOOD_PER_LEVEL = 6;
const SECTOR_SIZE = 8;        // fuel cells per sector (maze / portal)
const START_LEN = 5;
const GROW_PER_FOOD = 3;

const COMBO_BASE_MS = 3400;
const COMBO_MIN_MS = 1500;
const MAX_MULT = 5;

const SLOWMO_MS = 7000;
const MAGNET_MS = 9000;
const SLOWMO_FACTOR = 1.75;
const BOOST_FACTOR = 0.55;

const PU_MIN_MS = 6500;
const PU_MAX_MS = 12500;
const PU_TTL_MS = 11000;
const PU_TTL_SURGE = 7000;
const PU_MAX_ON_BOARD = 2;

const FX_STEP = 16.6667;
const CAP = CELLS;

// up, right, down, left
const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

const MODE_INFO = {
  classic: { label: 'CLASSIC', wrap: false },
  maze: { label: 'MAZE', wrap: false },
  portal: { label: 'PORTAL', wrap: true },
};

const PU_DEFS = {
  slowmo: { glyph: '⏳', color: '#7bd0ff', label: 'SLOW-MO', weight: 3 },
  shrink: { glyph: '✂', color: '#7dffa8', label: 'SHRINK', weight: 3 },
  magnet: { glyph: '🧲', color: '#ff9b3f', label: 'MAGNET', weight: 3 },
  surge: { glyph: '★', color: '#ffcf5c', label: 'SURGE', weight: 2 },
};

const ACH_TITLES = {
  first_cell: 'Cold Start',
  combo_master: 'Chain Reaction',
  score_2500: 'Critical Mass',
  length_60: 'Long Coil',
  maze_runner: 'Bulkhead Runner',
  portal_hopper: 'Fold Space',
  triple_charge: 'Triple Charge',
  reactor_overload: 'Reactor Overload',
  purist: 'Unassisted',
  grand_total: 'Fuel Baron',
};

// ==================================================================== DOM ====

const $ = (id) => document.getElementById(id);

const stage = $('stage');
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });

const el = {
  hud: $('hud'),
  score: $('hudScore'), best: $('hudBest'), level: $('hudLevel'), len: $('hudLen'), mode: $('hudMode'),
  comboMult: $('comboMult'), comboFill: $('comboFill'),
  pauseBtn: $('pauseBtn'), chipRow: $('chipRow'), toastWrap: $('toastWrap'), hintBar: $('hintBar'),
  touchPad: $('touchPad'),
  shiftBanner: $('shiftBanner'), shiftText: $('shiftText'), shiftSub: $('shiftSub'), shiftHint: $('shiftHint'),
  menu: $('menuScreen'), howto: $('howtoScreen'), settings: $('settingsScreen'),
  pause: $('pauseScreen'), result: $('resultScreen'),
  bestClassic: $('bestClassic'), bestMaze: $('bestMaze'), bestPortal: $('bestPortal'),
  menuTotalFood: $('menuTotalFood'), menuRuns: $('menuRuns'), menuLink: $('menuLink'),
  btnPlayLast: $('btnPlayLast'),
  volSlider: $('volSlider'), volVal: $('volVal'), muteChk: $('muteChk'), humChk: $('humChk'),
  reduceChk: $('reduceChk'), gridChk: $('gridChk'), dpadChk: $('dpadChk'),
  pauseSub: $('pauseSub'),
  resTitle: $('resTitle'), resSub: $('resSub'), resNewBest: $('resNewBest'),
  resScore: $('resScore'), resBest: $('resBest'), resFood: $('resFood'), resLen: $('resLen'),
  resCombo: $('resCombo'), resLevel: $('resLevel'), resSectors: $('resSectors'), resTime: $('resTime'),
};

// ================================================================== state ====

const sfx = new Sfx();

const defaultSave = () => ({
  v: SAVE_VERSION,
  best: { classic: 0, maze: 0, portal: 0 },
  bestLen: { classic: 0, maze: 0, portal: 0 },
  totals: { foods: 0, runs: 0, deaths: 0, powerups: 0, sectors: 0, score: 0 },
  ach: {},
  settings: { volume: 0.65, muted: false, hum: true, reduced: false, grid: true, dpad: false },
  lastMode: 'classic',
});

let save = defaultSave();
let saveLoaded = false;

const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** screen: menu | howto | settings | playing | paused | shift | dead */
let screen = 'menu';
let returnScreen = 'menu';   // where howto/settings came from
let pausedFrom = 'playing';

// board
let board = parseLayout(layoutsForMode('classic')[0]);
let layoutList = layoutsForMode('classic');
let layoutIndex = 0;
const occ = new Uint8Array(CELLS);      // 0 empty, 1 wall, 2 snake
const body = new Int32Array(CAP);
let headPtr = 0;

const run = {
  mode: 'classic', wrap: false,
  len: 0, dir: 1, grow: 0,
  queue: [],
  score: 0, foods: 0, sectorFoods: 0, sectors: 0, level: 1,
  comboCount: 0, comboMs: 0, bestCombo: 1,
  portalJumps: 0, puCount: 0, puTypes: new Set(),
  food: -1, magnetTick: 0,
  boost: false,
  timeMs: 0,
  warp: false,
  deathReason: '',
  alive: false,
};

const effects = { slowmo: 0, magnet: 0 };
let pickups = [];              // {type, cell, ttl, born}
let puTimer = PU_MIN_MS;
let shiftMs = 0;
let shakeMs = 0, shakeMag = 0;
let flashMs = 0;
let comboPulse = 0;

// canvas metrics
let W = 900, H = 600, dpr = 1;
let cell = 20, ox = 0, oy = 0, boardW = 0, boardH = 0;
let bg = document.createElement('canvas');
let bgCtx = bg.getContext('2d');
let bgDirty = true;

// timing
let raf = 0, lastTs = 0, acc = 0, fxAcc = 0, animT = 0;
let playtimeCarry = 0;

// achievements sent
const achSent = new Map();
const achShown = new Set();

// ================================================================= empire ====

const empire = new EmpireClient({
  gameId: GAME_ID,
  saveVersion: SAVE_VERSION,
  onPause: () => { if (screen === 'playing' || screen === 'shift') doPause(true); },
  onResume: () => { if (screen === 'paused') doResume(); },
  onSettings: (s) => applyHubSettings(s),
});

function applyHubSettings(s) {
  if (!s || typeof s !== 'object') return;
  const vol = s.masterVolume ?? s.volume ?? s.sfxVolume;
  if (typeof vol === 'number') {
    save.settings.volume = Math.max(0, Math.min(1, vol > 1 ? vol / 100 : vol));
    sfx.setVolume(save.settings.volume);
  }
  if (typeof s.muted === 'boolean') { save.settings.muted = s.muted; sfx.setMuted(s.muted); }
  if (typeof s.reducedMotion === 'boolean') save.settings.reduced = s.reducedMotion;
  syncSettingsUI();
}

async function bootEmpire() {
  let init = null;
  try { init = await empire.connect(); } catch { init = null; }
  el.menuLink.textContent = empire.standalone ? 'STANDALONE' : 'HUB LINKED';
  try {
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) mergeSave(rec.blob);
  } catch { /* fresh profile or version mismatch */ }
  saveLoaded = true;
  if (init && init.settings) applyHubSettings(init.settings);
  else { try { applyHubSettings(await empire.getSettings()); } catch { /* none */ } }
  for (const id in save.ach) {
    achSent.set(id, save.ach[id]);
    if (save.ach[id] >= 1) achShown.add(id);
  }
  applyLocalSettings();
  syncSettingsUI();
  refreshMenu();
}

function mergeSave(blob) {
  const d = defaultSave();
  save = {
    v: SAVE_VERSION,
    best: Object.assign(d.best, blob.best || {}),
    bestLen: Object.assign(d.bestLen, blob.bestLen || {}),
    totals: Object.assign(d.totals, blob.totals || {}),
    ach: Object.assign({}, blob.ach || {}),
    settings: Object.assign(d.settings, blob.settings || {}),
    lastMode: MODE_INFO[blob.lastMode] ? blob.lastMode : 'classic',
  };
}

let saveQueued = false;
function persist(label) {
  if (!saveLoaded) return;
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    const meta = {
      label: label || 'Snake Reactor',
      mode: save.lastMode,
      progress: Math.min(1, (save.best[save.lastMode] || 0) / 5000),
      playtimeSec: Math.round(playSecTotal),
    };
    empire.saveState('auto', save, meta).catch(() => {});
  }, 60);
}

let playSecTotal = 0;
function tickPlaytime(dtMs) {
  playtimeCarry += dtMs / 1000;
  playSecTotal += dtMs / 1000;
  if (playtimeCarry >= 30) {
    const whole = Math.floor(playtimeCarry);
    playtimeCarry -= whole;
    empire.reportPlaytime(whole).catch(() => {});
  }
}
function flushPlaytime() {
  const whole = Math.floor(playtimeCarry);
  if (whole > 0) {
    playtimeCarry -= whole;
    empire.reportPlaytime(whole).catch(() => {});
  }
}

function ach(id, progress = 1) {
  if (!ACH_TITLES[id]) return;
  const p = Math.max(0, Math.min(1, progress));
  const prev = achSent.has(id) ? achSent.get(id) : -1;
  if (p <= prev) return;
  if (p < 1 && p - prev < 0.05) return;
  achSent.set(id, p);
  save.ach[id] = Math.max(save.ach[id] || 0, p);
  empire.unlockAchievement(id, p).catch(() => {});
  if (p >= 1 && !achShown.has(id)) {
    achShown.add(id);
    toast('🏆 ' + ACH_TITLES[id], 'good');
    sfx.surge();
  }
}

// ================================================================== helpers ==

const cx = (i) => i % COLS;
const cy = (i) => (i / COLS) | 0;
const seg = (k) => body[(headPtr + k) % CAP];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function comboWindow() {
  return Math.max(COMBO_MIN_MS, COMBO_BASE_MS - (run.level - 1) * 130);
}
function comboMult() {
  if (run.comboCount <= 1) return 1;
  return Math.min(MAX_MULT, 1 + (run.comboCount - 1) * 0.5);
}
function stepMs() {
  let s = clamp(BASE_STEP - (run.level - 1) * STEP_PER_LEVEL, MIN_STEP, BASE_STEP);
  if (effects.slowmo > 0) s *= SLOWMO_FACTOR;
  if (run.boost) s *= BOOST_FACTOR;
  return Math.max(34, s);
}
function reducedMotion() { return save.settings.reduced || prefersReduced; }

function fmtTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ================================================================ particles ==

const P_MAX = 420;
const pX = new Float32Array(P_MAX), pY = new Float32Array(P_MAX);
const pVX = new Float32Array(P_MAX), pVY = new Float32Array(P_MAX);
const pLife = new Float32Array(P_MAX), pMax = new Float32Array(P_MAX);
const pSize = new Float32Array(P_MAX), pDrag = new Float32Array(P_MAX);
const pCol = new Array(P_MAX).fill('#fff');
const pAlive = new Uint8Array(P_MAX);
let pCursor = 0;

function emit(x, y, vx, vy, life, size, col, drag) {
  for (let n = 0; n < P_MAX; n++) {
    const i = (pCursor + n) % P_MAX;
    if (!pAlive[i]) {
      pCursor = (i + 1) % P_MAX;
      pAlive[i] = 1;
      pX[i] = x; pY[i] = y; pVX[i] = vx; pVY[i] = vy;
      pLife[i] = life; pMax[i] = life; pSize[i] = size; pCol[i] = col;
      pDrag[i] = drag === undefined ? 0.92 : drag;
      return;
    }
  }
}

function burst(cellIdx, color, count, power) {
  const n = reducedMotion() ? Math.ceil(count / 3) : count;
  const x = ox + (cx(cellIdx) + 0.5) * cell;
  const y = oy + (cy(cellIdx) + 0.5) * cell;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.4 + Math.random()) * power * cell * 0.05;
    emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 380 + Math.random() * 380,
      cell * (0.09 + Math.random() * 0.14), color, 0.9);
  }
}

function updateParticles(dt) {
  const f = dt / FX_STEP;
  for (let i = 0; i < P_MAX; i++) {
    if (!pAlive[i]) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pAlive[i] = 0; continue; }
    pX[i] += pVX[i] * f;
    pY[i] += pVY[i] * f;
    const d = Math.pow(pDrag[i], f);
    pVX[i] *= d; pVY[i] *= d;
  }
}

function clearParticles() { pAlive.fill(0); }

// ==================================================================== board ==

function setLayout(idx) {
  layoutIndex = ((idx % layoutList.length) + layoutList.length) % layoutList.length;
  board = parseLayout(layoutList[layoutIndex]);
  occ.fill(0);
  for (let i = 0; i < CELLS; i++) if (board.walls[i]) occ[i] = 1;
  bgDirty = true;
}

/** Lay the snake out along a legal path of free cells. Returns achieved length. */
function placeSnake(desiredLen) {
  for (let i = 0; i < CELLS; i++) occ[i] = board.walls[i] ? 1 : 0;

  // pick a roomy start near the middle
  let start = -1, bestScore = -1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (occ[i]) continue;
      let deg = 0;
      for (let d = 0; d < 4; d++) { const n = neighbour(i, d); if (n >= 0 && !occ[n]) deg++; }
      if (deg < 2) continue;
      const dist = Math.abs(c - COLS / 2) / COLS + Math.abs(r - ROWS / 2) / ROWS;
      const sc = deg * 2 - dist * 3 + Math.random() * 0.6;
      if (sc > bestScore) { bestScore = sc; start = i; }
    }
  }
  if (start < 0) start = firstFreeCell();

  const path = [start];
  const used = new Uint8Array(CELLS);
  used[start] = 1;
  let travelDir = -1;
  while (path.length < desiredLen) {
    const cur = path[path.length - 1];
    let pick = -1, pickDir = -1, pickScore = -1;
    for (let k = 0; k < 4; k++) {
      const d = travelDir >= 0 ? (travelDir + k) % 4 : k;
      const n = neighbour(cur, d);
      if (n < 0 || occ[n] || used[n] || board.portal[n] >= 0) continue;
      let open = 0;
      for (let j = 0; j < 4; j++) { const m = neighbour(n, j); if (m >= 0 && !occ[m] && !used[m]) open++; }
      const sc = open * 2 + (d === travelDir ? 3 : 0) + Math.random();
      if (sc > pickScore) { pickScore = sc; pick = n; pickDir = d; }
    }
    if (pick < 0) break;
    path.push(pick);
    travelDir = pickDir;
    used[pick] = 1;
  }

  headPtr = 0;
  for (let i = 0; i < path.length; i++) { body[i] = path[i]; occ[path[i]] = 2; }
  run.len = path.length;
  run.grow = 0;
  run.warp = true;

  // choose a facing that is not straight back into the body
  const neck = path.length > 1 ? path[1] : -1;
  let dir = -1;
  for (let d = 0; d < 4; d++) {
    const n = neighbour(path[0], d);
    if (n >= 0 && n !== neck && !occ[n]) { dir = d; break; }
  }
  if (dir < 0) {
    for (let d = 0; d < 4; d++) {
      const n = neighbour(path[0], d);
      if (n >= 0 && n !== neck && !board.walls[n]) { dir = d; break; }
    }
  }
  run.dir = dir < 0 ? 1 : dir;
  run.queue.length = 0;
  return run.len;
}

function firstFreeCell() {
  for (let i = 0; i < CELLS; i++) if (!occ[i]) return i;
  return 0;
}

/** Neighbour cell index in direction d, honouring wrap; -1 if off-board. */
function neighbour(i, d) {
  const dir = DIRS[d];
  let x = cx(i) + dir.x, y = cy(i) + dir.y;
  if (run.wrap) {
    if (x < 0) x = COLS - 1; else if (x >= COLS) x = 0;
    if (y < 0) y = ROWS - 1; else if (y >= ROWS) y = 0;
  } else if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return -1;
  return y * COLS + x;
}

function randomFreeCell(minDistFromHead) {
  const head = run.len > 0 ? seg(0) : -1;
  const hx = head >= 0 ? cx(head) : 0, hy = head >= 0 ? cy(head) : 0;
  let chosen = -1, seen = 0;
  for (let i = 0; i < CELLS; i++) {
    if (occ[i]) continue;
    if (i === run.food) continue;
    if (board.portal[i] >= 0) continue;
    let taken = false;
    for (let k = 0; k < pickups.length; k++) if (pickups[k].cell === i) { taken = true; break; }
    if (taken) continue;
    if (minDistFromHead && head >= 0) {
      const dd = Math.abs(cx(i) - hx) + Math.abs(cy(i) - hy);
      if (dd < minDistFromHead) continue;
    }
    seen++;
    if (Math.random() * seen < 1) chosen = i;
  }
  return chosen;
}

function spawnFood() {
  const c = randomFreeCell(0);
  run.food = c;
  if (c < 0) saturationWin();
}

function spawnPickup() {
  if (pickups.length >= PU_MAX_ON_BOARD) return;
  const c = randomFreeCell(4);
  if (c < 0) return;
  const bag = [];
  for (const k in PU_DEFS) for (let i = 0; i < PU_DEFS[k].weight; i++) bag.push(k);
  const type = bag[(Math.random() * bag.length) | 0];
  pickups.push({ type, cell: c, ttl: type === 'surge' ? PU_TTL_SURGE : PU_TTL_MS, born: animT });
}

// ================================================================= run flow ==

function startRun(mode) {
  if (!MODE_INFO[mode]) mode = 'classic';
  run.mode = mode;
  run.wrap = MODE_INFO[mode].wrap;
  layoutList = layoutsForMode(mode);
  layoutIndex = 0;
  setLayout(0);

  run.score = 0; run.foods = 0; run.sectorFoods = 0; run.sectors = 0; run.level = 1;
  run.comboCount = 0; run.comboMs = 0; run.bestCombo = 1;
  run.portalJumps = 0; run.puCount = 0; run.puTypes = new Set();
  run.boost = false; run.timeMs = 0; run.deathReason = ''; run.alive = true;
  run.queue.length = 0;
  effects.slowmo = 0; effects.magnet = 0;
  pickups = [];
  puTimer = PU_MIN_MS + Math.random() * (PU_MAX_MS - PU_MIN_MS);
  acc = 0; shakeMs = 0; flashMs = 0; comboPulse = 0;
  clearParticles();

  placeSnake(START_LEN);
  spawnFood();

  save.lastMode = mode;
  save.totals.runs++;
  persist('Run start');

  setScreen('playing');
  sfx.resume();
  sfx.startHum();
  toast(`${MODE_INFO[mode].label} — ${board.name}`);
  hudRefresh(true);
}

function beginShift() {
  run.sectors++;
  save.totals.sectors++;
  const bonus = 60 * run.level + 40;
  addScore(bonus);
  run.sectorFoods = 0;
  run.food = -1;
  pickups = [];
  shiftMs = 1500;
  const next = layoutList[(layoutIndex + 1) % layoutList.length];
  el.shiftText.textContent = 'REACTOR SHIFT';
  el.shiftSub.textContent = `SECTOR ${run.sectors + 1} — ${next.name.toUpperCase()}`;
  el.shiftHint.textContent = `+${bonus} SECTOR BONUS`;
  el.shiftBanner.classList.remove('hidden');
  sfx.shift();
  if (!reducedMotion()) { shakeMs = 320; shakeMag = 6; }
  flashMs = 260;
  if (run.mode === 'maze') ach('maze_runner', run.sectors / 4);
  setScreen('shift');
  persist('Sector cleared');
}

function finishShift() {
  el.shiftBanner.classList.add('hidden');
  setLayout(layoutIndex + 1);
  const want = clamp(run.len, START_LEN, CELLS - 40);
  placeSnake(want);
  spawnFood();
  run.comboMs = run.comboCount > 0 ? comboWindow() : 0;
  acc = 0;
  setScreen('playing');
  toast(board.name.toUpperCase());
}

function addScore(n) {
  run.score += n;
  if (run.mode === 'classic' && run.puCount === 0 && run.score >= 1200) ach('purist', 1);
  ach('score_2500', run.score / 2500);
}

function collectFuel(cellIdx) {
  if (run.comboMs > 0) run.comboCount = Math.min(99, run.comboCount + 1);
  else run.comboCount = 1;
  run.comboMs = comboWindow();
  const mult = comboMult();
  run.bestCombo = Math.max(run.bestCombo, mult);
  addScore(Math.round(10 * run.level * mult));
  run.foods++;
  run.sectorFoods++;
  run.grow += GROW_PER_FOOD;
  save.totals.foods++;
  comboPulse = 1;
  sfx.eat(run.comboCount);
  burst(cellIdx, mult >= 3 ? '#ffcf5c' : '#7dffa8', 12, 1);

  ach('first_cell', 1);
  ach('grand_total', save.totals.foods / 500);
  ach('length_60', run.len / 60);
  if (mult >= MAX_MULT) ach('combo_master', 1);

  const nextLevel = 1 + Math.floor(run.foods / FOOD_PER_LEVEL);
  if (nextLevel > run.level) {
    run.level = nextLevel;
    sfx.levelUp();
    toast(`LEVEL ${run.level} — REACTOR SPEEDS UP`, 'good');
    ach('reactor_overload', run.level / 12);
    if (!reducedMotion()) { shakeMs = 160; shakeMag = 3; }
  }

  if (run.mode !== 'classic' && run.sectorFoods >= SECTOR_SIZE) beginShift();
  else spawnFood();
}

function collectPickup(pu) {
  const def = PU_DEFS[pu.type];
  run.puCount++;
  save.totals.powerups++;
  if (pu.type !== 'surge') {
    run.puTypes.add(pu.type);
    ach('triple_charge', run.puTypes.size / 3);
  }
  burst(pu.cell, def.color, 18, 1.4);
  sfx.power(pu.type);

  if (pu.type === 'slowmo') {
    effects.slowmo = Math.max(effects.slowmo, SLOWMO_MS);
    toast('SLOW-MO ENGAGED');
  } else if (pu.type === 'magnet') {
    effects.magnet = Math.max(effects.magnet, MAGNET_MS);
    run.magnetTick = 0;
    toast('MAGNET ONLINE');
  } else if (pu.type === 'shrink') {
    const removable = Math.max(0, run.len - 4);
    const n = Math.min(removable, Math.max(3, Math.floor(run.len * 0.35)));
    for (let i = 0; i < n; i++) {
      const t = seg(run.len - 1);
      occ[t] = 0;
      if (i % 2 === 0) burst(t, '#7dffa8', 3, 0.6);
      run.len--;
    }
    addScore(12 * run.level * n);
    toast(`VENTED ${n} SEGMENTS  +${12 * run.level * n}`, 'good');
  } else if (pu.type === 'surge') {
    run.comboCount = Math.min(99, Math.max(1, run.comboCount) + 2);
    run.comboMs = comboWindow();
    const mult = comboMult();
    run.bestCombo = Math.max(run.bestCombo, mult);
    const pts = Math.round(40 * run.level * mult);
    addScore(pts);
    toast(`SURGE CELL  +${pts}`, 'good');
    if (mult >= MAX_MULT) ach('combo_master', 1);
  }
  if (!reducedMotion()) { shakeMs = 140; shakeMag = 3; }
}

function saturationWin() {
  run.alive = false;
  run.deathReason = 'saturation';
  endRun(true);
}

function die(reason) {
  if (!run.alive) return;
  run.alive = false;
  run.deathReason = reason;
  save.totals.deaths++;
  sfx.die();
  sfx.stopHum();
  if (!reducedMotion()) { shakeMs = 520; shakeMag = 11; }
  flashMs = 320;
  const n = reducedMotion() ? 3 : 8;
  for (let i = 0; i < run.len; i += Math.max(1, Math.floor(run.len / 26))) {
    burst(seg(i), i === 0 ? '#ff5b6e' : '#27e0ff', n, 1.3);
  }
  endRun(false);
}

const DEATH_TEXT = {
  wall: 'You slammed into the containment wall',
  bulkhead: 'You clipped a reactor bulkhead',
  self: 'You coiled into your own tail',
  saturation: 'Every cell of the core is filled',
};

function endRun(won) {
  const mode = run.mode;
  const prevBest = save.best[mode] || 0;
  const isBest = run.score > prevBest;
  if (isBest) save.best[mode] = run.score;
  save.bestLen[mode] = Math.max(save.bestLen[mode] || 0, run.len);
  save.totals.score += run.score;
  ach('length_60', run.len / 60);
  if (mode === 'portal') ach('portal_hopper', run.portalJumps / 40);
  if (mode === 'maze') ach('maze_runner', run.sectors / 4);
  ach('reactor_overload', run.level / 12);
  persist('Run complete');
  flushPlaytime();

  el.resTitle.textContent = won ? 'CORE SATURATED' : 'CORE BREACH';
  el.resTitle.classList.toggle('win', won);
  el.resSub.textContent = (DEATH_TEXT[run.deathReason] || 'Run complete') +
    ` · ${MODE_INFO[mode].label}`;
  el.resNewBest.classList.toggle('hidden', !isBest);
  el.resScore.textContent = run.score.toLocaleString();
  el.resBest.textContent = (save.best[mode] || 0).toLocaleString();
  el.resFood.textContent = run.foods;
  el.resLen.textContent = run.len;
  el.resCombo.textContent = 'x' + run.bestCombo.toFixed(1);
  el.resLevel.textContent = run.level;
  el.resSectors.textContent = run.sectors;
  el.resTime.textContent = fmtTime(run.timeMs);
  refreshMenu();
  setScreen('dead');
}

// ==================================================================== step ===

function step() {
  const r = run;
  if (r.queue.length) {
    const nd = r.queue.shift();
    if (r.len < 2 || nd !== (r.dir + 2) % 4) r.dir = nd;
  }

  const head = seg(0);
  const d = DIRS[r.dir];
  let x = cx(head) + d.x, y = cy(head) + d.y;
  r.warp = false;

  if (r.wrap) {
    if (x < 0) { x = COLS - 1; r.warp = true; }
    else if (x >= COLS) { x = 0; r.warp = true; }
    if (y < 0) { y = ROWS - 1; r.warp = true; }
    else if (y >= ROWS) { y = 0; r.warp = true; }
  } else if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
    die('wall');
    return;
  }

  let next = y * COLS + x;

  if (board.portal[next] >= 0) {
    const exit = board.portal[next];
    burst(next, '#c07bff', 10, 1.1);
    next = exit;
    r.warp = true;
    r.portalJumps++;
    sfx.portal();
    burst(next, '#c07bff', 10, 1.1);
    if (r.mode === 'portal') ach('portal_hopper', r.portalJumps / 40);
  }

  if (board.walls[next]) { die('bulkhead'); return; }

  const tail = seg(r.len - 1);
  const vacating = r.grow === 0;
  if (occ[next] === 2 && !(next === tail && vacating)) { die('self'); return; }

  // advance
  if (r.grow > 0) r.grow--;
  else { occ[tail] = 0; r.len--; }
  headPtr = (headPtr - 1 + CAP) % CAP;
  body[headPtr] = next;
  r.len++;
  occ[next] = 2;

  if (next === r.food) { collectFuel(next); return; }

  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].cell === next) {
      const pu = pickups.splice(i, 1)[0];
      collectPickup(pu);
      break;
    }
  }

  if (effects.magnet > 0 && r.food >= 0) magnetStep(next);
}

function magnetStep(headCell) {
  const f = run.food;
  if (f < 0) return;
  const hx = cx(headCell), hy = cy(headCell);
  const fx = cx(f), fy = cy(f);
  const dx = Math.abs(fx - hx), dy = Math.abs(fy - hy);
  if (Math.max(dx, dy) <= 1) {
    burst(f, '#ff9b3f', 8, 0.9);
    collectFuel(f);
    return;
  }
  run.magnetTick++;
  if (run.magnetTick % 2 !== 0) return;
  const options = [];
  if (fx !== hx) options.push(fy * COLS + (fx + (hx > fx ? 1 : -1)));
  if (fy !== hy) options.push((fy + (hy > fy ? 1 : -1)) * COLS + fx);
  for (const t of options) {
    if (t < 0 || t >= CELLS) continue;
    if (occ[t] || board.portal[t] >= 0) continue;
    let busy = false;
    for (const p of pickups) if (p.cell === t) busy = true;
    if (busy) continue;
    emit(ox + (cx(f) + 0.5) * cell, oy + (cy(f) + 0.5) * cell,
      (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 320, cell * 0.09, '#ff9b3f', 0.9);
    run.food = t;
    return;
  }
}

// =================================================================== update ==

function update(dt) {
  animT += dt;
  if (shakeMs > 0) shakeMs -= dt;
  if (flashMs > 0) flashMs -= dt;
  if (comboPulse > 0) comboPulse = Math.max(0, comboPulse - dt / 320);

  fxAcc += dt;
  let guard = 0;
  while (fxAcc >= FX_STEP && guard++ < 8) { updateParticles(FX_STEP); fxAcc -= FX_STEP; }
  if (fxAcc > FX_STEP * 8) fxAcc = 0;

  if (screen === 'shift') {
    shiftMs -= dt;
    tickPlaytime(dt);
    if (shiftMs <= 0) finishShift();
    return;
  }
  if (screen !== 'playing') return;

  run.timeMs += dt;
  tickPlaytime(dt);
  if (run.comboMs > 0) {
    run.comboMs -= dt;
    if (run.comboMs <= 0) { run.comboMs = 0; run.comboCount = 0; }
  }
  if (effects.slowmo > 0) effects.slowmo = Math.max(0, effects.slowmo - dt);
  if (effects.magnet > 0) effects.magnet = Math.max(0, effects.magnet - dt);

  for (let i = pickups.length - 1; i >= 0; i--) {
    pickups[i].ttl -= dt;
    if (pickups[i].ttl <= 0) {
      burst(pickups[i].cell, '#41618a', 6, 0.7);
      pickups.splice(i, 1);
    }
  }
  puTimer -= dt;
  if (puTimer <= 0) {
    spawnPickup();
    puTimer = PU_MIN_MS + Math.random() * (PU_MAX_MS - PU_MIN_MS);
  }

  const sm = stepMs();
  acc += dt;
  if (acc > sm * 4) acc = sm * 4;
  let steps = 0;
  while (acc >= sm && steps++ < 6) {
    acc -= sm;
    step();
    if (screen !== 'playing') { acc = 0; break; }
  }
  hudRefresh(false);
}

// =================================================================== render ==

function buildBackdrop() {
  if (boardW <= 0 || boardH <= 0) return;
  bg.width = Math.max(1, Math.floor(boardW * dpr));
  bg.height = Math.max(1, Math.floor(boardH * dpr));
  const g = bgCtx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, boardW, boardH);

  const floor = g.createLinearGradient(0, 0, 0, boardH);
  floor.addColorStop(0, '#080f1c');
  floor.addColorStop(0.5, '#050a14');
  floor.addColorStop(1, '#070d18');
  g.fillStyle = floor;
  g.fillRect(0, 0, boardW, boardH);

  if (save.settings.grid) {
    g.strokeStyle = 'rgba(39,224,255,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 1; c < COLS; c++) { g.moveTo(c * cell + 0.5, 0); g.lineTo(c * cell + 0.5, boardH); }
    for (let r = 1; r < ROWS; r++) { g.moveTo(0, r * cell + 0.5); g.lineTo(boardW, r * cell + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(39,224,255,0.10)';
    for (let r = 0; r <= ROWS; r += 2) {
      for (let c = 0; c <= COLS; c += 2) g.fillRect(c * cell - 1, r * cell - 1, 2, 2);
    }
  }

  // bulkheads
  for (let i = 0; i < CELLS; i++) {
    if (!board.walls[i]) continue;
    const x = cx(i) * cell, y = cy(i) * cell;
    const grd = g.createLinearGradient(x, y, x, y + cell);
    grd.addColorStop(0, '#26456b');
    grd.addColorStop(0.55, '#16283f');
    grd.addColorStop(1, '#0e1a2b');
    g.fillStyle = grd;
    g.fillRect(x, y, cell, cell);
    // seams: only draw edges that face open space
    g.strokeStyle = 'rgba(90,190,255,0.30)';
    g.lineWidth = 1;
    g.beginPath();
    const up = cy(i) > 0 ? board.walls[i - COLS] : 1;
    const dn = cy(i) < ROWS - 1 ? board.walls[i + COLS] : 1;
    const lf = cx(i) > 0 ? board.walls[i - 1] : 1;
    const rt = cx(i) < COLS - 1 ? board.walls[i + 1] : 1;
    if (!up) { g.moveTo(x, y + 0.5); g.lineTo(x + cell, y + 0.5); }
    if (!dn) { g.moveTo(x, y + cell - 0.5); g.lineTo(x + cell, y + cell - 0.5); }
    if (!lf) { g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + cell); }
    if (!rt) { g.moveTo(x + cell - 0.5, y); g.lineTo(x + cell - 0.5, y + cell); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x + cell * 0.18, y + cell * 0.18, cell * 0.2, cell * 0.2);
  }

  bgDirty = false;
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function render() {
  if (bgDirty) buildBackdrop();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, W, H);

  let sx = 0, sy = 0;
  if (shakeMs > 0 && !reducedMotion()) {
    const k = (shakeMs / 520) * shakeMag;
    sx = (Math.random() - 0.5) * k * 2;
    sy = (Math.random() - 0.5) * k * 2;
  }
  ctx.save();
  ctx.translate(sx, sy);

  // outer glow frame
  const pulse = 0.5 + 0.5 * Math.sin(animT / 700);
  ctx.strokeStyle = run.wrap
    ? `rgba(192,123,255,${0.35 + pulse * 0.3})`
    : `rgba(39,224,255,${0.30 + pulse * 0.25})`;
  ctx.lineWidth = 2;
  if (run.wrap) ctx.setLineDash([cell * 0.5, cell * 0.35]);
  ctx.strokeRect(ox - 3.5, oy - 3.5, boardW + 7, boardH + 7);
  ctx.setLineDash([]);

  ctx.drawImage(bg, ox, oy, boardW, boardH);

  drawPortals();
  drawFood();
  drawPickups();
  if (run.len > 0 && (screen === 'playing' || screen === 'paused' || screen === 'dead' || screen === 'shift')) drawSnake();
  drawParticles();

  ctx.restore();

  if (flashMs > 0) {
    ctx.fillStyle = `rgba(180,235,255,${Math.min(0.4, flashMs / 900)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawPortals() {
  if (!board.portalCells.length) return;
  for (const i of board.portalCells) {
    const x = ox + (cx(i) + 0.5) * cell;
    const y = oy + (cy(i) + 0.5) * cell;
    const t = animT / 520 + i * 0.4;
    const r = cell * (0.30 + 0.06 * Math.sin(t));
    ctx.strokeStyle = 'rgba(192,123,255,0.85)';
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r, t % (Math.PI * 2), (t % (Math.PI * 2)) + Math.PI * 1.35);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,255,0.55)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, -t % (Math.PI * 2), (-t % (Math.PI * 2)) + Math.PI * 1.1);
    ctx.stroke();
    ctx.fillStyle = `rgba(192,123,255,${0.25 + 0.2 * Math.sin(t * 1.7)})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFood() {
  if (run.food < 0) return;
  const x = ox + (cx(run.food) + 0.5) * cell;
  const y = oy + (cy(run.food) + 0.5) * cell;
  const p = 0.5 + 0.5 * Math.sin(animT / 260);
  const r = cell * (0.28 + 0.05 * p);

  const g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.8);
  g.addColorStop(0, 'rgba(125,255,168,0.55)');
  g.addColorStop(1, 'rgba(125,255,168,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(animT / 900);
  ctx.fillStyle = '#8dffb6';
  ctx.strokeStyle = '#e6fff0';
  ctx.lineWidth = Math.max(1, cell * 0.06);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (effects.magnet > 0 && run.len > 0) {
    const hx = ox + (cx(seg(0)) + 0.5) * cell;
    const hy = oy + (cy(seg(0)) + 0.5) * cell;
    ctx.strokeStyle = `rgba(255,155,63,${0.15 + 0.15 * p})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPickups() {
  for (const pu of pickups) {
    const def = PU_DEFS[pu.type];
    const x = ox + (cx(pu.cell) + 0.5) * cell;
    const y = oy + (cy(pu.cell) + 0.5) * cell;
    const blink = pu.ttl < 3000 ? (Math.sin(animT / 90) > -0.2 ? 1 : 0.25) : 1;
    ctx.globalAlpha = blink;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4 + Math.sin(animT / 600) * 0.12);
    const s = cell * 0.34;
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, def.color);
    g.addColorStop(1, 'rgba(10,20,34,0.9)');
    ctx.fillStyle = g;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = Math.max(1.2, cell * 0.07);
    roundRect(ctx, -s, -s, s * 2, s * 2, cell * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#04070d';
    ctx.font = `${Math.floor(cell * 0.52)}px 'Segoe UI Emoji', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, x, y + cell * 0.02);
    ctx.globalAlpha = 1;
  }
}

const pathX = new Float64Array(CAP + 2);
const pathY = new Float64Array(CAP + 2);

function drawSnake() {
  const n = run.len;
  if (n <= 0) return;
  const alpha = screen === 'playing' ? clamp(acc / stepMs(), 0, 1) : 1;

  for (let i = 0; i < n; i++) {
    const c = seg(i);
    pathX[i] = ox + (cx(c) + 0.5) * cell;
    pathY[i] = oy + (cy(c) + 0.5) * cell;
  }
  // smooth head arrival out of the neck
  if (n >= 2 && !run.warp) {
    const dx = Math.abs(pathX[0] - pathX[1]), dy = Math.abs(pathY[0] - pathY[1]);
    if (dx <= cell * 1.2 && dy <= cell * 1.2) {
      pathX[0] = lerp(pathX[1], pathX[0], alpha);
      pathY[0] = lerp(pathY[1], pathY[0], alpha);
    }
  }
  // retract the tail while it is vacating
  if (n >= 3 && run.grow === 0) {
    const dx = Math.abs(pathX[n - 1] - pathX[n - 2]), dy = Math.abs(pathY[n - 1] - pathY[n - 2]);
    if (dx <= cell * 1.2 && dy <= cell * 1.2) {
      pathX[n - 1] = lerp(pathX[n - 1], pathX[n - 2], alpha);
      pathY[n - 1] = lerp(pathY[n - 1], pathY[n - 2], alpha);
    }
  }

  const mult = comboMult();
  const hue = 186 - (mult - 1) * 14;      // cyan -> gold-green as combo climbs
  const bodyCol = `hsl(${hue}, 90%, 58%)`;
  const glowCol = `hsla(${hue}, 100%, 62%, 0.16)`;
  const coreCol = `hsl(${hue}, 100%, 82%)`;
  const dead = screen === 'dead';

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // three passes: glow, body, core highlight
  const passes = [
    { w: cell * 1.06, c: dead ? 'rgba(255,91,110,0.15)' : glowCol },
    { w: cell * 0.74, c: dead ? '#8d2b3a' : bodyCol },
    { w: cell * 0.30, c: dead ? '#ff8f9d' : coreCol },
  ];
  for (const pass of passes) {
    ctx.strokeStyle = pass.c;
    ctx.lineWidth = pass.w;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const gap = Math.abs(pathX[i] - pathX[i - 1]) + Math.abs(pathY[i] - pathY[i - 1]);
        if (gap > cell * 1.6) { ctx.stroke(); ctx.beginPath(); started = false; }
      }
      if (!started) { ctx.moveTo(pathX[i], pathY[i]); started = true; }
      else ctx.lineTo(pathX[i], pathY[i]);
    }
    ctx.stroke();
  }

  // segment plating
  if (!reducedMotion() && cell >= 10) {
    ctx.fillStyle = 'rgba(4,10,18,0.30)';
    for (let i = 2; i < n; i += 2) {
      const s = cell * 0.14;
      ctx.fillRect(pathX[i] - s, pathY[i] - s, s * 2, s * 2);
    }
  }

  // head
  const hx = pathX[0], hy = pathY[0];
  const d = DIRS[run.dir];
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(Math.atan2(d.y, d.x));
  const hs = cell * 0.44;
  const hg = ctx.createLinearGradient(-hs, 0, hs, 0);
  hg.addColorStop(0, dead ? '#7d2530' : `hsl(${hue}, 90%, 46%)`);
  hg.addColorStop(1, dead ? '#ff5b6e' : `hsl(${hue}, 100%, 74%)`);
  ctx.fillStyle = hg;
  roundRect(ctx, -hs, -hs, hs * 2, hs * 2, cell * 0.2);
  ctx.fill();
  ctx.fillStyle = dead ? '#2a0a10' : '#04141c';
  const eo = cell * 0.17;
  ctx.beginPath();
  ctx.arc(cell * 0.13, -eo, cell * 0.09, 0, Math.PI * 2);
  ctx.arc(cell * 0.13, eo, cell * 0.09, 0, Math.PI * 2);
  ctx.fill();
  if (!dead) {
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(cell * 0.16, -eo, cell * 0.035, 0, Math.PI * 2);
    ctx.arc(cell * 0.16, eo, cell * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (run.boost && !dead) {
    ctx.fillStyle = 'rgba(255,207,92,0.55)';
    for (let i = 0; i < 2; i++) {
      const t = 0.4 + i * 0.35;
      ctx.beginPath();
      ctx.arc(hx - d.x * cell * t, hy - d.y * cell * t, cell * (0.18 - i * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawParticles() {
  for (let i = 0; i < P_MAX; i++) {
    if (!pAlive[i]) continue;
    const a = clamp(pLife[i] / pMax[i], 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pCol[i];
    const s = pSize[i] * (0.4 + a * 0.8);
    ctx.fillRect(pX[i] - s, pY[i] - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
}

// ====================================================================== HUD ==

const hudCache = { score: -1, best: -1, level: -1, len: -1, mode: '', mult: '' };
let chipKey = '';

function hudRefresh(force) {
  if (force || hudCache.score !== run.score) {
    hudCache.score = run.score;
    el.score.textContent = run.score.toLocaleString();
  }
  const b = Math.max(save.best[run.mode] || 0, run.score);
  if (force || hudCache.best !== b) { hudCache.best = b; el.best.textContent = b.toLocaleString(); }
  if (force || hudCache.level !== run.level) { hudCache.level = run.level; el.level.textContent = run.level; }
  if (force || hudCache.len !== run.len) { hudCache.len = run.len; el.len.textContent = run.len; }
  const modeText = run.mode === 'classic'
    ? 'CLASSIC'
    : `${MODE_INFO[run.mode].label} ${run.sectors + 1} — ${board.name.toUpperCase()}`;
  if (force || hudCache.mode !== modeText) { hudCache.mode = modeText; el.mode.textContent = modeText; }

  const mult = comboMult();
  const ms = 'x' + mult.toFixed(1);
  if (force || hudCache.mult !== ms) { hudCache.mult = ms; el.comboMult.textContent = ms; }
  const w = run.comboMs > 0 ? clamp(run.comboMs / comboWindow(), 0, 1) : 0;
  el.comboFill.style.width = (w * 100).toFixed(1) + '%';

  let key = '';
  if (effects.slowmo > 0) key += 's';
  if (effects.magnet > 0) key += 'm';
  if (key !== chipKey) {
    chipKey = key;
    el.chipRow.innerHTML =
      (effects.slowmo > 0 ? '<div class="chip slowmo">⏳ SLOW-MO<div class="cbar" data-fx="slowmo"></div></div>' : '') +
      (effects.magnet > 0 ? '<div class="chip magnet">🧲 MAGNET<div class="cbar" data-fx="magnet"></div></div>' : '');
  }
  if (key) {
    const bars = el.chipRow.querySelectorAll('.cbar');
    for (const bar of bars) {
      const fx = bar.getAttribute('data-fx');
      const total = fx === 'slowmo' ? SLOWMO_MS : MAGNET_MS;
      bar.style.width = ((effects[fx] / total) * 100).toFixed(1) + '%';
    }
  }
}

let toastTimer = [];
function toast(msg, cls) {
  const d = document.createElement('div');
  d.className = 'toast' + (cls ? ' ' + cls : '');
  d.textContent = msg;
  el.toastWrap.appendChild(d);
  while (el.toastWrap.children.length > 4) el.toastWrap.removeChild(el.toastWrap.firstChild);
  const t = setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2000);
  toastTimer.push(t);
  if (toastTimer.length > 12) toastTimer.shift();
}

function refreshMenu() {
  el.bestClassic.textContent = (save.best.classic || 0).toLocaleString();
  el.bestMaze.textContent = (save.best.maze || 0).toLocaleString();
  el.bestPortal.textContent = (save.best.portal || 0).toLocaleString();
  el.menuTotalFood.textContent = (save.totals.foods || 0).toLocaleString();
  el.menuRuns.textContent = (save.totals.runs || 0).toLocaleString();
  el.btnPlayLast.textContent = '▶ PLAY ' + MODE_INFO[save.lastMode].label;
}

// ================================================================== screens ==

function setScreen(name) {
  screen = name;
  const playing = name === 'playing' || name === 'shift' || name === 'paused' || name === 'dead';
  el.hud.classList.toggle('hidden', !playing);
  el.menu.classList.toggle('hidden', name !== 'menu');
  el.howto.classList.toggle('hidden', name !== 'howto');
  el.settings.classList.toggle('hidden', name !== 'settings');
  el.pause.classList.toggle('hidden', name !== 'paused');
  el.result.classList.toggle('hidden', name !== 'dead');
  if (name !== 'shift') el.shiftBanner.classList.add('hidden');
  el.touchPad.classList.toggle('on', save.settings.dpad && (name === 'playing' || name === 'shift'));
  if (name === 'menu') { refreshMenu(); sfx.stopHum(); }
}

function doPause(fromHub) {
  if (screen !== 'playing' && screen !== 'shift') return;
  pausedFrom = screen;
  run.boost = false;
  el.pauseSub.textContent = `${MODE_INFO[run.mode].label} — ${board.name.toUpperCase()}`;
  setScreen('paused');
  sfx.stopHum();
  if (!fromHub) sfx.ui();
  flushPlaytime();
  persist('Paused');
}

function doResume() {
  if (screen !== 'paused') return;
  acc = 0;
  setScreen(pausedFrom === 'shift' ? 'shift' : 'playing');
  sfx.resume();
  sfx.startHum();
}

function quitToMenu() {
  sfx.stopHum();
  flushPlaytime();
  persist('Quit to menu');
  run.alive = false;
  setScreen('menu');
}

function openHowTo(from) { returnScreen = from; sfx.ui(); setScreen('howto'); }
function openSettings(from) { returnScreen = from; sfx.ui(); syncSettingsUI(); setScreen('settings'); }
function closeSub() {
  sfx.back();
  if (returnScreen === 'paused') setScreen('paused');
  else setScreen('menu');
}

// ================================================================= settings ==

function applyLocalSettings() {
  sfx.setVolume(save.settings.volume);
  sfx.setMuted(save.settings.muted);
  sfx.setHum(save.settings.hum);
  el.touchPad.classList.toggle('on', save.settings.dpad && (screen === 'playing' || screen === 'shift'));
  bgDirty = true;
}

function syncSettingsUI() {
  el.volSlider.value = String(save.settings.volume);
  el.volVal.textContent = Math.round(save.settings.volume * 100) + '%';
  el.muteChk.checked = !!save.settings.muted;
  el.humChk.checked = !!save.settings.hum;
  el.reduceChk.checked = !!save.settings.reduced;
  el.gridChk.checked = !!save.settings.grid;
  el.dpadChk.checked = !!save.settings.dpad;
}

// ==================================================================== input ==

const KEY_DIR = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

function queueDir(d) {
  if (screen !== 'playing' && screen !== 'shift') return;
  const q = run.queue;
  const lastDir = q.length ? q[q.length - 1] : run.dir;
  if (d === lastDir) return;
  if (run.len >= 2 && d === (lastDir + 2) % 4) return;
  if (q.length >= 2) q.shift();
  q.push(d);
}

window.addEventListener('keydown', (e) => {
  if (e.repeat && e.code !== 'Space') return;
  const code = e.code;

  if (KEY_DIR[code] !== undefined) {
    e.preventDefault();
    queueDir(KEY_DIR[code]);
    return;
  }

  if (code === 'Space') {
    e.preventDefault();
    if (screen === 'playing') { run.boost = true; return; }
    if (screen === 'menu') { sfx.resume(); startRun(save.lastMode); return; }
    if (screen === 'dead') { sfx.resume(); startRun(run.mode); return; }
    if (screen === 'paused') { doResume(); return; }
    if (screen === 'howto' || screen === 'settings') { closeSub(); return; }
    return;
  }

  if (code === 'Enter' || code === 'NumpadEnter') {
    if (screen === 'menu') { sfx.resume(); startRun(save.lastMode); }
    else if (screen === 'dead') { sfx.resume(); startRun(run.mode); }
    else if (screen === 'paused') doResume();
    else if (screen === 'howto' || screen === 'settings') closeSub();
    return;
  }

  if (code === 'Escape' || code === 'KeyP') {
    e.preventDefault();
    if (screen === 'playing' || screen === 'shift') doPause(false);
    else if (screen === 'paused') doResume();
    else if (screen === 'howto' || screen === 'settings') closeSub();
    else if (screen === 'dead') { sfx.back(); quitToMenu(); }
    return;
  }

  if (code === 'KeyR') {
    if (screen === 'playing' || screen === 'paused' || screen === 'dead' || screen === 'shift') {
      sfx.resume();
      startRun(run.mode);
    }
    return;
  }

  if (code === 'KeyM') {
    save.settings.muted = !save.settings.muted;
    sfx.setMuted(save.settings.muted);
    syncSettingsUI();
    persist('Settings');
    toast(save.settings.muted ? 'AUDIO MUTED' : 'AUDIO ON');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') run.boost = false;
});
window.addEventListener('blur', () => { run.boost = false; });

// pointer / swipe steering
let ptrId = null, ptrX = 0, ptrY = 0, ptrMoved = false, ptrStart = 0;
canvas.addEventListener('pointerdown', (e) => {
  sfx.resume();
  if (screen !== 'playing' && screen !== 'shift') return;
  ptrId = e.pointerId;
  ptrX = e.clientX; ptrY = e.clientY; ptrMoved = false; ptrStart = performance.now();
  try { canvas.setPointerCapture(ptrId); } catch { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (ptrId === null || e.pointerId !== ptrId) return;
  const dx = e.clientX - ptrX, dy = e.clientY - ptrY;
  const thresh = 22;
  if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
  if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? 1 : 3);
  else queueDir(dy > 0 ? 2 : 0);
  ptrX = e.clientX; ptrY = e.clientY; ptrMoved = true;
});
function endPointer(e) {
  if (ptrId === null || (e && e.pointerId !== ptrId)) return;
  if (!ptrMoved && performance.now() - ptrStart > 220 === false) { /* quick tap: no steer */ }
  try { canvas.releasePointerCapture(ptrId); } catch { /* ignore */ }
  ptrId = null;
  run.boost = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// touch d-pad
[['padUp', 0], ['padRight', 1], ['padDown', 2], ['padLeft', 3]].forEach(([id, d]) => {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.resume(); queueDir(d); });
});

// ============================================================== UI wiring ====

document.querySelectorAll('.mode-card').forEach((cardEl) => {
  cardEl.addEventListener('click', () => {
    sfx.resume();
    sfx.ui();
    startRun(cardEl.getAttribute('data-mode'));
  });
});

el.btnPlayLast.addEventListener('click', () => { sfx.resume(); sfx.ui(); startRun(save.lastMode); });
$('btnHowTo').addEventListener('click', () => openHowTo('menu'));
$('btnSettings').addEventListener('click', () => openSettings('menu'));
$('howtoClose').addEventListener('click', closeSub);
$('howtoDone').addEventListener('click', closeSub);
$('settingsClose').addEventListener('click', closeSub);
$('settingsDone').addEventListener('click', closeSub);

el.pauseBtn.addEventListener('click', () => {
  if (screen === 'playing' || screen === 'shift') doPause(false);
  else if (screen === 'paused') doResume();
});
$('btnResume').addEventListener('click', doResume);
$('btnRestart').addEventListener('click', () => { sfx.resume(); startRun(run.mode); });
$('btnPauseHow').addEventListener('click', () => openHowTo('paused'));
$('btnPauseSettings').addEventListener('click', () => openSettings('paused'));
$('btnQuit').addEventListener('click', () => { sfx.back(); quitToMenu(); });
$('btnRetry').addEventListener('click', () => { sfx.resume(); startRun(run.mode); });
$('btnResultMenu').addEventListener('click', () => { sfx.back(); quitToMenu(); });

el.volSlider.addEventListener('input', () => {
  save.settings.volume = parseFloat(el.volSlider.value);
  el.volVal.textContent = Math.round(save.settings.volume * 100) + '%';
  sfx.setVolume(save.settings.volume);
});
el.volSlider.addEventListener('change', () => { sfx.ui(); persist('Settings'); });
el.muteChk.addEventListener('change', () => {
  save.settings.muted = el.muteChk.checked;
  sfx.setMuted(save.settings.muted);
  if (!save.settings.muted && (screen === 'playing' || screen === 'shift')) sfx.startHum();
  persist('Settings');
});
el.humChk.addEventListener('change', () => {
  save.settings.hum = el.humChk.checked;
  sfx.setHum(save.settings.hum);
  if (save.settings.hum && (screen === 'playing' || screen === 'shift')) sfx.startHum();
  persist('Settings');
});
el.reduceChk.addEventListener('change', () => { save.settings.reduced = el.reduceChk.checked; persist('Settings'); });
el.gridChk.addEventListener('change', () => {
  save.settings.grid = el.gridChk.checked;
  bgDirty = true;
  persist('Settings');
});
el.dpadChk.addEventListener('change', () => {
  save.settings.dpad = el.dpadChk.checked;
  el.touchPad.classList.toggle('on', save.settings.dpad && (screen === 'playing' || screen === 'shift'));
  persist('Settings');
});

let wipeArmed = false;
const btnWipe = $('btnWipe');
btnWipe.addEventListener('click', () => {
  if (!wipeArmed) {
    wipeArmed = true;
    btnWipe.textContent = 'TAP AGAIN TO CONFIRM';
    sfx.warn();
    setTimeout(() => { wipeArmed = false; btnWipe.textContent = 'RESET HIGH SCORES'; }, 4000);
    return;
  }
  wipeArmed = false;
  btnWipe.textContent = 'RESET HIGH SCORES';
  const keep = save.settings;
  save = defaultSave();
  save.settings = keep;
  achSent.clear();
  achShown.clear();
  persist('Data reset');
  refreshMenu();
  toast('HIGH SCORES CLEARED', 'bad');
});

// =============================================================== lifecycle ===

function resize() {
  const rect = stage.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(320, Math.floor(rect.width || window.innerWidth));
  H = Math.max(260, Math.floor(rect.height || window.innerHeight));
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const padTop = W < 620 ? 96 : 78;
  const padBottom = save.settings.dpad ? 168 : 52;
  const padX = 14;
  const availW = Math.max(60, W - padX * 2);
  const availH = Math.max(60, H - padTop - padBottom);
  cell = Math.max(6, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  boardW = cell * COLS;
  boardH = cell * ROWS;
  ox = Math.floor((W - boardW) / 2);
  oy = Math.floor(padTop + (availH - boardH) / 2);
  bgDirty = true;
}

if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const dt = Math.min(100, ts - lastTs);
  lastTs = ts;
  update(dt);
  render();
}

function startLoop() {
  if (raf) return;
  lastTs = 0;
  raf = requestAnimationFrame(frame);
}
function stopLoop() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (screen === 'playing' || screen === 'shift') doPause(true);
    flushPlaytime();
    stopLoop();
  } else {
    startLoop();
  }
});

window.addEventListener('pagehide', () => { flushPlaytime(); persist('Exit'); });
window.addEventListener('beforeunload', () => { flushPlaytime(); });

// ==================================================================== boot ===

resize();
setScreen('menu');
refreshMenu();
hudRefresh(true);
startLoop();
bootEmpire();
