import { Client, type Room } from "colyseus.js";
import type {
  GameConfig,
  GameEventBatch,
  IntentAckMessage,
  IntentRejection,
  MatchEndedMessage,
  MatchJoinOptions,
  MatchSnapshot,
  PlayerAssignmentMessage,
  PlayerConnectionMessage,
  PlayerIntent,
} from "@atlas/shared";
import {
  GameConfigSchema,
  GameEventBatchSchema,
  IntentAckMessageSchema,
  IntentRejectionSchema,
  MatchEndedMessageSchema,
  MatchSnapshotSchema,
  PlayerAssignmentMessageSchema,
  PlayerConnectionMessageSchema,
  RoomMessageType,
} from "@atlas/shared";

/**
 * Wire adapter — the only file that touches colyseus.js. Every inbound
 * payload is validated against its shared Zod schema before it reaches the
 * rest of the client, so a protocol drift fails loudly here instead of
 * corrupting the view.
 */

export interface MatchConnectionDelegate {
  onAssignment(message: PlayerAssignmentMessage): void;
  onConfig(config: GameConfig): void;
  onSnapshot(snapshot: MatchSnapshot): void;
  onEvents(events: GameEventBatch): void;
  onAck(ack: IntentAckMessage): void;
  onRejection(rejection: IntentRejection): void;
  onPlayerConnection(message: PlayerConnectionMessage): void;
  onMatchEnded(message: MatchEndedMessage): void;
}

export class MatchConnection {
  static async join(
    serverUrl: string,
    delegate: MatchConnectionDelegate,
    options: MatchJoinOptions = {},
  ): Promise<MatchConnection> {
    const client = new Client(serverUrl);
    const room = await client.joinOrCreate("match", options);
    return new MatchConnection(room, delegate);
  }

  private constructor(
    private readonly room: Room,
    delegate: MatchConnectionDelegate,
  ) {
    room.onMessage(RoomMessageType.Assignment, (payload: unknown) => {
      delegate.onAssignment(PlayerAssignmentMessageSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.Config, (payload: unknown) => {
      delegate.onConfig(GameConfigSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.Snapshot, (payload: unknown) => {
      delegate.onSnapshot(MatchSnapshotSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.Events, (payload: unknown) => {
      delegate.onEvents(GameEventBatchSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.Ack, (payload: unknown) => {
      delegate.onAck(IntentAckMessageSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.Rejection, (payload: unknown) => {
      delegate.onRejection(IntentRejectionSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.PlayerConnection, (payload: unknown) => {
      delegate.onPlayerConnection(PlayerConnectionMessageSchema.parse(payload));
    });
    room.onMessage(RoomMessageType.MatchEnded, (payload: unknown) => {
      delegate.onMatchEnded(MatchEndedMessageSchema.parse(payload));
    });
  }

  sendIntent(intent: PlayerIntent): void {
    this.room.send(RoomMessageType.Intent, intent);
  }
}
