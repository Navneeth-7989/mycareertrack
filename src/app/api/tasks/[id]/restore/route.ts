import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { restoreTaskSchema } from "@/lib/validations/task";
import { restoreTask } from "@/server/mutations/tasks";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/tasks/:id/restore — the undo behind the delete toast (§8).
 *
 * A 201 with the original id, from the snapshot the delete returned. The
 * snapshot is request data: the user comes from the session, and `applicationId`
 * — which may legitimately be null, because standalone tasks are allowed — is
 * re-checked by `assertOwnedApplication` in the mutation.
 *
 * `restoreTaskSchema` also refuses a body whose `isCompleted` and `completedAt`
 * disagree. That pair is a derived-column invariant everywhere else in the app,
 * and this is the only request that writes both, so the check belongs on the way
 * in rather than in the mutation's good intentions.
 *
 * Path id and body id must match, and restoring twice returns the existing row.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/tasks/[id]/restore">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { snapshot } = await parseJsonBody(request, restoreTaskSchema);

    if (snapshot.id !== id) {
      throw new ValidationError({}, "That snapshot is for a different task");
    }

    return created(await restoreTask(user.id, snapshot));
  } catch (error) {
    return handleRouteError(error);
  }
}
