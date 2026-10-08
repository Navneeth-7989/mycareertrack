/**
 * Display metadata for `EventType` — the timeline's vocabulary.
 *
 * Written out as string literals rather than imported from `@prisma/client`,
 * for the reason given in `constants/application`: that import would pull Prisma
 * outside `src/server/` and break the one-import-site rule in DESIGN.md §4. The
 * test suite asserts this list against `schema.prisma`, which is what stops it
 * drifting.
 */

/**
 * Ordered by where an event falls in a search, not by the schema's declaration
 * order. This is the order the "add an entry" picker reads, and it is what the
 * test below compares against the enum.
 */
export const EVENT_TYPES = [
  "SAVED",
  "APPLIED",
  "STATUS_CHANGE",
  "EMAIL_RECEIVED",
  "ASSESSMENT",
  "INTERVIEW",
  "FOLLOW_UP",
  "OFFER",
  "REJECTION",
  "CUSTOM",
] as const;

export type EventTypeValue = (typeof EVENT_TYPES)[number];

/**
 * The type tag beside a timeline entry.
 *
 * Deliberately terser than the event's own `title`. The title is the sentence —
 * "Moved to Interview" — and this is the category it belongs to, so repeating
 * the sentence here would print the same words twice on one line.
 */
export const EVENT_TYPE_LABELS: Record<EventTypeValue, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  STATUS_CHANGE: "Status",
  EMAIL_RECEIVED: "Email",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  FOLLOW_UP: "Follow-up",
  OFFER: "Offer",
  REJECTION: "Rejection",
  CUSTOM: "Custom",
};

/**
 * The types a user may write by hand — seven of the ten.
 *
 * **The three that are missing are missing on purpose.** `SAVED`, `APPLIED` and
 * `STATUS_CHANGE` are written by the system inside the same transaction as the
 * column change they describe: `createApplication` writes the first two beside
 * `appliedAt`, and `updateApplicationStatus` writes the third under a
 * compare-and-set that guarantees the "From X" in its description is the status
 * the application actually moved from.
 *
 * Allowing a hand-written one would undo that guarantee from the other side.
 * §3's interview and offer rates are computed from `ApplicationEvent` rather
 * than from the current status — *"ever reached INTERVIEW needs history, not
 * current status"* — so the event log is an analytics input, and it is
 * append-only in practice. A `STATUS_CHANGE` entry typed into a form is a
 * transition that never happened, recorded as indistinguishable from one that
 * did. The status pill on the detail page is the way to move an application, and
 * it writes the event itself.
 *
 * What remains is the complement, and it is the right seven: every one of them
 * is something the user knows and the system cannot observe. A recruiter's email
 * arriving, an assessment link turning up, a follow-up sent, a verbal offer — the
 * product has no way to see any of it.
 */
export const MANUAL_EVENT_TYPES = [
  "EMAIL_RECEIVED",
  "ASSESSMENT",
  "INTERVIEW",
  "FOLLOW_UP",
  "OFFER",
  "REJECTION",
  "CUSTOM",
] as const;

export type ManualEventTypeValue = (typeof MANUAL_EVENT_TYPES)[number];

/**
 * Whether a type may be written by hand.
 *
 * A runtime check as well as a compile-time one, because the API boundary is
 * where this has to hold: the Zod schema narrows to `MANUAL_EVENT_TYPES`, and
 * this is what the mutation reads to decide whether an *existing* row is one a
 * user is allowed to have authored.
 */
export function isManualEventType(type: EventTypeValue): type is ManualEventTypeValue {
  return (MANUAL_EVENT_TYPES as readonly EventTypeValue[]).includes(type);
}

/**
 * What each manual type is for, shown under the picker.
 *
 * Worth the words for the same reason as `APPLICATION_STATUS_HINTS`: the
 * difference between "Assessment" and "Interview" as a *timeline entry* is not
 * self-evident when the product also has Assessment and Interview records, and a
 * user guessing between them produces analytics nobody can trust.
 */
export const MANUAL_EVENT_TYPE_HINTS: Record<ManualEventTypeValue, string> = {
  EMAIL_RECEIVED: "They replied — counts as a response",
  ASSESSMENT: "A test was sent, taken or returned",
  INTERVIEW: "An interview happened",
  FOLLOW_UP: "You chased it up",
  OFFER: "An offer was made",
  REJECTION: "They said no",
  CUSTOM: "Anything else worth remembering",
};

/**
 * The placeholder in the title field, per type.
 *
 * A placeholder rather than a prefilled value, deliberately. Prefilling would
 * produce a timeline full of identical generic lines from users who accepted the
 * default, and the title is the one thing that makes two same-day entries
 * distinguishable at a glance.
 */
export const MANUAL_EVENT_TITLE_PLACEHOLDERS: Record<ManualEventTypeValue, string> = {
  EMAIL_RECEIVED: "Recruiter replied about next steps",
  ASSESSMENT: "HackerRank test link received",
  INTERVIEW: "Technical round with the platform team",
  FOLLOW_UP: "Emailed the recruiter to check in",
  OFFER: "Verbal offer over the phone",
  REJECTION: "Rejected after the final round",
  CUSTOM: "What happened",
};
