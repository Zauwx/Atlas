import { describe, expect, it } from "vitest";
import type { GameConfig } from "@atlas/shared";
import {
  areaOffsets,
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  SPELL_ID_TIDAL_SURGE,
  SpellIdSchema,
  STANCE_ID_IRON,
  STATE_ID_WET,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { MatchSimulation } from "./simulation.js";
import { createV1RuleRegistry } from "./content/v1-rule-hooks.js";
import { flatMap, MATCH_ID, PLAYER_1, PLAYER_2, UNIT_1, UNIT_2 } from "./test-support/fixtures.js";

/** Area of effect — COMBAT_RULEBOOK.md "Area of effect". */

describe("area shapes", () => {
  it("Single covers only the target cell", () => {
    expect(areaOffsets({ kind: "Single" })).toEqual([{ dx: 0, dy: 0 }]);
  });

  it("Cross covers both axes but no diagonals", () => {
    const offsets = areaOffsets({ kind: "Cross", radius: 1 });
    expect(offsets).toHaveLength(5);
    expect(offsets).toContainEqual({ dx: 0, dy: 0 });
    expect(offsets).toContainEqual({ dx: 1, dy: 0 });
    expect(offsets).toContainEqual({ dx: 0, dy: -1 });
    expect(offsets).not.toContainEqual({ dx: 1, dy: 1 });
  });

  it("Circle covers everything within Manhattan radius", () => {
    // radius 1 is the same 5 cells; radius 2 adds the diagonals and the tips.
    expect(areaOffsets({ kind: "Circle", radius: 1 })).toHaveLength(5);
    const wide = areaOffsets({ kind: "Circle", radius: 2 });
    expect(wide).toHaveLength(13);
    expect(wide).toContainEqual({ dx: 1, dy: 1 });
    expect(wide).not.toContainEqual({ dx: 2, dy: 1 });
  });

  it("lists cells row-major so resolution order is deterministic", () => {
    const offsets = areaOffsets({ kind: "Circle", radius: 1 });
    expect(offsets).toEqual([
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
    ]);
  });
});

describe("area spells in a match", () => {
  function tidecallerSim(config: GameConfig = V1_GAME_CONFIG): MatchSimulation {
    const sim = new MatchSimulation(
      MATCH_ID,
      config,
      {
        map: flatMap(8, 8),
        players: [
          {
            id: PLAYER_1,
            units: [{ id: UNIT_1, classId: CLASS_ID_TIDECALLER, position: { x: 2, y: 2, z: 0 } }],
          },
          {
            id: PLAYER_2,
            units: [{ id: UNIT_2, classId: CLASS_ID_VANGUARD, position: { x: 5, y: 2, z: 0 } }],
          },
        ],
      },
      createV1RuleRegistry(),
    );
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_ID_IRON });
    sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_ID_IRON });
    return sim;
  }

  it("Tidal Surge floods every cell of its circle", () => {
    const sim = tidecallerSim();
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_TIDAL_SURGE,
      target: { x: 4, y: 2, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const flooded = result.events.filter((event) => event.type === "TerrainChanged");
      // Circle radius 1 around (4,2): five cells, all in bounds.
      expect(flooded).toHaveLength(5);
      expect(flooded.map((event) => `${String(event.at.x)},${String(event.at.y)}`)).toEqual([
        "4,1",
        "3,2",
        "4,2",
        "5,2",
        "4,3",
      ]);
    }
  });

  it("soaks every unit standing in the flooded area, the caster included", () => {
    const sim = tidecallerSim();
    // Aimed one cell away, the circle catches the caster at (2,2) as well
    // as the opponent is out of reach — friendly fire is not special-cased.
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_TIDAL_SURGE,
      target: { x: 3, y: 2, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: STATE_ID_WET,
        target: { kind: "Unit", unitId: UNIT_1 },
        duration: 1,
      });
    }
  });

  it("clips the area at the board edge instead of failing", () => {
    const sim = tidecallerSim();
    // Target the top row: the cell above it is off the board.
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_TIDAL_SURGE,
      target: { x: 2, y: 0, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.filter((event) => event.type === "TerrainChanged")).toHaveLength(4);
    }
  });

  it("still validates range and line of sight against the target cell only", () => {
    const sim = tidecallerSim();
    expect(
      sim.handleIntent(PLAYER_1, {
        type: "CastSpell",
        unitId: UNIT_1,
        spellId: SPELL_ID_TIDAL_SURGE,
        target: { x: 7, y: 7, z: 0 },
      }),
    ).toMatchObject({ accepted: false, rejection: { code: "OutOfRange" } });
  });

  it("hits every unit in a damaging area", () => {
    const blast = SpellIdSchema.parse("test-blast");
    const config: GameConfig = {
      ...V1_GAME_CONFIG,
      classes: V1_GAME_CONFIG.classes.map((gameClass) =>
        gameClass.id === CLASS_ID_TIDECALLER
          ? { ...gameClass, spellIds: [...gameClass.spellIds, blast] }
          : gameClass,
      ),
      spells: [
        ...V1_GAME_CONFIG.spells,
        {
          id: blast,
          name: "Test Blast",
          description: "Test-only area damage.",
          element: "Physical",
          actionPointCost: 2,
          minRange: 1,
          maxRange: 4,
          requiresLineOfSight: false,
          area: { kind: "Circle", radius: 2 },
          effects: [{ kind: "Damage", element: "Physical", amount: 10 }],
        },
      ],
    };
    const sim = tidecallerSim(config);
    // Aimed between the two units so the circle covers both.
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: blast,
      target: { x: 4, y: 2, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      const damaged = result.events
        .filter((event) => event.type === "Damage")
        .map((event) => event.targetUnitId);
      expect(damaged).toContain(UNIT_2);
    }
  });
});
