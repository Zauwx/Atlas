import { describe, expect, it } from "vitest";
import {
  SPELL_ID_DRENCH,
  SPELL_ID_FLOOD,
  SPELL_ID_SHOVE,
  SPELL_ID_WATER_JET,
  V1_GAME_CONFIG,
} from "@atlas/shared";
import { describeSpell, describeSpellEffects } from "./describe.js";

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
