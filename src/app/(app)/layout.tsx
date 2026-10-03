import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireUser } from "@/server/require-user";

/**
 * The auth and onboarding guard for every authenticated page (DESIGN.md §5, §8).
 *
 * This is the first of the two layers the design calls for, not the only one:
 * Route Handlers call `requireApiUser()` themselves, because a layout only
 * guards rendering and says nothing about a direct request to /api.
 *
 * The onboarding gate reads the live `onboardingCompleted` value rather than a
 * session claim — `requireUser()` always does — so finishing the wizard lets a
 * user through on the very next request, with no token to refresh.
 *
 * TODO(shell): the sidebar, topbar and mobile navigation replace this
 * pass-through wrapper.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  if (!user.onboardingCompleted) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
