import { z } from "zod";
import { SpellIdSchema, StateIdSchema, UnitIdSchema } from "../ids.js";

/**
 * An active state on a unit or a cell — COMBAT_RULEBOOK.md "States":
 * every state has a duration, an owner, a source, and effects.
 * Effects are engine rules (Phase 3); the instance carries the data.
 *
 * `ownerUnitId` and `sourceSpellId` are null when the state comes from the
 * environment (e.g. Wet applied by Water terrain) rather than from a unit.
 */
export const StateInstanceSchema = z.object({
  stateId: StateIdSchema,
  /** Remaining duration in rounds; ticks at end of round (rulebook, Round Structure step 8). */
  remainingDuration: z.number().int().nonnegative(),
  ownerUnitId: UnitIdSchema.nullable(),
  sourceSpellId: SpellIdSchema.nullable(),
});

export type StateInstance = z.infer<typeof StateInstanceSchema>;
