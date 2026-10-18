/* GAIA — ECOSYSTEM SANDBOX
   A living food web on a 2D field. Plants regrow with the seasons, prey graze and flee,
   predators hunt, and every birth mutates the parent's genome so traits really do evolve.
   Fully offline: the only import is the local Empire SDK. */

import { EmpireClient } from '../../shared/empire-sdk.js';
import { mountAdventureKit } from '../../shared/adventure-showcase.js';
setTimeout(() => mountAdventureKit({gameId:'ecosystem-sandbox',statusKey:'__ecosystemAssetStatus',accent:0x8de26b,getState:()=>({active:true,motion:0,danger:0})}), 0);

const GAME_ID = 'ecosystem-sandbox';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

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
function todayKey() { return new Date().toISOString().slice(0, 10); }

// ============================== balance ==============================
const PLANT_CAP = 620;
const HERB_CAP = 430;
const CARN_CAP = 95;
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const GROWTH = [1.35, 1.0, 0.62, 0.34];
const SEASON_BG = ['#12351f', '#334019', '#3b2416', '#16303c'];

const SCENARIOS = {
  sandbox: {
    id: 'sandbox', name: 'Free Sandbox', ach: null, seasonLen: 32, harsh: 1,
    blurb: 'No rules. Keep something alive for 8 minutes.',
    goal: 'Keep the world alive for 8 minutes.', target: { type: 'time', value: 480 },
  },
  stabilize: {
    id: 'stabilize', name: 'Stabilize', ach: 'stabilize', seasonLen: 30, harsh: 1,
    blurb: 'Hold all three populations together for 180s.',
    goal: 'Hold plants, prey and predators alive together for 180 seconds.', target: { type: 'stable', value: 180 },
  },
  dominance: {
    id: 'dominance', name: 'Trait Dominance', ach: 'dominance', seasonLen: 26, harsh: 1.12,
    blurb: 'Breed prey with an average speed above 2.40.',
    goal: 'Evolve average prey speed past 2.40 while every species survives.', target: { type: 'speed', value: 2.4 },
  },
  extinction: {
    id: 'extinction', name: 'Avoid Extinction', ach: 'no-extinction', seasonLen: 22, harsh: 1.4,
    blurb: 'Harsh climate. Survive 3 full cycles intact.',
    goal: 'Survive 3 full climate cycles with every species still alive.', target: { type: 'cycles', value: 3 },
  },
  daily: {
    id: 'daily', name: 'Daily Challenge', ach: 'daily', seasonLen: 28, harsh: 1.2,
    blurb: "Today's seeded world. Hold on for 150s.",
    goal: "Today's seeded world: hold all three populations for 150 seconds.", target: { type: 'stable', value: 150 },
  },
};

const TOOLS = [
  { id: 'plant', label: 'Plant', key: '1' },
  { id: 'herb', label: 'Prey', key: '2' },
  { id: 'carn', label: 'Predator', key: '3' },
  { id: 'erase', label: 'Erase', key: '4' },
];

// ============================== SDK ==============================
const empire = new EmpireClient({
  gameId: GAME_ID,
  saveVersion: 1,
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
});
const achSent = new Map();
/** Fire-and-forget achievement progress; only escalating values are sent. */
function ach(id, progress = 1) {
  const p = clamp(progress, 0, 1);
  const prev = achSent.get(id) || 0;
  if (p <= prev || (p < 1 && p - prev < 0.05)) return;
  achSent.set(id, p);
  empire.unlockAchievement(id, p).catch(() => {});
}
const save = { bestScore: 0, totalBirths: 0, done: {} };
async function loadSave() {
  try { const rec = await empire.loadState('auto'); if (rec && rec.blob) Object.assign(save, rec.blob); }
  catch { /* no hub / no save yet */ }
}
async function persist(label) {
  try {
    await empire.saveState('auto', save, {
      label, progress: Object.keys(save.done).length / 5, mode: state ? state.scenario.id : 'menu',
    });
  } catch { /* save unavailable */ }
}

