/**
 * The default landing page after a successful sign-in.
 */
export const DEFAULT_REDIRECT = "/dashboard";

/**
 * Reduces an untrusted `callbackUrl` query parameter to a safe same-origin
 * path.
 *
 * Redirecting to a raw query parameter is the classic open-redirect bug: a link
 * to /login?callbackUrl=https://evil.example/login sends the user somewhere
 * that can convincingly impersonate the app immediately after they authenticate.
 *
 * Only a path is ever allowed through. Protocol-relative URLs ("//evil.example")
 * are rejected explicitly, because they look like paths but browsers treat them
 * as absolute. Backslashes are rejected too — some browsers normalise "/\" to
 * "//".
 */
export function safeRedirectPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || !candidate.startsWith("/")) {
    return DEFAULT_REDIRECT;
  }

  if (candidate.startsWith("//") || candidate.includes("\\")) {
    return DEFAULT_REDIRECT;
  }

  return candidate;
}
