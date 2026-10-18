/* RAGDOLL TOSS â€” charge the cannon, launch the crash dummy, steer it through coins and
   bounce pads, and try to clear the Moon Gate at 1,000 metres.
   Fully offline: the only import is the local Empire SDK. */

import { EmpireClient } from '../../shared/empire-sdk.js';

const GAME_ID = 'ragdoll-toss';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================== tuning ==============================
const GRAV = 16;             // m/s^2
const GOAL = 1000;           // metres to the Moon Gate
const THROWS_PER_RUN = 3;
const PX = 2.6;              // pixels per metre
const UPGRADES = [
  { id: 'power', name: 'Cannon Power', desc: '+6 m/s launch speed', max: 5, cost: (l) => 20 + l * 15 },
  { id: 'boosts', name: 'Air Boosts', desc: '+1 mid-air boost per throw', max: 4, cost: (l) => 25 + l * 20 },
  { id: 'grip', name: 'Bounce Grip', desc: 'Keep more speed on every bounce', max: 4, cost: (l) => 20 + l * 15 },
  { id: 'aero', name: 'Aero Shell', desc: '-15% air drag and +0.6s air control', max: 3, cost: (l) => 25 + l * 20 },
];

// ============================== SDK ==============================
const empire = new EmpireClient({
  gameId: GAME_ID,
  saveVersion: 1,
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
});
const achSent = new Map();
function ach(id, progress = 1) {
  const p = clamp(progress, 0, 1);
  const prev = achSent.get(id) || 0;
  if (p <= prev || (p < 1 && p - prev < 0.05)) return;
  achSent.set(id, p);
  empire.unlockAchievement(id, p).catch(() => {});
}

const save = { coins: 0, lifetimeCoins: 0, best: 0, wins: 0, throws: 0, up: { power: 0, boosts: 0, grip: 0, aero: 0 } };
async function loadSave() {
  try {
    const rec = await empire.loadState('auto');
    if (rec && rec.blob) {
      Object.assign(save, rec.blob);
      save.up = Object.assign({ power: 0, boosts: 0, grip: 0, aero: 0 }, rec.blob.up || {});
    }
  } catch { /* no hub / no save yet */ }
}
async function persist(label) {
  try {
    await empire.saveState('auto', save, { label, progress: clamp(save.best / GOAL, 0, 1) });
  } catch { /* save unavailable */ }
}

// ============================== canvas ==============================
const canvas = $('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, groundY = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = Math.round(H * 0.78);
}
window.addEventListener('resize', resize);
resize();

// ============================== state ==============================
let running = false, paused = false;
let run = null;   // { throwsLeft, throwNo, coins, bestThrow, totalDistance, seed, ended }
let shot = null;  // per-throw state
let course = null;
let playSeconds = 0, reportedSeconds = 0;
const keys = {};

function upLvl(id) { return save.up[id] || 0; }
function launchSpeedMax() { return 75 + upLvl('power') * 6; }
function maxBoosts() { return 2 + upLvl('boosts'); }
function restitution() { return 0.45 + upLvl('grip') * 0.06; }
function dragCoef() { return 0.02 * (1 - 0.15 * upLvl('aero')); }
function airFuelMax() { return 1.8 + upLvl('aero') * 0.6; }

function buildCourse(seed) {
  const rng = mulberry32(seed);
  const pads = [];
  for (let x = 120; x < GOAL + 260; x += 70 + rng() * 60) {
    pads.push({ x: Math.round(x), w: 14 + rng() * 8 });
  }
  const coins = [];
  for (let i = 0; i < 46; i++) {
    const x = 45 + rng() * (GOAL + 180);
    const y = 6 + rng() * 95;
    coins.push({ x, y, got: false });
  }
  coins.sort((a, b) => a.x - b.x);
  return { pads, coins };
}

