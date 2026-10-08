import { z } from "zod";

import { MANUAL_EVENT_TYPES, type ManualEventTypeValue } from "@/lib/constants/event";
import { toDateInputValue, todayAsDateOnly } from "@/lib/utils/date-only";
import {
  isFutureDateOnly,
  optionalText,
  requiredDateOnly,
  requiredText,
} from "@/lib/validations/fields";

/**
 * Manual timeline entries — the other half of the timeline (DESIGN.md §7,
 * Phase 3).
 *
 * The display half and the automatic events shipped in Phase 2: creating an
 * application writes one, and every status change writes another. This is what
 * lets a user record the things the system cannot see — a recruiter's reply, an
 * assessment link, a follow-up they sent.
 *
 * **Only `MANUAL_EVENT_TYPES` can be expressed here**, which is the whole point
 * of a separate enum from `EVENT_TYPES`. The three automatic types are not
 * merely rejected by the mutation, they cannot be named in a request at all —
 * the reasoning is in `constants/event`, and it comes down to the event log
 * being an analytics input that §3 treats as authoritative history.
 *
 * Shared by the form and the API (§4, rule 4), with the input side all strings,
 * as `validations/fields` explains.
 */

const EVENT_TITLE_MAX = 150;

/**
 * `@db.Text` in the schema, so this cap is a product decision rather than a
 * column limit. A timeline entry is a line in a history, not a document: the
 * thing that deserves three pages is a note, which is its own model with its own
 * screen. Generous enough that nobody writing a real entry will meet it.
 */
const EVENT_DESCRIPTION_MAX = 2_000;

const eventFields = {
  type: z.enum(MANUAL_EVENT_TYPES, { error: "Choose what kind of entry this is" }),
  title: requiredText("Title", EVENT_TITLE_MAX),
  description: optionalText("Description", EVENT_DESCRIPTION_MAX),
  occurredAt: requiredDateOnly("Date"),
};

/**
 * Applied after every field has parsed, so the complaint can name the field the
 * user has to fix — an issue with no `path` renders as a form-level message.
 *
 * **A timeline entry cannot be in the future**, and this is the one date rule in
 * the app that is strict in that direction. Elsewhere a future date is the
 * normal case (a deadline, an interview) and a past one is merely late. Here it
 * inverts: the timeline is a record of what *happened*, so an entry dated next
 * Tuesday is either a typo or a reminder — and a reminder is a task or an
 * interview, both of which are real models with real reminder behaviour. Letting
 * one in would also put a future date into the "ever reached INTERVIEW" history
 * §3 computes its rates from.
 */
export function eventCrossFieldRules(value: { occurredAt: Date }, ctx: z.RefinementCtx): void {
  if (isFutureDateOnly(value.occurredAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["occurredAt"],
      message: "A timeline entry cannot be dated in the future",
    });
  }
}

/**
 * One schema for three jobs: the form's resolver, `POST
 * /api/applications/:id/events`, and `PATCH /api/events/:id`.
 *
 * Unlike the application, where create and update genuinely differ — update
 * omits `status` and both carry an acknowledgement flag the form has no input
 * for — an event's four fields are identical in every direction. A second
 * schema here would be a copy with nothing to say, and the copy is what drifts.
 */
export const eventSchema = z.object(eventFields).superRefine(eventCrossFieldRules);

/** What the form holds: every field a string, as inputs produce. */
export type EventFormValues = z.input<typeof eventSchema>;

/** What the mutation receives: a narrowed type, a Date, and null for a blank. */
export type EventPayload = z.output<typeof eventSchema>;

/**
 * The form's starting state.
 *
 * A function rather than a constant, because one of the defaults is today — and
 * a module-scope constant would freeze the date at the moment the bundle was
 * evaluated. Left open overnight, a page would then offer yesterday as the
 * default, which is exactly the kind of wrong that nobody notices until the
 * timeline is wrong.
 *
 * Today rather than blank: an entry someone is adding is almost always something
 * that just happened, and `CUSTOM` is the only type with no better guess than
 * the most common one.
 */
export function emptyEventForm(): Required<EventFormValues> {
  return {
    type: "EMAIL_RECEIVED",
    title: "",
    description: "",
    occurredAt: todayAsDateOnly(),
  };
}

/**
 * A stored event, in the shape `toEventFormValues` needs.
 *
 * Spelled out rather than imported from Prisma, for the §4 rule that keeps
 * Prisma inside `src/server/`. The structural match is the compiler's problem at
 * the one call site.
 */
export type EventFormSource = {
  type: ManualEventTypeValue;
  title: string;
  description: string | null;
  occurredAt: Date;
};

/**
 * A stored event → the form's starting values.
 *
 * The inverse of what the schema does on submit, and it has to be exact:
 * returning `Required<EventFormValues>` is what makes a field added to the
 * schema fail the build until it is mapped here too.
 *
 * `toDateInputValue` reads the date back in **UTC**, the other half of the
 * date-only convention. Formatting in local time would show the 13th in the
 * input for a value stored as the 14th, and saving would then quietly move it.
 */
export function toEventFormValues(source: EventFormSource): Required<EventFormValues> {
  return {
    type: source.type,
    title: source.title,
    description: source.description ?? "",
    occurredAt: toDateInputValue(source.occurredAt),
  };
}
