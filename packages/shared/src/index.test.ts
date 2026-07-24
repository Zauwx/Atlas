import { describe, expect, it } from "vitest";

import { SHARED_PACKAGE_NAME } from "./index.js";

/**
 * Toolchain sanity test: proves that Vitest resolves TypeScript sources,
 * NodeNext-style relative imports (".js" specifiers), and the strict
 * compiler settings end to end. Gameplay tests arrive in Phase 3.
 */
describe("@atlas/shared package marker", () => {
  it("exposes the package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@atlas/shared");
  });
});
