import { afterAll, afterEach, describe, expect, it } from "vitest";

import { AppError } from "@/lib/api/errors";
import { type RateLimitRule, rateLimitWindow } from "@/lib/constants/rate-limit";
import { prisma } from "@/server/db";
import {
  clearRateLimit,
  enforceRateLimit,
  resetRateLimitSweepThrottle,
} from "@/server/services/rate-limit";

/**
 * The Postgres-backed limiter (DESIGN.md §6, §8).
 *
 * **Database-backed for the same reason the authorization suite is.** The one
 * property that matters here is atomicity under concurrency, and that is a
 * property of a SQL statement, not of the TypeScript around it. A mocked client
 * would assert that we sent an `INSERT ... ON CONFLICT`, which is a restatement
 * of the source; only a real Postgres can answer "do ten simultaneous callers
 * see ten different numbers". The pure window arithmetic is covered separately
 * in `tests/lib/rate-limit.test.ts`.
 *
 * **Safety.** This table is shared with the deployed app, and unlike the
 * authorization fixture there is no user row to scope by — a bucket is just a
 * string. So every bucket this file creates carries `BUCKET_MARK`, teardown
 * deletes on `contains: BUCKET_MARK`, and the rules below are **local to this
 * file** rather than the real `RATE_LIMITS` entries: using the real `login`
 * rule would mean writing into the same bucket namespace a signed-in user does.
 * The limiter does not care which rule it is handed, which is what makes that
 * substitution honest — it is the same code path with a different name and a
 * smaller `max`.
 */

/** Appears in every bucket this file writes, and is the whole of teardown's WHERE. */
const BUCKET_MARK = "vitest-probe.careertrack.invalid";

let subjectCounter = 0;

/**
 * A fresh subject per case, so no case can be affected by a previous one's
 * counter — and so a run killed halfway through cannot refuse the next run.
 */
function nextSubject(): string {
  subjectCounter += 1;

  return `${BUCKET_MARK}/${subjectCounter}`;
}

/**
 * A rule shaped like a real one but in its own namespace. `max: 3` because
 * every case has to exceed it, and three round trips is cheaper than a hundred.
 */
function testRule(name: string, overrides: Partial<RateLimitRule> = {}): RateLimitRule {
  return {
    name: `vitest-${name}`,
    max: 3,
    windowMs: 60_000,
    refusal: "Too many test requests.",
    ...overrides,
  };
}

/**
 * **Every case that makes more than one call passes this same instant to all of
 * them, and that is not tidiness — it is the fix for a real flake.**
 *
 * A window is clock-aligned, so two calls a few hundred milliseconds apart land
 * in *different* windows whenever they straddle the boundary: the second gets a
 * fresh counter and is allowed, and the case fails with "promise resolved
 * instead of rejecting". It happened once in the first full run of this file,
 * on the one-minute rule — roughly a 1-in-130 chance per case, which is exactly
 * often enough to be dismissed as a fluke and never fixed.
 *
 * Pinning to a real instant rather than a literal date keeps the rows' expiry
 * plausible, so the sweep treats them the way it treats live traffic.
 */
function pinnedNow(): Date {
  return new Date();
}

async function bucketRows(subject: string) {
  return prisma.rateLimit.findMany({
    where: { bucket: { contains: subject } },
    orderBy: { windowStart: "asc" },
  });
}

/**
 * Asserts a thrown value is the 429 from §6 — status *and* code, not merely
 * that something threw. The same discipline as `expectDenied` in the
 * authorization suite: a test that only checks "it threw" passes when the code
 * throws for the wrong reason.
 */
function expectRefused(error: unknown): AppError {
  expect(error).toBeInstanceOf(AppError);

  const appError = error as AppError;

  expect(appError.status).toBe(429);
  expect(appError.code).toBe("RATE_LIMITED");
  expect(appError.retryAfterSeconds).toBeGreaterThan(0);

  return appError;
}

afterEach(() => {
  // The throttle is module state, so a case that triggers a sweep would
  // otherwise silently disable the sweep in every later case.
  resetRateLimitSweepThrottle();
});

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { bucket: { contains: BUCKET_MARK } } });

  const leftovers = await prisma.rateLimit.count({
    where: { bucket: { contains: BUCKET_MARK } },
  });

  // The suite is responsible for leaving a shared table as it found it, so the
  // check is part of the suite rather than something to remember to do.
  expect(leftovers).toBe(0);
});

