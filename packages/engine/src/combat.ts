import type { Element, GameEvent, SpellId, UnitId } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";
import { applyDamageInteractions } from "./elemental.js";
import type { RuleModifierRegistry } from "./rules.js";
import { absorbIncomingDamage } from "./rules.js";

/**
 * Damage and heal application — pipeline steps 11–12
 * (COMBAT_RULEBOOK.md "Resolution Pipeline"). Physics damage (collisions,
 * falls) is carried by its own events and does not pass through here
 * (rulebook Edge Cases: "Physics damage events").
 *
 * Every elemental damage instance flows through applyElementalDamage, so
 * the interaction table and Shielded absorption are consulted exactly once
 * per hit, wherever the damage came from — a spell or a state's
 * end-of-round tick.
 */

export function applyElementalDamage(
  state: MatchState,
  registry: RuleModifierRegistry,
  target: UnitRuntime,
  amount: number,
  element: Element,
  sourceUnitId: UnitId | null,
  sourceSpellId: SpellId | null,
  events: GameEvent[],
): void {
  // Elemental bonuses first (e.g. Lightning +10 on Wet), then Shielded
  // absorbs the resulting number (rulebook: Defined state effects).
  const bonus = applyDamageInteractions(state, target, element, events);
  const absorbed = absorbIncomingDamage(registry, target, amount + bonus);

  target.currentHealthPoints -= absorbed.amount;
  events.push({
    type: "Damage",
    targetUnitId: target.id,
    amount: absorbed.amount,
    element,
    sourceUnitId,
    sourceSpellId,
  });

  for (const consumedId of absorbed.consumedStateIds) {
    const instance = target.states.find((candidate) => candidate.stateId === consumedId);
    if (instance === undefined) {
      continue;
    }
    target.states = target.states.filter((candidate) => candidate.stateId !== consumedId);
    events.push({
      type: "RemoveState",
      stateId: instance.stateId,
      target: { kind: "Unit", unitId: target.id },
    });
  }
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
