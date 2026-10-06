import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { updateStatusSchema } from "@/lib/validations/application";
import { updateApplicationStatus } from "@/server/mutations/applications";
import { requireApiUser } from "@/server/require-user";

/**
 * PATCH /api/applications/:id/status — move an application through the
 * pipeline (DESIGN.md §6).
 *
 * The lifecycle in §4, step by step: `requireApiUser()`, then Zod, then a
 * mutation whose `findFirst({ id, userId })` returns null for an id that is not
 * this user's — which becomes a 404, never a 403, so the response does not
 * confirm that someone else's application exists.
 *
 * `RouteContext` is the generated type for the route's own params. They are a
 * promise in this version of Next, hence the await.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]/status">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { status } = await parseJsonBody(request, updateStatusSchema);

    return ok(await updateApplicationStatus(user.id, id, status));
  } catch (error) {
    return handleRouteError(error);
  }
}
