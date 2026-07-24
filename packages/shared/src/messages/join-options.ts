import { z } from "zod";
import { ClassIdSchema } from "../ids.js";

/**
 * Options a client may send when joining a match room.
 *
 * Class choice is match setup, not a combat rule, so it lives here rather
 * than in the rulebook. The server validates the choice against the
 * loaded configuration and falls back to a default when it is absent or
 * unknown — a client can never conjure a class that is not configured.
 */
export const MatchJoinOptionsSchema = z.object({
  classId: ClassIdSchema.optional(),
});

export type MatchJoinOptions = z.infer<typeof MatchJoinOptionsSchema>;
