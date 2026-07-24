import type {
  ChooseStanceIntent,
  EndTurnIntent,
  GameEvent,
  IntentErrorCode,
  PlayerId,
  UnitId,
} from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { unitById } from "./board.js";
import { tickStatesEndOfRound } from "./states.js";

/**
 * Round and turn flow — COMBAT_RULEBOOK.md "Round Structure" and
 * "Initiative": secret stance selection with simultaneous reveal, then
 * alternating player activations with a rotating first player.
 */

export type TurnOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: IntentErrorCode };

export function startRound(state: MatchState, events: GameEvent[]): void {
  if (state.phase === "Finished") {
    return;
  }
  state.roundNumber += 1;
  events.push({ type: "RoundStarted", roundNumber: state.roundNumber });

  // Previous round's reveal expires with the round.
  for (const unit of state.units) {
    unit.revealedStanceId = null;
  }
  state.lockedStances.clear();

  if (state.config.stances.length === 0) {
    // Rulebook: with no stances configured, steps 3–6 are skipped.
    beginUnitTurns(state, events);
  } else {
    state.phase = "StanceSelection";
    state.activeInitiativeIndex = -1;
  }
}

export function tryLockStance(
  state: MatchState,
  playerId: PlayerId,
  intent: ChooseStanceIntent,
  events: GameEvent[],
): TurnOutcome {
  if (state.phase === "Finished") {
    return { ok: false, code: "MatchNotActive" };
  }
  if (state.phase !== "StanceSelection") {
    return { ok: false, code: "NotYourTurn" };
  }
  if (!state.playerOrder.includes(playerId) || !playerHasLivingUnits(state, playerId)) {
    return { ok: false, code: "NotYourTurn" };
  }
  if (!state.registries.stanceById.has(intent.stanceId)) {
    return { ok: false, code: "UnknownStance" };
  }
  if (state.lockedStances.has(playerId)) {
    return { ok: false, code: "StanceAlreadyLocked" };
  }

  // SECRET: locking produces no event and no state visible to any client.
  state.lockedStances.set(playerId, intent.stanceId);

  const everyLivingPlayerLocked = state.playerOrder.every(
    (id) => !playerHasLivingUnits(state, id) || state.lockedStances.has(id),
  );
  if (everyLivingPlayerLocked) {
    revealStances(state, events);
  }
  return { ok: true };
}

function revealStances(state: MatchState, events: GameEvent[]): void {
  // Simultaneous reveal (rulebook Round Structure step 5): one event per
  // player, all at the same simulation step, in deterministic join order.
  for (const playerId of state.playerOrder) {
    const stanceId = state.lockedStances.get(playerId);
    if (stanceId === undefined) {
      continue;
    }
    events.push({ type: "StanceRevealed", playerId, stanceId });
    for (const unit of state.units) {
      if (unit.alive && unit.playerId === playerId) {
        unit.revealedStanceId = stanceId;
      }
    }
  }
  state.lockedStances.clear();
  beginUnitTurns(state, events);
}

function beginUnitTurns(state: MatchState, events: GameEvent[]): void {
  state.initiativeOrder = computeInitiativeOrder(state);
  state.phase = "UnitTurns";
  state.activeInitiativeIndex = -1;
  advanceToNextTurn(state, events);
}

/**
 * Alternating player activations, first player rotating with the round
 * number; within one player, units act in creation order; a player with
 * more units finishes the round with their surplus units in sequence.
 */
export function computeInitiativeOrder(state: MatchState): UnitId[] {
  const queues: UnitId[][] = state.playerOrder.map((playerId) =>
    state.units.filter((unit) => unit.alive && unit.playerId === playerId).map((unit) => unit.id),
  );
  const order: UnitId[] = [];
  const playerCount = state.playerOrder.length;
  let cursor = (state.roundNumber - 1) % playerCount;
  let exhausted = 0;

  while (exhausted < playerCount) {
    const queue = queues[cursor % playerCount];
    cursor += 1;
    if (queue === undefined) {
      break;
    }
    const next = queue.shift();
    if (next !== undefined) {
      order.push(next);
    }
    exhausted = queues.every((q) => q.length === 0) ? playerCount : 0;
  }
  return order;
}

export function tryEndTurn(
  state: MatchState,
  playerId: PlayerId,
  intent: EndTurnIntent,
  events: GameEvent[],
): TurnOutcome {
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
  const activeId = state.initiativeOrder[state.activeInitiativeIndex];
  if (unit.playerId !== playerId || activeId !== unit.id) {
    return { ok: false, code: "NotYourTurn" };
  }
  endActiveTurn(state, events);
  return { ok: true };
}

export function endActiveTurn(state: MatchState, events: GameEvent[]): void {
  const activeId = state.initiativeOrder[state.activeInitiativeIndex];
  if (activeId !== undefined) {
    events.push({ type: "TurnEnded", unitId: activeId });
  }
  advanceToNextTurn(state, events);
}

function advanceToNextTurn(state: MatchState, events: GameEvent[]): void {
  let nextIndex = state.activeInitiativeIndex + 1;
  while (nextIndex < state.initiativeOrder.length) {
    const unitId = state.initiativeOrder[nextIndex];
    const unit = unitId === undefined ? null : unitById(state, unitId);
    if (unit?.alive === true) {
      state.activeInitiativeIndex = nextIndex;
      startUnitTurn(state, unit, events);
      return;
    }
    nextIndex += 1;
  }
  endRound(state, events);
}

function startUnitTurn(state: MatchState, unit: UnitRuntime, events: GameEvent[]): void {
  const gameClass = state.registries.classById.get(unit.classId);
  if (gameClass === undefined) {
    throw new Error(`Unknown class "${unit.classId}" for unit "${unit.id}"`);
  }
  unit.currentActionPoints = gameClass.baseActionPoints;
  unit.currentMovementPoints = gameClass.baseMovementPoints;
  events.push({ type: "TurnStarted", unitId: unit.id });
}

function endRound(state: MatchState, events: GameEvent[]): void {
  // Rulebook Round Structure step 8: end-of-round effects, then next round.
  tickStatesEndOfRound(state, events);
  startRound(state, events);
}

/**
 * Post-resolution cleanup (rulebook Edge Cases): if the active unit died
 * during its own action, its turn ends automatically.
 */
export function endTurnIfActiveUnitDead(state: MatchState, events: GameEvent[]): void {
  if (state.phase !== "UnitTurns") {
    return;
  }
  const activeId = state.initiativeOrder[state.activeInitiativeIndex];
  const unit = activeId === undefined ? null : unitById(state, activeId);
  if (unit !== null && !unit.alive) {
    endActiveTurn(state, events);
  }
}

function playerHasLivingUnits(state: MatchState, playerId: PlayerId): boolean {
  return state.units.some((unit) => unit.alive && unit.playerId === playerId);
}
