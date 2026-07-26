import { describe, expect, it } from "vitest";
import type { CellCoord, ClassId, MapConfig, MatchSetup, StanceId } from "@atlas/shared";
import {
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  SPELL_ID_DRENCH,
  SPELL_ID_GROUND_SLAM,
  SPELL_ID_SHOVE,
  SPELL_ID_WATER_JET,
  STANCE_ID_FLOW,
  STANCE_ID_IRON,
  STANCE_ID_STORM,
  STATE_ID_FROZEN,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { MatchSimulation } from "../simulation.js";
import { createV1RuleRegistry } from "./v1-rule-hooks.js";
import {
  buildMap,
  flatMap,
  MATCH_ID,
  PLAYER_1,
  PLAYER_2,
  UNIT_1,
  UNIT_2,
} from "../test-support/fixtures.js";

/**
 * V1 content rules, verified end to end through the simulation:
 * stances locked secretly, revealed, then acted upon
 * (COMBAT_RULEBOOK.md "V1 stances", "Defined state effects").
 */

function createV1Sim(options: {
  map?: MapConfig;
  player1Class?: ClassId;
  unit1: CellCoord;
  unit2: CellCoord;
  stance1: StanceId;
  stance2: StanceId;
}): MatchSimulation {
  const setup: MatchSetup = {
    map: options.map ?? flatMap(8, 3),
    players: [
      {
        id: PLAYER_1,
        units: [
          {
            id: UNIT_1,
            classId: options.player1Class ?? CLASS_ID_VANGUARD,
            position: options.unit1,
          },
        ],
      },
      {
        id: PLAYER_2,
        units: [{ id: UNIT_2, classId: CLASS_ID_VANGUARD, position: options.unit2 }],
      },
    ],
  };
  const sim = new MatchSimulation(MATCH_ID, V1_GAME_CONFIG, setup, createV1RuleRegistry());
  expect(sim.getSnapshot().phase).toBe("StanceSelection");
  expect(
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: options.stance1 }).accepted,
  ).toBe(true);
  expect(
    sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: options.stance2 }).accepted,
  ).toBe(true);
  expect(sim.getSnapshot().phase).toBe("UnitTurns");
  return sim;
}

describe("climbing a ramp onto high ground (rulebook: Movement, climb ≤ +1)", () => {
  /**
   * A z2 shelf beside z0 ground cannot be climbed in one step, because a
   * step climbs at most +1; a z1 ramp bridges the route 0 → 1 → 2. The
   * procedural map generator guarantees every rise is ramped, so this
   * checks the mechanic that guarantee relies on, on an explicit ramp.
   */
  const rampHeights = Array.from({ length: 7 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 5 && y === 2 ? 1 : x === 5 && y === 3 ? 2 : 0)),
  );
  const standNextToRamp = () =>
    new MatchSimulation(
      MATCH_ID,
      V1_GAME_CONFIG,
      {
        map: buildMap(rampHeights),
        players: [
          {
            id: PLAYER_1,
            // (4,2) is plain ground beside the north ramp at (5,2).
            units: [{ id: UNIT_1, classId: CLASS_ID_VANGUARD, position: { x: 4, y: 2, z: 0 } }],
          },
          {
            id: PLAYER_2,
            units: [{ id: UNIT_2, classId: CLASS_ID_TIDECALLER, position: { x: 10, y: 6, z: 0 } }],
          },
        ],
      },
      createV1RuleRegistry(),
    );

  it("lets a unit climb the ramp onto the ridge", () => {
    const sim = standNextToRamp();
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_ID_FLOW });
    sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_ID_IRON });

    const climb = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 5, y: 2, z: 1 },
        { x: 5, y: 3, z: 2 },
      ],
    });
    expect(climb.accepted).toBe(true);
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_1)?.position).toEqual({
      x: 5,
      y: 3,
      z: 2,
    });
  });

  it("costs 4 MP without Flow — beyond the Vanguard's 3 — so Flow is the way up", () => {
    const sim = standNextToRamp();
    sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_ID_IRON });
    sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_ID_IRON });

    expect(
      sim.handleIntent(PLAYER_1, {
        type: "Move",
        unitId: UNIT_1,
        path: [
          { x: 5, y: 2, z: 1 },
          { x: 5, y: 3, z: 2 },
        ],
      }),
    ).toMatchObject({ accepted: false, rejection: { code: "NotEnoughMovementPoints" } });
  });
});

