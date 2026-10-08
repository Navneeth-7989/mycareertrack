import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent, ok, parseJsonBody } from "@/lib/api/responses";
import { eventSchema } from "@/lib/validations/event";
import { deleteApplicationEvent, updateApplicationEvent } from "@/server/mutations/events";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/events/:id` — edit and delete a manual timeline entry (DESIGN.md §6).
 *
 * Flat rather than nested under the application, matching §6's table: creating
 * an event needs the parent to name it, while an existing one is identified by
 * its own id. Ownership does not come from the path either way — it is
 * `findFirst({ id, userId })` inside the mutation (§4), so a nested path would
 * add a segment that looked like a permission check and was not one.
 *
 * Both verbs answer **409** for an automatic entry. Not a 404: the row is the
 * caller's own and is on their screen, and claiming it does not exist would read
 * as a bug rather than as a rule. See `assertEditable`.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/events/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, eventSchema);

    return ok(await updateApplicationEvent(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * A real 204 with no body, unlike `DELETE /api/applications/:id`.
 *
 * That one answers 200 because it carries the snapshot its undo is built on.
 * There is no undo here and nothing to send: a timeline entry is four fields the
 * user wrote themselves a moment ago, so a confirmation before the fact is worth
 * more than a reversal after it.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/events/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteApplicationEvent(user.id, id);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