// ============================== canvas ==============================
const canvas = $('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
const FIELD = { x0: 10, y0: 108, x1: 100, y1: 100 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  FIELD.x0 = 10; FIELD.y0 = Math.min(108, H * 0.22); FIELD.x1 = W - 10; FIELD.y1 = H - 10;
  if (state) for (const c of [...state.herb, ...state.carn]) { c.x = clamp(c.x, FIELD.x0, FIELD.x1); c.y = clamp(c.y, FIELD.y0, FIELD.y1); }
}
window.addEventListener('resize', resize);
resize();

// ============================== spatial hash ==============================
class Hash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  build(items) {
    this.map.clear();
    for (const it of items) {
      if (it.dead) continue;
      const k = ((it.x / this.cell) | 0) + ',' + ((it.y / this.cell) | 0);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(it);
    }
  }
  nearest(x, y, radius) {
    const c = this.cell, r = Math.ceil(radius / c);
    const cx = (x / c) | 0, cy = (y / c) | 0;
    let best = null, bd = radius * radius;
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const a = this.map.get((cx + i) + ',' + (cy + j));
        if (!a) continue;
        for (const it of a) {
          if (it.dead) continue;
          const dx = it.x - x, dy = it.y - y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = it; }
        }
      }
    }
    return best;
  }
}
const plantHash = new Hash(70);
const herbHash = new Hash(80);

// ============================== world state ==============================
var state = null;
let running = false, paused = false;
let playSeconds = 0, reportedSeconds = 0;

function baseGene(kind, rng) {
  const r = rng || Math.random;
  return kind === 'herb'
    ? { speed: 0.9 + r() * 0.3, sense: 90 + r() * 40, metab: 0.9 + r() * 0.2, size: 0.9 + r() * 0.25 }
    : { speed: 1.3 + r() * 0.35, sense: 150 + r() * 60, metab: 0.9 + r() * 0.2, size: 1.15 + r() * 0.3 };
}
function mutate(v, amt, lo, hi) { return clamp(v + rand(-amt, amt), lo, hi); }
function childGene(g) {
  return {
    speed: mutate(g.speed, 0.14, 0.35, 3.8),
    sense: mutate(g.sense, 12, 40, 240),
    metab: mutate(g.metab, 0.07, 0.6, 1.7),
    size: mutate(g.size, 0.07, 0.65, 1.8),
  };
}
function makeCreature(kind, x, y, gene) {
  return {
    kind, x, y, hx: rand(-1, 1), hy: rand(-1, 1), wander: rand(0.2, 1.4),
    energy: kind === 'herb' ? 95 : 130, age: 0, dead: false, cd: 0,
    gene: gene || baseGene(kind),
  };
}
function makePlant(x, y) { return { x, y, dead: false, r: rand(2.2, 3.4) }; }

function newState(scenarioId) {
  const sc = SCENARIOS[scenarioId] || SCENARIOS.sandbox;
  const rng = sc.id === 'daily' ? mulberry32(hashString('gaia-' + todayKey())) : Math.random;
  const s = {
    scenario: sc, time: 0, season: 0, cycle: 0, cyclesSurvived: 0,
    plants: [], herb: [], carn: [], plantAcc: 0,
    stable: 0, births: 0, tool: 'herb', ended: false,
    avgSpeed: 0, peakHerb: 0, peakCarn: 0, peakPlants: 0,
  };
  const px = () => FIELD.x0 + rng() * (FIELD.x1 - FIELD.x0);
  const py = () => FIELD.y0 + rng() * (FIELD.y1 - FIELD.y0);
  const plants = sc.id === 'extinction' ? 110 : 170;
  const herbs = sc.id === 'extinction' ? 22 : 30;
  const carns = sc.id === 'extinction' ? 4 : 6;
  for (let i = 0; i < plants; i++) s.plants.push(makePlant(px(), py()));
  for (let i = 0; i < herbs; i++) s.herb.push(makeCreature('herb', px(), py(), baseGene('herb', rng)));
  for (let i = 0; i < carns; i++) s.carn.push(makeCreature('carn', px(), py(), baseGene('carn', rng)));
  return s;
}

