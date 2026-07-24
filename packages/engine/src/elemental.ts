import type { Element, GameEvent, StateId } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";

/**
 * Elemental interaction table — COMBAT_RULEBOOK.md "Elemental
 * Interactions". Two choke points, consulted from wherever damage lands
 * or a state is applied, so interactions never leak into spells, terrain,
 * or state code.
 */

function removeStates(unit: UnitRuntime, stateIds: readonly StateId[], events: GameEvent[]): void {
  for (const stateId of stateIds) {
    if (!unit.states.some((instance) => instance.stateId === stateId)) {
      continue;
    }
    unit.states = unit.states.filter((instance) => instance.stateId !== stateId);
    events.push({
      type: "RemoveState",
      stateId,
      target: { kind: "Unit", unitId: unit.id },
    });
  }
}

/**
 * Consulted immediately before damage is applied: returns the bonus to
 * add, having already stripped any states the table says this element
 * removes (e.g. Fire thaws Frozen).
 */
export function applyDamageInteractions(
  state: MatchState,
  target: UnitRuntime,
  element: Element,
  events: GameEvent[],
): number {
  let bonusDamage = 0;
  for (const interaction of state.config.elementalInteractions) {
    if (interaction.trigger.kind !== "Damage" || interaction.trigger.element !== element) {
      continue;
    }
    if (!target.states.some((instance) => instance.stateId === interaction.requiresStateId)) {
      continue;
    }
    bonusDamage += interaction.bonusDamage;
    removeStates(target, interaction.removesStateIds, events);
  }
  return bonusDamage;
}

/**
 * Consulted before a state is added to a unit, whatever the source.
 * Returns true when the incoming state is suppressed — that is how Wet
 * protects a unit from catching fire in Lava.
 */
export function stateApplicationIsPrevented(
  state: MatchState,
  target: UnitRuntime,
  incomingStateId: StateId,
  events: GameEvent[],
): boolean {
  let prevented = false;
  for (const interaction of state.config.elementalInteractions) {
    if (
      interaction.trigger.kind !== "StateApplied" ||
      interaction.trigger.stateId !== incomingStateId
    ) {
      continue;
    }
    if (!target.states.some((instance) => instance.stateId === interaction.requiresStateId)) {
      continue;
    }
    removeStates(target, interaction.removesStateIds, events);
    if (interaction.preventsApplication) {
      prevented = true;
    }
  }
  return prevented;
}
