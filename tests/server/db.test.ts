import { describe, expect, it } from "vitest";

/**
 * Guards the hot-reload singleton in src/server/db.ts. If a refactor ever
 * replaces the globalThis cache with a bare `new PrismaClient()`, this fails —
 * which is better than discovering it as "too many connections" errors from
 * Neon after twenty file saves.
 *
 * No query is issued, so this does not need a reachable database.
 */
describe("prisma singleton", () => {
  it("returns the same instance across imports", async () => {
    const first = await import("@/server/db");
    const second = await import("@/server/db");

    expect(first.prisma).toBe(second.prisma);
  });

  it("caches the instance on globalThis outside production", async () => {
    const { prisma } = await import("@/server/db");
    const cached = (globalThis as unknown as { prisma?: unknown }).prisma;

    expect(cached).toBe(prisma);
  });
});
