import type { Element } from "@atlas/shared";
import type { MatchState, UnitRuntime } from "./match-state.js";

/**
 * Rule-modifier hook registry — ARCHITECTURE.md "Module rules".
 *
 * Stances and states modify engine behavior by registering hooks under
 * their own ID. The engine consults active hooks at defined decision
 * points, in rulebook priority order (Stance before States). Adding a
 * stance's or state's behavior = registering hooks + a rulebook entry —
 * never editing resolution code.
 */
export interface RuleModifierHooks {
  /** Rooted-style effects: returning false makes the unit unable to move voluntarily. */
  canUnitMove?: (unit?: UnitRuntime) => boolean;
  /** Frozen-style effects: returning false forbids voluntary climbs (rulebook: States). */
  canUnitClimb?: () => boolean;
  /** Electrified-style effects: returning false forbids casting spells (rulebook: States). */
  canUnitCast?: () => boolean;
  /**
   * Shielded-style effects: soaks part of an incoming damage instance.
   * Returns the reduced amount and whether the state is now spent — a
   * consumed state is removed and its RemoveState event emitted.
   */
  absorbDamage?: (amount: number) => { amount: number; consumed: boolean };
  /** Defender side of push resolution (rulebook: Push distance resolution, steps 3–4). */
  modifyPushDistance?: (unit: UnitRuntime, distance: number) => number;
  /** Attacker side of push resolution (rulebook: Push distance resolution, step 2). */
  modifyOutgoingPushDistance?: (pusher: UnitRuntime, distance: number) => number;
  /** Climb cost resolution (rulebook): may change the extra MP cost of climbing. */
  modifyClimbCost?: (movementPointCost: number) => number;
  /** Burning-style effects: damage dealt at end of round (rulebook: End of round). */
  roundEndDamage?: () => { amount: number; element: Element };
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
 * The modifier IDs affecting a unit, in rulebook priority order
 * (COMBAT_RULEBOOK.md "Rule Priority"): stance first, then states in
 * application order.
 */
export function modifierIdsOf(unit: UnitRuntime): string[] {
  const ids: string[] = [];
  if (unit.revealedStanceId !== null) {
    ids.push(unit.revealedStanceId);
  }
  for (const stateInstance of unit.states) {
    ids.push(stateInstance.stateId);
  }
  return ids;
}

function hooksForIds(
  registry: RuleModifierRegistry,
  modifierIds: readonly string[],
): RuleModifierHooks[] {
  const hooks: RuleModifierHooks[] = [];
  for (const id of modifierIds) {
    const found = registry.get(id);
    if (found !== undefined) {
      hooks.push(found);
    }
  }
  return hooks;
}

export function activeHooksFor(
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
): RuleModifierHooks[] {
  return hooksForIds(registry, modifierIdsOf(unit));
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

/**
 * Whether the given stance/state combination permits voluntary climbing.
 * Takes plain IDs so the client can ask the same question for its
 * movement preview without holding engine state.
 */
export function canClimbUnderRules(
  registry: RuleModifierRegistry,
  modifierIds: readonly string[],
): boolean {
  for (const hooks of hooksForIds(registry, modifierIds)) {
    if (hooks.canUnitClimb !== undefined && !hooks.canUnitClimb()) {
      return false;
    }
  }
  return true;
}

/** Climb cost resolution — COMBAT_RULEBOOK.md: hooks may alter the extra MP cost. */
export function climbCostUnderRules(
  registry: RuleModifierRegistry,
  modifierIds: readonly string[],
  baseCost: number,
): number {
  let cost = baseCost;
  for (const hooks of hooksForIds(registry, modifierIds)) {
    if (hooks.modifyClimbCost !== undefined) {
      cost = hooks.modifyClimbCost(cost);
    }
  }
  return Math.max(0, Math.trunc(cost));
}

export function effectiveClimbCost(
  state: MatchState,
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
  baseCost: number,
): number {
  void state;
  return climbCostUnderRules(registry, modifierIdsOf(unit), baseCost);
}

export function canUnitClimb(registry: RuleModifierRegistry, unit: UnitRuntime): boolean {
  return canClimbUnderRules(registry, modifierIdsOf(unit));
}

/**
 * Whether the stance/state combination permits moving voluntarily. IDs
 * form, so the client can gray out a Rooted unit without engine state.
 */
export function canMoveUnderRules(
  registry: RuleModifierRegistry,
  modifierIds: readonly string[],
): boolean {
  for (const hooks of hooksForIds(registry, modifierIds)) {
    if (hooks.canUnitMove !== undefined && !hooks.canUnitMove()) {
      return false;
    }
  }
  return true;
}

/** Electrified-style rule: whether the unit may cast (rulebook: States). */
export function canCastUnderRules(
  registry: RuleModifierRegistry,
  modifierIds: readonly string[],
): boolean {
  for (const hooks of hooksForIds(registry, modifierIds)) {
    if (hooks.canUnitCast !== undefined && !hooks.canUnitCast()) {
      return false;
    }
  }
  return true;
}

export function canUnitCast(registry: RuleModifierRegistry, unit: UnitRuntime): boolean {
  return canCastUnderRules(registry, modifierIdsOf(unit));
}

/**
 * Push distance resolution — COMBAT_RULEBOOK.md: base distance, then the
 * pusher's modifiers, then the pushed unit's (stance before states via
 * activeHooksFor), clamped at 0. `pusher` is null for pushes without an
 * originating unit.
 */
export function effectivePushDistance(
  state: MatchState,
  registry: RuleModifierRegistry,
  pusher: UnitRuntime | null,
  target: UnitRuntime,
  baseDistance: number,
): number {
  void state;
  let distance = baseDistance;
  if (pusher !== null) {
    for (const hooks of activeHooksFor(registry, pusher)) {
      if (hooks.modifyOutgoingPushDistance !== undefined) {
        distance = hooks.modifyOutgoingPushDistance(pusher, distance);
      }
    }
  }
  for (const hooks of activeHooksFor(registry, target)) {
    if (hooks.modifyPushDistance !== undefined) {
      distance = hooks.modifyPushDistance(target, distance);
    }
  }
  return Math.max(0, Math.trunc(distance));
}

/** Damage a unit suffers at end of round, summed over its active states. */
export function roundEndDamageFor(
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
): { amount: number; element: Element }[] {
  const entries: { amount: number; element: Element }[] = [];
  for (const hooks of activeHooksFor(registry, unit)) {
    if (hooks.roundEndDamage !== undefined) {
      entries.push(hooks.roundEndDamage());
    }
  }
  return entries;
}

/**
 * Runs the unit's Shielded-style absorbers over an incoming damage amount
 * (rulebook: Defined state effects → Shielded). Returns the reduced amount
 * and the state IDs to remove, in the same modifier order as everything
 * else. The caller applies the removals and their RemoveState events, so
 * this function stays free of state and events.
 */
export function absorbIncomingDamage(
  registry: RuleModifierRegistry,
  unit: UnitRuntime,
  amount: number,
): { amount: number; consumedStateIds: string[] } {
  let current = amount;
  const consumedStateIds: string[] = [];
  for (const id of modifierIdsOf(unit)) {
    const absorb = registry.get(id)?.absorbDamage;
    if (absorb === undefined) {
      continue;
    }
    const result = absorb(current);
    current = Math.max(0, result.amount);
    if (result.consumed) {
      consumedStateIds.push(id);
    }
  }
  return { amount: current, consumedStateIds };
}
