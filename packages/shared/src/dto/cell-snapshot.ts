import { z } from "zod";
import { CellCoordSchema } from "../board/coordinates.js";
import { TerrainIdSchema } from "../ids.js";
import { StateInstanceSchema } from "./state-instance.js";

/**
 * Snapshot of one board cell — COMBAT_RULEBOOK.md "Terrain": every cell has
 * one terrain type and zero or more temporary states.
 */
export const CellSnapshotSchema = z.object({
  coord: CellCoordSchema,
  terrainId: TerrainIdSchema,
  states: z.array(StateInstanceSchema),
});

export type CellSnapshot = z.infer<typeof CellSnapshotSchema>;
