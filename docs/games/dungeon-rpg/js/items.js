// items.js — gear, loot rolls, level-up cards, meta upgrades

export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#c8c8c8', mult: 1.0, affixes: 0, weight: 52 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#6ad96a', mult: 1.18, affixes: 1, weight: 28 },
  { id: 'rare',      name: 'Rare',      color: '#6aa8e8', mult: 1.4, affixes: 2, weight: 13 },
  { id: 'epic',      name: 'Epic',      color: '#b78ae8', mult: 1.7, affixes: 3, weight: 5.5 },
  { id: 'legendary', name: 'Legendary', color: '#e8b64c', mult: 2.1, affixes: 4, weight: 1.5 },
];

const WEAPONS = [
  { key: 'sword',  name: 'Sword',   icon: '🗡️', dmg: 12, speed: 0.38, range: 74, arc: 1.9, knock: 7 },
  { key: 'axe',    name: 'War Axe', icon: '🪓', dmg: 18, speed: 0.55, range: 70, arc: 2.4, knock: 11 },
  { key: 'spear',  name: 'Spear',   icon: '🔱', dmg: 13, speed: 0.44, range: 100, arc: 0.9, knock: 8 },
  { key: 'dagger', name: 'Dagger',  icon: '🔪', dmg: 8,  speed: 0.24, range: 58, arc: 1.6, knock: 4 },
  { key: 'maul',   name: 'Maul',    icon: '🔨', dmg: 24, speed: 0.72, range: 72, arc: 2.2, knock: 16 },
];
const ARMORS = [
  { key: 'leather', name: 'Leather Armor', icon: '🦺', armor: 3, hp: 10 },
  { key: 'chain',   name: 'Chainmail',     icon: '⛓️', armor: 6, hp: 18 },
  { key: 'plate',   name: 'Plate Armor',   icon: '🛡️', armor: 10, hp: 28 },
];
const TRINKETS = [
  { key: 'ring',   name: 'Ring of Fury',    icon: '💍', stat: 'crit', val: 0.08, label: '+8% crit' },
  { key: 'boots',  name: 'Swift Boots',     icon: '👢', stat: 'ms', val: 0.1, label: '+10% speed' },
  { key: 'orb',    name: 'Mana Orb',        icon: '🔮', stat: 'mana', val: 25, label: '+25 mana' },
  { key: 'idol',   name: 'Golden Idol',     icon: '🏺', stat: 'gold', val: 0.25, label: '+25% gold' },
  { key: 'fang',   name: 'Vampire Fang',    icon: '🦷', stat: 'lifesteal', val: 0.06, label: '6% lifesteal' },
];

const AFFIX_POOL = [
  { stat: 'hp', roll: (rng, f) => 6 + rng.int(0, 6) + f * 2, fmt: v => `+${v} max HP` },
  { stat: 'dmgPct', roll: (rng, f) => 4 + rng.int(0, 8), fmt: v => `+${v}% damage` },
  { stat: 'crit', roll: (rng) => 3 + rng.int(0, 5), fmt: v => `+${v}% crit chance` },
  { stat: 'ms', roll: (rng) => 3 + rng.int(0, 5), fmt: v => `+${v}% move speed` },
  { stat: 'armor', roll: (rng, f) => 1 + rng.int(0, 2) + Math.floor(f / 3), fmt: v => `+${v} armor` },
  { stat: 'lifesteal', roll: (rng) => 2 + rng.int(0, 3), fmt: v => `${v}% lifesteal` },
];

export function rollRarity(rng, boost = 0) {
  // boost shifts weight toward higher rarities (0..1)
  let total = 0;
  const w = RARITIES.map((r, i) => {
    const wt = r.weight * (1 + boost * i * 1.6);
    total += wt;
    return wt;
  });
  let roll = rng.next() * total;
  for (let i = 0; i < RARITIES.length; i++) {
    if ((roll -= w[i]) <= 0) return RARITIES[i];
  }
  return RARITIES[0];
}

