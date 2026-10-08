import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { restoreInterviewSchema } from "@/lib/validations/interview";
import { restoreInterview } from "@/server/mutations/interviews";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/interviews/:id/restore — the undo behind the delete toast (§8).
 *
 * Takes the snapshot `DELETE /api/interviews/:id` returned and writes the round
 * back with its original id. A 201, because the row genuinely did not exist a
 * moment ago: the delete was real, which is the whole reason this endpoint has
 * to be.
 *
 * **The snapshot is request data, not a capability.** It has been through the
 * browser, so `restoreInterview` takes the user from the session and re-checks
 * `applicationId` against it. Nothing here grants access to anything the caller
 * could not already reach.
 *
 * The id is in the path *and* in the body, and they must match — the same rule
 * as the application restore. It costs one comparison and it buys a route whose
 * address means what it says.
 *
 * Restoring twice is not an error: the mutation returns the existing row, so a
 * double-clicked Undo gets the interview rather than a 409.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/interviews/[id]/restore">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { snapshot } = await parseJsonBody(request, restoreInterviewSchema);

    if (snapshot.id !== id) {
      throw new ValidationError({}, "That snapshot is for a different interview");
    }

    return created(await restoreInterview(user.id, snapshot));
  } catch (error) {
    return handleRouteError(error);
  }
}
