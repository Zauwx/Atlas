import { describe, expect, it } from "vitest";
import type { PlayerId, PlayerIntent } from "@atlas/shared";
import type { MatchSimulation } from "./simulation.js";
import {
  buildMap,
  createTestSim,
  PLAYER_1,
  PLAYER_2,
  SPELL_GUST,
  SPELL_SOAK,
  SPELL_STRIKE,
  UNIT_1,
  UNIT_2,
} from "./test-support/fixtures.js";

/**
 * The determinism invariant (COMBAT_RULEBOOK.md "Determinism"): the same
 * inputs always produce the same outputs — event logs and snapshots are
 * byte-identical across runs.
 */
describe("determinism", () => {
  const script: [PlayerId, PlayerIntent][] = [
    [PLAYER_1, { type: "Move", unitId: UNIT_1, path: [{ x: 1, y: 1, z: 0 }] }],
    [
      PLAYER_1,
      { type: "CastSpell", unitId: UNIT_1, spellId: SPELL_SOAK, target: { x: 3, y: 1, z: 0 } },
    ],
    [PLAYER_1, { type: "EndTurn", unitId: UNIT_1 }],
    [PLAYER_2, { type: "Move", unitId: UNIT_2, path: [{ x: 3, y: 2, z: 0 }] }],
    [
      PLAYER_2,
      { type: "CastSpell", unitId: UNIT_2, spellId: SPELL_STRIKE, target: { x: 1, y: 1, z: 0 } },
    ],
    [PLAYER_2, { type: "EndTurn", unitId: UNIT_2 }],
    [
      PLAYER_2,
      { type: "CastSpell", unitId: UNIT_2, spellId: SPELL_GUST, target: { x: 1, y: 2, z: 0 } },
    ],
    [PLAYER_2, { type: "EndTurn", unitId: UNIT_2 }],
    [PLAYER_1, { type: "EndTurn", unitId: UNIT_1 }],
  ];

  function run(): MatchSimulation {
    const map = buildMap(
      [
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 2, 0, 0],
        [0, 0, 0, 0, 0],
      ],
      [
        ["normal", "water", "normal", "normal", "normal"],
        ["normal", "normal", "normal", "normal", "normal"],
        ["normal", "normal", "normal", "normal", "void"],
        ["normal", "normal", "normal", "normal", "normal"],
      ],
    );
    const sim = createTestSim({
      map,
      unit1: { x: 0, y: 1, z: 0 },
      unit2: { x: 3, y: 1, z: 0 },
    });
    for (const [playerId, intent] of script) {
      sim.handleIntent(playerId, intent);
    }
    return sim;
  }

  it("produces byte-identical event logs and snapshots across runs", () => {
    const first = run();
    const second = run();
    expect(JSON.stringify(first.getEventLog())).toBe(JSON.stringify(second.getEventLog()));
    expect(JSON.stringify(first.getSnapshot())).toBe(JSON.stringify(second.getSnapshot()));
    // The log is non-trivial: intents were actually accepted.
    expect(first.getEventLog().length).toBeGreaterThan(8);
  });
});
