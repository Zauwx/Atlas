import {
  STANCE_ID_FLOW,
  STANCE_ID_IRON,
  STANCE_ID_STORM,
  STATE_ID_BURNING,
  STATE_ID_FROZEN,
  STATE_ID_WET,
} from "@atlas/shared";
import { RuleModifierRegistry } from "../rules.js";

/** Rulebook "Defined state effects (V1)": Burning deals this each round end. */
const BURNING_DAMAGE_PER_ROUND = 15;

/**
 * V1 rule-modifier content — implements COMBAT_RULEBOOK.md:
 * - "Defined state effects (V1)": Wet → pushes against the unit +1 cell.
 * - "V1 stances": Iron (incoming pushes −2), Flow (free climbs),
 *   Storm (outgoing pushes +1).
 *
 * Adding future stance/state behavior = registering hooks here (or in a
 * sibling content module) + a rulebook entry. Resolution code stays
 * untouched.
 */
export function createV1RuleRegistry(): RuleModifierRegistry {
  const registry = new RuleModifierRegistry();

  registry.register(STATE_ID_WET, {
    modifyPushDistance: (_unit, distance) => distance + 1,
  });

  registry.register(STATE_ID_BURNING, {
    roundEndDamage: () => ({ amount: BURNING_DAMAGE_PER_ROUND, element: "Fire" }),
  });

  registry.register(STATE_ID_FROZEN, {
    canUnitClimb: () => false,
  });

  registry.register(STANCE_ID_IRON, {
    modifyPushDistance: (_unit, distance) => distance - 2,
  });

  registry.register(STANCE_ID_STORM, {
    modifyOutgoingPushDistance: (_pusher, distance) => distance + 1,
  });

  registry.register(STANCE_ID_FLOW, {
    modifyClimbCost: () => 0,
  });

  return registry;
}
