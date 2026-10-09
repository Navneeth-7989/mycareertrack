/**
 * The rate-limit table from DESIGN.md §6, and the window arithmetic that goes
 * with it.
 *
 * Here rather than in `server/services/rate-limit.ts` for the same reason
 * `summarizeAnalytics` is split from `getAnalytics`: the arithmetic is the part
 * that can be wrong in a way no integration test would notice, and it is only
 * testable without a database if it does not live next to the Prisma call.
 *
 * **Fixed windows, not sliding.** A window is a clock-aligned slice —
 * `floor(now / windowMs) * windowMs` — which means two concurrent requests
 * compute the *same* bucket key without coordinating, and that is the whole
 * reason the limiter can be a single atomic statement rather than a
 * read-then-write. The cost is a boundary burst: 5 attempts at 14:59 and 5 more
 * at 15:01 are 10 inside two minutes against a 5-per-15-minute limit. A sliding
 * window would close that, at the price of a row per request and a `count(*)`
 * over a time range on every call. For the threats in §8 — credential stuffing,
 * mass account creation, autocomplete scraping — a factor of two at the seam is
 * not the difference between safe and unsafe, and the simplicity is.
 */

export type RateLimitRule = {
  /**
   * The bucket-key prefix, and the only part of a key that is written by us
   * rather than derived from a request. Changing one silently resets that
   * limit's counters, which is harmless but worth knowing.
   */
  readonly name: string;
  /** Requests allowed per window. The (max + 1)th is refused. */
  readonly max: number;
  readonly windowMs: number;
  /**
   * The first sentence of the 429. Written per limit because "too many
   * requests" tells a user nothing about which thing to stop doing, and these
   * messages reach three different screens.
   */
  readonly refusal: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Keyed by call site rather than collected in an array, so a route names the
 * limit it is enforcing and a typo is a compile error.
 */
export const RATE_LIMITS = {
  /**
   * Per email **and** IP, per §6 — the two together, not either alone. Per IP
   * alone would lock out a university NAT or an office; per email alone would
   * let anyone lock a known address out of their own account by failing five
   * sign-ins against it, which turns a brute-force defence into a
   * denial-of-service tool.
   */
  credentialsLogin: {
    name: "login",
    max: 5,
    windowMs: 15 * MINUTE,
    refusal: "Too many sign-in attempts.",
  },

  /**
   * Per IP, because registration has no user yet. This is also the limit on the
   * one endpoint in the app that can answer "is this email registered?" — a
   * duplicate email is a 409 and there is no way around that without making
   * registration silently fail — so it is doing double duty as the brake on
   * enumeration.
   */
  register: {
    name: "register",
    max: 3,
    windowMs: HOUR,
    refusal: "Too many accounts have been created from this network.",
  },

  resumeUpload: {
    name: "resume-upload",
    max: 20,
    windowMs: HOUR,
    refusal: "Too many uploads.",
  },

  applicationCreate: {
    name: "application-create",
    max: 100,
    windowMs: HOUR,
    refusal: "Too many applications created.",
  },

  companySearch: {
    name: "company-search",
    max: 60,
    windowMs: MINUTE,
    refusal: "Too many searches.",
  },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * The `code` a rate-limited credentials sign-in comes back with.
 *
 * Credentials sign-in does not go through a Route Handler, so it cannot answer
 * with the 429 envelope the other four limits use — Auth.js owns that endpoint
 * and gives `authorize` one failure signal, whose only customisable part is a
 * code string. It lives here rather than in `server/auth.ts` because both ends
 * need it and the login form is a Client Component: importing it from the auth
 * config would pull Prisma into the browser bundle.
 *
 * See `RateLimitedSignin` in `server/auth.ts` for why naming this failure
 * specifically leaks nothing.
 */
export const RATE_LIMITED_SIGNIN_CODE = "rate_limited";

/**
 * The slice of time a request falls in, clock-aligned to the window length.
 *
 * `expiresAt` is both the window's end and the row's sweep date, which is why
 * there is no third column: a bucket is spent the moment its window closes, so
 * "when may this be retried" and "when may this be deleted" are the same
 * instant.
 */
export function rateLimitWindow(
  rule: RateLimitRule,
  now: Date,
): { startsAt: Date; expiresAt: Date } {
  const startMs = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs;

  return {
    startsAt: new Date(startMs),
    expiresAt: new Date(startMs + rule.windowMs),
  };
}

/**
 * Seconds until the window closes, for the `Retry-After` header.
 *
 * Rounded **up**, and floored at 1. A client that retries at exactly the
 * advertised second lands in the same window it was just refused from if the
 * remainder was truncated, and a `Retry-After: 0` reads as "go ahead" — both
 * produce a second refusal that looks like the header lied.
 */
export function retryAfterSeconds(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * "Too many sign-in attempts. Try again in about 12 minutes."
 *
 * Deliberately vague — "about 12 minutes", never "at 15:04:31". The exact reset
 * instant is the one piece of information that makes a limit easy to ride: a
 * script that knows it can sleep precisely. It is also not information the user
 * needs; they need to know whether to wait or to come back later.
 */
export function rateLimitMessage(rule: RateLimitRule, seconds: number): string {
  return `${rule.refusal} Try again in ${formatRetryAfter(seconds)}.`;
}

function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) {
    return "a minute";
  }

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) {
    return `about ${minutes} minutes`;
  }

  const hours = Math.ceil(minutes / 60);

  return hours === 1 ? "about an hour" : `about ${hours} hours`;
}
