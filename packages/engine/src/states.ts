import type { GameEvent, SpellId, StateId, UnitId } from "@atlas/shared";
import type { CellRuntime, MatchState, UnitRuntime } from "./match-state.js";
import { coordOf } from "./board.js";
import { stateApplicationIsPrevented } from "./elemental.js";

/**
 * State lifecycle — COMBAT_RULEBOOK.md "States".
 * Duration, owner, source; re-application replaces the remaining duration
 * (rulebook Edge Cases); durations tick at end of round.
 */

export function applyStateToUnit(
  state: MatchState,
  unit: UnitRuntime,
  stateId: StateId,
  duration: number,
  ownerUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  // The interaction table can suppress an incoming state outright
  // (rulebook: Elemental Interactions) — e.g. Wet quenching Burning.
  if (stateApplicationIsPrevented(state, unit, stateId, events)) {
    return;
  }
  const existing = unit.states.find((instance) => instance.stateId === stateId);
  if (existing !== undefined) {
    existing.remainingDuration = duration;
  } else {
    unit.states.push({ stateId, remainingDuration: duration, ownerUnitId, sourceSpellId });
  }
  events.push({
    type: "ApplyState",
    stateId,
    target: { kind: "Unit", unitId: unit.id },
    duration,
  });
}

export function applyStateToCell(
  cell: CellRuntime,
  stateId: StateId,
  duration: number,
  ownerUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  const existing = cell.states.find((instance) => instance.stateId === stateId);
  if (existing !== undefined) {
    existing.remainingDuration = duration;
  } else {
    cell.states.push({ stateId, remainingDuration: duration, ownerUnitId, sourceSpellId });
  }
  events.push({
    type: "ApplyState",
    stateId,
    target: { kind: "Cell", coord: coordOf(cell) },
    duration,
  });
}

/**
 * End-of-round tick (rulebook Round Structure, step 8). Deterministic order:
 * units in creation order, then cells row-major; states in application order.
 */
export function tickStatesEndOfRound(state: MatchState, events: GameEvent[]): void {
  for (const unit of state.units) {
    if (!unit.alive) {
      continue;
    }
    const remaining = [];
    for (const instance of unit.states) {
      instance.remainingDuration -= 1;
      if (instance.remainingDuration > 0) {
        remaining.push(instance);
      } else {
        events.push({
          type: "RemoveState",
          stateId: instance.stateId,
          target: { kind: "Unit", unitId: unit.id },
        });
      }
    }
    unit.states = remaining;
  }

  for (const cell of state.cells) {
    if (cell.states.length === 0) {
      continue;
    }
    const remaining = [];
    for (const instance of cell.states) {
      instance.remainingDuration -= 1;
      if (instance.remainingDuration > 0) {
        remaining.push(instance);
      } else {
        events.push({
          type: "RemoveState",
          stateId: instance.stateId,
          target: { kind: "Cell", coord: coordOf(cell) },
        });
      }
    }
    cell.states = remaining;
  }
}
