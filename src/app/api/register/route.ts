import { handleRouteError } from "@/lib/api/errors";
import { created, parseJsonBody } from "@/lib/api/responses";
import { registerPayloadSchema } from "@/lib/validations/auth";
import { registerCredentialsUser } from "@/server/mutations/users";

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
 * TODO(phase 5): 3 requests per hour per IP, per the rate limit table in
 * DESIGN.md §6. The Postgres-backed limiter arrives with the other limits.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseJsonBody(request, registerPayloadSchema);
    const user = await registerCredentialsUser(payload);

    return created(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
