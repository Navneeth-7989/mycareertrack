import { handleRouteError } from "@/lib/api/errors";
import {
  createdWithWarnings,
  okPaginated,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/responses";
import { RATE_LIMITS } from "@/lib/constants/rate-limit";
import { createApplicationRequestSchema } from "@/lib/validations/application";
import { applicationFiltersSchema } from "@/lib/validations/application-filters";
import { createApplication } from "@/server/mutations/applications";
import { listApplications } from "@/server/queries/applications";
import { requireApiUser } from "@/server/require-user";
import { enforceRateLimit } from "@/server/services/rate-limit";

/**
 * GET /api/applications — the filtered, sorted, paginated list (DESIGN.md §6).
 *
 * The filter schema cannot fail: an unrecognised value is dropped rather than
 * rejected, and the page is clamped. See the header of
 * `validations/application-filters` for why a list endpoint is forgiving where
 * a write endpoint is strict.
 *
 * A page past the end returns an empty array with correct `meta` rather than a
 * 404, per §8 — the client then has the numbers it needs to offer a way back.
 *
 * The list *page* does not call this. It is a Server Component that queries
 * directly (§4), so this exists for the client-side pieces and as the
 * documented REST surface, not as the page's data source.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const filters = parseSearchParams(new URL(request.url).searchParams, applicationFiltersSchema);

    const { items, ...meta } = await listApplications(user.id, filters);

    return okPaginated(items, meta);
  } catch (error) {
    return handleRouteError(error);
  }
}

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
 * **100 creates per hour per user (§6).** Set where it is for what this write
 * costs rather than for what a person does: it resolves a company, may create a
 * contact, writes a timeline event, and runs the duplicate check, all in one
 * transaction. A hundred an hour is far above the heaviest real use — a day
 * spent applying is a few dozen — and far below what a loop could do to the
 * connection pool. The limit is keyed on the user id from the session, so
 * unlike the two IP limits there is nothing a request can do to choose its own
 * bucket (§4 rule 3).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();

    // Before the body is read, so a flood is refused without paying for its
    // parse or its company resolution. The register route documents why it is
    // the one that does this the other way round.
    await enforceRateLimit(RATE_LIMITS.applicationCreate, user.id);

    const payload = await parseJsonBody(request, createApplicationRequestSchema);

    const { warnings, ...application } = await createApplication(user.id, payload);

    return createdWithWarnings(application, warnings);
  } catch (error) {
    return handleRouteError(error);
  }
}
