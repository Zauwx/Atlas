import { z } from "zod";

/**
 * Orthogonal directions — COMBAT_RULEBOOK.md "Board & Coordinates".
 *
 * The board is a square grid with 4-neighbor adjacency, so every direction
 * (movement steps, pushes) is one of exactly four values.
 */
export const DirectionSchema = z.enum(["North", "East", "South", "West"]);

export type Direction = z.infer<typeof DirectionSchema>;

export const Direction = DirectionSchema.enum;
