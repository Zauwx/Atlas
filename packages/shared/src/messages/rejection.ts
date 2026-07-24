import { z } from "zod";
import { IntentErrorCodeSchema } from "../enums/error-code.js";
import { IntentTypeSchema } from "./intents.js";

/**
 * Server response to an invalid intent — ARCHITECTURE.md "Networking Model":
 * invalid intents are rejected with an explicit error code; nothing is
 * silently corrected. Not a game event: rejections are sent only to the
 * offending client and never enter the match event log.
 */
export const IntentRejectionSchema = z.object({
  intentType: IntentTypeSchema,
  code: IntentErrorCodeSchema,
  /** Optional human-readable detail for debugging; never required by clients. */
  message: z.string().nullable(),
});

export type IntentRejection = z.infer<typeof IntentRejectionSchema>;
