import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { renameResumeSchema } from "@/lib/validations/resume";
import { deleteResume, renameResume } from "@/server/mutations/resumes";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/resumes/:id` — rename and delete (DESIGN.md §6).
 *
 * Ownership is `findFirst({ id, userId })` inside the mutation (§4), so another
 * user's resume answers 404 rather than 403.
 *
 * §6 lists "rename, set default" against this one PATCH; the default lives at
 * `/default` instead. See `setResumeDefault` for why — it maintains an invariant
 * across other rows, the same reason task completion and application status have
 * their own endpoints.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/resumes/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { label } = await parseJsonBody(request, renameResumeSchema);

    return ok(await renameResume(user.id, id, label));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Soft delete: the file is really removed, the row survives (§9).
 *
 * A 200 with a body rather than a 204, and for a different reason than the three
 * Phase 3 deletes that return a snapshot — there is **no undo here and there
 * cannot be one**, because the document itself is gone and nothing in a response
 * body could reconstruct it. What the body carries is the affected application
 * count §6 asks for, which the toast uses to confirm what the record now says.
 *
 * The dialog shows that same count *before* the user confirms, from the server
 * render — see `ResumeRow`. This one is for afterwards.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/resumes/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    return ok(await deleteResume(user.id, id));
  } catch (error) {
    return handleRouteError(error);
  }
}
