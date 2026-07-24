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
});

export type TerrainConfig = z.infer<typeof TerrainConfigSchema>;
