import { MatchSimulation } from "@atlas/engine";
import type {
  GameConfig,
  GameEvent,
  MatchEndReason,
  MatchId,
  MatchSetup,
  PlayerId,
  StanceId,
} from "@atlas/shared";
import { PlayerIntentSchema, RoomMessageType } from "@atlas/shared";
import type { Scheduler, ScheduledTask } from "./scheduler.js";
import type { ReplayStore } from "../replay/replay-store.js";

/**
 * Transport-agnostic match host — ARCHITECTURE.md "Timers and Disconnects".
 *
 * Owns one MatchSimulation and everything around it that the engine must
 * not know about: wire validation, message fan-out, turn/stance timers,
 * disconnect grace and forfeits, and replay assembly. The Colyseus Room is
 * a thin adapter over this class; all logic here is unit-tested without
 * sockets.
 */

export interface MatchMessenger {
  sendToPlayer(playerId: PlayerId, type: RoomMessageType, payload: unknown): void;
  broadcast(type: RoomMessageType, payload: unknown): void;
}

export interface MatchCoordinatorOptions {
  /** Seconds a disconnected player's seat is held before forfeit. */
  reconnectionGraceSeconds?: number;
}

const DEFAULT_RECONNECTION_GRACE_SECONDS = 60;

export class MatchCoordinator {
  private readonly simulation: MatchSimulation;
  private readonly playerIds: readonly PlayerId[];
  private readonly graceSeconds: number;

  private matchEnded = false;
  private currentTimerKey: string | null = null;
  private currentTimer: ScheduledTask | null = null;
  private readonly forfeitTimers = new Map<PlayerId, ScheduledTask>();
  /** Repeat-previous-stance timeout rule (COMBAT_RULEBOOK.md "Timers"). */
  private readonly lastStanceByPlayer = new Map<PlayerId, StanceId>();
  private readonly stanceLockedThisPhase = new Set<PlayerId>();

  constructor(
    private readonly matchId: MatchId,
    private readonly config: GameConfig,
    private readonly setup: MatchSetup,
    private readonly messenger: MatchMessenger,
    private readonly scheduler: Scheduler,
    private readonly replayStore: ReplayStore,
    options?: MatchCoordinatorOptions,
  ) {
    this.simulation = new MatchSimulation(matchId, config, setup);
    this.playerIds = setup.players.map((player) => player.id);
    this.graceSeconds = options?.reconnectionGraceSeconds ?? DEFAULT_RECONNECTION_GRACE_SECONDS;
  }

  get ended(): boolean {
    return this.matchEnded;
  }

  start(): void {
    // Config first, then snapshot: clients need content metadata (spells,
    // classes, stances) before they can interpret the snapshot.
    this.messenger.broadcast(RoomMessageType.Config, this.config);
    this.messenger.broadcast(RoomMessageType.Snapshot, this.simulation.getSnapshot());
    this.refreshTimers();
  }

  /** Entry point for every raw client message. Never trusts the payload. */
  handleIntent(playerId: PlayerId, rawPayload: unknown): void {
    if (this.matchEnded) {
      this.messenger.sendToPlayer(playerId, RoomMessageType.Rejection, {
        intentType: null,
        code: "MatchNotActive",
        message: null,
      });
      return;
    }
    const parsed = PlayerIntentSchema.safeParse(rawPayload);
    if (!parsed.success) {
      this.messenger.sendToPlayer(playerId, RoomMessageType.Rejection, {
        intentType: null,
        code: "SchemaInvalid",
        message: null,
      });
      return;
    }

    const intent = parsed.data;
    const result = this.simulation.handleIntent(playerId, intent);
    if (!result.accepted) {
      this.messenger.sendToPlayer(playerId, RoomMessageType.Rejection, result.rejection);
      return;
    }

    if (intent.type === "ChooseStance") {
      this.lastStanceByPlayer.set(playerId, intent.stanceId);
      this.stanceLockedThisPhase.add(playerId);
    }
    // Explicit acceptance: a silent stance lock produces no events, so the
    // sender needs a dedicated acknowledgment.
    this.messenger.sendToPlayer(playerId, RoomMessageType.Ack, { intentType: intent.type });
    this.publishAndSettle(result.events);
  }

  playerDisconnected(playerId: PlayerId): void {
    if (this.matchEnded || this.forfeitTimers.has(playerId)) {
      return;
    }
    this.messenger.broadcast(RoomMessageType.PlayerConnection, { playerId, connected: false });
    this.forfeitTimers.set(
      playerId,
      this.scheduler.schedule(this.graceSeconds * 1000, () => {
        this.forfeit(playerId);
      }),
    );
  }

