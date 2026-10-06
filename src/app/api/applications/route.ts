import { handleRouteError } from "@/lib/api/errors";
import { createdWithWarnings, parseJsonBody } from "@/lib/api/responses";
import { createApplicationRequestSchema } from "@/lib/validations/application";
import { createApplication } from "@/server/mutations/applications";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/applications — create an application (DESIGN.md §6).
 *
 * Resolves the company, auto-creates a contact from the recruiter fields,
 * checks for duplicates and writes the opening timeline event — all inside one
 * transaction in `mutations/applications.ts`.
 *
 * Two kinds of duplicate, two different answers:
 *
 * - **Another role at the same company** → 201, with an advisory beside the
 *   data. Three roles at one company is normal (§8); the UI mentions it and
 *   moves on.
 * - **A near-identical role at the same company** → **409
 *   `CONFIRMATION_REQUIRED`, nothing written.** Re-send with
 *   `acknowledgeDuplicate: true` to save it anyway. Still not a block — §8's
 *   rule is that a duplicate can never be *refused*, and this cannot refuse
 *   one, it can only ask first.
 *
 * `requireApiUser()` first, and the id it returns is the only identity used:
 * the request schema has no `userId` field, so a client cannot nominate whose
 * application it is creating (§8).
 *
 * TODO(phase-5): 100 creates/hour per user, per the rate-limit table in §6.
 *
 * GET arrives with the table view in the next step.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createApplicationRequestSchema);

    const { warnings, ...application } = await createApplication(user.id, payload);

    return createdWithWarnings(application, warnings);
  } catch (error) {
    return handleRouteError(error);
  }
}
