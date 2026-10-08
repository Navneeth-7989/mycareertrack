import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { updateInterviewSchema } from "@/lib/validations/interview";
import { deleteInterview, updateInterview } from "@/server/mutations/interviews";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/interviews/:id` — edit and cancel a round (DESIGN.md §6).
 *
 * Ownership is `findFirst({ id, userId })` inside the mutation (§4), so another
 * user's interview answers 404 rather than 403 and the response never confirms it
 * exists.
 *
 * `updateInterviewSchema` has no `applicationId`: an interview belongs to the
 * role it was for, so moving one between applications is not expressible.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/interviews/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, updateInterviewSchema(user.timezone));

    return ok(await updateInterview(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * A 200 with a body rather than a 204, because the response carries the snapshot
 * that powers the undo toast (§8) — the same contract as deleting an
 * application. The confirmation dialog still asks first; the undo is what makes
 * the answer recoverable.
 *
 * Deleting is distinct from marking the round `CANCELLED` — that is a result,
 * which keeps the row and its history. Delete is for a round that was entered by
 * mistake, which is exactly the case an undo window is for.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/interviews/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    return ok(await deleteInterview(user.id, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
