import { Room, type Client } from "colyseus";
import type { GameConfig, MatchSetup, PlayerId } from "@atlas/shared";
import { MatchIdSchema, PlayerIdSchema, RoomMessageType } from "@atlas/shared";
import { MatchCoordinator, type MatchMessenger } from "../match/match-coordinator.js";
import type { Scheduler } from "../match/scheduler.js";
import { InMemoryReplayStore, type ReplayStore } from "../replay/replay-store.js";
import { buildDevMatchSetup, createDevGameConfig } from "../dev/dev-content.js";

/**
 * Thin Colyseus adapter around MatchCoordinator (ARCHITECTURE.md "Timers
 * and Disconnects"). No game logic lives here: this class only maps
 * Colyseus clients, clock, and messages onto the coordinator's interfaces.
 *
 * No Colyseus Schema state is used — synchronization is event-stream-first.
 */

export interface MatchRoomCreateOptions {
  config?: GameConfig;
  buildSetup?: (playerIds: readonly [PlayerId, PlayerId]) => MatchSetup;
  reconnectionGraceSeconds?: number;
  replayStore?: ReplayStore;
}

export class MatchRoom extends Room {
  override maxClients = 2;

  private coordinator: MatchCoordinator | null = null;
  private creationOptions: MatchRoomCreateOptions = {};
  private readonly playerIdBySession = new Map<string, PlayerId>();

  override onCreate(options: MatchRoomCreateOptions): void {
    this.creationOptions = options;
    this.onMessage(RoomMessageType.Intent, (client: Client, payload: unknown) => {
      const playerId = this.playerIdBySession.get(client.sessionId);
      if (playerId !== undefined) {
        this.coordinator?.handleIntent(playerId, payload);
      }
    });
  }

  override onJoin(client: Client): void {
    const playerId = PlayerIdSchema.parse(client.sessionId);
    this.playerIdBySession.set(client.sessionId, playerId);
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

    const config = this.creationOptions.config ?? createDevGameConfig();
    const setup = (this.creationOptions.buildSetup ?? buildDevMatchSetup)(playerIds);

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
      { reconnectionGraceSeconds: this.creationOptions.reconnectionGraceSeconds ?? 60 },
    );
    this.coordinator.start();
  }
}
