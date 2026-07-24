import type { GameConfig, MapConfig, MatchSetup, CellCoord } from "@atlas/shared";
import {
  BASELINE_GAME_CONFIG,
  ClassIdSchema,
  MapIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SpellIdSchema,
  StanceIdSchema,
  TerrainIdSchema,
  UnitIdSchema,
  STATE_ID_WET,
  TERRAIN_ID_VOID,
  TERRAIN_ID_WATER,
} from "@atlas/shared";
import { MatchSimulation } from "../simulation.js";
import { RuleModifierRegistry } from "../rules.js";

/**
 * Test-only content. This is scaffolding for exercising engine rules —
 * NOT game content; real classes/spells/stances arrive with their rulebook
 * decisions (Phase 6).
 */

export const MATCH_ID = MatchIdSchema.parse("match-test");
export const PLAYER_1 = PlayerIdSchema.parse("player-1");
export const PLAYER_2 = PlayerIdSchema.parse("player-2");
export const UNIT_1 = UnitIdSchema.parse("unit-1");
export const UNIT_2 = UnitIdSchema.parse("unit-2");
export const UNIT_3 = UnitIdSchema.parse("unit-3");

export const TEST_CLASS = ClassIdSchema.parse("test-class");
export const SPELL_STRIKE = SpellIdSchema.parse("test-strike");
export const SPELL_GUST = SpellIdSchema.parse("test-gust");
export const SPELL_SOAK = SpellIdSchema.parse("test-soak");
export const SPELL_QUAKE = SpellIdSchema.parse("test-quake");
export const SPELL_ABYSS = SpellIdSchema.parse("test-abyss");
export const SPELL_MEND = SpellIdSchema.parse("test-mend");
export const SPELL_COMBO = SpellIdSchema.parse("test-combo");
export const STANCE_A = StanceIdSchema.parse("test-stance-a");
export const STANCE_B = StanceIdSchema.parse("test-stance-b");

export const TEST_BASE_HEALTH = 100;
export const TEST_BASE_ACTION_POINTS = 6;
export const TEST_BASE_MOVEMENT_POINTS = 4;

export function buildTestConfig(options?: { withStances?: boolean }): GameConfig {
  return {
    ...BASELINE_GAME_CONFIG,
    stances:
      options?.withStances === true
        ? [
            { id: STANCE_A, name: "Test Stance A", description: "Test-only stance." },
            { id: STANCE_B, name: "Test Stance B", description: "Test-only stance." },
          ]
        : [],
    classes: [
      {
        id: TEST_CLASS,
        name: "Test Class",
        description: "Test-only class.",
        baseHealthPoints: TEST_BASE_HEALTH,
        baseActionPoints: TEST_BASE_ACTION_POINTS,
        baseMovementPoints: TEST_BASE_MOVEMENT_POINTS,
        spellIds: [
          SPELL_STRIKE,
          SPELL_GUST,
          SPELL_SOAK,
          SPELL_QUAKE,
          SPELL_ABYSS,
          SPELL_MEND,
          SPELL_COMBO,
        ],
      },
    ],
    spells: [
      {
        id: SPELL_STRIKE,
        name: "Test Strike",
        description: "Physical damage.",
        element: "Physical",
        actionPointCost: 3,
        minRange: 1,
        maxRange: 3,
        requiresLineOfSight: true,
        effects: [{ kind: "Damage", element: "Physical", amount: 20 }],
      },
      {
        id: SPELL_GUST,
        name: "Test Gust",
        description: "Pushes 3 cells.",
        element: "Air",
        actionPointCost: 2,
        minRange: 1,
        maxRange: 4,
        requiresLineOfSight: true,
        effects: [{ kind: "Push", distance: 3 }],
      },
      {
        id: SPELL_SOAK,
        name: "Test Soak",
        description: "Applies Wet for 2 rounds.",
        element: "Water",
        actionPointCost: 1,
        minRange: 0,
        maxRange: 3,
        requiresLineOfSight: false,
        effects: [{ kind: "ApplyState", stateId: STATE_ID_WET, duration: 2 }],
      },
      {
        id: SPELL_QUAKE,
        name: "Test Quake",
        description: "Turns the target cell into Water.",
        element: "Earth",
        actionPointCost: 2,
        minRange: 0,
        maxRange: 3,
        requiresLineOfSight: false,
        effects: [{ kind: "TransformTerrain", toTerrainId: TERRAIN_ID_WATER }],
      },
      {
        id: SPELL_ABYSS,
        name: "Test Abyss",
        description: "Turns the target cell into Void.",
        element: "Earth",
        actionPointCost: 2,
        minRange: 1,
        maxRange: 3,
        requiresLineOfSight: false,
        effects: [{ kind: "TransformTerrain", toTerrainId: TERRAIN_ID_VOID }],
      },
      {
        id: SPELL_MEND,
        name: "Test Mend",
        description: "Heals 15.",
        element: "Neutral",
        actionPointCost: 1,
        minRange: 0,
        maxRange: 3,
        requiresLineOfSight: false,
        effects: [{ kind: "Heal", amount: 15 }],
      },
      {
        id: SPELL_COMBO,
        name: "Test Combo",
        description: "Effects deliberately listed out of pipeline order.",
        element: "Lightning",
        actionPointCost: 3,
        minRange: 1,
        maxRange: 4,
        requiresLineOfSight: true,
        effects: [
          { kind: "ApplyState", stateId: STATE_ID_WET, duration: 2 },
          { kind: "Damage", element: "Lightning", amount: 10 },
          { kind: "Push", distance: 1 },
          { kind: "Damage", element: "Physical", amount: 20 },
        ],
      },
    ],
  };
}

