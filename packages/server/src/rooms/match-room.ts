import { Room, type Client } from "colyseus";
import { createV1RuleRegistry, type RuleModifierRegistry } from "@atlas/engine";
import type { ClassId, GameConfig, MatchSetup, PlayerId } from "@atlas/shared";
import {
  MatchIdSchema,
  MatchJoinOptionsSchema,
  PlayerIdSchema,
  RoomMessageType,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { MatchCoordinator, type MatchMessenger } from "../match/match-coordinator.js";
import type { Scheduler } from "../match/scheduler.js";
import { InMemoryReplayStore, type ReplayStore } from "../replay/replay-store.js";
import { buildV1MatchSetup } from "../content/v1-setup.js";

/**
 * Thin Colyseus adapter around MatchCoordinator (ARCHITECTURE.md "Timers
 * and Disconnects"). No game logic lives here: this class only maps
 * Colyseus clients, clock, and messages onto the coordinator's interfaces.
 *
 * No Colyseus Schema state is used — synchronization is event-stream-first.
 */

export interface MatchRoomCreateOptions {
  config?: GameConfig;
  buildSetup?: (
    playerIds: readonly [PlayerId, PlayerId],
    chosenClassIds: readonly (ClassId | undefined)[],
    config: GameConfig,
  ) => MatchSetup;
  ruleRegistry?: RuleModifierRegistry;
  reconnectionGraceSeconds?: number;
  replayStore?: ReplayStore;
}

export class MatchRoom extends Room {
  override maxClients = 2;

  private coordinator: MatchCoordinator | null = null;
  private creationOptions: MatchRoomCreateOptions = {};
  private readonly playerIdBySession = new Map<string, PlayerId>();
  /** Class each seat asked for at join time; validated against the config. */
  private readonly chosenClassBySession = new Map<string, ClassId | undefined>();

  override onCreate(options: MatchRoomCreateOptions): void {
    this.creationOptions = options;
    this.onMessage(RoomMessageType.Intent, (client: Client, payload: unknown) => {
      const playerId = this.playerIdBySession.get(client.sessionId);
      if (playerId !== undefined) {
        this.coordinator?.handleIntent(playerId, payload);
      }
    });
  }

  override onJoin(client: Client, options?: unknown): void {
    const playerId = PlayerIdSchema.parse(client.sessionId);
    this.playerIdBySession.set(client.sessionId, playerId);
    // Never trust the join payload: an unparseable or unknown class falls
    // back to the seat default in the setup builder.
    const parsed = MatchJoinOptionsSchema.safeParse(options ?? {});
    this.chosenClassBySession.set(
      client.sessionId,
      parsed.success ? parsed.data.classId : undefined,
    );
    client.send(RoomMessageType.Assignment, { playerId });

    if (this.clients.length === this.maxClients) {
      void this.lock();
      this.startMatch();
    }
  }

  override async onLeave(client: Client): Promise<void> {
    const playerId = this.playerIdBySession.get(client.sessionId);
    if (playerId === undefined || this.coordinator === null || this.coordinator.ended) {
      return;
    }
    this.coordinator.playerDisconnected(playerId);
    try {
      // Hold the seat slightly longer than the forfeit grace so the
      // coordinator's timer decides the outcome, not the transport.
      const grace = (this.creationOptions.reconnectionGraceSeconds ?? 60) + 5;
      await this.allowReconnection(client, grace);
      this.coordinator.playerReconnected(playerId);
    } catch {
      // Seat expired: the coordinator has already declared the forfeit.
    }
  }

  private startMatch(): void {
    const sessionIds = this.clients.map((client) => client.sessionId);
    const [first, second] = sessionIds;
    if (first === undefined || second === undefined) {
      throw new Error("startMatch requires two connected clients");
    }
    const playerIds: readonly [PlayerId, PlayerId] = [
      PlayerIdSchema.parse(first),
      PlayerIdSchema.parse(second),
    ];

    // V1 content by default (COMBAT_RULEBOOK.md "V1 stances"); tests and
    // future modes inject their own content through the options.
    const config = this.creationOptions.config ?? V1_GAME_CONFIG;
    const chosenClassIds = sessionIds.map((sessionId) => this.chosenClassBySession.get(sessionId));
    const setup = (this.creationOptions.buildSetup ?? buildV1MatchSetup)(
      playerIds,
      chosenClassIds,
      config,
    );

    const messenger: MatchMessenger = {
      sendToPlayer: (playerId, type, payload): void => {
        const client = this.clients.find(
          (candidate) => this.playerIdBySession.get(candidate.sessionId) === playerId,
        );
        client?.send(type, payload);
      },
      broadcast: (type, payload): void => {
        this.broadcast(type, payload);
      },
    };
    const scheduler: Scheduler = {
      schedule: (delayMs, callback) => {
        const delayed = this.clock.setTimeout(callback, delayMs);
        return {
          cancel: (): void => {
            delayed.clear();
          },
        };
      },
    };

    this.coordinator = new MatchCoordinator(
      MatchIdSchema.parse(this.roomId),
      config,
      setup,
      messenger,
      scheduler,
      this.creationOptions.replayStore ?? new InMemoryReplayStore(),
      {
        reconnectionGraceSeconds: this.creationOptions.reconnectionGraceSeconds ?? 60,
        ruleRegistry: this.creationOptions.ruleRegistry ?? createV1RuleRegistry(),
      },
    );
    this.coordinator.start();
  }
}
