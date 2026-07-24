/**
 * @atlas/engine — the pure deterministic gameplay engine (ARCHITECTURE.md).
 * No networking, no rendering, no I/O. Consumed by the server (Phase 4),
 * importable by the client later for prediction and replay verification.
 */

export { MatchSimulation, type IntentResult } from "./simulation.js";
export {
  RuleModifierRegistry,
  canClimbUnderRules,
  climbCostUnderRules,
  type RuleModifierHooks,
} from "./rules.js";
export { createV1RuleRegistry } from "./content/v1-rule-hooks.js";
export { MatchSetupError } from "./match-state.js";
export { computeReachableCells, type ReachableCell } from "./pathfinding.js";
export { hasLineOfSight, hasLineOfSightOverHeights } from "./line-of-sight.js";
