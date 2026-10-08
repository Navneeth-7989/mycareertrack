import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { noteSchema } from "@/lib/validations/note";
import { createNote } from "@/server/mutations/notes";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications/:id/notes — add a note (DESIGN.md §6).
 *
 * Nested, exactly as §6's table has it, and for the same reason as events: a note
 * cannot exist without an application, so the parent is part of the identity of the
 * thing being created rather than a field on it. Interviews and assessments are
 * flat because they are created from a page where the application is a choice.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/applications/[id]/notes">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, noteSchema);

    return created(await createNote(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
