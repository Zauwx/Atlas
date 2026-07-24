import { z } from "zod";

/**
 * Branded identifier types.
 *
 * Content that is data-driven (COMBAT_RULEBOOK.md: classes, spells, terrain,
 * states, stances are configuration, not code) is referenced by branded
 * string IDs validated against the loaded GameConfig — never by enums, so
 * new content requires no engine change.
 *
 * The brands make it a compile-time error to pass, say, a SpellId where a
 * StateId is expected, even though both are strings at runtime.
 */

const idString = z.string().min(1);

export const PlayerIdSchema = idString.brand<"PlayerId">();
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const UnitIdSchema = idString.brand<"UnitId">();
export type UnitId = z.infer<typeof UnitIdSchema>;

export const MatchIdSchema = idString.brand<"MatchId">();
export type MatchId = z.infer<typeof MatchIdSchema>;

export const ClassIdSchema = idString.brand<"ClassId">();
export type ClassId = z.infer<typeof ClassIdSchema>;

export const SpellIdSchema = idString.brand<"SpellId">();
export type SpellId = z.infer<typeof SpellIdSchema>;

export const TerrainIdSchema = idString.brand<"TerrainId">();
export type TerrainId = z.infer<typeof TerrainIdSchema>;

export const StateIdSchema = idString.brand<"StateId">();
export type StateId = z.infer<typeof StateIdSchema>;

export const StanceIdSchema = idString.brand<"StanceId">();
export type StanceId = z.infer<typeof StanceIdSchema>;

export const MapIdSchema = idString.brand<"MapId">();
export type MapId = z.infer<typeof MapIdSchema>;
