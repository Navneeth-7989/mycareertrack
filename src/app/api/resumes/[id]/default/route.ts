import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { setResumeDefaultSchema } from "@/lib/validations/resume";
import { setResumeDefault } from "@/server/mutations/resumes";
import { requireApiUser } from "@/server/require-user";

/**
 * `PATCH /api/resumes/:id/default` — which version is sent by default.
 *
 * Its own endpoint, mirroring `/api/tasks/:id/completion` and
 * `/api/applications/:id/status`, and for the identical reason: the write
 * maintains an invariant that spans other rows. Setting a default has to unset
 * the previous one, so "at most one default" is a property of the *set* of a
 * user's resumes rather than of the row being edited — and a general field PATCH
 * carrying `isDefault: true` would leave two.
 *
 * §6 folds this into the rename PATCH. Splitting it is the same departure the
 * other two made, and it has the same payoff: the general update cannot express
 * the field at all, so there is no second route to a column with a rule attached.
 *
 * Accepts `false` as well as `true`. "No default" is a real state, and a toggle
 * that only goes one way leaves the user who picked the wrong version unable to
 * get back to having no preference.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/resumes/[id]/default">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { isDefault } = await parseJsonBody(request, setResumeDefaultSchema);

    return ok(await setResumeDefault(user.id, id, isDefault));
  } catch (error) {
    return handleRouteError(error);
  }
}
