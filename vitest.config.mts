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
  },
});
