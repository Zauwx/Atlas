import { z } from "zod";
import { CellCoordSchema } from "../board/coordinates.js";
import { ClassIdSchema, PlayerIdSchema, StanceIdSchema, UnitIdSchema } from "../ids.js";
import { StateInstanceSchema } from "./state-instance.js";

/**
 * Snapshot of a unit as synchronized to clients (join/reconnect/spectator).
 *
 * INVARIANT (COMBAT_RULEBOOK.md "Invariants"): secret stances are never
 * synchronized before their reveal. `revealedStanceId` is therefore null
 * until the simultaneous reveal step of the current round; it never carries
 * an unrevealed choice. The server-side locked choice lives outside any
 * synchronized structure (ARCHITECTURE.md "Secret Stance Handling").
 */
export const UnitSnapshotSchema = z.object({
  id: UnitIdSchema,
  playerId: PlayerIdSchema,
  classId: ClassIdSchema,
  position: CellCoordSchema,
  currentHealthPoints: z.number().int(),
  maxHealthPoints: z.number().int().positive(),
  currentActionPoints: z.number().int().nonnegative(),
  currentMovementPoints: z.number().int().nonnegative(),
  states: z.array(StateInstanceSchema),
  revealedStanceId: StanceIdSchema.nullable(),
});

export type UnitSnapshot = z.infer<typeof UnitSnapshotSchema>;
