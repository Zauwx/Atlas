import { describe, expect, it } from "vitest";
import type { CellCoord, ClassId, MapConfig, MatchSetup, StanceId } from "@atlas/shared";
import {
  CLASS_ID_TIDECALLER,
  CLASS_ID_VANGUARD,
  SPELL_ID_ARC,
  SPELL_ID_BASH,
  SPELL_ID_BULWARK,
  SPELL_ID_DRENCH,
  SPELL_ID_WATER_JET,
  STANCE_ID_IRON,
  STATE_ID_ELECTRIFIED,
  STATE_ID_ROOTED,
  STATE_ID_SHIELDED,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { MatchSimulation } from "../simulation.js";
import { createV1RuleRegistry } from "./v1-rule-hooks.js";
import {
  buildMap,
  MATCH_ID,
  PLAYER_1,
  PLAYER_2,
  UNIT_1,
  UNIT_2,
} from "../test-support/fixtures.js";

/**
 * The three states completed in this change — COMBAT_RULEBOOK.md
 * "Defined state effects (V1)": Rooted, Electrified, Shielded. Driven
 * through real matches so the rules, delivery, and hooks are all exercised.
 */

function sim(options: {
  map: MapConfig;
  p1Class: ClassId;
  p2Class: ClassId;
  p1: CellCoord;
  p2: CellCoord;
  stance1?: StanceId;
  stance2?: StanceId;
}): MatchSimulation {
  const setup: MatchSetup = {
    map: options.map,
    players: [
      { id: PLAYER_1, units: [{ id: UNIT_1, classId: options.p1Class, position: options.p1 }] },
      { id: PLAYER_2, units: [{ id: UNIT_2, classId: options.p2Class, position: options.p2 }] },
    ],
  };
  const match = new MatchSimulation(MATCH_ID, V1_GAME_CONFIG, setup, createV1RuleRegistry());
  match.handleIntent(PLAYER_1, {
    type: "ChooseStance",
    stanceId: options.stance1 ?? STANCE_ID_IRON,
  });
  match.handleIntent(PLAYER_2, {
    type: "ChooseStance",
    stanceId: options.stance2 ?? STANCE_ID_IRON,
  });
  return match;
}

const statesOf = (match: MatchSimulation, unitId: string) =>
  match
    .getSnapshot()
    .units.find((unit) => unit.id === unitId)
    ?.states.map((state) => state.stateId) ?? [];

const hpOf = (match: MatchSimulation, unitId: string) =>
  match.getSnapshot().units.find((unit) => unit.id === unitId)?.currentHealthPoints;

describe("Rooted (Earth terrain)", () => {
  const earthMap = buildMap(
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      ["normal", "earth", "normal"],
      ["normal", "normal", "normal"],
    ],
  );

  it("Earth applies Rooted, which then refuses further voluntary movement", () => {
    const match = sim({
      map: earthMap,
      p1Class: CLASS_ID_VANGUARD,
      p2Class: CLASS_ID_VANGUARD,
      p1: { x: 0, y: 0, z: 0 },
      p2: { x: 0, y: 1, z: 0 },
    });

    const ontoEarth = match.handleIntent(PLAYER_1, {
      type: "Move",
      unitId: UNIT_1,
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(ontoEarth.accepted).toBe(true);
    if (ontoEarth.accepted) {
      expect(ontoEarth.events).toContainEqual({
        type: "ApplyState",
        stateId: STATE_ID_ROOTED,
        target: { kind: "Unit", unitId: UNIT_1 },
        duration: 1,
      });
    }
    expect(statesOf(match, UNIT_1)).toContain(STATE_ID_ROOTED);

    expect(
      match.handleIntent(PLAYER_1, { type: "Move", unitId: UNIT_1, path: [{ x: 2, y: 0, z: 0 }] }),
    ).toMatchObject({ accepted: false, rejection: { code: "MovementBlocked" } });
  });

  it("still lets a Rooted unit cast", () => {
    const match = sim({
      map: earthMap,
      p1Class: CLASS_ID_VANGUARD,
      p2Class: CLASS_ID_VANGUARD,
      p1: { x: 0, y: 0, z: 0 },
      p2: { x: 0, y: 1, z: 0 },
    });
    match.handleIntent(PLAYER_1, { type: "Move", unitId: UNIT_1, path: [{ x: 1, y: 0, z: 0 }] });
    // Bulwark is a self-cast, so it needs no target in range.
    expect(
      match.handleIntent(PLAYER_1, {
        type: "CastSpell",
        unitId: UNIT_1,
        spellId: SPELL_ID_BULWARK,
        target: { x: 1, y: 0, z: 0 },
      }).accepted,
    ).toBe(true);
  });
});

describe("Electrified (Tidecaller's Arc)", () => {
  const flat = buildMap([
    [0, 0, 0],
    [0, 0, 0],
  ]);

  function arcMatch(): MatchSimulation {
    return sim({
      map: flat,
      p1Class: CLASS_ID_TIDECALLER,
      p2Class: CLASS_ID_VANGUARD,
      p1: { x: 0, y: 0, z: 0 },
      p2: { x: 2, y: 0, z: 0 },
    });
  }

  it("Arc deals Lightning damage and applies Electrified", () => {
    const match = arcMatch();
    const result = match.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_ARC,
      target: { x: 2, y: 0, z: 0 },
    });
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: "Damage",
          targetUnitId: UNIT_2,
          amount: 10,
          element: "Lightning",
        }),
      );
      expect(result.events).toContainEqual({
        type: "ApplyState",
        stateId: STATE_ID_ELECTRIFIED,
        target: { kind: "Unit", unitId: UNIT_2 },
        duration: 2,
      });
    }
  });

  it("locks the Electrified unit out of casting, but not out of moving", () => {
    const match = arcMatch();
    match.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_ARC,
      target: { x: 2, y: 0, z: 0 },
    });
    match.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });

    // The Vanguard's turn: casting is refused, moving is allowed.
    expect(
      match.handleIntent(PLAYER_2, {
        type: "CastSpell",
        unitId: UNIT_2,
        spellId: SPELL_ID_BASH,
        target: { x: 2, y: 1, z: 0 },
      }),
    ).toMatchObject({ accepted: false, rejection: { code: "CastBlocked" } });
    expect(
      match.handleIntent(PLAYER_2, { type: "Move", unitId: UNIT_2, path: [{ x: 2, y: 1, z: 0 }] })
        .accepted,
    ).toBe(true);
  });

  it("Arc hits a Wet target harder — the Wet+Lightning interaction is now live", () => {
    const match = arcMatch();
    match.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_DRENCH,
      target: { x: 2, y: 0, z: 0 },
    });
    const arc = match.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_ARC,
      target: { x: 2, y: 0, z: 0 },
    });
    expect(arc.accepted).toBe(true);
    if (arc.accepted) {
      // 10 base + 10 conductive bonus.
      expect(arc.events).toContainEqual(
        expect.objectContaining({
          type: "Damage",
          targetUnitId: UNIT_2,
          amount: 20,
          element: "Lightning",
        }),
      );
    }
  });
});

