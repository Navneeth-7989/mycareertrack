import { cache } from "react";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { UnauthorizedError } from "@/lib/api/errors";

import { auth } from "./auth";
import { prisma } from "./db";

/**
 * The only source of identity in the application (DESIGN.md §4, rule 3).
 *
 * A `userId` arriving in a request body, a query string, or a header is ignored
 * everywhere — if it isn't returned by one of these functions, it isn't an
 * identity.
 */

const currentUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  timezone: true,
  defaultView: true,
  onboardingCompleted: true,
} satisfies Prisma.UserSelect;

export type CurrentUser = Prisma.UserGetPayload<{ select: typeof currentUserSelect }>;

/**
 * Resolves the session to a live user row, or null.
 *
 * The database read is the point, not an oversight. Sessions are JWTs (see
 * src/server/auth.ts), so the token alone proves only that someone signed in at
 * some point in the last 30 days — not that the account still exists. Reading
 * the row means a deleted user's token stops working immediately, and that
 * mutable state like `onboardingCompleted` is never served from a stale token.
 * It costs one primary-key lookup on a request that is about to query the
 * database anyway.
 *
 * Wrapped in React's `cache()` so that cost is paid once per request no matter
 * how many callers there are. A layout guarding the route and the page inside
 * it both want the user, and without memoisation that is two identical queries
 * — which would also make it tempting to thread the user down through props
 * instead of asking for it where it is needed.
 */
const loadCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: currentUserSelect,
  });
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return loadCurrentUser();
}

/**
 * For Server Components and pages: returns the user or redirects to /login.
 *
 * `redirect()` throws, so this never returns null and callers don't need a
 * null check — which is what stops a page from rendering with no user by
 * accident.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * For Route Handlers: returns the user or throws, which `handleRouteError`
 * turns into a 401. A redirect would be wrong here — an API client wants a
 * status code, not an HTML sign-in page.
 */
export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}
