import { z } from "zod";
import { CellSnapshotSchema } from "./cell-snapshot.js";

/**
 * Snapshot of the whole board.
 *
 * DETERMINISM (COMBAT_RULEBOOK.md "Determinism"): `cells` is always ordered
 * row-major — y ascending, then x ascending — so every serialization of the
 * same board is byte-identical and replays are stable.
 */
export const BoardSnapshotSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cells: z.array(CellSnapshotSchema),
});

export type BoardSnapshot = z.infer<typeof BoardSnapshotSchema>;
