import { z } from "zod";

/**
 * Element types — COMBAT_RULEBOOK.md "Elements".
 *
 * This set is fixed by the rulebook; adding an element requires a rulebook
 * update, so a closed enum (not a data-driven ID) is intentional.
 */
export const ElementSchema = z.enum([
  "Physical",
  "Fire",
  "Water",
  "Ice",
  "Lightning",
  "Earth",
  "Air",
  "Neutral",
]);

export type Element = z.infer<typeof ElementSchema>;

export const Element = ElementSchema.enum;
