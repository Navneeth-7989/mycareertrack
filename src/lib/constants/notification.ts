/**
 * The notification vocabulary — four types, four entities, four toggles.
 *
 * Written out as string literals rather than imported from `@prisma/client`,
 * for the reason given in `constants/application`: that import would pull Prisma
 * outside `src/server/` and break the one-import-site rule in DESIGN.md §4. The
 * test suite asserts these lists against `schema.prisma`, which is what stops
 * them drifting.
 *
 * **"Reminder" and "notification" are the same concept here** — a locked
 * decision, so there is no second model and no second word for it in the UI.
 * The inbox is the whole feature: no email, no push (§9).
 */

/**
 * Ordered by urgency, which is also the order the inbox groups them in when two
 * land on the same day. An interview is a commitment you have to be somewhere
 * for; a task you set yourself is the one you can move.
 */
export const NOTIFICATION_TYPES = [
  "INTERVIEW_UPCOMING",
  "ASSESSMENT_DEADLINE",
  "APPLICATION_DEADLINE",
  "TASK_DUE",
] as const;

export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFIABLE_ENTITIES = ["INTERVIEW", "ASSESSMENT", "APPLICATION", "TASK"] as const;

export type NotifiableEntityValue = (typeof NOTIFIABLE_ENTITIES)[number];

/**
 * The category tag beside an inbox row.
 *
 * Terser than the notification's own `title`, on the same reasoning as
 * `EVENT_TYPE_LABELS`: the title is the sentence ("Technical interview at
 * Google"), and this is the kind of thing it is.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationTypeValue, string> = {
  INTERVIEW_UPCOMING: "Interview",
  ASSESSMENT_DEADLINE: "Assessment",
  APPLICATION_DEADLINE: "Deadline",
  TASK_DUE: "Task",
};

/**
 * Which `User` column switches each type off.
 *
 * The map is the only place the two sets are connected, so adding a type
 * without deciding what controls it is a type error rather than a notification
 * nobody can turn off. Preferences are columns on `User` rather than a 1:1
 * table — §10.1, and a locked decision.
 */
export const NOTIFICATION_PREFERENCE_KEYS = {
  INTERVIEW_UPCOMING: "notifyInterviews",
  ASSESSMENT_DEADLINE: "notifyAssessments",
  APPLICATION_DEADLINE: "notifyDeadlines",
  TASK_DUE: "notifyTasks",
} as const satisfies Record<NotificationTypeValue, string>;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_KEYS)[NotificationTypeValue];

/**
 * What each toggle controls, in the user's words, for the settings page.
 *
 * Specific about *which* dates each one covers, because "Deadlines" on its own
 * is ambiguous in a product that has three different kinds — the application's
 * own closing date, an assessment's, and a task's.
 */
export const NOTIFICATION_PREFERENCE_COPY: Record<
  NotificationPreferenceKey,
  { label: string; description: string }
> = {
  notifyInterviews: {
    label: "Upcoming interviews",
    description: "Every scheduled round, including the ones you added by hand.",
  },
  notifyAssessments: {
    label: "Assessment deadlines",
    description: "Only assessments still marked pending — finished ones stop reminding you.",
  },
  notifyDeadlines: {
    label: "Application deadlines",
    description:
      "Roles you have saved but not yet applied to. Once an application is sent its closing date can no longer be acted on.",
  },
  notifyTasks: {
    label: "Task due dates",
    description: "Your own to-dos, until you tick them off.",
  },
};

/**
 * How far ahead a reminder fires, as a fixed set rather than a free number.
 *
 * `User.reminderHours` is an `Int` so the column can hold anything, but the API
 * accepts only these — a settings field that lets someone type 9 999 produces a
 * notification for every interview they will ever have, and there is no honest
 * answer to "what should this be" beyond a few sensible spans.
 *
 * **24 is the agreed default** (§9) and the column default.
 */
export const REMINDER_HOUR_OPTIONS = [6, 12, 24, 48, 72] as const;

export type ReminderHoursValue = (typeof REMINDER_HOUR_OPTIONS)[number];

export const REMINDER_HOURS_LABELS: Record<ReminderHoursValue, string> = {
  6: "6 hours before",
  12: "12 hours before",
  24: "A day before",
  48: "Two days before",
  72: "Three days before",
};

export function isReminderHours(value: number): value is ReminderHoursValue {
  return (REMINDER_HOUR_OPTIONS as readonly number[]).includes(value);
}

/** `User.defaultView` — which applications view the sidebar link lands on. */
export const VIEW_PREFERENCES = ["KANBAN", "TABLE"] as const;

export type ViewPreferenceValue = (typeof VIEW_PREFERENCES)[number];

export const VIEW_PREFERENCE_LABELS: Record<ViewPreferenceValue, string> = {
  KANBAN: "Board",
  TABLE: "Table",
};

export const VIEW_PREFERENCE_HINTS: Record<ViewPreferenceValue, string> = {
  KANBAN: "Columns by status, with drag and drop",
  TABLE: "Rows with search, filters and sorting",
};

/**
 * The cap on the unread badge.
 *
 * A bell reading "213" is a number nobody acts on, and it stops being a count
 * and starts being a reproach. Past the cap it says "9+", which carries the
 * only information that matters.
 */
export const UNREAD_BADGE_CAP = 9;

export function formatUnreadBadge(count: number): string {
  return count > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : String(count);
}

/**
 * What the bell's badge should show, from the two counts the shell reads.
 *
 * | unread | upcoming | result                    |
 * |--------|----------|---------------------------|
 * | > 0    | any      | `{ count: unread, "loud" }`   |
 * | 0      | > 0      | `{ count: upcoming, "quiet" }` |
 * | 0      | 0        | `null`                    |
 *
 * **A pure function rather than three ternaries in the component**, because the
 * table above is the decision and it is worth being able to test it directly —
 * the component around it is markup.
 *
 * The two tiers exist because one number cannot do the job. An unread count
 * alone vanishes the second you glance at a notification, leaving a bare bell
 * while the interview it was about is still tomorrow — so the one thing the
 * bell is for stops working as soon as it is used. A total count alone is
 * worse: it would include every reminder for every date already gone by, never
 * clear, and become wallpaper.
 *
 * `upcoming` counts only reminders whose event has not happened yet, which is
 * what makes the badge self-clearing: no sweep, nothing to dismiss, and the
 * number falls on its own as dates pass.
 */
export type BellBadge = {
  count: number;
  /** Loud = filled accent, there is something unseen. Quiet = seen, still ahead. */
  tone: "loud" | "quiet";
};

export function bellBadge(unread: number, upcoming: number): BellBadge | null {
  if (unread > 0) {
    // When something is unseen, "how many have I not looked at" is the more
    // urgent question — and it is the one that goes down when the user acts.
    return { count: unread, tone: "loud" };
  }

  if (upcoming > 0) {
    return { count: upcoming, tone: "quiet" };
  }

  return null;
}
