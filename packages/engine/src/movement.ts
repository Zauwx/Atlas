import type { CellCoord, GameEvent, IntentErrorCode, MoveIntent, PlayerId } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { cellAt, isInBounds, livingUnitAt, unitById } from "./board.js";
import { applyFall } from "./fall.js";
import type { RuleModifierRegistry } from "./rules.js";
import { canUnitMove, effectiveClimbCost } from "./rules.js";
import { applyTerrainOnEnter } from "./terrain.js";

/**
 * Voluntary movement — COMBAT_RULEBOOK.md "Movement" and "Verticality".
 * The server validates the full path before applying anything; application
 * is cell by cell, with terrain entry and voluntary-fall rules.
 */

interface StepPlan {
  readonly coord: CellCoord;
  readonly movementPointCost: number;
  /** Drop of 2+ z: the step is resolved as a fall (rulebook: Verticality). */
  readonly isFall: boolean;
}

export type MoveOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: IntentErrorCode };

export function tryMove(
  state: MatchState,
  registry: RuleModifierRegistry,
  playerId: PlayerId,
  intent: MoveIntent,
  events: GameEvent[],
): MoveOutcome {
  if (state.phase === "Finished") {
    return { ok: false, code: "MatchNotActive" };
  }
  if (state.phase !== "UnitTurns") {
    return { ok: false, code: "NotYourTurn" };
  }
  const unit = unitById(state, intent.unitId);
  if (!unit?.alive) {
    return { ok: false, code: "UnknownUnit" };
  }
  if (unit.playerId !== playerId || !isActiveUnit(state, unit)) {
    return { ok: false, code: "NotYourTurn" };
  }
  if (!canUnitMove(state, registry, unit)) {
    return { ok: false, code: "MovementBlocked" };
  }

  const plan: StepPlan[] = [];
  let current = unit.position;
  let totalCost = 0;

  for (const coord of intent.path) {
    const dx = Math.abs(coord.x - current.x);
    const dy = Math.abs(coord.y - current.y);
    if (dx + dy !== 1) {
      return { ok: false, code: "InvalidTarget" };
    }
    if (!isInBounds(state, coord.x, coord.y)) {
      return { ok: false, code: "OutOfBounds" };
    }
    const cell = cellAt(state, coord.x, coord.y);
    if (cell.z !== coord.z) {
      return { ok: false, code: "InvalidTarget" };
    }
    if (livingUnitAt(state, coord.x, coord.y) !== null) {
      return { ok: false, code: "CellOccupied" };
    }

    const climb = cell.z - current.z;
    if (climb > state.config.physics.maxClimbHeightWithoutAbility) {
      return { ok: false, code: "ClimbTooHigh" };
    }
    const baseClimbCost =
      climb > 0 ? climb * state.config.physics.climbMovementPointCostPerLevel : 0;
    const climbCost =
      baseClimbCost > 0 ? effectiveClimbCost(state, registry, unit, baseClimbCost) : 0;
    const stepCost = 1 + climbCost;
    totalCost += stepCost;

    plan.push({ coord, movementPointCost: stepCost, isFall: climb <= -2 });
    current = coord;
  }

  if (totalCost > unit.currentMovementPoints) {
    return { ok: false, code: "NotEnoughMovementPoints" };
  }

  applyPlannedMove(state, unit, plan, events);
  return { ok: true };
}

function isActiveUnit(state: MatchState, unit: UnitRuntime): boolean {
  const activeId = state.initiativeOrder[state.activeInitiativeIndex];
  return activeId !== undefined && activeId === unit.id;
}

function applyPlannedMove(
  state: MatchState,
  unit: UnitRuntime,
  plan: readonly StepPlan[],
  events: GameEvent[],
): void {
  let walkedSegment: CellCoord[] = [];

  const flushSegment = (): void => {
    if (walkedSegment.length > 0) {
      events.push({ type: "Move", unitId: unit.id, path: walkedSegment });
      walkedSegment = [];
    }
  };

  for (const step of plan) {
    unit.currentMovementPoints -= step.movementPointCost;
    const cell = cellAt(state, step.coord.x, step.coord.y);

    if (step.isFall) {
      flushSegment();
      applyFall(state, unit, { ...unit.position }, cell, events);
    } else {
      unit.position = step.coord;
      walkedSegment.push(step.coord);
      // Terrain state events belong after the Move event covering the entry;
      // flush so event order matches the traversal order.
      const beforeTerrain = events.length;
      applyTerrainOnEnter(state, unit, cell, events);
      if (events.length > beforeTerrain) {
        // Reorder: Move segment must precede the terrain events just added.
        const terrainEvents = events.splice(beforeTerrain);
        flushSegment();
        events.push(...terrainEvents);
      }
    }

    // Death interrupts the rest of the path (rulebook: continue only if alive).
    if (unit.fellIntoBottomless || unit.currentHealthPoints <= 0) {
      return;
    }
  }

  flushSegment();
}
