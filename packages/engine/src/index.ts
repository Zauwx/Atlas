/**
 * @atlas/engine — the pure deterministic gameplay engine (ARCHITECTURE.md).
 * No networking, no rendering, no I/O. Consumed by the server (Phase 4),
 * importable by the client later for prediction and replay verification.
 */

export { MatchSimulation, type IntentResult } from "./simulation.js";
export { RuleModifierRegistry, type RuleModifierHooks } from "./rules.js";
export { MatchSetupError } from "./match-state.js";
export { computeReachableCells, type ReachableCell } from "./pathfinding.js";
export { hasLineOfSight } from "./line-of-sight.js";
