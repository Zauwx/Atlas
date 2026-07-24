import type {
  GameConfig,
  GameEvent,
  IntentErrorCode,
  IntentRejection,
  MatchId,
  MatchSetup,
  MatchSnapshot,
  PlayerId,
  PlayerIntent,
} from "@atlas/shared";
import type { MatchState } from "./match-state.js";
import { createMatchState } from "./match-state.js";
import { tryMove } from "./movement.js";
import { RuleModifierRegistry } from "./rules.js";
import { tryCastSpell } from "./spells.js";
import { endTurnIfActiveUnitDead, startRound, tryEndTurn, tryLockStance } from "./turn-engine.js";
import { finalizeResolution } from "./victory.js";

/**
 * The engine facade — ARCHITECTURE.md "Networking Model": intents in,
 * events out. The server owns one MatchSimulation per match; the client
 * never talks to this class directly.
 */

export type IntentResult =
  | { readonly accepted: true; readonly events: readonly GameEvent[] }
  | { readonly accepted: false; readonly rejection: IntentRejection };

export class MatchSimulation {
  private readonly matchId: MatchId;
  private readonly state: MatchState;
  private readonly registry: RuleModifierRegistry;

  constructor(
    matchId: MatchId,
    config: GameConfig,
    setup: MatchSetup,
    registry: RuleModifierRegistry = new RuleModifierRegistry(),
  ) {
    this.matchId = matchId;
    this.registry = registry;
    this.state = createMatchState(config, setup);
    startRound(this.state, this.registry, this.state.eventLog);
  }

  handleIntent(playerId: PlayerId, intent: PlayerIntent): IntentResult {
    const before = this.state.eventLog.length;
    const code = this.dispatch(playerId, intent);
    if (code !== null) {
      return {
        accepted: false,
        rejection: { intentType: intent.type, code, message: null },
      };
    }
    // Pipeline steps 17–19 run after EVERY resolution, then the edge-case
    // cleanup for an active unit that died during its own action.
    if (intent.type === "Move" || intent.type === "CastSpell") {
      finalizeResolution(this.state, this.state.eventLog);
      endTurnIfActiveUnitDead(this.state, this.registry, this.state.eventLog);
    }
    return { accepted: true, events: this.state.eventLog.slice(before) };
  }

  private dispatch(playerId: PlayerId, intent: PlayerIntent): IntentErrorCode | null {
    switch (intent.type) {
      case "Move": {
        const outcome = tryMove(this.state, this.registry, playerId, intent, this.state.eventLog);
        return outcome.ok ? null : outcome.code;
      }
      case "CastSpell": {
        const outcome = tryCastSpell(
          this.state,
          this.registry,
          playerId,
          intent,
          this.state.eventLog,
        );
        return outcome.ok ? null : outcome.code;
      }
      case "ChooseStance": {
        const outcome = tryLockStance(
          this.state,
          this.registry,
          playerId,
          intent,
          this.state.eventLog,
        );
        return outcome.ok ? null : outcome.code;
      }
      case "EndTurn": {
        const outcome = tryEndTurn(
          this.state,
          this.registry,
          playerId,
          intent,
          this.state.eventLog,
        );
        return outcome.ok ? null : outcome.code;
      }
    }
  }

  /** Full event log — the replay foundation (ARCHITECTURE.md). */
  getEventLog(): readonly GameEvent[] {
    return this.state.eventLog;
  }

  /**
   * Resynchronization snapshot. Locked stance choices are NEVER part of it
   * (rulebook invariant); only revealed stances appear.
   */
  getSnapshot(): MatchSnapshot {
    const activeUnitId = this.state.initiativeOrder[this.state.activeInitiativeIndex] ?? null;
    return {
      id: this.matchId,
      roundNumber: this.state.roundNumber,
      phase: this.state.phase,
      board: {
        width: this.state.mapWidth,
        height: this.state.mapHeight,
        cells: this.state.cells.map((cell) => ({
          coord: { x: cell.x, y: cell.y, z: cell.z },
          terrainId: cell.terrainId,
          states: cell.states.map((instance) => ({ ...instance })),
        })),
      },
      units: this.state.units
        .filter((unit) => unit.alive)
        .map((unit) => ({
          id: unit.id,
          playerId: unit.playerId,
          classId: unit.classId,
          position: { ...unit.position },
          currentHealthPoints: unit.currentHealthPoints,
          maxHealthPoints: unit.maxHealthPoints,
          currentActionPoints: unit.currentActionPoints,
          currentMovementPoints: unit.currentMovementPoints,
          states: unit.states.map((instance) => ({ ...instance })),
          revealedStanceId: unit.revealedStanceId,
        })),
      initiativeOrder: [...this.state.initiativeOrder],
      activeUnitId,
    };
  }
}
