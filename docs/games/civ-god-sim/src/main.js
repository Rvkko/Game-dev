import { EmpireClient } from '../../../shared/empire-sdk.js';
import { World, makeRNG, hashSeed, DAYS_PER_YEAR, SEASONS, TECHS } from './sim.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';

const GAME_ID = 'civ-god-sim';
const SAVE_VERSION = 1;
const DAY_SEC = 0.9;              // real seconds per sim-day at 1x
const $ = (id) => document.getElementById(id);

// ---- Achievement definitions (mirror manifest.json) ------------------------
const ACH = [
  { id: 'dawn-of-life',   title: 'Dawn of Life',      desc: 'Guide a tribe to its 5th year.',           rarity: 'common',    test: (w) => w.day >= DAYS_PER_YEAR * 5 },
  { id: 'first-spark',    title: 'First Spark',       desc: 'Witness the first child born.',            rarity: 'common',    test: (w) => w.stats.births >= 1 },
  { id: 'hamlet',         title: 'Hamlet',            desc: 'A settlement reaches 5 people.',           rarity: 'common',    test: (w) => maxPop(w) >= 5 },
  { id: 'village',        title: 'Village Life',      desc: 'A settlement reaches 10 people.',          rarity: 'uncommon',  test: (w) => maxPop(w) >= 10 },
  { id: 'town',           title: 'Rise of the Town',  desc: 'A settlement reaches 25 people.',          rarity: 'rare',      test: (w) => maxPop(w) >= 25 },
  { id: 'toolmakers',     title: 'Toolmakers',        desc: 'A civilization learns Stone Tools.',       rarity: 'uncommon',  test: (w) => w.stats.maxTechIdx >= 1 },
  { id: 'harvest',        title: 'The Harvest',       desc: 'A civilization learns Agriculture.',       rarity: 'uncommon',  test: (w) => w.stats.maxTechIdx >= 2 },
  { id: 'masons',         title: 'Age of Stone',      desc: 'A civilization learns Construction.',      rarity: 'rare',      test: (w) => w.stats.maxTechIdx >= 4 },
  { id: 'age-of-writing', title: 'The Written Word',  desc: 'A civilization learns Writing.',           rarity: 'epic',      test: (w) => w.stats.maxTechIdx >= 5 },
  { id: 'elder',          title: 'Wisdom of Elders',  desc: 'An individual lives to age 60.',           rarity: 'uncommon',  test: (w) => w.stats.maxAge >= 60 },
  { id: 'dynasty',        title: 'Dynasty',           desc: 'A family line reaches 3 generations.',     rarity: 'rare',      test: (w) => w.stats.maxGen >= 3 },
  { id: 'expansion',      title: 'Expansion',         desc: 'Have 3 settlements thriving at once.',     rarity: 'rare',      test: (w) => w.stats.peakSett >= 3 },
  { id: 'multitude',      title: 'Multitude',         desc: 'World population reaches 100 souls.',       rarity: 'epic',      test: (w) => w.stats.peakPop >= 100 },
  { id: 'survivors',      title: 'Survivors',         desc: 'A settlement lives through a disaster.',    rarity: 'uncommon',  test: (w) => w.stats.disastersSurvived >= 1 },
  { id: 'benevolent',     title: 'Benevolent God',    desc: 'Bestow 10 blessings.',                     rarity: 'uncommon',  progressive: true, target: 10, test: (w) => w.stats.blessUses >= 10, prog: (w) => w.stats.blessUses / 10 },
  { id: 'wrathful',       title: 'Wrathful God',      desc: 'Unleash divine destruction.',              rarity: 'uncommon',  hidden: true, test: (w) => w.stats.curseUses >= 1 },
  { id: 'century',        title: 'A Century Passes',  desc: 'Reach the year 100.',                      rarity: 'epic',      test: (w) => w.day >= DAYS_PER_YEAR * 100 },
  { id: 'eternal',        title: 'Eternal Legacy',    desc: 'Reach year 200 with a living people.',     rarity: 'legendary', test: (w) => w.day >= DAYS_PER_YEAR * 200 && w.livingPop() > 0 },
];
function maxPop(w) { let m = 0; for (const s of w.settlements) if (s.alive) m = Math.max(m, s.members.length); return m; }

// ============================================================================
class Game {
  constructor() {
    this.canvas = $('view');
    this.renderer = new Renderer(this.canvas);
    this.audio = new Audio();
    this.world = null;
    this.cam = { x: 36, y: 36, dist: 55, az: 0.6, pol: 0.85 };
    this.speed = 1;                  // 0 paused, 1,2,4,8
    this.prevSpeed = 1;
    this.hubPaused = false;
    this.dayAcc = 0;
    this.fx = [];
    this.sel = null;                 // {type:'agent'|'settlement', id}
    this.tool = 'inspect';
    this.disasterKind = 'drought';
    this.unlocked = new Set();
    this.resultShown = false;
    this.playSecs = 0;
    this.reportAcc = 0;
    this.autosaveAcc = 0;
    this.lastT = performance.now();
    this.running = false;
    this.settings = null;
    this.keys = {};
    this.drag = null;
    this.pendingLoadSlot = null;
    this.empire = new EmpireClient({
      gameId: GAME_ID, saveVersion: SAVE_VERSION,
      onInit: (d) => this._onInit(d),
      onSettings: (s) => this._applySettings(s),
      onTheme: () => { },
      onPause: () => { this.hubPaused = true; this.audio.stopMusic(); },
      onResume: () => { this.hubPaused = false; },
      onLoadSlot: (slot) => { this.loadSlot(slot); },
    });
  }

