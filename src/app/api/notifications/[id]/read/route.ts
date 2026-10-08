import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok } from "@/lib/api/responses";
import { markNotificationRead } from "@/server/mutations/notifications";
import { requireApiUser } from "@/server/require-user";

/**
 * `PATCH /api/notifications/:id/read` (DESIGN.md §6).
 *
 * **No body.** The path says what this does, and the only state a client can
 * put a notification into is "read" — there is no un-read, because the
 * information "you have already seen this" is not something a user needs to be
 * able to lie about to themselves. A body carrying `{ isRead: true }` would be
 * a field with exactly one legal value.
 *
 * Its own path segment rather than a general `PATCH /api/notifications/:id`,
 * for the same reason as `/tasks/:id/completion` and
 * `/applications/:id/status`: the only writable field is this one, so a general
 * update endpoint would exist solely to accept it. Here the narrow route is
 * also the complete one.
 *
 * 404 for another user's id, never 403 (§4) — ownership is enforced inside the
 * mutation's WHERE clause.
 */
export async function PATCH(
  _request: NextRequest,
  context: RouteContext<"/api/notifications/[id]/read">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    return ok(await markNotificationRead(user.id, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
