import { z } from "zod";
import { ClassConfigSchema } from "./class-config.js";
import { PhysicsConfigSchema } from "./physics-config.js";
import { SpellConfigSchema } from "./spell-config.js";
import { StanceConfigSchema } from "./stance-config.js";
import { StateConfigSchema } from "./state-config.js";
import { TerrainConfigSchema } from "./terrain-config.js";

/**
 * The complete game configuration — the data-driven source of truth for all
 * content (CLAUDE.md "Data-Driven Design"). Loaded and validated once; the
 * engine interprets it and never special-cases content.
 */
export const GameConfigSchema = z.object({
  physics: PhysicsConfigSchema,
  terrains: z.array(TerrainConfigSchema),
  states: z.array(StateConfigSchema),
  stances: z.array(StanceConfigSchema),
  classes: z.array(ClassConfigSchema),
  spells: z.array(SpellConfigSchema),
});

export type GameConfig = z.infer<typeof GameConfigSchema>;

/**
 * Referential integrity check: every cross-reference by ID must resolve, and
 * IDs must be unique within their registry. Returns a list of human-readable
 * problems (empty = valid). Kept separate from the schema so error reporting
 * stays exhaustive instead of failing at the first dangling reference.
 */
export function findGameConfigReferenceErrors(config: GameConfig): string[] {
  const errors: string[] = [];

  const collectDuplicates = (registry: string, ids: readonly string[]): Set<string> => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        errors.push(`${registry}: duplicate id "${id}"`);
      }
      seen.add(id);
    }
    return seen;
  };

  const stateIds = collectDuplicates(
    "states",
    config.states.map((state) => state.id),
  );
  const terrainIds = collectDuplicates(
    "terrains",
    config.terrains.map((terrain) => terrain.id),
  );
  const spellIds = collectDuplicates(
    "spells",
    config.spells.map((spell) => spell.id),
  );
  collectDuplicates(
    "stances",
    config.stances.map((stance) => stance.id),
  );
  collectDuplicates(
    "classes",
    config.classes.map((gameClass) => gameClass.id),
  );

  for (const terrain of config.terrains) {
    for (const stateId of terrain.appliedStateIds) {
      if (!stateIds.has(stateId)) {
        errors.push(`terrain "${terrain.id}": unknown applied state "${stateId}"`);
      }
    }
  }

  for (const spell of config.spells) {
    for (const effect of spell.effects) {
      if (effect.kind === "ApplyState" && !stateIds.has(effect.stateId)) {
        errors.push(`spell "${spell.id}": unknown state "${effect.stateId}"`);
      }
      if (effect.kind === "TransformTerrain" && !terrainIds.has(effect.toTerrainId)) {
        errors.push(`spell "${spell.id}": unknown terrain "${effect.toTerrainId}"`);
      }
    }
  }

  for (const gameClass of config.classes) {
    for (const spellId of gameClass.spellIds) {
      if (!spellIds.has(spellId)) {
        errors.push(`class "${gameClass.id}": unknown spell "${spellId}"`);
      }
    }
  }

  return errors;
}
