import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";

import { DeleteApplication } from "@/components/applications/delete-application";
import { StatusCell } from "@/components/applications/status-cell";
import { ButtonLink } from "@/components/ui/button";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/constants/application";
import { WORK_MODE_LABELS } from "@/lib/constants/work-mode";
import type { ApplicationDetail } from "@/server/queries/applications";

/**
 * The top of the detail page: where you came from, what this is, and the two
 * things you are most likely to do to it.
 *
 * Not `PageHeader`. That component is a title, a sentence and an action slot,
 * and this needs a breadcrumb above the title and a sub-line that is structured
 * data rather than prose — forcing it through the shared component would mean
 * widening `PageHeader` for one caller, which is how a shared primitive stops
 * being shared.
 *
 * The status control is the same `StatusCell` the table rows and board cards
 * carry, scaled up. One control for one action everywhere in the product (§1):
 * a user who learned the pill on the board should not meet a different widget
 * here.
 *
 * The back link goes to a bare `/applications` and drops whatever filters the
 * user arrived with. Carrying them would mean threading the query string
 * through every link into this page — from the table, the board, and later the
 * dashboard lists — and the browser's own back button already does the job
 * perfectly for the path people actually take.
 */
export function DetailHeader({ application }: { application: ApplicationDetail }) {
  const meta = [
    application.location,
    application.workMode ? WORK_MODE_LABELS[application.workMode] : null,
    application.employmentType ? EMPLOYMENT_TYPE_LABELS[application.employmentType] : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/applications"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 inline-flex w-fit items-center gap-1.5 rounded-md text-[0.8125rem] font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Applications
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[1.75rem]">
            {application.jobTitle}
          </h1>

          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-foreground font-medium">{application.company.name}</span>

            {meta.map((part) => (
              <span key={part} className="flex items-center gap-2">
                {/* A separator per item rather than one joined string, so the
                    line wraps between parts on a phone instead of breaking a
                    city name in half. */}
                <span aria-hidden="true" className="bg-border size-1 rounded-full" />
                {part}
              </span>
            ))}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusCell
            id={application.id}
            status={application.status}
            jobTitle={application.jobTitle}
            companyName={application.company.name}
            // Scaled to sit with the 36px buttons beside it. The pill's own
            // metrics are tuned for a table cell, where it is the smallest
            // interactive thing on the row rather than a page action.
            className="h-9 gap-2 px-3.5 text-sm"
          />

          {application.jobUrl ? (
            <ButtonLink
              variant="outline"
              href={application.jobUrl}
              target="_blank"
              /*
               * `noreferrer` implies `noopener`, and both are named anyway: the
               * href comes out of a nullable column, and while `optionalUrl`
               * guarantees http(s) at write time, a link to a third-party site
               * should not hand it a handle on this window regardless.
               */
              rel="noreferrer noopener"
            >
              <ExternalLink aria-hidden="true" data-icon="inline-start" />
              View posting
            </ButtonLink>
          ) : null}

          <ButtonLink variant="outline" href={`/applications/${application.id}/edit`}>
            <Pencil aria-hidden="true" data-icon="inline-start" />
            Edit
          </ButtonLink>

          {/*
           * Last, and the only tinted-red control on the page. `destructive` is
           * deliberately not a filled button here (see `buttonVariants`): a solid
           * red button would be the loudest thing on the screen, and in this
           * product destroying a row is never the main action.
           */}
          <DeleteApplication
            id={application.id}
            jobTitle={application.jobTitle}
            companyName={application.company.name}
            preview={application._count}
          />
        </div>
      </div>
    </div>
  );
}
