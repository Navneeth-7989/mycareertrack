import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "New application · CareerTrack",
};

/**
 * `/applications/new` — the create form.
 *
 * A Server Component that renders a client island, per §4: there is nothing to
 * fetch for an empty form, so the page's only job is the auth guard and the
 * heading. The form owns its own state and the company autocomplete fetches on
 * demand.
 *
 * `requireUser()` here as well as in the layout is deliberate (§8, "both
 * layers, not one"), and it is served from the same request's cache rather than
 * querying twice.
 */
export default async function NewApplicationPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="New application"
        description="Log a role you have found or already applied to. Only the company and the job title are required."
        actions={
          <ButtonLink variant="outline" href="/dashboard">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back
          </ButtonLink>
        }
      />

      <ApplicationForm />
    </div>
  );
}
