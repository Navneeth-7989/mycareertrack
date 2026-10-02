import type { Metadata } from "next";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Dashboard · CareerTrack",
};

/**
 * PLACEHOLDER — the real dashboard (stat tiles, action lists, empty states)
 * belongs to the shell step of Phase 1 and is replaced wholesale then.
 *
 * It exists now because the auth work needs somewhere to land: a sign-in has to
 * redirect to a page that exists, and "reachable only when authenticated" is
 * only demonstrable if there is something behind the guard.
 *
 * `requireUser()` is called here as well as in the layout on purpose — it is
 * how a page gets the user, and the second call is served from the same
 * request's cache rather than hitting the database twice.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-medium">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {user.email}
            {user.name ? ` (${user.name})` : ""}
          </p>
        </div>

        <SignOutButton />
      </div>

      <dl className="ring-foreground/10 grid grid-cols-2 gap-2 rounded-xl p-4 text-sm ring-1">
        <dt className="text-muted-foreground">Onboarding complete</dt>
        <dd>{user.onboardingCompleted ? "Yes" : "No"}</dd>
        <dt className="text-muted-foreground">Timezone</dt>
        <dd>{user.timezone}</dd>
        <dt className="text-muted-foreground">Default view</dt>
        <dd>{user.defaultView}</dd>
      </dl>
    </div>
  );
}
