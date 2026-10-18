export type Vec2 = { x: number; z: number };
export type RunPhase = "travel" | "defend" | "boss" | "victory" | "defeat";
export type EnemyKind = "wisp" | "crawler" | "brute" | "spitter" | "warden";
export type SpellId = "thorn" | "moonbeam" | "seedburst";

export interface PlayerState {
  position: Vec2;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  pickupRadius: number;
  armor: number;
  healingMultiplier: number;
}

export interface WorldseedState {
  position: Vec2;
  health: number;
  maxHealth: number;
  rooted: boolean;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  position: Vec2;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  attackCooldown: number;
}

export interface ProjectileState {
  id: number;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  radius: number;
  ttl: number;
  pierce: number;
  friendly: boolean;
  color: number;
}

export interface PickupState {
  id: number;
  kind: "essence" | "dew" | "fury";
  position: Vec2;
  value: number;
}

export interface SpellDefinition {
  id: SpellId;
  name: string;
  description: string;
  damageMultiplier: number;
  cooldownMultiplier: number;
  projectileCount: number;
  color: number;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  apply(player: PlayerState): void;
}

export interface EncounterDefinition {
  name: string;
  position: Vec2;
  defenseSeconds: number;
  enemyKinds: EnemyKind[];
}

export interface ProfileSave {
  version: 1;
  seeds: number;
  unlockedGear: string[];
  selectedGear: string;
  bestTime: number | null;
  runs: number;
  wins: number;
  musicVolume: number;
  effectsVolume: number;
}

export interface RunState {
  phase: RunPhase;
  time: number;
  player: PlayerState;
  worldseed: WorldseedState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  clearingIndex: number;
  defenseRemaining: number;
  essence: number;
  level: number;
  essenceToLevel: number;
  pendingUpgrade: boolean;
  upgradeChoices: UpgradeDefinition[];
  spell: SpellDefinition;
  seedReward: number;
  kills: number;
  bossSpawned: boolean;
  furyRemaining: number;
  message: string;
}
