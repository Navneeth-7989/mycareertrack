import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent, ok, parseJsonBody } from "@/lib/api/responses";
import { noteSchema } from "@/lib/validations/note";
import { deleteNote, updateNote } from "@/server/mutations/notes";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/notes/:id` — edit and delete a note (DESIGN.md §6).
 *
 * Flat, because by this point the id names the row. Ownership is
 * `findFirst({ id, userId })` inside the mutation (§4), so another user's note
 * answers 404 rather than 403.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/notes/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, noteSchema);

    return ok(await updateNote(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/notes/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteNote(user.id, id);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
