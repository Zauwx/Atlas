import { describe, expect, it } from "vitest";
import { findGameConfigReferenceErrors, GameConfigSchema } from "../config/game-config.js";
import { MapConfigSchema } from "../config/map-config.js";
import { createV1Map, V1_GAME_CONFIG, V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2 } from "./v1-content.js";

describe("V1 game config", () => {
  it("validates against the schema with no dangling references", () => {
    expect(GameConfigSchema.safeParse(V1_GAME_CONFIG).success).toBe(true);
    expect(findGameConfigReferenceErrors(V1_GAME_CONFIG)).toEqual([]);
  });

  it("ships exactly the V1 roster: 3 stances, 2 classes, 6 spells", () => {
    expect(V1_GAME_CONFIG.stances).toHaveLength(3);
    expect(V1_GAME_CONFIG.classes).toHaveLength(2);
    expect(V1_GAME_CONFIG.spells).toHaveLength(6);
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

describe("Ridge and Pools map", () => {
  const map = createV1Map();
  const cellAt = (x: number, y: number) => map.cells[y * map.width + x];

  it("is a valid 12×12 map", () => {
    expect(MapConfigSchema.safeParse(map).success).toBe(true);
    expect(map.cells).toHaveLength(144);
  });

  it("has the ridge, pools, and pits where the design says", () => {
    expect(cellAt(5, 5)?.z).toBe(2);
    expect(cellAt(6, 9)?.z).toBe(2);
    expect(cellAt(2, 5)?.terrainId).toBe("water");
    expect(cellAt(9, 7)?.terrainId).toBe("water");
    expect(cellAt(5, 1)?.terrainId).toBe("void");
    expect(cellAt(6, 10)?.terrainId).toBe("void");
  });

  it("spawns stand on plain ground at z0", () => {
    for (const spawn of [V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2]) {
      const cell = cellAt(spawn.x, spawn.y);
      expect(cell?.terrainId).toBe("normal");
      expect(cell?.z).toBe(0);
      expect(spawn.z).toBe(0);
    }
  });
});
