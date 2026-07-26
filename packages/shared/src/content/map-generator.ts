import type { MapCell, MapConfig } from "../config/map-config.js";
import {
  TERRAIN_ID_EARTH,
  TERRAIN_ID_ICE,
  TERRAIN_ID_LAVA,
  TERRAIN_ID_NORMAL,
  TERRAIN_ID_VEGETATION,
  TERRAIN_ID_VOID,
  TERRAIN_ID_WATER,
} from "../config/baseline-game-config.js";
import { MapIdSchema } from "../ids.js";

/**
 * Procedural battlefield generator — GAME_DESIGN.md pillars "Verticality"
 * and "Living Terrain". Every match rolls a fresh board so the first fight
 * is a real one, not a memorised layout.
 *
 * DETERMINISM (ARCHITECTURE.md "Determinism"): the layout is a pure
 * function of a numeric seed. The server derives that seed from the
 * match's own identity, so there is no hidden randomness — the same match
 * always yields the same board, and the board travels to the client inside
 * the snapshot like any other state.
 *
 * FAIRNESS: the board is point-symmetric about its centre — cell (x, y)
 * always matches (W-1-x, H-1-y). The two spawns are themselves a mirror
 * pair, so neither side ever gets kinder ground. Spawns and their
 * neighbours are forced to open z0 footing, and a path between them is
 * guaranteed, so no roll can produce an unplayable map.
 */

export const V1_MAP_ID = MapIdSchema.parse("contested-ground");

const WIDTH = 12;
const HEIGHT = 12;

/** Spawns sit on opposite flanks and are each other's 180° mirror. */
export const V1_SPAWN_PLAYER_1 = { x: 1, y: 5, z: 0 } as const;
export const V1_SPAWN_PLAYER_2 = { x: 10, y: 6, z: 0 } as const;

/** The default featured board, used as a stable reference and in tests. */
export const DEFAULT_MAP_SEED = 1;

/**
 * mulberry32 — a tiny, fast, well-distributed PRNG. Deterministic: a seed
 * fixes the whole stream. Kept local so map generation never touches
 * Math.random and stays reproducible.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const indexOf = (x: number, y: number): number => y * WIDTH + x;
const mirrorX = (x: number): number => WIDTH - 1 - x;
const mirrorY = (y: number): number => HEIGHT - 1 - y;
const inBounds = (x: number, y: number): boolean => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Builds one match's board from a seed. Pure and deterministic: same seed,
 * same map, every time and on every machine.
 */
