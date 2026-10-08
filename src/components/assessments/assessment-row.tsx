import Link from "next/link";
import { CalendarX, ExternalLink } from "lucide-react";

import { AssessmentDialog } from "@/components/assessments/assessment-dialog";
import { AssessmentStatusBadge } from "@/components/assessments/assessment-status-badge";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { isOutstanding, type AssessmentStatusValue } from "@/lib/constants/assessment";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";

/**
 * One assessment, rendered identically on the application's detail page and on
 * `/assessments`.
 *
 * All dates go through `utils/date-only` — read back in **UTC**, never in a
 * timezone. A deadline is a calendar day, and the interview row beside it is the
 * one that converts to a zone. Getting these two the same way round is the single
 * most likely source of an off-by-a-day bug in Phase 3.
 */

export type AssessmentRowData = {
  id: string;
  name: string;
  provider: string | null;
  url: string | null;
  deadline: Date | null;
  status: AssessmentStatusValue;
  score: string | null;
  notes: string | null;
  /** Optional for the same reason as on the interview row — the detail page knows it. */
  application?: {
    id: string;
    jobTitle: string;
    company: { name: string };
  };
};

export function AssessmentRow({
  assessment,
  showApplication = false,
}: {
  assessment: AssessmentRowData;
  showApplication?: boolean;
}) {
  /*
   * `daysSinceDateOnly` counts *backwards* — positive for the past — so a positive
   * number here means the deadline has gone. Overdue is only meaningful while the
   * test is outstanding: a passed assessment whose deadline was last Tuesday is
   * finished, not late, and colouring it red would train the user to ignore the
   * colour (see `isOutstanding`).
   */
  const daysPast = assessment.deadline ? daysSinceDateOnly(assessment.deadline) : null;
  const overdue = daysPast !== null && daysPast > 0 && isOutstanding(assessment.status);
  const dueToday = daysPast === 0 && isOutstanding(assessment.status);

  return (
    <li className="border-border flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug font-medium">{assessment.name}</p>

          {assessment.provider ? (
            <span className="text-muted-foreground text-xs">· {assessment.provider}</span>
          ) : null}
        </div>

        {assessment.deadline ? (
          <p
            className={
              overdue
                ? "text-destructive mt-1 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium"
                : "text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-[0.8125rem]"
            }
          >
            {overdue ? <CalendarX aria-hidden="true" className="size-3.5" /> : null}
            {overdue ? "Deadline passed · " : dueToday ? "Due today · " : "Due "}
            {formatDateOnly(assessment.deadline)}
            {!overdue && !dueToday ? (
              <span className="text-muted-foreground/70">· {relativeDayLabel(daysPast ?? 0)}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-[0.8125rem]">No deadline</p>
        )}

        {showApplication && assessment.application ? (
          <p className="mt-1.5 text-[0.8125rem]">
            <Link
              href={`/applications/${assessment.application.id}`}
              className="hover:text-primary font-medium underline-offset-4 hover:underline"
            >
              {assessment.application.jobTitle}
            </Link>
            <span className="text-muted-foreground"> at {assessment.application.company.name}</span>
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
          {assessment.url ? (
            // `noreferrer` as well as `noopener`: the URL is user-supplied, so the
            // destination should learn nothing about where it was opened from. Zod
            // has already restricted the scheme to http/https (§8).
            <a
              href={assessment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden="true" className="size-3.5" />
              Open test
            </a>
          ) : null}

          {assessment.score ? (
            <span className="text-muted-foreground">
              Score <span className="text-foreground font-medium">{assessment.score}</span>
            </span>
          ) : null}
        </div>

        {assessment.notes ? (
          // `whitespace-pre-line` so typed line breaks survive. React escapes the
          // content, so this is plain text and never markup (§8).
          <p className="mt-2.5 text-[0.8125rem] leading-relaxed whitespace-pre-line">
            {assessment.notes}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:flex-col-reverse sm:items-end sm:gap-2">
        <div className="flex items-center gap-0.5">
          <AssessmentDialog assessment={assessment} />

          <ConfirmDelete
            endpoint={`/api/assessments/${assessment.id}`}
            triggerLabel={`Delete “${assessment.name}”`}
            title="Delete this assessment?"
            description={
              <>
                <strong className="text-foreground font-medium">{assessment.name}</strong> will be
                removed, along with its score and notes. Nothing else about the application changes.
              </>
            }
            successTitle="Assessment deleted"
            successDescription={assessment.name}
            failureMessage="Could not delete that assessment."
            undo={{
              restoredTitle: "Assessment restored",
              failureMessage: "Could not restore that assessment.",
            }}
          />
        </div>

        <AssessmentStatusBadge status={assessment.status} />
      </div>
    </li>
  );
}