// ============================== simulation ==============================
function moveCreature(c, tx, ty, speed, dt) {
  if (tx !== null) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 7);
    c.hx += (dx / d - c.hx) * k;
    c.hy += (dy / d - c.hy) * k;
  } else {
    c.wander -= dt;
    if (c.wander <= 0) { c.wander = rand(0.6, 1.9); const a = rand(0, Math.PI * 2); c.hx = Math.cos(a); c.hy = Math.sin(a); }
  }
  const m = Math.hypot(c.hx, c.hy) || 1;
  c.hx /= m; c.hy /= m;
  c.x += c.hx * speed * dt;
  c.y += c.hy * speed * dt;
  if (c.x < FIELD.x0) { c.x = FIELD.x0; c.hx = Math.abs(c.hx); }
  if (c.x > FIELD.x1) { c.x = FIELD.x1; c.hx = -Math.abs(c.hx); }
  if (c.y < FIELD.y0) { c.y = FIELD.y0; c.hy = Math.abs(c.hy); }
  if (c.y > FIELD.y1) { c.y = FIELD.y1; c.hy = -Math.abs(c.hy); }
}

function nearestCarn(x, y, radius) {
  let best = null, bd = radius * radius;
  for (const c of state.carn) {
    if (c.dead) continue;
    const dx = c.x - x, dy = c.y - y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = c; }
  }
  return best;
}

