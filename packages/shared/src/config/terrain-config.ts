import { z } from "zod";
import { StateIdSchema, TerrainIdSchema } from "../ids.js";

/**
 * Terrain definition — COMBAT_RULEBOOK.md "Terrain": terrain applies its
 * effects only via states, never directly. The only behavior a terrain
 * declares here is WHICH states it applies; when and to what is engine rule
 * territory (Phase 3). Elemental reactions of terrains are an open design
 * area and will extend this schema behind a rulebook update.
 */
export const TerrainConfigSchema = z.object({
  id: TerrainIdSchema,
  name: z.string().min(1),
  description: z.string(),
  /** States this terrain applies (e.g. Water → Wet). Empty when undecided. */
  appliedStateIds: z.array(StateIdSchema),
  /**
   * Duration (in rounds) of states applied by this terrain — rulebook
   * "Terrain": a configuration value, never a code constant.
   */
  appliedStateDurationRounds: z.number().int().positive(),
  /**
   * Bottomless terrain (rulebook "Falls → Void"): entering it is death at
   * the death-check step, regardless of HP.
   */
  bottomless: z.boolean(),
  /**
   * Opaque terrain (rulebook "Line of Sight"): counts as one level taller
   * for sight only. Blocks vision between units on its level; high ground
   * sees over it. Never impedes movement.
   */
  opaque: z.boolean(),
});

export type TerrainConfig = z.infer<typeof TerrainConfigSchema>;
