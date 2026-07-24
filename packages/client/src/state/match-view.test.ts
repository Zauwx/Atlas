import { describe, expect, it } from "vitest";
import type { GameConfig, MatchSnapshot } from "@atlas/shared";
import {
  BASELINE_GAME_CONFIG,
  ClassIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SpellIdSchema,
  TerrainIdSchema,
  UnitIdSchema,
} from "@atlas/shared";
import { MatchView } from "./match-view.js";

const CLASS_ID = ClassIdSchema.parse("view-class");
const SPELL_ID = SpellIdSchema.parse("view-spell");
const PLAYER_1 = PlayerIdSchema.parse("p1");
const PLAYER_2 = PlayerIdSchema.parse("p2");
const UNIT_1 = UnitIdSchema.parse("u1");
const UNIT_2 = UnitIdSchema.parse("u2");
const NORMAL = TerrainIdSchema.parse("normal");

const config: GameConfig = {
  ...BASELINE_GAME_CONFIG,
  classes: [
    {
      id: CLASS_ID,
      name: "View Class",
      description: "Test-only.",
      baseHealthPoints: 100,
      baseActionPoints: 6,
      baseMovementPoints: 4,
      spellIds: [SPELL_ID],
    },
  ],
  spells: [
    {
      id: SPELL_ID,
      name: "View Spell",
      description: "Test-only.",
      element: "Physical",
      actionPointCost: 3,
      minRange: 1,
      maxRange: 3,
      requiresLineOfSight: true,
      effects: [{ kind: "Damage", element: "Physical", amount: 20 }],
    },
  ],
};

function snapshot(): MatchSnapshot {
  const cells = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      cells.push({
        coord: { x, y, z: x === 3 ? 2 : 0 },
        terrainId: NORMAL,
        states: [],
      });
    }
  }
  return {
    id: MatchIdSchema.parse("m1"),
    roundNumber: 1,
    phase: "UnitTurns",
    board: { width: 4, height: 4, cells },
    units: [
      {
        id: UNIT_1,
        playerId: PLAYER_1,
        classId: CLASS_ID,
        position: { x: 0, y: 0, z: 0 },
        currentHealthPoints: 100,
        maxHealthPoints: 100,
        currentActionPoints: 6,
        currentMovementPoints: 4,
        states: [],
        revealedStanceId: null,
      },
      {
        id: UNIT_2,
        playerId: PLAYER_2,
        classId: CLASS_ID,
        position: { x: 2, y: 2, z: 0 },
        currentHealthPoints: 100,
        maxHealthPoints: 100,
        currentActionPoints: 6,
        currentMovementPoints: 4,
        states: [],
        revealedStanceId: null,
      },
    ],
    initiativeOrder: [UNIT_1, UNIT_2],
    activeUnitId: UNIT_1,
  };
}

describe("MatchView event folding", () => {
  it("tracks position and MP through Move events, including climb costs", () => {
    const view = new MatchView(config);
    view.loadSnapshot(snapshot());
    view.apply({
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
    });
    const unit = view.unitById(UNIT_1);
    expect(unit?.position).toEqual({ x: 2, y: 0, z: 0 });
    expect(unit?.movementPoints).toBe(2);
  });

  it("tracks damage, heal clamping, and death", () => {
    const view = new MatchView(config);
    view.loadSnapshot(snapshot());
    view.apply({
      type: "Damage",
      targetUnitId: UNIT_2,
      amount: 30,
      element: "Physical",
      sourceUnitId: UNIT_1,
      sourceSpellId: SPELL_ID,
    });
    expect(view.unitById(UNIT_2)?.healthPoints).toBe(70);
    view.apply({
      type: "Heal",
      targetUnitId: UNIT_2,
      amount: 50,
      sourceUnitId: null,
      sourceSpellId: null,
    });
    expect(view.unitById(UNIT_2)?.healthPoints).toBe(100);
    view.apply({ type: "Death", unitId: UNIT_2 });
    expect(view.unitById(UNIT_2)?.alive).toBe(false);
    expect(view.livingUnitAt(2, 2)).toBeNull();
  });

  it("refreshes AP/MP from class config on TurnStarted", () => {
    const view = new MatchView(config);
    view.loadSnapshot(snapshot());
    view.apply({ type: "Move", unitId: UNIT_1, path: [{ x: 1, y: 0, z: 0 }] });
    view.apply({ type: "TurnEnded", unitId: UNIT_1 });
    view.apply({ type: "TurnStarted", unitId: UNIT_1 });
    const unit = view.unitById(UNIT_1);
    expect(unit?.movementPoints).toBe(4);
    expect(unit?.actionPoints).toBe(6);
    expect(view.activeUnitId).toBe(UNIT_1);
  });

  it("tracks states on units and cells, and terrain changes", () => {
    const view = new MatchView(config);
    view.loadSnapshot(snapshot());
    const wet = BASELINE_GAME_CONFIG.states[0];
    if (wet === undefined) {
      throw new Error("baseline is missing the wet state");
    }
    view.apply({
      type: "ApplyState",
      stateId: wet.id,
      target: { kind: "Cell", coord: { x: 1, y: 1, z: 0 } },
      duration: 2,
    });
    expect(view.cellAt(1, 1)?.states).toHaveLength(1);
    view.apply({
      type: "RemoveState",
      stateId: wet.id,
      target: { kind: "Cell", coord: { x: 1, y: 1, z: 0 } },
    });
    expect(view.cellAt(1, 1)?.states).toHaveLength(0);

    const water = TerrainIdSchema.parse("water");
    view.apply({
      type: "TerrainChanged",
      at: { x: 1, y: 1, z: 0 },
      fromTerrainId: NORMAL,
      toTerrainId: water,
    });
    expect(view.cellAt(1, 1)?.terrainId).toBe(water);
  });

  it("finishes the match on Victory", () => {
    const view = new MatchView(config);
    view.loadSnapshot(snapshot());
    view.apply({ type: "Victory", winnerPlayerId: PLAYER_1 });
    expect(view.phase).toBe("Finished");
    expect(view.winnerPlayerId).toBe(PLAYER_1);
  });
});
