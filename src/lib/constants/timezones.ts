import { FALLBACK_TIMEZONE } from "@/lib/utils/timezone";

/**
 * The IANA timezone list the settings picker offers.
 *
 * **Asked for from the runtime, not checked into the repo.** The database ships
 * with the platform and changes a few times a year — zones are added, renamed
 * and merged — so a hand-maintained list here would be a list that slowly stops
 * matching what `isValidTimeZone` accepts. Asking `Intl` means the picker and
 * the validator are reading the same source, which is the property that
 * matters: the form can never offer a zone the server would reject.
 *
 * `Intl.supportedValuesOf` is ES2022 and present in every browser this app
 * supports as well as in Node, but it is not in the TypeScript lib this project
 * targets — hence the local declaration rather than a `lib` bump that would
 * widen what the rest of the codebase is allowed to assume.
 *
 * The fallback is not defensive padding. A runtime without the function would
 * otherwise render an empty combobox with no way to recover, so it degrades to
 * a handful of common zones plus the user's default, which keeps the field
 * usable rather than broken.
 */

declare const Intl: {
  supportedValuesOf?: (key: "timeZone") => string[];
  DateTimeFormat: typeof globalThis.Intl.DateTimeFormat;
};

/**
 * Enough to be usable if the runtime cannot enumerate zones. Weighted toward
 * where this product's users are — §9 puts the default at Asia/Kolkata — with
 * the hubs a student applying abroad would need.
 */
const FALLBACK_TIMEZONES = [
  FALLBACK_TIMEZONE,
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
] as const;

function loadTimezones(): readonly string[] {
  try {
    const supported = Intl.supportedValuesOf?.("timeZone");

    if (supported && supported.length > 0) {
      // Already sorted by the spec, but sorting again costs nothing and means
      // the picker's order does not depend on that guarantee holding.
      return [...supported].sort();
    }
  } catch {
    // An engine that has the property but throws on it. Nothing to do but fall
    // back.
  }

  return FALLBACK_TIMEZONES;
}

export const TIMEZONES: readonly string[] = loadTimezones();