/**
 * Builds a map from a height grid (rows of z values) and an optional
 * terrain grid (rows of terrain id strings; default "normal").
 */
export function buildMap(heights: number[][], terrains?: string[][]): MapConfig {
  const height = heights.length;
  const width = heights[0]?.length ?? 0;
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const z = heights[y]?.[x];
      if (z === undefined) {
        throw new Error("Ragged height grid");
      }
      const terrainName = terrains?.[y]?.[x] ?? "normal";
      cells.push({ z, terrainId: TerrainIdSchema.parse(terrainName) });
    }
  }
  return {
    id: MapIdSchema.parse("map-test"),
    name: "Test Map",
    width,
    height,
    cells,
  };
}

export function flatMap(width: number, height: number): MapConfig {
  return buildMap(Array.from({ length: height }, () => Array.from({ length: width }, () => 0)));
}

export function buildSetup(
  map: MapConfig,
  unit1Position: CellCoord,
  unit2Position: CellCoord,
  extraPlayer2Unit?: CellCoord,
): MatchSetup {
  const player2Units = [{ id: UNIT_2, classId: TEST_CLASS, position: unit2Position }];
  if (extraPlayer2Unit !== undefined) {
    player2Units.push({ id: UNIT_3, classId: TEST_CLASS, position: extraPlayer2Unit });
  }
  return {
    map,
    players: [
      { id: PLAYER_1, units: [{ id: UNIT_1, classId: TEST_CLASS, position: unit1Position }] },
      { id: PLAYER_2, units: player2Units },
    ],
  };
}

export interface TestSimOptions {
  map?: MapConfig;
  unit1?: CellCoord;
  unit2?: CellCoord;
  extraPlayer2Unit?: CellCoord;
  withStances?: boolean;
  registry?: RuleModifierRegistry;
}

/** 8×8 flat map, unit-1 at (1,1), unit-2 at (6,1) unless overridden. */
export function createTestSim(options?: TestSimOptions): MatchSimulation {
  const map = options?.map ?? flatMap(8, 8);
  const setup = buildSetup(
    map,
    options?.unit1 ?? { x: 1, y: 1, z: 0 },
    options?.unit2 ?? { x: 6, y: 1, z: 0 },
    options?.extraPlayer2Unit,
  );
  return new MatchSimulation(
    MATCH_ID,
    buildTestConfig({ withStances: options?.withStances ?? false }),
    setup,
    options?.registry ?? new RuleModifierRegistry(),
  );
}
