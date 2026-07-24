import { RULEBOOK_PHYSICS } from "@atlas/shared";

/**
 * Package marker for @atlas/client.
 *
 * The cross-package import above proves the workspace wiring
 * (client → shared) compiles under project references. Real client code
 * (Phaser rendering, input, UI) arrives in Phase 5 — see ARCHITECTURE.md.
 */
export const CLIENT_PACKAGE_NAME = "@atlas/client";

export const LINKED_PHYSICS_CONFIG = RULEBOOK_PHYSICS;