function newRun() {
  run = { throwsLeft: THROWS_PER_RUN, throwNo: 0, coins: 0, bestThrow: 0, totalDistance: 0, seed: (Math.random() * 1e9) >>> 0, ended: false };
  achSent.clear();
  nextThrow();
}
function nextThrow() {
  run.throwNo++;
  run.throwsLeft--;
  course = buildCourse(run.seed + run.throwNo * 7919);
  shot = {
    phase: 'aim', angle: 42, power: 0, charging: false, chargeDir: 1,
    x: 0, y: 0, vx: 0, vy: 0, t: 0,
    boosts: maxBoosts(), airFuel: airFuelMax(), bounces: 0, coins: 0,
    message: 'Hold Space to charge the cannon',
  };
  updateHud();
}

// ============================== throw lifecycle ==============================
function launch() {
  if (!shot || shot.phase !== 'aim' || !shot.charging) return;
  shot.charging = false;
  const speed = 30 + shot.power * (launchSpeedMax() - 30);
  const a = shot.angle * Math.PI / 180;
  shot.vx = Math.cos(a) * speed;
  shot.vy = Math.sin(a) * speed;
  shot.phase = 'flight';
  shot.t = 0;
  shot.message = 'Airborne!';
  ach('first-launch');
  updateHud();
}
function boost() {
  if (!shot || shot.phase !== 'flight' || shot.boosts <= 0) return;
  shot.boosts--;
  shot.vx += 17;
  shot.vy += 13;
  shot.message = 'BOOST!';
  ach('boost');
  updateHud();
}
function endThrow(reason) {
  if (!shot || shot.phase === 'rest') return;
  shot.phase = 'rest';
  const dist = Math.floor(shot.x);
  save.throws++;
  ach('first-throw');
  run.bestThrow = Math.max(run.bestThrow, dist);
  run.totalDistance += dist;
  run.coins += shot.coins;
  save.coins += shot.coins;
  save.lifetimeCoins += shot.coins;
  save.best = Math.max(save.best, dist);
  shot.message = reason;
  updateHud();
  const thisRun = run;
  setTimeout(() => {
    // ignore if the player restarted or quit while the banked-throw pause was running
    if (!running || thisRun !== run || thisRun.ended) return;
    if (thisRun.throwsLeft > 0) nextThrow();
    else endRun(false);
  }, 1300);
}
function reachGate() {
  if (run.ended) return;
  const dist = Math.floor(shot.x);
  shot.phase = 'rest';
  save.throws++;
  ach('first-throw');
  ach('moon-gate');
  ach('victory');
  save.wins++;
  run.bestThrow = Math.max(run.bestThrow, dist);
  run.totalDistance += dist;
  run.coins += shot.coins;
  save.coins += shot.coins;
  save.lifetimeCoins += shot.coins;
  save.best = Math.max(save.best, dist);
  endRun(true);
}
function endRun(won) {
  if (run.ended) return;
  run.ended = true;
  running = false; paused = false;
  hide('hud'); hide('hint');
  $('resultTitle').textContent = won ? 'Moon Gate Cleared' : 'Run Complete';
  $('resultText').textContent = won
    ? `You punched the dummy ${Math.floor(run.bestThrow)} m downrange and cleared the Moon Gate.`
    : `Best throw ${Math.floor(run.bestThrow)} m over ${THROWS_PER_RUN} attempts. The Moon Gate sits at ${GOAL} m â€” upgrade the cannon and try again.`;
  $('resultScore').textContent =
    `TOTAL ${Math.floor(run.totalDistance)} M Â· COINS +${run.coins} Â· CAREER BEST ${Math.floor(save.best)} M Â· BANK ${save.coins}`;
  show('result');
  persist(won ? 'Moon Gate cleared' : `Best ${Math.floor(save.best)} m`);
  flushPlaytime();
}

