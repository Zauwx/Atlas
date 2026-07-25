import { z } from "zod";
import { AreaShapeSchema, SINGLE_CELL_AREA, type AreaShape } from "./area-config.js";
import { ElementSchema } from "../enums/element.js";
import { SpellIdSchema, StateIdSchema, TerrainIdSchema } from "../ids.js";

/**
 * Spell effects — each variant maps 1:1 to a step of the rulebook's
 * Resolution Pipeline (COMBAT_RULEBOOK.md):
 *   Damage → step 11/12, Heal → event vocabulary, Push → steps 8–10,
 *   ApplyState → step 13, TransformTerrain → step 14.
 * No variant may bypass the pipeline; exact semantics (push direction from
 * caster axis, etc.) are engine rules (Phase 3).
 */
export const SpellEffectConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("Damage"),
    element: ElementSchema,
    amount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("Heal"),
    amount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("Push"),
    /** Push distance in cells, along the caster→target axis. */
    distance: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("ApplyState"),
    stateId: StateIdSchema,
    duration: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("TransformTerrain"),
    toTerrainId: TerrainIdSchema,
  }),
]);
export type SpellEffectConfig = z.infer<typeof SpellEffectConfigSchema>;

/**
 * Spell definition — GAME_DESIGN.md "Spells": spells are tools (terrain
 * manipulation, repositioning, stance exploitation, opportunity creation).
 */
export const SpellConfigSchema = z
  .object({
    id: SpellIdSchema,
    name: z.string().min(1),
    description: z.string(),
    element: ElementSchema,
    actionPointCost: z.number().int().nonnegative(),
    /** Manhattan range on (x, y) — COMBAT_RULEBOOK.md "Board & Coordinates". */
    minRange: z.number().int().nonnegative(),
    maxRange: z.number().int().nonnegative(),
    requiresLineOfSight: z.boolean(),
    /**
     * Area around the target cell (COMBAT_RULEBOOK.md "Area of effect").
     * Omitted means a single cell, so existing content needs no change.
     */
    area: AreaShapeSchema.optional(),
    effects: z.array(SpellEffectConfigSchema).min(1),
  })
  .refine((spell) => spell.maxRange >= spell.minRange, {
    message: "maxRange must be greater than or equal to minRange",
  });

export type SpellConfig = z.infer<typeof SpellConfigSchema>;

/** A spell's area, defaulting to the single target cell. */
export function areaOf(spell: SpellConfig): AreaShape {
  return spell.area ?? SINGLE_CELL_AREA;
}
