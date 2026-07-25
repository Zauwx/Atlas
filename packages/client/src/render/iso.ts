/**
 * Isometric projection — ARCHITECTURE.md "Client Rendering Decisions".
 * Pure math, no Phaser: cell (x, y, z) → screen pixels, depth ordering,
 * and pointer picking. Fully unit-tested.
 */

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
/**
 * Vertical pixels per z level. Set to the on-screen height of one stacked
 * Kenney cube so sprite terraces and everything positioned by isoY (units,
 * markers) rise together by exactly one block per level.
 */
export const Z_STEP = 37;

/** Native Kenney "Isometric Blocks" voxel cube size, in pixels. */
export const CUBE_NATIVE_WIDTH = 111;
export const CUBE_NATIVE_HEIGHT = 128;
/** Scale that makes a cube's top diamond exactly TILE_WIDTH × TILE_HEIGHT. */
export const CUBE_SCALE = TILE_WIDTH / CUBE_NATIVE_WIDTH;

export function isoX(x: number, y: number): number {
  return ((x - y) * TILE_WIDTH) / 2;
}

export function isoY(x: number, y: number, z: number): number {
  return ((x + y) * TILE_HEIGHT) / 2 - z * Z_STEP;
}

/** Painter's order: back-to-front by (x + y), then by height. */
export function depthOf(x: number, y: number, z: number): number {
  return (x + y) * 16 + z;
}

/** True if a screen point lies inside the diamond top face of a cell. */
export function isInsideTopFace(
  pointX: number,
  pointY: number,
  cellCenterX: number,
  cellCenterY: number,
): boolean {
  const dx = Math.abs(pointX - cellCenterX) / (TILE_WIDTH / 2);
  const dy = Math.abs(pointY - cellCenterY) / (TILE_HEIGHT / 2);
  return dx + dy <= 1;
}

export interface PickableCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Picks the cell whose top face contains the point, preferring the one
 * drawn last (highest depth) when terraces overlap. Deterministic.
 */
export function pickCell<T extends PickableCell>(
  cells: readonly T[],
  pointX: number,
  pointY: number,
): T | null {
  let best: T | null = null;
  for (const cell of cells) {
    const centerX = isoX(cell.x, cell.y);
    const centerY = isoY(cell.x, cell.y, cell.z);
    if (!isInsideTopFace(pointX, pointY, centerX, centerY)) {
      continue;
    }
    if (best === null || depthOf(cell.x, cell.y, cell.z) > depthOf(best.x, best.y, best.z)) {
      best = cell;
    }
  }
  return best;
}
