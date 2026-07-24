import type { MatchId, ReplayRecord } from "@atlas/shared";

/**
 * Replay foundations — ARCHITECTURE.md "Replay Foundations": a replay is
 * the match setup plus the ordered event log. Durable storage (files,
 * database) is an open question; this interface is the seam for it.
 */
export interface ReplayStore {
  save(replay: ReplayRecord): void;
  get(matchId: MatchId): ReplayRecord | undefined;
}

export class InMemoryReplayStore implements ReplayStore {
  private readonly replays = new Map<MatchId, ReplayRecord>();

  save(replay: ReplayRecord): void {
    this.replays.set(replay.matchId, replay);
  }

  get(matchId: MatchId): ReplayRecord | undefined {
    return this.replays.get(matchId);
  }
}
