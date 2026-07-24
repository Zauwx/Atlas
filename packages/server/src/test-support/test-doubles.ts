import type { PlayerId, RoomMessageType } from "@atlas/shared";
import type { MatchMessenger } from "../match/match-coordinator.js";
import type { ScheduledTask, Scheduler } from "../match/scheduler.js";

/** Deterministic virtual-time scheduler for coordinator tests. */
export class ManualScheduler implements Scheduler {
  private now = 0;
  private sequence = 0;
  private pending: { at: number; order: number; callback: () => void; cancelled: boolean }[] = [];

  schedule(delayMs: number, callback: () => void): ScheduledTask {
    const task = { at: this.now + delayMs, order: this.sequence, callback, cancelled: false };
    this.sequence += 1;
    this.pending.push(task);
    return {
      cancel: (): void => {
        task.cancelled = true;
      },
    };
  }

  /** Advances virtual time, firing due tasks in (time, creation) order. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = this.pending
        .filter((task) => !task.cancelled && task.at <= target)
        .sort((a, b) => a.at - b.at || a.order - b.order)[0];
      if (due === undefined) {
        break;
      }
      this.now = due.at;
      this.pending = this.pending.filter((task) => task !== due);
      due.callback();
    }
    this.now = target;
  }
}

export interface RecordedMessage {
  readonly kind: "broadcast" | "direct";
  readonly to: PlayerId | null;
  readonly type: RoomMessageType;
  readonly payload: unknown;
}

/** Records every outgoing message for assertions. */
export class RecordingMessenger implements MatchMessenger {
  readonly messages: RecordedMessage[] = [];

  sendToPlayer(playerId: PlayerId, type: RoomMessageType, payload: unknown): void {
    this.messages.push({ kind: "direct", to: playerId, type, payload });
  }

  broadcast(type: RoomMessageType, payload: unknown): void {
    this.messages.push({ kind: "broadcast", to: null, type, payload });
  }

  ofType(type: RoomMessageType): RecordedMessage[] {
    return this.messages.filter((message) => message.type === type);
  }

  clear(): void {
    this.messages.length = 0;
  }
}