describe("enforceRateLimit", () => {
  it("allows exactly the limit and refuses the next request", async () => {
    const rule = testRule("allow-then-refuse");
    const subject = nextSubject();
    const now = pinnedNow();

    for (let attempt = 1; attempt <= rule.max; attempt += 1) {
      await expect(enforceRateLimit(rule, subject, now)).resolves.toBeUndefined();
    }

    await expect(enforceRateLimit(rule, subject, now)).rejects.toSatisfy((error: unknown) => {
      expectRefused(error);
      return true;
    });
  });

  it("names the limit in the message and carries a usable Retry-After", async () => {
    const rule = testRule("message", { max: 1, refusal: "Too many searches." });
    const subject = nextSubject();
    // Pinned to the start of a window, so "a minute" is what the message says
    // regardless of when the suite happens to run.
    const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);

    await enforceRateLimit(rule, subject, now);

    const error = await enforceRateLimit(rule, subject, now).catch((thrown: unknown) => thrown);
    const refusal = expectRefused(error);

    expect(refusal.message).toBe("Too many searches. Try again in a minute.");
    // Never longer than the window, or a client backs off further than the
    // limiter is actually holding it.
    expect(refusal.retryAfterSeconds).toBeLessThanOrEqual(rule.windowMs / 1000);
  });

  /**
   * **The case this file exists for.** The limiter is a single
   * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` precisely so that
   * simultaneous callers cannot both read "0 so far" and both be allowed. A
   * read-then-write limiter passes every sequential test above and fails this
   * one, which is the shape of bug that reaches production — the failure only
   * appears under the load the limit exists for.
   *
   * Ten at once against a limit of three: exactly three must be allowed and the
   * counter must land on ten, since every attempt counts whether or not it was
   * allowed.
   */
  it("counts correctly when ten requests arrive at once", async () => {
    const rule = testRule("concurrent");
    const subject = nextSubject();
    const now = pinnedNow();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => enforceRateLimit(rule, subject, now)),
    );

    const allowed = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter((result) => result.status === "rejected");

    expect(allowed).toHaveLength(rule.max);
    expect(refused).toHaveLength(10 - rule.max);

    for (const result of refused) {
      expectRefused((result as PromiseRejectedResult).reason);
    }

    const [row, ...extraRows] = await bucketRows(subject);

    // One row, not ten: every caller computed the same clock-aligned window.
    expect(extraRows).toHaveLength(0);
    expect(row?.count).toBe(10);
  });

  it("keeps two subjects on separate counters", async () => {
    const rule = testRule("per-subject", { max: 1 });
    const first = nextSubject();
    const second = nextSubject();
    const now = pinnedNow();

    await enforceRateLimit(rule, first, now);
    await expect(enforceRateLimit(rule, first, now)).rejects.toThrow();

    // The second subject is untouched by the first one being over its limit.
    await expect(enforceRateLimit(rule, second, now)).resolves.toBeUndefined();
  });

  /**
   * Two limits can legitimately have the same subject — a user id is the key
   * for both the application-create limit and the resume-upload one — so the
   * rule name has to be part of the bucket. Without it, uploading would spend
   * the budget for creating.
   */
  it("keeps two limits on separate counters for the same subject", async () => {
    const uploads = testRule("uploads", { max: 1 });
    const creates = testRule("creates", { max: 1 });
    const subject = nextSubject();
    const now = pinnedNow();

    await enforceRateLimit(uploads, subject, now);
    await expect(enforceRateLimit(uploads, subject, now)).rejects.toThrow();

    await expect(enforceRateLimit(creates, subject, now)).resolves.toBeUndefined();
  });

  /**
   * The window is a function of the clock, so moving `now` into the next one is
   * the whole of "waiting it out" — no sleep, and nothing to clean up between.
   */
  it("forgives a spent limit once the window closes", async () => {
    const rule = testRule("window-roll", { max: 1, windowMs: 60_000 });
    const subject = nextSubject();

    const inside = new Date("2026-06-01T10:00:30.000Z");
    const next = new Date("2026-06-01T10:01:05.000Z");

    await enforceRateLimit(rule, subject, inside);
    await expect(enforceRateLimit(rule, subject, inside)).rejects.toThrow();

    await expect(enforceRateLimit(rule, subject, next)).resolves.toBeUndefined();

    // Two rows, one per window — the closed one is inert because its window
    // start is part of its key, not because anything deleted it.
    const rows = await bucketRows(subject);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.windowStart.toISOString())).toEqual([
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T10:01:00.000Z",
    ]);
  });

  it("stores the window end as the row's expiry", async () => {
    const rule = testRule("expiry", { max: 5, windowMs: 15 * 60_000 });
    const subject = nextSubject();
    const now = new Date("2026-06-01T10:07:00.000Z");

    await enforceRateLimit(rule, subject, now);

    const [row] = await bucketRows(subject);
    const expected = rateLimitWindow(rule, now);

    expect(row?.expiresAt.toISOString()).toBe(expected.expiresAt.toISOString());
  });
});

