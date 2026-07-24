import { describe, expect, it } from "vitest";

import { CellCoordSchema, Z_MAX, Z_MIN } from "./coordinates.js";

describe("CellCoordSchema (rulebook: Board & Coordinates)", () => {
  it("accepts coordinates within bounds", () => {
    expect(CellCoordSchema.safeParse({ x: 0, y: 0, z: Z_MIN }).success).toBe(true);
    expect(CellCoordSchema.safeParse({ x: 10, y: 3, z: Z_MAX }).success).toBe(true);
  });

  it("rejects z above the rulebook maximum of 5", () => {
    expect(CellCoordSchema.safeParse({ x: 0, y: 0, z: Z_MAX + 1 }).success).toBe(false);
  });

  it("rejects negative and non-integer coordinates", () => {
    expect(CellCoordSchema.safeParse({ x: -1, y: 0, z: 0 }).success).toBe(false);
    expect(CellCoordSchema.safeParse({ x: 0.5, y: 0, z: 0 }).success).toBe(false);
    expect(CellCoordSchema.safeParse({ x: 0, y: 0, z: -1 }).success).toBe(false);
  });
});
