import { ENCOUNTERS, GEAR, SPELLS, UPGRADES } from "./content";
import type {
  EnemyKind,
  EnemyState,
  PickupState,
  PlayerState,
  ProfileSave,
  RunState,
  SpellDefinition,
  Vec2,
} from "./types";

const ARENA_RADIUS = 55;
const distanceSq = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const distance = (a: Vec2, b: Vec2) => Math.sqrt(distanceSq(a, b));

function normalized(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function enemyStats(kind: EnemyKind, difficulty: number) {
  const table = {
    wisp: { health: 13, speed: 4.4, damage: 5 },
    crawler: { health: 24, speed: 2.8, damage: 8 },
    brute: { health: 68, speed: 1.65, damage: 15 },
    spitter: { health: 31, speed: 2.15, damage: 8 },
    warden: { health: 650, speed: 1.65, damage: 18 },
  };
  const base = table[kind];
  return {
    health: base.health * difficulty,
    speed: base.speed * Math.min(1.18, 0.95 + difficulty * 0.05),
    damage: base.damage * (0.82 + difficulty * 0.18),
  };
}

export function createDefaultProfile(): ProfileSave {
  return {
    version: 1,
    seeds: 0,
    unlockedGear: ["barkheart"],
    selectedGear: "barkheart",
    bestTime: null,
    runs: 0,
    wins: 0,
    musicVolume: 0.35,
    effectsVolume: 0.7,
  };
}

export function loadProfile(storage: Pick<Storage, "getItem">): ProfileSave {
  try {
    const raw = storage.getItem("heartwood-profile");
    if (!raw) return createDefaultProfile();
    const value = JSON.parse(raw) as Partial<ProfileSave>;
    if (
      value.version !== 1 ||
      !Number.isFinite(value.seeds) ||
      !Array.isArray(value.unlockedGear) ||
      typeof value.selectedGear !== "string"
    ) return createDefaultProfile();
    const validGear = GEAR.map((gear) => gear.id);
    const unlockedGear = value.unlockedGear.filter((id): id is string => validGear.includes(id as never));
    if (!unlockedGear.includes("barkheart")) unlockedGear.unshift("barkheart");
    return {
      ...createDefaultProfile(),
      ...value,
      seeds: Math.max(0, Math.floor(value.seeds ?? 0)),
      unlockedGear,
      selectedGear: unlockedGear.includes(value.selectedGear) ? value.selectedGear : "barkheart",
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(storage: Pick<Storage, "setItem">, profile: ProfileSave) {
  storage.setItem("heartwood-profile", JSON.stringify(profile));
}

export class GameSimulation {
  readonly state: RunState;
  private nextId = 1;
  private spawnTimer = 0.8;
  private fireTimer = 0.15;
  private spitterTimer = 1.5;
  private readonly random: () => number;

  constructor(profile: ProfileSave, random: () => number = Math.random) {
    this.random = random;
    const player: PlayerState = {
      position: { x: 0, z: 0 },
      health: 90,
      maxHealth: 90,
      speed: 7.8,
      damage: 12,
      fireRate: 0.52,
      projectileSpeed: 17,
      pickupRadius: 2.6,
      armor: 0,
      healingMultiplier: profile.selectedGear === "dewcatcher" ? 1.6 : 1,
    };

    let spell: SpellDefinition = SPELLS[0];
    if (profile.selectedGear === "swiftleaf") player.speed *= 1.1;
    if (profile.selectedGear === "thorncrown") player.damage *= 1.15;
    if (profile.selectedGear === "moonstone") spell = SPELLS[1];
    if (profile.selectedGear === "wildseed") spell = SPELLS[2];

    const worldseedMax = profile.selectedGear === "barkheart" ? 140 : 120;
    this.state = {
      phase: "travel",
      time: 0,
      player,
      worldseed: { position: { x: -2, z: 1 }, health: worldseedMax, maxHealth: worldseedMax, rooted: false },
      enemies: [],
      projectiles: [],
      pickups: [],
      clearingIndex: 0,
      defenseRemaining: 0,
      essence: 0,
      level: 1,
      essenceToLevel: 22,
      pendingUpgrade: false,
      upgradeChoices: [],
      spell,
      seedReward: 0,
      kills: 0,
      bossSpawned: false,
      furyRemaining: 0,
      message: `Guide the Worldseed to ${ENCOUNTERS[0].name}`,
    };
  }

  update(dt: number, move: Vec2) {
    const state = this.state;
    if (state.phase === "victory" || state.phase === "defeat" || state.pendingUpgrade) return;
    dt = Math.min(dt, 0.05);
    state.time += dt;
    state.furyRemaining = Math.max(0, state.furyRemaining - dt);

    const moveLength = Math.hypot(move.x, move.z);
    if (moveLength > 0) {
      const scale = state.player.speed * dt / Math.max(1, moveLength);
      state.player.position.x += move.x * scale;
      state.player.position.z += move.z * scale;
      this.clampToArena(state.player.position);
    }

    this.updateWorldseed(dt);
    this.updateEncounter(dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateAutoCast(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.checkEndState();
  }

  chooseUpgrade(index: number) {
    const choice = this.state.upgradeChoices[index];
    if (!this.state.pendingUpgrade || !choice) return;
    choice.apply(this.state.player);
    this.state.pendingUpgrade = false;
    this.state.upgradeChoices = [];
  }

  private updateWorldseed(dt: number) {
    const { worldseed, player } = this.state;
    if (worldseed.rooted) return;
    const gap = distance(worldseed.position, player.position);
    if (gap > 3.2) {
      const direction = normalized(worldseed.position, player.position);
      const speed = Math.min(5.2, 2.8 + gap * 0.12);
      worldseed.position.x += direction.x * speed * dt;
      worldseed.position.z += direction.z * speed * dt;
    }
  }

  private updateEncounter(dt: number) {
    const state = this.state;
    if (state.phase === "travel") {
      const target = ENCOUNTERS[state.clearingIndex];
      if (target && distance(state.worldseed.position, target.position) < 5.2) {
        state.phase = "defend";
        state.worldseed.rooted = true;
        state.defenseRemaining = target.defenseSeconds;
        state.message = `Protect the Worldseed — ${target.name}`;
      }
      return;
    }

    if (state.phase === "defend") {
      state.defenseRemaining -= dt;
      if (state.defenseRemaining <= 0) {
        state.clearingIndex += 1;
        state.worldseed.health = Math.min(state.worldseed.maxHealth, state.worldseed.health + 30);
        if (state.clearingIndex >= ENCOUNTERS.length) {
          state.phase = "boss";
          state.message = "The Corruption Warden awakens";
          this.spawnEnemy("warden", { x: 0, z: -46 });
          state.bossSpawned = true;
        } else {
          state.phase = "travel";
          state.worldseed.rooted = false;
          state.message = `Guide the Worldseed to ${ENCOUNTERS[state.clearingIndex].name}`;
        }
      }
    }
  }

  private updateSpawning(dt: number) {
    const state = this.state;
    if (state.phase === "boss") return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || state.enemies.length > 48) return;

    const intensity = 1 + state.time / 210 + state.clearingIndex * 0.35 + (state.phase === "defend" ? 0.45 : 0);
    const encounter = ENCOUNTERS[Math.min(state.clearingIndex, ENCOUNTERS.length - 1)];
    const kinds = encounter.enemyKinds;
    const kind = kinds[Math.floor(this.random() * kinds.length)];
    this.spawnEnemy(kind);
    this.spawnTimer = Math.max(0.38, 1.45 / intensity);
  }

  private spawnEnemy(kind: EnemyKind, at?: Vec2) {
    const state = this.state;
    const angle = this.random() * Math.PI * 2;
    const radius = 31 + this.random() * 13;
    const position = at ?? {
      x: state.worldseed.position.x + Math.cos(angle) * radius,
      z: state.worldseed.position.z + Math.sin(angle) * radius,
    };
    this.clampToArena(position);
    const difficulty = 1 + state.time / 330 + state.clearingIndex * 0.16;
    const stats = enemyStats(kind, difficulty);
    state.enemies.push({
      id: this.nextId++,
      kind,
      position,
      health: stats.health,
      maxHealth: stats.health,
      speed: stats.speed,
      damage: stats.damage,
      attackCooldown: 0,
    });
  }

  private updateEnemies(dt: number) {
    const state = this.state;
    this.spitterTimer -= dt;
    for (const enemy of state.enemies) {
      enemy.attackCooldown -= dt;
      const target = state.phase === "defend" || state.phase === "boss"
        ? (distanceSq(enemy.position, state.worldseed.position) < distanceSq(enemy.position, state.player.position)
          ? state.worldseed
          : state.player)
        : state.player;
      const gap = distance(enemy.position, target.position);
      const isSpitter = enemy.kind === "spitter";
      if (isSpitter && gap < 15 && this.spitterTimer <= 0) {
        const direction = normalized(enemy.position, target.position);
        state.projectiles.push({
          id: this.nextId++,
          position: { ...enemy.position },
          velocity: { x: direction.x * 9, z: direction.z * 9 },
          damage: enemy.damage,
          radius: 0.55,
          ttl: 2.8,
          pierce: 0,
          friendly: false,
          color: 0xb35cff,
        });
        continue;
      }
      if (gap > 1.65) {
        const direction = normalized(enemy.position, target.position);
        enemy.position.x += direction.x * enemy.speed * dt;
        enemy.position.z += direction.z * enemy.speed * dt;
      } else if (enemy.attackCooldown <= 0) {
        if ("armor" in target) target.health -= enemy.damage * (1 - target.armor);
        else target.health -= enemy.damage;
        enemy.attackCooldown = enemy.kind === "warden" ? 0.8 : 1.05;
      }
    }
    if (this.spitterTimer <= 0) this.spitterTimer = 2.2;
  }

  private updateAutoCast(dt: number) {
    const state = this.state;
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || state.enemies.length === 0) return;
    let nearest = state.enemies[0];
    for (const enemy of state.enemies) {
      if (distanceSq(enemy.position, state.player.position) < distanceSq(nearest.position, state.player.position)) nearest = enemy;
    }
    if (distance(nearest.position, state.player.position) > 24) return;

    const baseAngle = Math.atan2(nearest.position.z - state.player.position.z, nearest.position.x - state.player.position.x);
    const spread = 0.22;
    for (let i = 0; i < state.spell.projectileCount; i++) {
      const angle = baseAngle + (i - (state.spell.projectileCount - 1) / 2) * spread;
      state.projectiles.push({
        id: this.nextId++,
        position: { ...state.player.position },
        velocity: {
          x: Math.cos(angle) * state.player.projectileSpeed,
          z: Math.sin(angle) * state.player.projectileSpeed,
        },
        damage: state.player.damage * state.spell.damageMultiplier * (state.furyRemaining > 0 ? 1.6 : 1),
        radius: 0.45,
        ttl: 1.8,
        pierce: state.spell.id === "moonbeam" ? 1 : 0,
        friendly: true,
        color: state.spell.color,
      });
    }
    this.fireTimer = state.player.fireRate * state.spell.cooldownMultiplier;
  }

  private updateProjectiles(dt: number) {
    const state = this.state;
    for (const projectile of state.projectiles) {
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.z += projectile.velocity.z * dt;
      projectile.ttl -= dt;
      if (projectile.friendly) {
        for (const enemy of state.enemies) {
          if (enemy.health <= 0 || distanceSq(projectile.position, enemy.position) > (projectile.radius + 0.8) ** 2) continue;
          enemy.health -= projectile.damage;
          projectile.pierce -= 1;
          if (projectile.pierce < 0) {
            projectile.ttl = 0;
            break;
          }
        }
      } else {
        const player = state.player;
        const seed = state.worldseed;
        if (distanceSq(projectile.position, player.position) < 1.7) {
          player.health -= projectile.damage * (1 - player.armor);
          projectile.ttl = 0;
        } else if (distanceSq(projectile.position, seed.position) < 2.2) {
          seed.health -= projectile.damage;
          projectile.ttl = 0;
        }
      }
    }
    state.projectiles = state.projectiles.filter((projectile) => projectile.ttl > 0);

    const dead = state.enemies.filter((enemy) => enemy.health <= 0);
    for (const enemy of dead) this.dropPickup(enemy);
    state.enemies = state.enemies.filter((enemy) => enemy.health > 0);
  }

  private dropPickup(enemy: EnemyState) {
    const state = this.state;
    state.kills += 1;
    if (enemy.kind === "warden") {
      state.phase = "victory";
      state.seedReward = 12 + state.clearingIndex * 4;
      state.message = "The grove remembers your courage";
      return;
    }
    const roll = this.random();
    const pickup: PickupState = {
      id: this.nextId++,
      kind: roll > 0.975 ? "fury" : roll > 0.91 ? "dew" : "essence",
      position: { ...enemy.position },
      value: enemy.kind === "brute" ? 5 : enemy.kind === "spitter" ? 3 : 2,
    };
    state.pickups.push(pickup);
  }

  private updatePickups(dt: number) {
    const state = this.state;
    for (const pickup of state.pickups) {
      const gap = distance(pickup.position, state.player.position);
      if (gap < state.player.pickupRadius * 2.1) {
        const direction = normalized(pickup.position, state.player.position);
        const speed = 7 + (state.player.pickupRadius * 2.1 - gap) * 3;
        pickup.position.x += direction.x * speed * dt;
        pickup.position.z += direction.z * speed * dt;
      }
      if (gap < 1.1) {
        if (pickup.kind === "essence") state.essence += pickup.value;
        if (pickup.kind === "dew") state.player.health = Math.min(
          state.player.maxHealth,
          state.player.health + pickup.value * 4 * state.player.healingMultiplier,
        );
        if (pickup.kind === "fury") state.furyRemaining = 10;
        pickup.value = 0;
      }
    }
    state.pickups = state.pickups.filter((pickup) => pickup.value > 0);
    if (state.essence >= state.essenceToLevel) {
      state.essence -= state.essenceToLevel;
      state.level += 1;
      state.essenceToLevel = Math.floor(state.essenceToLevel * 1.32 + 6);
      state.pendingUpgrade = true;
      state.upgradeChoices = this.pickUpgradeChoices();
    }
  }

  private pickUpgradeChoices() {
    const pool = [...UPGRADES];
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      choices.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    }
    return choices;
  }

  private checkEndState() {
    if (this.state.player.health <= 0 || this.state.worldseed.health <= 0) {
      this.state.phase = "defeat";
      this.state.seedReward = Math.max(1, this.state.clearingIndex * 3 + Math.floor(this.state.kills / 18));
      this.state.message = this.state.player.health <= 0 ? "The Spellkeeper has fallen" : "The Worldseed was lost";
    }
  }

  private clampToArena(position: Vec2) {
    const length = Math.hypot(position.x, position.z);
    if (length > ARENA_RADIUS) {
      position.x = position.x / length * ARENA_RADIUS;
      position.z = position.z / length * ARENA_RADIUS;
    }
  }
}
