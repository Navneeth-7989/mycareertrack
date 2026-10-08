import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { linkContactSchema } from "@/lib/validations/contact";
import { linkContactToApplication } from "@/server/mutations/contacts";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications/:id/contacts — attach an existing person to an application
 * (DESIGN.md §6).
 *
 * The many-to-many half of §7's contacts work. It creates a row in
 * `ApplicationContact`, never a `Contact` — the person must already exist, because
 * creating one here would duplicate `POST /api/contacts` and bypass its duplicate
 * checks.
 *
 * **Two ids from the client, two ownership checks.** The application comes from the
 * path and the contact from the body, and either one pointing at someone else's row is
 * the IDOR §8 cares most about. `linkContactToApplication` checks both separately
 * against the session's `userId`.
 *
 * `role` is their role on *this* application and is stored on the join (§3).
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]/contacts">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, linkContactSchema);

    return created(await linkContactToApplication(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
