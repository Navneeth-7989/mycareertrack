/**
 * Date-only values: deadlines, "applied on", assessment due dates.
 *
 * These are a different kind of value from an interview's `scheduledAt`, and
 * conflating the two is how a deadline ends up displaying as the day before.
 * An interview happens at an instant — 3pm in Bangalore is a point on the
 * timeline, and §4 converts it to the user's zone at the display boundary. A
 * deadline is a *calendar day*: "the 14th" is the 14th whether you read it from
 * Delhi or Dublin.
 *
 * Postgres has one column type here (`timestamptz`), so the convention is:
 *
 * - **Write** a date-only value as midnight **UTC** on that calendar day.
 * - **Read** it back formatted in **UTC**, never in the user's zone.
 *
 * Both halves matter. Storing midnight UTC and then formatting in
 * Asia/Kolkata still shows the right day (05:30 the same morning), but a user
 * in New York would see the day before — and the user's timezone is editable,
 * so the same row would change date when they travel. Formatting in UTC makes
 * the stored instant a label for a day rather than a moment, which is what the
 * value actually means.
 */

/** What `<input type="date">` produces and accepts: "2026-03-14". */
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyString(value: string): boolean {
  if (!DATE_INPUT_PATTERN.test(value)) {
    return false;
  }

  const parsed = parseDateOnly(value);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  /*
   * The round-trip is the actual check. V8 does not reject an out-of-range day
   * in the ISO form — it rolls it over, so "2026-02-31" parses happily as 3
   * March and "2026-02-29" in a non-leap year becomes 1 March. A NaN check
   * alone would accept a date the user never typed and silently store a
   * different one, which is worse than refusing it.
   */
  return toDateInputValue(parsed) === value;
}

/**
 * "2026-03-14" → the Date at 2026-03-14T00:00:00Z.
 *
 * `new Date("2026-03-14")` already parses as UTC midnight per the ECMAScript
 * date-only form, but the explicit suffix is what documents the intent — and
 * `new Date("2026-3-14")`, which is *not* the date-only form, silently parses as
 * local midnight instead. Callers should validate with `isDateOnlyString`
 * first; this is deliberately total, returning an Invalid Date rather than
 * throwing, so Zod's `refine` decides what to do about it.
 */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * A Date → "2026-03-14", for putting a stored value back into a date input.
 *
 * Read in UTC to match how it was written. `toISOString().slice(0, 10)` would
 * do the same thing; the explicit getters say why.
 */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * A stored date-only value → "14 Mar 2026".
 *
 * `timeZone: "UTC"` is the load-bearing option, for the reason in the header
 * comment. Day-month-year because the user base is Indian; the month is spelled
 * so that 03/04 is never ambiguous.
 */
export function formatDateOnly(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Today as a date-only string, in the viewer's own calendar.
 *
 * The one place local time is correct: "is this deadline overdue" is a question
 * about the user's today, not UTC's. Compared as strings so no timezone
 * arithmetic is involved — "2026-03-14" < "2026-03-15" lexically and
 * chronologically, which is the one thing ISO dates are for.
 */
export function todayAsDateOnly(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}
