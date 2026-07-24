import type { CellCoord } from "@atlas/shared";
import type { MatchView, UnitView } from "./match-view.js";

/**
 * UI path suggestion — ARCHITECTURE.md "Client Rendering Decisions".
 *
 * Mirrors the movement cost rules (1 MP per step, +1 per climbed level,
 * climbs above the config maximum blocked, occupied and bottomless cells
 * impassable) purely to PROPOSE a path for the Move intent and highlight
 * reachable cells. The server remains the sole validator; a wrong
 * suggestion costs a rejection, never a wrong game state.
 */

interface Node {
  x: number;
  y: number;
  cost: number;
  parentKey: string | null;
}

const NEIGHBOR_OFFSETS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

function keyOf(x: number, y: number): string {
  return `${String(x)},${String(y)}`;
}

function explore(view: MatchView, unit: UnitView, canClimb: boolean): Map<string, Node> {
  const nodes = new Map<string, Node>();
  const startKey = keyOf(unit.position.x, unit.position.y);
  nodes.set(startKey, { x: unit.position.x, y: unit.position.y, cost: 0, parentKey: null });
  const frontier: Node[] = [{ x: unit.position.x, y: unit.position.y, cost: 0, parentKey: null }];
  const physics = view.config.physics;
  const bottomlessTerrains = new Set(
    view.config.terrains.filter((terrain) => terrain.bottomless).map((terrain) => terrain.id),
  );

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const current = frontier.shift();
    if (current === undefined) {
      break;
    }
    const currentKey = keyOf(current.x, current.y);
    if ((nodes.get(currentKey)?.cost ?? Number.POSITIVE_INFINITY) < current.cost) {
      continue;
    }
    const fromCell = view.cellAt(current.x, current.y);
    if (fromCell === null) {
      continue;
    }
    for (const offset of NEIGHBOR_OFFSETS) {
      const nx = current.x + offset.dx;
      const ny = current.y + offset.dy;
      const cell = view.cellAt(nx, ny);
      if (cell === null || view.livingUnitAt(nx, ny) !== null) {
        continue;
      }
      if (bottomlessTerrains.has(cell.terrainId)) {
        continue;
      }
      const climb = cell.z - fromCell.z;
      if (climb > physics.maxClimbHeightWithoutAbility) {
        continue;
      }
      if (climb > 0 && !canClimb) {
        continue;
      }
      const climbCost = climb > 0 ? climb * physics.climbMovementPointCostPerLevel : 0;
      const nextCost = current.cost + 1 + climbCost;
      if (nextCost > unit.movementPoints) {
        continue;
      }
      const nextKey = keyOf(nx, ny);
      if (nextCost < (nodes.get(nextKey)?.cost ?? Number.POSITIVE_INFINITY)) {
        const node: Node = { x: nx, y: ny, cost: nextCost, parentKey: currentKey };
        nodes.set(nextKey, node);
        frontier.push(node);
      }
    }
  }
  return nodes;
}

export interface ReachableCell {
  readonly coord: CellCoord;
  readonly movementPointCost: number;
}

export function reachableCells(view: MatchView, unit: UnitView, canClimb = true): ReachableCell[] {
  const nodes = explore(view, unit, canClimb);
  const result: ReachableCell[] = [];
  for (const node of nodes.values()) {
    if (node.cost === 0) {
      continue;
    }
    const cell = view.cellAt(node.x, node.y);
    if (cell !== null) {
      result.push({ coord: { x: node.x, y: node.y, z: cell.z }, movementPointCost: node.cost });
    }
  }
  result.sort((a, b) => a.coord.y - b.coord.y || a.coord.x - b.coord.x);
  return result;
}

/** Cheapest path to (x, y) as Move-intent steps, or null if unreachable. */
export function suggestPath(
  view: MatchView,
  unit: UnitView,
  targetX: number,
  targetY: number,
  canClimb = true,
): CellCoord[] | null {
  const nodes = explore(view, unit, canClimb);
  const targetNode = nodes.get(keyOf(targetX, targetY));
  if (targetNode === undefined || targetNode.cost === 0) {
    return null;
  }
  const reversed: CellCoord[] = [];
  let cursor: Node | undefined = targetNode;
  while (cursor !== undefined && cursor.parentKey !== null) {
    const cell = view.cellAt(cursor.x, cursor.y);
    if (cell === null) {
      return null;
    }
    reversed.push({ x: cursor.x, y: cursor.y, z: cell.z });
    cursor = nodes.get(cursor.parentKey);
  }
  return reversed.reverse();
}
