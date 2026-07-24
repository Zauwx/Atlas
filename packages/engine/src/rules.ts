import type { MatchState, UnitRuntime } from "./match-state.js";

/**
 * Rule-modifier hook registry — ARCHITECTURE.md "Module rules".
 *
 * Stances and states modify engine behavior by registering hooks under
 * their own ID. The engine consults active hooks at defined decision
 * points, in rulebook priority order (Stance before States). Adding a
 * stance's or state's behavior = registering hooks + a rulebook entry —
 * never editing resolution code.
 *
 * Phase 3 ships the mechanism with two decision points; more are added as
 * the rulebook decides state/stance content. No content hooks exist yet.
 */
export interface RuleModifierHooks {
  /** Rooted-style effects: returning false makes the unit unable to move voluntarily. */
  canUnitMove?: (unit: UnitRuntime) => boolean;
  /** Stance/state effects altering how far the unit is pushed. Must return an integer ≥ 0. */
  modifyPushDistance?: (unit: UnitRuntime, distance: number) => number;
}

export class RuleModifierRegistry {
  private readonly hooksById = new Map<string, RuleModifierHooks>();

  register(id: string, hooks: RuleModifierHooks): void {
    if (this.hooksById.has(id)) {
      throw new Error(`Rule modifier already registered for "${id}"`);
    }
    this.hooksById.set(id, hooks);
  }

  get(id: string): RuleModifierHooks | undefined {
    return this.hooksById.get(id);
  }
}

/**
 * Active hooks for a unit, in rulebook priority order
 * (COMBAT_RULEBOOK.md "Rule Priority"): Stance first, then States in
 * application order.
 */
export function activeHooksFor(
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
): RuleModifierHooks[] {
  const hooks: RuleModifierHooks[] = [];
  if (unit.revealedStanceId !== null) {
    const stanceHooks = registry.get(unit.revealedStanceId);
    if (stanceHooks !== undefined) {
      hooks.push(stanceHooks);
    }
  }
  for (const stateInstance of unit.states) {
    const stateHooks = registry.get(stateInstance.stateId);
    if (stateHooks !== undefined) {
      hooks.push(stateHooks);
    }
  }
  return hooks;
}

export function canUnitMove(
  state: MatchState,
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
): boolean {
  void state;
  for (const hooks of activeHooksFor(registry, unit)) {
    if (hooks.canUnitMove !== undefined && !hooks.canUnitMove(unit)) {
      return false;
    }
  }
  return true;
}

export function effectivePushDistance(
  state: MatchState,
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
  baseDistance: number,
): number {
  void state;
  let distance = baseDistance;
  for (const hooks of activeHooksFor(registry, unit)) {
    if (hooks.modifyPushDistance !== undefined) {
      distance = hooks.modifyPushDistance(unit, distance);
    }
  }
  return Math.max(0, Math.trunc(distance));
}