describe("V1 stance and state rules", () => {
  it("Storm Stance: your pushes travel 1 cell further (Shove 2 → 3)", () => {
    const sim = createV1Sim({
      unit1: { x: 1, y: 1, z: 0 },
      unit2: { x: 2, y: 1, z: 0 },
      stance1: STANCE_ID_STORM,
      stance2: STANCE_ID_FLOW,
    });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_SHOVE,
      target: { x: 2, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual({
        type: "Push",
        unitId: UNIT_2,
        direction: "East",
        from: { x: 2, y: 1, z: 0 },
        to: { x: 5, y: 1, z: 0 },
      });
    }
  });

  it("Iron Stance: pushes against you are 2 cells shorter (Shove 2 → 0, no push)", () => {
    const sim = createV1Sim({
      unit1: { x: 1, y: 1, z: 0 },
      unit2: { x: 2, y: 1, z: 0 },
      stance1: STANCE_ID_FLOW,
      stance2: STANCE_ID_IRON,
    });
    const result = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_SHOVE,
      target: { x: 2, y: 1, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.some((event) => event.type === "Push")).toBe(false);
      expect(result.events.some((event) => event.type === "Collision")).toBe(false);
    }
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_2)?.position).toEqual({
      x: 2,
      y: 1,
      z: 0,
    });
  });

  it("Wet: pushes against a Wet unit travel 1 further; stacks with Storm (+2 total)", () => {
    const sim = createV1Sim({
      player1Class: CLASS_ID_TIDECALLER,
      unit1: { x: 1, y: 1, z: 0 },
      unit2: { x: 3, y: 1, z: 0 },
      stance1: STANCE_ID_STORM,
      stance2: STANCE_ID_FLOW,
    });
    const drench = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_DRENCH,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(drench.accepted).toBe(true);
    const jet = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_WATER_JET,
      target: { x: 3, y: 1, z: 0 },
    });
    expect(jet.accepted).toBe(true);
    if (jet.accepted) {
      // Water Jet pushes 1; Storm +1; Wet +1 → 3 cells.
      expect(jet.events).toContainEqual({
        type: "Push",
        unitId: UNIT_2,
        direction: "East",
        from: { x: 3, y: 1, z: 0 },
        to: { x: 6, y: 1, z: 0 },
      });
      expect(jet.events).toContainEqual({
        type: "Damage",
        targetUnitId: UNIT_2,
        amount: 15,
        element: "Water",
        sourceUnitId: UNIT_1,
        sourceSpellId: SPELL_ID_WATER_JET,
      });
    }
  });

  it("Ice applies Frozen, which forbids climbing even in Flow Stance", () => {
    // Walk onto ice, then try to climb the step beyond it.
    const iceMap = buildMap(
      [
        [0, 0, 1],
        [0, 0, 0],
        [0, 0, 0],
      ],
      [
        ["normal", "ice", "normal"],
        ["normal", "normal", "normal"],
        ["normal", "normal", "normal"],
      ],
    );
    const sim = createV1Sim({
      map: iceMap,
      unit1: { x: 0, y: 0, z: 0 },
      unit2: { x: 0, y: 2, z: 0 },
      stance1: STANCE_ID_FLOW,
      stance2: STANCE_ID_IRON,
    });

    const ontoIce = sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(ontoIce.accepted).toBe(true);
    if (ontoIce.accepted) {
      expect(ontoIce.events).toContainEqual({
        type: "ApplyState",
        stateId: STATE_ID_FROZEN,
        target: { kind: "Unit", unitId: UNIT_1 },
        duration: 1,
      });
    }

    expect(
      sim.handleIntent(PLAYER_1, {
        type: "Move",
        unitId: UNIT_1,
        path: [{ x: 2, y: 0, z: 1 }],
      }),
    ).toMatchObject({ accepted: false, rejection: { code: "ClimbBlocked" } });
  });

  it("Lava applies Burning, which deals 15 Fire damage at each round end", () => {
    const lavaMap = buildMap(
      [
        [0, 0],
        [0, 0],
      ],
      [
        ["normal", "lava"],
        ["normal", "normal"],
      ],
    );
    const sim = createV1Sim({
      map: lavaMap,
      unit1: { x: 0, y: 0, z: 0 },
      unit2: { x: 0, y: 1, z: 0 },
      stance1: STANCE_ID_IRON,
      stance2: STANCE_ID_IRON,
    });

    sim.handleIntent(PLAYER_1, { type: "Move", unitId: UNIT_1, path: [{ x: 1, y: 0, z: 0 }] });
    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    const roundEnd = sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });

    expect(roundEnd.accepted).toBe(true);
    if (roundEnd.accepted) {
      expect(roundEnd.events).toContainEqual({
        type: "Damage",
        targetUnitId: UNIT_1,
        amount: 15,
        element: "Fire",
        sourceUnitId: null,
        sourceSpellId: null,
      });
    }
    // Vanguard has 110 HP and Burning lasts 2 rounds, so it keeps ticking.
    expect(sim.getSnapshot().units.find((unit) => unit.id === UNIT_1)?.currentHealthPoints).toBe(
      95,
    );
  });

  it("Vegetation blocks line of sight at ground level, but not from high ground", () => {
    const coverTerrains = [
      ["normal", "vegetation", "normal"],
      ["normal", "normal", "normal"],
    ];
    const castAcrossCover = (casterHeight: number) => {
      const sim = createV1Sim({
        map: buildMap(
          [
            [casterHeight, 0, 0],
            [0, 0, 0],
          ],
          coverTerrains,
        ),
        unit1: { x: 0, y: 0, z: casterHeight },
        // A real target at the aimed cell, so this exercises line of sight
        // rather than the empty-tile rejection.
        unit2: { x: 2, y: 0, z: 0 },
        stance1: STANCE_ID_IRON,
        stance2: STANCE_ID_IRON,
      });
      // Ground Slam reaches 2 cells and needs line of sight.
      return sim.handleIntent(PLAYER_1, {
        type: "CastSpell",
        unitId: UNIT_1,
        spellId: SPELL_ID_GROUND_SLAM,
        target: { x: 2, y: 0, z: 0 },
      });
    };

    expect(castAcrossCover(0)).toMatchObject({
      accepted: false,
      rejection: { code: "NoLineOfSight" },
    });
    // From z2 the same vegetation is beneath the sightline.
    expect(castAcrossCover(2).accepted).toBe(true);
  });

  it("Flow Stance: climbing +1 z costs no extra MP", () => {
    const climbMap = buildMap([
      [0, 1],
      [0, 0],
      [0, 0],
    ]);
    const withFlow = createV1Sim({
      map: climbMap,
      unit1: { x: 0, y: 0, z: 0 },
      unit2: { x: 0, y: 2, z: 0 },
      stance1: STANCE_ID_FLOW,
      stance2: STANCE_ID_IRON,
    });
    expect(
      withFlow.handleIntent(PLAYER_1, {
        type: "Move",
        unitId: UNIT_1,
        path: [{ x: 1, y: 0, z: 1 }],
      }).accepted,
    ).toBe(true);
    // Vanguard has 3 MP; the climb step costs 1 instead of 2 under Flow.
    expect(
      withFlow.getSnapshot().units.find((unit) => unit.id === UNIT_1)?.currentMovementPoints,
    ).toBe(2);

    const withoutFlow = createV1Sim({
      map: climbMap,
      unit1: { x: 0, y: 0, z: 0 },
      unit2: { x: 0, y: 2, z: 0 },
      stance1: STANCE_ID_IRON,
      stance2: STANCE_ID_IRON,
    });
    expect(
      withoutFlow.handleIntent(PLAYER_1, {
        type: "Move",
        unitId: UNIT_1,
        path: [{ x: 1, y: 0, z: 1 }],
      }).accepted,
    ).toBe(true);
    expect(
      withoutFlow.getSnapshot().units.find((unit) => unit.id === UNIT_1)?.currentMovementPoints,
    ).toBe(1);
  });
});
