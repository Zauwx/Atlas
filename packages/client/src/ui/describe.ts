import type {
  GameConfig,
  PlayerId,
  SpellConfig,
  StanceId,
  StateId,
  TerrainId,
} from "@atlas/shared";

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

export interface RevealedStanceHolder {
  readonly playerId: PlayerId;
  readonly revealedStanceId: StanceId | null;
}

/**
 * Revealed stances for the current round — COMBAT_RULEBOOK.md "Visibility
 * after reveal": once revealed, a stance stays visible for the rest of the
 * round. Empty string before the reveal, so nothing leaks during the
 * secret selection.
 */
export function describeRevealedStances(
  holders: readonly RevealedStanceHolder[],
  myPlayerId: PlayerId,
  config: GameConfig,
): string {
  const nameOfStance = (stanceId: StanceId): string =>
    config.stances.find((stance) => stance.id === stanceId)?.name ?? stanceId;

  let mine: string | null = null;
  const opponents = new Map<PlayerId, string>();
  for (const holder of holders) {
    if (holder.revealedStanceId === null) {
      continue;
    }
    if (holder.playerId === myPlayerId) {
      mine ??= nameOfStance(holder.revealedStanceId);
    } else if (!opponents.has(holder.playerId)) {
      opponents.set(holder.playerId, nameOfStance(holder.revealedStanceId));
    }
  }

  const segments: string[] = [];
  if (mine !== null) {
    segments.push(`You: ${mine}`);
  }
  if (opponents.size > 0) {
    segments.push(`Opponent: ${[...opponents.values()].join(", ")}`);
  }
  return segments.length === 0 ? "" : `Stances — ${segments.join(" · ")}`;
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
