import type { ReactNode } from "react";
import { Download, ExternalLink } from "lucide-react";

import { ResumePreview } from "@/components/resumes/resume-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APPLICATION_SOURCE_LABELS,
  PRIORITY_LABELS,
  type PriorityValue,
} from "@/lib/constants/application";
import { canPreviewResume } from "@/lib/constants/resume";
import { formatDateOnly } from "@/lib/utils/date-only";
import { formatSalaryRange } from "@/lib/utils/salary";
import type { ApplicationDetail } from "@/server/queries/applications";

/**
 * The facts about the role that are not already on the page.
 *
 * What it deliberately leaves out is as considered as what it holds. The
 * location, work mode and employment type live in the header's identity line;
 * the four dates live in the stats strip; the job posting is a button. Printing
 * any of them again here would make the page read as a form dump rather than a
 * summary, and would pad a panel that is better short.
 *
 * Empty fields are omitted rather than rendered as em dashes. This is a
 * reference panel, not a form — a list of six "—" rows tells the user nothing
 * they cannot see faster on the edit screen, and it buries the rows that do
 * have content. Two rows are unconditional, so the panel is never an empty
 * card: priority has a column default, and `updatedAt` always exists.
 */
export function DetailFacts({ application }: { application: ApplicationDetail }) {
  const rows = facts(application);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
      </CardHeader>

      <CardContent>
        <dl className="divide-border -my-2.5 divide-y">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
            >
              <dt className="text-muted-foreground shrink-0">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

type Fact = { label: string; value: ReactNode };

function facts(application: ApplicationDetail): Fact[] {
  const rows: Fact[] = [];

  const salary = formatSalaryRange(
    application.salaryMin,
    application.salaryMax,
    application.currency,
  );

  if (salary) {
    rows.push({ label: "Salary", value: <span className="tabular-nums">{salary}</span> });
  }

  if (application.source) {
    rows.push({ label: "Source", value: APPLICATION_SOURCE_LABELS[application.source] });
  }

  rows.push({ label: "Priority", value: priorityValue(application.priority) });

  /*
   * Which version was sent — the fact §1 names as the product's answer to "no
   * idea which resume I actually used". Omitted when none was recorded, like
   * every other optional row here.
   */
  if (application.resume) {
    rows.push({ label: "Resume", value: <ResumeValue resume={application.resume} /> });
  }

  if (application.company.website) {
    rows.push({
      label: "Company",
      value: <ExternalAnchor href={application.company.website} />,
    });
  }

  /*
   * Last, and the only row here that is about the record rather than the role.
   * It earns its place because it is the answer to "is what I am reading
   * current" — the question someone asks after they have been away from the
   * app for a month.
   */
  rows.push({ label: "Updated", value: formatDateOnly(application.updatedAt) });

  return rows;
}

/**
 * The resume this application was sent with.
 *
 * Three states, and each is a different thing to offer:
 *
 * - **A live PDF** opens in place. This row is where "which resume did I send?"
 *   actually gets asked — the user is looking at the application that got the
 *   interview — so the answer should be the document, not a file in a downloads
 *   folder.
 * - **A live DOCX** is a download, because no browser renders one
 *   (`canPreviewKind`).
 * - **A deleted resume** is plain muted text. §9's soft delete exists so this row
 *   can still answer the question after the file has gone, and rendering it as
 *   un-clickable text with "(deleted)" beside it is what makes that legible —
 *   there is nothing to open, and the row says why rather than offering a link
 *   that would fail.
 *
 * Plain anchors, not `next/link` — these hrefs are API routes that redirect to a
 * signed URL, so `next/link` would treat them as pages and prefetch them, minting
 * a signed URL on hover. See the download route.
 */
function ResumeValue({ resume }: { resume: NonNullable<ApplicationDetail["resume"]> }) {
  if (resume.deletedAt) {
    return (
      <span className="text-muted-foreground font-normal">
        {resume.label} <span className="text-muted-foreground/70">(deleted)</span>
      </span>
    );
  }

  if (canPreviewResume(resume.mimeType)) {
    return <ResumePreview resume={resume} />;
  }

  return (
    <a
      href={`/api/resumes/${resume.id}/download`}
      className="text-primary focus-visible:ring-ring/40 inline-flex items-center gap-1.5 rounded-sm hover:underline focus-visible:ring-3 focus-visible:outline-none"
    >
      <span className="truncate">{resume.label}</span>
      <Download aria-hidden="true" className="size-3.5 shrink-0" />
    </a>
  );
}

/**
 * Priority as a word, not a mark.
 *
 * The opposite call from `applications-table`, and for the opposite reason:
 * there, "Medium" repeated down twenty rows was noise, so the default was
 * suppressed. Here it is one row on one application, and a labelled row whose
 * value is an em dash is worse than the word it was hiding.
 */
function priorityValue(priority: PriorityValue): ReactNode {
  return (
    <span className={priority === "HIGH" ? "text-destructive" : undefined}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/**
 * An outbound link showing its host rather than the full URL.
 *
 * A careers-page URL is routinely 200 characters of tracking parameters, which
 * would either blow out this column or be truncated to something unreadable.
 * The host is the part that carries meaning — it is how a reader confirms the
 * link goes where it claims — so that is what is shown, and the full address is
 * still in the `href` for anyone who copies it.
 */
function ExternalAnchor({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary focus-visible:ring-ring/40 inline-flex items-center gap-1.5 rounded-sm hover:underline focus-visible:ring-3 focus-visible:outline-none"
    >
      <span className="truncate">{hostOf(href)}</span>
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
    </a>
  );
}

function hostOf(value: string): string {
  try {
    // `www.` dropped because it is never the distinguishing part of a host and
    // takes a quarter of the available width in this column.
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    // `optionalUrl` guarantees a parseable http(s) URL at write time, so this
    // is only reachable for a row that predates the validation. Showing the raw
    // value beats showing nothing.
    return value;
  }
}
