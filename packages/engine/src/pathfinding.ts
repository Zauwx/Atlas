import type { CellCoord } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import {
  cellAt,
  DIRECTION_OFFSETS,
  DIRECTION_ORDER,
  isBottomless,
  isInBounds,
  livingUnitAt,
} from "./board.js";
import type { RuleModifierRegistry } from "./rules.js";
import { canUnitMove } from "./rules.js";

/**
 * Deterministic reachable-cell computation (uniform-cost search).
 *
 * Mirrors the movement rules: 1 MP per step, +1 MP per climbed level,
 * climbs above the config maximum are illegal, drops are legal (a 2+ drop
 * is a fall — reachability ignores the damage), occupied cells are
 * impassable, bottomless cells are never listed as destinations.
 *
 * DETERMINISM: the frontier is processed in (cost, y, x) order and
 * neighbors expand in the fixed North/East/South/West order.
 */
export interface ReachableCell {
  readonly coord: CellCoord;
  readonly movementPointCost: number;
}

export function computeReachableCells(
  state: MatchState,
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
): ReachableCell[] {
  if (!unit.alive || !canUnitMove(state, registry, unit)) {
    return [];
  }

  const budget = unit.currentMovementPoints;
  const bestCost = new Map<number, number>();
  const startIndex = unit.position.y * state.mapWidth + unit.position.x;
  bestCost.set(startIndex, 0);

  interface FrontierEntry {
    x: number;
    y: number;
    cost: number;
  }
  const frontier: FrontierEntry[] = [{ x: unit.position.x, y: unit.position.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const entry = frontier.shift();
    if (entry === undefined) {
      break;
    }
    const entryIndex = entry.y * state.mapWidth + entry.x;
    if ((bestCost.get(entryIndex) ?? Number.POSITIVE_INFINITY) < entry.cost) {
      continue;
    }
    const fromZ = cellAt(state, entry.x, entry.y).z;

    for (const direction of DIRECTION_ORDER) {
      const offset = DIRECTION_OFFSETS[direction];
      const nx = entry.x + offset.dx;
      const ny = entry.y + offset.dy;
      if (!isInBounds(state, nx, ny)) {
        continue;
      }
      const cell = cellAt(state, nx, ny);
      if (livingUnitAt(state, nx, ny) !== null || isBottomless(state, cell)) {
        continue;
      }
      const climb = cell.z - fromZ;
      if (climb > state.config.physics.maxClimbHeightWithoutAbility) {
        continue;
      }
      const climbCost = climb > 0 ? climb * state.config.physics.climbMovementPointCostPerLevel : 0;
      const nextCost = entry.cost + 1 + climbCost;
      if (nextCost > budget) {
        continue;
      }
      const nextIndex = ny * state.mapWidth + nx;
      if (nextCost < (bestCost.get(nextIndex) ?? Number.POSITIVE_INFINITY)) {
        bestCost.set(nextIndex, nextCost);
        frontier.push({ x: nx, y: ny, cost: nextCost });
      }
    }
  }

  const reachable: ReachableCell[] = [];
  for (const [index, cost] of bestCost) {
    if (index === startIndex) {
      continue;
    }
    const x = index % state.mapWidth;
    const y = Math.floor(index / state.mapWidth);
    reachable.push({ coord: { x, y, z: cellAt(state, x, y).z }, movementPointCost: cost });
  }
  reachable.sort((a, b) => a.coord.y - b.coord.y || a.coord.x - b.coord.x);
  return reachable;
}
