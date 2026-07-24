import { describe, expect, it } from "vitest";
import { STATE_ID_WET } from "@atlas/shared";
import { RuleModifierRegistry } from "./rules.js";
import {
  createTestSim,
  PLAYER_1,
  PLAYER_2,
  SPELL_GUST,
  SPELL_SOAK,
  UNIT_1,
  UNIT_2,
} from "./test-support/fixtures.js";

/**
 * Proves the rule-modifier mechanism (ARCHITECTURE.md): behavior changes by
 * registering hooks under a state/stance id — resolution code is untouched.
 * The hooks registered here are TEST content, not game content.
 */
describe("rule modifier registry", () => {
  it("a state hook can forbid movement (Rooted-style)", () => {
    const registry = new RuleModifierRegistry();
    registry.register(STATE_ID_WET, { canUnitMove: () => false });
    const sim = createTestSim({ registry, unit2: { x: 3, y: 1, z: 0 } });

    // Soak unit-2, then let unit-2 try to move on its turn.
    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 3, y: 1, z: 0 },
    });
    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    const move = sim.handleIntent(PLAYER_2, {
      type: "Move",
      unitId: UNIT_2,
      path: [{ x: 4, y: 1, z: 0 }],
    });
    expect(move).toMatchObject({ accepted: false, rejection: { code: "MovementBlocked" } });
  });

  it("a state hook can modify push distance (stance/state physics)", () => {
    const registry = new RuleModifierRegistry();
    registry.register(STATE_ID_WET, { modifyPushDistance: () => 0 });
    const sim = createTestSim({ registry, unit2: { x: 3, y: 1, z: 0 } });

    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 3, y: 1, z: 0 },
    });
    const gust = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(gust.accepted).toBe(true);
    if (gust.accepted) {
      // Push reduced to zero: the wet unit does not move.
      expect(gust.events.some((event) => event.type === "Push")).toBe(false);
    }
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_2)?.position).toEqual({
      x: 3,
      y: 1,
      z: 0,
    });
  });
});
