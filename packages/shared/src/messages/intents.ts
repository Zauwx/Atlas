import { z } from "zod";
import { CellCoordSchema } from "../board/coordinates.js";
import { SpellIdSchema, StanceIdSchema, UnitIdSchema } from "../ids.js";

/**
 * Player intents — the ONLY messages a client may send about gameplay.
 *
 * ARCHITECTURE.md "Networking Model": intents in, events out. The client
 * proposes; the server validates everything (COMBAT_RULEBOOK.md "Movement",
 * "Resolution Pipeline" step 1) and resolves. An intent never carries an
 * outcome — no damage numbers, no computed positions, no results.
 */

export const MoveIntentSchema = z.object({
  type: z.literal("Move"),
  unitId: UnitIdSchema,
  /**
   * Proposed path, cell by cell, excluding the starting cell. The server
   * re-validates every step (bounds, occupancy, MP, height, states).
   */
  path: z.array(CellCoordSchema).min(1),
});
export type MoveIntent = z.infer<typeof MoveIntentSchema>;

export const CastSpellIntentSchema = z.object({
  type: z.literal("CastSpell"),
  unitId: UnitIdSchema,
  spellId: SpellIdSchema,
  target: CellCoordSchema,
});
export type CastSpellIntent = z.infer<typeof CastSpellIntentSchema>;

export const ChooseStanceIntentSchema = z.object({
  type: z.literal("ChooseStance"),
  /**
   * SECRECY (COMBAT_RULEBOOK.md "Invariants"): this intent is stored
   * server-side only and never relayed to any client before the reveal.
   */
  stanceId: StanceIdSchema,
});
export type ChooseStanceIntent = z.infer<typeof ChooseStanceIntentSchema>;

export const EndTurnIntentSchema = z.object({
  type: z.literal("EndTurn"),
  unitId: UnitIdSchema,
});
export type EndTurnIntent = z.infer<typeof EndTurnIntentSchema>;

export const PlayerIntentSchema = z.discriminatedUnion("type", [
  MoveIntentSchema,
  CastSpellIntentSchema,
  ChooseStanceIntentSchema,
  EndTurnIntentSchema,
]);
export type PlayerIntent = z.infer<typeof PlayerIntentSchema>;

export const IntentTypeSchema = z.enum(["Move", "CastSpell", "ChooseStance", "EndTurn"]);
export type IntentType = z.infer<typeof IntentTypeSchema>;
export const IntentType = IntentTypeSchema.enum;