function update(dt) {
  const s = state, sc = s.scenario;
  s.time += dt;

  // ---- seasons & climate cycles ----
  s.season = Math.floor(s.time / sc.seasonLen) % 4;
  const cycle = Math.floor(s.time / (sc.seasonLen * 4));
  if (cycle > s.cycle) {
    s.cycle = cycle;
    if (s.herb.length && s.carn.length) {
      s.cyclesSurvived++;
      ach('climate-master', s.cyclesSurvived / 3);
    }
  }

  // ---- plant regrowth ----
  const room = 1 - s.plants.length / PLANT_CAP;
  s.plantAcc += 29 * (GROWTH[s.season] / sc.harsh) * room * dt;
  while (s.plantAcc >= 1 && s.plants.length < PLANT_CAP) {
    s.plantAcc -= 1;
    s.plants.push(makePlant(rand(FIELD.x0, FIELD.x1), rand(FIELD.y0, FIELD.y1)));
  }
  if (s.plantAcc < 0) s.plantAcc = 0;

  plantHash.build(s.plants);
  herbHash.build(s.herb);

  // ---- prey ----
  const newHerb = [];
  for (const c of s.herb) {
    if (c.dead) continue;
    c.age += dt;
    const g = c.gene;
    let tx = null, ty = null;
    // panic range is deliberately shorter than sight range, so prey still get to graze
    const threat = nearestCarn(c.x, c.y, Math.min(g.sense, 70));
    if (threat) {
      tx = c.x * 2 - threat.x; ty = c.y * 2 - threat.y;
    } else {
      const p = plantHash.nearest(c.x, c.y, g.sense);
      if (p) {
        tx = p.x; ty = p.y;
        const dx = p.x - c.x, dy = p.y - c.y;
        if (dx * dx + dy * dy < 90) { p.dead = true; c.energy += 30; }
      }
    }
    moveCreature(c, tx, ty, 42 * g.speed, dt);
    c.energy -= (2.2 * g.metab + 1.7 * g.speed) * sc.harsh * dt;
    if (c.energy <= 0 || c.age > 110) { c.dead = true; continue; }
    if (c.energy > 148 && s.herb.length + newHerb.length < HERB_CAP) {
      c.energy *= 0.45;
      newHerb.push(makeCreature('herb', c.x + rand(-6, 6), c.y + rand(-6, 6), childGene(g)));
      s.births++;
    }
  }

  // ---- predators ----
  const newCarn = [];
  for (const c of s.carn) {
    if (c.dead) continue;
    c.age += dt;
    c.cd -= dt;
    const g = c.gene;
    let tx = null, ty = null;
    const prey = herbHash.nearest(c.x, c.y, g.sense);
    if (prey) {
      tx = prey.x; ty = prey.y;
      const dx = prey.x - c.x, dy = prey.y - c.y;
      // a feeding cooldown stops one predator from clearing a whole herd in a second
      if (dx * dx + dy * dy < 150 && c.cd <= 0) { prey.dead = true; c.energy += 85; c.cd = 2.2; }
    }
    moveCreature(c, tx, ty, 42 * g.speed, dt);
    c.energy -= (2.8 * g.metab + 1.5 * g.speed) * sc.harsh * dt;
    if (c.energy <= 0 || c.age > 130) { c.dead = true; continue; }
    if (c.energy > 250 && s.carn.length + newCarn.length < CARN_CAP) {
      c.energy *= 0.4;
      newCarn.push(makeCreature('carn', c.x + rand(-8, 8), c.y + rand(-8, 8), childGene(g)));
      s.births++;
    }
  }

  // ---- reap & recruit ----
  if (s.plants.some((p) => p.dead)) s.plants = s.plants.filter((p) => !p.dead);
  s.herb = s.herb.filter((c) => !c.dead);
  s.carn = s.carn.filter((c) => !c.dead);
  if (newHerb.length) s.herb.push(...newHerb);
  if (newCarn.length) s.carn.push(...newCarn);

  // ---- derived stats ----
  let sum = 0;
  for (const c of s.herb) sum += c.gene.speed;
  s.avgSpeed = s.herb.length ? sum / s.herb.length : 0;
  s.peakHerb = Math.max(s.peakHerb, s.herb.length);
  s.peakCarn = Math.max(s.peakCarn, s.carn.length);
  s.peakPlants = Math.max(s.peakPlants, s.plants.length);

  const allAlive = s.plants.length > 0 && s.herb.length > 0 && s.carn.length > 0;
  s.stable = allAlive ? s.stable + dt : 0;

  // ---- achievements ----
  ach('gardener', s.plants.length / 300);
  ach('swarm', s.herb.length / 250);
  ach('apex', s.carn.length / 60);
  ach('generations', (save.totalBirths + s.births) / 500);
  if (s.avgSpeed > 2.4 && s.herb.length >= 10) ach('evolver');
  if (s.time >= 480 && (s.herb.length || s.carn.length)) ach('eternal');

  // ---- end conditions ----
  if (!s.herb.length && !s.carn.length) {
    ach('collapse');
    finish(false, 'Total Collapse', 'Every animal is gone. Plants alone cannot hold a food web together — seed prey earlier and keep predators scarce.');
    return;
  }
  const t = sc.target;
  if (t.type === 'time' && s.time >= t.value) return finish(true, 'World Endures', `Your world ran for ${Math.floor(s.time)} seconds with ${s.plants.length} plants, ${s.herb.length} prey and ${s.carn.length} predators.`);
  if (t.type === 'stable' && s.stable >= t.value) return finish(true, 'Ecosystem Stable', `All three populations held together for ${Math.floor(t.value)} seconds straight.`);
  if (t.type === 'speed' && allAlive && s.avgSpeed >= t.value && s.herb.length >= 10) return finish(true, 'Trait Dominant', `Average prey speed reached ${s.avgSpeed.toFixed(2)} — predation bred a faster herd.`);
  if (t.type === 'cycles' && s.cyclesSurvived >= t.value) return finish(true, 'Weathered', `You carried the whole food web through ${t.value} full climate cycles.`);
}

function score() {
  const s = state;
  if (!s) return 0;
  return Math.round(s.plants.length + s.herb.length * 4 + s.carn.length * 10 + s.births * 2 + s.stable * 3 + s.time);
}

// ============================== rendering ==============================
let pointer = { x: -999, y: -999, inside: false };

