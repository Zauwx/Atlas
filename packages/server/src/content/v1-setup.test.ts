import { describe, expect, it } from "vitest";
import type { ClassId, PlayerId } from "@atlas/shared";
import {
  ClassIdSchema,
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  PlayerIdSchema,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { buildV1MatchSetup } from "./v1-setup.js";

const PLAYERS: readonly [PlayerId, PlayerId] = [
  PlayerIdSchema.parse("p1"),
  PlayerIdSchema.parse("p2"),
];

const classesOf = (chosen: readonly (ClassId | undefined)[]) =>
  buildV1MatchSetup(PLAYERS, chosen, V1_GAME_CONFIG).players.map(
    (player) => player.units[0]?.classId,
  );

describe("V1 match setup: class choice", () => {
  it("falls back to the seat defaults when nobody chooses", () => {
    expect(classesOf([])).toEqual([CLASS_ID_VANGUARD, CLASS_ID_TIDECALLER]);
  });

  it("honours each player's chosen class", () => {
    expect(classesOf([CLASS_ID_TIDECALLER, CLASS_ID_VANGUARD])).toEqual([
      CLASS_ID_TIDECALLER,
      CLASS_ID_VANGUARD,
    ]);
  });

  it("allows mirror matches", () => {
    expect(classesOf([CLASS_ID_VANGUARD, CLASS_ID_VANGUARD])).toEqual([
      CLASS_ID_VANGUARD,
      CLASS_ID_VANGUARD,
    ]);
  });

  it("ignores a class that is not in the configuration", () => {
    const invented = ClassIdSchema.parse("god-mode");
    expect(classesOf([invented, undefined])).toEqual([CLASS_ID_VANGUARD, CLASS_ID_TIDECALLER]);
  });

  it("keeps the spawns regardless of the classes chosen", () => {
    const setup = buildV1MatchSetup(
      PLAYERS,
      [CLASS_ID_TIDECALLER, CLASS_ID_TIDECALLER],
      V1_GAME_CONFIG,
    );
    expect(setup.players[0]?.units[0]?.position).toEqual({ x: 1, y: 5, z: 0 });
    expect(setup.players[1]?.units[0]?.position).toEqual({ x: 10, y: 6, z: 0 });
  });
});
