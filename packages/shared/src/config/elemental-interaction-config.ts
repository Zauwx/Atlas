import { z } from "zod";
import { ElementSchema } from "../enums/element.js";
import { StateIdSchema } from "../ids.js";

/**
 * Elemental interactions — COMBAT_RULEBOOK.md "Elemental Interactions".
 *
 * One table, consulted by the engine. Interactions are never written into
 * a spell, a terrain, or a state, so new content inherits them for free
 * and the rules stay in one readable place.
 */

export const ElementalTriggerSchema = z.discriminatedUnion("kind", [
  /** Damage carrying this element is about to land on the target. */
  z.object({ kind: z.literal("Damage"), element: ElementSchema }),
  /** This state is about to be applied to the target, from any source. */
  z.object({ kind: z.literal("StateApplied"), stateId: StateIdSchema }),
]);
export type ElementalTrigger = z.infer<typeof ElementalTriggerSchema>;

export const ElementalInteractionConfigSchema = z
  .object({
    trigger: ElementalTriggerSchema,
    /** The interaction only fires if the target already has this state. */
    requiresStateId: StateIdSchema,
    /** Added to the incoming damage. Damage triggers only. */
    bonusDamage: z.number().int().nonnegative(),
    /** States stripped from the target when the interaction fires. */
    removesStateIds: z.array(StateIdSchema),
    /** Suppresses the incoming state entirely. StateApplied triggers only. */
    preventsApplication: z.boolean(),
  })
  .refine((interaction) => interaction.trigger.kind === "Damage" || interaction.bonusDamage === 0, {
    message: "bonusDamage only applies to Damage triggers",
  })
  .refine(
    (interaction) =>
      interaction.trigger.kind === "StateApplied" || !interaction.preventsApplication,
    { message: "preventsApplication only applies to StateApplied triggers" },
  );

export type ElementalInteractionConfig = z.infer<typeof ElementalInteractionConfigSchema>;
