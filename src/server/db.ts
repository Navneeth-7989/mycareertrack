import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client singleton.
 *
 * This is the only module in the codebase that constructs a PrismaClient, and
 * `src/server/` is the only directory allowed to import Prisma at all (see
 * DESIGN.md §4). Everything else goes through the query and mutation layers.
 *
 * Why the globalThis dance: `next dev` hot-reloads by discarding and
 * re-evaluating module scope on every file save. A plain `new PrismaClient()`
 * at module level would therefore construct a fresh client — and a fresh
 * connection pool — on every save, and the old ones are never garbage
 * collected because their sockets stay open. After a dozen edits you exhaust
 * Neon's connection limit and the app starts failing with "too many
 * connections" errors that look like a database problem rather than a dev-server
 * one. Caching the instance on globalThis survives module re-evaluation, so
 * there is exactly one pool per dev process.
 *
 * In production the module is evaluated once, so the cache is unnecessary —
 * and deliberately skipped, to avoid leaking a client across the warm
 * invocations of a serverless function.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Failing loudly at construction beats a confusing connection error on the
    // first query of a request.
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  // Prisma 7 has no built-in query engine — the connection is made by a driver
  // adapter. PrismaPg wraps node-postgres, which is the right choice for the
  // Node.js runtime; Neon's serverless driver would only be needed on edge.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
