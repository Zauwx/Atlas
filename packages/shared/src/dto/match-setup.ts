import { z } from "zod";
import { CellCoordSchema } from "../board/coordinates.js";
import { MapConfigSchema } from "../config/map-config.js";
import { ClassIdSchema, PlayerIdSchema, UnitIdSchema } from "../ids.js";

/**
 * Everything needed to create a match deterministically. Together with the
 * GameConfig and the ordered event log, this is the replay foundation
 * (ARCHITECTURE.md "Replay Foundations").
 *
 * Player order and unit order are meaningful: they define join order and
 * unit creation order, which the initiative rule depends on
 * (COMBAT_RULEBOOK.md "Initiative").
 */
export const UnitSetupSchema = z.object({
  id: UnitIdSchema,
  classId: ClassIdSchema,
  position: CellCoordSchema,
});
export type UnitSetup = z.infer<typeof UnitSetupSchema>;

export const PlayerSetupSchema = z.object({
  id: PlayerIdSchema,
  units: z.array(UnitSetupSchema).min(1),
});
export type PlayerSetup = z.infer<typeof PlayerSetupSchema>;

export const MatchSetupSchema = z.object({
  map: MapConfigSchema,
  players: z.array(PlayerSetupSchema).min(2),
});
export type MatchSetup = z.infer<typeof MatchSetupSchema>;
