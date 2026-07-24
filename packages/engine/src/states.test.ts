import { describe, expect, it } from "vitest";
import {
  createTestSim,
  PLAYER_1,
  PLAYER_2,
  SPELL_SOAK,
  UNIT_1,
  UNIT_2,
} from "./test-support/fixtures.js";

describe("state lifecycle (rulebook: States, Round Structure step 8)", () => {
  it("ticks durations at end of round and removes expired states", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    // Soak applies Wet for 2 rounds to unit-2.
    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 3, y: 1, z: 0 },
    });
    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    const endRound1 = sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    expect(endRound1.accepted).toBe(true);
    if (endRound1.accepted) {
      // Duration 2 → survives the first end-of-round tick.
      expect(endRound1.events.some((event) => event.type === "RemoveState")).toBe(false);
    }
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_2)?.states).toHaveLength(1);

    // Round 2: unit-2 first (rotation), then unit-1; second tick removes Wet.
    sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });
    const endRound2 = sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    expect(endRound2.accepted).toBe(true);
    if (endRound2.accepted) {
      expect(endRound2.events).toContainEqual({
        type: "RemoveState",
        stateId: "wet",
        target: { kind: "Unit", unitId: UNIT_2 },
      });
    }
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_2)?.states).toHaveLength(0);
  });

  it("re-application replaces the remaining duration (no stacking)", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 3, y: 1, z: 0 },
    });
    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 3, y: 1, z: 0 },
    });
    const states = sim.getSnapshot().units.find((unit) => unit.id === UNIT_2)?.states;
    expect(states).toHaveLength(1);
    expect(states?.[0]?.remainingDuration).toBe(2);
  });
});
