import { z } from "zod";

import { isDateOnlyString, parseDateOnly } from "@/lib/utils/date-only";

/**
 * The field builders every form schema in the app is assembled from.
 *
 * Extracted from `validations/application` when Phase 3 began, because the six
 * entities it adds — events, interviews, assessments, notes, tasks, contacts —
 * all need the same four. Six copies of "blank becomes null, never empty string"
 * is six places for that rule to drift, and the one that drifts first is the one
 * nobody is looking at.
 *
 * **The input side is a string everywhere**, because that is what an `<input>`
 * holds. Forms post their raw values and the server re-validates with the same
 * schema (DESIGN.md §4, rule 4), so the parsed *output* must never be what goes
 * on the wire — a `Date` where "2026-03-14" is expected means the server
 * rejecting its own output. Every validation suite keeps a tripwire asserting a
 * schema cannot parse what it produced.
 */

export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .max(max, { error: `${label} must be at most ${max} characters` });
}

/**
 * Blank becomes null, never `""`.
 *
 * An empty string in a nullable column is a third state that means the same as
 * the second, and every read afterwards has to check for both. One of those
 * checks will eventually be missed, and the symptom is a UI rendering an empty
 * value where it has a perfectly good "—" for absent.
 */
export function optionalText(label: string, max: number) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value.length <= max, {
      error: `${label} must be at most ${max} characters`,
    })
    .transform((value) => (value === "" ? null : value));
}

/**
 * An enum field the user may leave alone. A `<select>` with no choice made
 * submits "", and absent means the same thing — both become null rather than
 * being rejected or stored as an empty string in an enum column.
 */
export function optionalEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  label: string,
) {
  return z
    .union([z.enum(values), z.literal("")])
    .optional()
    .refine((value) => value === undefined || value === "" || values.includes(value), {
      error: `Choose a valid ${label}`,
    })
    .transform((value) => (value === undefined || value === "" ? null : value));
}

/**
 * A calendar day the user may leave blank.
 *
 * Past dates are accepted everywhere this is used — §8 is explicit that a
 * deadline in the past is allowed and merely flagged, because people log things
 * late. A field that must *not* accept the future says so with its own refinement
 * after the object has parsed, so the complaint can name the field (see
 * `applicationCrossFieldRules`).
 */
export function optionalDateOnly(label: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value === "" || isDateOnlyString(value), {
      error: `Enter a valid ${label}`,
    })
    .transform((value) => (value === "" ? null : parseDateOnly(value)));
}

/**
 * A calendar day that has to be there.
 *
 * Separate from `optionalDateOnly` rather than a flag on it, because the output
 * types differ — `Date` against `Date | null` — and a boolean parameter cannot
 * express that to the compiler. Every caller would then have to narrow a value
 * it knows is present.
 */
export function requiredDateOnly(label: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .refine((value) => isDateOnlyString(value), { error: `Enter a valid ${label}` })
    .transform((value) => parseDateOnly(value));
}

/**
 * Tolerance on dates that must not be in the future.
 *
 * One day, not zero: a date-only value is stored as midnight **UTC** on the
 * chosen day (see `utils/date-only`), so a user in Asia/Kolkata picking "today"
 * late in the evening produces an instant that is already tomorrow in UTC. Zero
 * tolerance would reject today's date for everyone east of Greenwich.
 */
export const FUTURE_DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a stored date-only value is far enough ahead to be a typo.
 *
 * **Takes `unknown` on purpose, and the runtime check is load-bearing.** Zod 4
 * runs an object's `superRefine` even when one of its fields has already failed,
 * and the value handed to the rule for that field is the *untransformed* input —
 * so a `occurredAt` of "14-03-2026" arrives here as a string while TypeScript,
 * reading the schema's output type, is certain it is a `Date`.
 *
 * Calling `.getTime()` on it throws a `TypeError` out of the middle of parsing.
 * Inside a Route Handler that lands in `handleRouteError` as an unrecognised
 * throw and becomes a **500 with a generic message**, where the user should have
 * got a 400 naming the field — the error was already there in the field's own
 * refinement, and the crash is what stops it being delivered.
 *
 * This was a live bug in `applicationCrossFieldRules` from Phase 2, reachable by
 * any request that did not come from the date input — verified against the real
 * schema, not reasoned about. Returning false is the right answer rather than a
 * swallow: a value that is not a valid date is not a *future* date, and it
 * already carries its own complaint.
 */
export function isFutureDateOnly(date: unknown, now: number = Date.now()): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() - now > FUTURE_DATE_TOLERANCE_MS;
}
