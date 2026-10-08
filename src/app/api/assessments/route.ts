import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { createAssessmentSchema } from "@/lib/validations/assessment";
import { createAssessment } from "@/server/mutations/assessments";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/assessments — record a test (DESIGN.md §6).
 *
 * Flat with `applicationId` in the body, per §6's table, for the same reason as
 * interviews: it is created from two places, and on the assessments page the
 * application is a field rather than context the URL carries.
 *
 * No timezone here, unlike the interview route: a deadline is a calendar day, so
 * the schema is a plain constant and the value is stored as midnight UTC.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createAssessmentSchema);

    return created(await createAssessment(user.id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
