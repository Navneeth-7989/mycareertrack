import { handleRouteError } from "@/lib/api/errors";
import { ok, parseSearchParams } from "@/lib/api/responses";
import { RATE_LIMITS } from "@/lib/constants/rate-limit";
import { companySearchParamsSchema } from "@/lib/validations/company";
import { searchCompanies } from "@/server/queries/companies";
import { requireApiUser } from "@/server/require-user";
import { enforceRateLimit } from "@/server/services/rate-limit";

/**
 * GET /api/companies/search?q=&limit= — autocomplete for the application form.
 *
 * `requireApiUser()` first, as everywhere (§8), and for more than the usual
 * reason: the response is a list of company names, and the user's id is what
 * decides which of them are theirs to see. An unauthenticated version of this
 * endpoint would be the cross-user leak in §8 with a public URL.
 *
 * **60 per minute per user (§6)** — the only limit here on a read, and it is a
 * read worth limiting: it runs a trigram search over the whole company table
 * and the response is a list of names, which makes it the scraping target in
 * §8 rather than just an expensive query.
 *
 * Comfortably clear of the UI that drives it. `CompanyCombobox` debounces at
 * 200 ms and only fires when the text has settled, so typing a company name is
 * one request, not one per keystroke; a minute of continuous editing does not
 * come near sixty.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();

    await enforceRateLimit(RATE_LIMITS.companySearch, user.id);

    const { q, limit } = parseSearchParams(
      new URL(request.url).searchParams,
      companySearchParamsSchema,
    );

    return ok(await searchCompanies(user.id, q, limit));
  } catch (error) {
    return handleRouteError(error);
  }
}
