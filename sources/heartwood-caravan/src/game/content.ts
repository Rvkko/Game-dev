import type { EncounterDefinition, SpellDefinition, UpgradeDefinition } from "./types";

export const SPELLS: SpellDefinition[] = [
  {
    id: "thorn",
    name: "Thorn Volley",
    description: "Fast thorns seek the nearest corruption.",
    damageMultiplier: 1,
    cooldownMultiplier: 0.86,
    projectileCount: 1,
    color: 0x9af28c,
  },
  {
    id: "moonbeam",
    name: "Moonbeam",
    description: "Slow silver bolts pierce one extra foe.",
    damageMultiplier: 1.65,
    cooldownMultiplier: 1.25,
    projectileCount: 1,
    color: 0xb9c8ff,
  },
  {
    id: "seedburst",
    name: "Seedburst",
    description: "Cast a short fan of three living seeds.",
    damageMultiplier: 0.62,
    cooldownMultiplier: 1.18,
    projectileCount: 3,
    color: 0xffd46a,
  },
];

export const ENCOUNTERS: EncounterDefinition[] = [
  { name: "Mosslight Hollow", position: { x: -31, z: -27 }, defenseSeconds: 140, enemyKinds: ["wisp", "crawler"] },
  { name: "Silverroot Crossing", position: { x: 35, z: -12 }, defenseSeconds: 160, enemyKinds: ["wisp", "crawler", "spitter"] },
  { name: "Elderbloom Rise", position: { x: 12, z: 39 }, defenseSeconds: 180, enemyKinds: ["crawler", "brute", "spitter"] },
];

export const GEAR = [
  { id: "barkheart", name: "Barkheart", cost: 0, description: "+20 Worldseed health" },
  { id: "swiftleaf", name: "Swiftleaf", cost: 8, description: "+10% movement speed" },
  { id: "dewcatcher", name: "Dewcatcher", cost: 14, description: "Healing dew restores more" },
  { id: "thorncrown", name: "Thorncrown", cost: 20, description: "+15% spell damage" },
  { id: "moonstone", name: "Moonstone", cost: 28, description: "Start with Moonbeam" },
  { id: "wildseed", name: "Wildseed", cost: 36, description: "Start with Seedburst" },
] as const;

export const UPGRADES: UpgradeDefinition[] = [
  { id: "keen-thorns", name: "Keen Thorns", description: "+25% spell damage", apply: (p) => { p.damage *= 1.25; } },
  { id: "quickbloom", name: "Quickbloom", description: "+18% casting speed", apply: (p) => { p.fireRate *= 0.82; } },
  { id: "fleetroot", name: "Fleetroot", description: "+12% movement speed", apply: (p) => { p.speed *= 1.12; } },
  { id: "barkskin", name: "Barkskin", description: "+12 maximum health", apply: (p) => { p.maxHealth += 12; p.health += 12; } },
  { id: "far-reach", name: "Far Reach", description: "+45% pickup reach", apply: (p) => { p.pickupRadius *= 1.45; } },
  { id: "hardened-sap", name: "Hardened Sap", description: "Reduce damage by 10%", apply: (p) => { p.armor = Math.min(0.45, p.armor + 0.1); } },
  { id: "living-light", name: "Living Light", description: "Heal 20 health now", apply: (p) => { p.health = Math.min(p.maxHealth, p.health + 20); } },
  { id: "brightcore", name: "Brightcore", description: "+35% projectile speed", apply: (p) => { p.projectileSpeed *= 1.35; } },
  { id: "elder-wisdom", name: "Elder Wisdom", description: "+15 health and +8% damage", apply: (p) => { p.maxHealth += 15; p.health += 15; p.damage *= 1.08; } },
  { id: "stormpetal", name: "Stormpetal", description: "+12% speed and casting", apply: (p) => { p.speed *= 1.12; p.fireRate *= 0.88; } },
  { id: "green-fury", name: "Green Fury", description: "+40% damage, -10 max health", apply: (p) => { p.damage *= 1.4; p.maxHealth = Math.max(25, p.maxHealth - 10); p.health = Math.min(p.health, p.maxHealth); } },
  { id: "guardian-ring", name: "Guardian Ring", description: "+18% armor", apply: (p) => { p.armor = Math.min(0.5, p.armor + 0.18); } },
];
