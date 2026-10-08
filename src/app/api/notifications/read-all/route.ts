import { handleRouteError } from "@/lib/api/errors";
import { ok } from "@/lib/api/responses";
import { markAllNotificationsRead } from "@/server/mutations/notifications";
import { requireApiUser } from "@/server/require-user";

/**
 * `POST /api/notifications/read-all` (DESIGN.md §6).
 *
 * POST rather than PATCH, as §6 specifies, and the distinction is real: there
 * is no `:id` here, so this is not an update to an addressable resource — it is
 * an action over the caller's whole inbox. The id set it touches is defined by
 * the session, never by the request.
 *
 * It answers 200 with `{ updated }` rather than 204, because "cleared 7" is
 * what the toast says and the client has no way to count the rows it did not
 * fetch. Zero is a success: an already-empty inbox is not an error.
 *
 * `read-all` cannot collide with `[id]/read` — a literal segment wins over a
 * dynamic one in Next's router, and the two differ in shape anyway
 * (`/read-all` against `/:id/read`).
 */
export async function POST(): Promise<Response> {
  try {
    const user = await requireApiUser();

    return ok(await markAllNotificationsRead(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
