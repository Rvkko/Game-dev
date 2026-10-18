import { describe, expect, it } from "vitest";
import { ENCOUNTERS } from "../src/game/content";
import { createDefaultProfile, GameSimulation, loadProfile } from "../src/game/simulation";

describe("Heartwood simulation", () => {
  it("recovers safely from a corrupt profile", () => {
    const profile = loadProfile({ getItem: () => "{broken json" });
    expect(profile).toEqual(createDefaultProfile());
  });

  it("sanitizes invalid saved values and gear", () => {
    const profile = loadProfile({
      getItem: () => JSON.stringify({
        version: 1,
        seeds: -9,
        unlockedGear: ["not-real"],
        selectedGear: "not-real",
      }),
    });
    expect(profile.seeds).toBe(0);
    expect(profile.unlockedGear).toEqual(["barkheart"]);
    expect(profile.selectedGear).toBe("barkheart");
  });

  it("roots the Worldseed when it reaches a clearing", () => {
    const game = new GameSimulation(createDefaultProfile(), () => 0.2);
    game.state.worldseed.position = { ...ENCOUNTERS[0].position };
    game.update(0.016, { x: 0, z: 0 });
    expect(game.state.phase).toBe("defend");
    expect(game.state.worldseed.rooted).toBe(true);
    expect(game.state.defenseRemaining).toBeGreaterThan(0);
  });

  it("presents a choice after collecting enough essence", () => {
    const game = new GameSimulation(createDefaultProfile(), () => 0.1);
    game.state.pickups.push({
      id: 999,
      kind: "essence",
      position: { ...game.state.player.position },
      value: game.state.essenceToLevel,
    });
    game.update(0.016, { x: 0, z: 0 });
    expect(game.state.pendingUpgrade).toBe(true);
    expect(game.state.upgradeChoices).toHaveLength(3);
    const before = JSON.stringify(game.state.player);
    game.chooseUpgrade(0);
    expect(game.state.pendingUpgrade).toBe(false);
    expect(JSON.stringify(game.state.player)).not.toBe(before);
  });

  it("ends the run when either escort member falls", () => {
    const playerGame = new GameSimulation(createDefaultProfile());
    playerGame.state.player.health = 0;
    playerGame.update(0.016, { x: 0, z: 0 });
    expect(playerGame.state.phase).toBe("defeat");

    const seedGame = new GameSimulation(createDefaultProfile());
    seedGame.state.worldseed.health = 0;
    seedGame.update(0.016, { x: 0, z: 0 });
    expect(seedGame.state.phase).toBe("defeat");
  });

  it("awards victory when the Warden is defeated", () => {
    const game = new GameSimulation(createDefaultProfile());
    game.state.phase = "boss";
    game.state.clearingIndex = 3;
    game.state.enemies.push({
      id: 1000,
      kind: "warden",
      position: { x: 5, z: 5 },
      health: 0,
      maxHealth: 650,
      speed: 1,
      damage: 10,
      attackCooldown: 0,
    });
    game.update(0.016, { x: 0, z: 0 });
    expect(game.state.phase).toBe("victory");
    expect(game.state.seedReward).toBeGreaterThan(0);
  });
});
