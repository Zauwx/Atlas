import { describe, expect, it } from "vitest";
import { depthOf, isInsideTopFace, isoX, isoY, pickCell, TILE_HEIGHT, Z_STEP } from "./iso.js";

describe("isometric projection", () => {
  it("projects the origin to (0, 0)", () => {
    expect(isoX(0, 0)).toBe(0);
    expect(isoY(0, 0, 0)).toBe(0);
  });

  it("raises cells by z", () => {
    expect(isoY(2, 3, 0) - isoY(2, 3, 2)).toBe(2 * Z_STEP);
  });

  it("orders depth back-to-front by (x + y), then z", () => {
    expect(depthOf(1, 1, 0)).toBeLessThan(depthOf(2, 1, 0));
    expect(depthOf(2, 1, 0)).toBeLessThan(depthOf(2, 1, 1));
  });

  it("detects points inside the diamond top face", () => {
    expect(isInsideTopFace(0, 0, 0, 0)).toBe(true);
    expect(isInsideTopFace(0, TILE_HEIGHT / 2, 0, 0)).toBe(true);
    expect(isInsideTopFace(40, 20, 0, 0)).toBe(false);
  });

  it("picks the frontmost cell when terraces overlap", () => {
    // A z2 terrace at (1,1) visually covers part of the flat cell behind it.
    const cells = [
      { x: 1, y: 1, z: 2 },
      { x: 0, y: 0, z: 0 },
    ];
    const picked = pickCell(cells, isoX(1, 1), isoY(1, 1, 2));
    expect(picked).toEqual({ x: 1, y: 1, z: 2 });
  });

  it("returns null when nothing is under the pointer", () => {
    expect(pickCell([{ x: 0, y: 0, z: 0 }], 500, 500)).toBeNull();
  });
});
