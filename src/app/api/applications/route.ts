import { handleRouteError } from "@/lib/api/errors";
import { createdWithWarnings, parseJsonBody } from "@/lib/api/responses";
import { createApplicationSchema } from "@/lib/validations/application";
import { createApplication } from "@/server/mutations/applications";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications — create an application (DESIGN.md §6).
 *
 * Resolves the company, auto-creates a contact from the recruiter fields,
 * checks for duplicates and writes the opening timeline event — all inside one
 * transaction in `mutations/applications.ts`.
 *
 * Returns 201 with a duplicate advisory rather than refusing the write. Three
 * roles at one company is normal (§8), so the response reports what it noticed
 * and the UI decides how loudly to say it.
 *
 * `requireApiUser()` first, and the id it returns is the only identity used:
 * `createApplicationSchema` has no `userId` field, so a client cannot nominate
 * whose application it is creating (§8).
 *
 * TODO(phase-5): 100 creates/hour per user, per the rate-limit table in §6.
 *
 * GET arrives with the table view in the next step.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createApplicationSchema);

    const { warnings, ...application } = await createApplication(user.id, payload);

    return createdWithWarnings(application, warnings);
  } catch (error) {
    return handleRouteError(error);
  }
}