function draw() {
  ctx.clearRect(0, 0, W, H);
  const s = state;
  ctx.fillStyle = s ? SEASON_BG[s.season] : '#0b1524';
  ctx.fillRect(0, 0, W, H);
  if (!s) return;

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(0, 0, W, FIELD.y0 - 6);

  // plants
  ctx.fillStyle = '#64db78';
  for (const p of s.plants) ctx.fillRect(p.x - p.r * 0.5, p.y - p.r * 0.5, p.r, p.r);

  // prey
  for (const c of s.herb) {
    const r = 3.2 * c.gene.size;
    ctx.fillStyle = c.energy > 60 ? '#cde8ff' : '#8fb2cf';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(123,184,232,.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.hx * (r + 4), c.y + c.hy * (r + 4)); ctx.stroke();
  }

  // predators
  for (const c of s.carn) {
    const r = 5 * c.gene.size;
    ctx.fillStyle = c.energy > 90 ? '#ff8a67' : '#b8563f';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,138,103,.8)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.hx * (r + 6), c.y + c.hy * (r + 6)); ctx.stroke();
  }

  // brush preview
  if (pointer.inside && running && !paused) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, s.tool === 'erase' ? 34 : 20, 0, Math.PI * 2); ctx.stroke();
  }

  if (paused) {
    ctx.fillStyle = 'rgba(3,6,12,.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#edf4ff'; ctx.textAlign = 'center';
    ctx.font = '800 42px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '400 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#91a3c4';
    ctx.fillText('Esc or P to resume · R to restart', W / 2, H / 2 + 30);
    ctx.textAlign = 'left';
  }
}

// ============================== HUD ==============================
function renderTools() {
  const root = $('tools');
  root.innerHTML = '';
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'box' + (state && state.tool === t.id ? ' active' : '');
    b.textContent = `${t.label} (${t.key})`;
    b.onclick = () => { if (state) { state.tool = t.id; renderTools(); } };
    root.appendChild(b);
  }
}
function renderHud() {
  if (!state) return;
  const s = state, sc = s.scenario;
  let goal;
  const t = sc.target;
  if (t.type === 'stable') goal = `stable ${Math.floor(s.stable)}/${t.value}s`;
  else if (t.type === 'time') goal = `elapsed ${Math.floor(s.time)}/${t.value}s`;
  else if (t.type === 'speed') goal = `avg prey speed ${s.avgSpeed.toFixed(2)}/${t.value.toFixed(2)}`;
  else goal = `climate cycles ${s.cyclesSurvived}/${t.value}`;
  $('status').textContent = paused
    ? `Paused — ${sc.name}`
    : `${sc.name} · ${SEASONS[s.season]} · ${goal}`;
  $('stats').textContent =
    `Plants ${s.plants.length} · Prey ${s.herb.length} · Predators ${s.carn.length} · Births ${s.births} · Score ${score()}`;
}

// ============================== flow ==============================
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function startScenario(id) {
  state = newState(id);
  running = true; paused = false;
  playSeconds = 0; reportedSeconds = 0;
  achSent.clear();
  hide('menu'); hide('help'); hide('result');
  show('hud'); show('hint');
  $('pause').textContent = 'Pause';
  renderTools(); renderHud();
  canvas.focus();
  ach('first-life');
  persist(`${state.scenario.name} — started`);
}

function finish(won, title, text) {
  if (!running || (state && state.ended)) return;
  state.ended = true;
  running = false; paused = false;
  const sc = state.scenario;
  const sco = score();
  save.totalBirths += state.births;
  save.bestScore = Math.max(save.bestScore || 0, sco);
  if (won) {
    ach('victory');
    if (sc.ach) ach(sc.ach);
    save.done[sc.id] = true;
  }
  hide('hud'); hide('hint');
  $('resultTitle').textContent = title;
  $('resultText').textContent = text;
  $('resultScore').textContent =
    `SCORE ${sco} · BEST ${save.bestScore} · PEAKS ${state.peakPlants} plants / ${state.peakHerb} prey / ${state.peakCarn} predators`;
  show('result');
  persist(`${sc.name} — ${won ? 'complete' : 'collapsed'}`);
  flushPlaytime();
}

function setPaused(v) {
  if (!running) return;
  paused = v;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  renderHud();
}

function toMenu() {
  running = false; paused = false;
  hide('hud'); hide('hint'); hide('result'); hide('help');
  refreshMenu();
  show('menu');
}

