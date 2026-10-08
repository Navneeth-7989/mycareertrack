import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { restoreAssessmentSchema } from "@/lib/validations/assessment";
import { restoreAssessment } from "@/server/mutations/assessments";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/assessments/:id/restore — the undo behind the delete toast (§8).
 *
 * A 201 with the original id, from the snapshot the delete returned. The
 * snapshot is request data and nothing in it is trusted for authorization: the
 * user comes from the session and `applicationId` is re-checked against them in
 * `restoreAssessment`.
 *
 * Path id and body id must match, and restoring twice returns the existing row —
 * the same two rules as every other restore in the app.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/assessments/[id]/restore">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { snapshot } = await parseJsonBody(request, restoreAssessmentSchema);

    if (snapshot.id !== id) {
      throw new ValidationError({}, "That snapshot is for a different assessment");
    }

    return created(await restoreAssessment(user.id, snapshot));
  } catch (error) {
    return handleRouteError(error);
  }
}
