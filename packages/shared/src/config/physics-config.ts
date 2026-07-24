import { z } from "zod";

/**
 * Physics constants — values fixed by COMBAT_RULEBOOK.md ("Verticality",
 * "Collisions", "Falls"), carried as configuration per the data-driven rule:
 * balance values live in config, never in code literals.
 */
export const PhysicsConfigSchema = z.object({
  /** "Collisions": each remaining cell of push distance inflicts this damage. */
  collisionDamagePerRemainingCell: z.number().int().nonnegative(),
  /** "Falls": damage = (z_start − z_end) × this value. */
  fallDamagePerHeightLevel: z.number().int().nonnegative(),
  /** "Verticality": climbing +1 z costs this many extra MP. */
  climbMovementPointCostPerLevel: z.number().int().nonnegative(),
  /** "Verticality": max climb height in one step without a dedicated ability. */
  maxClimbHeightWithoutAbility: z.number().int().nonnegative(),
});

export type PhysicsConfig = z.infer<typeof PhysicsConfigSchema>;

/** Rulebook v0.1 values. */
export const RULEBOOK_PHYSICS: PhysicsConfig = {
  collisionDamagePerRemainingCell: 10,
  fallDamagePerHeightLevel: 15,
  climbMovementPointCostPerLevel: 1,
  maxClimbHeightWithoutAbility: 1,
};
