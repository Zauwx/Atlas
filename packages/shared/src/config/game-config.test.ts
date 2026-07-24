import { describe, expect, it } from "vitest";

import { BASELINE_GAME_CONFIG, STATE_ID_WET, TERRAIN_ID_WATER } from "./baseline-game-config.js";
import { findGameConfigReferenceErrors, GameConfigSchema } from "./game-config.js";

describe("BASELINE_GAME_CONFIG (rulebook-decided values only)", () => {
  it("validates against the GameConfig schema", () => {
    expect(GameConfigSchema.safeParse(BASELINE_GAME_CONFIG).success).toBe(true);
  });

  it("has no dangling references", () => {
    expect(findGameConfigReferenceErrors(BASELINE_GAME_CONFIG)).toEqual([]);
  });

  it("carries the rulebook physics constants (Collisions, Falls, Verticality)", () => {
    expect(BASELINE_GAME_CONFIG.physics.collisionDamagePerRemainingCell).toBe(10);
    expect(BASELINE_GAME_CONFIG.physics.fallDamagePerHeightLevel).toBe(15);
    expect(BASELINE_GAME_CONFIG.physics.climbMovementPointCostPerLevel).toBe(1);
    expect(BASELINE_GAME_CONFIG.physics.maxClimbHeightWithoutAbility).toBe(1);
  });

  it("declares the seven initial terrains", () => {
    expect(BASELINE_GAME_CONFIG.terrains.map((terrain) => terrain.name)).toEqual([
      "Normal",
      "Water",
      "Ice",
      "Vegetation",
      "Earth",
      "Lava",
      "Void",
    ]);
  });

  it("wires Water to apply Wet (terrain acts only via states)", () => {
    const water = BASELINE_GAME_CONFIG.terrains.find((terrain) => terrain.id === TERRAIN_ID_WATER);
    expect(water?.appliedStateIds).toEqual([STATE_ID_WET]);
  });

  it("contains no invented content: stances, classes, and spells are empty", () => {
    expect(BASELINE_GAME_CONFIG.stances).toEqual([]);
    expect(BASELINE_GAME_CONFIG.classes).toEqual([]);
    expect(BASELINE_GAME_CONFIG.spells).toEqual([]);
  });
});

describe("findGameConfigReferenceErrors", () => {
  it("reports every terrain referencing an unknown state", () => {
    const broken = { ...BASELINE_GAME_CONFIG, states: [] };
    const errors = findGameConfigReferenceErrors(broken);
    const terrainsApplyingStates = BASELINE_GAME_CONFIG.terrains.filter(
      (terrain) => terrain.appliedStateIds.length > 0,
    );
    expect(errors).toHaveLength(terrainsApplyingStates.length);
    for (const error of errors) {
      expect(error).toContain("unknown applied state");
    }
  });

  it("reports duplicate ids", () => {
    const broken = {
      ...BASELINE_GAME_CONFIG,
      states: [...BASELINE_GAME_CONFIG.states, ...BASELINE_GAME_CONFIG.states],
    };
    const errors = findGameConfigReferenceErrors(broken);
    expect(errors.some((error) => error.includes("duplicate id"))).toBe(true);
  });
});
