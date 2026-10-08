import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent, ok, parseJsonBody } from "@/lib/api/responses";
import { contactRequestSchema } from "@/lib/validations/contact";
import { deleteContact, updateContact } from "@/server/mutations/contacts";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/contacts/:id` — edit and delete a person (DESIGN.md §6).
 *
 * Ownership is `findFirst({ id, userId })` inside the mutation (§4), so another user's
 * contact answers 404 rather than 403.
 *
 * The same two 409s as the create route: a duplicate email is a hard conflict, a
 * duplicate name is a confirmation. `excludeId` inside `findCollision` is what stops an
 * edit matching itself.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/contacts/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, contactRequestSchema);

    return ok(await updateContact(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Deletes the person and, by cascade, every link to them (§3). The applications
 * themselves are untouched — the mirror of how deleting an application only unlinks its
 * contacts (§8).
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/contacts/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteContact(user.id, id);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
