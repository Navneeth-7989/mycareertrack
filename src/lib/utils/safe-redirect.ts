/**
 * The default landing page after a successful sign-in.
 */
export const DEFAULT_REDIRECT = "/dashboard";

/**
 * Characters the URL parser **deletes** from a URL rather than encoding or
 * rejecting: tab, line feed and carriage return (WHATWG URL, "cannot-be-a-base"
 * stripping). They are the reason a string check on the raw value is not enough.
 *
 * `/<TAB>/evil.example` starts with a single slash, contains no backslash, and
 * so passes every obvious guard — and then the browser removes the tab and
 * navigates to `//evil.example`, which is protocol-relative and therefore
 * off-site. Measured against Node's URL parser during the Phase 5 security
 * sweep, which is how this was found: all three of tab, LF and CR resolve
 * `/x/evil.example` to `https://evil.example/`.
 */
const URL_STRIPPED_CHARS = /[\t\n\r]/g;

/**
 * An origin no real deployment can have, used only to resolve a candidate path
 * so its origin can be compared. `.invalid` is reserved by RFC 2606, so this
 * can never accidentally match the host the app is actually served from.
 */
const SENTINEL_ORIGIN = "https://redirect-check.invalid";

/**
 * Reduces an untrusted `callbackUrl` query parameter to a safe same-origin
 * path.
 *
 * Redirecting to a raw query parameter is the classic open-redirect bug: a link
 * to /login?callbackUrl=https://evil.example/login sends the user somewhere
 * that can convincingly impersonate the app **immediately after they
 * authenticate**, which is the moment they are least likely to check the
 * address bar. Both sign-in paths end in one of these — `router.push` after
 * credentials, `signIn(provider, { redirectTo })` for OAuth — so this function
 * is the only thing standing between a crafted link and a phishing page.
 *
 * Three layers, because neither of the first two was enough on its own:
 *
 * 1. **Reject anything that is not a plain path**, after deleting the
 *    characters the URL parser deletes. Protocol-relative URLs
 *    ("//evil.example") look like paths but are absolute, and backslashes are
 *    rejected because some browsers normalise "/\" to "//".
 * 2. **Resolve it and compare origins.** A string check can only refuse the
 *    bypasses someone thought of; resolving the candidate the way the browser
 *    will and requiring the result to stay on the sentinel origin refuses the
 *    ones nobody thought of too.
 * 3. **Apply rule 1 again to the result.** This is the one that is easy to
 *    leave out and the sweep's second finding: `/..//evil.example` passes rule
 *    1, and resolving it *keeps* the sentinel origin — because it genuinely is
 *    a path — while normalising away the `/..` to leave a **pathname** of
 *    `//evil.example`. Hand that back and the caller's own navigation resolves
 *    it a second time, off-site. A path is only safe if it is still a path
 *    after being normalised.
 *
 * The value returned is the **resolved** path, not the input — so what the
 * caller navigates to is the string that was actually validated, with no
 * remaining parser normalisation left to change it afterwards.
 */
export function safeRedirectPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate) {
    return DEFAULT_REDIRECT;
  }

  // Before any check, so the string being judged is the string the browser will
  // navigate to rather than the one the request carried.
  const stripped = candidate.replace(URL_STRIPPED_CHARS, "");

  if (!isPlainPath(stripped)) {
    return DEFAULT_REDIRECT;
  }

  let resolved: URL;

  try {
    resolved = new URL(stripped, SENTINEL_ORIGIN);
  } catch {
    // An input the parser refuses outright is not something to pass on to a
    // router that may be more forgiving.
    return DEFAULT_REDIRECT;
  }

  if (resolved.origin !== SENTINEL_ORIGIN) {
    return DEFAULT_REDIRECT;
  }

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Layer 3. The same rule as layer 1 deliberately, because the question is the
  // same question — "is this still a path?" — asked of a string that
  // normalisation may have changed under us.
  return isPlainPath(path) ? path : DEFAULT_REDIRECT;
}

/**
 * One slash, then something that is not another slash and not a backslash.
 *
 * Extracted so the input check and the output check cannot drift apart. They
 * are the same rule and a bypass found against one is a bypass against both.
 */
function isPlainPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}
