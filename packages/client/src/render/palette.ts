/**
 * Placeholder palette — no art assets exist yet; every terrain and player
 * is a flat color. Terrain colors are looked up by terrain id string with
 * a neutral fallback, so new configured terrains render without code
 * changes.
 */

const TERRAIN_COLORS: Readonly<Record<string, number>> = {
  normal: 0x8a9a7b,
  water: 0x3d6fb4,
  ice: 0xa8d8e8,
  vegetation: 0x2f5d2a,
  earth: 0x8a6a4a,
  lava: 0xc4502a,
  void: 0x14141c,
};

const FALLBACK_TERRAIN_COLOR = 0x777777;

export function colorForTerrain(terrainId: string): number {
  return TERRAIN_COLORS[terrainId] ?? FALLBACK_TERRAIN_COLOR;
}

const PLAYER_COLORS: readonly number[] = [0x4e8cff, 0xff5e5e, 0xffc94e, 0x8cff4e];
const FALLBACK_PLAYER_COLOR = 0xcccccc;

export function colorForPlayer(playerIndex: number): number {
  return PLAYER_COLORS[playerIndex] ?? FALLBACK_PLAYER_COLOR;
}

/** Darkens a 0xRRGGBB color; used for terrace side faces. */
export function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
