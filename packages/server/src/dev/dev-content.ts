import type { GameConfig, MapConfig, MatchSetup, PlayerId } from "@atlas/shared";
import {
  BASELINE_GAME_CONFIG,
  ClassIdSchema,
  MapIdSchema,
  SpellIdSchema,
  TerrainIdSchema,
  UnitIdSchema,
} from "@atlas/shared";

/**
 * DEVELOPER SCAFFOLDING — NOT GAME CONTENT.
 *
 * This configuration exists so the server can host a match before the real
 * V1 classes, spells, and stances are designed (Phase 6, behind rulebook
 * decisions). Everything here is deliberately named "dev-*" and must be
 * replaced by configured content in Phase 6.
 */

export const DEV_CLASS_ID = ClassIdSchema.parse("dev-class");
export const DEV_SPELL_STRIKE = SpellIdSchema.parse("dev-strike");
export const DEV_SPELL_GUST = SpellIdSchema.parse("dev-gust");
export const DEV_MAP_ID = MapIdSchema.parse("dev-map");

export function createDevGameConfig(): GameConfig {
  return {
    ...BASELINE_GAME_CONFIG,
    classes: [
      {
        id: DEV_CLASS_ID,
        name: "Dev Class (scaffolding)",
        description: "Placeholder class for server development. Not game content.",
        baseHealthPoints: 100,
        baseActionPoints: 6,
        baseMovementPoints: 4,
        spellIds: [DEV_SPELL_STRIKE, DEV_SPELL_GUST],
      },
    ],
    spells: [
      {
        id: DEV_SPELL_STRIKE,
        name: "Dev Strike (scaffolding)",
        description: "Placeholder damage spell. Not game content.",
        element: "Physical",
        actionPointCost: 3,
        minRange: 1,
        maxRange: 3,
        requiresLineOfSight: true,
        effects: [{ kind: "Damage", element: "Physical", amount: 20 }],
      },
      {
        id: DEV_SPELL_GUST,
        name: "Dev Gust (scaffolding)",
        description: "Placeholder push spell. Not game content.",
        element: "Air",
        actionPointCost: 2,
        minRange: 1,
        maxRange: 4,
        requiresLineOfSight: true,
        effects: [{ kind: "Push", distance: 3 }],
      },
    ],
  };
}

/**
 * 10×10 development map: flat ground with a raised ridge, a water pool,
 * and two void pits, so every physics rule is exercisable by hand.
 */
export function createDevMap(): MapConfig {
  const normal = TerrainIdSchema.parse("normal");
  const water = TerrainIdSchema.parse("water");
  const voidTerrain = TerrainIdSchema.parse("void");

  const cells = [];
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      let z = 0;
      let terrainId = normal;
      if (x === 5 && y >= 2 && y <= 7) {
        z = 2; // North–south ridge splitting the map.
      }
      if (y === 8 && x >= 1 && x <= 3) {
        terrainId = water;
      }
      if ((x === 2 && y === 2) || (x === 7 && y === 7)) {
        terrainId = voidTerrain;
      }
      cells.push({ z, terrainId });
    }
  }
  return { id: DEV_MAP_ID, name: "Dev Map (scaffolding)", width: 10, height: 10, cells };
}

export function buildDevMatchSetup(playerIds: readonly [PlayerId, PlayerId]): MatchSetup {
  return {
    map: createDevMap(),
    players: [
      {
        id: playerIds[0],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[0]}-unit-1`),
            classId: DEV_CLASS_ID,
            position: { x: 2, y: 5, z: 0 },
          },
        ],
      },
      {
        id: playerIds[1],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[1]}-unit-1`),
            classId: DEV_CLASS_ID,
            position: { x: 7, y: 5, z: 0 },
          },
        ],
      },
    ],
  };
}
