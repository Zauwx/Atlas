import type { GameConfig, SpellConfig, StateId, TerrainId } from "@atlas/shared";

/**
 * Turns configuration into player-readable text — GAME_DESIGN.md
 * "Design Principles": important information must be visible, and the
 * player must always understand why they won or lost.
 *
 * Pure string building, so it is unit-tested and stays correct as content
 * is added: nothing here is hardcoded per spell.
 */

function nameOfState(config: GameConfig, stateId: StateId): string {
  return config.states.find((state) => state.id === stateId)?.name ?? stateId;
}

function nameOfTerrain(config: GameConfig, terrainId: TerrainId): string {
  return config.terrains.find((terrain) => terrain.id === terrainId)?.name ?? terrainId;
}

/** e.g. "15 Water damage, push 1" */
export function describeSpellEffects(spell: SpellConfig, config: GameConfig): string {
  const parts = spell.effects.map((effect) => {
    switch (effect.kind) {
      case "Damage":
        return `${String(effect.amount)} ${effect.element} damage`;
      case "Heal":
        return `heals ${String(effect.amount)}`;
      case "Push":
        return `push ${String(effect.distance)}`;
      case "ApplyState":
        return `applies ${nameOfState(config, effect.stateId)} for ${String(effect.duration)} rounds`;
      case "TransformTerrain":
        return `turns the cell into ${nameOfTerrain(config, effect.toTerrainId)}`;
    }
  });
  return parts.join(", ");
}

/** e.g. "Water Jet — 3 AP · range 1-4 · line of sight · 15 Water damage, push 1" */
export function describeSpell(spell: SpellConfig, config: GameConfig): string {
  const range =
    spell.minRange === spell.maxRange
      ? `range ${String(spell.maxRange)}`
      : `range ${String(spell.minRange)}-${String(spell.maxRange)}`;
  const segments = [
    spell.name,
    `${String(spell.actionPointCost)} AP`,
    range,
    spell.requiresLineOfSight ? "line of sight" : "no line of sight needed",
    describeSpellEffects(spell, config),
  ];
  return `${segments[0] ?? ""} — ${segments.slice(1).join(" · ")}`;
}
