/**
 * Display metadata for `EventType` — the timeline's vocabulary.
 *
 * Written out as string literals rather than imported from `@prisma/client`,
 * for the reason given in `constants/application`: that import would pull Prisma
 * outside `src/server/` and break the one-import-site rule in DESIGN.md §4. The
 * test suite asserts this list against `schema.prisma`, which is what stops it
 * drifting.
 *
 * Only two of these are written today — `SAVED`/`APPLIED` on create and
 * `STATUS_CHANGE` on a move — but the map is complete, because a timeline that
 * met an unlabelled type would render a blank tag. Phase 3 writes the rest.
 */

/**
 * Ordered by where an event falls in a search, not by the schema's declaration
 * order. Nothing iterates this for display yet; it exists so the Phase 3 "add
 * an event" picker has one canonical order to read, and so the test below can
 * compare against the enum.
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
