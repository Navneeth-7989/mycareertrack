import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { createInterviewSchema } from "@/lib/validations/interview";
import { createInterview } from "@/server/mutations/interviews";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/interviews — schedule a round (DESIGN.md §6).
 *
 * Flat, with `applicationId` in the body, per §6's table. It differs from notes
 * and events, which are nested under their application, because an interview is
 * created from two places — the application's detail page and the interviews page
 * — and on the second the application is a field the user picks rather than
 * context the URL already carries.
 *
 * **The schema is built from `user.timezone`, and that is the load-bearing line
 * here.** The body holds a wall clock — "2026-03-14T15:30" — which is not an
 * instant until a zone interprets it. Taking the zone from the session rather
 * than from the request means a client cannot shift an interview by lying about
 * its timezone, and that the form and this handler always agree, since both read
 * the same column.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createInterviewSchema(user.timezone));

    return created(await createInterview(user.id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
