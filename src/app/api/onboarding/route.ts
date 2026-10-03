import { handleRouteError } from "@/lib/api/errors";
import { noContent, parseJsonBody } from "@/lib/api/responses";
import { onboardingSchema } from "@/lib/validations/profile";
import { completeOnboarding } from "@/server/mutations/profile";
import { requireApiUser } from "@/server/require-user";

/**
 * POST /api/onboarding — save the wizard and set `onboardingCompleted`.
 *
 * `requireApiUser()` first, always (DESIGN.md §8): the layout guard protects
 * the page, not this endpoint. The id it returns is the only identity used —
 * the payload schema has no `userId` field, so a client cannot nominate whose
 * profile it is writing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, onboardingSchema);

    await completeOnboarding(user.id, payload);

    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
