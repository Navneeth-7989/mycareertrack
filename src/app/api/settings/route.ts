import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { ok, parseJsonBody } from "@/lib/api/responses";
import { settingsSchema } from "@/lib/validations/settings";
import { updateSettings } from "@/server/mutations/settings";
import { requireApiUser } from "@/server/require-user";

/**
 * `PATCH /api/settings` — **an addition to §6**, which lists no settings
 * endpoint.
 *
 * §7's Phase 4 bullet asks for "preference toggles in settings", and a toggle
 * with nowhere to post is a decoration. It is not part of `/api/onboarding`:
 * that endpoint exists to create a `Profile` once and gate the wizard, and
 * folding an ongoing preference write into it would mean one schema serving two
 * jobs with different required fields.
 *
 * PATCH rather than PUT even though every field is sent: the target is the
 * caller's `User` row, of which these seven columns are a subset — a PUT would
 * claim to replace the whole user.
 *
 * **There is no `:id`.** The row written is whichever one the session resolves
 * to, so there is no path parameter an attacker could change and no ownership
 * clause needed. See the note in `mutations/settings.ts` about why this is the
 * one place a bare-id `update` is correct.
 */
export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, settingsSchema);

    return ok(await updateSettings(user.id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
