import { handleRouteError } from "@/lib/api/errors";
import { ok, parseSearchParams } from "@/lib/api/responses";
import { companySearchParamsSchema } from "@/lib/validations/company";
import { searchCompanies } from "@/server/queries/companies";
import { requireApiUser } from "@/server/require-user";

/**
 * GET /api/companies/search?q=&limit= — autocomplete for the application form.
 *
 * `requireApiUser()` first, as everywhere (§8), and for more than the usual
 * reason: the response is a list of company names, and the user's id is what
 * decides which of them are theirs to see. An unauthenticated version of this
 * endpoint would be the cross-user leak in §8 with a public URL.
 *
 * TODO(phase-5): 60 requests/minute per user, per the rate-limit table in §6.
 * Phase 5 owns the Postgres-backed limiter; this endpoint is on the list.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const { q, limit } = parseSearchParams(
      new URL(request.url).searchParams,
      companySearchParamsSchema,
    );

    return ok(await searchCompanies(user.id, q, limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
