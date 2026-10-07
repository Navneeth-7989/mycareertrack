import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { restoreApplicationSchema } from "@/lib/validations/application";
import { restoreApplication } from "@/server/mutations/applications";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications/:id/restore — the undo behind the delete toast.
 *
 * Takes the snapshot `DELETE /api/applications/:id` returned and writes the
 * application back with its original ids. A 201, because the row genuinely did
 * not exist a moment ago: the delete was real, which is the whole reason this
 * endpoint has to.
 *
 * **The snapshot is request data, not a capability.** It has been through the
 * browser, so `restoreApplication` takes the user from the session and re-checks
 * the company and every contact id against it. Nothing here grants access to
 * anything the caller could not already reach.
 *
 * The id is in the path *and* in the body, and they are required to match. It
 * costs one comparison and it buys a route whose address means what it says —
 * without it, `POST /api/applications/<anything>/restore` would restore whatever
 * the body happened to name, and the server log would record the wrong id.
 *
 * Restoring twice is not an error: the mutation returns the existing row. A user
 * who double-clicks Undo gets their application, not a 409.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]/restore">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const { snapshot } = await parseJsonBody(request, restoreApplicationSchema);

    if (snapshot.application.id !== id) {
      throw new ValidationError({}, "That snapshot is for a different application");
    }

    return created(await restoreApplication(user.id, snapshot));
  } catch (error) {
    return handleRouteError(error);
  }
}