export function generateMap(seed: number): MapConfig {
  const rng = makeRng(seed);
  const randInt = (maxExclusive: number): number => Math.floor(rng() * maxExclusive);

  const cells: MapCell[] = Array.from({ length: WIDTH * HEIGHT }, () => ({
    z: 0,
    terrainId: TERRAIN_ID_NORMAL,
  }));

  const read = (x: number, y: number): MapCell | undefined =>
    inBounds(x, y) ? cells[indexOf(x, y)] : undefined;

  // Every write is mirrored through the centre, so the two halves — and the
  // two players — always face identical ground.
  const paint = (x: number, y: number, patch: Partial<MapCell>): void => {
    for (const [px, py] of [
      [x, y],
      [mirrorX(x), mirrorY(y)],
    ] as const) {
      const current = read(px, py);
      if (current !== undefined) {
        cells[indexOf(px, py)] = { ...current, ...patch };
      }
    }
  };

  const spawns: Point[] = [V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2];
  const nearSpawn = (x: number, y: number): boolean =>
    spawns.some((spawn) => manhattan(spawn, { x, y }) <= 2);

  // Feature centres come from the inner field, never on a spawn's breathing
  // room. Only the first half is sampled; paint() supplies the mirror.
  const pickCentre = (): Point => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const x = 2 + randInt(WIDTH - 4);
      const y = 2 + randInt(HEIGHT - 4);
      if (indexOf(x, y) <= indexOf(mirrorX(x), mirrorY(y)) && !nearSpawn(x, y)) {
        return { x, y };
      }
    }
    return { x: 4, y: 4 };
  };

  const blob = (centre: Point, radius: number): Point[] => {
    const out: Point[] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = centre.x + dx;
        const y = centre.y + dy;
        if (inBounds(x, y) && Math.abs(dx) + Math.abs(dy) <= radius && !nearSpawn(x, y)) {
          out.push({ x, y });
        }
      }
    }
    return out;
  };

  // 1) Elevation: one or two low hills. A hill is a z1 plateau whose single
  //    innermost cell may rise to z2, always ringed by z1, so a 0→1→2 climb
  //    exists and high ground is reachable — never a sealed pillar.
  const hillCount = 1 + randInt(2);
  for (let hill = 0; hill < hillCount; hill += 1) {
    const centre = pickCentre();
    for (const cell of blob(centre, 1)) {
      paint(cell.x, cell.y, { z: 1 });
    }
    if (rng() < 0.5) {
      paint(centre.x, centre.y, { z: 2 });
    }
  }

  // 2) Water pools — always at least one, so Wet slides are on the table.
  const poolCount = 1 + randInt(2);
  for (let pool = 0; pool < poolCount; pool += 1) {
    const centre = pickCentre();
    for (const cell of blob(centre, 1)) {
      if (read(cell.x, cell.y)?.z === 0) {
        paint(cell.x, cell.y, { terrainId: TERRAIN_ID_WATER });
      }
    }
  }

  // 3) A scatter of the remaining terrains, each placed as single mirrored
  //    cells so the fight can show off every mechanic.
  const scatter = (terrainId: MapCell["terrainId"], count: number, onlyFlat: boolean): void => {
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < count; attempt += 1) {
      const centre = pickCentre();
      if (onlyFlat && read(centre.x, centre.y)?.z !== 0) {
        continue;
      }
      paint(centre.x, centre.y, { terrainId });
      placed += 1;
    }
  };
  scatter(TERRAIN_ID_ICE, 1 + randInt(2), false);
  scatter(TERRAIN_ID_VEGETATION, 1 + randInt(2), false);
  scatter(TERRAIN_ID_EARTH, 1 + randInt(2), false);
  scatter(TERRAIN_ID_LAVA, 1, true);
  // Void is the only terrain that blocks movement, so it stays rare and is
  // placed as isolated cells — a shove-off-the-edge threat, not a wall.
  scatter(TERRAIN_ID_VOID, 1, true);

  // 4) Guarantee open footing: each spawn and its orthogonal neighbours are
  //    forced back to plain z0 ground (painting the first spawn mirrors to
  //    the second).
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    paint(V1_SPAWN_PLAYER_1.x + dx, V1_SPAWN_PLAYER_1.y + dy, {
      z: 0,
      terrainId: TERRAIN_ID_NORMAL,
    });
  }

  // 5) Guarantee a route: if void ever islands a spawn, dissolve void back to
  //    ground until the two spawns connect. Elevation alone can't disconnect
  //    (every step is at most +1), so clearing void always restores a path.
  ensureConnected(cells);

  return { id: V1_MAP_ID, name: "Contested Ground", width: WIDTH, height: HEIGHT, cells };
}

/** Which cells a spawn can reach over walkable ground (climb at most +1). */
function reachableFromPlayer1(cells: readonly MapCell[]): boolean[] {
  const seen = new Array<boolean>(cells.length).fill(false);
  const start = read(cells, V1_SPAWN_PLAYER_1.x, V1_SPAWN_PLAYER_1.y);
  if (start === undefined || start.terrainId === TERRAIN_ID_VOID) {
    return seen;
  }
  const queue: Point[] = [{ x: V1_SPAWN_PLAYER_1.x, y: V1_SPAWN_PLAYER_1.y }];
  seen[indexOf(V1_SPAWN_PLAYER_1.x, V1_SPAWN_PLAYER_1.y)] = true;
  let head = 0;
  while (head < queue.length) {
    const here = queue[head];
    head += 1;
    if (here === undefined) {
      continue;
    }
    const hereCell = read(cells, here.x, here.y);
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
      const next = read(cells, nx, ny);
      if (next === undefined || next.terrainId === TERRAIN_ID_VOID) {
        continue;
      }
      const nextIndex = indexOf(nx, ny);
      if (seen[nextIndex] === true || Math.abs(next.z - hereCell.z) > 1) {
        continue;
      }
      seen[nextIndex] = true;
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/** Dissolves void (everywhere, keeping symmetry) until the spawns connect. */
function ensureConnected(cells: MapCell[]): void {
  const goal = indexOf(V1_SPAWN_PLAYER_2.x, V1_SPAWN_PLAYER_2.y);
  if (reachableFromPlayer1(cells)[goal] === true) {
    return;
  }
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell?.terrainId === TERRAIN_ID_VOID) {
      cells[index] = { ...cell, terrainId: TERRAIN_ID_NORMAL };
    }
  }
}

/** Bounds-checked read against a flat, row-major board. */
function read(cells: readonly MapCell[], x: number, y: number): MapCell | undefined {
  return inBounds(x, y) ? cells[indexOf(x, y)] : undefined;
}
