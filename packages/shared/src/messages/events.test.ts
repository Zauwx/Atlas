import { describe, expect, it } from "vitest";

import { GameEventSchema, GameEventTypeSchema } from "./events.js";

describe("GameEventSchema (rulebook: Event Journal)", () => {
  it("covers the full rulebook vocabulary (11 combat + 4 flow events)", () => {
    expect(GameEventTypeSchema.options).toHaveLength(15);
  });

  it("parses a valid Damage event", () => {
    const result = GameEventSchema.safeParse({
      type: "Damage",
      targetUnitId: "unit-2",
      amount: 10,
      element: "Fire",
      sourceUnitId: "unit-1",
      sourceSpellId: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses an ApplyState event targeting a cell", () => {
    const result = GameEventSchema.safeParse({
      type: "ApplyState",
      stateId: "wet",
      target: { kind: "Cell", coord: { x: 2, y: 3, z: 1 } },
      duration: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a Damage event with an element outside the rulebook set", () => {
    const result = GameEventSchema.safeParse({
      type: "Damage",
      targetUnitId: "unit-2",
      amount: 10,
      element: "Shadow",
      sourceUnitId: null,
      sourceSpellId: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative damage", () => {
    const result = GameEventSchema.safeParse({
      type: "Damage",
      targetUnitId: "unit-2",
      amount: -5,
      element: "Physical",
      sourceUnitId: null,
      sourceSpellId: null,
    });
    expect(result.success).toBe(false);
  });
});
