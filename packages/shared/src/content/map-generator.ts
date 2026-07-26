import type { MapCell, MapConfig } from "../config/map-config.js";
import { Z_MAX } from "../board/coordinates.js";
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
 * and "Living Terrain". Every match rolls a fresh, hand-drawn-feeling board
 * (a Dofus-like spread of ground, water, hazards, and real elevation) so the
 * first fight is a real one, not a memorised layout.
 *
 * DETERMINISM (ARCHITECTURE.md "Determinism"): the layout is a pure function
 * of a numeric seed. The server derives that seed from the match's own
 * identity, so there is no hidden randomness — the same match always yields
 * the same board, and the board travels to the client inside the snapshot.
 *
 * NOT MIRRORED: the map is genuinely random, not point-symmetric — the two
 * halves differ, as in a real tactics map. What IS guaranteed, so no roll is
 * unplayable: both spawns sit on open low ground with clear neighbours, every
 * orthogonal step changes height by at most one (all high ground is
 * climbable, never a sealed cliff), and a path between the spawns always
 * exists.
 */

export const V1_MAP_ID = MapIdSchema.parse("contested-ground");

const WIDTH = 16;
const HEIGHT = 16;

/** Spawns sit near opposite flanks, on open low ground (not a mirror pair). */
export const V1_SPAWN_PLAYER_1 = { x: 2, y: 8, z: 0 } as const;
export const V1_SPAWN_PLAYER_2 = { x: 13, y: 7, z: 0 } as const;

/** The default featured board, used as a stable reference and in tests. */
export const DEFAULT_MAP_SEED = 1;

/**
 * Tallest terrace a mound can raise. Kept low (1–2) — a tactics map wants
 * gentle relief, not mountains — so elevation reads as steppable ground.
 */
const MAX_PEAK = 2;

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
const inBounds = (x: number, y: number): boolean => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const chebyshev = (a: Point, b: Point): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const SPAWNS: readonly Point[] = [V1_SPAWN_PLAYER_1, V1_SPAWN_PLAYER_2];

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
  const write = (x: number, y: number, patch: Partial<MapCell>): void => {
    const current = read(x, y);
    if (current !== undefined) {
      cells[indexOf(x, y)] = { ...current, ...patch };
    }
  };

  // Elevation — additive terraces built from Chebyshev cones. Each mound
  // raises a square of ground that steps down one level per ring, and cones
  // are max-combined, so every orthogonal step changes height by at most one:
  // all high ground is reachable by a 0→1→2… climb, never a sealed spire.
  // Mounds keep clear of the spawns, so both starts stay on open low ground.
  const moundCount = 5 + randInt(6);
  for (let mound = 0; mound < moundCount; mound += 1) {
    const peak = 1 + randInt(MAX_PEAK);
    const centre = pickMoundCentre(randInt, peak);
    if (centre === null) {
      continue;
    }
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const raised = peak - chebyshev({ x, y }, centre);
        const current = read(x, y);
        if (current !== undefined && raised > current.z) {
          write(x, y, { z: Math.min(raised, Z_MAX) });
        }
      }
    }
  }

  // Water pools on the lowlands — Wet slides and terrain plays.
  const poolCount = 3 + randInt(3);
  for (let pool = 0; pool < poolCount; pool += 1) {
    const centre = pickOpenCell(randInt, 2);
    for (const cell of disc(centre, 1)) {
      if (read(cell.x, cell.y)?.z === 0) {
        write(cell.x, cell.y, { terrainId: TERRAIN_ID_WATER });
      }
    }
  }

  // Scatter the other terrains so a fight can exercise every mechanic. Ice,
  // vegetation, and earth sit anywhere; lava and the movement-blocking void
  // stay on flat ground and well clear of the spawns.
  scatter(randInt, cells, TERRAIN_ID_ICE, 3 + randInt(4), false);
  scatter(randInt, cells, TERRAIN_ID_VEGETATION, 3 + randInt(4), false);
  scatter(randInt, cells, TERRAIN_ID_EARTH, 2 + randInt(4), false);
  scatter(randInt, cells, TERRAIN_ID_LAVA, 1 + randInt(3), true);

  // Shape the landmass: bite a few coherent bays inward from random edges, so
  // the island's silhouette differs from match to match — never a plain
  // square — with the odd inner pit as a punishing ledge. A protected
  // corridor between the spawns is never carved, so a route across always
  // survives. Void stays rare, which keeps it a real hazard, not the floor.
  const guarded = protectedCells();
  const carveVoid = (cx: number, cy: number, radius: number): void => {
    for (let y = Math.max(0, cy - radius); y <= Math.min(HEIGHT - 1, cy + radius); y += 1) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x += 1) {
        if (!guarded.has(indexOf(x, y)) && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
          write(x, y, { terrainId: TERRAIN_ID_VOID });
        }
      }
    }
  };
  const bayCount = 1 + randInt(3);
  for (let bay = 0; bay < bayCount; bay += 1) {
    const along = randInt(WIDTH);
    const radius = 2 + randInt(3);
    switch (randInt(4)) {
      case 0:
        carveVoid(along, -1, radius);
        break;
      case 1:
        carveVoid(along, HEIGHT, radius);
        break;
      case 2:
        carveVoid(-1, along, radius);
        break;
      default:
        carveVoid(WIDTH, along, radius);
        break;
    }
  }
  const pitCount = randInt(3);
  for (let pit = 0; pit < pitCount; pit += 1) {
    const centre = pickOpenCell(randInt, 3);
    if (!guarded.has(indexOf(centre.x, centre.y))) {
      write(centre.x, centre.y, { terrainId: TERRAIN_ID_VOID });
    }
  }

  // Guarantee open footing: each spawn and its orthogonal neighbours are
  // plain z0 ground (mounds already avoid this zone, so no cliff is created).
  for (const spawn of SPAWNS) {
    for (const [dx, dy] of ORTHOGONAL_WITH_SELF) {
      write(spawn.x + dx, spawn.y + dy, { z: 0, terrainId: TERRAIN_ID_NORMAL });
    }
  }

  // Keep only the single landmass the first spawn stands on: everything the
  // spawn can't walk to (eroded edges, cut-off islands) becomes void. The
  // second spawn is always in it — both spawns' cleared neighbours reach the
  // untouched core — so a route between them is guaranteed.
  keepSpawnLandmass(cells);

  return { id: V1_MAP_ID, name: "Contested Ground", width: WIDTH, height: HEIGHT, cells };
}

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const ORTHOGONAL_WITH_SELF: readonly (readonly [number, number])[] = [[0, 0], ...ORTHOGONAL];

