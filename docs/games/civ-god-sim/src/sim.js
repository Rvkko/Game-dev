/* ============================================================================
 * Civilization God Simulator — Simulation core (deterministic, seedable).
 * No DOM here. Pure data + logic so it can be serialized/saved wholesale.
 * ==========================================================================*/

// ---- Seeded RNG (mulberry32) -----------------------------------------------
export function makeRNG(seed) {
  let a = seed >>> 0;
  const fn = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.state = () => a >>> 0;
  fn.setState = (s) => { a = s >>> 0; };
  return fn;
}
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- Constants -------------------------------------------------------------
export const TERRAIN = { WATER: 0, GRASS: 1, FOREST: 2, HILL: 3, DESERT: 4, MOUNTAIN: 5 };
export const DAYS_PER_YEAR = 8;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const TECHS = [
  { id: 'fire',         name: 'Fire',          cost: 0,    yieldMul: 1.00 },
  { id: 'tools',        name: 'Stone Tools',   cost: 40,   yieldMul: 1.25 },
  { id: 'agriculture',  name: 'Agriculture',   cost: 140,  yieldMul: 1.6  },
  { id: 'pottery',      name: 'Pottery',       cost: 320,  yieldMul: 1.9  },
  { id: 'construction', name: 'Construction',  cost: 620,  yieldMul: 2.2  },
  { id: 'writing',      name: 'Writing',       cost: 1100, yieldMul: 2.6  },
  { id: 'bronze',       name: 'Bronze Working',cost: 1900, yieldMul: 3.1  },
];

export const JOBS = ['gatherer', 'hunter', 'farmer', 'builder', 'crafter', 'child', 'elder'];

const DIFFS = {
  peaceful: { foodMul: 1.35, disasterRate: 0.10, decayMul: 0.8,  startFood: 60 },
  normal:   { foodMul: 1.00, disasterRate: 0.22, decayMul: 1.0,  startFood: 40 },
  harsh:    { foodMul: 0.78, disasterRate: 0.40, decayMul: 1.25, startFood: 26 },
};

const SYL_A = ['Ka', 'Ro', 'Mi', 'Ta', 'Su', 'Bel', 'Dor', 'Ae', 'Vor', 'Lun', 'Ser', 'Tho', 'Ny', 'Gal', 'Ur', 'Fen', 'Cae', 'Bry'];
const SYL_B = ['ran', 'mir', 'los', 'na', 'thas', 'wyn', 'dor', 'kel', 'via', 'mon', 'gar', 'sha', 'lin', 'ric', 'dan', 'beth', 'wen', 'tor'];
const SETT_A = ['Stone', 'River', 'Oak', 'High', 'Sun', 'Grey', 'Wolf', 'Ember', 'Pine', 'Gold', 'Frost', 'Raven', 'Bright', 'Deep'];
const SETT_B = ['haven', 'ford', 'vale', 'hold', 'wick', 'crest', 'mere', 'reach', 'stead', 'gard', 'fall', 'hollow'];

// ============================================================================
export class World {
  constructor(opts = {}) {
    this.W = opts.W || 72;
    this.H = opts.H || 72;
    this.seed = (opts.seed >>> 0) || 12345;
    this.difficulty = opts.difficulty || 'normal';
    this.rng = makeRNG(this.seed);
    this.tiles = null;        // terrain
    this.resource = null;     // spawned resource nodes (food/wood/stone amount)
    this.fertility = null;
    this.agents = [];
    this.settlements = [];
    this.log = [];
    this.day = 0;
    this.tick = 0;            // total days elapsed (== day but kept for clarity)
    this._nextAgentId = 1;
    this._nextSettId = 1;
    this.stats = {
      births: 0, deaths: 0, disasters: 0, foundedTotal: 0,
      peakPop: 0, peakSett: 0, maxAge: 0, maxGen: 1, maxTechIdx: 0,
      blessUses: 0, curseUses: 0, spawnUses: 0, disastersSurvived: 0,
    };
    this.flags = {};          // one-shot event flags for achievements
    this._events = [];        // transient per-step notable events for FX layer
  }

  diff() { return DIFFS[this.difficulty] || DIFFS.normal; }

