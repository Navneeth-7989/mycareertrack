import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { noContent, ok, parseJsonBody } from "@/lib/api/responses";
import { updateTaskSchema } from "@/lib/validations/task";
import { deleteTask, updateTask } from "@/server/mutations/tasks";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/tasks/:id` — edit and delete a task (DESIGN.md §6).
 *
 * `isCompleted` cannot be expressed here — `updateTaskSchema` has no such key.
 * Ticking a task off goes through `/api/tasks/:id/completion`, because it maintains
 * the derived `completedAt` column and a field edit must not be a second route to
 * it. The same arrangement as an application's status.
 *
 * `applicationId` **is** editable, unlike on interviews and assessments: attaching a
 * standalone task to an application, or detaching one, is a real intent.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/tasks/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const payload = await parseJsonBody(request, updateTaskSchema);

    return ok(await updateTask(user.id, id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/tasks/[id]">,
): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteTask(user.id, id);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
