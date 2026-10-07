import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { toApplicationFormValues } from "@/lib/validations/application";
import { getApplicationForEdit } from "@/server/queries/applications";
import { requireUser } from "@/server/require-user";

/**
 * `/applications/[id]/edit` — correcting an application.
 *
 * A Server Component that loads the row and hands it to the same
 * `ApplicationForm` the create page uses. One form for both, because they are
 * the same twenty fields with the same validation and the same layout — a
 * second copy would be a second place for the salary rules and the recruiter
 * block to drift.
 *
 * Status is the one thing this page cannot change, and the form shows it as a
 * read-only badge rather than hiding it. See `updateApplication` for why: a
 * status change writes a timeline event and maintains `appliedAt` and
 * `firstResponseAt` in one transaction, so it belongs to the pill on the detail
 * page and to nothing else.
 */

const loadApplication = cache(async (id: string) => {
  const user = await requireUser();

  return getApplicationForEdit(user.id, id);
});

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]/edit">): Promise<Metadata> {
  const { id } = await params;
  const application = await loadApplication(id);

  return {
    title: application
      ? `Edit ${application.jobTitle} · CareerTrack`
      : "Edit application · CareerTrack",
  };
}

export default async function EditApplicationPage({
  params,
}: PageProps<"/applications/[id]/edit">) {
  const { id } = await params;
  const application = await loadApplication(id);

  if (!application) {
    // Shares `[id]/not-found.tsx` with the detail page, which is the right copy
    // for both: a 404 here means the same thing it means there.
    notFound();
  }

  const link = application.contacts[0];

  return (
    // The same shell as `/applications/new`, down to the gap: these are one
    // form, and a different width or rhythm between them would read as two.
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Edit application"
        description={`${application.jobTitle} at ${application.company.name}`}
        actions={
          <ButtonLink variant="outline" href={`/applications/${application.id}`}>
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back
          </ButtonLink>
        }
      />

      <ApplicationForm
        application={{
          id: application.id,
          values: toApplicationFormValues({
            ...application,
            companyName: application.company.name,
            /*
             * The role on the join wins over the contact's own, because it is
             * the per-application answer (§3) and it is the one this form
             * writes back. Falling through to the contact's own role means an
             * application linked without a role still shows something sensible
             * rather than an empty field.
             */
            recruiter: link ? { ...link.contact, role: link.role ?? link.contact.role } : null,
          }),
          // Minus one for this application, which is in the count and is not
          // "other". Zero when nothing is linked, which hides the warning.
          otherApplicationsForContact: Math.max(0, (link?.contact._count.applications ?? 0) - 1),
        }}
      />
    </div>
  );
}
