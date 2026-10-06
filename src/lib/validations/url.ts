import { z } from "zod";

/**
 * URL validation, shared by every form that accepts a link.
 *
 * Extracted from `profile.ts` when the application form arrived needing the
 * same three rules — a company website, a job posting URL and a LinkedIn
 * profile are all values that end up in an `href`, and the defence against
 * `javascript:` reaching one must not be reimplemented per form.
 */

/**
 * Nobody types the scheme. "linkedin.com/in/navneet" is what comes out of a
 * copy-paste from the address bar, and rejecting it over a missing "https://"
 * is the kind of validation that makes a form feel hostile — so it is added
 * rather than demanded.
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  // Matches any scheme, not just one followed by "//". That distinction
  // matters: "mailto:me@example.com" has no "//", so a "://" test would treat
  // it as scheme-less and prepend https — and "https://mailto:me@example.com"
  // is a *valid* URL, pointing at example.com with "mailto:me" as credentials.
  // The input would be silently rewritten into a different, working link
  // instead of being rejected.
  //
  // Dots are excluded from the scheme pattern so "example.com:8080/x" reads as
  // a host and port rather than as a scheme. Real schemes may contain dots per
  // RFC 3986, but none in use do, whereas host:port is typed by actual people.
  return /^[a-z][a-z0-9+-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * http and https only (DESIGN.md §8) — this value ends up in an `href`, and
 * "javascript:alert(1)" must never get there.
 *
 * Embedded credentials are refused as well. "https://linkedin.com@evil.example"
 * is a valid URL whose host is evil.example, and it is the oldest trick for
 * making a link look like it goes somewhere it doesn't. No genuine profile or
 * careers-page URL has a userinfo component.
 *
 * The dot check rejects "https://localhost" style input, which is never a real
 * company website.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

export const URL_ERROR = "Enter a valid link, for example linkedin.com/in/your-name";

export function requiredUrl(label: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .transform(normalizeUrl)
    .refine(isHttpUrl, { error: URL_ERROR });
}

/**
 * An empty optional URL becomes null, not "". A nullable column with empty
 * strings in it means every read has to treat "" and null as the same thing,
 * and eventually one of them forgets.
 *
 * `error` overrides the shared message for fields where "linkedin.com/in/…" is
 * the wrong example to show.
 */
export function optionalUrl(error: string = URL_ERROR) {
  return z
    .string()
    .optional()
    .transform((value) => normalizeUrl(value ?? ""))
    .refine((value) => value === "" || isHttpUrl(value), { error })
    .transform((value) => (value === "" ? null : value));
}
