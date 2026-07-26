import type { ClassId, GameConfig, MatchSetup, PlayerId } from "@atlas/shared";
import {
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  generateMap,
  UnitIdSchema,
  V1_SPAWN_PLAYER_1,
  V1_SPAWN_PLAYER_2,
} from "@atlas/shared";

/**
 * Turns a match's identity into a map seed with FNV-1a. Deterministic and
 * self-contained: the same pair of session ids always yields the same
 * board (ARCHITECTURE.md "Determinism"), while distinct matches — which
 * always have distinct session ids — get distinct battlefields. No
 * Math.random anywhere in setup.
 */
function seedFromMatch(playerIds: readonly [PlayerId, PlayerId]): number {
  let hash = 0x811c9dc5;
  for (const id of playerIds) {
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/**
 * V1 match setup: first joiner spawns west, second east, on a board rolled
 * fresh for this match (see map-generator.ts).
 *
 * Each player may choose their class when joining; an absent or unknown
 * choice falls back to the seat default (Vanguard west, Tidecaller east).
 * Mirror matches are allowed — nothing in the rules forbids two players
 * fielding the same class.
 */
export function buildV1MatchSetup(
  playerIds: readonly [PlayerId, PlayerId],
  chosenClassIds: readonly (ClassId | undefined)[] = [],
  config?: GameConfig,
): MatchSetup {
  const seatDefaults = [CLASS_ID_VANGUARD, CLASS_ID_TIDECALLER] as const;
  const classForSeat = (seat: number): ClassId => {
    const chosen = chosenClassIds[seat];
    const isConfigured =
      chosen !== undefined && (config === undefined || config.classes.some((c) => c.id === chosen));
    return isConfigured ? chosen : seatDefaults[seat === 0 ? 0 : 1];
  };

  return {
    map: generateMap(seedFromMatch(playerIds)),
    players: [
      {
        id: playerIds[0],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[0]}-unit-1`),
            classId: classForSeat(0),
            position: { ...V1_SPAWN_PLAYER_1 },
          },
        ],
      },
      {
        id: playerIds[1],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[1]}-unit-1`),
            classId: classForSeat(1),
            position: { ...V1_SPAWN_PLAYER_2 },
          },
        ],
      },
    ],
  };
}
