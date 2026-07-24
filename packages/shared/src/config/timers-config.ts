import { z } from "zod";

/**
 * Match timers — COMBAT_RULEBOOK.md "Timers". Enforced by the server only;
 * the engine stays clock-free (timeouts arrive as ordinary intents).
 * Values are provisional pending playtesting.
 */
export const TimersConfigSchema = z.object({
  stanceSelectionSeconds: z.number().int().positive(),
  unitTurnSeconds: z.number().int().positive(),
});

export type TimersConfig = z.infer<typeof TimersConfigSchema>;

/** Rulebook baseline (provisional). */
export const BASELINE_TIMERS: TimersConfig = {
  stanceSelectionSeconds: 30,
  unitTurnSeconds: 45,
};
