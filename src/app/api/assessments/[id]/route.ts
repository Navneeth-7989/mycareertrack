import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { updateAssessmentSchema } from "@/lib/validations/assessment";
import { deleteAssessment, updateAssessment } from "@/server/mutations/assessments";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/assessments/:id` — edit and remove an assessment (DESIGN.md §6).
 *
 * Ownership is `findFirst({ id, userId })` inside the mutation (§4), so another
 * user's assessment answers 404 rather than 403.
 *
 * `updateAssessmentSchema` has no `applicationId`: an assessment belongs to the
 * role that set it.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/assessments/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, updateAssessmentSchema);

    return ok(await updateAssessment(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * A 200 rather than a 204: the body carries the snapshot the undo toast posts
 * back to `/restore` (§8). Deleting an assessment takes its score and notes with
 * it, which is the case the undo window exists for.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/assessments/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    return ok(await deleteAssessment(user.id, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
