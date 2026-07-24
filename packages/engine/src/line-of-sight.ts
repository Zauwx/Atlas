import type { CellCoord } from "@atlas/shared";
import type { MatchState } from "./match-state.js";
import { cellAt } from "./board.js";

/**
 * Line of sight — COMBAT_RULEBOOK.md "Line of Sight" (max-endpoint rule):
 * trace the segment between cell centers on (x, y); every touched cell
 * except the endpoints is crossed (corner-grazing crosses BOTH adjacent
 * cells); a crossed cell blocks if z ≥ max(source z, target z) + 1.
 * Units do not block.
 */

/** Integer supercover traversal. Returns crossed (x, y) cells, endpoints excluded. */
export function supercoverCrossedCells(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const crossed: { x: number; y: number }[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = Math.sign(dx);
  const signY = Math.sign(dy);

  let x = from.x;
  let y = from.y;
  let ix = 0;
  let iy = 0;

  const pushUnlessEndpoint = (cx: number, cy: number): void => {
    const isFrom = cx === from.x && cy === from.y;
    const isTo = cx === to.x && cy === to.y;
    if (!isFrom && !isTo) {
      crossed.push({ x: cx, y: cy });
    }
  };

  while (ix < nx || iy < ny) {
    // Compare the fractional progress of the next x-step vs. the next
    // y-step: (ix + 0.5) / nx vs (iy + 0.5) / ny, in integer arithmetic.
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // Exact corner: both adjacent cells are crossed (rulebook: no
      // diagonal peeking), then the segment continues diagonally.
      pushUnlessEndpoint(x + signX, y);
      pushUnlessEndpoint(x, y + signY);
      x += signX;
      y += signY;
      ix += 1;
      iy += 1;
    } else if (decision < 0) {
      x += signX;
      ix += 1;
    } else {
      y += signY;
      iy += 1;
    }
    pushUnlessEndpoint(x, y);
  }

  return crossed;
}

export function hasLineOfSight(state: MatchState, from: CellCoord, to: CellCoord): boolean {
  const blockingHeight = Math.max(from.z, to.z) + 1;
  for (const crossed of supercoverCrossedCells(from, to)) {
    if (cellAt(state, crossed.x, crossed.y).z >= blockingHeight) {
      return false;
    }
  }
  return true;
}