describe("clearRateLimit", () => {
  /**
   * What a successful credentials sign-in does. Without it, four typos followed
   * by the right password leaves one attempt in the bucket for the rest of the
   * window, so the same user mistyping once more is locked out of an account
   * they just proved they own.
   */
  it("forgets a subject's counter so a fresh attempt is allowed", async () => {
    const rule = testRule("clear", { max: 2 });
    const subject = nextSubject();
    const now = pinnedNow();

    await enforceRateLimit(rule, subject, now);
    await enforceRateLimit(rule, subject, now);
    await expect(enforceRateLimit(rule, subject, now)).rejects.toThrow();

    await clearRateLimit(rule, subject);

    expect(await bucketRows(subject)).toHaveLength(0);
    await expect(enforceRateLimit(rule, subject, now)).resolves.toBeUndefined();
  });

  it("clears every window for the subject, not only the current one", async () => {
    const rule = testRule("clear-all", { max: 1, windowMs: 60_000 });
    const subject = nextSubject();

    await enforceRateLimit(rule, subject, new Date("2026-06-01T10:00:00.000Z"));
    await enforceRateLimit(rule, subject, new Date("2026-06-01T10:01:00.000Z"));
    expect(await bucketRows(subject)).toHaveLength(2);

    await clearRateLimit(rule, subject);

    expect(await bucketRows(subject)).toHaveLength(0);
  });

  it("leaves other subjects alone", async () => {
    const rule = testRule("clear-scope", { max: 1 });
    const mine = nextSubject();
    const theirs = nextSubject();
    const now = pinnedNow();

    await enforceRateLimit(rule, mine, now);
    await enforceRateLimit(rule, theirs, now);

    await clearRateLimit(rule, mine);

    expect(await bucketRows(mine)).toHaveLength(0);
    expect(await bucketRows(theirs)).toHaveLength(1);
  });
});

describe("the sweep", () => {
  /**
   * Housekeeping, not correctness — a closed window's row can never refuse
   * anyone, because its window start is part of its key. So this asserts the
   * rows go, and nothing depends on *when*.
   *
   * It sweeps the whole table, which includes any real expired buckets the
   * deployed app has left behind. That is the sweep's job and they are spent by
   * definition, so it is not a case of a test reaching outside its fixture.
   */
  it("deletes rows whose window has closed, and keeps open ones", async () => {
    const rule = testRule("sweep", { max: 5, windowMs: 60_000 });
    const stale = nextSubject();
    const live = nextSubject();

    // Dated an hour back, so its window is long closed.
    await enforceRateLimit(rule, stale, new Date(Date.now() - 60 * 60_000));
    expect(await bucketRows(stale)).toHaveLength(1);

    resetRateLimitSweepThrottle();

    // The sweep rides along on an enforce call rather than being exported, so
    // this is also the real trigger: one ordinary request cleans up.
    await enforceRateLimit(rule, live);

    /*
     * Fire-and-forget by design — the limiter does not await it, so neither can
     * the assertion. Polling rather than a fixed sleep keeps the case quick
     * when the delete is fast and tolerant when Neon is cold.
     */
    const swept = await waitFor(async () => (await bucketRows(stale)).length === 0);

    expect(swept).toBe(true);
    expect(await bucketRows(live)).toHaveLength(1);
  });
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}
