import type { Direction, GameEvent } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { cellAt, coordOf, DIRECTION_OFFSETS, isInBounds, livingUnitAt } from "./board.js";
import { applyFall } from "./fall.js";
import type { RuleModifierRegistry } from "./rules.js";
import { effectivePushDistance } from "./rules.js";
import { applyTerrainOnEnter } from "./terrain.js";

/**
 * Pushes — COMBAT_RULEBOOK.md "Pushes", resolved cell by cell:
 * - out of bounds / occupied / higher (+1 z or more) → collision
 *   (damage = remaining cells × physics config);
 * - same height → enter (terrain applies its states), continue;
 * - lower (−1 z or more) → the unit falls into that cell and the push ends
 *   without collision damage for the remaining distance.
 *
 * Event order: the Push event (covering the horizontal shove) precedes the
 * terrain/collision/fall events it caused.
 */
export function resolvePush(
  state: MatchState,
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
  direction: Direction,
  baseDistance: number,
  events: GameEvent[],
): void {
  const distance = effectivePushDistance(state, registry, unit, baseDistance);
  if (distance <= 0) {
    return;
  }

  const offset = DIRECTION_OFFSETS[direction];
  const start = { ...unit.position };
  // Terrain events from traversed cells are buffered so the Push event can
  // be emitted first, matching the traversal order for clients.
  const terrainEvents: GameEvent[] = [];
  let traversed = 0;

  const emitPushSoFar = (): void => {
    if (traversed > 0) {
      events.push({ type: "Push", unitId: unit.id, direction, from: start, to: unit.position });
      events.push(...terrainEvents);
    }
  };

  for (let step = 1; step <= distance; step += 1) {
    const currentZ = unit.position.z;
    const nextX = unit.position.x + offset.dx;
    const nextY = unit.position.y + offset.dy;
    const remaining = distance - step + 1;

    const blocked =
      !isInBounds(state, nextX, nextY) ||
      livingUnitAt(state, nextX, nextY) !== null ||
      cellAt(state, nextX, nextY).z >= currentZ + 1;

    if (blocked) {
      emitPushSoFar();
      const damage = remaining * state.config.physics.collisionDamagePerRemainingCell;
      unit.currentHealthPoints -= damage;
      events.push({
        type: "Collision",
        unitId: unit.id,
        at: unit.position,
        remainingCells: remaining,
        damage,
      });
      return;
    }

    const nextCell = cellAt(state, nextX, nextY);

    if (nextCell.z <= currentZ - 1) {
      emitPushSoFar();
      applyFall(state, unit, { ...unit.position }, nextCell, events);
      return;
    }

    unit.position = coordOf(nextCell);
    traversed += 1;
    applyTerrainOnEnter(state, unit, nextCell, terrainEvents);
    if (unit.fellIntoBottomless) {
      break;
    }
  }

  emitPushSoFar();
}
