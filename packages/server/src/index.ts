/**
 * @atlas/server — authoritative game server (ARCHITECTURE.md).
 * Pure exports; the runnable entry point is main.ts (`npm start`).
 */

export { MatchRoom, type MatchRoomCreateOptions } from "./rooms/match-room.js";
export { MatchCoordinator, type MatchMessenger } from "./match/match-coordinator.js";
export { TimeoutScheduler, type Scheduler, type ScheduledTask } from "./match/scheduler.js";
export { InMemoryReplayStore, type ReplayStore } from "./replay/replay-store.js";
export { createDevGameConfig, createDevMap, buildDevMatchSetup } from "./dev/dev-content.js";
