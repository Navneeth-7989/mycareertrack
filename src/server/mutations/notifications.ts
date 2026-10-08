import { NotFoundError } from "@/lib/api/errors";

import { prisma } from "../db";

/**
 * The only two writes a user can make to their own inbox: mark one read, and
 * mark everything read (DESIGN.md §6).
 *
 * **There is no delete, and nothing creates a notification from a request.**
 * Generation is entirely server-side, derived from interviews, deadlines and
 * due dates — so the only thing a client can tell us about a notification is
 * that it has been seen. That keeps the whole feature out of reach of a forged
 * request: there is no endpoint that could write someone else's inbox because
 * there is no create endpoint at all.
 */

/**
 * Marks one notification read.
 *
 * `updateMany` with `{ id, userId }`, never `update({ where: { id } })` — §4's
 * rule, so ownership lives in the WHERE clause and somebody else's id can never
 * be flipped. A `count` of zero means the row is not this user's (or does not
 * exist), and both answer **404**, never 403, so the response cannot be used to
 * test whether an id is real.
 *
 * **Idempotent on purpose.** Marking an already-read notification read again
 * succeeds rather than conflicting: the row is reached by clicking a link, and a
 * double click, a back-button, or two tabs must not produce an error about a
 * state the user already wanted.
 */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<{ id: string; isRead: true }> {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });

  if (count === 0) {
    throw new NotFoundError("Notification not found");
  }

  return { id, isRead: true };
}

/**
 * Marks everything read, and reports how many it actually changed.
 *
 * Scoped to `isRead: false` rather than updating the whole set, so the count
 * returned is the number of rows that were genuinely cleared — which is what
 * the toast says. Updating all of them would touch rows for no reason and
 * report a number the user does not recognise.
 *
 * An empty inbox is not an error: zero is a valid answer, and the button is
 * hidden when there is nothing to clear anyway.
 */
export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { updated: count };
}
