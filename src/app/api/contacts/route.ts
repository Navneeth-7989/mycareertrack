import type { NextRequest } from "next/server";

import { handleRouteError } from "@/lib/api/errors";
import { created, ok, parseJsonBody } from "@/lib/api/responses";
import { contactRequestSchema } from "@/lib/validations/contact";
import { createContact } from "@/server/mutations/contacts";
import { listContacts } from "@/server/queries/contacts";
import { requireApiUser } from "@/server/require-user";

/**
 * `/api/contacts` — list and create (DESIGN.md §6).
 *
 * The `GET` is in §6's table and is kept even though the contacts page is a Server
 * Component that reads Postgres directly and does not use it. It is the documented
 * read endpoint for the resource, and the one a client-side picker would call; leaving
 * it out would make the API's shape depend on which rendering strategy a page happened
 * to choose.
 *
 * `POST` can answer three ways. 201 on success; **409 `CONFLICT`** when the email
 * already belongs to another contact, which cannot be acknowledged away because
 * `[userId, email]` is unique (§3); and **409 `CONFIRMATION_REQUIRED`** when only the
 * name matches, which can — re-send with `acknowledgeDuplicate: true`. See
 * `mutations/contacts` for why §8's "warning" splits into those two.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();

    return ok(await listContacts(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();
    const payload = await parseJsonBody(request, contactRequestSchema);

    return created(await createContact(user.id, payload));
  } catch (error) {
    return handleRouteError(error);
  }
}
