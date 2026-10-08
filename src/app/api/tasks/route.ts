import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { createTaskSchema } from "@/lib/validations/task";
import { createTask } from "@/server/mutations/tasks";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/tasks — add a task (DESIGN.md §6).
 *
 * Flat, and `applicationId` is **optional** rather than merely in the body: §3
 * allows standalone tasks, so a body with no parent is valid input and not a
 * malformed request. The mutation tells the two cases apart — see
 * `assertOwnedApplication`.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createTaskSchema);

    return created(await createTask(user.id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
