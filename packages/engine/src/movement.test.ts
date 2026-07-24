import { describe, expect, it } from "vitest";
import { buildMap, createTestSim, PLAYER_1, PLAYER_2, UNIT_1 } from "./test-support/fixtures.js";

describe("movement (rulebook: Movement, Verticality)", () => {
  it("moves along a valid path and spends 1 MP per cell", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 2, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
      ],
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toEqual([
        {
          type: "Move",
          unitId: UNIT_1,
          path: [
            { x: 2, y: 1, z: 0 },
            { x: 3, y: 1, z: 0 },
          ],
        },
      ]);
    }
    const unit = sim.getSnapshot().units.find((candidate) => candidate.id === UNIT_1);
    expect(unit?.currentMovementPoints).toBe(2);
    expect(unit?.position).toEqual({ x: 3, y: 1, z: 0 });
  });

  it("charges +1 MP to climb +1 z", () => {
    const map = buildMap([
      [0, 1],
      [0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 0, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 1 }],
    });
    expect(result.accepted).toBe(true);
    const unit = sim.getSnapshot().units.find((candidate) => candidate.id === UNIT_1);
    expect(unit?.currentMovementPoints).toBe(2);
  });

  it("rejects climbing +2 z (ClimbTooHigh)", () => {
    const map = buildMap([
      [0, 2],
      [0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 0, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 2 }],
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "ClimbTooHigh" } });
  });

  it("treats a −1 z step as a safe descent (no Fall event)", () => {
    const map = buildMap([
      [1, 0],
      [0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 1 }, unit2: { x: 0, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.some((event) => event.type === "Fall")).toBe(false);
    }
  });

  it("resolves a voluntary −2 z step as a fall: ΔZ × 15 damage", () => {
    const map = buildMap([
      [2, 0],
      [0, 0],
    ]);
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 2 }, unit2: { x: 0, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Fall",
        unitId: UNIT_1,
        from: { x: 0, y: 0, z: 2 },
        to: { x: 1, y: 0, z: 0 },
        damage: 30,
      });
    }
    const unit = sim.getSnapshot().units.find((candidate) => candidate.id === UNIT_1);
    expect(unit?.currentHealthPoints).toBe(70);
  });

  it("applies Wet when walking through Water (terrain acts via states)", () => {
    const map = buildMap(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [
        ["normal", "water", "normal"],
        ["normal", "normal", "normal"],
      ],
    );
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 2, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: "wet",
        target: { kind: "Unit", unitId: UNIT_1 },
        duration: 1,
      });
    }
  });

  it("kills a unit voluntarily entering Void, and the opponent wins", () => {
    const map = buildMap(
      [
        [0, 0],
        [0, 0],
      ],
      [
        ["normal", "void"],
        ["normal", "normal"],
      ],
    );
    const sim = createTestSim({ map, unit1: { x: 0, y: 0, z: 0 }, unit2: { x: 1, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.some((event) => event.type === "Fall")).toBe(false);
      expect(result.events).toContainEqual({ type: "Death", unitId: UNIT_1 });
      expect(result.events).toContainEqual({ type: "Victory", winnerPlayerId: PLAYER_2 });
    }
    expect(sim.getSnapshot().phase).toBe("Finished");
  });

  it("rejects passing through an occupied cell", () => {
    const sim = createTestSim({ unit2: { x: 3, y: 1, z: 0 } });
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 2, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
      ],
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "CellOccupied" } });
  });

  it("rejects a move by the non-active player (NotYourTurn)", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_2, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 2, y: 1, z: 0 }],
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "NotYourTurn" } });
  });

  it("rejects a path costing more than the unit's MP", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 2, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
        { x: 4, y: 1, z: 0 },
        { x: 5, y: 1, z: 0 },
        { x: 5, y: 2, z: 0 },
      ],
    });
    expect(result).toMatchObject({
      accepted: false,
      rejection: { code: "NotEnoughMovementPoints" },
    });
  });

  it("rejects a non-adjacent step (InvalidTarget)", () => {
    const sim = createTestSim();
    const result = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 3, y: 1, z: 0 }],
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: "InvalidTarget" } });
  });
});
