import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Finish setting up · CareerTrack",
};

/**
 * Deliberately outside the (app) route group (DESIGN.md §5).
 *
 * Two reasons: the wizard has no business sitting inside the sidebar shell,
 * and the (app) layout is what redirects an unfinished user *to* here — if
 * this page lived under that layout, the gate would redirect to itself.
 */
export default async function OnboardingPage() {
  const user = await requireUser();

  // Nothing to do, and reloading the wizard after finishing it would let a
  // stale tab overwrite a profile the user has since edited.
  if (user.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-3">
        <Card>
          <CardContent>
            <OnboardingWizard defaultName={user.name ?? ""} />
          </CardContent>
        </Card>

        <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{user.email}</span>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