function refreshMenu() {
  const list = $('modeList');
  list.innerHTML = '';
  for (const key of ['sandbox', 'stabilize', 'dominance', 'extinction', 'daily']) {
    const sc = SCENARIOS[key];
    const b = document.createElement('button');
    b.innerHTML = `<b>${sc.name}${save.done[sc.id] ? ' ✓' : ''}</b><span>${sc.blurb}</span>`;
    b.onclick = () => startScenario(sc.id);
    list.appendChild(b);
  }
  $('menuStats').textContent =
    `BEST SCORE ${save.bestScore || 0} · LIFETIME BIRTHS ${save.totalBirths || 0} · SCENARIOS CLEARED ${Object.keys(save.done).length}/5`;
}

// ============================== painting ==============================
function paint(x, y) {
  if (!state || !running || paused) return;
  if (y < FIELD.y0 - 4) return;
  const px = clamp(x, FIELD.x0, FIELD.x1), py = clamp(y, FIELD.y0, FIELD.y1);
  const s = state;
  if (s.tool === 'plant') {
    for (let i = 0; i < 7 && s.plants.length < PLANT_CAP; i++) {
      s.plants.push(makePlant(clamp(px + rand(-18, 18), FIELD.x0, FIELD.x1), clamp(py + rand(-18, 18), FIELD.y0, FIELD.y1)));
    }
  } else if (s.tool === 'herb') {
    if (s.herb.length < HERB_CAP) s.herb.push(makeCreature('herb', px, py));
  } else if (s.tool === 'carn') {
    if (s.carn.length < CARN_CAP) s.carn.push(makeCreature('carn', px, py));
  } else {
    const r2 = 34 * 34;
    const near = (o) => (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py) <= r2;
    s.plants = s.plants.filter((p) => !near(p));
    s.herb = s.herb.filter((c) => !near(c));
    s.carn = s.carn.filter((c) => !near(c));
  }
}
function pointFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.addEventListener('pointerdown', (e) => {
  const p = pointFromEvent(e);
  pointer = { x: p.x, y: p.y, inside: true };
  canvas.setPointerCapture(e.pointerId);
  paint(p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointFromEvent(e);
  pointer = { x: p.x, y: p.y, inside: true };
  if (e.buttons) paint(p.x, p.y);
});
canvas.addEventListener('pointerup', (e) => {
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });

// ============================== keyboard ==============================
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (running) { e.preventDefault(); setPaused(!paused); }
    return;
  }
  if (!running) return;
  if (e.code === 'KeyR') { e.preventDefault(); startScenario(state.scenario.id); return; }
  const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (idx >= 0) { e.preventDefault(); state.tool = TOOLS[idx].id; renderTools(); }
});

// ============================== buttons ==============================
$('pause').onclick = () => setPaused(!paused);
$('restart').onclick = () => { if (state) startScenario(state.scenario.id); };
$('quit').onclick = () => toMenu();
$('how').onclick = () => { hide('menu'); show('help'); };
$('helpClose').onclick = () => { hide('help'); show('menu'); };
$('again').onclick = () => startScenario(state ? state.scenario.id : 'sandbox');
$('home').onclick = () => toMenu();

// ============================== playtime ==============================
function flushPlaytime() {
  const whole = Math.floor(playSeconds - reportedSeconds);
  if (whole >= 1) { reportedSeconds += whole; empire.reportPlaytime(whole).catch(() => {}); }
}
setInterval(() => { if (running) flushPlaytime(); }, 30000);
window.addEventListener('beforeunload', flushPlaytime);

// ============================== loop ==============================
let last = performance.now(), hudTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && !paused) {
    update(dt);
    playSeconds += dt;
    hudTimer += dt;
    if (hudTimer > 0.2) { hudTimer = 0; renderHud(); }
  }
  draw();
}

// ============================== boot ==============================
(async () => {
  await empire.connect().catch(() => {});
  await loadSave();
  refreshMenu();
  requestAnimationFrame(frame);
})();
