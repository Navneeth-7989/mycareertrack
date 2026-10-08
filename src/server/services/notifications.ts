import { cache } from "react";

import {
  NOTIFICATION_PREFERENCE_KEYS,
  type NotifiableEntityValue,
  type NotificationTypeValue,
} from "@/lib/constants/notification";
import { INTERVIEW_TYPE_LABELS, type InterviewTypeValue } from "@/lib/constants/interview";
import { startOfTodayUtc } from "@/lib/utils/date-only";

import { prisma } from "../db";

/**
 * Notification generation — the "compute-on-read" half of DESIGN.md §3.
 *
 * **No cron, and that is a design decision rather than a shortcut.**
 * Notifications are in-app only (a locked decision — no email, no push), so
 * there is nobody to notify while the user is away. The work only matters the
 * moment they open the app, which is exactly when this runs. Zero extra
 * infrastructure, nothing to monitor, and `@@unique([userId, type, entityId])`
 * makes it idempotent. If push is ever added this moves to a cron without
 * touching the data model.
 *
 * `@@unique([userId, type, entityId])` is load-bearing: it is the only thing
 * standing between one interview and a fresh notification on every page load.
 * Every write here is an upsert against it.
 */

/**
 * The most notifications one pass will create per source.
 *
 * Generation runs on every authenticated page load, so an unbounded `findMany`
 * feeding an unbounded set of upserts is a page that gets slower the more a
 * user tracks. Fifty tasks due inside the reminder window is already past the
 * point where an inbox is useful, and the rest arrive on the next pass as the
 * earlier ones leave the window.
 */
const GENERATION_LIMIT = 50;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * The two windows a reminder can be measured in, which is the subtlety in this
 * whole file.
 *
 * **An interview is an instant; a deadline is a calendar day.** `scheduledAt` is
 * a point on the timeline, so "24 hours before" is literally `now + 24h` and
 * §7's done-when — *"an interview 20 hours out produces exactly one inbox
 * item"* — is an exact comparison. A deadline is stored as midnight **UTC** on
 * a day (see `utils/date-only`) and means "the 14th" regardless of where it is
 * read from; subtracting 24 hours from it would produce 00:00 on the 13th UTC,
 * which is 05:30 on the 13th in Asia/Kolkata — a reminder that fires at
 * breakfast on one side of the world and the previous evening on the other.
 *
 * So date-only sources are compared in whole days: a reminder window of N hours
 * covers deadlines falling between today and `ceil(N / 24)` days ahead,
 * inclusive. At the default 24 that is "due today or tomorrow", which is what a
 * day-before reminder means for something dated to a day.
 *
 * Both halves start at the present, not in the past. An overdue deadline is not
 * a *reminder* — it is a fact the tasks page, the assessments page and the
 * dashboard all surface already, and generating one here would mean a stale
 * inbox item for every date a user ever missed.
 */
export type ReminderWindow = {
  now: Date;
  /** Interviews: `now` through `now + reminderHours`. */
  instantUntil: Date;
  /** Date-only deadlines: midnight UTC today... */
  dayFrom: Date;
  /** ...through midnight UTC `ceil(reminderHours / 24)` days ahead, inclusive. */
  dayUntil: Date;
};

export function reminderWindow(now: Date, reminderHours: number): ReminderWindow {
  const days = Math.max(1, Math.ceil(reminderHours / 24));
  const today = startOfTodayUtc(now);

  return {
    now,
    instantUntil: new Date(now.getTime() + reminderHours * MS_PER_HOUR),
    dayFrom: new Date(today),
    dayUntil: new Date(today + days * MS_PER_DAY),
  };
}

/**
 * One notification, before it knows what time it will fire.
 *
 * `triggerAt` is deliberately absent: it is `eventAt` minus the user's
 * `reminderHours`, computed once at the write so the column is derived in
 * exactly one place. The drafts themselves carry only what the row said.
 */
export type NotificationDraft = {
  type: NotificationTypeValue;
  entityType: NotifiableEntityValue;
  entityId: string;
  title: string;
  body: string | null;
  linkUrl: string;
  eventAt: Date;
};

/**
 * **No title says "tomorrow", and none ever should.**
 *
 * A title is written once and then only rewritten when generation sees the row
 * again, so any relative phrasing baked into it is wrong within the hour. The
 * stored text names the *thing*; `eventAt` carries the time, and the inbox
 * computes "in 6 hours" at render against the user's zone. That is also why the
 * row stores `eventAt` at all rather than just `triggerAt`.
 */
