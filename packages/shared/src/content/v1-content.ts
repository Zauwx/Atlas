import type { GameConfig } from "../config/game-config.js";
import type { MapConfig } from "../config/map-config.js";
import {
  BASELINE_GAME_CONFIG,
  STATE_ID_WET,
  TERRAIN_ID_ICE,
  TERRAIN_ID_LAVA,
  TERRAIN_ID_NORMAL,
  TERRAIN_ID_VEGETATION,
  TERRAIN_ID_VOID,
  TERRAIN_ID_WATER,
} from "../config/baseline-game-config.js";
import { ClassIdSchema, MapIdSchema, SpellIdSchema, StanceIdSchema } from "../ids.js";

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

export const V1_MAP_ID = MapIdSchema.parse("ridge-and-pools");

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
      spellIds: [SPELL_ID_BASH, SPELL_ID_SHOVE, SPELL_ID_GROUND_SLAM],
    },
    {
      id: CLASS_ID_TIDECALLER,
      name: "Tidecaller",
      description: "Terrain shaper: floods the ground, drenches enemies, strikes from range.",
      baseHealthPoints: 90,
      baseActionPoints: 6,
      baseMovementPoints: 4,
      spellIds: [SPELL_ID_WATER_JET, SPELL_ID_FLOOD, SPELL_ID_DRENCH],
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
  ],
};

/**
 * "Ridge and Pools", the V1 map.
 *
 * The ridge is z2 and a single step climbs at most +1, so its two end
 * cells are z1 ramps: the only way up is 0 → 1 → 2. That costs 4 MP
 * normally — more than either class carries — but 2 MP in Flow Stance, so
 * high ground is a contested objective rather than a free perch. Both
 * ramps sit beside a void pit, which makes shoving someone off the
 * approach a real play.
 *
 * Every other terrain earns its place: water pools set up Wet slides, ice
 * flanks the mid-ridge so hugging it freezes you out of the climb, lava
 * tempts a shortcut through the corridors, and vegetation gives ground
 * cover that high ground can see straight over.
 */
export function createV1Map(): MapConfig {
  const isRidge = (x: number, y: number): boolean => (x === 5 || x === 6) && y >= 2 && y <= 9;
  const isRamp = (x: number, y: number): boolean => isRidge(x, y) && (y === 2 || y === 9);

  const cells = [];
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      let z = 0;
      if (isRidge(x, y)) {
        z = isRamp(x, y) ? 1 : 2;
      }

      let terrainId = TERRAIN_ID_NORMAL;
      if ((x === 2 || x === 3 || x === 8 || x === 9) && y >= 4 && y <= 7) {
        terrainId = TERRAIN_ID_WATER;
      }
      if ((x === 4 || x === 7) && (y === 5 || y === 6)) {
        terrainId = TERRAIN_ID_ICE;
      }
      if ((x === 5 || x === 6) && (y === 0 || y === 11)) {
        terrainId = TERRAIN_ID_LAVA;
      }
      if ((x === 2 || x === 3) && y === 2) {
        terrainId = TERRAIN_ID_VEGETATION;
      }
      if ((x === 8 || x === 9) && y === 9) {
        terrainId = TERRAIN_ID_VEGETATION;
      }
      if ((x === 5 && y === 1) || (x === 6 && y === 10)) {
        terrainId = TERRAIN_ID_VOID;
      }

      cells.push({ z, terrainId });
    }
  }
  return { id: V1_MAP_ID, name: "Ridge and Pools", width: 12, height: 12, cells };
}

/** V1 spawn positions (z0 normal ground on opposite sides of the ridge). */
export const V1_SPAWN_PLAYER_1 = { x: 1, y: 5, z: 0 } as const;
export const V1_SPAWN_PLAYER_2 = { x: 10, y: 6, z: 0 } as const;
