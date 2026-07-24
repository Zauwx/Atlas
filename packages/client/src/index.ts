import { SHARED_PACKAGE_NAME } from "@atlas/shared";

/**
 * Package marker for @atlas/client.
 *
 * The cross-package import above proves the workspace wiring
 * (client → shared) compiles under project references. Real client code
 * (Phaser rendering, input, UI) arrives in Phase 5 — see ARCHITECTURE.md.
 */
export const CLIENT_PACKAGE_NAME = "@atlas/client";

export const LINKED_SHARED_PACKAGE_NAME = SHARED_PACKAGE_NAME;