  playerReconnected(playerId: PlayerId): void {
    const timer = this.forfeitTimers.get(playerId);
    if (timer !== undefined) {
      timer.cancel();
      this.forfeitTimers.delete(playerId);
    }
    if (this.matchEnded) {
      return;
    }
    this.messenger.broadcast(RoomMessageType.PlayerConnection, { playerId, connected: true });
    this.messenger.sendToPlayer(playerId, RoomMessageType.Config, this.config);
    this.messenger.sendToPlayer(playerId, RoomMessageType.Snapshot, this.simulation.getSnapshot());
  }

  private publishAndSettle(events: readonly GameEvent[]): void {
    if (events.length > 0) {
      this.messenger.broadcast(RoomMessageType.Events, events);
    }
    if (events.some((event) => event.type === "RoundStarted")) {
      this.stanceLockedThisPhase.clear();
    }
    const victory = events.find(
      (event): event is Extract<GameEvent, { type: "Victory" }> => event.type === "Victory",
    );
    if (victory !== undefined) {
      this.endMatch(victory.winnerPlayerId === null ? "Draw" : "Victory", victory.winnerPlayerId);
      return;
    }
    this.refreshTimers();
  }

  /**
   * One timer at a time, keyed by phase identity, so actions within a turn
   * never reset the turn's budget (rulebook "Timers").
   */
  private refreshTimers(): void {
    if (this.matchEnded) {
      return;
    }
    const snapshot = this.simulation.getSnapshot();
    let key: string | null = null;
    let delaySeconds = 0;
    if (snapshot.phase === "StanceSelection") {
      key = `stance:${String(snapshot.roundNumber)}`;
      delaySeconds = this.config.timers.stanceSelectionSeconds;
    } else if (snapshot.phase === "UnitTurns" && snapshot.activeUnitId !== null) {
      key = `turn:${String(snapshot.roundNumber)}:${snapshot.activeUnitId}`;
      delaySeconds = this.config.timers.unitTurnSeconds;
    }

    if (key === this.currentTimerKey) {
      return;
    }
    this.currentTimer?.cancel();
    this.currentTimerKey = key;
    this.currentTimer =
      key === null
        ? null
        : this.scheduler.schedule(delaySeconds * 1000, () => {
            this.handlePhaseTimeout();
          });
  }

  private handlePhaseTimeout(): void {
    this.currentTimer = null;
    this.currentTimerKey = null;
    if (this.matchEnded) {
      return;
    }
    const snapshot = this.simulation.getSnapshot();
    const collected: GameEvent[] = [];

    if (snapshot.phase === "StanceSelection") {
      // Auto-lock for every player who has not chosen (rulebook "Timers"):
      // previous round's stance, falling back to the first configured one.
      for (const playerId of this.playerIds) {
        if (this.stanceLockedThisPhase.has(playerId)) {
          continue;
        }
        const stanceId = this.resolveTimeoutStance(playerId);
        if (stanceId === null) {
          continue;
        }
        const result = this.simulation.handleIntent(playerId, {
          type: "ChooseStance",
          stanceId,
        });
        if (result.accepted) {
          this.lastStanceByPlayer.set(playerId, stanceId);
          this.stanceLockedThisPhase.add(playerId);
          collected.push(...result.events);
        }
      }
    } else if (snapshot.phase === "UnitTurns" && snapshot.activeUnitId !== null) {
      const activeUnit = snapshot.units.find((unit) => unit.id === snapshot.activeUnitId);
      if (activeUnit !== undefined) {
        const result = this.simulation.handleIntent(activeUnit.playerId, {
          type: "EndTurn",
          unitId: activeUnit.id,
        });
        if (result.accepted) {
          collected.push(...result.events);
        }
      }
    }

    this.publishAndSettle(collected);
  }

  private resolveTimeoutStance(playerId: PlayerId): StanceId | null {
    const previous = this.lastStanceByPlayer.get(playerId);
    if (previous !== undefined && this.config.stances.some((stance) => stance.id === previous)) {
      return previous;
    }
    return this.config.stances[0]?.id ?? null;
  }

  private forfeit(loser: PlayerId): void {
    if (this.matchEnded) {
      return;
    }
    const others = this.playerIds.filter((playerId) => playerId !== loser);
    this.endMatch("Forfeit", others.length === 1 ? (others[0] ?? null) : null);
  }

  private endMatch(reason: MatchEndReason, winnerPlayerId: PlayerId | null): void {
    this.matchEnded = true;
    this.currentTimer?.cancel();
    this.currentTimer = null;
    this.currentTimerKey = null;
    for (const timer of this.forfeitTimers.values()) {
      timer.cancel();
    }
    this.forfeitTimers.clear();

    const ended = { reason, winnerPlayerId };
    this.messenger.broadcast(RoomMessageType.MatchEnded, ended);
    this.replayStore.save({
      matchId: this.matchId,
      setup: this.setup,
      events: [...this.simulation.getEventLog()],
      ended,
    });
  }
}
