import { Prisma } from "@prisma/client";

import { startOfTodayUtc } from "@/lib/utils/date-only";

import { prisma } from "../db";

/**
 * Notification reads: the inbox at `/notifications` and the topbar bell's badge.
 *
 * Generation is somebody else's job — `services/notifications.ts` owns it, and
 * the caller runs it before reading so the list is complete. Keeping the write
 * out of here is what lets the badge be a single cheap count on pages that have
 * already generated.
 *
 * Both reads are scoped by `userId` in the WHERE clause (§4).
 */

const notificationSelect = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  title: true,
  body: true,
  linkUrl: true,
  isRead: true,
  eventAt: true,
  triggerAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationItem = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

/**
 * How many past notifications the inbox keeps on screen.
 *
 * Only the past list is capped, the same bargain `PAST_INTERVIEW_LIMIT` and
 * `COMPLETED_TASK_LIMIT` make: what is ahead of you is bounded by reality —
 * nobody has two hundred interviews next week — while what is behind you grows
 * forever.
 */
export const PAST_NOTIFICATION_LIMIT = 50;

export type NotificationInbox = {
  /**
   * The event has not happened yet. Soonest first, so the thing to act on is
   * the first row.
   */
  upcoming: NotificationItem[];
  /** The event has been and gone. Most recent first. */
  past: NotificationItem[];
  hasMorePast: boolean;
  unreadCount: number;
  /** Counts the whole set, not the page, so the heading can say how many there are. */
  total: number;
};

/**
 * The inbox.
 *
 * **Split by whether the event has happened, not by read state.** The project
 * already uses this shape for interviews and tasks, and it is the split that
 * matters here: a reminder for an interview in six hours is a thing to do, and
 * one for an interview that finished yesterday is a record. Grouping by
 * read/unread instead would hide the useful distinction behind one the user
 * controls by clicking, and would move a row the instant they looked at it.
 *
 * **"Has happened" means two different things, and getting it wrong was a real
 * bug here.** An interview is an instant, so it is past once `now` goes by it.
 * A deadline is a calendar day stored at midnight **UTC** (see
 * `utils/date-only`), so comparing it against `now` files anything due *today*
 * as already over — by mid-morning UTC, a task due today was landing under
 * "Already happened" while its own row read "Due today". Date-only rows are
 * therefore compared against midnight today, which is the same rule
 * `NotificationRow`'s `describeEvent` renders by. The two must agree or the
 * heading contradicts the row under it.
 *
 * **Nothing is deleted.** A past notification stays until the user's account
 * does. Sweeping read-and-past rows would keep the table smaller, but it would
 * also mean the only evidence that the app warned you about something
 * disappears the moment the thing happens — and the cap above already stops the
 * page growing without bound.
 *
 * `Promise.all` rather than `$transaction`, per the Neon cold-start reasoning in
 * `db.ts`. There is nothing to make consistent: four independent reads, and the
 * worst a write landing between them could do is show a count one ahead of the
 * list it labels.
 */
export async function getNotificationInbox(
  userId: string,
  now: Date = new Date(),
): Promise<NotificationInbox> {
  const upcomingWhere = stillAheadWhere(userId, now);
  const pastWhere = alreadyPastWhere(userId, now);

  const [upcoming, past, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({
      where: upcomingWhere,
      select: notificationSelect,
      orderBy: [{ eventAt: "asc" }, { id: "asc" }],
    }),

    prisma.notification.findMany({
      where: pastWhere,
      select: notificationSelect,
      orderBy: [{ eventAt: "desc" }, { id: "desc" }],
      // Take-limit-plus-one, the same trick the timeline uses: one extra row is
      // how the page knows there is more without a second count.
      take: PAST_NOTIFICATION_LIMIT + 1,
    }),

    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    upcoming,
    past: past.slice(0, PAST_NOTIFICATION_LIMIT),
    hasMorePast: past.length > PAST_NOTIFICATION_LIMIT,
    unreadCount,
    total,
  };
}

/**
 * "The event has not happened yet" and its complement, as WHERE clauses.
 *
 * **Extracted so the bell and the inbox cannot disagree**, which is the lesson
 * from the bug this file already carries a comment about: the split has to
 * respect the two kinds of date, and three copies of that rule is three places
 * for it to drift. `NotificationRow`'s `describeEvent` renders by the same rule,
 * and the inbox heading contradicting the row beneath it is exactly what
 * happens when one of them is updated alone.
 *
 * `entityType` is the discriminator because it is the column that says which
 * kind of value `eventAt` holds — an `INTERVIEW` row's is an instant, so it is
 * past once the clock goes by it; everything else's is a calendar day stored at
 * midnight UTC, so it is past only once the day is over.
 */
function stillAheadWhere(userId: string, now: Date): Prisma.NotificationWhereInput {
  const today = new Date(startOfTodayUtc(now));

  return {
    userId,
    OR: [
      { entityType: "INTERVIEW", eventAt: { gte: now } },
      { entityType: { not: "INTERVIEW" }, eventAt: { gte: today } },
    ],
  };
}

function alreadyPastWhere(userId: string, now: Date): Prisma.NotificationWhereInput {
  const today = new Date(startOfTodayUtc(now));

  return {
    userId,
    OR: [
      { entityType: "INTERVIEW", eventAt: { lt: now } },
      { entityType: { not: "INTERVIEW" }, eventAt: { lt: today } },
    ],
  };
}

/**
 * What the topbar bell needs: how many are unread, and how many are still
 * ahead of you.
 *
 * **Two numbers, not one, and that is the point.** An unread count alone
 * disappears the moment you read a notification — so after glancing at
 * "Technical interview at Adobe" you are back to a bare bell while the
 * interview is still tomorrow, which is precisely the at-a-glance signal the
 * bell exists to give. A total count alone is worse: it would include every
 * reminder for every date that has already gone by, so it would never clear
 * and a badge that never clears is a badge nobody reads.
 *
 * So the badge counts what is **still ahead**, and `unread` decides how loudly
 * it says it. Both numbers fall to zero on their own as events pass, with no
 * sweep and nothing for the user to dismiss.
 *
 * Two indexed counts rather than a `findMany`: the topbar renders on every page
 * in the app, so it must not pay to load rows it is only going to count.
 */
export type NotificationBellCounts = {
  /** Drives the badge's emphasis — filled and loud, or quiet. */
  unread: number;
  /** The number on the badge: reminders whose event has not happened yet. */
  upcoming: number;
};

export async function getNotificationBellCounts(
  userId: string,
  now: Date = new Date(),
): Promise<NotificationBellCounts> {
  const [unread, upcoming] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.count({ where: stillAheadWhere(userId, now) }),
  ]);

  return { unread, upcoming };
}