describe("Shielded (Vanguard's Bulwark)", () => {
  const flat = buildMap([
    [0, 0, 0],
    [0, 0, 0],
  ]);

  it("absorbs the next spell and is then spent", () => {
    const match = sim({
      map: flat,
      p1Class: CLASS_ID_VANGUARD,
      p2Class: CLASS_ID_TIDECALLER,
      p1: { x: 0, y: 0, z: 0 },
      p2: { x: 2, y: 0, z: 0 },
    });

    const bulwark = match.handleIntent(PLAYER_1, {
      type: "CastSpell",
      unitId: UNIT_1,
      spellId: SPELL_ID_BULWARK,
      target: { x: 0, y: 0, z: 0 },
    });
    expect(bulwark.accepted).toBe(true);
    expect(statesOf(match, UNIT_1)).toContain(STATE_ID_SHIELDED);
    match.handleIntent(PLAYER_1, { type: "EndTurn", unitId: UNIT_1 });

    const startingHp = hpOf(match, UNIT_1);
    // Water Jet is 15 damage; the 20-point shield eats all of it and fades.
    const firstHit = match.handleIntent(PLAYER_2, {
      type: "CastSpell",
      unitId: UNIT_2,
      spellId: SPELL_ID_WATER_JET,
      target: { x: 0, y: 0, z: 0 },
    });
    expect(firstHit.accepted).toBe(true);
    if (firstHit.accepted) {
      expect(firstHit.events).toContainEqual(
        expect.objectContaining({ type: "Damage", targetUnitId: UNIT_1, amount: 0 }),
      );
      expect(firstHit.events).toContainEqual({
        type: "RemoveState",
        stateId: STATE_ID_SHIELDED,
        target: { kind: "Unit", unitId: UNIT_1 },
      });
    }
    expect(hpOf(match, UNIT_1)).toBe(startingHp);
    expect(statesOf(match, UNIT_1)).not.toContain(STATE_ID_SHIELDED);

    // The Water Jet knocked the target back a cell; re-aim and hit again.
    const target = match.getSnapshot().units.find((unit) => unit.id === UNIT_1)?.position;
    if (target === undefined) {
      throw new Error("missing unit");
    }
    const secondHit = match.handleIntent(PLAYER_2, {
      type: "CastSpell",
      unitId: UNIT_2,
      spellId: SPELL_ID_WATER_JET,
      target,
    });
    expect(secondHit.accepted).toBe(true);
    if (secondHit.accepted) {
      // No shield left: full 15 lands.
      expect(secondHit.events).toContainEqual(
        expect.objectContaining({ type: "Damage", targetUnitId: UNIT_1, amount: 15 }),
      );
    }
  });
});
