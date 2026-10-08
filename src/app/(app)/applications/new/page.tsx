import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { listResumeOptions } from "@/server/queries/resumes";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "New application · CareerTrack",
};

/**
 * `/applications/new` — the create form.
 *
 * A Server Component that renders a client island, per §4. It fetches one thing
 * — the user's resumes, for the "What you sent" picker, which also needs to know
 * which is the default so a new application can start on it. Everything else the
 * form needs it owns itself, and the company autocomplete fetches on demand.
 *
 * No `currentId` argument to `listResumeOptions`: there is no application yet, so
 * a deleted resume has nothing to stay attached to and only live ones are
 * offered. The edit page is the one that passes it.
 *
 * `requireUser()` here as well as in the layout is deliberate (§8, "both
 * layers, not one"), and it is served from the same request's cache rather than
 * querying twice.
 */
export default async function NewApplicationPage() {
  const user = await requireUser();

  const resumeOptions = await listResumeOptions(user.id);

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

      <ApplicationForm resumeOptions={resumeOptions} />
    </div>
  );
}
