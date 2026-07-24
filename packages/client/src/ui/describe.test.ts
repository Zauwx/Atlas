import { describe, expect, it } from "vitest";
import {
  PlayerIdSchema,
  SPELL_ID_DRENCH,
  SPELL_ID_FLOOD,
  SPELL_ID_SHOVE,
  SPELL_ID_WATER_JET,
  STANCE_ID_IRON,
  STANCE_ID_STORM,
  STATE_ID_WET,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import {
  describeActiveStates,
  describeRevealedStances,
  describeSpell,
  describeSpellEffects,
} from "./describe.js";

const spellById = (id: string) => {
  const spell = V1_GAME_CONFIG.spells.find((candidate) => candidate.id === id);
  if (spell === undefined) {
    throw new Error(`missing spell ${id}`);
  }
  return spell;
};

describe("spell descriptions (built from configuration, never hardcoded)", () => {
  it("describes damage plus push", () => {
    expect(describeSpellEffects(spellById(SPELL_ID_WATER_JET), V1_GAME_CONFIG)).toBe(
      "15 Water damage, push 1",
    );
  });

  it("resolves state and terrain ids to their display names", () => {
    expect(describeSpellEffects(spellById(SPELL_ID_DRENCH), V1_GAME_CONFIG)).toBe(
      "applies Wet for 2 rounds",
    );
    expect(describeSpellEffects(spellById(SPELL_ID_FLOOD), V1_GAME_CONFIG)).toBe(
      "turns the cell into Water",
    );
  });

  it("states cost, range, and line-of-sight requirement", () => {
    expect(describeSpell(spellById(SPELL_ID_WATER_JET), V1_GAME_CONFIG)).toBe(
      "Water Jet — 3 AP · range 1-4 · line of sight · 15 Water damage, push 1",
    );
  });

  it("collapses equal min and max range, and flags no-line-of-sight spells", () => {
    expect(describeSpell(spellById(SPELL_ID_SHOVE), V1_GAME_CONFIG)).toBe(
      "Shove — 2 AP · range 1 · line of sight · push 2",
    );
    expect(describeSpell(spellById(SPELL_ID_DRENCH), V1_GAME_CONFIG)).toContain(
      "no line of sight needed",
    );
  });

  it("explains every V1 spell without falling back to a raw id", () => {
    for (const spell of V1_GAME_CONFIG.spells) {
      const text = describeSpell(spell, V1_GAME_CONFIG);
      expect(text).toContain(spell.name);
      expect(text).not.toContain("undefined");
    }
  });
});

describe("active states", () => {
  it("names each state, its remaining duration, and what it does", () => {
    const lines = describeActiveStates(
      [{ stateId: STATE_ID_WET, remainingDuration: 2 }],
      V1_GAME_CONFIG,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Wet (2)");
    // The interaction a player must know before walking into lava.
    expect(lines[0]).toContain("fire");
  });

  it("returns nothing when the unit has no states", () => {
    expect(describeActiveStates([], V1_GAME_CONFIG)).toEqual([]);
  });
});

describe("revealed stances (rulebook: Visibility after reveal)", () => {
  const me = PlayerIdSchema.parse("p1");
  const them = PlayerIdSchema.parse("p2");

  it("shows nothing before the reveal, so the secret choice never leaks", () => {
    expect(
      describeRevealedStances(
        [
          { playerId: me, revealedStanceId: null },
          { playerId: them, revealedStanceId: null },
        ],
        me,
        V1_GAME_CONFIG,
      ),
    ).toBe("");
  });

  it("names both stances by their display name once revealed", () => {
    expect(
      describeRevealedStances(
        [
          { playerId: me, revealedStanceId: STANCE_ID_STORM },
          { playerId: them, revealedStanceId: STANCE_ID_IRON },
        ],
        me,
        V1_GAME_CONFIG,
      ),
    ).toBe("Stances — You: Storm Stance · Opponent: Iron Stance");
  });

  it("reports one side alone when only that side has revealed", () => {
    expect(
      describeRevealedStances(
        [
          { playerId: me, revealedStanceId: null },
          { playerId: them, revealedStanceId: STANCE_ID_IRON },
        ],
        me,
        V1_GAME_CONFIG,
      ),
    ).toBe("Stances — Opponent: Iron Stance");
  });

  it("lists each opposing player once, not once per unit", () => {
    expect(
      describeRevealedStances(
        [
          { playerId: them, revealedStanceId: STANCE_ID_IRON },
          { playerId: them, revealedStanceId: STANCE_ID_IRON },
        ],
        me,
        V1_GAME_CONFIG,
      ),
    ).toBe("Stances — Opponent: Iron Stance");
  });
});
