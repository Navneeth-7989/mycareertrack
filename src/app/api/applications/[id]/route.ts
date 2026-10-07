import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { updateApplicationRequestSchema } from "@/lib/validations/application";
import { updateApplication } from "@/server/mutations/applications";
import { requireApiUser } from "@/server/require-user";

/**
 * PATCH /api/applications/:id — edit an application's own fields
 * (DESIGN.md §6).
 *
 * The §4 lifecycle, unchanged from the status endpoint beside it:
 * `requireApiUser()`, then Zod, then a mutation whose `findFirst({ id, userId })`
 * returns null for an id that is not this user's — which becomes a 404, never a
 * 403, so the response does not confirm that someone else's application exists.
 *
 * "Partial" in the design's sense means *part of the resource*, not a sparse
 * body: this replaces every editable column, because the form that calls it
 * posts all of them. What it cannot touch is status, which has its own endpoint
 * for the reasons in `updateApplication`, and the application's children, which
 * belong to Phase 3's own routes.
 *
 * Two failures are worth knowing about. A 409 `CONFIRMATION_REQUIRED` means the
 * edit moved this application onto a near-identical one and nothing was written
 * — re-send with `acknowledgeDuplicate: true` to go ahead. A 400 carries
 * per-field messages the form renders inline.
 *
 * DELETE lands here in step 7.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, updateApplicationRequestSchema);

    return ok(await updateApplication(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