// ============================== simulation ==============================
function update(dt) {
  if (shot.phase === 'aim') {
    if (keys['KeyW'] || keys['ArrowUp']) shot.angle = clamp(shot.angle + 34 * dt, 10, 80);
    if (keys['KeyS'] || keys['ArrowDown']) shot.angle = clamp(shot.angle - 34 * dt, 10, 80);
    if (shot.charging) {
      shot.power += shot.chargeDir * 0.62 * dt;
      if (shot.power >= 1) { shot.power = 1; shot.chargeDir = -1; }
      if (shot.power <= 0) { shot.power = 0; shot.chargeDir = 1; }
    }
    return;
  }
  if (shot.phase !== 'flight') return;

  shot.t += dt;
  // air control
  if (shot.airFuel > 0) {
    let used = false;
    if (keys['KeyA'] || keys['ArrowLeft']) { shot.vx -= 17 * dt; used = true; }
    if (keys['KeyD'] || keys['ArrowRight']) { shot.vx += 17 * dt; used = true; }
    if (keys['KeyW'] || keys['ArrowUp']) { shot.vy += 17 * dt; used = true; }
    if (keys['KeyS'] || keys['ArrowDown']) { shot.vy -= 17 * dt; used = true; }
    if (used) shot.airFuel = Math.max(0, shot.airFuel - dt);
  }
  // drag + gravity
  const k = dragCoef();
  shot.vx -= shot.vx * k * dt;
  shot.vy -= shot.vy * k * dt;
  shot.vy -= GRAV * dt;

  shot.x += shot.vx * dt;
  shot.y += shot.vy * dt;
  if (shot.x < 0) { shot.x = 0; shot.vx = Math.abs(shot.vx) * 0.4; }

  // ground / pads
  if (shot.y <= 0) {
    shot.y = 0;
    const pad = course.pads.find((p) => Math.abs(p.x - shot.x) <= p.w / 2);
    if (pad && shot.vy < -1) {
      shot.vy = 30 + upLvl('grip') * 2.5;
      shot.vx *= 1.07;
      shot.bounces++;
      shot.message = 'BOUNCE PAD!';
    } else if (shot.vy < -1.5) {
      shot.vy = -shot.vy * restitution();
      shot.vx *= 0.87;
      shot.bounces++;
      shot.message = `Bounce ${shot.bounces}`;
    } else {
      shot.vy = 0;
      shot.vx -= shot.vx * 2.4 * dt; // skidding friction
    }
  }

  // coins
  for (const c of course.coins) {
    if (c.got) continue;
    if (Math.abs(c.x - shot.x) < 3.4 && Math.abs(c.y - shot.y) < 3.4) {
      c.got = true;
      shot.coins++;
      ach('coin-collector', (save.lifetimeCoins + shot.coins) / 10);
    }
  }

  if (shot.x >= GOAL) { reachGate(); return; }
  if (shot.x >= GOAL - 120) shot.message = 'Moon Gate ahead!';

  const resting = shot.y <= 0.01 && Math.abs(shot.vx) < 2.5 && Math.abs(shot.vy) < 2;
  if (resting) endThrow(`Throw banked at ${Math.floor(shot.x)} m`);
  else if (shot.t > 90) endThrow(`Flight timed out at ${Math.floor(shot.x)} m`);
}

