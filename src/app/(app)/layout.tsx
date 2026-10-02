import type { ReactNode } from "react";

import { requireUser } from "@/server/require-user";

/**
 * The auth guard for every authenticated page (DESIGN.md §5, §8).
 *
 * This is the first of the two layers the design calls for, not the only one:
 * Route Handlers call `requireApiUser()` themselves, because a layout only
 * guards rendering and says nothing about a direct request to /api.
 *
 * TODO(onboarding): once /onboarding exists, redirect here when
 * `user.onboardingCompleted` is false — `requireUser()` already returns the
 * live value. It is not wired up yet because the gate would send every new user
 * to a route that doesn't exist.
 *
 * TODO(shell): the sidebar, topbar and mobile navigation replace this
 * pass-through wrapper.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();

  return <>{children}</>;
}
