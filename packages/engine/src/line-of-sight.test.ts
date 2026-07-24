import { describe, expect, it } from "vitest";
import { hasLineOfSight, supercoverCrossedCells } from "./line-of-sight.js";
import { createMatchState } from "./match-state.js";
import { buildMap, buildSetup, buildTestConfig } from "./test-support/fixtures.js";

function stateWithHeights(heights: number[][]) {
  const map = buildMap(heights);
  const width = heights[0]?.length ?? 0;
  const height = heights.length;
  // Units parked in opposite corners; irrelevant to LoS (units never block).
  return createMatchState(
    buildTestConfig(),
    buildSetup(
      map,
      { x: 0, y: height - 1, z: heights[height - 1]?.[0] ?? 0 },
      { x: width - 1, y: height - 1, z: heights[height - 1]?.[width - 1] ?? 0 },
    ),
  );
}

describe("line of sight (rulebook: max-endpoint supercover rule)", () => {
  it("crosses no cells between adjacent cells", () => {
    expect(supercoverCrossedCells({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  it("crosses both corner-adjacent cells on an exact diagonal", () => {
    const crossed = supercoverCrossedCells({ x: 0, y: 0 }, { x: 2, y: 2 });
    expect(crossed).toContainEqual({ x: 1, y: 0 });
    expect(crossed).toContainEqual({ x: 0, y: 1 });
    expect(crossed).toContainEqual({ x: 1, y: 1 });
  });

  it("sees along a flat row", () => {
    const state = stateWithHeights([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(hasLineOfSight(state, { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })).toBe(true);
  });

  it("is blocked by a cell at max(source, target) + 1", () => {
    const state = stateWithHeights([
      [0, 1, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(hasLineOfSight(state, { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })).toBe(false);
  });

  it("sees over a low wall from high ground (max-endpoint rule)", () => {
    const state = stateWithHeights([
      [2, 1, 0, 0],
      [0, 0, 0, 0],
    ]);
    // max(2, 0) + 1 = 3 > wall height 1 → visible in BOTH directions.
    expect(hasLineOfSight(state, { x: 0, y: 0, z: 2 }, { x: 3, y: 0, z: 0 })).toBe(true);
    expect(hasLineOfSight(state, { x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: 2 })).toBe(true);
  });

  it("is blocked diagonally by a corner-adjacent pillar", () => {
    const state = stateWithHeights([
      [0, 3, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    // Exact diagonal (0,0)→(2,2) grazes the corner of the pillar at (1,0).
    expect(hasLineOfSight(state, { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 0 })).toBe(false);
  });
});