// ============================== rendering ==============================
function draw() {
  ctx.clearRect(0, 0, W, H);
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#0a1730');
  sky.addColorStop(1, '#16304f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, groundY);
  ctx.fillStyle = '#1d2942';
  ctx.fillRect(0, groundY, W, H - groundY);

  if (!shot) return;

  const camX = shot.x - W * 0.28 / PX;
  const camY = Math.max(0, shot.y - (groundY - H * 0.22) / PX);
  const sx = (mx) => (mx - camX) * PX;
  const sy = (my) => groundY - (my - camY) * PX;

  // stars
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 60; i++) {
    const px = ((i * 137.5 - camX * 0.25) % (W + 60) + W + 60) % (W + 60) - 30;
    const py = (i * 53) % Math.max(1, groundY - 60);
    ctx.fillRect(px, py, 1.6, 1.6);
  }

  // distance markers
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  for (let m = Math.max(0, Math.floor(camX / 50) * 50); m < camX + W / PX + 60; m += 50) {
    const x = sx(m);
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = 'rgba(98,230,255,.35)';
    ctx.fillRect(x - 1, sy(0) - 16, 2, 16);
    ctx.fillStyle = 'rgba(145,163,196,.9)';
    ctx.fillText(`${m}m`, x - 10, sy(0) - 20);
  }

  // bounce pads
  for (const p of course.pads) {
    const x = sx(p.x);
    if (x < -80 || x > W + 80) continue;
    ctx.fillStyle = '#ff9d3e';
    ctx.fillRect(x - (p.w * PX) / 2, sy(0) - 5, p.w * PX, 6);
    ctx.fillStyle = 'rgba(255,157,62,.28)';
    ctx.fillRect(x - (p.w * PX) / 2, sy(0) - 16, p.w * PX, 11);
  }

  // moon gate
  const gx = sx(GOAL);
  if (gx > -120 && gx < W + 120) {
    ctx.fillStyle = '#ffc857';
    ctx.fillRect(gx - 4, sy(0) - 150, 8, 150);
    ctx.fillRect(gx - 44, sy(0) - 158, 88, 10);
    ctx.fillStyle = '#0a1730';
    ctx.font = '800 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('MOON GATE', gx - 38, sy(0) - 150);
  }

  // coins
  for (const c of course.coins) {
    if (c.got) continue;
    const x = sx(c.x), y = sy(c.y);
    if (x < -20 || x > W + 20) continue;
    ctx.fillStyle = '#ffc857';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,87,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  }

  // cannon
  const cx = sx(0), cy = sy(0);
  if (cx > -160 && cx < W + 160) {
    ctx.fillStyle = '#2b3a58';
    ctx.fillRect(cx - 20, cy - 22, 40, 22);
    ctx.save();
    ctx.translate(cx, cy - 18);
    ctx.rotate(-shot.angle * Math.PI / 180);
    ctx.fillStyle = '#7f8db0';
    ctx.fillRect(0, -6, 46, 12);
    ctx.restore();
  }

  // dummy
  const dx = sx(shot.x), dy = sy(shot.y) - 12;
  ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const spin = shot.phase === 'flight' ? shot.t * 6 : 0;
  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.lineTo(-9, 12);
  ctx.moveTo(0, -4); ctx.lineTo(10, 12);
  ctx.moveTo(0, -4); ctx.lineTo(-11, -2);
  ctx.moveTo(0, -4); ctx.lineTo(11, -6);
  ctx.stroke();
  ctx.fillStyle = '#ffb86b';
  ctx.beginPath(); ctx.arc(0, -13, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // aim UI
  if (shot.phase === 'aim') {
    const bx = 26, by = H - 78;
    ctx.fillStyle = 'rgba(9,14,25,.85)';
    ctx.fillRect(bx - 10, by - 34, 260, 62);
    ctx.strokeStyle = '#263755'; ctx.lineWidth = 1;
    ctx.strokeRect(bx - 10, by - 34, 260, 62);
    ctx.fillStyle = '#91a3c4';
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`ANGLE ${shot.angle.toFixed(0)}Â°   POWER`, bx, by - 16);
    ctx.strokeStyle = '#4a5a8c';
    ctx.strokeRect(bx, by, 224, 14);
    ctx.fillStyle = shot.power > 0.85 ? '#ff6478' : '#62e6ff';
    ctx.fillRect(bx, by, 224 * shot.power, 14);
  }

  // progress bar to the gate
  const pw = Math.min(W - 32, 420);
  ctx.fillStyle = 'rgba(9,14,25,.8)';
  ctx.fillRect(W / 2 - pw / 2, H - 26, pw, 12);
  ctx.fillStyle = '#62e6ff';
  ctx.fillRect(W / 2 - pw / 2, H - 26, pw * clamp(shot.x / GOAL, 0, 1), 12);
  ctx.strokeStyle = '#263755'; ctx.lineWidth = 1;
  ctx.strokeRect(W / 2 - pw / 2, H - 26, pw, 12);

  if (paused) {
    ctx.fillStyle = 'rgba(3,6,12,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#edf4ff'; ctx.textAlign = 'center';
    ctx.font = '800 42px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '400 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#91a3c4';
    ctx.fillText('Esc or P to resume Â· R to restart', W / 2, H / 2 + 30);
    ctx.textAlign = 'left';
  }
}

