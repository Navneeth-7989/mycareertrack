import { handleRouteError } from "@/lib/api/errors";
import { created, ok, parseJsonBody } from "@/lib/api/responses";
import { createCompanySchema } from "@/lib/validations/company";
import { resolveCompanyByName } from "@/server/services/company-resolver";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/companies — the explicit "add a company" path (DESIGN.md §6). The
 * common case is implicit, inside application create.
 *
 * Deliberately not a 409 when the company already exists, which the status
 * table in §6 lists as a possibility. The edge-case table in §8 settles it the
 * other way — "company casing variants → `nameNormalized` collapses them to one
 * row" — so a user who types "Google LLC" where "Google" exists has not made a
 * mistake worth an error. They get 200 and the existing row; a genuinely new
 * company gets 201. The status code is the only difference the client sees.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, createCompanySchema);

    const { created: isNew, ...company } = await resolveCompanyByName(user.id, payload);

    return isNew ? created(company) : ok(company);
  } catch (error) {
    return handleRouteError(error);
  }
}
