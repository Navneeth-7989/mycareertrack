import { z } from "zod";

import {
  DEFAULT_INTERVIEW_MINUTES,
  INTERVIEW_RESULTS,
  INTERVIEW_TYPES,
  MAX_INTERVIEW_MINUTES,
  MIN_INTERVIEW_MINUTES,
  type InterviewResultValue,
  type InterviewTypeValue,
} from "@/lib/constants/interview";
import { toDateTimeInputValue } from "@/lib/utils/date-time";
import {
  idSchema,
  optionalText,
  optionalWholeNumber,
  requiredDateTime,
} from "@/lib/validations/fields";
import { optionalUrl } from "@/lib/validations/url";

/**
 * Interview validation (DESIGN.md §3, §6, §7 Phase 3).
 *
 * **Every schema here is a factory taking a timezone**, which is the one
 * structural difference from every other validation module in the app. An
 * interview is an instant, not a calendar day, and `<input type="datetime-local">`
 * hands over a wall clock with no zone attached — so "2026-03-14T15:30" cannot
 * become a `Date` until something says which zone it was written in. That zone is
 * always `User.timezone`, read on the server on both the form side and the API
 * side, so the browser never decides it. See `utils/date-time`.
 *
 * **A past interview is valid.** §8 is explicit that post-hoc logging is normal —
 * people record the round they just walked out of — so there is deliberately no
 * future-only rule here, unlike a timeline entry, which deliberately has the
 * opposite one.
 */

const INTERVIEWER_NAME_MAX = 120;

/** Both `@db.Text`; the cap is a product decision, generous for real prep notes. */
const INTERVIEW_NOTES_MAX = 10_000;

/**
 * `endsAt` is collected as a **duration in minutes**, not as a second
 * datetime-local picker.
 *
 * Two pickers is the literal translation of the column and the worse interface:
 * the user knows "it's a 45-minute call", not the wall-clock moment it ends, and
 * making them compute 15:30 + 45 is work a computer should do. It also removes a
 * whole class of invalid input — an end before a start cannot be expressed, so
 * there is no cross-field rule to write and no way to store a negative interval.
 *
 * The mutation derives `endsAt = scheduledAt + minutes`, and
 * `toInterviewFormValues` inverts it from the stored difference. That round-trips
 * exactly for any stored value, including one this form could not have produced —
 * which is why the field is a free number rather than a select over common
 * lengths.
 */
function interviewFields(timeZone: string) {
  return {
    type: z.enum(INTERVIEW_TYPES, { error: "Choose the kind of round" }),
    scheduledAt: requiredDateTime("date and time", timeZone),
    durationMinutes: optionalWholeNumber("Duration", MIN_INTERVIEW_MINUTES, MAX_INTERVIEW_MINUTES),
    meetingUrl: optionalUrl("Enter a valid meeting link, for example meet.google.com/abc-defg"),
    /**
     * Free text, with no `Contact` link — a locked decision (§9). Interviewer
     * names arrive in a calendar invite with no email, and forcing a contact
     * record for each would add friction at the most time-pressured moment in the
     * product. The person ↔ application relationship is already covered by
     * `ApplicationContact`.
     */
    interviewerName: optionalText("Interviewer", INTERVIEWER_NAME_MAX),
    prepNotes: optionalText("Prep notes", INTERVIEW_NOTES_MAX),
    notes: optionalText("Notes", INTERVIEW_NOTES_MAX),
    /**
     * Offered on create as well as on edit, which looks odd for a round that has
     * not happened yet and is deliberate: the most common reason to add an
     * interview with a past date is to record one that is already over, and
     * making the user save and then immediately edit to say how it went would be
     * a worse first impression than a field they can ignore.
     */
    result: z.enum(INTERVIEW_RESULTS).default("PENDING"),
  };
}

/**
 * What `POST /api/interviews` accepts — the fields plus the application it
 * belongs to.
 *
 * Flat with `applicationId` in the body rather than nested under
 * `/api/applications/:id/interviews`, following §6's table. The reason it differs
 * from notes and events, which *are* nested: an interview is created from two
 * places, the application's detail page and the interviews page, and on the
 * second the application is a field the user picks rather than context the URL
 * already carries.
 */
export function createInterviewSchema(timeZone: string) {
  return z.object({ applicationId: idSchema, ...interviewFields(timeZone) });
}

/**
 * What `PATCH /api/interviews/:id` accepts.
 *
 * `applicationId` is **absent**, so an interview cannot be moved to a different
 * application. Not an omission: there is no such user intent — an interview
 * belongs to the role it was for — and allowing it would mean re-checking
 * ownership of a second application on every edit for a feature nobody asked
 * for.
 */
