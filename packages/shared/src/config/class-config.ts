import { z } from "zod";
import { ClassIdSchema, SpellIdSchema } from "../ids.js";

/**
 * Class definition — GAME_DESIGN.md "Classes": every class has an identity,
 * a unique mechanic, strengths and weaknesses. The unique mechanic is engine
 * rule territory (Phase 3+); this config carries identity and baseline
 * resources. Baseline value bands are tracked in BALANCE_GUIDELINES.md.
 */
export const ClassConfigSchema = z.object({
  id: ClassIdSchema,
  name: z.string().min(1),
  description: z.string(),
  baseHealthPoints: z.number().int().positive(),
  baseActionPoints: z.number().int().nonnegative(),
  baseMovementPoints: z.number().int().nonnegative(),
  spellIds: z.array(SpellIdSchema),
});

export type ClassConfig = z.infer<typeof ClassConfigSchema>;
