import { describe, expect, it } from "vitest";
import { findGameConfigReferenceErrors, GameConfigSchema } from "../config/game-config.js";
import { MapConfigSchema } from "../config/map-config.js";
import { createV1Map, V1_GAME_CONFIG, V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2 } from "./v1-content.js";

describe("V1 game config", () => {
  it("validates against the schema with no dangling references", () => {
    expect(GameConfigSchema.safeParse(V1_GAME_CONFIG).success).toBe(true);
    expect(findGameConfigReferenceErrors(V1_GAME_CONFIG)).toEqual([]);
  });

  it("ships exactly the V1 roster: 3 stances, 2 classes, 7 spells", () => {
    expect(V1_GAME_CONFIG.stances).toHaveLength(3);
    expect(V1_GAME_CONFIG.classes).toHaveLength(2);
    expect(V1_GAME_CONFIG.spells).toHaveLength(7);
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
    expect(cellAt(6, 8)?.z).toBe(2);
    expect(cellAt(2, 5)?.terrainId).toBe("water");
    expect(cellAt(9, 7)?.terrainId).toBe("water");
    expect(cellAt(5, 1)?.terrainId).toBe("void");
    expect(cellAt(6, 10)?.terrainId).toBe("void");
  });

  it("ramps the ridge ends to z1 so the high ground is actually reachable", () => {
    // A single step climbs at most +1, so a z2 ridge beside z0 ground would
    // be unreachable forever. Both ends drop to z1.
    for (const [x, y] of [
      [5, 2],
      [6, 2],
      [5, 9],
      [6, 9],
    ] as const) {
      expect(cellAt(x, y)?.z).toBe(1);
    }
    // And each ramp touches ground, so the 0 → 1 → 2 route exists.
    expect(cellAt(4, 2)?.z).toBe(0);
    expect(cellAt(5, 3)?.z).toBe(2);
  });

  it("places every terrain that now has behavior", () => {
    const placed = new Set(map.cells.map((cell) => cell.terrainId));
    for (const terrainId of ["water", "ice", "lava", "vegetation", "void"]) {
      expect(placed).toContain(terrainId);
    }
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
