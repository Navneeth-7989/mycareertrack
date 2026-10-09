import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolves the "@/*" alias from tsconfig.json so tests import modules the
    // same way application code does. Native since Vite 8 — no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Database-backed suites (the authorization suite in Phase 5) share one
    // Neon database, so parallel files would race on the same rows.
    fileParallelism: false,
    /*
     * The default is 5 seconds, which is a budget for pure functions. The
     * authorization suite talks to a Neon database over the network, and its
     * cases are deliberately sequential — set up a row, attack it, read it back
     * — so a single case can be half a dozen round trips, two or three of them
     * transactions. At the latency this project sees from Neon that is tens of
     * seconds for the file, and a case that trips the default looks like a
     * failing security test rather than a slow one, which is the worst possible
     * false alarm to have in a suite like that.
     *
     * Raised globally rather than per case: it is a property of the database,
     * not of any one test. No pure test comes anywhere near it, so nothing is
     * made slower to fail — only the network-bound ones are given room.
     */
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
