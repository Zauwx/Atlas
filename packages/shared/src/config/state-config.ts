import { z } from "zod";
import { StateIdSchema } from "../ids.js";

/**
 * State definition — COMBAT_RULEBOOK.md "States".
 *
 * A state's EFFECTS modify engine rules and are therefore implemented as
 * engine rule hooks in Phase 3, referenced by this id. The exact effects of
 * the initial states (Wet, Burning, Frozen, Electrified, Shielded, Rooted)
 * are open rulebook questions; this config intentionally carries identity
 * only until they are decided.
 */
export const StateConfigSchema = z.object({
  id: StateIdSchema,
  name: z.string().min(1),
  description: z.string(),
});

export type StateConfig = z.infer<typeof StateConfigSchema>;
