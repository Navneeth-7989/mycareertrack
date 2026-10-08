/**
 * Instants — an interview's `scheduledAt`, and nothing else so far.
 *
 * **The counterpart to `date-only`, and the distinction is the whole reason both
 * files exist.** A deadline is a calendar day: "the 14th" is the 14th whether you
 * read it from Delhi or Dublin, so it is written as midnight UTC and read back in
 * UTC. An interview is a *point on the timeline*: 3pm in Bangalore is one moment,
 * and the same moment is 9:30am in London. Treating one like the other is how an
 * interview displays an hour out, or a deadline displays as the day before.
 *
 * So the convention here is the opposite of `date-only`'s:
 *
 * - **Write** the true UTC instant (DESIGN.md §3: `scheduledAt DateTime // UTC`).
 * - **Read** it back converted into a timezone — *one* conversion, at the display
 *   boundary, which is what §4 asks for.
 *
 * **Which timezone: the user's stored `User.timezone`, never the browser's.**
 * That is a deliberate choice with two consequences worth stating. The good one
 * is that every conversion happens on the server, where the zone is a column on
 * a row already being read — so a Server Component renders the final string and
 * there is no hydration mismatch, no flash of UTC, and no client-side formatting
 * code at all. The cost is that a user who travels sees their interviews in the
 * zone they configured rather than the one they are standing in, which is
 * arguably the correct answer anyway: an interview scheduled for 3pm IST is a
 * 3pm IST commitment, and it is editable in settings.
 */

/** What `<input type="datetime-local">` produces and accepts: "2026-03-14T15:30". */
const DATE_TIME_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Whether a string is a well-formed wall-clock value.
 *
 * Validated against a **UTC** interpretation on purpose, even though the value
 * is about to be read in the user's zone. The question here is only whether the
 * calendar components are real — 14 March exists, 31 February does not — and
 * that answer is the same in every zone. Mixing the zone in would also make the
 * check reject the one hour each spring that genuinely does not exist locally,
 * which is a worse outcome than normalising it (see `parseWallClockInZone`).
 *
 * The round-trip is the actual test, for the reason in `date-only`: V8 rolls an
 * out-of-range day over rather than rejecting it, so "2026-02-31" parses happily
 * as 3 March. A NaN check alone would accept a date the user never typed.
 */
export function isDateTimeInputString(value: string): boolean {
  if (!DATE_TIME_INPUT_PATTERN.test(value)) {
    return false;
  }

  const asUtc = new Date(`${value}:00.000Z`);

  if (Number.isNaN(asUtc.getTime())) {
    return false;
  }

  return asUtc.toISOString().slice(0, 16) === value;
}

/**
 * The calendar fields an instant shows in a given zone.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, which is not the same thing:
 * some ICU builds render midnight as "24" under `hour12: false`, and "24:00"
 * would then parse as the next day. `h23` is the explicit 00–23 request.
 */
function zonedParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const fields: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      fields[part.type] = part.value;
    }
  }

  return fields;
}

/**
 * An instant → the wall clock it shows in a zone, as "2026-03-14T15:30".
 *
 * This is what goes into a `datetime-local` input when editing a stored
 * interview. Formatting in the *browser's* zone instead would show a user whose
 * stored zone differs a time they never entered, and saving would then move the
 * interview.
 */
