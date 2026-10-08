import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent, ok, parseJsonBody } from "@/lib/api/responses";
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

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/assessments/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteAssessment(user.id, id);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
