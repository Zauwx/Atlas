import { describe, expect, it } from "vitest";
import {
  buildMap,
  createTestSim,
  PLAYER_1,
  SPELL_ABYSS,
  SPELL_COMBO,
  SPELL_GUST,
  SPELL_QUAKE,
  SPELL_SOAK,
  SPELL_STRIKE,
  UNIT_1,
  UNIT_2,
} from "./test-support/fixtures.js";

describe("spell resolution (rulebook: Resolution Pipeline)", () => {
  it("applies Physical damage and spends AP", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_STRIKE,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Damage",
        targetUnitId: UNIT_2,
        amount: 20,
        element: "Physical",
        sourceUnitId: UNIT_1,
        sourceSpellId: SPELL_STRIKE,
      });
    }
    const snapshot = sim.getSnapshot();
    expect(snapshot.units.find((unit) => unit.id === UNIT_2)?.currentHealthPoints).toBe(80);
    expect(snapshot.units.find((unit) => unit.id === UNIT_1)?.currentActionPoints).toBe(3);
  });

  it("rejects a cast the unit cannot afford (NotEnoughActionPoints)", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const cast = () =>
      sim.handleIntent(PLAYER_1, {
        type: "CastSpell",
        unitId: UNIT_1,
        spellId: SPELL_STRIKE,
        target: { x: 3, y: 1, z: 0 },
      });
    expect(cast().accepted).toBe(true);
    expect(cast().accepted).toBe(true);
    expect(cast()).toMatchObject({
      accepted: false,
      rejection: { code: "NotEnoughActionPoints" },
    });
  });

  it("rejects a target beyond max range (OutOfRange)", () => {
    const sim = createTestSim({ unit2: { x: 6, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_STRIKE,
      target: { x: 6, y: 1, z: 0 },
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "OutOfRange" } });
  });

  it("rejects a cast without line of sight (NoLineOfSight)", () => {
    const map = buildMap([
      [0, 1, 0, 0],
      [0, 0, 0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 2, y: 0, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_STRIKE,
      target: { x: 2, y: 0, z: 0 },
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "NoLineOfSight" } });
  });

  it("applies a state to the CELL when the target is empty (rulebook Edge Cases)", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_SOAK,
      target: { x: 2, y: 2, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: "wet",
        target: { kind: "Cell", coord: { x: 2, y: 2, z: 0 } },
        duration: 2,
      });
    }
  });

  it("transforms terrain and applies the new terrain's states to the occupant", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_QUAKE,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "TerrainChanged",
        at: { x: 3, y: 1, z: 0 },
        fromTerrainId: "normal",
        toTerrainId: "water",
      });
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: "wet",
        target: { kind: "Unit", unitId: UNIT_2 },
        duration: 1,
      });
    }
  });

  it("kills the occupant when the ground is transformed into Void", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ABYSS,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({ type: "Death", unitId: UNIT_2 });
      expect(result.events).toContainEqual({ type: "Victory", winnerPlayerId: PLAYER_1 });
    }
  });

  it("executes effects grouped by pipeline step, not in configuration order", () => {
    // test-combo lists: ApplyState, Damage(Lightning), Push, Damage(Physical).
    // Pipeline order must produce: Push → Damage(Physical) → Damage(Lightning) → ApplyState.
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_COMBO,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const kinds = result.events
        .filter((event) => ["Push", "Damage", "ApplyState"].includes(event.type))
        .map((event) => (event.type === "Damage" ? `Damage:${event.element}` : event.type));
      expect(kinds).toEqual(["Push", "Damage:Physical", "Damage:Lightning", "ApplyState"]);
    }
  });

  it("rejects a push spell on a non-axis-aligned target (InvalidTarget)", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 2, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_GUST,
      target: { x: 3, y: 2, z: 0 },
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "InvalidTarget" } });
  });
});
