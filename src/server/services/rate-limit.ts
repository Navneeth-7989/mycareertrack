import { RateLimitError } from "@/lib/api/errors";
import {
  type RateLimitRule,
  rateLimitMessage,
  rateLimitWindow,
  retryAfterSeconds,
} from "@/lib/constants/rate-limit";

import { prisma } from "../db";

/**
 * The Postgres-backed rate limiter (DESIGN.md §2, §6, §8).
 *
 * The limits themselves and the window arithmetic live in
 * `lib/constants/rate-limit`, which is pure and tested. This file is the one
 * statement that talks to the database, and the decisions below are all about
 * that statement.
 *
 * **Why raw SQL, in a codebase where everything else goes through Prisma's
 * query API.** A limiter has exactly one hard requirement — the increment must
 * be atomic — and `prisma.rateLimit.upsert` does not provide it. Prisma's
 * upsert is a read, then an insert or an update, with a gap in between: two
 * requests arriving together both find no row, both insert, and one dies on the
 * primary key. Catching that and retrying would work, but the retry has to
 * re-read, which is the same race one level up, and the failure mode is a
 * limiter that undercounts under exactly the load it exists for. `INSERT ...
 * ON CONFLICT DO UPDATE ... RETURNING` is one statement, one round trip, and
 * atomic by construction: the (max + 1)th concurrent caller gets `count` =
 * max + 1 back and no two callers can see the same number.
 *
 * It is parameterised — `$queryRaw`'s tagged template sends values separately
 * from the SQL, so the bucket string is never interpolated into the statement.
 * §8's SQL-injection row is satisfied for the same reason it is everywhere
 * else.
 *
 * **The counter is incremented before the limit is checked, including on a
 * request that is already over.** That is what makes the refusal cheap: no
 * read-then-decide, and nothing to keep in step. It also means hammering a
 * closed window does not extend it, because the window's end is a function of
 * the clock, not of the last attempt.
 */

type LimitRow = { count: number };

/**
 * Counts one request against `rule` for `subject`, and throws a 429 if that
 * puts the bucket over the limit.
 *
 * `subject` is whatever identifies the caller for this limit — a user id, or an
 * email and an IP. It is joined to the rule's name to form the bucket, so two
 * limits can never share a counter even if their subjects collide.
 *
 * `now` is a parameter so the window boundary can be pinned in a test, the same
 * reason `getAnalytics` takes one.
 */
export async function enforceRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: Date = new Date(),
): Promise<void> {
  const { startsAt, expiresAt } = rateLimitWindow(rule, now);
  const bucket = `${rule.name}:${subject}`;

  const rows = await prisma.$queryRaw<LimitRow[]>`
    INSERT INTO "RateLimit" ("bucket", "windowStart", "count", "expiresAt")
    VALUES (${bucket}, ${startsAt}, 1, ${expiresAt})
    ON CONFLICT ("bucket", "windowStart")
      DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `;

  /*
   * A missing row cannot happen — RETURNING on an INSERT ... ON CONFLICT DO
   * UPDATE always yields the row, since both branches write one. Defaulting to
   * 1 rather than asserting means that if some future Postgres or adapter
   * change ever made the shape different, the limiter would fail *open* for one
   * request instead of throwing an unhandled error into a sign-in attempt.
   * That is the right way round: this code cannot be the reason nobody can log
   * in.
   */
  const count = rows[0]?.count ?? 1;

  sweepExpiredBuckets(now);

  if (count > rule.max) {
    const seconds = retryAfterSeconds(expiresAt, now);

    throw new RateLimitError(rateLimitMessage(rule, seconds), seconds);
  }
}

/**
 * Forgets a subject's counter for a limit, across every window.
 *
 * Used on a successful credentials sign-in, and that is the only sensible
 * place: without it, four typos followed by the right password still leaves one
 * attempt in the bucket, so a user who mistypes again an hour later is locked
 * out of an account they demonstrably own. Clearing on success is also what
 * keeps the limit aimed at guessing rather than at clumsiness — an attacker who
 * does not know the password never reaches this line.
 *
 * `deleteMany` across all windows rather than the current one, because the only
 * thing a stale window could do is refuse a legitimate attempt.
 */
export async function clearRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { bucket: `${rule.name}:${subject}` } });
}

/**
 * How often a process is willing to sweep, regardless of traffic.
 *
 * Expired rows are harmless — a closed window's row can never refuse anyone,
 * because the bucket key contains its own window start — so this is housekeeping
 * against unbounded growth, not correctness. Ten minutes keeps the table within
 * a few windows' worth of rows while adding one `DELETE` per ten minutes per
 * process to the load.
 */
const SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * Module scope, so it is per server process and resets on a cold start. A
 * serverless deployment therefore sweeps a little more often than this
 * interval implies, which is fine — the interval is a ceiling on cost, not a
 * schedule anything depends on.
 */
let lastSweepAt = 0;

/**
 * Deletes closed windows, at most once per `SWEEP_INTERVAL_MS` per process.
 *
 * **Deliberately not awaited, and it swallows its own failure.** It runs on the
 * path of a sign-in and of every application create; a sweep that was awaited
 * would add its latency to a user's request for no benefit to that request, and
 * a sweep that threw would turn a successful create into a 500. The limit has
 * already been enforced by the time this is called, so the worst a failed sweep
 * does is leave rows for the next one.
 *
 * The timestamp is written *before* the query, not after, so a slow or failing
 * sweep cannot cause every concurrent request to start one.
 */
function sweepExpiredBuckets(now: Date): void {
  const nowMs = now.getTime();

  if (nowMs - lastSweepAt < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweepAt = nowMs;

  void prisma.rateLimit
    .deleteMany({ where: { expiresAt: { lt: now } } })
    .catch((error: unknown) => {
      console.error("[rate-limit] sweep failed", error);
    });
}

/**
 * Test-only: lets a suite run a sweep without waiting out the interval.
 *
 * Exported rather than reached for with a module mock, so the throttle stays a
 * plain module variable instead of becoming an injectable dependency that only
 * tests use.
 */
export function resetRateLimitSweepThrottle(): void {
  lastSweepAt = 0;
}
