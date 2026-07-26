import type { GameConfig } from "../config/game-config.js";
import type { MapConfig } from "../config/map-config.js";
import {
  BASELINE_GAME_CONFIG,
  STATE_ID_ELECTRIFIED,
  STATE_ID_SHIELDED,
  STATE_ID_WET,
  TERRAIN_ID_WATER,
} from "../config/baseline-game-config.js";
import { ClassIdSchema, SpellIdSchema, StanceIdSchema } from "../ids.js";
import { DEFAULT_MAP_SEED, generateMap } from "./map-generator.js";

/**
 * Prototype V1 content — pure configuration, authorized by
 * COMBAT_RULEBOOK.md ("V1 stances", "Defined state effects") and
 * BALANCE_GUIDELINES.md ("V1 Baselines"). The engine interprets this data;
 * stance/state behavior is implemented as engine rule hooks registered
 * under these IDs (rulebook: Push distance resolution, Climb cost
 * resolution).
 */

export const STANCE_ID_IRON = StanceIdSchema.parse("iron-stance");
export const STANCE_ID_FLOW = StanceIdSchema.parse("flow-stance");
export const STANCE_ID_STORM = StanceIdSchema.parse("storm-stance");

export const CLASS_ID_VANGUARD = ClassIdSchema.parse("vanguard");
export const CLASS_ID_TIDECALLER = ClassIdSchema.parse("tidecaller");

export const SPELL_ID_BASH = SpellIdSchema.parse("bash");
export const SPELL_ID_SHOVE = SpellIdSchema.parse("shove");
export const SPELL_ID_GROUND_SLAM = SpellIdSchema.parse("ground-slam");
export const SPELL_ID_WATER_JET = SpellIdSchema.parse("water-jet");
export const SPELL_ID_FLOOD = SpellIdSchema.parse("flood");
export const SPELL_ID_DRENCH = SpellIdSchema.parse("drench");
export const SPELL_ID_TIDAL_SURGE = SpellIdSchema.parse("tidal-surge");
export const SPELL_ID_BULWARK = SpellIdSchema.parse("bulwark");
export const SPELL_ID_ARC = SpellIdSchema.parse("arc");

export const V1_GAME_CONFIG: GameConfig = {
  ...BASELINE_GAME_CONFIG,
  stances: [
    {
      id: STANCE_ID_IRON,
      name: "Iron Stance",
      description: "Pushes against you are 2 cells shorter.",
    },
    {
      id: STANCE_ID_FLOW,
      name: "Flow Stance",
      description: "Climbing +1 z costs no extra MP.",
    },
    {
      id: STANCE_ID_STORM,
      name: "Storm Stance",
      description: "Your pushes travel 1 cell further.",
    },
  ],
  classes: [
    {
      id: CLASS_ID_VANGUARD,
      name: "Vanguard",
      description: "Close-range physical control: bashes and shoves at melee range.",
      baseHealthPoints: 110,
      baseActionPoints: 6,
      baseMovementPoints: 3,
      spellIds: [SPELL_ID_BASH, SPELL_ID_SHOVE, SPELL_ID_GROUND_SLAM, SPELL_ID_BULWARK],
    },
    {
      id: CLASS_ID_TIDECALLER,
      name: "Tidecaller",
      description: "Terrain shaper: floods the ground, drenches enemies, strikes from range.",
      baseHealthPoints: 90,
      baseActionPoints: 6,
      baseMovementPoints: 4,
      spellIds: [
        SPELL_ID_WATER_JET,
        SPELL_ID_FLOOD,
        SPELL_ID_DRENCH,
        SPELL_ID_TIDAL_SURGE,
        SPELL_ID_ARC,
      ],
    },
  ],
  spells: [
    {
      id: SPELL_ID_BASH,
      name: "Bash",
      description: "A heavy melee blow.",
      element: "Physical",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 1,
      requiresLineOfSight: true,
      effects: [{ kind: "Damage", element: "Physical", amount: 20 }],
    },
    {
      id: SPELL_ID_SHOVE,
      name: "Shove",
      description: "Pushes the target 2 cells.",
      element: "Physical",
      actionPointCost: 2,
      minRange: 1,
      maxRange: 1,
      requiresLineOfSight: true,
      effects: [{ kind: "Push", distance: 2 }],
    },
    {
      id: SPELL_ID_GROUND_SLAM,
      name: "Ground Slam",
      description: "A shockwave that damages and staggers the target back.",
      element: "Earth",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 2,
      requiresLineOfSight: true,
      effects: [
        { kind: "Damage", element: "Earth", amount: 10 },
        { kind: "Push", distance: 1 },
      ],
    },
    {
      id: SPELL_ID_WATER_JET,
      name: "Water Jet",
      description: "A pressurized jet that stings and pushes 1 cell.",
      element: "Water",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 4,
      requiresLineOfSight: true,
      effects: [
        { kind: "Damage", element: "Water", amount: 15 },
        { kind: "Push", distance: 1 },
      ],
    },
    {
      id: SPELL_ID_FLOOD,
      name: "Flood",
      description: "Turns the target cell into Water.",
      element: "Water",
      actionPointCost: 2,
      minRange: 1,
      maxRange: 3,
      requiresLineOfSight: false,
      effects: [{ kind: "TransformTerrain", toTerrainId: TERRAIN_ID_WATER }],
    },
    {
      id: SPELL_ID_TIDAL_SURGE,
      name: "Tidal Surge",
      description:
        "Floods a whole area. Cast at range 1 it catches your own cell, soaking you deliberately.",
      element: "Water",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 4,
      requiresLineOfSight: false,
      area: { kind: "Circle", radius: 1 },
      effects: [{ kind: "TransformTerrain", toTerrainId: TERRAIN_ID_WATER }],
    },
    {
      id: SPELL_ID_DRENCH,
      name: "Drench",
      description: "Soaks the target: Wet for 2 rounds.",
      element: "Water",
      actionPointCost: 1,
      minRange: 1,
      maxRange: 4,
      requiresLineOfSight: false,
      effects: [{ kind: "ApplyState", stateId: STATE_ID_WET, duration: 2 }],
    },
    {
      id: SPELL_ID_BULWARK,
      name: "Bulwark",
      description: "Brace yourself: Shielded, absorbing up to 20 from the next spell.",
      element: "Neutral",
      actionPointCost: 2,
      // Range 0 targets your own cell — a self-cast.
      minRange: 0,
      maxRange: 0,
      requiresLineOfSight: false,
      effects: [{ kind: "ApplyState", stateId: STATE_ID_SHIELDED, duration: 3 }],
    },
    {
      id: SPELL_ID_ARC,
      name: "Arc",
      description:
        "A jolt of Lightning that damages and Electrifies, locking the target out of casting. Deals bonus damage to a Wet target.",
      element: "Lightning",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 3,
      requiresLineOfSight: true,
      effects: [
        { kind: "Damage", element: "Lightning", amount: 10 },
        { kind: "ApplyState", stateId: STATE_ID_ELECTRIFIED, duration: 2 },
      ],
    },
  ],
};

/**
 * The default featured board. Maps are procedurally generated per match
 * (see map-generator.ts); this fixed seed gives a stable reference board
 * for tooling and tests. Live matches roll their own seed.
 */
export function createV1Map(): MapConfig {
  return generateMap(DEFAULT_MAP_SEED);
}
