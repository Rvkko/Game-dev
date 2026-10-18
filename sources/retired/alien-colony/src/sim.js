// ============================================================================
// Xeno Frontier — colony simulation (grid world, colonists, jobs, needs,
// resources, research, incidents). Pure logic; no rendering/DOM.
// ============================================================================

export const GRID = 40;          // cells per side
export const CELL = 2.5;         // world units per cell

// ---- seeded RNG (mulberry32) ----
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return (h >>> 0);
}
export function makeRNG(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ['Ava', 'Ren', 'Kai', 'Mira', 'Jax', 'Lena', 'Cole', 'Zoe', 'Rook', 'Ivy', 'Dex', 'Nova', 'Sol', 'Wren', 'Bram', 'Tala', 'Fenn', 'Iris', 'Vic', 'Rhea', 'Orin', 'Suki', 'Pax', 'Nyla'];
const LAST = ['Vex', 'Hale', 'Orr', 'Kade', 'Sول', 'Bryn', 'Corel', 'Dane', 'Ash', 'Vane', 'Rho', 'Quill', 'Stark', 'Wynn', 'Zell'];

// ---- building definitions ----
// cost=materials, build=work-seconds, pw=power (neg=consumer,pos=gen),
// job = which worker operates it. size in cells.
export const BUILDINGS = {
  command:    { name: 'Command Center', cost: 0,  build: 0,  pw: 4,  o2: 0,   size: 2, hp: 400, color: 0x9fb4d8, storage: true, houses: 4, tech: null },
  solar:      { name: 'Solar Array',    cost: 12, build: 8,  pw: 10, o2: 0,   size: 1, hp: 100, color: 0x3f6ea5, solar: true, tech: null },
  geothermal: { name: 'Geothermal Plant', cost: 40, build: 22, pw: 26, o2: 0, size: 1, hp: 180, color: 0xc76a3a, tech: 'geo' },
  habitat:    { name: 'Habitat Dome',   cost: 18, build: 12, pw: -3, o2: 0,   size: 2, hp: 200, color: 0xd8d2c4, houses: 4, tech: null },
  farm:       { name: 'Hydroponics Farm', cost: 15, build: 10, pw: -4, o2: 1, size: 2, hp: 120, color: 0x4caf6a, job: 'farm', foodRate: 0.16, tech: null },
  oxygen:     { name: 'Oxygenator',     cost: 20, build: 12, pw: -6, o2: 8,   size: 1, hp: 120, color: 0x59c0d8, tech: null },
  mine:       { name: 'Ore Extractor',  cost: 14, build: 9,  pw: -4, o2: 0,   size: 1, hp: 120, color: 0xb0a070, job: 'mine', matRate: 0.22, needsRock: true, tech: null },
  lab:        { name: 'Research Lab',   cost: 25, build: 14, pw: -5, o2: 0,   size: 2, hp: 140, color: 0xa06ad8, job: 'research', resRate: 0.20, tech: null },
  medbay:     { name: 'Medbay',         cost: 22, build: 12, pw: -4, o2: 1,   size: 1, hp: 130, color: 0xe06a8a, heal: true, tech: 'med' },
  turret:     { name: 'Auto-Turret',    cost: 18, build: 8,  pw: -3, o2: 0,   size: 1, hp: 160, color: 0x8a94a6, turret: true, range: 16, dps: 26, tech: 'def' },
  wall:       { name: 'Barricade',      cost: 4,  build: 3,  pw: 0,  o2: 0,   size: 1, hp: 300, color: 0x6b7280, wall: true, tech: null },
  storage:    { name: 'Storage Depot',  cost: 10, build: 6,  pw: 0,  o2: 0,   size: 2, hp: 200, color: 0xc0a878, storage: true, tech: null },
  escape:     { name: 'Escape Ship',    cost: 120, build: 60, pw: -10, o2: 0, size: 3, hp: 500, color: 0xe8c14a, escape: true, tech: 'escape' },
};

export const TECHS = [
  { id: 'geo',    name: 'Geothermal Power',   cost: 30,  desc: 'Unlocks the Geothermal Plant (heavy power).', req: [] },
  { id: 'hydro',  name: 'Advanced Hydroponics', cost: 40, desc: 'Farms produce +60% food.', req: [] },
  { id: 'solar2', name: 'Photovoltaics',      cost: 35,  desc: 'Solar Arrays generate +50% power.', req: [] },
  { id: 'def',    name: 'Defense Systems',    cost: 45,  desc: 'Unlocks Auto-Turrets.', req: [] },
  { id: 'med',    name: 'Xenomedicine',       cost: 40,  desc: 'Unlocks the Medbay (cures disease fast).', req: [] },
  { id: 'drill',  name: 'Deep Drilling',      cost: 50,  desc: 'Ore Extractors mine +70% materials.', req: ['geo'] },
  { id: 'o2rec',  name: 'Oxygen Recycling',   cost: 45,  desc: 'Oxygenators use 40% less power.', req: [] },
  { id: 'terra',  name: 'Terraforming',       cost: 70,  desc: 'Colonists gain a lasting morale boost.', req: ['hydro'] },
  { id: 'shield', name: 'Shield Matrix',      cost: 80,  desc: 'Buildings take 40% less damage.', req: ['def'] },
  { id: 'escape', name: 'Escape Blueprint',   cost: 120, desc: 'Unlocks the Escape Ship — your way home.', req: ['geo', 'hydro'] },
];

export const DIFFS = {
  easy:      { name: 'Settler',   incident: 95, raidMul: 0.6, startMat: 45, startFood: 30, decay: 0.85, label: 'Relaxed. Rare, gentle incidents.' },
  normal:    { name: 'Colonist',  incident: 70, raidMul: 1.0, startMat: 35, startFood: 22, decay: 1.0,  label: 'The intended challenge.' },
  hard:      { name: 'Pioneer',   incident: 52, raidMul: 1.5, startMat: 28, startFood: 16, decay: 1.15, label: 'Frequent storms and raids.' },
  nightmare: { name: 'Forsaken',  incident: 40, raidMul: 2.1, startMat: 22, startFood: 12, decay: 1.3,  label: 'A dying world. Good luck.' },
};

let _uid = 1;
const uid = () => _uid++;

export class World {
  constructor(opts) {
    this.seed = opts.seed >>> 0;
    this.rng = makeRNG(this.seed);
    this.diff = DIFFS[opts.difficulty] || DIFFS.normal;
    this.daily = !!opts.daily;
    this.time = 0;            // seconds elapsed
    this.food = this.diff.startFood;
    this.materials = this.diff.startMat;
    this.research = 0;
    this.colonists = [];
    this.buildings = [];
    this.aliens = [];
    this.projectiles = [];
    this.corpses = [];       // {x,z,t} for ragdoll spawn requests
    this.effects = [];       // transient {type,x,z,...} consumed by renderer
    this.log = [];
    this.researched = new Set();
    this.techInProgress = null;
    this.incidentTimer = this.diff.incident * (0.6 + this.rng() * 0.5);
    this.activeStorm = null;
    this.activeRaid = null;
    this.disease = null;
    this.priorities = { build: 3, mine: 2, farm: 2, research: 1, haul: 2 };
    this.stats = { deaths: 0, births: 0, buildsDone: 0, raidsRepelled: 0, stormsSurvived: 0, peakPop: 0, powerSurplusHit: false, foodGrown: false };
    this.won = false; this.lost = false; this.launching = 0;
    this.power = { gen: 0, use: 0 };
    this.o2 = { gen: 0, use: 0 };
    this.terraBoost = 0;
    this._buildGrid();
    this._genTerrain();
    this._placeStart();
    this.log.push({ t: 0, msg: `Colony pod touched down on sector ${this.seed % 9999}.`, kind: 'good' });
  }

  _buildGrid() {
    this.grid = [];
    for (let z = 0; z < GRID; z++) { const row = []; for (let x = 0; x < GRID; x++) row.push({ h: 0, rock: false, ice: false, occ: 0 }); this.grid.push(row); }
  }
  _genTerrain() {
    const r = this.rng;
    // gentle heightfield via layered value noise
    const seedA = r() * 100, seedB = r() * 100;
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const n = Math.sin((x + seedA) * 0.35) * Math.cos((z + seedB) * 0.32) + Math.sin((x - z) * 0.18) * 0.6;
      this.grid[z][x].h = n * 0.9;
    }
    // scatter rock (mineable) clusters and ice
    let rocks = 0;
    for (let i = 0; i < 90; i++) {
      const cx = 3 + Math.floor(r() * (GRID - 6)), cz = 3 + Math.floor(r() * (GRID - 6));
      if (Math.abs(cx - GRID / 2) < 4 && Math.abs(cz - GRID / 2) < 4) continue;
      const c = this.grid[cz][cx];
      if (r() < 0.7) { c.rock = true; c.h += 0.6 + r() * 1.2; rocks++; }
      else c.ice = true;
    }
    if (rocks < 20) { for (let i = 0; i < 20; i++) { const cx = Math.floor(r() * GRID), cz = Math.floor(r() * GRID); this.grid[cz][cx].rock = true; } }
  }
  heightAt(gx, gz) { if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return 0; return this.grid[gz][gx].h; }
  worldX(gx) { return (gx - GRID / 2) * CELL; }
  worldZ(gz) { return (gz - GRID / 2) * CELL; }
  gridX(x) { return Math.round(x / CELL + GRID / 2); }
  gridZ(z) { return Math.round(z / CELL + GRID / 2); }

  _placeStart() {
    const cx = Math.floor(GRID / 2), cz = Math.floor(GRID / 2);
    this.addBuilding('command', cx, cz, true);
    this.addBuilding('solar', cx + 3, cz, true);
    this.addBuilding('solar', cx - 3, cz, true);
    for (let i = 0; i < 4; i++) this.spawnColonist(cx + (i - 1.5) * 1.2, cz + 3);
  }

  spawnColonist(gx, gz) {
    const name = FIRST[Math.floor(this.rng() * FIRST.length)] + ' ' + LAST[Math.floor(this.rng() * LAST.length)];
    const c = {
      id: uid(), name,
      x: this.worldX(gx) + (this.rng() - 0.5), z: this.worldZ(gz) + (this.rng() - 0.5),
      tx: 0, tz: 0, hasTarget: false,
      hunger: 15 + this.rng() * 15, energy: 70 + this.rng() * 25, health: 100, morale: 65,
      job: null, workTimer: 0, state: 'idle', sick: false, alive: true,
      color: 0xffe0b0, hue: this.rng(), speed: 3.0 + this.rng() * 0.6, bob: this.rng() * 6.28,
    };
    this.colonists.push(c);
    this.stats.peakPop = Math.max(this.stats.peakPop, this.living().length);
    return c;
  }
  living() { return this.colonists.filter(c => c.alive); }

  canPlace(type, gx, gz) {
    const def = BUILDINGS[type]; const s = def.size;
    if (gx < 1 || gz < 1 || gx + s > GRID - 1 || gz + s > GRID - 1) return false;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const c = this.grid[gz + dz][gx + dx];
      if (c.occ) return false;
      if (def.needsRock) { /* extractor must sit ON rock */ }
      else if (c.rock) return false;
    }
    if (def.needsRock) {
      let onRock = false;
      for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) if (this.grid[gz + dz][gx + dx].rock) onRock = true;
      if (!onRock) return false;
    }
    return true;
  }

  addBuilding(type, gx, gz, prebuilt = false) {
    const def = BUILDINGS[type]; const s = def.size;
    const b = {
      id: uid(), type, def, gx, gz, size: s,
      x: this.worldX(gx) + (s - 1) * CELL / 2, z: this.worldZ(gz) + (s - 1) * CELL / 2,
      hp: def.hp, maxHp: def.hp, built: prebuilt, buildProg: prebuilt ? def.build : 0,
      powered: prebuilt, active: false, worker: null, cooldown: 0, animT: this.rng() * 6.28,
    };
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[gz + dz][gx + dx].occ = b.id;
    this.buildings.push(b);
    if (!prebuilt) this.materials -= def.cost;
    return b;
  }
  removeBuilding(b) {
    for (let dz = 0; dz < b.size; dz++) for (let dx = 0; dx < b.size; dx++) { const c = this.grid[b.gz + dz]?.[b.gx + dx]; if (c && c.occ === b.id) c.occ = 0; }
    this.buildings = this.buildings.filter(x => x !== b);
    for (const c of this.colonists) if (c.job && c.job.b === b) c.job = null;
  }

  techUnlocked(id) { return this.researched.has(id); }
  canBuild(type) {
    const def = BUILDINGS[type];
    if (def.tech && !this.researched.has(def.tech)) return false;
    return true;
  }

  startResearch(id) {
    const t = TECHS.find(x => x.id === id);
    if (!t || this.researched.has(id)) return false;
    if (this.research < t.cost) return false;
    if (t.req.some(r => !this.researched.has(r))) return false;
    this.research -= t.cost;
    this.researched.add(id);
    if (id === 'terra') this.terraBoost = 15;
    this.log.push({ t: this.time, msg: `Research complete: ${t.name}.`, kind: 'tech' });
    this.effects.push({ type: 'research', x: 0, z: 0 });
    return true;
  }

  // ---------------------------------------------------------------- main tick
  step(dt) {
    if (this.won || this.lost) { this._stepProjectiles(dt); this._stepAliens(dt); return; }
    this.time += dt;
    this._power();
    this._incidents(dt);
    this._buildingsTick(dt);
    this._colonistsTick(dt);
    this._stepAliens(dt);
    this._stepProjectiles(dt);
    this._checkPop(dt);
    this._checkEnd();
  }

  _power() {
    let gen = 0, use = 0, o2g = 0, o2u = 0;
    const stormMul = this.activeStorm ? 0.2 : 1;
    for (const b of this.buildings) {
      if (!b.built) continue;
      const d = b.def;
      let p = d.pw;
      if (d.solar) { p = (d.pw) * (this.researched.has('solar2') ? 1.5 : 1) * stormMul; }
      if (d.o2 && b.type === 'oxygen' && this.researched.has('o2rec')) p = d.pw; // consumer handled below
      if (p > 0) gen += p;
    }
    // determine which consumers get power (priority: command/hab/oxygen > farm/lab/mine/turret/escape)
    const consumers = this.buildings.filter(b => b.built && b.def.pw < 0);
    consumers.sort((a, b) => prio(b) - prio(a));
    let avail = gen;
    for (const b of consumers) {
      let need = -b.def.pw;
      if (b.type === 'oxygen' && this.researched.has('o2rec')) need *= 0.6;
      if (avail >= need) { b.powered = true; avail -= need; use += need; }
      else b.powered = false;
    }
    for (const b of this.buildings) if (b.built && b.def.pw > 0) b.powered = true;
    // oxygen
    for (const b of this.buildings) {
      if (!b.built || !b.powered) continue;
      if (b.def.o2 > 0) o2g += b.def.o2;
    }
    o2u = this.living().length * 0.9;
    this.power = { gen: Math.round(gen), use: Math.round(use) };
    this.o2 = { gen: +o2g.toFixed(1), use: +o2u.toFixed(1) };
    if (gen - use > 0 && gen > 14 && !this.stats.powerSurplusHit) this.stats.powerSurplusHit = true;
    this.o2deficit = o2u > o2g + 0.1;
  }

  _buildingsTick(dt) {
    for (const b of this.buildings) {
      b.animT += dt;
      if (b.cooldown > 0) b.cooldown -= dt;
      b.active = false;
      if (!b.built) continue;
      if (b.def.turret && b.powered) this._turretFire(b, dt);
      if (b.def.heal && b.powered) { // medbay passive cure aura
        for (const c of this.living()) if (c.sick && dist2(c.x, c.z, b.x, b.z) < 100) { c.sick = false; c.health = Math.min(100, c.health + 30); }
      }
    }
  }

  _colonistsTick(dt) {
    const decay = this.diff.decay;
    for (const c of this.colonists) {
      if (!c.alive) continue;
      c.bob += dt * 6;
      c.hunger = Math.min(120, c.hunger + 0.55 * decay * dt);
      c.energy = Math.max(0, c.energy - 0.32 * decay * dt);
      if (c.sick) c.health -= 0.7 * dt;
      // oxygen deficit hurts everyone
      if (this.o2deficit) c.health -= 2.4 * dt;
      // starvation
      if (c.hunger >= 118) c.health -= 2.0 * dt;
      else if (c.health < 100 && !c.sick && !this.o2deficit) c.health = Math.min(100, c.health + 0.4 * dt);
      // morale target
      let mt = 55 + this.terraBoost;
      if (this.food > 5) mt += 12; else mt -= 15;
      if (this._hasShelter()) mt += 10; else mt -= 10;
      if (c.hunger > 80) mt -= 15;
      if (c.energy < 20) mt -= 10;
      if (c.sick) mt -= 15;
      if (this.activeStorm) mt -= 8;
      if (this.activeRaid) mt -= 12;
      mt = clamp(mt, 5, 100);
      c.morale += (mt - c.morale) * Math.min(1, dt * 0.15);
      // death
      if (c.health <= 0) { this._killColonist(c); continue; }
      this._colonistAI(c, dt);
      this._moveColonist(c, dt);
    }
  }

  _hasShelter() {
    let houses = 0;
    for (const b of this.buildings) if (b.built && b.def.houses) houses += b.def.houses;
    return houses >= this.living().length * 0.6;
  }

  _colonistAI(c, dt) {
    // critical needs override
    if (c.state !== 'eat' && c.hunger > 78 && this.food > 0) { this._assignEat(c); }
    else if (c.state !== 'sleep' && c.energy < 22) { this._assignSleep(c); }

    if (c.state === 'eat') {
      if (c.hasTarget) return; // walking to storage
      this.food = Math.max(0, this.food - 2); c.hunger = 10; c.state = 'idle'; c.job = null;
      this.effects.push({ type: 'eat', x: c.x, z: c.z });
      return;
    }
    if (c.state === 'sleep') {
      c.energy = Math.min(100, c.energy + 9 * dt);
      c.health = Math.min(100, c.health + 1.5 * dt);
      if (c.energy >= 95) { c.state = 'idle'; c.job = null; }
      return;
    }
    // work
    if (c.job) {
      const b = c.job.b;
      if (!b || !b.built === undefined) {}
      if (c.hasTarget) return; // en route
      // at job site
      if (c.job.kind === 'build') {
        if (!b || b.built) { c.job = null; return; }
        b.buildProg += 1.2 * dt;
        b.active = true;
        if (b.buildProg >= b.def.build) { b.built = true; b.buildProg = b.def.build; this._onBuilt(b); c.job = null; }
        return;
      }
      if (!b || !b.built || !b.powered) { c.job = null; return; }
      b.active = true;
      if (b.def.job === 'mine') { this.materials += b.def.matRate * (this.researched.has('drill') ? 1.7 : 1) * dt; }
      else if (b.def.job === 'farm') { this.food += b.def.foodRate * (this.researched.has('hydro') ? 1.6 : 1) * dt; this.stats.foodGrown = true; }
      else if (b.def.job === 'research') { this.research += b.def.resRate * dt; }
      c.workTimer += dt;
      if (c.workTimer > 6 + this.rng() * 4) { c.job = null; c.workTimer = 0; } // re-evaluate
      return;
    }
    // pick a new job
    this._pickJob(c);
  }

  _pickJob(c) {
    const pr = this.priorities;
    const options = [];
    // build sites
    const site = this.buildings.find(b => !b.built && b.buildProg < b.def.build && !this._workerAssigned(b));
    if (site) options.push({ score: pr.build * 10, fn: () => { c.job = { kind: 'build', b: site }; this._goto(c, site.x, site.z); } });
    // operate buildings needing worker
    for (const b of this.buildings) {
      if (!b.built || !b.def.job || !b.powered || this._workerAssigned(b)) continue;
      let p = 0;
      if (b.def.job === 'mine') p = pr.mine;
      else if (b.def.job === 'farm') p = pr.farm * (this.food < 12 ? 2 : 1);
      else if (b.def.job === 'research') p = pr.research;
      options.push({ score: p * 10 + this.rng() * 3, fn: () => { c.job = { kind: 'op', b }; this._goto(c, b.x, b.z); } });
    }
    if (!options.length) { // idle wander
      if (this.rng() < 0.02) this._goto(c, c.x + (this.rng() - 0.5) * 8, c.z + (this.rng() - 0.5) * 8);
      return;
    }
    options.sort((a, b) => b.score - a.score);
    options[0].fn();
  }
  _workerAssigned(b) { return this.colonists.some(c => c.alive && c.job && c.job.b === b); }

  _assignEat(c) {
    const st = this.buildings.find(b => b.built && (b.def.storage || b.type === 'command')) || this.buildings[0];
    c.state = 'eat'; c.job = null;
    if (st) this._goto(c, st.x + (this.rng() - 0.5) * 2, st.z + (this.rng() - 0.5) * 2); else c.hasTarget = false;
  }
  _assignSleep(c) {
    const hab = this.buildings.find(b => b.built && b.def.houses);
    c.state = 'sleep'; c.job = null;
    if (hab) this._goto(c, hab.x + (this.rng() - 0.5) * 2, hab.z + (this.rng() - 0.5) * 2); else c.hasTarget = false;
  }
  _goto(c, x, z) { c.tx = x; c.tz = z; c.hasTarget = true; }
  _moveColonist(c, dt) {
    if (!c.hasTarget) return;
    const dx = c.tx - c.x, dz = c.tz - c.z; const d = Math.hypot(dx, dz);
    if (d < 0.4) { c.hasTarget = false; return; }
    const sp = c.speed * (c.energy < 15 ? 0.6 : 1);
    c.x += (dx / d) * sp * dt; c.z += (dz / d) * sp * dt;
    c.dir = Math.atan2(dx, dz);
  }

  _onBuilt(b) {
    this.stats.buildsDone++;
    this.log.push({ t: this.time, msg: `${b.def.name} constructed.`, kind: 'build' });
    this.effects.push({ type: 'build', x: b.x, z: b.z });
  }

  _killColonist(c) {
    c.alive = false; c.health = 0; c.job = null; c.hasTarget = false;
    this.stats.deaths++;
    this.corpses.push({ x: c.x, z: c.z, t: this.time });
    this.log.push({ t: this.time, msg: `${c.name} has died.`, kind: 'bad' });
    this.effects.push({ type: 'death', x: c.x, z: c.z });
  }

  _checkPop(dt) {
    // growth: if morale high, food surplus, shelter -> new colonist occasionally
    this._growAcc = (this._growAcc || 0) + dt;
    if (this._growAcc > 20) {
      this._growAcc = 0;
      const pop = this.living().length;
      const avgM = pop ? this.living().reduce((s, c) => s + c.morale, 0) / pop : 0;
      if (this.food > pop * 3 && avgM > 62 && this._hasShelter() && pop < 24 && this.rng() < 0.55) {
        const cc = this.buildings[0];
        const nc = this.spawnColonist(this.gridX(cc.x), this.gridZ(cc.z) + 2);
        this.stats.births++;
        this.log.push({ t: this.time, msg: `${nc.name} joined the colony.`, kind: 'good' });
        this.effects.push({ type: 'birth', x: nc.x, z: nc.z });
      }
    }
    this.stats.peakPop = Math.max(this.stats.peakPop, this.living().length);
  }

  // ---------------------------------------------------------------- incidents
  _incidents(dt) {
    if (this.activeStorm) { this.activeStorm.t -= dt; if (this.activeStorm.t <= 0) { this.activeStorm = null; this.stats.stormsSurvived++; this.log.push({ t: this.time, msg: 'The dust storm has passed.', kind: 'good' }); } }
    if (this.disease) { this.disease.t -= dt; if (this.disease.t <= 0) this.disease = null; }
    this.incidentTimer -= dt;
    if (this.incidentTimer > 0) return;
    this.incidentTimer = this.diff.incident * (0.7 + this.rng() * 0.6);
    if (this.time < 40) return; // grace period
    const roll = this.rng();
    if (roll < 0.4) this._startStorm();
    else if (roll < 0.72) this._startRaid();
    else this._startDisease();
  }
  _startStorm() {
    const dur = 18 + this.rng() * 16;
    this.activeStorm = { t: dur, max: dur };
    this.log.push({ t: this.time, msg: 'A dust storm rolls in! Solar power crippled.', kind: 'warn' });
    this.effects.push({ type: 'alarm' });
    // chip damage over storm handled via periodic
  }
  _startDisease() {
    const victims = this.living().filter(() => this.rng() < 0.35);
    if (!victims.length && this.living().length) victims.push(this.living()[0]);
    for (const c of victims) c.sick = true;
    this.disease = { t: 30 };
    this.log.push({ t: this.time, msg: `An outbreak sickens ${victims.length} colonist(s).`, kind: 'warn' });
    this.effects.push({ type: 'alarm' });
  }
  _startRaid() {
    const n = Math.round((2 + this.rng() * 3 + this.time / 90) * this.diff.raidMul);
    const edge = Math.floor(this.rng() * 4);
    for (let i = 0; i < n; i++) {
      let x, z; const m = (GRID / 2) * CELL - 1;
      if (edge === 0) { x = -m; z = (this.rng() - 0.5) * m * 2; }
      else if (edge === 1) { x = m; z = (this.rng() - 0.5) * m * 2; }
      else if (edge === 2) { z = -m; x = (this.rng() - 0.5) * m * 2; }
      else { z = m; x = (this.rng() - 0.5) * m * 2; }
      this.aliens.push({ id: uid(), x, z, hp: 30 + this.time / 30, maxHp: 30 + this.time / 30, speed: 2.0 + this.rng(), target: null, atk: 0, bob: this.rng() * 6.28, alive: true });
    }
    this.activeRaid = { count: n };
    this.log.push({ t: this.time, msg: `Alien raid inbound — ${n} hostiles!`, kind: 'bad' });
    this.effects.push({ type: 'alarm' });
  }

  _stepAliens(dt) {
    if (!this.aliens.length) { if (this.activeRaid) { this.activeRaid = null; this.stats.raidsRepelled++; this.log.push({ t: this.time, msg: 'Raid repelled! The colony holds.', kind: 'good' }); } return; }
    for (const a of this.aliens) {
      if (!a.alive) continue;
      a.bob += dt * 8;
      // pick target: nearest colonist or building
      if (!a.target || a.target.dead || (a.target.built === false) || (a.target.alive === false)) {
        a.target = this._nearestTarget(a);
      }
      const tgt = a.target;
      if (!tgt) continue;
      const tx = tgt.x, tz = tgt.z;
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 1.6) { a.x += (dx / d) * a.speed * dt; a.z += (dz / d) * a.speed * dt; a.dir = Math.atan2(dx, dz); }
      else {
        a.atk -= dt;
        if (a.atk <= 0) {
          a.atk = 0.8;
          if (tgt.health !== undefined && tgt.alive) { tgt.health -= 10; this.effects.push({ type: 'hit', x: tgt.x, z: tgt.z }); if (tgt.health <= 0) this._killColonist(tgt); }
          else if (tgt.hp !== undefined) { tgt.hp -= 14; this.effects.push({ type: 'hit', x: tgt.x, z: tgt.z }); if (tgt.hp <= 0) { this.removeBuilding(tgt); a.target = null; } }
        }
      }
    }
    this.aliens = this.aliens.filter(a => a.alive);
  }
  _nearestTarget(a) {
    let best = null, bd = 1e9;
    for (const c of this.living()) { const d = dist2(a.x, a.z, c.x, c.z); if (d < bd) { bd = d; best = c; } }
    for (const b of this.buildings) { if (!b.built) continue; const d = dist2(a.x, a.z, b.x, b.z) * (b.def.wall ? 0.6 : 1); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  _turretFire(b, dt) {
    if (b.cooldown > 0) return;
    let best = null, bd = b.def.range * b.def.range;
    for (const a of this.aliens) { if (!a.alive) continue; const d = dist2(a.x, a.z, b.x, b.z); if (d < bd) { bd = d; best = a; } }
    if (!best) return;
    b.cooldown = 0.5;
    this.projectiles.push({ x: b.x, y: 1.6, z: b.z, tx: best.x, tz: best.z, target: best, dmg: b.def.dps * 0.5, life: 0.6, from: b });
    this.effects.push({ type: 'shoot', x: b.x, z: b.z });
  }
  _stepProjectiles(dt) {
    for (const p of this.projectiles) {
      p.life -= dt;
      const spd = 40;
      if (p.target && p.target.alive) { p.tx = p.target.x; p.tz = p.target.z; }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 1.0 || p.life <= 0) {
        if (p.target && p.target.alive) {
          p.target.hp -= p.dmg; this.effects.push({ type: 'hit', x: p.target.x, z: p.target.z });
          if (p.target.hp <= 0) { p.target.alive = false; this.corpses.push({ x: p.target.x, z: p.target.z, t: this.time, alien: true }); this.effects.push({ type: 'aliendie', x: p.target.x, z: p.target.z }); }
        }
        p.life = 0; continue;
      }
      p.x += (dx / d) * spd * dt; p.z += (dz / d) * spd * dt;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  // storm chip damage tick (call from main occasionally is fine; here folded)
  stormDamage() {
    if (!this.activeStorm) return;
    const shield = this.researched.has('shield') ? 0.6 : 1;
    for (const b of this.buildings) if (b.built && this.rng() < 0.3) { b.hp -= 6 * shield; if (b.hp <= 0) this.removeBuilding(b); }
  }

  _checkEnd() {
    if (this.living().length === 0 && !this.won) { this.lost = true; this.log.push({ t: this.time, msg: 'The last colonist has fallen. Colony lost.', kind: 'bad' }); return; }
    // launch sequence
    if (this.launching > 0) return;
  }

  escapeReady() {
    const ship = this.buildings.find(b => b.type === 'escape' && b.built);
    return ship && this.living().length >= 3;
  }
  launchEscape() {
    if (!this.escapeReady()) return false;
    this.won = true;
    this.log.push({ t: this.time, msg: 'Escape ship launched! The survivors go home.', kind: 'good' });
    this.effects.push({ type: 'launch', x: 0, z: 0 });
    return true;
  }

  // ---- save / load ----
  serialize() {
    return {
      seed: this.seed, diff: this.diffKey(), daily: this.daily, time: this.time,
      food: this.food, materials: this.materials, research: this.research,
      colonists: this.colonists.map(c => ({ ...c, job: null })),
      buildings: this.buildings.map(b => ({ id: b.id, type: b.type, gx: b.gx, gz: b.gz, hp: b.hp, built: b.built, buildProg: b.buildProg })),
      researched: [...this.researched], priorities: this.priorities, stats: this.stats,
      grid: this.grid.map(row => row.map(c => (c.rock ? 1 : 0) | (c.ice ? 2 : 0))),
      won: this.won, lost: this.lost,
    };
  }
  diffKey() { for (const k in DIFFS) if (DIFFS[k] === this.diff) return k; return 'normal'; }

  static deserialize(data) {
    const w = new World({ seed: data.seed, difficulty: data.diff, daily: data.daily });
    // rebuild deterministic-ish from data (override generated)
    w.time = data.time; w.food = data.food; w.materials = data.materials; w.research = data.research;
    w.researched = new Set(data.researched || []);
    w.priorities = data.priorities || w.priorities;
    w.stats = data.stats || w.stats;
    w.won = data.won; w.lost = data.lost;
    // reset grid occupancy & rocks from saved grid
    if (data.grid) for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) { const v = data.grid[z][x]; w.grid[z][x].rock = !!(v & 1); w.grid[z][x].ice = !!(v & 2); w.grid[z][x].occ = 0; }
    w.buildings = []; w.colonists = [];
    for (const bd of data.buildings) { const b = w.addBuilding(bd.type, bd.gx, bd.gz, bd.built); b.hp = bd.hp; b.buildProg = bd.buildProg; if (!bd.built) { b.built = false; w.materials += b.def.cost; } }
    for (const cd of data.colonists) { const c = { ...cd, job: null, hasTarget: false, state: 'idle' }; w.colonists.push(c); }
    if (w.researched.has('terra')) w.terraBoost = 15;
    return w;
  }
}

// ---- helpers ----
function prio(b) {
  if (b.type === 'command' || b.def.houses) return 100;
  if (b.type === 'oxygen') return 90;
  if (b.type === 'medbay') return 70;
  if (b.def.turret) return 60;
  if (b.def.job === 'farm') return 50;
  if (b.def.job === 'mine') return 40;
  if (b.def.job === 'research') return 30;
  if (b.type === 'escape') return 20;
  return 10;
}
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