  async boot() {
    this._bindUI();
    this._bindInput();
    window.addEventListener('resize', () => this._resize());
    this._resize();
    const init = await this.empire.connect();
    this._applySettings(init && init.settings);
    // populate continue button
    try {
      const saves = await this.empire.listSaves();
      const arr = saves && saves.saves ? saves.saves : saves;
      const has = Array.isArray(arr) && arr.length > 0;
      $('btn-continue').style.display = has ? 'block' : 'none';
      if (has && init && init.continueSlot) this.pendingLoadSlot = init.continueSlot;
    } catch { }
    if (init && init.loadSlot) { this.pendingLoadSlot = init.loadSlot; }
    // start render loop (start screen visible)
    this.running = true;
    requestAnimationFrame((t) => this._frame(t));
    if (this.pendingLoadSlot) {
      // auto-continue if hub requested a slot
      this.loadSlot(this.pendingLoadSlot);
    }
    this._migrateHook();
  }

  _migrateHook() {
    window.__empireMigrate = (blob, from) => { if (from === SAVE_VERSION) return blob; return blob; };
  }

  _resize() {
    const w = this.canvas.parentElement.clientWidth || window.innerWidth;
    const h = this.canvas.parentElement.clientHeight || window.innerHeight;
    this.renderer.resize(w, h);
  }

  // ---- Settings ------------------------------------------------------------
  _applySettings(s) {
    if (!s) return;
    this.settings = s;
    if (s.audio) this.audio.setVolumes(s.audio);
    const acc = s.accessibility || {};
    this.renderer.cbMode = (acc.colorblindMode && acc.colorblindMode !== 'off') ? 'deuteranopia' : 'off';
    this.renderer.reducedMotion = !!acc.reducedMotion;
    this.renderer.highContrast = !!acc.highContrast;
    this.renderer.terrainDirty = true;
    const scale = acc.textScale || 1;
    document.documentElement.style.setProperty('--ui-scale', scale);
    this.invertY = !!(s.controls && s.controls.invertY); // (unused top-down but honored)
  }

  // ---- New game ------------------------------------------------------------
  newGame(difficulty, seed, label) {
    this.world = new World({ seed, difficulty }).generate();
    this.renderer.setWorld(this.world);
    const s0 = this.world.settlements[0];
    this.cam = { x: s0.cx, y: s0.cy, dist: 50, az: 0.6, pol: 0.82 };
    this.sel = { type: 'settlement', id: s0.id };
    this.unlocked = new Set();
    this.playSecs = 0; this.dayAcc = 0;
    this.speed = 1;
    this.resultShown = false;
    this._syncSpeedUI();
    this.challengeLabel = label || null;
    this._hide('start-screen');
    $('result').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('side').classList.remove('hidden');
    $('powerbar').classList.remove('hidden');
    this.audio.resume(); this.audio.startMusic();
    this._refreshAchTab();
    this._toast('World created', `Seed ${seed} · ${difficulty}${label ? ' · ' + label : ''}`, 'legendary');
  }

  _onInit(d) { /* settings applied separately */ }

