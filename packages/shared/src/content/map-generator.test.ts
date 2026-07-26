import { describe, expect, it } from "vitest";
import type { MapCell, MapConfig } from "../config/map-config.js";
import { MapConfigSchema } from "../config/map-config.js";
import { TERRAIN_ID_NORMAL, TERRAIN_ID_VOID } from "../config/baseline-game-config.js";
import {
  DEFAULT_MAP_SEED,
  generateMap,
  V1_MAP_ID,
  V1_SPAWN_PLAYER_1,
  V1_SPAWN_PLAYER_2,
} from "./map-generator.js";

/** A spread of seeds, so invariants are checked against many rolls. */
const SEEDS = Array.from({ length: 50 }, (_, index) => index * 2654435761 + 1);

const cellAt = (map: MapConfig, x: number, y: number): MapCell | undefined =>
  map.cells[y * map.width + x];

/** Independent BFS: can player 1 reach player 2 over walkable ground? */
function spawnsConnected(map: MapConfig): boolean {
  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && x < map.width && y >= 0 && y < map.height;
  const start = cellAt(map, V1_SPAWN_PLAYER_1.x, V1_SPAWN_PLAYER_1.y);
  if (start === undefined || start.terrainId === TERRAIN_ID_VOID) {
    return false;
  }
  const seen = new Set<number>([V1_SPAWN_PLAYER_1.y * map.width + V1_SPAWN_PLAYER_1.x]);
  const queue: { x: number; y: number }[] = [{ x: V1_SPAWN_PLAYER_1.x, y: V1_SPAWN_PLAYER_1.y }];
  let head = 0;
  while (head < queue.length) {
    const here = queue[head];
    head += 1;
    if (here === undefined) {
      continue;
    }
    const hereCell = cellAt(map, here.x, here.y);
    if (hereCell === undefined) {
      continue;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = here.x + dx;
      const ny = here.y + dy;
      if (!inBounds(nx, ny)) {
        continue;
      }
      const next = cellAt(map, nx, ny);
      if (next === undefined || next.terrainId === TERRAIN_ID_VOID) {
        continue;
      }
      const key = ny * map.width + nx;
      if (seen.has(key) || Math.abs(next.z - hereCell.z) > 1) {
        continue;
      }
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen.has(V1_SPAWN_PLAYER_2.y * map.width + V1_SPAWN_PLAYER_2.x);
}

describe("procedural map generator", () => {
  it("is a valid 12×12 map for every seed", () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      expect(MapConfigSchema.safeParse(map).success).toBe(true);
      expect(map.id).toBe(V1_MAP_ID);
      expect(map.width).toBe(12);
      expect(map.height).toBe(12);
      expect(map.cells).toHaveLength(144);
    }
  });

  it("is deterministic: the same seed yields an identical board", () => {
    for (const seed of SEEDS) {
      expect(generateMap(seed)).toEqual(generateMap(seed));
    }
  });

  it("is point-symmetric, so neither spawn gets kinder ground", () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          const cell = cellAt(map, x, y);
          const mirror = cellAt(map, map.width - 1 - x, map.height - 1 - y);
          expect(cell?.z).toBe(mirror?.z);
          expect(cell?.terrainId).toBe(mirror?.terrainId);
        }
      }
    }
  });

  it("keeps only climbable elevation (0–2), so no rise is a sealed pillar", () => {
    for (const seed of SEEDS) {
      for (const cell of generateMap(seed).cells) {
        expect(cell.z).toBeGreaterThanOrEqual(0);
        expect(cell.z).toBeLessThanOrEqual(2);
      }
    }
  });

  it("gives both spawns open z0 footing, plus clear orthogonal neighbours", () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed);
      for (const spawn of [V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2]) {
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const cell = cellAt(map, spawn.x + dx, spawn.y + dy);
          expect(cell?.z).toBe(0);
          expect(cell?.terrainId).toBe(TERRAIN_ID_NORMAL);
        }
        expect(spawn.z).toBe(0);
      }
    }
  });

  it("always leaves a path between the two spawns", () => {
    for (const seed of SEEDS) {
      expect(spawnsConnected(generateMap(seed))).toBe(true);
    }
  });

  it("rolls genuinely different boards for different seeds", () => {
    const shapes = new Set(SEEDS.map((seed) => JSON.stringify(generateMap(seed).cells)));
    // Not every seed need differ, but the field must not be constant.
    expect(shapes.size).toBeGreaterThan(SEEDS.length / 2);
  });

  it("the featured board shows off a spread of terrains", () => {
    const kinds = new Set(generateMap(DEFAULT_MAP_SEED).cells.map((cell) => cell.terrainId));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
