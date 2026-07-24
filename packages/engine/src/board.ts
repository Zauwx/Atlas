import type { CellCoord, Direction } from "@atlas/shared";
import type { CellRuntime, MatchState, UnitRuntime } from "./match-state.js";

/**
 * Board queries — COMBAT_RULEBOOK.md "Board & Coordinates".
 * Square grid, orthogonal adjacency, row-major storage.
 */

/** Grid orientation: x grows East, y grows South. */
export const DIRECTION_OFFSETS: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  North: { dx: 0, dy: -1 },
  East: { dx: 1, dy: 0 },
  South: { dx: 0, dy: 1 },
  West: { dx: -1, dy: 0 },
};

/** Deterministic neighbor iteration order for all engine traversals. */
export const DIRECTION_ORDER: readonly Direction[] = ["North", "East", "South", "West"];

export function isInBounds(state: MatchState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.mapWidth && y < state.mapHeight;
}

export function cellAt(state: MatchState, x: number, y: number): CellRuntime {
  const cell = state.cells[y * state.mapWidth + x];
  if (!isInBounds(state, x, y) || cell === undefined) {
    throw new Error(`cellAt out of bounds: (${String(x)}, ${String(y)})`);
  }
  return cell;
}

export function coordOf(cell: CellRuntime): CellCoord {
  return { x: cell.x, y: cell.y, z: cell.z };
}

export function livingUnitAt(state: MatchState, x: number, y: number): UnitRuntime | null {
  for (const unit of state.units) {
    if (unit.alive && unit.position.x === x && unit.position.y === y) {
      return unit;
    }
  }
  return null;
}

export function unitById(state: MatchState, unitId: string): UnitRuntime | null {
  for (const unit of state.units) {
    if (unit.id === unitId) {
      return unit;
    }
  }
  return null;
}

export function manhattanDistance(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isBottomless(state: MatchState, cell: CellRuntime): boolean {
  return state.registries.terrainById.get(cell.terrainId)?.bottomless === true;
}
