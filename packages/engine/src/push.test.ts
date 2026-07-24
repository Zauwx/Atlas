import { describe, expect, it } from "vitest";
import {
  buildMap,
  createTestSim,
  PLAYER_1,
  SPELL_GUST,
  UNIT_1,
  UNIT_2,
} from "./test-support/fixtures.js";

/** Pushes are exercised through the spell pipeline (test-gust: Push 3). */
describe("pushes (rulebook: Pushes, Collisions, Falls)", () => {
  it("pushes a unit the full distance on flat ground", () => {
    const sim = createTestSim({ unit1: { x: 1, y: 1, z: 0 }, unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Push",
        unitId: UNIT_2,
        direction: "East",
        from: { x: 3, y: 1, z: 0 },
        to: { x: 6, y: 1, z: 0 },
      });
      expect(result.events.some((event) => event.type === "Collision")).toBe(false);
    }
  });

  it("collides with the map edge: 10 HP per remaining cell", () => {
    // unit-2 at x=6 on an 8-wide map: pushed East 3, travels 1, collides with 2 remaining.
    const sim = createTestSim({ unit1: { x: 4, y: 1, z: 0 }, unit2: { x: 6, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 6, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Collision",
        unitId: UNIT_2,
        at: { x: 7, y: 1, z: 0 },
        remainingCells: 2,
        damage: 20,
      });
    }
    const unit = sim.getSnapshot().units.find((candidate) => candidate.id === UNIT_2);
    expect(unit?.currentHealthPoints).toBe(80);
  });

  it("collides against a +1 z rise without traversing it", () => {
    const map = buildMap([
      [0, 0, 0, 1],
      [0, 0, 0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 2, y: 0, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 2, y: 0, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      // 3 to push, 0 traversed: full 3 remaining → 30 damage.
      expect(result.events).toContainEqual({
        type: "Collision",
        unitId: UNIT_2,
        at: { x: 2, y: 0, z: 0 },
        remainingCells: 3,
        damage: 30,
      });
      expect(result.events.some((event) => event.type === "Push")).toBe(false);
    }
  });

  it("collides against another unit", () => {
    const sim = createTestSim({
      unit1: { x: 1, y: 1, z: 0 },
      unit2: { x: 3, y: 1, z: 0 },
      extraPlayer2Unit: { x: 5, y: 1, z: 0 },
    });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      // Travels 1 cell (to x=4), blocked by unit-3 at x=5: 2 remaining → 20 damage.
      expect(result.events).toContainEqual({
        type: "Collision",
        unitId: UNIT_2,
        at: { x: 4, y: 1, z: 0 },
        remainingCells: 2,
        damage: 20,
      });
    }
  });

  it("ends the push with a fall when shoved over an edge, no collision damage", () => {
    const map = buildMap([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 2 }, unit2: { x: 1, y: 0, z: 2 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 1, y: 0, z: 2 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Fall",
        unitId: UNIT_2,
        from: { x: 1, y: 0, z: 2 },
        to: { x: 2, y: 0, z: 0 },
        damage: 30,
      });
      expect(result.events.some((event) => event.type === "Collision")).toBe(false);
    }
    const unit = sim.getSnapshot().units.find((candidate) => candidate.id === UNIT_2);
    expect(unit?.currentHealthPoints).toBe(70);
    expect(unit?.position).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("kills a unit pushed into Void: Death, no Fall event, attacker wins", () => {
    const map = buildMap(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [
        ["normal", "normal", "void"],
        ["normal", "normal", "normal"],
      ],
    );
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 1, y: 0, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 1, y: 0, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.some((event) => event.type === "Fall")).toBe(false);
      expect(result.events).toContainEqual({ type: "Death", unitId: UNIT_2 });
      expect(result.events).toContainEqual({ type: "Victory", winnerPlayerId: PLAYER_1 });
    }
  });
});
