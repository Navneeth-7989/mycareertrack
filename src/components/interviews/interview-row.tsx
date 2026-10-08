import Link from "next/link";
import { ExternalLink, User } from "lucide-react";

import { InterviewDialog } from "@/components/interviews/interview-dialog";
import { InterviewResultBadge } from "@/components/interviews/interview-result-badge";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import {
  INTERVIEW_TYPE_LABELS,
  type InterviewResultValue,
  type InterviewTypeValue,
} from "@/lib/constants/interview";
import {
  daysUntilInZone,
  daysUntilLabel,
  formatInstantInZone,
  formatTimeInZone,
} from "@/lib/utils/date-time";

/**
 * One interview, rendered identically on the application's detail page and on
 * `/interviews`.
 *
 * Shared rather than written twice because the two differ in exactly one thing —
 * whether the application needs naming — and that is a prop. Two copies would be
 * two places for the timezone handling and the result badge to drift, and the
 * timezone is the part of this feature most able to be subtly wrong.
 *
 * Every date is formatted on the **server**, in `User.timezone`, by the helpers in
 * `utils/date-time`. Nothing here is a client component and nothing reads the
 * browser's clock, so there is no hydration mismatch and no flash of UTC.
 */

export type InterviewRowData = {
  id: string;
  type: InterviewTypeValue;
  scheduledAt: Date;
  endsAt: Date | null;
  meetingUrl: string | null;
  interviewerName: string | null;
  result: InterviewResultValue;
  prepNotes: string | null;
  notes: string | null;
  /**
   * Optional, because the application's own detail page already names it in the
   * page header — fetching and rendering it again inside every row there would be
   * repeating the one fact the user cannot be unaware of. Required in practice
   * wherever `showApplication` is set, which is only `/interviews`.
   */
  application?: {
    id: string;
    jobTitle: string;
    company: { name: string };
  };
};

export function InterviewRow({
  interview,
  timeZone,
  showApplication = false,
}: {
  interview: InterviewRowData;
  timeZone: string;
  /** True on `/interviews`, where a round has no application in context. */
  showApplication?: boolean;
}) {
  const days = daysUntilInZone(interview.scheduledAt, timeZone);
  const minutes = durationMinutes(interview);

  return (
    <li className="border-border flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm leading-snug font-medium">
            {INTERVIEW_TYPE_LABELS[interview.type]}
          </p>

          {/*
           * The relative label is the thing a user actually scans for — "In 2
           * days" answers the question the page exists to answer, where the full
           * date answers "which 2 days". Both are shown, in that order of
           * prominence.
           */}
          <span className="text-muted-foreground text-xs">· {daysUntilLabel(days)}</span>
        </div>

        <p className="text-muted-foreground mt-1 text-[0.8125rem]">
          {formatInstantInZone(interview.scheduledAt, timeZone)}
          {interview.endsAt ? (
            <>
              {" – "}
              {formatTimeInZone(interview.endsAt, timeZone)}
              {minutes !== null ? (
                <span className="text-muted-foreground/70"> · {minutes} min</span>
              ) : null}
            </>
          ) : null}
        </p>

        {showApplication && interview.application ? (
          <p className="mt-1.5 text-[0.8125rem]">
            <Link
              href={`/applications/${interview.application.id}`}
              className="hover:text-primary font-medium underline-offset-4 hover:underline"
            >
              {interview.application.jobTitle}
            </Link>
            <span className="text-muted-foreground"> at {interview.application.company.name}</span>
          </p>
        ) : null}

        {interview.interviewerName || interview.meetingUrl ? (
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
            {interview.interviewerName ? (
              <span className="inline-flex items-center gap-1.5">
                <User aria-hidden="true" className="size-3.5" />
                {interview.interviewerName}
              </span>
            ) : null}

            {interview.meetingUrl ? (
              /*
               * `rel="noreferrer"` as well as `noopener`: the URL is user-supplied,
               * so the destination should learn nothing about where it was opened
               * from. Zod has already restricted the scheme to http/https, which
               * is what keeps `javascript:` out of an href (§8).
               */
              <a
                href={interview.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                Join meeting
              </a>
            ) : null}
          </div>
        ) : null}

        {interview.prepNotes ? <Section label="Prep" text={interview.prepNotes} /> : null}

        {interview.notes ? <Section label="Notes" text={interview.notes} /> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:flex-col-reverse sm:items-end sm:gap-2">
        <div className="flex items-center gap-0.5">
          <InterviewDialog timeZone={timeZone} interview={interview} />

          <ConfirmDelete
            endpoint={`/api/interviews/${interview.id}`}
            triggerLabel={`Delete the ${INTERVIEW_TYPE_LABELS[interview.type]} round`}
            title="Delete this interview?"
            description={
              <>
                The{" "}
                <strong className="text-foreground font-medium">
                  {INTERVIEW_TYPE_LABELS[interview.type]}
                </strong>{" "}
                round on {formatInstantInZone(interview.scheduledAt, timeZone)} will be removed,
                along with its prep notes. If it was called off rather than entered by mistake, set
                the result to Cancelled instead — that keeps the record.
              </>
            }
            successTitle="Interview deleted"
            failureMessage="Could not delete that interview."
          />
        </div>

        <InterviewResultBadge result={interview.result} />
      </div>
    </li>
  );
}

/**
 * Prep notes and "how it went", as a labelled block.
 *
 * `whitespace-pre-line` so the line breaks a user typed survive — these are
 * genuinely multi-line fields, and collapsing them into a paragraph would make a
 * bulleted prep list unreadable. React escapes the content, so this is plain text
 * and never markup (§8).
 */
function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2.5">
      <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-[0.8125rem] leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

/** Milliseconds in a minute. */
const MINUTE_MS = 60 * 1000;

function durationMinutes(interview: { scheduledAt: Date; endsAt: Date | null }): number | null {
  if (!interview.endsAt) {
    return null;
  }

  const minutes = Math.round(
    (interview.endsAt.getTime() - interview.scheduledAt.getTime()) / MINUTE_MS,
  );

  return minutes > 0 ? minutes : null;
}
