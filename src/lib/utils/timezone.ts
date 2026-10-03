/**
 * Timezone detection and validation (DESIGN.md §10.4).
 *
 * Detection is the primary mechanism and the fallback applies only when it
 * fails — so nothing here ever rejects a submission over a timezone. A user
 * with an exotic browser gets Asia/Kolkata and can change it in settings;
 * being told their onboarding is invalid would be absurd.
 */

export const FALLBACK_TIMEZONE = "Asia/Kolkata";

/**
 * True for a timezone the runtime actually knows.
 *
 * Validated by asking Intl to use it rather than by matching a pattern: the
 * IANA database changes, and "Area/Location" shaped strings like
 * "Fake/Nowhere" would pass any regex worth writing.
 */
export function isValidTimeZone(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    // RangeError for an unknown zone — the only way to find out.
    return false;
  }
}

/**
 * The browser's timezone, or the fallback. Safe to call on the server, where
 * `resolvedOptions()` reports the host's zone rather than the user's — which
 * is why only client code calls it.
 */
export function detectTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return detected && isValidTimeZone(detected) ? detected : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}
