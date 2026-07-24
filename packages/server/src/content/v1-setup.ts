import type { MatchSetup, PlayerId } from "@atlas/shared";
import {
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  createV1Map,
  UnitIdSchema,
  V1_SPAWN_PLAYER_1,
  V1_SPAWN_PLAYER_2,
} from "@atlas/shared";

/**
 * V1 match setup: Ridge and Pools, first joiner plays Vanguard from the
 * west, second joiner plays Tidecaller from the east. Class selection UI
 * is future work (open question); V1 assigns by seat.
 */
export function buildV1MatchSetup(playerIds: readonly [PlayerId, PlayerId]): MatchSetup {
  return {
    map: createV1Map(),
    players: [
      {
        id: playerIds[0],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[0]}-unit-1`),
            classId: CLASS_ID_VANGUARD,
            position: { ...V1_SPAWN_PLAYER_1 },
          },
        ],
      },
      {
        id: playerIds[1],
        units: [
          {
            id: UnitIdSchema.parse(`${playerIds[1]}-unit-1`),
            classId: CLASS_ID_TIDECALLER,
            position: { ...V1_SPAWN_PLAYER_2 },
          },
        ],
      },
    ],
  };
}
