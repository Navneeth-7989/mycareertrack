/**
 * The caller's IP address, for the two rate limits in DESIGN.md §6 that have no
 * user to key on — credentials sign-in and registration.
 *
 * **Every header read here is attacker-controlled in the general case.** There
 * is no Node API for the peer address inside a Route Handler, so a forwarded
 * header is the only source available, and a client can send whatever it likes.
 * What makes it usable is the hop in front: Vercel *overwrites*
 * `x-forwarded-for` with the connecting address rather than appending to it, so
 * on the deployment this project targets the value is the platform's, not the
 * request's. Behind a proxy that appends, or with no proxy at all, it is a hint
 * and nothing more.
 *
 * So the IP limits are defence in depth, never authorization. Nothing is granted
 * on the basis of an IP — the only thing it does is slow an endpoint down, and
 * the worst a spoofed header achieves is slowing down someone else's bucket.
 * The limits that actually protect data are keyed on the session's user id,
 * which cannot be forged at all (§4 rule 3).
 */

/**
 * In precedence order, most trustworthy first.
 *
 * `x-vercel-forwarded-for` is set by the platform and is the one header a
 * request cannot usefully forge in production, because Vercel replaces it.
 * `x-real-ip` is what nginx and most reverse proxies set, and is a single
 * address rather than a list. `x-forwarded-for` is last because it is the one
 * that may be a client-prepended chain.
 */
const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

/**
 * A hard cap on the length of the value we are willing to use as part of a
 * bucket key.
 *
 * Not defensive clutter: the key is written to an indexed column, and the header
 * is supplied by the caller, so without a bound a request carrying an 8 KB
 * `x-forwarded-for` would put 8 KB into the primary key of `RateLimit` — and a
 * few thousand of those is an index the sweep then has to carry. 45 characters
 * is the longest a real address can be (an IPv4-mapped IPv6 address with a zone
 * identifier), so nothing legitimate is truncated.
 */
const MAX_IP_LENGTH = 45;

/**
 * What a bucket is keyed on when no address can be determined.
 *
 * A shared bucket, deliberately. The alternative — skipping the limit when the
 * header is missing — makes "send no headers" the way around it, which is the
 * one outcome a rate limiter must not have. The consequence is that in a
 * deployment with no proxy setting any of these headers, every anonymous caller
 * shares one register bucket; that is visible as an unexpectedly early 429
 * rather than as a hole, which is the right way round for this to fail.
 */
export const UNKNOWN_IP = "unknown";

/**
 * Reads the client address, or `null` if no header carried a usable one.
 *
 * Takes the **first** entry of a comma-separated chain, which is the original
 * client in the `x-forwarded-for` convention (each hop appends). On Vercel the
 * chain is a single address because the platform rewrites the header.
 */
export function clientIp(headers: Headers): string | null {
  for (const header of IP_HEADERS) {
    const raw = headers.get(header);

    if (!raw) {
      continue;
    }

    const first = raw.split(",")[0]?.trim();

    // An empty entry is a header that is present but says nothing — the next
    // header in precedence order is a better answer than "unknown".
    if (first) {
      return first.slice(0, MAX_IP_LENGTH);
    }
  }

  return null;
}

/** `clientIp` with the shared fallback applied, ready to use in a bucket key. */
export function clientIpBucket(headers: Headers): string {
  return clientIp(headers) ?? UNKNOWN_IP;
}