let nextItemId = 1;
export function rollItem(rng, floor, opts = {}) {
  const slot = opts.slot || rng.pick(['weapon', 'weapon', 'armor', 'trinket']);
  const rarity = opts.rarity ? RARITIES.find(r => r.id === opts.rarity) : rollRarity(rng, opts.boost || 0);
  const fscale = 1 + (floor - 1) * 0.13;
  const item = { id: 'i' + (nextItemId++) + '_' + Math.floor(rng.next() * 1e6), slot, rarity: rarity.id, affixes: [] };

  if (slot === 'weapon') {
    const base = rng.pick(WEAPONS);
    item.base = base.key; item.icon = base.icon;
    item.dmg = Math.round(base.dmg * rarity.mult * fscale);
    item.speed = base.speed; item.range = base.range; item.arc = base.arc; item.knock = base.knock;
    item.name = `${rarity.id !== 'common' ? rarity.name + ' ' : ''}${base.name}`;
  } else if (slot === 'armor') {
    const base = rng.pick(ARMORS);
    item.base = base.key; item.icon = base.icon;
    item.armor = Math.round(base.armor * rarity.mult * fscale);
    item.hp = Math.round(base.hp * rarity.mult * fscale);
    item.name = `${rarity.id !== 'common' ? rarity.name + ' ' : ''}${base.name}`;
  } else {
    const base = rng.pick(TRINKETS);
    item.base = base.key; item.icon = base.icon;
    item.stat = base.stat;
    item.val = typeof base.val === 'number' && base.val < 1
      ? +(base.val * rarity.mult).toFixed(2)
      : Math.round(base.val * rarity.mult);
    item.label = base.label;
    item.name = `${rarity.id !== 'common' ? rarity.name + ' ' : ''}${base.name}`;
  }

  const nAffix = rarity.affixes;
  const pool = rng.shuffle(AFFIX_POOL);
  for (let i = 0; i < nAffix && i < pool.length; i++) {
    const a = pool[i];
    const v = a.roll(rng, floor);
    item.affixes.push({ stat: a.stat, val: v, text: a.fmt(v) });
  }
  return item;
}

export function rarityInfo(id) { return RARITIES.find(r => r.id === id) || RARITIES[0]; }

export function itemTooltipLines(item) {
  const lines = [];
  if (item.slot === 'weapon') {
    lines.push(`${item.dmg} damage · ${item.speed.toFixed(2)}s swing`);
    lines.push(`${Math.round(item.range / 9.6)} ft reach · knockback ${item.knock}`);
  } else if (item.slot === 'armor') {
    lines.push(`+${item.armor} armor · +${item.hp} max HP`);
  } else {
    lines.push(item.label.replace(/[\d.]+/, String(item.val).replace('0.', '.')));
  }
  for (const a of item.affixes) lines.push(a.text);
  return lines;
}

// ---------------- Level-up cards ----------------
export const LEVELUP_CARDS = [
  { id: 'vit',   icon: '❤️', name: 'Vitality',  desc: '+22 max HP and heal 22 HP.', apply: p => { p.maxHpBase += 22; p.hp += 22; } },
  { id: 'pow',   icon: '⚔️', name: 'Power',     desc: '+14% damage.', apply: p => { p.dmgMult *= 1.14; } },
  { id: 'swift', icon: '🌀', name: 'Swiftness', desc: '+8% move speed.', apply: p => { p.msMult *= 1.08; } },
  { id: 'guard', icon: '🛡️', name: 'Guard',     desc: '+4 armor.', apply: p => { p.bonusArmor += 4; } },
  { id: 'prec',  icon: '🎯', name: 'Precision', desc: '+7% crit chance.', apply: p => { p.bonusCrit += 0.07; } },
  { id: 'focus', icon: '🔮', name: 'Focus',     desc: '+20 max mana, +25% mana regen.', apply: p => { p.bonusMana += 20; p.manaRegenMult *= 1.25; } },
  { id: 'brawn', icon: '💪', name: 'Brawn',     desc: '+30% knockback on hits.', apply: p => { p.knockMult *= 1.3; } },
  { id: 'leech', icon: '🩸', name: 'Bloodthirst', desc: '+4% lifesteal.', apply: p => { p.bonusLifesteal += 0.04; } },
];

// ---------------- Meta (roguelite) upgrades ----------------
export const META_UPGRADES = [
  { id: 'vigor',   name: 'Vigor',    icon: '❤️', desc: '+15 starting max HP per rank.', ranks: 5, cost: r => 20 + r * 25 },
  { id: 'might',   name: 'Might',    icon: '⚔️', desc: '+6% damage per rank.', ranks: 5, cost: r => 25 + r * 30 },
  { id: 'haste',   name: 'Haste',    icon: '💨', desc: '-12% dodge cooldown per rank.', ranks: 3, cost: r => 30 + r * 35 },
  { id: 'fortune', name: 'Fortune',  icon: '◆',  desc: '+12% gold found per rank.', ranks: 3, cost: r => 20 + r * 25 },
  { id: 'flask',   name: 'Deep Flask', icon: '🧪', desc: '+1 starting potion per rank.', ranks: 2, cost: r => 40 + r * 40 },
  { id: 'arsenal', name: 'Arsenal',  icon: '🗡️', desc: 'Begin each run with an uncommon weapon.', ranks: 1, cost: () => 90 },
  { id: 'resolve', name: 'Resolve',  icon: '🕯️', desc: 'Once per run, survive death with 50% HP.', ranks: 1, cost: () => 150 },
  { id: 'insight', name: 'Insight',  icon: '📜', desc: '+10% XP per rank.', ranks: 3, cost: r => 25 + r * 30 },
];

export function metaCost(up, currentRank) { return up.cost(currentRank); }
export function totalMetaRanks() { return META_UPGRADES.reduce((s, u) => s + u.ranks, 0); }
