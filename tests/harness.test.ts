import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// Smoke test for the harness itself: proves Vitest runs and that the "@/*"
// tsconfig alias resolves inside tests. Real suites arrive in Phase 5.
describe("test harness", () => {
  it("resolves the @/ alias", () => {
    expect(typeof cn).toBe("function");
  });

  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy class names", () => {
    expect(cn("a", false, undefined, null, "c")).toBe("a c");
  });
});