export function toDateTimeInputValue(date: Date | null | undefined, timeZone: string): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const p = zonedParts(date, timeZone);

  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * A wall clock in a zone → the UTC instant it names. The inverse of
 * `toDateTimeInputValue`, and the only genuinely difficult function in this file.
 *
 * There is no primitive for it: `new Date(string)` can read a string as UTC or as
 * the *host's* local zone, and neither is "the user's zone". So the offset is
 * recovered by measurement rather than looked up — read the string as if it were
 * UTC, ask what wall clock that instant actually shows in the target zone, and
 * shift by the difference.
 *
 * **Twice, and the second pass is not redundant.** The first shift can cross a
 * DST boundary, after which the offset it used is the wrong one — a 2am wall
 * clock corrected by +5:30 can land on the other side of a transition where the
 * offset is +4:30. The second pass measures again from where the first landed and
 * converges. Two is sufficient for every real zone because transitions are
 * hours apart while the correction after one pass is at most the size of the
 * transition itself.
 *
 * **The one input it cannot honour** is a wall clock inside a spring-forward gap
 * — 2:30am on a night that jumps 2am → 3am. That local time does not exist, so
 * no instant maps to it, and this returns the nearest one that does rather than
 * failing. Correct behaviour for a scheduling field: the user picked a time their
 * calendar offered, and refusing it would be stranger than nudging it. India,
 * which is the primary user base and the default zone, has no DST at all.
 */
export function parseWallClockInZone(value: string, timeZone: string): Date {
  const target = Date.parse(`${value}:00.000Z`);

  if (Number.isNaN(target)) {
    return new Date(Number.NaN);
  }

  let instant = target;

  for (let pass = 0; pass < 2; pass += 1) {
    const shown = Date.parse(`${toDateTimeInputValue(new Date(instant), timeZone)}:00.000Z`);

    if (Number.isNaN(shown)) {
      return new Date(Number.NaN);
    }

    instant += target - shown;
  }

  return new Date(instant);
}

/**
 * An instant → "14 Mar 2026, 3:30 pm" in the given zone.
 *
 * Day-month-year with a spelled month, matching `formatDateOnly`, so 03/04 is
 * never ambiguous. The time is included because that is the entire difference
 * between this and a deadline.
 */
export function formatInstantInZone(date: Date | null | undefined, timeZone: string): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

/** Just the clock part — "3:30 pm" — for a row whose date is already a heading. */
export function formatTimeInZone(date: Date | null | undefined, timeZone: string): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

/**
 * The calendar day an instant falls on in a zone, as "2026-03-14".
 *
 * For grouping a list under day headings, and for the day arithmetic below.
 * Deliberately a string: two instants are on the same day exactly when these
 * match, with no timezone reasoning at the comparison site.
 */
export function zonedDateOnly(date: Date, timeZone: string): string {
  return toDateTimeInputValue(date, timeZone).slice(0, 10);
}

/** Milliseconds in a day. Exact, because both operands below are UTC midnight. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days from today until an instant, **counted in the user's zone** —
 * negative for the past, 0 for today, 1 for tomorrow.
 *
 * The sign is the opposite of `daysSinceDateOnly`, which counts backwards
 * because it answers "how long ago was this applied". This one answers "how long
 * until this happens", which is what every interview and deadline label needs.
 *
 * Both sides are reduced to their zoned calendar day first, which is what makes
 * the division exact: subtracting raw timestamps would cross a DST boundary in
 * some zones and come out at 23.96 days, and flooring that is off by one for
 * half the year. It also means "tomorrow" is tomorrow *in the user's calendar*,
 * so an interview at 9am tomorrow is "tomorrow" even if it is only 11 hours away.
 */
export function daysUntilInZone(date: Date, timeZone: string, now: Date = new Date()): number {
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const then = Date.parse(`${zonedDateOnly(date, timeZone)}T00:00:00.000Z`);
  const today = Date.parse(`${zonedDateOnly(now, timeZone)}T00:00:00.000Z`);

  return Math.round((then - today) / DAY_MS);
}

/**
 * A day count from `daysUntilInZone` → the phrase beside a time: "today",
 * "tomorrow", "in 3 days", "4 days ago".
 *
 * Capitalised, unlike `relativeDayLabel`, because this one is used as a *heading*
 * over a group of rows rather than as a suffix after a date.
 */
export function daysUntilLabel(days: number): string {
  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Tomorrow";
  }

  if (days === -1) {
    return "Yesterday";
  }

  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}