// ============================== HUD ==============================
function updateHud() {
  if (!shot || !run) return;
  $('status').textContent = paused ? 'Paused' : shot.message;
  $('stats').textContent =
    `Throw ${run.throwNo}/${THROWS_PER_RUN} Â· Distance ${Math.floor(shot.x)} m / ${GOAL} Â· ` +
    `Boosts ${shot.boosts} Â· Air ${shot.airFuel.toFixed(1)}s Â· Coins ${shot.coins} Â· Best ${Math.floor(save.best)} m`;
  $('fire').textContent = shot.phase === 'aim' ? (shot.charging ? 'Release!' : 'Charge') : 'In flight';
  $('fire').disabled = shot.phase !== 'aim';
  $('boost').disabled = shot.phase !== 'flight' || shot.boosts <= 0;
  $('boost').textContent = `Boost (${shot.boosts})`;
}

// ============================== flow ==============================
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function startRun() {
  if (run) run.ended = true; // retire any in-flight run so its timers go stale
  running = true; paused = false;
  for (const k of Object.keys(keys)) keys[k] = false;
  playSeconds = 0; reportedSeconds = 0;
  hide('menu'); hide('help'); hide('result'); hide('shop');
  show('hud'); show('hint');
  $('pause').textContent = 'Pause';
  newRun();
  canvas.focus();
  persist('Run started');
}
function setPaused(v) {
  if (!running) return;
  paused = v;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  updateHud();
}
function toMenu() {
  running = false; paused = false;
  if (run) run.ended = true;
  hide('hud'); hide('hint'); hide('result'); hide('help'); hide('shop');
  refreshMenu();
  show('menu');
}
function refreshMenu() {
  $('menuStats').textContent =
    `BEST ${Math.floor(save.best)} M Â· GATES CLEARED ${save.wins} Â· THROWS ${save.throws} Â· BANK ${save.coins} COINS`;
}

// ============================== upgrade shop ==============================
let shopReturn = 'menu';
function openShop(from) {
  shopReturn = from;
  hide('menu'); hide('result');
  renderShop();
  show('shop');
}
function renderShop() {
  $('shopCoins').textContent = save.coins;
  const list = $('shopList');
  list.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = upLvl(u.id);
    const maxed = lvl >= u.max;
    const cost = u.cost(lvl);
    const row = document.createElement('div');
    row.className = 'shopRow';
    const info = document.createElement('div');
    info.innerHTML = `<b>${u.name} <span class="coin">${lvl}/${u.max}</span></b><span>${u.desc}</span>`;
    const btn = document.createElement('button');
    if (maxed) { btn.textContent = 'MAXED'; btn.disabled = true; }
    else {
      btn.innerHTML = `Buy â€” <span class="coin">${cost}</span>`;
      btn.disabled = save.coins < cost;
      btn.onclick = () => {
        if (save.coins < cost) return;
        save.coins -= cost;
        save.up[u.id] = lvl + 1;
        persist('Upgrade purchased');
        renderShop();
        refreshMenu();
      };
    }
    row.appendChild(info); row.appendChild(btn);
    list.appendChild(row);
  }
}

// ============================== input ==============================
function beginCharge() {
  if (!running || paused || !shot) return;
  if (shot.phase === 'aim') { if (!shot.charging) { shot.charging = true; shot.power = 0; shot.chargeDir = 1; } updateHud(); }
  else if (shot.phase === 'flight') boost();
}
function releaseCharge() {
  if (!running || paused || !shot) return;
  if (shot.phase === 'aim' && shot.charging) launch();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (running) { e.preventDefault(); setPaused(!paused); }
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!running || paused) return;
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (e.code === 'Space') beginCharge();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boost();
  if (e.code === 'KeyR') startRun();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (!running || paused) return;
  if (e.code === 'Space') releaseCharge();
});

canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); beginCharge(); });
canvas.addEventListener('pointerup', (e) => {
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  releaseCharge();
});

