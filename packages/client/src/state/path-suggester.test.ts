import { describe, expect, it } from "vitest";
import type { GameConfig, MatchSnapshot, UnitId } from "@atlas/shared";
import {
  BASELINE_GAME_CONFIG,
  ClassIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  TerrainIdSchema,
  UnitIdSchema,
} from "@atlas/shared";
import { MatchView } from "./match-view.js";
import { reachableCells, suggestPath } from "./path-suggester.js";

const CLASS_ID = ClassIdSchema.parse("path-class");
const UNIT_1 = UnitIdSchema.parse("u1");
const UNIT_2 = UnitIdSchema.parse("u2");
const NORMAL = TerrainIdSchema.parse("normal");
const VOID = TerrainIdSchema.parse("void");

const config: GameConfig = {
  ...BASELINE_GAME_CONFIG,
  classes: [
    {
      id: CLASS_ID,
      name: "Path Class",
      description: "Test-only.",
      baseHealthPoints: 100,
      baseActionPoints: 6,
      baseMovementPoints: 3,
      spellIds: [],
    },
  ],
};

/** 5×1 corridor: [start][normal][void or wall][normal][normal] variants. */
function corridorView(middle: "void" | "wall" | "unit" | "open"): {
  view: MatchView;
  unitId: UnitId;
} {
  const cells = [];
  for (let x = 0; x < 5; x += 1) {
    cells.push({
      coord: { x, y: 0, z: middle === "wall" && x === 2 ? 3 : 0 },
      terrainId: middle === "void" && x === 2 ? VOID : NORMAL,
      states: [],
    });
  }
  const units = [
    {
      id: UNIT_1,
      playerId: PlayerIdSchema.parse("p1"),
      classId: CLASS_ID,
      position: { x: 0, y: 0, z: 0 },
      currentHealthPoints: 100,
      maxHealthPoints: 100,
      currentActionPoints: 6,
      currentMovementPoints: 3,
      states: [],
      revealedStanceId: null,
    },
  ];
  if (middle === "unit") {
    units.push({
      id: UNIT_2,
      playerId: PlayerIdSchema.parse("p2"),
      classId: CLASS_ID,
      position: { x: 2, y: 0, z: 0 },
      currentHealthPoints: 100,
      maxHealthPoints: 100,
      currentActionPoints: 6,
      currentMovementPoints: 3,
      states: [],
      revealedStanceId: null,
    });
  }
  const snapshot: MatchSnapshot = {
    id: MatchIdSchema.parse("m1"),
    roundNumber: 1,
    phase: "UnitTurns",
    board: { width: 5, height: 1, cells },
    units,
    initiativeOrder: [UNIT_1],
    activeUnitId: UNIT_1,
  };
  const view = new MatchView(config);
  view.loadSnapshot(snapshot);
  return { view, unitId: UNIT_1 };
}

describe("path suggester (UI proposal only — server validates)", () => {
  it("suggests a straight path within the MP budget", () => {
    const { view, unitId } = corridorView("open");
    const unit = view.unitById(unitId);
    if (unit === null) {
      throw new Error("missing unit");
    }
    expect(suggestPath(view, unit, 3, 0)).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ]);
    expect(suggestPath(view, unit, 4, 0)).toBeNull();
  });

  it("never routes through void, tall walls, or occupied cells", () => {
    for (const obstacle of ["void", "wall", "unit"] as const) {
      const { view, unitId } = corridorView(obstacle);
      const unit = view.unitById(unitId);
      if (unit === null) {
        throw new Error("missing unit");
      }
      expect(suggestPath(view, unit, 3, 0)).toBeNull();
      expect(reachableCells(view, unit).some((cell) => cell.coord.x >= 2)).toBe(false);
    }
  });

  it("counts climb costs in reachability", () => {
    const { view, unitId } = corridorView("open");
    // Raise cell (1,0) to z1: entering it costs 2 MP instead of 1.
    const cell = view.cellAt(1, 0);
    if (cell === null) {
      throw new Error("missing cell");
    }
    (cell as { z: number }).z = 1;
    const unit = view.unitById(unitId);
    if (unit === null) {
      throw new Error("missing unit");
    }
    const reachable = reachableCells(view, unit);
    expect(reachable.find((entry) => entry.coord.x === 1)?.movementPointCost).toBe(2);
    expect(reachable.find((entry) => entry.coord.x === 3)?.movementPointCost).toBeUndefined();
  });
});
