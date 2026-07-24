import { z } from "zod";

/**
 * Cell coordinates — COMBAT_RULEBOOK.md "Board & Coordinates".
 *
 * Every cell has integer coordinates (x, y) on a square grid plus a height z.
 * z is bounded by the rulebook: 0 to 5 inclusive.
 */

export const Z_MIN = 0;
export const Z_MAX = 5;

export const CellCoordSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  z: z.number().int().min(Z_MIN).max(Z_MAX),
});

export type CellCoord = z.infer<typeof CellCoordSchema>;
