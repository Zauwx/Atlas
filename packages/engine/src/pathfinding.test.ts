import { describe, expect, it } from "vitest";
import { createMatchState } from "./match-state.js";
import { computeReachableCells } from "./pathfinding.js";
import { RuleModifierRegistry } from "./rules.js";
import { buildMap, buildSetup, buildTestConfig, flatMap } from "./test-support/fixtures.js";

const registry = new RuleModifierRegistry();

describe("pathfinding (deterministic reachable cells)", () => {
  it("reaches every cell within MP budget on flat ground (Manhattan costs)", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(flatMap(9, 9), { x: 0, y: 0, z: 0 }, { x: 8, y: 8, z: 0 }),
    );
    const unit = state.units[0];
    if (unit === undefined) {
      throw new Error("missing unit");
    }
    const reachable = computeReachableCells(state, registry, unit);
    // From a corner with 4 MP: cells at Manhattan distance 1..4 inside the map,
    // minus the opponent's far cell (not in range anyway): 2+3+4+5 = 14.
    expect(reachable).toHaveLength(14);
    for (const cell of reachable) {
      expect(cell.movementPointCost).toBe(Math.abs(cell.coord.x - 0) + Math.abs(cell.coord.y - 0));
    }
  });

  it("charges climb costs and excludes cells above the climb limit", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(
        buildMap([
          [0, 1, 3],
          [0, 0, 0],
        ]),
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
      ),
    );
    const unit = state.units[0];
    if (unit === undefined) {
      throw new Error("missing unit");
    }
    const reachable = computeReachableCells(state, registry, unit);
    const climbCell = reachable.find((cell) => cell.coord.x === 1 && cell.coord.y === 0);
    expect(climbCell?.movementPointCost).toBe(2);
    // (2,0) is z3: +2 above the z1 neighbor — unreachable without an ability.
    expect(reachable.some((cell) => cell.coord.x === 2 && cell.coord.y === 0)).toBe(false);
  });

  it("never lists bottomless cells as destinations", () => {
    const state = createMatchState(
      buildTestConfig(),
      buildSetup(
        buildMap(
          [
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            ["normal", "void", "normal"],
            ["normal", "normal", "normal"],
          ],
        ),
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
      ),
    );
    const unit = state.units[0];
    if (unit === undefined) {
      throw new Error("missing unit");
    }
    const reachable = computeReachableCells(state, registry, unit);
    expect(reachable.some((cell) => cell.coord.x === 1 && cell.coord.y === 0)).toBe(false);
  });

  it("is deterministic: identical runs produce identical results", () => {
    const build = () =>
      createMatchState(
        buildTestConfig(),
        buildSetup(flatMap(7, 7), { x: 3, y: 3, z: 0 }, { x: 6, y: 6, z: 0 }),
      );
    const stateA = build();
    const stateB = build();
    const unitA = stateA.units[0];
    const unitB = stateB.units[0];
    if (unitA === undefined || unitB === undefined) {
      throw new Error("missing unit");
    }
    expect(JSON.stringify(computeReachableCells(stateA, registry, unitA))).toBe(
      JSON.stringify(computeReachableCells(stateB, registry, unitB)),
    );
  });
});
