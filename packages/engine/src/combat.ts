import type { Element, GameEvent, SpellId, UnitId } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { applyDamageInteractions } from "./elemental.js";

/**
 * Damage and heal application — pipeline steps 11–12
 * (COMBAT_RULEBOOK.md "Resolution Pipeline"). Physics damage (collisions,
 * falls) is carried by its own events and does not pass through here
 * (rulebook Edge Cases: "Physics damage events").
 *
 * Every elemental damage instance flows through applyElementalDamage, so
 * the interaction table is consulted exactly once per hit, wherever the
 * damage came from — a spell or a state's end-of-round tick.
 */

export function applyElementalDamage(
  state: MatchState,
  target: UnitRuntime,
  amount: number,
  element: Element,
  sourceUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  const bonus = applyDamageInteractions(state, target, element, events);
  const total = amount + bonus;
  target.currentHealthPoints -= total;
  events.push({
    type: "Damage",
    targetUnitId: target.id,
    amount: total,
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
