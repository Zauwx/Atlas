import { StateIdSchema, TerrainIdSchema } from "../ids.js";
import type { GameConfig } from "./game-config.js";
import { RULEBOOK_PHYSICS } from "./physics-config.js";

/**
 * Baseline configuration containing ONLY what the rulebook has decided:
 * physics constants, the seven initial terrains, and the Wet state with the
 * Water → Wet wiring (COMBAT_RULEBOOK.md "Terrain").
 *
 * Everything absent is an open question, not an omission: the effects of
 * the remaining initial states, all stances, classes, and spells arrive
 * with the phases (and rulebook decisions) that define them. Nothing here
 * may be invented ahead of those decisions.
 */

export const TERRAIN_ID_NORMAL = TerrainIdSchema.parse("normal");
export const TERRAIN_ID_WATER = TerrainIdSchema.parse("water");
export const TERRAIN_ID_ICE = TerrainIdSchema.parse("ice");
export const TERRAIN_ID_VEGETATION = TerrainIdSchema.parse("vegetation");
export const TERRAIN_ID_EARTH = TerrainIdSchema.parse("earth");
export const TERRAIN_ID_LAVA = TerrainIdSchema.parse("lava");
export const TERRAIN_ID_VOID = TerrainIdSchema.parse("void");

export const STATE_ID_WET = StateIdSchema.parse("wet");

export const BASELINE_GAME_CONFIG: GameConfig = {
  physics: RULEBOOK_PHYSICS,
  terrains: [
    {
      id: TERRAIN_ID_NORMAL,
      name: "Normal",
      description: "Plain ground with no additional behavior.",
      appliedStateIds: [],
    },
    {
      id: TERRAIN_ID_WATER,
      name: "Water",
      description: "Applies Wet to units standing in it. All consequences come from Wet.",
      appliedStateIds: [STATE_ID_WET],
    },
    {
      id: TERRAIN_ID_ICE,
      name: "Ice",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
    },
    {
      id: TERRAIN_ID_VEGETATION,
      name: "Vegetation",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
    },
    {
      id: TERRAIN_ID_EARTH,
      name: "Earth",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
    },
    {
      id: TERRAIN_ID_LAVA,
      name: "Lava",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
    },
    {
      id: TERRAIN_ID_VOID,
      name: "Void",
      description: "Absence of ground. Fall behavior pending rulebook decision (open question).",
      appliedStateIds: [],
    },
  ],
  states: [
    {
      id: STATE_ID_WET,
      name: "Wet",
      description:
        "Applied by Water terrain. Exact rule effects pending rulebook decision (open question).",
    },
  ],
  stances: [],
  classes: [],
  spells: [],
};
