import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { eventSchema } from "@/lib/validations/event";
import { createApplicationEvent } from "@/server/mutations/events";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications/:id/events — add a manual timeline entry
 * (DESIGN.md §6).
 *
 * Nested under the application rather than a flat `/api/events`, because an
 * event cannot exist without one: the parent is part of the identity of the
 * thing being created, not a field on it. `PATCH` and `DELETE` are flat, at
 * `/api/events/:id`, since by then the id alone names the row — which is the
 * shape §6's table lays out.
 *
 * The §4 lifecycle, unchanged: `requireApiUser()`, then Zod, then a mutation
 * whose `findFirst({ id, userId })` returns null for an application that is not
 * this user's — a 404, never a 403, so the response does not confirm that
 * someone else's application exists.
 *
 * `eventSchema` accepts only `MANUAL_EVENT_TYPES`, so the three automatic types
 * are rejected at the boundary with a field error rather than being filtered out
 * later. See `constants/event` for why a hand-written `STATUS_CHANGE` is not a
 * thing this product allows.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]/events">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, eventSchema);

    return created(await createApplicationEvent(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
