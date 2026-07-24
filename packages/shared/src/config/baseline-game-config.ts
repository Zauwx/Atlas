import { StateIdSchema, TerrainIdSchema } from "../ids.js";
import type { GameConfig } from "./game-config.js";
import { RULEBOOK_PHYSICS } from "./physics-config.js";
import { BASELINE_TIMERS } from "./timers-config.js";

/**
 * Baseline configuration containing ONLY what the rulebook has decided:
 * physics constants, the seven initial terrains (Void bottomless per
 * "Falls → Void"), and the Wet state with the Water → Wet wiring
 * (COMBAT_RULEBOOK.md "Terrain").
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

/** Provisional duration for terrain-applied states; a balance value to revisit. */
const DEFAULT_TERRAIN_STATE_DURATION_ROUNDS = 1;

export const BASELINE_GAME_CONFIG: GameConfig = {
  physics: RULEBOOK_PHYSICS,
  timers: BASELINE_TIMERS,
  terrains: [
    {
      id: TERRAIN_ID_NORMAL,
      name: "Normal",
      description: "Plain ground with no additional behavior.",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_WATER,
      name: "Water",
      description: "Applies Wet to units standing in it. All consequences come from Wet.",
      appliedStateIds: [STATE_ID_WET],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_ICE,
      name: "Ice",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_VEGETATION,
      name: "Vegetation",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_EARTH,
      name: "Earth",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_LAVA,
      name: "Lava",
      description: "Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
    },
    {
      id: TERRAIN_ID_VOID,
      name: "Void",
      description: "Bottomless. Entering it is death at the death-check step (rulebook: Falls).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: true,
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
