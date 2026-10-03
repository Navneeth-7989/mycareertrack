import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SignOutButton } from "@/components/auth/sign-out-button";
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
 *
 * The page owns the chrome and the one `h1`; the wizard owns the stepper, the
 * per-step heading and the card. That split is what keeps the heading order
 * honest — "Finish setting up" is the task, and the step title below it is a
 * section of that task, not a competing page title.
 */
export default async function OnboardingPage() {
  const user = await requireUser();

  // Nothing to do, and reloading the wizard after finishing it would let a
  // stale tab overwrite a profile the user has since edited.
  if (user.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-8 sm:py-10">
      <div className="flex w-full max-w-xl flex-col">
        <div className="flex items-center justify-between gap-4">
          <Logo size="sm" />

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground max-w-[11rem] truncate text-[0.8125rem] sm:max-w-xs">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          <h1 className="font-heading text-2xl font-semibold text-balance sm:text-[1.75rem]">
            Finish setting up
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Three short steps. This is what gives your applications context — and you can change any
            of it later from settings.
          </p>
        </div>

        <OnboardingWizard defaultName={user.name ?? ""} className="mt-8" />
      </div>
    </main>
  );
}
