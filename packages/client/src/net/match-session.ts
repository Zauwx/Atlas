import type {
  GameConfig,
  GameEventBatch,
  IntentAckMessage,
  IntentRejection,
  MatchEndedMessage,
  MatchSnapshot,
  PlayerAssignmentMessage,
  PlayerConnectionMessage,
  PlayerId,
} from "@atlas/shared";
import type { MatchConnectionDelegate } from "./connection.js";

/**
 * Buffers server messages between connection time and scene creation, then
 * forwards them live. The Phaser scene attaches once config + snapshot +
 * assignment have all arrived; anything received in between is replayed in
 * order on attach.
 */

export interface SessionSink {
  enqueueEvents(events: GameEventBatch): void;
  onAck(ack: IntentAckMessage): void;
  onRejection(rejection: IntentRejection): void;
  onPlayerConnection(message: PlayerConnectionMessage): void;
  onMatchEnded(message: MatchEndedMessage): void;
  onResync(snapshot: MatchSnapshot): void;
}

export class MatchSession implements MatchConnectionDelegate {
  playerId: PlayerId | null = null;
  config: GameConfig | null = null;
  snapshot: MatchSnapshot | null = null;

  private sink: SessionSink | null = null;
  private readonly bufferedEvents: GameEventBatch[] = [];
  private onReadyCallback: (() => void) | null = null;

  /** Fires once, when config + snapshot + assignment have all arrived. */
  whenReady(callback: () => void): void {
    this.onReadyCallback = callback;
    this.fireIfReady();
  }

  attach(sink: SessionSink): void {
    this.sink = sink;
    for (const batch of this.bufferedEvents) {
      sink.enqueueEvents(batch);
    }
    this.bufferedEvents.length = 0;
  }

  onAssignment(message: PlayerAssignmentMessage): void {
    this.playerId = message.playerId;
    this.fireIfReady();
  }

  onConfig(config: GameConfig): void {
    this.config = config;
    this.fireIfReady();
  }

  onSnapshot(snapshot: MatchSnapshot): void {
    const isResync = this.snapshot !== null;
    this.snapshot = snapshot;
    if (isResync) {
      this.sink?.onResync(snapshot);
    }
    this.fireIfReady();
  }

  onEvents(events: GameEventBatch): void {
    if (this.sink === null) {
      this.bufferedEvents.push(events);
    } else {
      this.sink.enqueueEvents(events);
    }
  }

  onAck(ack: IntentAckMessage): void {
    this.sink?.onAck(ack);
  }

  onRejection(rejection: IntentRejection): void {
    this.sink?.onRejection(rejection);
  }

  onPlayerConnection(message: PlayerConnectionMessage): void {
    this.sink?.onPlayerConnection(message);
  }

  onMatchEnded(message: MatchEndedMessage): void {
    this.sink?.onMatchEnded(message);
  }

  private fireIfReady(): void {
    if (
      this.onReadyCallback !== null &&
      this.playerId !== null &&
      this.config !== null &&
      this.snapshot !== null
    ) {
      const callback = this.onReadyCallback;
      this.onReadyCallback = null;
      callback();
    }
  }
}
