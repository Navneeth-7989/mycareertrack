import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/utils/safe-redirect";

/**
 * The open-redirect guard on both sign-in paths (DESIGN.md §8).
 *
 * Written during the Phase 5 security sweep, which found a live bypass: the
 * previous implementation checked the raw string, and the URL parser **deletes**
 * tab, LF and CR — so `/<TAB>/evil.example` passed every check and then
 * navigated to `//evil.example`. Each case below is the actual off-site URL the
 * browser would have reached, not a hypothetical.
 *
 * The property being tested is one sentence: whatever comes back from this
 * function must resolve to the app's own origin, for every input.
 */

/** Resolves a returned path the way a browser would, to assert where it lands. */
function lands(path: string): string {
  return new URL(path, "https://careertrack.app").origin;
}

const APP_ORIGIN = "https://careertrack.app";

describe("safeRedirectPath", () => {
  it("passes an ordinary in-app path through", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/applications/abc123")).toBe("/applications/abc123");
  });

  it("keeps a query string and a fragment", () => {
    // The whole point of a callbackUrl is landing back where the user was, and
    // the applications list keeps its filters in the URL.
    expect(safeRedirectPath("/applications?status=APPLIED&page=2")).toBe(
      "/applications?status=APPLIED&page=2",
    );
    expect(safeRedirectPath("/settings#notifications")).toBe("/settings#notifications");
  });

  it("falls back when there is nothing to redirect to", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath([])).toBe(DEFAULT_REDIRECT);
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(safeRedirectPath(["/tasks", "/dashboard"])).toBe("/tasks");
  });

  it("refuses an absolute URL", () => {
    expect(safeRedirectPath("https://evil.example/login")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("http://evil.example")).toBe(DEFAULT_REDIRECT);
  });

  it("refuses a protocol-relative URL, which looks like a path but is not", () => {
    expect(safeRedirectPath("//evil.example")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("//evil.example/dashboard")).toBe(DEFAULT_REDIRECT);
  });

  it("refuses a backslash, which some browsers normalise to a slash", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("\\\\evil.example")).toBe(DEFAULT_REDIRECT);
  });

  /**
   * **The bypass the sweep found.** All three characters are deleted by the URL
   * parser, so each of these became `//evil.example` — a working open redirect
   * on the one navigation that happens immediately after authentication.
   */
  it.each([
    ["tab", "/\t/evil.example"],
    ["line feed", "/\n/evil.example"],
    ["carriage return", "/\r/evil.example"],
    ["tab inside the host", "/\t//evil.example"],
    ["several, mixed", "/\t\n\r/evil.example"],
  ])("refuses a %s used to smuggle a protocol-relative URL", (_label, candidate) => {
    expect(safeRedirectPath(candidate)).toBe(DEFAULT_REDIRECT);
    expect(lands(safeRedirectPath(candidate))).toBe(APP_ORIGIN);
  });

  /**
   * **The sweep's second finding, and the subtler of the two.** This is a
   * genuine path, so resolving it keeps the app's origin — but normalisation
   * eats the `/..` and leaves a pathname of `//evil.example`, which the
   * caller's own navigation then resolves off-site. An origin check alone does
   * not catch it; the result has to be re-checked as a path.
   */
  it.each(["/..//evil.example", "/a/..//evil.example", "/../..//evil.example"])(
    "refuses %s, which normalises into a protocol-relative path",
    (candidate) => {
      expect(safeRedirectPath(candidate)).toBe(DEFAULT_REDIRECT);
    },
  );

  it("still allows a harmless dot segment that normalises to a real path", () => {
    // The guard is on what the path becomes, not on `..` appearing in it.
    expect(safeRedirectPath("/applications/../dashboard")).toBe("/dashboard");
  });

  it("refuses a scheme that is not http", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe(DEFAULT_REDIRECT);
  });

  /**
   * The invariant, stated once over everything above and a few more besides. A
   * future addition to the list cannot quietly return something off-site.
   */
  it("never returns a path that leaves the app's origin", () => {
    const attempts = [
      "/dashboard",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n//evil.example",
      "/\r\t//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/..//evil.example",
      "/%2F%2Fevil.example",
      "/%09/evil.example",
      "/ /evil.example",
      "///evil.example",
      "/dashboard\\@evil.example",
      "\t//evil.example",
    ];

    for (const attempt of attempts) {
      const result = safeRedirectPath(attempt);

      expect(result.startsWith("/"), `${JSON.stringify(attempt)} → ${result}`).toBe(true);
      expect(lands(result), `${JSON.stringify(attempt)} → ${result}`).toBe(APP_ORIGIN);
    }
  });
});
