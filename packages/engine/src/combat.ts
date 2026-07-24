import type { Element, GameEvent, SpellId, UnitId } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";

/**
 * Spell damage and heal application — pipeline steps 11–12
 * (COMBAT_RULEBOOK.md "Resolution Pipeline"). Physics damage (collisions,
 * falls) is carried by its own events and does not pass through here
 * (rulebook Edge Cases: "Physics damage events").
 */

export function applySpellDamage(
  state: MatchState,
  target: UnitRuntime,
  amount: number,
  element: Element,
  sourceUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  void state;
  target.currentHealthPoints -= amount;
  events.push({
    type: "Damage",
    targetUnitId: target.id,
    amount,
    element,
    sourceUnitId,
    sourceSpellId,
  });
}

export function applyHeal(
  state: MatchState,
  target: UnitRuntime,
  amount: number,
  sourceUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  void state;
  const healed = Math.min(target.maxHealthPoints, target.currentHealthPoints + amount);
  const actualAmount = Math.max(0, healed - target.currentHealthPoints);
  target.currentHealthPoints = healed;
  events.push({
    type: "Heal",
    targetUnitId: target.id,
    amount: actualAmount,
    sourceUnitId,
    sourceSpellId,
  });
}
