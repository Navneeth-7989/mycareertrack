import { describe, expect, it } from "vitest";

import { clientIp, clientIpBucket, UNKNOWN_IP } from "@/lib/api/client-ip";
import {
  RATE_LIMITS,
  rateLimitMessage,
  rateLimitWindow,
  retryAfterSeconds,
} from "@/lib/constants/rate-limit";

/**
 * The arithmetic and header parsing behind the limits in DESIGN.md §6.
 *
 * Pure on purpose — see the header of `lib/constants/rate-limit`. The part that
 * talks to Postgres is covered in `tests/server/rate-limit.test.ts`; what is
 * tested here is the two things that would be wrong silently: a window that
 * two concurrent callers compute differently, and a header that lets a caller
 * choose its own bucket.
 */

describe("rateLimitWindow", () => {
  const rule = RATE_LIMITS.credentialsLogin; // 15 minutes

  it("aligns the window to the clock, not to the first request", () => {
    const { startsAt, expiresAt } = rateLimitWindow(rule, new Date("2026-10-09T12:07:33.412Z"));

    expect(startsAt.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(expiresAt.toISOString()).toBe("2026-10-09T12:15:00.000Z");
  });

  /**
   * The property the atomic single-statement limiter depends on. If two
   * requests a millisecond apart could compute different window starts, they
   * would increment different rows and each get a count of 1 — a limiter that
   * cannot count.
   */
  it("gives every instant inside one window the same key", () => {
    const starts = [
      "2026-10-09T12:00:00.000Z",
      "2026-10-09T12:00:00.001Z",
      "2026-10-09T12:07:30.000Z",
      "2026-10-09T12:14:59.999Z",
    ].map((at) => rateLimitWindow(rule, new Date(at)).startsAt.toISOString());

    expect(new Set(starts).size).toBe(1);
  });

  it("starts a new window the instant the previous one closes", () => {
    const previous = rateLimitWindow(rule, new Date("2026-10-09T12:14:59.999Z"));
    const next = rateLimitWindow(rule, new Date("2026-10-09T12:15:00.000Z"));

    expect(next.startsAt.getTime()).toBe(previous.expiresAt.getTime());
  });

  it("aligns each limit to its own window length", () => {
    const at = new Date("2026-10-09T12:37:42.000Z");

    // 1 minute, so the window starts at the minute.
    expect(rateLimitWindow(RATE_LIMITS.companySearch, at).startsAt.toISOString()).toBe(
      "2026-10-09T12:37:00.000Z",
    );

    // An hour, so it starts on the hour.
    expect(rateLimitWindow(RATE_LIMITS.register, at).startsAt.toISOString()).toBe(
      "2026-10-09T12:00:00.000Z",
    );
  });
});

describe("retryAfterSeconds", () => {
  /**
   * Rounded up and floored at 1, both for the same reason: a client that
   * retries at exactly the advertised moment must not be refused again, which
   * is what a truncated remainder or a `Retry-After: 0` would produce.
   */
  it("rounds up so the advertised moment is after the window closes", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");

    expect(retryAfterSeconds(new Date("2026-10-09T12:00:30.400Z"), now)).toBe(31);
    expect(retryAfterSeconds(new Date("2026-10-09T12:15:00.000Z"), now)).toBe(900);
  });

  it("never returns zero or a negative, even for a window already closed", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");

    expect(retryAfterSeconds(now, now)).toBe(1);
    expect(retryAfterSeconds(new Date("2026-10-09T11:59:00.000Z"), now)).toBe(1);
  });
});

describe("rateLimitMessage", () => {
  it("names what to stop doing and gives a coarse duration", () => {
    expect(rateLimitMessage(RATE_LIMITS.credentialsLogin, 900)).toBe(
      "Too many sign-in attempts. Try again in about 15 minutes.",
    );
    expect(rateLimitMessage(RATE_LIMITS.companySearch, 45)).toBe(
      "Too many searches. Try again in a minute.",
    );
    expect(rateLimitMessage(RATE_LIMITS.register, 3_600)).toBe(
      "Too many accounts have been created from this network. Try again in about an hour.",
    );
  });

  /**
   * No exact reset instant in any message — that is the one detail that makes a
   * limit easy to ride, and the user does not need it.
   */
  it("never quotes a clock time or a precise number of seconds", () => {
    for (const rule of Object.values(RATE_LIMITS)) {
      for (const seconds of [1, 59, 60, 61, 900, 3_600, 7_200]) {
        const message = rateLimitMessage(rule, seconds);

        expect(message).not.toMatch(/\d{1,2}:\d{2}/);
        expect(message).not.toMatch(/second/);
      }
    }
  });
});

describe("clientIp", () => {
  function headers(values: Record<string, string>): Headers {
    return new Headers(values);
  }

  it("prefers the platform header over the forwarded chain", () => {
    expect(
      clientIp(
        headers({
          "x-vercel-forwarded-for": "203.0.113.7",
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "198.51.100.9, 10.0.0.1",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls through the precedence order when a header is absent", () => {
    expect(clientIp(headers({ "x-real-ip": "10.0.0.1" }))).toBe("10.0.0.1");
    expect(clientIp(headers({ "x-forwarded-for": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  /**
   * An empty-but-present header says nothing, so the next one in precedence
   * order is a better answer than giving up and sharing the unknown bucket.
   */
  it("skips a header that is present and empty", () => {
    expect(clientIp(headers({ "x-real-ip": "   ", "x-forwarded-for": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
  });

  it("takes the original client from a proxy chain", () => {
    expect(clientIp(headers({ "x-forwarded-for": " 198.51.100.9 , 10.0.0.1 , 10.0.0.2 " }))).toBe(
      "198.51.100.9",
    );
  });

  it("handles IPv6, which contains colons but no commas", () => {
    expect(clientIp(headers({ "x-forwarded-for": "2001:db8::8a2e:370:7334" }))).toBe(
      "2001:db8::8a2e:370:7334",
    );
  });

  /**
   * The header is attacker-controlled and the value becomes part of a primary
   * key, so the cap is what stops a request from writing kilobytes into an
   * index.
   */
  it("truncates a value too long to be an address", () => {
    const absurd = "1".repeat(9_000);

    expect(clientIp(headers({ "x-real-ip": absurd }))?.length).toBe(45);
  });

  it("returns null when nothing carries an address", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "user-agent": "x" }))).toBeNull();
  });

  /**
   * The bucket falls back to a shared key rather than skipping the limit —
   * "send no headers" must not be the way around a rate limit.
   */
  it("buckets an unknown address rather than exempting it", () => {
    expect(clientIpBucket(headers({}))).toBe(UNKNOWN_IP);
    expect(clientIpBucket(headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});