export function updateInterviewSchema(timeZone: string) {
  return z.object(interviewFields(timeZone));
}

/**
 * What the *form* validates: the interview's own fields, without the id.
 *
 * The application is chosen by a separate control and posted alongside, the same
 * arrangement as `acknowledgeDuplicate` on the application form — keeping it out
 * of here is what lets `emptyInterviewForm` stay exactly "every field the form
 * holds", enforced by the compiler.
 */
export function interviewFormSchema(timeZone: string) {
  return z.object(interviewFields(timeZone));
}

/**
 * What the form holds: every field a string, as inputs produce.
 *
 * Derived from the schema's **input** side rather than written out, which is not
 * cosmetic — `optionalText` and friends are `.optional()`, so the schema's input
 * type has optional keys, and a hand-written version with every key required is
 * not assignable to the resolver React Hook Form expects. The same reason
 * `ApplicationFormValues` is `z.input<typeof createApplicationSchema>`.
 *
 * The factory makes this slightly awkward — the type has to be read off a
 * *return* type — but the timezone cannot be dropped, so this is the cost.
 */
export type InterviewFormValues = z.input<ReturnType<typeof interviewFormSchema>>;

/** What the mutations receive: a Date, numbers, nulls for blank optionals. */
export type InterviewPayload = z.output<ReturnType<typeof updateInterviewSchema>>;

export type CreateInterviewPayload = z.output<ReturnType<typeof createInterviewSchema>>;

/**
 * The form's starting state, in the user's own timezone.
 *
 * A function taking a zone and a clock, for the same reason `emptyEventForm` is a
 * function: the default is derived from *now*, and a module-scope constant would
 * freeze it at the moment the bundle was evaluated.
 *
 * The default time is **tomorrow at 10:00 local**, not now. An interview is
 * almost always in the future when it is being scheduled, and "now" is the one
 * moment it is guaranteed not to be — a prefilled past timestamp is a value the
 * user has to clear rather than adjust.
 */
export function emptyInterviewForm(
  timeZone: string,
  now: Date = new Date(),
): Required<InterviewFormValues> {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return {
    type: "TECHNICAL",
    scheduledAt: `${toDateTimeInputValue(tomorrow, timeZone).slice(0, 10)}T10:00`,
    durationMinutes: String(DEFAULT_INTERVIEW_MINUTES),
    meetingUrl: "",
    interviewerName: "",
    prepNotes: "",
    notes: "",
    result: "PENDING",
  };
}

/**
 * A stored interview, in the shape `toInterviewFormValues` needs.
 *
 * Spelled out rather than imported from Prisma, for the §4 rule that keeps Prisma
 * inside `src/server/`.
 */
export type InterviewFormSource = {
  type: InterviewTypeValue;
  scheduledAt: Date;
  endsAt: Date | null;
  meetingUrl: string | null;
  interviewerName: string | null;
  prepNotes: string | null;
  notes: string | null;
  result: InterviewResultValue;
};

/** Milliseconds in a minute, for turning a stored interval back into a duration. */
const MINUTE_MS = 60 * 1000;

/**
 * A stored interview → the form's starting values.
 *
 * The inverse of what the schema does on submit. `scheduledAt` is read back in
 * the *same* zone it will be parsed in, which is the whole point of threading the
 * timezone through both directions — formatting here in one zone and parsing
 * there in another would move the interview a little on every save.
 *
 * The duration is recovered by subtraction, floored to whole minutes. A stored
 * `endsAt` at or before `scheduledAt` reads back as blank rather than as zero or
 * a negative: the form cannot express it, and showing "-30" in a number input
 * invites a save that would fail validation for a reason the user did not cause.
 */
export function toInterviewFormValues(
  source: InterviewFormSource,
  timeZone: string,
): Required<InterviewFormValues> {
  const minutes = source.endsAt
    ? Math.floor((source.endsAt.getTime() - source.scheduledAt.getTime()) / MINUTE_MS)
    : null;

  return {
    type: source.type,
    scheduledAt: toDateTimeInputValue(source.scheduledAt, timeZone),
    durationMinutes: minutes !== null && minutes >= MIN_INTERVIEW_MINUTES ? String(minutes) : "",
    meetingUrl: source.meetingUrl ?? "",
    interviewerName: source.interviewerName ?? "",
    prepNotes: source.prepNotes ?? "",
    notes: source.notes ?? "",
    result: source.result,
  };
}