  // ---- Main frame ----------------------------------------------------------
  _frame(t) {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.world) this._update(dt);
    this._render();
    if (this.running) requestAnimationFrame((tt) => this._frame(tt));
  }

  _update(dt) {
    const paused = this.speed === 0 || this.hubPaused || this._menuOpen();
    // camera pan (WASD / arrows) — camera-relative (w = forward, non-inverted)
    const panSpeed = this.cam.dist * 0.9 * dt;
    const fx = -Math.sin(this.cam.az), fy = -Math.cos(this.cam.az); // ground forward
    const rx = -fy, ry = fx;                                        // ground right
    let mx = 0, my = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) { mx += fx; my += fy; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { mx -= fx; my -= fy; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { mx += rx; my += ry; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) { mx -= rx; my -= ry; }
    this.cam.x += mx * panSpeed; this.cam.y += my * panSpeed;
    // rotate with Q/E, pitch with R/F
    if (this.keys['KeyQ']) this.cam.az -= 1.4 * dt;
    if (this.keys['KeyE']) this.cam.az += 1.4 * dt;
    if (this.keys['KeyR']) this.cam.pol -= 1.0 * dt;
    if (this.keys['KeyF']) this.cam.pol += 1.0 * dt;
    this._gamepad(dt);
    this._clampCam();

    if (!paused) {
      this.playSecs += dt; this.reportAcc += dt; this.autosaveAcc += dt;
      this.dayAcc += dt * this.speed;
      let steps = 0;
      while (this.dayAcc >= DAY_SEC && steps < 8) {
        this.world.step(); this.dayAcc -= DAY_SEC; steps++;
        this._ingestEvents();
      }
      if (steps) { this._checkAch(); this._checkResult(); this._refreshHUD(); this._refreshLog(); }
      // report playtime every 30s
      if (this.reportAcc >= 30) { this.empire.reportPlaytime(Math.round(this.reportAcc)).catch(() => {}); this.reportAcc = 0; }
      // autosave every 60s
      if (this.autosaveAcc >= 60) { this.autosaveAcc = 0; this.save('auto', true); }
    }
    // interpolate agent motion + FX regardless (visual)
    if (this.world) {
      const k = Math.min(1, dt * 2.2);
      for (const a of this.world.agents) {
        if (!a.alive) continue;
        a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k;
      }
    }
    for (const p of this.fx) p.life -= dt;
    this.fx = this.fx.filter(p => p.life > 0);
    if (this.sel && this.sel.type === 'settlement' && (Math.round(this.playSecs * 4) % 4 === 0)) this._refreshInspector();
  }

  _ingestEvents() {
    const evs = this.world.drainEvents();
    const rm = this.renderer.reducedMotion;
    for (const e of evs) {
      const map = {
        birth: ['#8affc0', 'birth', 'birth'], union: ['#ff9bd0', 'birth', 'union'],
        death: ['#ff6a6a', 'death', 'death'], build: ['#ffd24a', 'ring', 'build'],
        tech: ['#7fe0ff', 'ring', 'tech'], found: ['#ffd24a', 'ring', 'found'],
        bless: ['#ffe66a', 'ring', 'bless'], curse: ['#b06adf', 'death', 'curse'],
        food: ['#8affc0', 'birth', 'food'], wood: ['#c99a5a', 'ring', 'wood'], stone: ['#bcbcc4', 'ring', 'stone'],
        smite: ['#ffffff', 'smite', 'smite'],
        drought: ['#e0b060', 'ring', 'disaster'], storm: ['#7fb6e6', 'ring', 'disaster'],
        plague: ['#8ab070', 'death', 'disaster'], wildfire: ['#ff7a3a', 'ring', 'disaster'],
        earthquake: ['#b08a5a', 'ring', 'disaster'],
      };
      const m = map[e.type]; if (!m) continue;
      if (!rm) this.fx.push({ x: e.x, y: e.y, color: m[0], type: m[1], life: e.big ? 1.1 : 0.7, max: e.big ? 1.1 : 0.7, big: !!e.big });
      // real 3D ragdoll on death / divine smite
      if (e.type === 'death' || e.type === 'smite') this.renderer.spawnRagdoll(e.x, e.y);
      this.audio.sfx(m[2]);
    }
  }

  _render() {
    if (!this.world) { return; }
    const season = SEASONS[Math.floor((this.world.day % DAYS_PER_YEAR) / (DAYS_PER_YEAR / 4)) % 4];
    this.renderer.draw(this.cam, this.sel, this.fx, season);
  }

  _clampCam() {
    if (!this.world) return;
    this.cam.x = Math.max(0, Math.min(this.world.W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.world.H, this.cam.y));
    this.cam.dist = Math.max(10, Math.min(150, this.cam.dist));
    this.cam.pol = Math.max(0.12, Math.min(1.4, this.cam.pol));
    if (this.cam.az > Math.PI * 2) this.cam.az -= Math.PI * 2;
    if (this.cam.az < 0) this.cam.az += Math.PI * 2;
  }

  // ---- Achievements --------------------------------------------------------
  _checkAch() {
    for (const a of ACH) {
      if (a.progressive && !this.unlocked.has(a.id)) {
        const p = Math.min(1, a.prog ? a.prog(this.world) : 0);
        if (p > 0 && p < 1) this.empire.unlockAchievement(a.id, p).catch(() => {});
      }
      if (!this.unlocked.has(a.id) && a.test(this.world)) {
        this.unlocked.add(a.id);
        this.empire.unlockAchievement(a.id, 1).catch(() => {});
        this.audio.sfx('ach');
        this._toast('Achievement: ' + a.title, a.desc, a.rarity);
        this._refreshAchTab();
      }
    }
  }

  // ---- Result state (loss = extinction, win = eternal legacy) ---------------
  _checkResult() {
    const w = this.world;
    if (!w || this.resultShown) return;
    const pop = w.livingPop();
    const year = Math.floor(w.day / DAYS_PER_YEAR);
    let title = null, win = false;
    if (pop === 0) title = 'EXTINCTION';
    else if (year >= 200) { title = 'ETERNAL LEGACY'; win = true; }
    if (!title) return;
    this.resultShown = true;
    this.prevSpeed = this.speed || 1;
    this.speed = 0;
    this._syncSpeedUI();
    $('result-title').textContent = title;
    $('result-title').style.color = win ? 'var(--acc)' : '#ff6a6a';
    $('result-body').innerHTML =
      `<div class="muted">${win
        ? 'Two centuries have passed and your people still endure. Their story outlives them.'
        : 'The last soul is gone. Your world falls silent.'}</div>` +
      `<div class="rstats">` +
      `<span>Years survived</span><b>${year}</b>` +
      `<span>Peak population</span><b>${w.stats.peakPop || 0}</b>` +
      `<span>Settlements founded</span><b>${w.stats.foundedTotal || 0}</b>` +
      `<span>Births / deaths</span><b>${w.stats.births || 0} / ${w.stats.deaths || 0}</b>` +
      `<span>Highest technology</span><b>${esc(TECHS[w.stats.maxTechIdx || 0].name)}</b>` +
      `<span>Disasters endured</span><b>${w.stats.disasters || 0}</b>` +
      `<span>Awards earned</span><b>${this.unlocked.size}/${ACH.length}</b>` +
      `</div>`;
    $('r-continue').classList.toggle('hidden', !win);
    $('result').classList.remove('hidden');
    this.audio.sfx(win ? 'ach' : 'death');
    this._toast(win ? 'Eternal Legacy' : 'Extinction', win ? `Year ${year} — your people endure` : `The world ended in Year ${year}`, win ? 'legendary' : 'common');
    this.save('auto', true);
  }

  // ---- HUD / panels --------------------------------------------------------
  _refreshHUD() {
    const w = this.world; if (!w) return;
    const year = Math.floor(w.day / DAYS_PER_YEAR);
    const season = SEASONS[Math.floor((w.day % DAYS_PER_YEAR) / (DAYS_PER_YEAR / 4)) % 4];
    $('hud-time').textContent = `Year ${year} · ${season}`;
    $('hud-pop').textContent = w.livingPop();
    $('hud-sett').textContent = w.settlements.filter(s => s.alive).length;
    let food = 0; for (const s of w.settlements) if (s.alive) food += s.stockpile.food;
    $('hud-food').textContent = Math.round(food);
    let maxTech = 0; for (const s of w.settlements) if (s.alive) maxTech = Math.max(maxTech, s.techIdx);
    $('hud-tech').textContent = TECHS[maxTech].name;
  }

  _refreshLog() {
    if ($('tab-log').classList.contains('active')) {
      const el = $('log-body'); const w = this.world;
      const rows = w.log.slice(-90).reverse().map(e =>
        `<div class="lg ${e.cat}"><span class="yr">Y${e.year}</span> ${esc(e.text)}</div>`).join('');
      el.innerHTML = rows || '<div class="muted">The world is quiet…</div>';
    }
    if ($('tab-timeline').classList.contains('active')) this._refreshTimeline();
  }

  _refreshTimeline() {
    const w = this.world; const MAJOR = new Set(['founding', 'tech', 'disaster', 'collapse', 'divine']);
    const evs = w.log.filter(e => MAJOR.has(e.cat)).slice(-120);
    const byYear = {};
    for (const e of evs) { (byYear[e.year] = byYear[e.year] || []).push(e); }
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    let html = '';
    for (const y of years) {
      html += `<div class="tl-year"><div class="tl-badge">Year ${y}</div><div class="tl-events">` +
        byYear[y].map(e => `<div class="tl-ev ${e.cat}">${esc(e.text)}</div>`).join('') + `</div></div>`;
    }
    $('tl-body').innerHTML = html || '<div class="muted">No milestones yet.</div>';
  }

  _refreshAchTab() {
    const el = $('ach-body'); if (!el) return;
    let done = 0;
    const rows = ACH.map(a => {
      const got = this.unlocked.has(a.id);
      if (got) done++;
      const title = (a.hidden && !got) ? '???' : a.title;
      const desc = (a.hidden && !got) ? 'Hidden achievement.' : a.desc;
      return `<div class="ach ${got ? 'got' : ''} ${a.rarity}"><div class="ach-ic">${got ? '★' : '☆'}</div>` +
        `<div><div class="ach-t">${esc(title)}</div><div class="ach-d">${esc(desc)}</div></div></div>`;
    }).join('');
    $('ach-count').textContent = `${done}/${ACH.length}`;
    el.innerHTML = rows;
  }

  _refreshInspector() {
    const box = $('inspector'); const w = this.world;
    if (!this.sel) { box.classList.add('hidden'); return; }
    if (this.sel.type === 'agent') {
      const a = w.agent(this.sel.id);
      if (!a) { this.sel = null; box.classList.add('hidden'); return; }
      const s = w.settlement(a.settId);
      const partner = a.partner ? (w.agent(a.partner) || {}).name || '—' : '—';
      const kids = a.children.map(id => (w.agent(id) || {}).name).filter(Boolean);
      const mem = a.memory.slice(-6).reverse().map(m => `<li>Y${(m.day / DAYS_PER_YEAR) | 0}: ${esc(m.text)}</li>`).join('');
      box.innerHTML = `<div class="insp-hd"><b>${esc(a.name)}</b> <button class="x" data-close>✕</button></div>
        <div class="insp-sub">${a.sex === 'F' ? 'Female' : 'Male'} · age ${a.age | 0} · ${a.job}${a.blessed > 0 ? ' · <span class="bless">blessed</span>' : ''}${a.cursed > 0 ? ' · <span class="curse">cursed</span>' : ''}</div>
        <div class="stat">Health ${bar(a.health)} </div>
        <div class="stat">Hunger ${bar(1 - Math.min(1, a.hunger))}</div>
        <div class="insp-row">Home: ${s ? esc(s.name) : '—'} · Gen ${a.gen}</div>
        <div class="insp-row">Partner: ${esc(partner)} · Children: ${kids.length}</div>
        <div class="insp-mem"><b>Memories</b><ul>${mem || '<li class="muted">None yet.</li>'}</ul></div>
        <div class="insp-act"><button data-bless>Bless</button><button data-curse>Curse</button></div>`;
      box.classList.remove('hidden');
    } else if (this.sel.type === 'settlement') {
      const s = w.settlement(this.sel.id);
      if (!s) { this.sel = null; box.classList.add('hidden'); return; }
      const pop = s.members.length;
      const bcount = {};
      for (const b of s.buildings) bcount[b.type] = (bcount[b.type] || 0) + 1;
      const blist = Object.entries(bcount).map(([k, v]) => `${k}×${v}`).join(', ');
      const next = TECHS[s.techIdx + 1];
      const techProg = next ? Math.min(1, s.techPoints / next.cost) : 1;
      box.innerHTML = `<div class="insp-hd"><b>${esc(s.name)}</b> <span class="tier">${s.tier || 'Camp'}</span> <button class="x" data-close>✕</button></div>
        <div class="insp-sub">Founded Year ${(s.founded / DAYS_PER_YEAR) | 0} · Pop ${pop}</div>
        <div class="insp-row res">🌾 ${Math.round(s.stockpile.food)} &nbsp; 🪵 ${Math.round(s.stockpile.wood)} &nbsp; ⛏️ ${Math.round(s.stockpile.stone)}</div>
        <div class="insp-row">Tech: <b>${TECHS[s.techIdx].name}</b></div>
        <div class="stat">${next ? 'Researching ' + next.name : 'Max tech'} ${bar(techProg)}</div>
        <div class="insp-row">Buildings: ${blist || 'campfire'}</div>
        <div class="insp-row">${s.buildQueue ? 'Building: ' + s.buildQueue.type : 'Idle'}</div>
        <div class="insp-act"><button data-bless>Bless</button><button data-curse>Curse</button><button data-food>+Food</button><button data-disaster>Disaster</button></div>`;
      box.classList.remove('hidden');
    }
    // wire inspector buttons
    box.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { this.sel = null; box.classList.add('hidden'); });
    const at = this._selAt();
    box.querySelectorAll('[data-bless]').forEach(b => b.onclick = () => { this._applyBless(); });
    box.querySelectorAll('[data-curse]').forEach(b => b.onclick = () => { this._applyCurse(); });
    box.querySelectorAll('[data-food]').forEach(b => b.onclick = () => { if (at) { this.world.spawnResource(at.x, at.y, 'food', 40); this._ingestEvents(); } });
    box.querySelectorAll('[data-disaster]').forEach(b => b.onclick = () => { const s = this.world.settlement(this.sel.id); if (s) { this.world.triggerDisaster(this.disasterKind, s, true); this._ingestEvents(); } });
  }

  _selAt() {
    const w = this.world; if (!this.sel) return null;
    if (this.sel.type === 'agent') { const a = w.agent(this.sel.id); return a ? { x: a.x, y: a.y } : null; }
    const s = w.settlement(this.sel.id); return s ? { x: s.cx, y: s.cy } : null;
  }
  _applyBless() {
    const w = this.world; if (!this.sel) return;
    if (this.sel.type === 'agent') { const a = w.agent(this.sel.id); if (a) w.bless({ agent: a, at: { x: a.x, y: a.y } }); }
    else { const s = w.settlement(this.sel.id); if (s) w.bless({ settlement: s, at: { x: s.cx, y: s.cy } }); }
    this._ingestEvents(); this._checkAch();
  }
  _applyCurse() {
    const w = this.world; if (!this.sel) return;
    if (this.sel.type === 'agent') { const a = w.agent(this.sel.id); if (a) w.curse({ agent: a, at: { x: a.x, y: a.y } }); }
    else { const s = w.settlement(this.sel.id); if (s) w.curse({ settlement: s, at: { x: s.cx, y: s.cy } }); }
    this._ingestEvents(); this._checkAch();
  }

  // ---- Input ---------------------------------------------------------------
  _bindInput() {
    const cv = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this._togglePause(); }
      else if (e.code === 'Escape') { this._toggleMenu(); }
      else if (e.code === 'Digit1') this._setSpeed(1);
      else if (e.code === 'Digit2') this._setSpeed(2);
      else if (e.code === 'Digit3') this._setSpeed(4);
      else if (e.code === 'Digit4') this._setSpeed(8);
      else if (e.code === 'KeyM') this._focusFirst();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      this.audio.resume();
      // right = orbit rotate, middle = pan
      if (e.button === 2) { this.drag = { mode: 'rotate', x: e.clientX, y: e.clientY, cam: { ...this.cam } }; }
      else if (e.button === 1) { e.preventDefault(); this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, cam: { ...this.cam } }; }
      else if (e.button === 0) { this._leftClick(e); }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (this.drag.mode === 'rotate') {
          const invert = this.invertY ? -1 : 1;
          this.cam.az = this.drag.cam.az + dx * 0.006;
          this.cam.pol = this.drag.cam.pol + dy * 0.005 * invert; // mouse up = look up (non-inverted)
        } else {
          const fx = -Math.sin(this.cam.az), fy = -Math.cos(this.cam.az);
          const rx = -fy, ry = fx;
          const k = this.cam.dist * 0.0016;
          this.cam.x = this.drag.cam.x - (rx * dx + fx * -dy) * k;
          this.cam.y = this.drag.cam.y - (ry * dx + fy * -dy) * k;
        }
        this._clampCam();
      } else { this._hover(e); }
    });
    window.addEventListener('mouseup', () => { this.drag = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.dist *= e.deltaY < 0 ? 1 / 1.12 : 1.12;
      this._clampCam();
    }, { passive: false });
    // touch pan/zoom (basic)
    let lastTouch = null, lastDist = null;
    cv.addEventListener('touchstart', (e) => { this.audio.resume(); if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && lastTouch) {
        const t = e.touches[0];
        const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y;
        const fx = -Math.sin(this.cam.az), fy = -Math.cos(this.cam.az), rx = -fy, ry = fx;
        const k = this.cam.dist * 0.0016;
        this.cam.x -= (rx * dx + fx * -dy) * k; this.cam.y -= (ry * dx + fy * -dy) * k;
        lastTouch = { x: t.clientX, y: t.clientY }; this._clampCam();
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastDist) { this.cam.dist *= lastDist / d; this._clampCam(); } lastDist = d;
      }
    }, { passive: true });
    cv.addEventListener('touchend', () => { lastTouch = null; lastDist = null; });
  }

  _leftClick(e) {
    if (!this.world) return;
    const rect = this.canvas.getBoundingClientRect();
    const [wx, wy] = this.renderer.screenToWorld(this.cam, e.clientX - rect.left, e.clientY - rect.top);
    const w = this.world;
    const pick = this._pick(wx, wy);
    switch (this.tool) {
      case 'inspect':
        this.sel = pick; this._refreshInspector(); this.audio.sfx('click'); break;
      case 'bless': {
        if (pick && pick.type === 'agent') { const a = w.agent(pick.id); w.bless({ agent: a, at: { x: a.x, y: a.y } }); }
        else { const s = pick && pick.type === 'settlement' ? w.settlement(pick.id) : w._nearestSettlement(wx, wy); if (s) w.bless({ settlement: s, at: { x: s.cx, y: s.cy } }); }
        this._ingestEvents(); this._checkAch(); break;
      }
      case 'curse': {
        if (pick && pick.type === 'agent') { const a = w.agent(pick.id); w.curse({ agent: a, at: { x: a.x, y: a.y } }); }
        else { const s = pick && pick.type === 'settlement' ? w.settlement(pick.id) : w._nearestSettlement(wx, wy); if (s) w.curse({ settlement: s, at: { x: s.cx, y: s.cy } }); }
        this._ingestEvents(); this._checkAch(); break;
      }
      case 'food': w.spawnResource(wx, wy, 'food', 40); this._ingestEvents(); this._checkAch(); break;
      case 'wood': w.spawnResource(wx, wy, 'wood', 30); this._ingestEvents(); this.renderer.terrainDirty = true; break;
      case 'stone': w.spawnResource(wx, wy, 'stone', 30); this._ingestEvents(); this.renderer.terrainDirty = true; break;
      case 'disaster': { const s = pick && pick.type === 'settlement' ? w.settlement(pick.id) : w._nearestSettlement(wx, wy); if (s) w.triggerDisaster(this.disasterKind, s, true); this._ingestEvents(); this._checkAch(); break; }
      case 'smite': w.smite(wx, wy); this._ingestEvents(); this._checkAch(); break;
    }
  }

  _pick(wx, wy) {
    const w = this.world;
    let best = null, bd = 1.2;
    for (const a of w.agents) { if (!a.alive) continue; const d = Math.hypot(a.x - wx, a.y - wy); if (d < bd) { bd = d; best = { type: 'agent', id: a.id }; } }
    if (best) return best;
    let sb = null, sd = 4;
    for (const s of w.settlements) { if (!s.alive) continue; const d = Math.hypot(s.cx - wx, s.cy - wy); if (d < sd) { sd = d; sb = { type: 'settlement', id: s.id }; } }
    return sb;
  }

  _hover(e) {
    if (!this.world) return;
    const rect = this.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right) return;
    const [wx, wy] = this.renderer.screenToWorld(this.cam, e.clientX - rect.left, e.clientY - rect.top);
    const pick = this._pick(wx, wy);
    const tip = $('tooltip');
    if (pick) {
      let txt = '';
      if (pick.type === 'agent') { const a = this.world.agent(pick.id); txt = `${a.name} · ${a.job} · age ${a.age | 0}`; }
      else { const s = this.world.settlement(pick.id); txt = `${s.name} · ${s.members.length} people`; }
      tip.textContent = txt; tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY + 12 + 'px';
      tip.classList.remove('hidden');
      this.canvas.style.cursor = this.tool === 'inspect' ? 'pointer' : 'crosshair';
    } else { tip.classList.add('hidden'); this.canvas.style.cursor = this.tool === 'inspect' ? 'default' : 'crosshair'; }
  }

  _gamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp || (this.settings && this.settings.controls && this.settings.controls.gamepadEnabled === false)) return;
    const dz = 0.15;
    const lx = Math.abs(gp.axes[0]) > dz ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > dz ? gp.axes[1] : 0;
    // left stick pans (camera-relative), right stick rotates (non-inverted)
    const fx = -Math.sin(this.cam.az), fy = -Math.cos(this.cam.az), rx = -fy, ry = fx;
    const sp = this.cam.dist * dt * 1.4;
    this.cam.x += (rx * lx + fx * -ly) * sp; this.cam.y += (ry * lx + fy * -ly) * sp;
    const rxAxis = Math.abs(gp.axes[2]) > dz ? gp.axes[2] : 0;
    const ryAxis = Math.abs(gp.axes[3]) > dz ? gp.axes[3] : 0;
    this.cam.az += rxAxis * 1.8 * dt;
    this.cam.pol += ryAxis * 1.2 * dt * (this.invertY ? -1 : 1);
    // zoom with triggers
    if (gp.buttons[7] && gp.buttons[7].pressed) this.cam.dist *= 1 - dt;
    if (gp.buttons[6] && gp.buttons[6].pressed) this.cam.dist *= 1 + dt;
    // Start = pause
    const start = gp.buttons[9] && gp.buttons[9].pressed;
    if (start && !this._gpStart) this._togglePause();
    this._gpStart = start;
    this._clampCam();
  }

  _focusFirst() {
    const s = this.world && this.world.settlements.find(s => s.alive);
    if (s) { this.cam.x = s.cx; this.cam.y = s.cy; }
  }

  // ---- UI wiring -----------------------------------------------------------
  _bindUI() {
    // start screen
    let diff = 'normal';
    document.querySelectorAll('.diff-btn').forEach(b => b.onclick = () => {
      diff = b.dataset.diff; document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); this.audio.sfx('click');
    });
    $('btn-new').onclick = () => {
      const raw = $('seed-input').value.trim();
      const seed = raw ? hashSeed(raw) : (Math.random() * 1e9) >>> 0;
      this.newGame(diff, seed, raw ? 'Seed: ' + raw : null);
    };
    $('btn-daily').onclick = () => {
      const ds = todayStr();
      const seed = hashSeed('civ-daily-' + ds);
      this.newGame('normal', seed, 'Daily ' + ds);
    };
    $('btn-continue').onclick = () => { this.loadSlot(this.pendingLoadSlot || 'auto'); };

    // speed controls
    $('sp-pause').onclick = () => this._togglePause();
    document.querySelectorAll('.sp').forEach(b => b.onclick = () => this._setSpeed(+b.dataset.sp));

    // power tools
    document.querySelectorAll('.pw').forEach(b => b.onclick = () => {
      this.tool = b.dataset.tool; this.audio.sfx('click');
      document.querySelectorAll('.pw').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      $('disaster-picker').classList.toggle('hidden', this.tool !== 'disaster');
    });
    document.querySelectorAll('.dk').forEach(b => b.onclick = () => {
      this.disasterKind = b.dataset.kind; document.querySelectorAll('.dk').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
    });

    // side tabs
    document.querySelectorAll('.tabbtn').forEach(b => b.onclick = () => {
      document.querySelectorAll('.tabbtn').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); $(b.dataset.tab).classList.add('active');
      if (b.dataset.tab === 'tab-achievements') this._refreshAchTab();
      if (b.dataset.tab === 'tab-timeline') this._refreshTimeline();
      if (b.dataset.tab === 'tab-log') this._refreshLog();
    });
    $('side-toggle').onclick = () => $('side').classList.toggle('collapsed');

    // menu
    $('btn-menu').onclick = () => this._toggleMenu();
    $('m-resume').onclick = () => this._toggleMenu();
    $('m-save').onclick = () => this._openSaves('save');
    $('m-load').onclick = () => this._openSaves('load');
    $('m-new').onclick = () => { if (confirm('Abandon this world and start over?')) { $('menu').classList.add('hidden'); this._showStart(); } };
    $('saves-close').onclick = () => $('saves-modal').classList.add('hidden');

    // result screen
    $('r-continue').onclick = () => {
      $('result').classList.add('hidden');
      this.speed = this.prevSpeed || 1; this._syncSpeedUI(); this.audio.sfx('click');
    };
    $('r-new').onclick = () => { $('result').classList.add('hidden'); this.audio.sfx('click'); this._showStart(); };
  }

  _showStart() {
    $('hud').classList.add('hidden'); $('side').classList.add('hidden'); $('powerbar').classList.add('hidden');
    $('inspector').classList.add('hidden'); $('menu').classList.add('hidden');
    $('result').classList.add('hidden'); $('saves-modal').classList.add('hidden');
    $('start-screen').classList.remove('hidden');
    this.world = null; this.renderer.world = null;
    this.resultShown = false;
  }
  _hide(id) { $(id).classList.add('hidden'); }

  _menuOpen() { return !$('menu').classList.contains('hidden') || !$('saves-modal').classList.contains('hidden') || !$('start-screen').classList.contains('hidden') || !$('result').classList.contains('hidden'); }
  _toggleMenu() {
    if (!this.world) return;
    const m = $('menu');
    const willOpen = m.classList.contains('hidden');
    m.classList.toggle('hidden');
    if (willOpen) { this.prevSpeed = this.speed; }
  }

  _togglePause() {
    if (!this.world) return;
    if (this.speed === 0) { this.speed = this.prevSpeed || 1; }
    else { this.prevSpeed = this.speed; this.speed = 0; }
    this._syncSpeedUI();
  }
  _setSpeed(s) { if (!this.world) return; this.speed = s; this._syncSpeedUI(); }
  _syncSpeedUI() {
    $('sp-pause').textContent = this.speed === 0 ? '▶' : '⏸';
    $('sp-pause').classList.toggle('sel', this.speed === 0);
    document.querySelectorAll('.sp').forEach(b => b.classList.toggle('sel', +b.dataset.sp === this.speed));
  }

  // ---- Save / load ---------------------------------------------------------
  _thumb() {
    try {
      const t = document.createElement('canvas'); const scale = Math.min(1, 480 / this.canvas.width);
      t.width = this.canvas.width * scale; t.height = this.canvas.height * scale;
      t.getContext('2d').drawImage(this.canvas, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', 0.55);
    } catch { return null; }
  }
  _meta(label) {
    const w = this.world; const year = Math.floor(w.day / DAYS_PER_YEAR);
    return {
      label: label || `Year ${year}`, playtimeSec: Math.round(this.playSecs),
      thumbnail: this._thumb(), progress: `Year ${year} · Pop ${w.livingPop()}`,
      mode: w.difficulty, difficulty: w.difficulty, seed: w.seed,
    };
  }
  _blob() {
    return { world: this.world.serialize(), unlocked: [...this.unlocked], playSecs: this.playSecs, cam: this.cam, challengeLabel: this.challengeLabel || null, resultShown: !!this.resultShown };
  }
  async save(slot, silent) {
    if (!this.world) return;
    try {
      await this.empire.saveState(slot, this._blob(), this._meta(this.challengeLabel));
      await this.empire.setContinuePoint(slot, `Year ${Math.floor(this.world.day / DAYS_PER_YEAR)}`);
      if (!silent) this._toast('Saved', slot === 'auto' ? 'Autosave' : slot, 'common');
    } catch (e) { if (!silent) this._toast('Save failed', String(e.message || e), 'common'); }
  }
  async loadSlot(slot) {
    try {
      const rec = await this.empire.loadState(slot);
      if (!rec || !rec.blob) { this._toast('No save', 'Nothing in ' + slot, 'common'); return; }
      const b = rec.blob;
      this.world = World.deserialize(b.world);
      this.renderer.setWorld(this.world);
      this.unlocked = new Set(b.unlocked || []);
      this.playSecs = b.playSecs || 0;
      this.cam = b.cam || { x: this.world.W / 2, y: this.world.H / 2, dist: 55, az: 0.6, pol: 0.82 };
      if (this.cam.dist === undefined) this.cam = { x: this.cam.x, y: this.cam.y, dist: 55, az: 0.6, pol: 0.82 };
      this.challengeLabel = b.challengeLabel || null;
      this.resultShown = !!b.resultShown;
      this.speed = 1; this.dayAcc = 0;
      this._hide('start-screen'); $('saves-modal').classList.add('hidden'); $('menu').classList.add('hidden'); $('result').classList.add('hidden');
      $('hud').classList.remove('hidden'); $('side').classList.remove('hidden'); $('powerbar').classList.remove('hidden');
      this.audio.resume(); this.audio.startMusic();
      this._refreshHUD(); this._refreshLog(); this._refreshAchTab(); this._syncSpeedUI();
      this._toast('World loaded', `Year ${Math.floor(this.world.day / DAYS_PER_YEAR)}`, 'rare');
    } catch (e) {
      this._toast('Load failed', String(e.message || e), 'common');
    }
  }
  async _openSaves(mode) {
    const modal = $('saves-modal'); modal.classList.remove('hidden');
    $('saves-title').textContent = mode === 'save' ? 'Save World' : 'Load World';
    let saves = [];
    try { const r = await this.empire.listSaves(); saves = (r && r.saves) ? r.saves : (Array.isArray(r) ? r : []); } catch { }
    const byslot = {}; for (const s of saves) byslot[s.slot] = s;
    const slots = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
    const rows = ['auto', ...slots].map(slot => {
      const rec = byslot[slot];
      const meta = rec && rec.meta || null;
      const info = meta ? `${esc(meta.label || slot)} · ${esc(meta.progress || '')}` : '<span class="muted">empty</span>';
      const thumb = meta && meta.thumbnail ? `<img src="${meta.thumbnail}">` : '<div class="noimg">—</div>';
      const canSave = mode === 'save' && slot !== 'auto';
      const canLoad = mode === 'load' && rec;
      return `<div class="slotrow"><div class="slotthumb">${thumb}</div><div class="slotinfo"><b>${slot}</b><div>${info}</div></div>` +
        `<div class="slotact">${canSave ? `<button data-save="${slot}">Save</button>` : ''}${canLoad ? `<button data-load="${slot}">Load</button>` : ''}</div></div>`;
    }).join('');
    $('saves-body').innerHTML = rows;
    $('saves-body').querySelectorAll('[data-save]').forEach(b => b.onclick = async () => { await this.save(b.dataset.save); this._openSaves('save'); });
    $('saves-body').querySelectorAll('[data-load]').forEach(b => b.onclick = () => this.loadSlot(b.dataset.load));
  }

  // ---- Toasts --------------------------------------------------------------
  _toast(title, sub, rarity) {
    const t = document.createElement('div');
    t.className = 'toast ' + (rarity || 'common') + (this.renderer.reducedMotion ? ' rm' : '');
    t.innerHTML = `<div class="tt">${esc(title)}</div><div class="ts">${esc(sub || '')}</div>`;
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, 3200);
  }
}

function bar(v) { v = Math.max(0, Math.min(1, v)); return `<span class="minibar"><span style="width:${(v * 100) | 0}%"></span></span>`; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// save on blur/hide
const game = new Game();
window.addEventListener('beforeunload', () => { if (game.world) { game.empire.reportPlaytime(Math.round(game.reportAcc)).catch(() => {}); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.world) { game.save('auto', true); game.empire.reportPlaytime(Math.round(game.reportAcc)).catch(() => {}); game.reportAcc = 0; }
});
game.boot();
window.__civ = game;