/**
 * Cells that carving must never touch: each spawn's breathing room and a
 * one-cell-wide corridor between the two spawns. Guaranteeing this strip
 * stays land is what keeps every rolled shape traversable spawn-to-spawn.
 */
function protectedCells(): Set<number> {
  const set = new Set<number>();
  const mark = (x: number, y: number): void => {
    if (inBounds(x, y)) {
      set.add(indexOf(x, y));
    }
  };
  for (const spawn of SPAWNS) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        mark(spawn.x + dx, spawn.y + dy);
      }
    }
  }
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(V1_SPAWN_PLAYER_1.x + (V1_SPAWN_PLAYER_2.x - V1_SPAWN_PLAYER_1.x) * t);
    const y = Math.round(V1_SPAWN_PLAYER_1.y + (V1_SPAWN_PLAYER_2.y - V1_SPAWN_PLAYER_1.y) * t);
    for (const [dx, dy] of ORTHOGONAL_WITH_SELF) {
      mark(x + dx, y + dy);
    }
  }
  return set;
}

/** A mound centre whose whole cone stays clear of both spawn zones. */
function pickMoundCentre(randInt: (n: number) => number, peak: number): Point | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = 1 + randInt(WIDTH - 2);
    const y = 1 + randInt(HEIGHT - 2);
    const point = { x, y };
    if (SPAWNS.every((spawn) => chebyshev(point, spawn) >= peak + 2)) {
      return point;
    }
  }
  return null;
}

/** An in-bounds cell at least `pad` from either spawn. */
function pickOpenCell(randInt: (n: number) => number, pad: number): Point {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = 1 + randInt(WIDTH - 2);
    const y = 1 + randInt(HEIGHT - 2);
    const point = { x, y };
    if (SPAWNS.every((spawn) => manhattan(point, spawn) >= pad)) {
      return point;
    }
  }
  return { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2) };
}

/** Cells within a Manhattan radius, in bounds. */
function disc(centre: Point, radius: number): Point[] {
  const out: Point[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = centre.x + dx;
      const y = centre.y + dy;
      if (inBounds(x, y) && Math.abs(dx) + Math.abs(dy) <= radius) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

/** Drops single cells of a terrain onto the board, clear of the spawns. */
function scatter(
  randInt: (n: number) => number,
  cells: MapCell[],
  terrainId: MapCell["terrainId"],
  count: number,
  onlyFlat: boolean,
): void {
  let placed = 0;
  const pad = onlyFlat ? 3 : 2;
  for (let attempt = 0; attempt < 80 && placed < count; attempt += 1) {
    const point = pickOpenCell(randInt, pad);
    const cell = cells[indexOf(point.x, point.y)];
    if (cell === undefined || (onlyFlat && cell.z !== 0)) {
      continue;
    }
    cells[indexOf(point.x, point.y)] = { ...cell, terrainId };
    placed += 1;
  }
}

/** Which cells a spawn can reach over walkable ground (climb at most +1). */
function reachableFromPlayer1(cells: readonly MapCell[]): boolean[] {
  const seen = new Array<boolean>(cells.length).fill(false);
  const start = cells[indexOf(V1_SPAWN_PLAYER_1.x, V1_SPAWN_PLAYER_1.y)];
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
    const hereCell = cells[indexOf(here.x, here.y)];
    if (hereCell === undefined) {
      continue;
    }
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = here.x + dx;
      const ny = here.y + dy;
      if (!inBounds(nx, ny)) {
        continue;
      }
      const nextIndex = indexOf(nx, ny);
      const next = cells[nextIndex];
      if (next === undefined || next.terrainId === TERRAIN_ID_VOID) {
        continue;
      }
      if (seen[nextIndex] === true || Math.abs(next.z - hereCell.z) > 1) {
        continue;
      }
      seen[nextIndex] = true;
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/**
 * Voids every cell the first spawn can't walk to, leaving one connected
 * landmass with organic edges. Elevation never disconnects (each step is at
 * most +1) and both spawns reach the untouched core, so the second spawn is
 * always kept and a route between them survives.
 */
function keepSpawnLandmass(cells: MapCell[]): void {
  const reachable = reachableFromPlayer1(cells);
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell !== undefined && cell.terrainId !== TERRAIN_ID_VOID && reachable[index] !== true) {
      cells[index] = { ...cell, terrainId: TERRAIN_ID_VOID };
    }
  }
}
