import { handleRouteError } from "@/lib/api/errors";
import { ok } from "@/lib/api/responses";
import { getNotificationInbox } from "@/server/queries/notifications";
import { requireApiUser } from "@/server/require-user";
import { generateDueNotifications } from "@/server/services/notifications";

/**
 * `GET /api/notifications` — the inbox, generating anything due first
 * (DESIGN.md §6).
 *
 * **Generation on a GET is deliberate, and it is the design.** §3 calls it
 * compute-on-read: there is no cron because notifications are in-app only, so
 * the work only matters at the moment someone looks. The write is a set of
 * upserts against `@@unique([userId, type, entityId])`, which makes the request
 * idempotent — a GET that can be repeated without changing the outcome, which
 * is the property that actually matters, rather than one that performs no
 * writes at all.
 *
 * `generateDueNotifications` directly rather than the `cache()`d
 * `ensureNotificationsGenerated`: React's cache is a per-render scope, and this
 * is a Route Handler with no render to share. It also means a failure here
 * surfaces as a 500 instead of being swallowed — correct for an API client,
 * where the page-render wrapper deliberately does the opposite so a generation
 * hiccup cannot take down the whole shell.
 *
 * No pagination. §6 gives this endpoint none, and the query caps the past list
 * itself — an inbox is bounded by the dates in your own calendar, not by a
 * growing table.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();

    await generateDueNotifications(user);

    return ok(await getNotificationInbox(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
