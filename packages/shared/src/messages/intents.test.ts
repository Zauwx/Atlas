import { describe, expect, it } from "vitest";

import { PlayerIntentSchema } from "./intents.js";

describe("PlayerIntentSchema (intents in, events out)", () => {
  it("parses a valid Move intent", () => {
    const result = PlayerIntentSchema.safeParse({
      type: "Move",
      unitId: "unit-1",
      path: [{ x: 1, y: 0, z: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("parses a valid ChooseStance intent", () => {
    const result = PlayerIntentSchema.safeParse({
      type: "ChooseStance",
      stanceId: "stance-guard",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown intent type", () => {
    const result = PlayerIntentSchema.safeParse({ type: "Teleport", unitId: "unit-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a Move intent with an empty path", () => {
    const result = PlayerIntentSchema.safeParse({ type: "Move", unitId: "unit-1", path: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a CastSpell intent without a target", () => {
    const result = PlayerIntentSchema.safeParse({
      type: "CastSpell",
      unitId: "unit-1",
      spellId: "spell-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects intents carrying outcomes (unknown keys stripped, results impossible)", () => {
    // Zod strips unknown keys by default: even if a malicious client attaches
    // computed results, they never survive parsing.
    const result = PlayerIntentSchema.parse({
      type: "EndTurn",
      unitId: "unit-1",
      damageDealt: 999,
    });
    expect(result).toEqual({ type: "EndTurn", unitId: "unit-1" });
  });
});
