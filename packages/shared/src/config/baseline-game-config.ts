import { StateIdSchema, TerrainIdSchema } from "../ids.js";
import type { GameConfig } from "./game-config.js";
import { RULEBOOK_PHYSICS } from "./physics-config.js";
import { BASELINE_TIMERS } from "./timers-config.js";

/**
 * Baseline configuration containing ONLY what the rulebook has decided:
 * physics constants, the seven initial terrains with their state wiring
 * (COMBAT_RULEBOOK.md "Terrain", "Defined state effects (V1)"), and the
 * states those terrains apply.
 *
 * Everything absent is an open question, not an omission: Electrified,
 * Shielded, and Rooted have no defined effects yet, and no stance, class,
 * or spell content belongs here. Nothing may be invented ahead of a
 * rulebook decision.
 */

export const TERRAIN_ID_NORMAL = TerrainIdSchema.parse("normal");
export const TERRAIN_ID_WATER = TerrainIdSchema.parse("water");
export const TERRAIN_ID_ICE = TerrainIdSchema.parse("ice");
export const TERRAIN_ID_VEGETATION = TerrainIdSchema.parse("vegetation");
export const TERRAIN_ID_EARTH = TerrainIdSchema.parse("earth");
export const TERRAIN_ID_LAVA = TerrainIdSchema.parse("lava");
export const TERRAIN_ID_VOID = TerrainIdSchema.parse("void");

export const STATE_ID_WET = StateIdSchema.parse("wet");
export const STATE_ID_BURNING = StateIdSchema.parse("burning");
export const STATE_ID_FROZEN = StateIdSchema.parse("frozen");

/** Provisional duration for terrain-applied states; a balance value to revisit. */
const DEFAULT_TERRAIN_STATE_DURATION_ROUNDS = 1;
/** Burning outlives the cell you got it in, so lava is a cost you carry out. */
const BURNING_DURATION_ROUNDS = 2;

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
      opaque: false,
    },
    {
      id: TERRAIN_ID_WATER,
      name: "Water",
      description: "Soaks whoever enters it: applies Wet, which makes pushes carry further.",
      appliedStateIds: [STATE_ID_WET],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
      opaque: false,
    },
    {
      id: TERRAIN_ID_ICE,
      name: "Ice",
      description: "Applies Frozen: no grip, so the unit cannot climb.",
      appliedStateIds: [STATE_ID_FROZEN],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
      opaque: false,
    },
    {
      id: TERRAIN_ID_VEGETATION,
      name: "Vegetation",
      description: "Dense growth: blocks line of sight at ground level, but not from above.",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
      opaque: true,
    },
    {
      id: TERRAIN_ID_EARTH,
      name: "Earth",
      description: "Bare earth. Behavior pending rulebook decision (open question).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: false,
      opaque: false,
    },
    {
      id: TERRAIN_ID_LAVA,
      name: "Lava",
      description: "Applies Burning: 15 Fire damage at the end of each round.",
      appliedStateIds: [STATE_ID_BURNING],
      appliedStateDurationRounds: BURNING_DURATION_ROUNDS,
      bottomless: false,
      opaque: false,
    },
    {
      id: TERRAIN_ID_VOID,
      name: "Void",
      description: "Bottomless. Entering it is death at the death-check step (rulebook: Falls).",
      appliedStateIds: [],
      appliedStateDurationRounds: DEFAULT_TERRAIN_STATE_DURATION_ROUNDS,
      bottomless: true,
      opaque: false,
    },
  ],
  states: [
    {
      id: STATE_ID_WET,
      name: "Wet",
      description: "Pushes against you travel 1 cell further.",
    },
    {
      id: STATE_ID_BURNING,
      name: "Burning",
      description: "Takes 15 Fire damage at the end of each round.",
    },
    {
      id: STATE_ID_FROZEN,
      name: "Frozen",
      description: "Cannot climb, in any stance.",
    },
  ],
  stances: [],
  classes: [],
  spells: [],
};
