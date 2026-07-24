import { z } from "zod";
import { StanceIdSchema } from "../ids.js";

/**
 * Stance definition — COMBAT_RULEBOOK.md "Stances": a stance is a set of
 * rules, not a stat bonus. How stance rule-modifiers are represented in
 * configuration (vs. implemented as engine rule hooks referenced by id) is
 * a Phase 3 design decision; until then a stance is identity only.
 */
export const StanceConfigSchema = z.object({
  id: StanceIdSchema,
  name: z.string().min(1),
  description: z.string(),
});

export type StanceConfig = z.infer<typeof StanceConfigSchema>;
