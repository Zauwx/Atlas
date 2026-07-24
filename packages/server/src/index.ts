import { RULEBOOK_PHYSICS } from "@atlas/shared";

/**
 * Package marker for @atlas/server.
 *
 * The cross-package import above proves the workspace wiring
 * (server → shared) compiles under project references. Real server code
 * (Colyseus rooms, validation, simulation hosting) arrives in Phase 4 —
 * see ARCHITECTURE.md.
 */
export const SERVER_PACKAGE_NAME = "@atlas/server";

export const LINKED_PHYSICS_CONFIG = RULEBOOK_PHYSICS;
