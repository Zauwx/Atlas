import { z } from "zod";

/**
 * Rejection codes for invalid intents.
 *
 * ARCHITECTURE.md "Networking Model": invalid intents are rejected with an
 * explicit error code; nothing is silently corrected. This list is technical
 * vocabulary and may grow without a rulebook change.
 */
export const IntentErrorCodeSchema = z.enum([
  "SchemaInvalid",
  "MatchNotActive",
  "NotYourTurn",
  "UnknownUnit",
  "UnknownSpell",
  "UnknownStance",
  "OutOfBounds",
  "CellOccupied",
  "NotEnoughMovementPoints",
  "NotEnoughActionPoints",
  "ClimbTooHigh",
  "ClimbBlocked",
  "MovementBlocked",
  "OutOfRange",
  "NoLineOfSight",
  "InvalidTarget",
  "StanceAlreadyLocked",
]);

export type IntentErrorCode = z.infer<typeof IntentErrorCodeSchema>;

export const IntentErrorCode = IntentErrorCodeSchema.enum;
