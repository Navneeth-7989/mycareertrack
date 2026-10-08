import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent } from "@/lib/api/responses";
import { unlinkContactFromApplication } from "@/server/mutations/contacts";
import { requireApiUser } from "@/server/require-user";

/**
 * DELETE /api/applications/:id/contacts/:contactId — remove a link (DESIGN.md §6).
 *
 * **Unlinks, never deletes the person** (§8: contacts are "unlinked, not deleted"). The
 * distinction matters enough to be the whole reason this route exists rather than
 * reusing `DELETE /api/contacts/:id`: a recruiter who stops being relevant to one
 * application is still a recruiter you know.
 *
 * Both ids are scoped to the caller inside the mutation, via a `deleteMany` whose WHERE
 * requires the application *and* the contact to be theirs — so a forged pair cannot
 * unpick someone else's link. An affected count of zero becomes a 404.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/applications/[id]/contacts/[contactId]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id, contactId } = await context.params;

    await unlinkContactFromApplication(user.id, id, contactId);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
