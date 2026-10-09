import { clientIpBucket } from "@/lib/api/client-ip";
import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { RATE_LIMITS } from "@/lib/constants/rate-limit";
import { registerPayloadSchema } from "@/lib/validations/auth";
import { registerCredentialsUser } from "@/server/mutations/users";
import { enforceRateLimit } from "@/server/services/rate-limit";

/**
 * POST /api/register — create an email/password account.
 *
 * A Route Handler rather than a Server Action: it has real validation, a
 * conflict case, and a rate limit to hang off it, which is exactly the line
 * drawn in DESIGN.md §4.
 *
 * It does not sign the new user in. The client follows a 201 with a normal
 * credentials sign-in, so there is one code path that issues sessions instead
 * of two.
 *
 * **3 per hour per IP (§6), and this endpoint is the one that most needs it.**
 * It is unauthenticated, it writes a row, and a duplicate email is a 409 — so
 * it can answer "is this address registered?" There is no way to remove that
 * answer without making registration fail silently for the person whose address
 * it is, which means the limit is the mitigation rather than a belt on top of
 * one.
 *
 * **The limit is enforced after the body is parsed, which is the opposite of
 * the other three.** Those come first because the work being protected is the
 * work that follows; here the thing worth protecting is the attempt, and an
 * attempt that fails Zod is not one. The register form validates with the same
 * schema before it posts (§4 rule 4), so a 400 from this route means a
 * hand-made request — while counting 400s would let a user who mistypes their
 * password confirmation three times lock themselves out of signing up for an
 * hour. An attacker enumerating addresses has to send valid bodies, so they are
 * counted either way.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseJsonBody(request, registerPayloadSchema);

    await enforceRateLimit(RATE_LIMITS.register, clientIpBucket(request.headers));

    const user = await registerCredentialsUser(payload);

    return created(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