$('fire').onmousedown = beginCharge;
$('fire').onmouseup = releaseCharge;
$('fire').ontouchstart = (e) => { e.preventDefault(); beginCharge(); };
$('fire').ontouchend = (e) => { e.preventDefault(); releaseCharge(); };
$('boost').onclick = boost;
$('pause').onclick = () => setPaused(!paused);
$('restart').onclick = startRun;
$('quit').onclick = toMenu;
$('play').onclick = startRun;
$('shopBtn').onclick = () => openShop('menu');
$('resultShop').onclick = () => openShop('result');
$('shopBack').onclick = () => { hide('shop'); if (shopReturn === 'result') show('result'); else { refreshMenu(); show('menu'); } };
$('how').onclick = () => { hide('menu'); show('help'); };
$('helpClose').onclick = () => { hide('help'); show('menu'); };
$('again').onclick = startRun;
$('home').onclick = toMenu;

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
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  if (running && !paused && shot) {
    update(dt);
    playSeconds += dt;
    hudTimer += dt;
    if (hudTimer > 0.12) { hudTimer = 0; updateHud(); }
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
/* Authored 3D ragdoll layer: the existing deterministic throw, bounce, coin, and course physics remain authoritative. */
const ragdoll3d = { renderer: null, scene: null, camera: null, kit: null, status: { loaded: false, physics: false, attached: false, error: '' } };
function initRagdoll3D() {
  try {
    if (!window.THREE) { const add = (src) => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); return add('../../vendor/three-r128/three.min.js').then(() => add('../../vendor/three-r128/GLTFLoader.js')).then(initRagdoll3D); }
    const canvas = document.createElement('canvas'); canvas.id = 'scene3d'; canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.75'; document.body.prepend(canvas); ragdoll3d.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); ragdoll3d.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); ragdoll3d.renderer.setSize(innerWidth, innerHeight, false); ragdoll3d.scene = new THREE.Scene(); ragdoll3d.scene.fog = new THREE.Fog(0x0a1421, 16, 64); ragdoll3d.camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, .1, 100); ragdoll3d.camera.position.set(0, 7, 15); ragdoll3d.scene.add(new THREE.HemisphereLight(0x9fc7e8, 0x2b1e28, 1.7)); const sun = new THREE.DirectionalLight(0xffc98e, 2.2); sun.position.set(-5, 10, 4); ragdoll3d.scene.add(sun); const ground = new THREE.Mesh(new THREE.PlaneGeometry(34, 22), new THREE.MeshStandardMaterial({ color: 0x34384c, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.3; ragdoll3d.scene.add(ground);
    new THREE.GLTFLoader().load('../../assets/blender-kits/ragdoll-toss/ragdoll-toss-kit.glb', (gltf) => { ragdoll3d.kit = gltf.scene; ragdoll3d.kit.scale.setScalar(1.8); ragdoll3d.scene.add(ragdoll3d.kit); ragdoll3d.status.loaded = true; ragdoll3d.status.attached = true; window.__ragdollTossAssetStatus = ragdoll3d.status; }, undefined, (e) => { ragdoll3d.status.error = String(e && e.message || e); window.__ragdollTossAssetStatus = ragdoll3d.status; }); fetch('../../assets/blender-kits/ragdoll-toss/physics.json').then((r) => r.json()).then((p) => { ragdoll3d.status.physics = !!p.playerCollider; window.__ragdollTossAssetStatus = ragdoll3d.status; }).catch((e) => { ragdoll3d.status.error = String(e && e.message || e); }); addEventListener('resize', () => { ragdoll3d.renderer.setSize(innerWidth, innerHeight, false); ragdoll3d.camera.aspect = innerWidth / innerHeight; ragdoll3d.camera.updateProjectionMatrix(); });
    const render = () => { requestAnimationFrame(render); if (ragdoll3d.kit) { ragdoll3d.kit.rotation.y += .0012; if (typeof shot !== 'undefined' && shot) { ragdoll3d.kit.position.x = Math.sin(shot.angle || 0) * .5; ragdoll3d.kit.position.y = -1.0 + Math.max(0, shot.y || 0) * .008; ragdoll3d.kit.rotation.z = (shot.vx || 0) * .002; } } ragdoll3d.renderer.render(ragdoll3d.scene, ragdoll3d.camera); }; requestAnimationFrame(render);
  } catch (e) { ragdoll3d.status.error = String(e && e.message || e); window.__ragdollTossAssetStatus = ragdoll3d.status; }
}
window.__ragdollTossAssetStatus = ragdoll3d.status; initRagdoll3D();
