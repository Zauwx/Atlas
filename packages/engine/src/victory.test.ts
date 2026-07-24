import { describe, expect, it } from "vitest";
import type { GameEvent } from "@atlas/shared";
import { createMatchState } from "./match-state.js";
import { finalizeResolution } from "./victory.js";
import { buildSetup, buildTestConfig, flatMap, PLAYER_1 } from "./test-support/fixtures.js";

describe("victory (rulebook: Death, Victory)", () => {
  it("declares the survivor the winner", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(flatMap(4, 4), { x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 0 }),
    );
    const unit2 = state.units[1];
    if (unit2 === undefined) {
      throw new Error("missing unit");
    }
    unit2.currentHealthPoints = 0;
    const events: GameEvent[] = [];
    finalizeResolution(state, events);
    expect(events).toEqual([
      { type: "Death", unitId: unit2.id },
      { type: "Victory", winnerPlayerId: PLAYER_1 },
    ]);
    expect(state.phase).toBe("Finished");
  });

  it("declares a draw when every remaining player is eliminated simultaneously", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(flatMap(4, 4), { x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 0 }),
    );
    for (const unit of state.units) {
      unit.currentHealthPoints = -5;
    }
    const events: GameEvent[] = [];
    finalizeResolution(state, events);
    expect(events).toContainEqual({ type: "Victory", winnerPlayerId: null });
    expect(state.phase).toBe("Finished");
  });

  it("checks death only at finalization, never mid-resolution", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(flatMap(4, 4), { x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 0 }),
    );
    const unit2 = state.units[1];
    if (unit2 === undefined) {
      throw new Error("missing unit");
    }
    unit2.currentHealthPoints = -10;
    // Until finalizeResolution runs, the unit is still alive in the state.
    expect(unit2.alive).toBe(true);
    finalizeResolution(state, []);
    expect(unit2.alive).toBe(false);
  });
});
