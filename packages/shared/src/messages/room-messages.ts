import { z } from "zod";
import { MatchIdSchema, PlayerIdSchema } from "../ids.js";
import { MatchSetupSchema } from "../dto/match-setup.js";
import { GameEventSchema } from "./events.js";
import { IntentTypeSchema } from "./intents.js";

/**
 * Room wire protocol — ARCHITECTURE.md "Synchronization Decision":
 * event-stream-first. These are the ONLY message types exchanged inside a
 * match room; every payload has a schema.
 *
 * Client → server: Intent (PlayerIntent payload).
 * Server → client: everything else.
 */
export const RoomMessageType = {
  /** Client → server: a PlayerIntent. */
  Intent: "intent",
  /** Server → one client: your player id for this match. */
  Assignment: "assignment",
  /** Server → all clients: full MatchSnapshot (match start, reconnect). */
  Snapshot: "snapshot",
  /** Server → all clients: ordered GameEvent batch from one resolution. */
  Events: "events",
  /** Server → one client: your intent was accepted (no events may follow, e.g. secret stance lock). */
  Ack: "ack",
  /** Server → one client: your intent was rejected. */
  Rejection: "rejection",
  /** Server → all clients: a player's connection status changed. */
  PlayerConnection: "playerConnection",
  /** Server → all clients: the match is over (victory, draw, or forfeit). */
  MatchEnded: "matchEnded",
} as const;
export type RoomMessageType = (typeof RoomMessageType)[keyof typeof RoomMessageType];

export const PlayerAssignmentMessageSchema = z.object({
  playerId: PlayerIdSchema,
});
export type PlayerAssignmentMessage = z.infer<typeof PlayerAssignmentMessageSchema>;

export const IntentAckMessageSchema = z.object({
  intentType: IntentTypeSchema,
});
export type IntentAckMessage = z.infer<typeof IntentAckMessageSchema>;

export const GameEventBatchSchema = z.array(GameEventSchema);
export type GameEventBatch = z.infer<typeof GameEventBatchSchema>;

export const PlayerConnectionMessageSchema = z.object({
  playerId: PlayerIdSchema,
  connected: z.boolean(),
});
export type PlayerConnectionMessage = z.infer<typeof PlayerConnectionMessageSchema>;

export const MatchEndReasonSchema = z.enum(["Victory", "Draw", "Forfeit"]);
export type MatchEndReason = z.infer<typeof MatchEndReasonSchema>;
export const MatchEndReason = MatchEndReasonSchema.enum;

export const MatchEndedMessageSchema = z.object({
  reason: MatchEndReasonSchema,
  /** Null on a draw. */
  winnerPlayerId: PlayerIdSchema.nullable(),
});
export type MatchEndedMessage = z.infer<typeof MatchEndedMessageSchema>;

/**
 * A complete replay: the deterministic seed (setup) plus the ordered event
 * log (ARCHITECTURE.md "Replay Foundations"). The game configuration is
 * referenced implicitly by server version for now — see Open Questions.
 */
export const ReplayRecordSchema = z.object({
  matchId: MatchIdSchema,
  setup: MatchSetupSchema,
  events: GameEventBatchSchema,
  ended: MatchEndedMessageSchema,
});
export type ReplayRecord = z.infer<typeof ReplayRecordSchema>;
