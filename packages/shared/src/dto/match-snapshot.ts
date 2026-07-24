import { z } from "zod";
import { MatchIdSchema, UnitIdSchema } from "../ids.js";
import { BoardSnapshotSchema } from "./board-snapshot.js";
import { UnitSnapshotSchema } from "./unit-snapshot.js";

/**
 * Phases of a round — COMBAT_RULEBOOK.md "Round Structure":
 * secret stance selection (steps 3–6), then alternating unit turns (step 7).
 * `Finished` marks a completed match (victory declared).
 */
export const MatchPhaseSchema = z.enum(["StanceSelection", "UnitTurns", "Finished"]);
export type MatchPhase = z.infer<typeof MatchPhaseSchema>;
export const MatchPhase = MatchPhaseSchema.enum;

/**
 * Full match snapshot, sent on join/reconnect. Live play is driven by the
 * ordered event stream; this is the resynchronization baseline.
 *
 * `initiativeOrder` lists unit IDs in acting order for the current round.
 * How that order is determined is an engine rule (rulebook Open Question:
 * initiative order); the snapshot only transports the result.
 */
export const MatchSnapshotSchema = z.object({
  id: MatchIdSchema,
  roundNumber: z.number().int().positive(),
  phase: MatchPhaseSchema,
  board: BoardSnapshotSchema,
  units: z.array(UnitSnapshotSchema),
  initiativeOrder: z.array(UnitIdSchema),
  /** Unit currently acting; null outside the UnitTurns phase. */
  activeUnitId: UnitIdSchema.nullable(),
});

export type MatchSnapshot = z.infer<typeof MatchSnapshotSchema>;
