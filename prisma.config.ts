import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * As of Prisma 7 connection URLs are no longer declared in schema.prisma. The
 * CLI (migrate, db pull, studio) reads them from here; the application reads
 * DATABASE_URL through the driver adapter in src/server/db.ts.
 *
 * Migrations deliberately use DIRECT_URL rather than DATABASE_URL: Neon's
 * pooled endpoint runs PgBouncer in transaction mode, which cannot hold the
 * session-level advisory locks that Prisma Migrate takes out.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
