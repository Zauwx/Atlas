import type { ClassId, GameConfig, MatchSetup, PlayerId } from "@atlas/shared";
import {
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  createV1Map,
  UnitIdSchema,
  V1_SPAWN_PLAYER_1,
  V1_SPAWN_PLAYER_2,
} from "@atlas/shared";

/**
 * V1 match setup on Ridge and Pools: first joiner spawns west, second
 * east.
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
    map: createV1Map(),
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