  // ---- Generation ----------------------------------------------------------
  generate() {
    const { W, H, rng } = this;
    this.tiles = new Uint8Array(W * H);
    this.resource = new Float32Array(W * H);
    this.fertility = new Float32Array(W * H);
    // Value-noise-ish elevation & moisture using summed sines with seeded phases.
    const ph = () => rng() * Math.PI * 2;
    const oct = [
      { fx: 0.06, fy: 0.05, px: ph(), py: ph(), a: 1.0 },
      { fx: 0.13, fy: 0.11, px: ph(), py: ph(), a: 0.5 },
      { fx: 0.27, fy: 0.29, px: ph(), py: ph(), a: 0.25 },
    ];
    const moc = [
      { fx: 0.05, fy: 0.07, px: ph(), py: ph(), a: 1.0 },
      { fx: 0.15, fy: 0.12, px: ph(), py: ph(), a: 0.5 },
    ];
    const sample = (bank, x, y) => {
      let v = 0, amp = 0;
      for (const o of bank) { v += o.a * Math.sin(x * o.fx + o.px) * Math.cos(y * o.fy + o.py); amp += o.a; }
      return (v / amp) * 0.5 + 0.5;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        // island falloff so map has natural coastline
        const nx = (x / W) * 2 - 1, ny = (y / H) * 2 - 1;
        const fall = 1 - Math.min(1, (nx * nx + ny * ny) * 0.62);
        let e = sample(oct, x, y) * 0.72 + fall * 0.5;
        const m = sample(moc, x, y);
        let t;
        if (e < 0.34) t = TERRAIN.WATER;
        else if (e > 0.82) t = TERRAIN.MOUNTAIN;
        else if (e > 0.68) t = TERRAIN.HILL;
        else if (m < 0.35 && e < 0.5) t = TERRAIN.DESERT;
        else if (m > 0.58) t = TERRAIN.FOREST;
        else t = TERRAIN.GRASS;
        this.tiles[i] = t;
        // base fertility for farming
        this.fertility[i] = t === TERRAIN.GRASS ? 0.5 + m * 0.5
          : t === TERRAIN.FOREST ? 0.35 + m * 0.3
          : t === TERRAIN.HILL ? 0.15 : 0.02;
        // natural resource nodes
        if (t === TERRAIN.FOREST && rng() < 0.5) this.resource[i] = 40 + rng() * 60; // wood/berries
        else if (t === TERRAIN.HILL && rng() < 0.35) this.resource[i] = 30 + rng() * 50; // stone
      }
    }
    // Seed the first tribe near a fertile grass tile
    const start = this._findFertileSpot();
    const s = this._foundSettlement(start.x, start.y, null);
    for (let k = 0; k < 6; k++) {
      const a = this._makeAgent(start.x + (rng() - 0.5) * 3, start.y + (rng() - 0.5) * 3, s.id,
        18 + Math.floor(rng() * 20), rng() < 0.5 ? 'M' : 'F', 1);
      s.members.push(a.id);
    }
    s.stockpile.food = this.diff().startFood;
    this._log('founding', `The tribe of ${s.name} settles the wild.`, s.center);
    this.stats.foundedTotal = 1;
    return this;
  }

  _findFertileSpot() {
    const { W, H } = this;
    let best = null, bestScore = -1;
    for (let n = 0; n < 400; n++) {
      const x = 4 + Math.floor(this.rng() * (W - 8));
      const y = 4 + Math.floor(this.rng() * (H - 8));
      const i = y * W + x;
      if (this.tiles[i] === TERRAIN.WATER || this.tiles[i] === TERRAIN.MOUNTAIN) continue;
      let score = this.fertility[i] * 4;
      // reward nearby forest (wood) & water (drink)
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = this.tiles[yy * W + xx];
        if (t === TERRAIN.FOREST) score += 0.4;
        if (t === TERRAIN.WATER) score += 0.25;
        if (t === TERRAIN.HILL) score += 0.15;
      }
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    return best || { x: (W / 2) | 0, y: (H / 2) | 0 };
  }

  // ---- Factories -----------------------------------------------------------
  _name() { return SYL_A[(this.rng() * SYL_A.length) | 0] + SYL_B[(this.rng() * SYL_B.length) | 0]; }
  _settName() { return SETT_A[(this.rng() * SETT_A.length) | 0] + SETT_B[(this.rng() * SETT_B.length) | 0]; }

  _makeAgent(x, y, settId, age, sex, gen) {
    const a = {
      id: this._nextAgentId++,
      name: this._name(),
      x, y, tx: x, ty: y,          // pos + steering target
      settId, sex,
      age,                          // in years (float)
      gen,                          // generation number
      job: age < 14 ? 'child' : (age > 55 ? 'elder' : 'gatherer'),
      hunger: 0.15 + this.rng() * 0.2, energy: 1, health: 1, safety: 1,
      partner: null, parents: [], children: [],
      carrying: 0, carryType: null,
      state: 'idle', target: null, workTimer: 0,
      blessed: 0, cursed: 0,        // remaining days of buff/debuff
      memory: [],
      born: this.day,
      alive: true,
    };
    this.agents.push(a);
    return a;
  }

  _foundSettlement(x, y, founderIds) {
    const s = {
      id: this._nextSettId++,
      name: this._settName(),
      cx: x, cy: y, center: { x, y },
      members: founderIds ? founderIds.slice() : [],
      stockpile: { food: 8, wood: 6, stone: 0 },
      buildings: [{ type: 'campfire', x, y }],
      techIdx: 0, techPoints: 0,
      founded: this.day,
      buildQueue: null, buildProgress: 0,
      moraleEvents: 0,
      alive: true,
    };
    this.settlements.push(s);
    this.stats.peakSett = Math.max(this.stats.peakSett, this.settlements.filter(v => v.alive).length);
    return s;
  }

  agent(id) { return this.agents.find(a => a.id === id && a.alive); }
  settlement(id) { return this.settlements.find(s => s.id === id && s.alive); }

  // ---- Logging -------------------------------------------------------------
  _log(cat, text, at) {
    this.log.push({ day: this.day, year: (this.day / DAYS_PER_YEAR) | 0, cat, text, at: at ? { x: at.x, y: at.y } : null });
    if (this.log.length > 800) this.log.splice(0, this.log.length - 800);
  }
  _fx(type, x, y, extra) { this._events.push({ type, x, y, ...extra }); }
  drainEvents() { const e = this._events; this._events = []; return e; }

  // ==========================================================================
  //  MAIN DAY STEP
  // ==========================================================================
  step() {
    this.day++; this.tick++;
    const diff = this.diff();
    const season = SEASONS[((this.day / DAYS_PER_YEAR) | 0) % 4 === undefined ? 0 :
      Math.floor((this.day % DAYS_PER_YEAR) / (DAYS_PER_YEAR / 4)) % 4];
    const winter = season === 'Winter';
    const seasonFood = winter ? 0.55 : season === 'Summer' ? 1.2 : 1.0;

    // --- Per-settlement economy ---
    for (const s of this.settlements) {
      if (!s.alive) continue;
      this._stepSettlement(s, diff, seasonFood);
    }

    // --- Per-agent life ---
    for (const a of this.agents) {
      if (!a.alive) continue;
      this._stepAgent(a, diff);
    }

    // --- Reproduction, pairing, founding (settlement-level) ---
    for (const s of this.settlements) {
      if (!s.alive) continue;
      this._pairing(s);
      this._reproduce(s);
      this._maybeSplit(s);
    }

    // --- Disasters ---
    this._maybeDisaster(diff);

    // --- Cleanup dead settlements ---
    for (const s of this.settlements) {
      if (s.alive && this._settPop(s) === 0) {
        s.alive = false;
        this._log('collapse', `${s.name} falls silent — its last soul is gone.`, s.center);
      }
    }

    // --- Stats / peaks ---
    const pop = this.livingPop();
    this.stats.peakPop = Math.max(this.stats.peakPop, pop);
    this.stats.peakSett = Math.max(this.stats.peakSett, this.settlements.filter(s => s.alive).length);
  }

  _settPop(s) { let n = 0; for (const id of s.members) { const a = this.agent(id); if (a) n++; } return n; }
  livingPop() { let n = 0; for (const a of this.agents) if (a.alive) n++; return n; }

  _stepSettlement(s, diff, seasonFood) {
    // gather member list (living)
    const mem = s.members.map(id => this.agent(id)).filter(Boolean);
    s.members = mem.map(a => a.id);
    const pop = mem.length;
    if (pop === 0) return;

    const tech = TECHS[s.techIdx];
    const ymul = tech.yieldMul * diff.foodMul;

    // Role auto-assignment: balance based on needs.
    this._assignRoles(s, mem);

    // Production
    let food = 0, wood = 0, stone = 0, research = 0;
    for (const a of mem) {
      if (a.job === 'child' || a.job === 'elder') { research += 0.1; continue; }
      const eff = (a.health) * (a.blessed > 0 ? 1.4 : 1) * (a.cursed > 0 ? 0.55 : 1);
      if (a.job === 'gatherer') food += 2.1 * eff * ymul * seasonFood;
      else if (a.job === 'hunter') food += 2.6 * eff * ymul * (seasonFood * 0.5 + 0.5);
      else if (a.job === 'farmer') food += 3.4 * eff * ymul * seasonFood * (s.techIdx >= 2 ? 1 : 0.4);
      else if (a.job === 'builder') { wood += 1.4 * eff; stone += s.techIdx >= 1 ? 0.9 * eff : 0.3 * eff; }
      else if (a.job === 'crafter') { research += 0.9 * eff; wood += 0.4 * eff; }
      research += 0.25 * eff;
    }
    s.stockpile.food += food;
    s.stockpile.wood += wood;
    s.stockpile.stone += stone;

    // Consumption: 1 food per person per day (elders/children a bit less)
    let need = 0; for (const a of mem) need += (a.job === 'child' ? 0.6 : a.job === 'elder' ? 0.8 : 1);
    need *= diff.decayMul;
    s.stockpile.food -= need;
    if (s.stockpile.food < 0) {
      // starvation — spread hunger, chance of death handled per-agent
      const deficit = -s.stockpile.food;
      s.stockpile.food = 0;
      for (const a of mem) { a.hunger = Math.min(1.4, a.hunger + 0.14 * (deficit / Math.max(1, pop))); }
    } else {
      // well-fed reduces hunger
      const surplus = s.stockpile.food;
      for (const a of mem) a.hunger = Math.max(0, a.hunger - (surplus > pop ? 0.35 : 0.18));
    }
    // food spoils / cap by storage buildings
    const cap = 30 + 40 * s.buildings.filter(b => b.type === 'storage').length + pop * 4;
    if (s.stockpile.food > cap) s.stockpile.food = cap;

    // Research / tech progression
    s.techPoints += research + pop * 0.15;
    const next = TECHS[s.techIdx + 1];
    if (next && s.techPoints >= next.cost) {
      s.techIdx++;
      this.stats.maxTechIdx = Math.max(this.stats.maxTechIdx, s.techIdx);
      this._log('tech', `${s.name} discovers ${next.name}!`, s.center);
      this._fx('tech', s.cx, s.cy);
      for (const a of mem) this._remember(a, `We learned ${next.name}.`);
    }

    // Construction: decide & build
    this._construction(s, mem, pop);
  }

  _assignRoles(s, mem) {
    const foodLow = s.stockpile.food < mem.length * 2;
    const needWood = s.buildQueue && s.stockpile.wood < 12;
    let bi = 0;
    for (const a of mem) {
      if (a.age < 14) { a.job = 'child'; continue; }
      if (a.age > 62) { a.job = 'elder'; continue; }
      // deterministic-ish rotation weighted by needs
      const r = (a.id + this.day) % 10;
      if (foodLow) {
        a.job = s.techIdx >= 2 && a.fertility !== undefined ? 'farmer' : (r < 3 ? 'hunter' : (s.techIdx >= 2 && r < 7 ? 'farmer' : 'gatherer'));
      } else if (needWood && r < 4) {
        a.job = 'builder';
      } else if (r < 2 && s.techIdx >= 1) {
        a.job = 'crafter';
      } else if (r < 5) {
        a.job = s.techIdx >= 2 ? 'farmer' : 'gatherer';
      } else if (r < 7) {
        a.job = 'hunter';
      } else if (s.buildQueue) {
        a.job = 'builder';
      } else {
        a.job = s.techIdx >= 2 ? 'farmer' : 'gatherer';
      }
      bi++;
    }
  }

  _construction(s, mem, pop) {
    const has = (t) => s.buildings.filter(b => b.type === t).length;
    // Decide next project
    if (!s.buildQueue) {
      const huts = has('hut');
      if (huts < Math.ceil(pop / 3)) s.buildQueue = { type: 'hut', wood: 10, stone: 0 };
      else if (s.techIdx >= 1 && has('storage') < 1 + ((pop / 10) | 0)) s.buildQueue = { type: 'storage', wood: 14, stone: 4 };
      else if (s.techIdx >= 2 && has('farm') < Math.ceil(pop / 4)) s.buildQueue = { type: 'farm', wood: 8, stone: 2 };
      else if (s.techIdx >= 1 && has('well') < 1) s.buildQueue = { type: 'well', wood: 6, stone: 8 };
      else if (s.techIdx >= 3 && has('workshop') < 1) s.buildQueue = { type: 'workshop', wood: 20, stone: 16 };
      else if (s.techIdx >= 4 && has('wall') < 1 && pop >= 12) s.buildQueue = { type: 'wall', wood: 30, stone: 30 };
      else if (s.techIdx >= 5 && has('temple') < 1 && pop >= 16) s.buildQueue = { type: 'temple', wood: 26, stone: 40 };
    }
    const q = s.buildQueue;
    if (!q) return;
    if (s.stockpile.wood >= q.wood && s.stockpile.stone >= q.stone) {
      s.buildProgress += Math.max(1, mem.filter(a => a.job === 'builder').length) + 0.5;
      if (s.buildProgress >= 6) {
        s.stockpile.wood -= q.wood; s.stockpile.stone -= q.stone;
        // place near center on non-water tile
        const spot = this._placeNear(s.cx, s.cy, s.buildings.length);
        s.buildings.push({ type: q.type, x: spot.x, y: spot.y });
        this._log('build', `${s.name} builds a ${q.type}.`, s.center);
        this._fx('build', spot.x, spot.y);
        s.buildQueue = null; s.buildProgress = 0;
        // upgrade name tier by building count
        this._retier(s, pop);
      }
    }
  }

  _placeNear(cx, cy, seed) {
    for (let r = 1; r < 6; r++) {
      for (let n = 0; n < 8; n++) {
        const ang = (seed * 1.7 + n) * 0.9;
        const x = Math.round(cx + Math.cos(ang) * r);
        const y = Math.round(cy + Math.sin(ang) * r);
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
        const t = this.tiles[y * this.W + x];
        if (t !== TERRAIN.WATER && t !== TERRAIN.MOUNTAIN) return { x, y };
      }
    }
    return { x: cx, y: cy };
  }

  _retier(s, pop) {
    const b = s.buildings.length;
    let tier = 'Camp';
    if (pop >= 25 || b >= 14) tier = 'Town';
    else if (pop >= 10 || b >= 7) tier = 'Village';
    else if (pop >= 4) tier = 'Hamlet';
    if (s.tier !== tier) { s.tier = tier; }
  }

  _stepAgent(a, diff) {
    const yearFrac = 1 / DAYS_PER_YEAR;
    a.age += yearFrac;
    this.stats.maxAge = Math.max(this.stats.maxAge, a.age);
    this.stats.maxGen = Math.max(this.stats.maxGen, a.gen);
    if (a.blessed > 0) a.blessed--;
    if (a.cursed > 0) a.cursed--;

    // health from hunger
    if (a.hunger > 0.85) a.health -= 0.06 * diff.decayMul;
    else if (a.hunger < 0.4) a.health = Math.min(1, a.health + 0.03 + (a.blessed > 0 ? 0.05 : 0));
    if (a.cursed > 0) a.health -= 0.015;
    a.health = Math.max(0, Math.min(1.2, a.health));

    // steering target: pick a purposeful destination for visual life
    if (a.state === 'idle' || this.rng() < 0.03) this._pickTarget(a);

    // death checks: old age (rising after 60), starvation, health collapse
    const oldRisk = a.age > 60 ? (a.age - 60) * 0.0016 : 0;
    const starveRisk = a.health <= 0 ? 0.5 : (a.hunger > 1 ? (a.hunger - 1) * 0.05 : 0);
    const sickRisk = a.health < 0.2 ? (0.2 - a.health) * 0.08 : 0;
    if (this.rng() < oldRisk + starveRisk + sickRisk) {
      this._kill(a, a.age > 60 ? 'old age' : a.hunger > 1 ? 'starvation' : 'illness');
    }
  }

  _pickTarget(a) {
    const s = this.settlement(a.settId);
    if (!s) return;
    const r = this.rng();
    if (a.job === 'gatherer' || a.job === 'hunter' || a.job === 'farmer' || a.job === 'builder' || a.job === 'crafter') {
      if (r < 0.6) {
        // head toward a resource/work tile
        const t = this._nearestResourceTile(s.cx, s.cy, a.job);
        a.tx = t.x + (this.rng() - 0.5) * 1.5; a.ty = t.y + (this.rng() - 0.5) * 1.5;
        a.state = 'working';
      } else {
        a.tx = s.cx + (this.rng() - 0.5) * 4; a.ty = s.cy + (this.rng() - 0.5) * 4;
        a.state = 'home';
      }
    } else {
      a.tx = s.cx + (this.rng() - 0.5) * 3; a.ty = s.cy + (this.rng() - 0.5) * 3;
      a.state = 'idle';
    }
  }

  _nearestResourceTile(cx, cy, job) {
    const want = job === 'builder' ? [TERRAIN.FOREST, TERRAIN.HILL]
      : job === 'farmer' ? [TERRAIN.GRASS]
      : job === 'hunter' ? [TERRAIN.FOREST, TERRAIN.GRASS]
      : [TERRAIN.FOREST, TERRAIN.GRASS];
    let best = { x: cx, y: cy }, bd = 1e9;
    for (let r = 1; r < 8; r++) {
      for (let n = 0; n < 10; n++) {
        const ang = this.rng() * Math.PI * 2;
        const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
        if (want.includes(this.tiles[y * this.W + x])) {
          const d = r; if (d < bd) { bd = d; best = { x, y }; if (this.rng() < 0.6) return best; }
        }
      }
      if (bd < 1e9 && r > 3) break;
    }
    return best;
  }

  _kill(a, cause) {
    if (!a.alive) return;
    a.alive = false;
    this.stats.deaths++;
    const s = this.settlement(a.settId);
    this._log('death', `${a.name} dies of ${cause} at age ${a.age | 0}.`, s ? s.center : { x: a.x, y: a.y });
    this._fx('death', a.x, a.y);
    // widow / orphans remember
    if (a.partner) { const p = this.agent(a.partner); if (p) { p.partner = null; this._remember(p, `My partner ${a.name} passed away.`); } }
    for (const cid of a.children) { const c = this.agent(cid); if (c) this._remember(c, `My parent ${a.name} died.`); }
  }

  _remember(a, text) {
    a.memory.push({ day: this.day, text });
    if (a.memory.length > 12) a.memory.shift();
  }

  _pairing(s) {
    const mem = s.members.map(id => this.agent(id)).filter(Boolean);
    const singlesM = mem.filter(a => a.sex === 'M' && !a.partner && a.age >= 16 && a.age <= 55);
    const singlesF = mem.filter(a => a.sex === 'F' && !a.partner && a.age >= 16 && a.age <= 55);
    const n = Math.min(singlesM.length, singlesF.length);
    for (let i = 0; i < n; i++) {
      if (this.rng() < 0.12) {
        const m = singlesM[i], f = singlesF[i];
        if (m.parents.includes(f.id) || f.parents.includes(m.id)) continue;
        m.partner = f.id; f.partner = m.id;
        this._remember(m, `I partnered with ${f.name}.`);
        this._remember(f, `I partnered with ${m.name}.`);
        this._log('union', `${m.name} and ${f.name} start a family in ${s.name}.`, s.center);
        this._fx('union', s.cx, s.cy);
      }
    }
  }

  _reproduce(s) {
    const mem = s.members.map(id => this.agent(id)).filter(Boolean);
    const pop = mem.length;
    const foodOK = s.stockpile.food > pop * 1.5;
    for (const f of mem) {
      if (f.sex !== 'F' || !f.partner || f.age < 16 || f.age > 45) continue;
      if (!foodOK) continue;
      // per-day chance -> ~ once every couple years when healthy
      let chance = 0.010 * f.health;
      if (f.blessed > 0) chance *= 2.2;
      if (f.cursed > 0) chance *= 0.3;
      if (pop > 40) chance *= 0.5; // crowding
      if (this.rng() < chance) {
        const p = this.agent(f.partner);
        const gen = Math.max(f.gen, p ? p.gen : f.gen) + 1;
        const c = this._makeAgent(s.cx + (this.rng() - 0.5) * 2, s.cy + (this.rng() - 0.5) * 2, s.id, 0,
          this.rng() < 0.5 ? 'M' : 'F', gen);
        c.parents = p ? [f.id, p.id] : [f.id];
        f.children.push(c.id); if (p) p.children.push(c.id);
        s.members.push(c.id);
        this.stats.births++;
        this.stats.maxGen = Math.max(this.stats.maxGen, gen);
        this._remember(f, `I gave birth to ${c.name}.`);
        this._log('birth', `${c.name} is born in ${s.name}.`, s.center);
        this._fx('birth', s.cx, s.cy);
        this._retier(s, pop + 1);
      }
    }
  }

  _maybeSplit(s) {
    const mem = s.members.map(id => this.agent(id)).filter(Boolean);
    if (mem.length < 16) return;
    if (this.settlements.filter(v => v.alive).length >= 6) return;
    if (this.rng() > 0.02) return;
    // pioneers leave to found a new settlement
    const spot = this._findFertileSpotNear(s.cx, s.cy, 12);
    if (!spot) return;
    const pioneers = mem.filter(a => a.age >= 15 && a.age <= 45).slice(0, 5);
    if (pioneers.length < 3) return;
    const ns = this._foundSettlement(spot.x, spot.y, pioneers.map(a => a.id));
    ns.stockpile.food = 20;
    for (const a of pioneers) {
      s.members = s.members.filter(id => id !== a.id);
      a.settId = ns.id; a.x = spot.x + (this.rng() - 0.5) * 2; a.y = spot.y + (this.rng() - 0.5) * 2;
      a.tx = a.x; a.ty = a.y;
      this._remember(a, `We founded ${ns.name}.`);
    }
    this.stats.foundedTotal++;
    this._log('founding', `Pioneers from ${s.name} found ${ns.name}.`, ns.center);
    this._fx('found', spot.x, spot.y);
  }

  _findFertileSpotNear(cx, cy, radius) {
    let best = null, bs = -1;
    for (let n = 0; n < 120; n++) {
      const ang = this.rng() * Math.PI * 2, r = 6 + this.rng() * radius;
      const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
      if (x < 3 || y < 3 || x >= this.W - 3 || y >= this.H - 3) continue;
      const t = this.tiles[y * this.W + x];
      if (t === TERRAIN.WATER || t === TERRAIN.MOUNTAIN) continue;
      // avoid overlapping existing settlements
      let tooClose = false;
      for (const s of this.settlements) if (s.alive && Math.hypot(s.cx - x, s.cy - y) < 8) { tooClose = true; break; }
      if (tooClose) continue;
      const sc = this.fertility[y * this.W + x];
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    return best;
  }

  // ---- Disasters -----------------------------------------------------------
  _maybeDisaster(diff) {
    // yearly-scaled probability
    if (this.rng() > diff.disasterRate / DAYS_PER_YEAR) return;
    const kinds = ['drought', 'storm', 'plague', 'wildfire', 'earthquake'];
    const kind = kinds[(this.rng() * kinds.length) | 0];
    const targets = this.settlements.filter(s => s.alive);
    if (!targets.length) return;
    const s = targets[(this.rng() * targets.length) | 0];
    this.triggerDisaster(kind, s, false);
  }

  /** Public: also used by god power. */
  triggerDisaster(kind, s, byGod) {
    if (!s || !s.alive) return;
    const mem = s.members.map(id => this.agent(id)).filter(Boolean);
    let dead = 0;
    switch (kind) {
      case 'drought':
        s.stockpile.food *= 0.25;
        for (const a of mem) a.hunger = Math.min(1.3, a.hunger + 0.3);
        break;
      case 'storm':
        // damage buildings
        if (s.buildings.length > 2 && this.rng() < 0.7) { const idx = 1 + ((this.rng() * (s.buildings.length - 1)) | 0); s.buildings.splice(idx, 1); }
        s.stockpile.wood *= 0.5;
        break;
      case 'plague':
        for (const a of mem) { if (this.rng() < 0.28) { this._kill(a, 'plague'); dead++; } else a.health = Math.max(0.05, a.health - 0.4); }
        break;
      case 'wildfire':
        s.stockpile.food *= 0.4; s.stockpile.wood *= 0.2;
        if (s.buildings.length > 3 && this.rng() < 0.6) s.buildings.splice(2, 1);
        break;
      case 'earthquake':
        for (let k = 0; k < 2; k++) if (s.buildings.length > 2) s.buildings.splice(1 + ((this.rng() * (s.buildings.length - 1)) | 0), 1);
        for (const a of mem) if (this.rng() < 0.12) { this._kill(a, 'earthquake'); dead++; }
        break;
    }
    this.stats.disasters++;
    if (byGod) this.stats.curseUses++;
    for (const a of this.agents) if (a.alive && a.settId === s.id) { this._remember(a, `We survived a ${kind}.`); a.safety = 0.4; }
    // survivors counts if settlement still has people afterward
    if (this._settPop(s) > 0) this.stats.disastersSurvived++;
    this._log('disaster', `${byGod ? 'A divine ' : 'A '}${kind} strikes ${s.name}${dead ? ` — ${dead} perish` : ''}.`, s.center);
    this._fx(kind, s.cx, s.cy, { big: true });
  }

  // ---- GOD POWERS ----------------------------------------------------------
  bless(target) {
    let n = 0;
    const apply = (a) => { a.blessed = 40; a.health = Math.min(1.2, a.health + 0.3); a.hunger = Math.max(0, a.hunger - 0.4); this._remember(a, 'I felt a divine blessing.'); n++; };
    if (target.agent) apply(target.agent);
    else if (target.settlement) for (const id of target.settlement.members) { const a = this.agent(id); if (a) apply(a); }
    this.stats.blessUses++;
    this._log('divine', `A blessing bathes ${target.settlement ? target.settlement.name : target.agent.name}.`, target.at);
    this._fx('bless', target.at.x, target.at.y, { big: !!target.settlement });
    return n;
  }
  curse(target) {
    let n = 0;
    const apply = (a) => { a.cursed = 40; a.health = Math.max(0.05, a.health - 0.25); a.hunger = Math.min(1.3, a.hunger + 0.3); this._remember(a, 'A curse fell upon me.'); n++; };
    if (target.agent) apply(target.agent);
    else if (target.settlement) for (const id of target.settlement.members) { const a = this.agent(id); if (a) apply(a); }
    this.stats.curseUses++;
    this._log('divine', `A curse withers ${target.settlement ? target.settlement.name : target.agent.name}.`, target.at);
    this._fx('curse', target.at.x, target.at.y, { big: !!target.settlement });
    return n;
  }
  spawnResource(x, y, kind, amount) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
    const i = y * this.W + x;
    if (kind === 'food') {
      // grant to nearest settlement stockpile + drop node
      const s = this._nearestSettlement(x, y);
      if (s) s.stockpile.food += amount;
      this.resource[i] += amount;
      this._log('divine', `Manna appears near ${s ? s.name : 'the wild'}.`, { x, y });
      this._fx('food', x, y);
    } else if (kind === 'wood' || kind === 'stone') {
      const s = this._nearestSettlement(x, y);
      if (s) s.stockpile[kind] += amount;
      this.resource[i] += amount;
      this._fx(kind, x, y);
      this._log('divine', `${kind[0].toUpperCase() + kind.slice(1)} is conjured from the earth.`, { x, y });
    }
    this.stats.spawnUses++;
    return true;
  }
  smite(x, y) {
    // lightning: kill nearest agent to point
    let best = null, bd = 9;
    for (const a of this.agents) { if (!a.alive) continue; const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }
    this._fx('smite', x, y, { big: true });
    if (best) { this._kill(best, 'divine wrath'); this.stats.curseUses++; }
  }
  _nearestSettlement(x, y) {
    let best = null, bd = 1e9;
    for (const s of this.settlements) { if (!s.alive) continue; const d = Math.hypot(s.cx - x, s.cy - y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // ---- Serialization -------------------------------------------------------
  serialize() {
    return {
      W: this.W, H: this.H, seed: this.seed, difficulty: this.difficulty,
      rngState: this.rng.state(), day: this.day, tick: this.tick,
      nextAgentId: this._nextAgentId, nextSettId: this._nextSettId,
      tiles: b64FromU8(this.tiles),
      resource: Array.from(this.resource).map(v => Math.round(v)),
      fertility: Array.from(this.fertility).map(v => Math.round(v * 255)),
      agents: this.agents, settlements: this.settlements,
      log: this.log.slice(-400), stats: this.stats, flags: this.flags,
    };
  }
  static deserialize(d) {
    const w = new World({ W: d.W, H: d.H, seed: d.seed, difficulty: d.difficulty });
    w.rng.setState(d.rngState);
    w.day = d.day; w.tick = d.tick;
    w._nextAgentId = d.nextAgentId; w._nextSettId = d.nextSettId;
    w.tiles = u8FromB64(d.tiles, d.W * d.H);
    w.resource = Float32Array.from(d.resource);
    w.fertility = Float32Array.from(d.fertility.map(v => v / 255));
    w.agents = d.agents; w.settlements = d.settlements;
    w.log = d.log; w.stats = d.stats; w.flags = d.flags || {};
    return w;
  }
}

// base64 helpers for the tile array (keeps saves compact)
function b64FromU8(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function u8FromB64(b64, len) {
  const s = atob(b64), u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
