import { describe, expect, it } from "vitest";

import { burnPasswordComparison, hashPassword, verifyPassword } from "@/server/services/password";

describe("hashPassword", () => {
  it("produces a bcrypt hash at cost 12", async () => {
    const hash = await hashPassword("password1");

    // $2b$ is the bcrypt identifier, 12 the cost factor required by
    // DESIGN.md §8. Asserting on the prefix catches an accidental cost change.
    expect(hash.startsWith("$2b$12$")).toBe(true);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const [first, second] = await Promise.all([
      hashPassword("password1"),
      hashPassword("password1"),
    ]);

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it.each(["wrong password", "", "Correct Horse Battery Staple"])("rejects %j", async (attempt) => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword(attempt, hash)).toBe(false);
  });
});

describe("burnPasswordComparison", () => {
  // Used when there is no hash to check — a missing account, or an OAuth-only
  // account. It must always fail, and it must take as long as a real check so
  // response time doesn't reveal which case it was.
  it("always returns false", async () => {
    expect(await burnPasswordComparison("anything at all")).toBe(false);
    expect(await burnPasswordComparison("")).toBe(false);
  });

  it("costs comparable time to a real verification", async () => {
    const hash = await hashPassword("password1");

    const realStart = performance.now();
    await verifyPassword("wrong", hash);
    const real = performance.now() - realStart;

    const decoyStart = performance.now();
    await burnPasswordComparison("wrong");
    const decoy = performance.now() - decoyStart;

    // A loose bound on purpose — this asserts the decoy does the bcrypt work
    // rather than returning immediately, not that the timings match. A strict
    // ratio would be flaky on shared CI hardware.
    expect(decoy).toBeGreaterThan(real / 4);
  });
});
