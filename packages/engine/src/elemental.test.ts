import { describe, expect, it } from "vitest";
import {
  CLASS_ID_VANGUARD,
  SPELL_ID_DRENCH,
  STANCE_ID_IRON,
  STATE_ID_BURNING,
  STATE_ID_FROZEN,
  STATE_ID_WET,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import type { GameConfig, MapConfig } from "@atlas/shared";
import { SpellIdSchema } from "@atlas/shared";
import { MatchSimulation } from "./simulation.js";
import { createV1RuleRegistry } from "./content/v1-rule-hooks.js";
import { buildMap, MATCH_ID, PLAYER_1, PLAYER_2, UNIT_1, UNIT_2 } from "./test-support/fixtures.js";

/**
 * The elemental interaction table, exercised through real matches
 * (COMBAT_RULEBOOK.md "Elemental Interactions").
 */

const TEST_SHOCK = SpellIdSchema.parse("test-shock");

function simOn(map: MapConfig, config: GameConfig = V1_GAME_CONFIG): MatchSimulation {
  const sim = new MatchSimulation(
    MATCH_ID,
    config,
    {
      map,
      players: [
        {
          id: PLAYER_1,
          units: [{ id: UNIT_1, classId: CLASS_ID_VANGUARD, position: { x: 0, y: 0, z: 0 } }],
        },
        {
          id: PLAYER_2,
          units: [{ id: UNIT_2, classId: CLASS_ID_VANGUARD, position: { x: 0, y: 2, z: 0 } }],
        },
      ],
    },
    createV1RuleRegistry(),
  );
  sim.handleIntent(PLAYER_1, { type: "ChooseStance", stanceId: STANCE_ID_IRON });
  sim.handleIntent(PLAYER_2, { type: "ChooseStance", stanceId: STANCE_ID_IRON });
  return sim;
}

const statesOf = (sim: MatchSimulation, unitId: string) =>
  sim
    .getSnapshot()
    .units.find((unit) => unit.id === unitId)
    ?.states.map((instance) => instance.stateId) ?? [];

describe("Wet quenches Burning", () => {
  // Water then lava, side by side, so a unit can walk through both.
  const waterThenLava = buildMap(
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      ["normal", "water", "lava"],
      ["normal", "normal", "normal"],
      ["normal", "normal", "normal"],
    ],
  );

  it("protects a Wet unit entering Lava, consuming the Wet", () => {
    const sim = simOn(waterThenLava);
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
      // Wet is applied by the water, then spent stopping the fire.
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: STATE_ID_WET,
        target: { kind: "Unit", unitId: UNIT_1 },
        duration: 1,
      });
      expect(result.events).toContainEqual({
        type: "RemoveState",
        stateId: STATE_ID_WET,
        target: { kind: "Unit", unitId: UNIT_1 },
      });
      // No Burning is ever applied.
      expect(
        result.events.some(
          (event) => event.type === "ApplyState" && event.stateId === STATE_ID_BURNING,
        ),
      ).toBe(false);
    }
    expect(statesOf(sim, UNIT_1)).toEqual([]);
  });

  it("does not protect a dry unit, which catches fire normally", () => {
    const lavaOnly = buildMap(
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      [
        ["normal", "lava"],
        ["normal", "normal"],
        ["normal", "normal"],
      ],
    );
    const sim = simOn(lavaOnly);
    sim.handleIntent(PLAYER_1, { type: "Move", unitId: UNIT_1, path: [{ x: 1, y: 0, z: 0 }] });
    expect(statesOf(sim, UNIT_1)).toContain(STATE_ID_BURNING);
  });

  it("protects only once: the water is gone for the next lava cell", () => {
    const waterThenTwoLava = buildMap(
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [
        ["normal", "water", "lava", "lava"],
        ["normal", "normal", "normal", "normal"],
        ["normal", "normal", "normal", "normal"],
      ],
    );
    const sim = simOn(waterThenTwoLava);
    sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
    });
    // First lava cell spends the Wet; the second one ignites.
    expect(statesOf(sim, UNIT_1)).toContain(STATE_ID_BURNING);
    expect(statesOf(sim, UNIT_1)).not.toContain(STATE_ID_WET);
  });
});

describe("Fire thaws Frozen", () => {
  it("strips Frozen when Burning damage lands at end of round", () => {
    // Ice then lava: the unit ends the round Frozen and Burning.
    const iceThenLava = buildMap(
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      [
        ["normal", "ice", "lava"],
        ["normal", "normal", "normal"],
        ["normal", "normal", "normal"],
      ],
    );
    const sim = simOn(iceThenLava);
    sim.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
    });
    expect(statesOf(sim, UNIT_1)).toEqual(
      expect.arrayContaining([STATE_ID_FROZEN, STATE_ID_BURNING]),
    );

    sim.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });
    const roundEnd = sim.handleIntent(PLAYER_2, { type: "EndTurn", unitId: UNIT_2 });

    expect(roundEnd.accepted).toBe(true);
    if (roundEnd.accepted) {
      expect(roundEnd.events).toContainEqual({
        type: "RemoveState",
        stateId: STATE_ID_FROZEN,
        target: { kind: "Unit", unitId: UNIT_1 },
      });
    }
    expect(statesOf(sim, UNIT_1)).not.toContain(STATE_ID_FROZEN);
  });
});

describe("Lightning conducts through Wet", () => {
  it("adds the table's bonus to the damage that lands", () => {
    // V1 has no Lightning spell yet, so give the test one via config.
    const shockConfig: GameConfig = {
      ...V1_GAME_CONFIG,
      classes: V1_GAME_CONFIG.classes.map((gameClass) =>
        gameClass.id === CLASS_ID_VANGUARD
          ? { ...gameClass, spellIds: [...gameClass.spellIds, SPELL_ID_DRENCH, TEST_SHOCK] }
          : gameClass,
      ),
      spells: [
        ...V1_GAME_CONFIG.spells,
        {
          id: TEST_SHOCK,
          name: "Test Shock",
          description: "Test-only Lightning damage.",
          element: "Lightning",
          actionPointCost: 1,
          minRange: 1,
          maxRange: 3,
          requiresLineOfSight: true,
          effects: [{ kind: "Damage", element: "Lightning", amount: 10 }],
        },
      ],
    };
    const flat = buildMap([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const sim = simOn(flat, shockConfig);

    const dry = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: TEST_SHOCK,
      target: { x: 0, y: 2, z: 0 },
    });
    expect(dry.accepted).toBe(true);
    if (dry.accepted) {
      expect(dry.events).toContainEqual(
        expect.objectContaining({ type: "Damage", amount: 10, element: "Lightning" }),
      );
    }

    sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_DRENCH,
      target: { x: 0, y: 2, z: 0 },
    });
    const wet = sim.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: TEST_SHOCK,
      target: { x: 0, y: 2, z: 0 },
    });
    expect(wet.accepted).toBe(true);
    if (wet.accepted) {
      // 10 base + 10 from the table.
      expect(wet.events).toContainEqual(
        expect.objectContaining({ type: "Damage", amount: 20, element: "Lightning" }),
      );
    }
  });
});
