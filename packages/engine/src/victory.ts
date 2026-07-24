import type { GameEvent, PlayerId } from "@atlas/shared";
import type { MatchState } from "./match-state.js";

/**
 * End-of-resolution finalization — pipeline steps 17–19
 * (COMBAT_RULEBOOK.md): death check (HP ≤ 0 or bottomless), removal,
 * then victory. Never invoked mid-resolution.
 */
export function finalizeResolution(state: MatchState, events: GameEvent[]): void {
  for (const unit of state.units) {
    if (unit.alive && (unit.currentHealthPoints <= 0 || unit.fellIntoBottomless)) {
      unit.alive = false;
      events.push({ type: "Death", unitId: unit.id });
    }
  }

  if (state.phase === "Finished") {
    return;
  }

  const livingPlayers: PlayerId[] = state.playerOrder.filter((playerId) =>
    state.units.some((unit) => unit.alive && unit.playerId === playerId),
  );

  if (livingPlayers.length > 1) {
    return;
  }

  const winner = livingPlayers.length === 1 ? (livingPlayers[0] ?? null) : null;
  state.phase = "Finished";
  state.activeInitiativeIndex = -1;
  events.push({ type: "Victory", winnerPlayerId: winner });
}