export function interviewDraft(interview: {
  id: string;
  type: string;
  scheduledAt: Date;
  application: { id: string; jobTitle: string; company: { name: string } };
}): NotificationDraft {
  const label = INTERVIEW_TYPE_LABELS[interview.type as InterviewTypeValue] ?? "Interview";

  return {
    type: "INTERVIEW_UPCOMING",
    entityType: "INTERVIEW",
    entityId: interview.id,
    title: `${label} interview at ${interview.application.company.name}`,
    body: interview.application.jobTitle,
    // The application, not an /interviews deep link: the round is one fact
    // about an application, and the page that answers "what do I need to know
    // before this call" is the one with the job description and the timeline
    // on it.
    linkUrl: `/applications/${interview.application.id}`,
    eventAt: interview.scheduledAt,
  };
}

export function assessmentDraft(assessment: {
  id: string;
  name: string;
  deadline: Date;
  application: { id: string; jobTitle: string; company: { name: string } };
}): NotificationDraft {
  return {
    type: "ASSESSMENT_DEADLINE",
    entityType: "ASSESSMENT",
    entityId: assessment.id,
    title: `${assessment.name} is due`,
    body: `${assessment.application.jobTitle} at ${assessment.application.company.name}`,
    linkUrl: `/applications/${assessment.application.id}`,
    eventAt: assessment.deadline,
  };
}

export function applicationDraft(application: {
  id: string;
  jobTitle: string;
  deadline: Date;
  company: { name: string };
}): NotificationDraft {
  return {
    type: "APPLICATION_DEADLINE",
    entityType: "APPLICATION",
    entityId: application.id,
    title: `Applications close for ${application.jobTitle}`,
    body: application.company.name,
    linkUrl: `/applications/${application.id}`,
    eventAt: application.deadline,
  };
}

export function taskDraft(task: {
  id: string;
  title: string;
  dueDate: Date;
  application: { id: string; jobTitle: string; company: { name: string } } | null;
}): NotificationDraft {
  return {
    type: "TASK_DUE",
    entityType: "TASK",
    entityId: task.id,
    title: `${task.title} is due`,
    // Null rather than invented context for a standalone task, which §3 allows.
    body: task.application
      ? `${task.application.jobTitle} at ${task.application.company.name}`
      : null,
    // A standalone task has nowhere else to go, and the tasks page is where it
    // can actually be ticked off.
    linkUrl: task.application ? `/applications/${task.application.id}` : "/tasks",
    eventAt: task.dueDate,
  };
}

/** Everything generation needs about the user: identity plus their four toggles. */
export type NotificationUser = {
  id: string;
  notifyInterviews: boolean;
  notifyAssessments: boolean;
  notifyDeadlines: boolean;
  notifyTasks: boolean;
  reminderHours: number;
};

function isEnabled(user: NotificationUser, type: NotificationTypeValue): boolean {
  return user[NOTIFICATION_PREFERENCE_KEYS[type]];
}

/**
 * Reads the four sources and upserts a notification for everything inside the
 * window. Returns how many drafts it wrote, which is only used by the probe and
 * the tests.
 *
 * **A disabled toggle costs nothing.** The preference is checked before the
 * query rather than filtering results afterwards, so a user who turns everything
 * off pays zero reads on every page load instead of four.
 *
 * `Promise.all`, not `$transaction`, for the Neon cold-start reason in `db.ts`:
 * the two-second transaction acquisition budget is shorter than a suspended
 * database takes to wake, and this runs on the render path of every page in the
 * app. There is nothing to make atomic either — each upsert is independent and
 * idempotent, so a half-finished pass completes itself on the next load.
 */
