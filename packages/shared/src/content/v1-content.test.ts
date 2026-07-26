import { describe, expect, it } from "vitest";
import { findGameConfigReferenceErrors, GameConfigSchema } from "../config/game-config.js";
import { V1_GAME_CONFIG } from "./v1-content.js";

describe("V1 game config", () => {
  it("validates against the schema with no dangling references", () => {
    expect(GameConfigSchema.safeParse(V1_GAME_CONFIG).success).toBe(true);
    expect(findGameConfigReferenceErrors(V1_GAME_CONFIG)).toEqual([]);
  });

  it("ships exactly the V1 roster: 3 stances, 2 classes, 9 spells", () => {
    expect(V1_GAME_CONFIG.stances).toHaveLength(3);
    expect(V1_GAME_CONFIG.classes).toHaveLength(2);
    expect(V1_GAME_CONFIG.spells).toHaveLength(9);
  });

  it("respects the balance baselines (HP 90–110, AP 6, MP 3–4)", () => {
    for (const gameClass of V1_GAME_CONFIG.classes) {
      expect(gameClass.baseHealthPoints).toBeGreaterThanOrEqual(90);
      expect(gameClass.baseHealthPoints).toBeLessThanOrEqual(110);
      expect(gameClass.baseActionPoints).toBe(6);
      expect(gameClass.baseMovementPoints).toBeGreaterThanOrEqual(3);
      expect(gameClass.baseMovementPoints).toBeLessThanOrEqual(4);
    }
  });
});
