import { z } from "zod";

/**
 * Spell area shapes — COMBAT_RULEBOOK.md "Area of effect".
 *
 * The shape is applied around the target cell. Line of sight is checked
 * once, to that cell; the area then fills regardless of what stands
 * inside it.
 */
export const AreaShapeSchema = z.discriminatedUnion("kind", [
  /** The target cell only — the default for every spell. */
  z.object({ kind: z.literal("Single") }),
  /** Target cell plus cells within `radius` steps along the two axes. */
  z.object({ kind: z.literal("Cross"), radius: z.number().int().positive() }),
  /** Every cell within `radius` Manhattan distance of the target. */
  z.object({ kind: z.literal("Circle"), radius: z.number().int().positive() }),
]);

export type AreaShape = z.infer<typeof AreaShapeSchema>;

export const SINGLE_CELL_AREA: AreaShape = { kind: "Single" };

/**
 * The cells a shape covers, in row-major order (rulebook: resolution
 * order), before board bounds are applied. Pure and total, so both the
 * engine and the client's targeting preview use this one implementation.
 */
export function areaOffsets(shape: AreaShape): { dx: number; dy: number }[] {
  if (shape.kind === "Single") {
    return [{ dx: 0, dy: 0 }];
  }
  const offsets: { dx: number; dy: number }[] = [];
  for (let dy = -shape.radius; dy <= shape.radius; dy += 1) {
    for (let dx = -shape.radius; dx <= shape.radius; dx += 1) {
      const covered =
        shape.kind === "Cross" ? dx === 0 || dy === 0 : Math.abs(dx) + Math.abs(dy) <= shape.radius;
      if (covered) {
        offsets.push({ dx, dy });
      }
    }
  }
  return offsets;
}
