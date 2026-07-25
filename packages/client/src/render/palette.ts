/**
 * Procedural art palette — no external assets. Every terrain and unit is
 * drawn from these colors (see match-scene rendering). Terrain colors are
 * looked up by id with a neutral fallback, so a new configured terrain
 * still renders.
 */

const TERRAIN_COLORS: Readonly<Record<string, number>> = {
  normal: 0x7c9668,
  water: 0x2f6fb0,
  ice: 0x9fd4e6,
  vegetation: 0x3a6b34,
  earth: 0x936846,
  lava: 0xd0552a,
  void: 0x0b0d14,
};

const FALLBACK_TERRAIN_COLOR = 0x777777;

export function colorForTerrain(terrainId: string): number {
  return TERRAIN_COLORS[terrainId] ?? FALLBACK_TERRAIN_COLOR;
}

/** Team colors: index 0 is always "me" (blue), 1 is the opponent (red). */
const PLAYER_COLORS: readonly number[] = [0x4e8cff, 0xff5e5e, 0xffc94e, 0x8cff4e];
const FALLBACK_PLAYER_COLOR = 0xcccccc;

export function colorForPlayer(playerIndex: number): number {
  return PLAYER_COLORS[playerIndex] ?? FALLBACK_PLAYER_COLOR;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Scales a 0xRRGGBB color's brightness, clamped per channel — so factors
 * above 1 lighten and below 1 darken without byte overflow.
 */
export function shade(color: number, factor: number): number {
  const r = clampChannel(((color >> 16) & 0xff) * factor);
  const g = clampChannel(((color >> 8) & 0xff) * factor);
  const b = clampChannel((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