export async function generateDueNotifications(
  user: NotificationUser,
  now: Date = new Date(),
): Promise<number> {
  const window = reminderWindow(now, user.reminderHours);

  const applicationContext = {
    select: {
      id: true,
      jobTitle: true,
      company: { select: { name: true } },
    },
  } as const;

  const [interviews, assessments, applications, tasks] = await Promise.all([
    isEnabled(user, "INTERVIEW_UPCOMING")
      ? prisma.interview.findMany({
          where: {
            userId: user.id,
            scheduledAt: { gte: window.now, lte: window.instantUntil },
          },
          select: { id: true, type: true, scheduledAt: true, application: applicationContext },
          orderBy: { scheduledAt: "asc" },
          take: GENERATION_LIMIT,
        })
      : [],

    isEnabled(user, "ASSESSMENT_DEADLINE")
      ? prisma.assessment.findMany({
          where: {
            userId: user.id,
            // Only outstanding ones. A finished assessment still has a deadline
            // on it, and reminding someone about work they have already done is
            // the fastest way to teach them to ignore the bell.
            status: "PENDING",
            deadline: { gte: window.dayFrom, lte: window.dayUntil },
          },
          select: { id: true, name: true, deadline: true, application: applicationContext },
          orderBy: { deadline: "asc" },
          take: GENERATION_LIMIT,
        })
      : [],

    isEnabled(user, "APPLICATION_DEADLINE")
      ? prisma.application.findMany({
          where: {
            userId: user.id,
            /*
             * Saved but not sent. §3's invariant is
             * `appliedAt IS NOT NULL ⟺ status ≠ SAVED`, so this is "still at
             * SAVED" expressed against the indexed column — and it is the whole
             * point of the reminder: a posting's closing date is actionable
             * exactly while you have not applied yet. Once it is sent, the date
             * is history.
             */
            appliedAt: null,
            deadline: { gte: window.dayFrom, lte: window.dayUntil },
          },
          select: {
            id: true,
            jobTitle: true,
            deadline: true,
            company: { select: { name: true } },
          },
          orderBy: { deadline: "asc" },
          take: GENERATION_LIMIT,
        })
      : [],

    isEnabled(user, "TASK_DUE")
      ? prisma.task.findMany({
          where: {
            userId: user.id,
            isCompleted: false,
            dueDate: { gte: window.dayFrom, lte: window.dayUntil },
          },
          select: { id: true, title: true, dueDate: true, application: applicationContext },
          orderBy: { dueDate: "asc" },
          take: GENERATION_LIMIT,
        })
      : [],
  ]);

  const drafts: NotificationDraft[] = [
    // The non-null assertions on the date fields are what the `where` clauses
    // above already guarantee — a range filter cannot match null — but the
    // columns are nullable, so the compiler needs telling.
    ...interviews.map(interviewDraft),
    ...assessments.map((row) => assessmentDraft({ ...row, deadline: row.deadline! })),
    ...applications.map((row) => applicationDraft({ ...row, deadline: row.deadline! })),
    ...tasks.map((row) => taskDraft({ ...row, dueDate: row.dueDate! })),
  ];

  if (drafts.length === 0) return 0;

  await Promise.all(drafts.map((draft) => upsertNotification(user, draft)));

  return drafts.length;
}

/**
 * One upsert against `@@unique([userId, type, entityId])`.
 *
 * **The update rewrites the content but never touches `isRead`.** Both halves
 * are deliberate:
 *
 * - Rewriting means a rescheduled interview shows its new time instead of the
 *   one it was first generated for. The row is identified by the *entity*, not
 *   by the moment, so it should keep describing that entity truthfully.
 * - Not resetting `isRead` is what stops the inbox becoming unreadable. This
 *   runs on every page load while the event is inside the window, so setting
 *   `isRead: false` here would make the item permanently unread — the user
 *   would clear it and watch it come straight back. The accepted cost is that
 *   an interview moved to a different day does not re-alert someone who has
 *   already read it; re-alerting only on an actual change would take a
 *   read-then-conditional-write per item, which is not worth four extra queries
 *   on every page in the app.
 */
async function upsertNotification(user: NotificationUser, draft: NotificationDraft) {
  const triggerAt = new Date(draft.eventAt.getTime() - user.reminderHours * MS_PER_HOUR);

  return prisma.notification.upsert({
    where: {
      userId_type_entityId: {
        userId: user.id,
        type: draft.type,
        entityId: draft.entityId,
      },
    },
    create: {
      userId: user.id,
      type: draft.type,
      entityType: draft.entityType,
      entityId: draft.entityId,
      title: draft.title,
      body: draft.body,
      linkUrl: draft.linkUrl,
      eventAt: draft.eventAt,
      triggerAt,
    },
    update: {
      title: draft.title,
      body: draft.body,
      linkUrl: draft.linkUrl,
      eventAt: draft.eventAt,
      triggerAt,
    },
    select: { id: true },
  });
}

/**
 * The generation call every rendered page makes, memoised and fail-safe.
 *
 * **`cache()`** because the shell and the inbox both want it: `(app)/layout.tsx`
 * runs it so the bell's badge is current, and `/notifications` runs it so the
 * list it is about to read is complete. Without memoisation that is two full
 * passes on one request, and the second would be pure waste.
 *
 * **The try/catch is the important part.** This runs inside the layout that
 * wraps *every authenticated page*, so an unhandled failure here would not
 * degrade notifications — it would replace the entire application with an error
 * page. A notification that arrives one page load late is invisible; a dashboard
 * that will not render is not. The error is logged and the caller carries on
 * with whatever is already in the table.
 */
export const ensureNotificationsGenerated = cache(async (user: NotificationUser): Promise<void> => {
  try {
    await generateDueNotifications(user);
  } catch (error) {
    console.error("Notification generation failed", error);
  }
});
