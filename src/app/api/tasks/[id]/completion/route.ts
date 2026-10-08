import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { toggleTaskCompletionSchema } from "@/lib/validations/task";
import { toggleTaskCompletion } from "@/server/mutations/tasks";
import { requireApiUser } from "@/server/require-user";

/**
 * PATCH /api/tasks/:id/completion — tick a task off, or put it back.
 *
 * **Its own endpoint, for the same reason `/api/applications/:id/status` is.**
 * Flipping `isCompleted` maintains `completedAt`, which must be non-null if and only
 * if the boolean is true — anything that later counts "completed this week" reads
 * that column. Allowing the general `PATCH` to carry the flag would give the client
 * a second route to the invariant, and the route that forgot the timestamp would be
 * the one nobody tested.
 *
 * It is also the most frequent write in the product: a checkbox on a list. A
 * dedicated two-field request beats re-posting a task's whole body to change one
 * bit.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/tasks/[id]/completion">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { isCompleted } = await parseJsonBody(request, toggleTaskCompletionSchema);

    return ok(await toggleTaskCompletion(user.id, id, isCompleted));
  } catch (error) {
    return handleRouteError(error);
  }
}
