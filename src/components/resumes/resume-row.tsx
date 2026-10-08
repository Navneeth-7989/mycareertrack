import { Download, FileText } from "lucide-react";
import { cn } from "cn";

import { ResumeDefaultButton } from "@/components/resumes/resume-default-button";
import { ResumePreview } from "@/components/resumes/resume-preview";
import { ResumeRenameDialog } from "@/components/resumes/resume-rename-dialog";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RESUME_KIND_LABELS, canPreviewKind, resumeKindFromMime } from "@/lib/constants/resume";
import { formatDateOnly } from "@/lib/utils/date-only";
import { formatFileSize } from "@/lib/utils/file-size";
import type { ResumeListItem } from "@/server/queries/resumes";

/**
 * One resume on `/resumes`.
 *
 * A Server Component with four client islands in it — the preview, the default
 * star, the rename dialog and the delete confirmation — which is the same
 * arrangement as the interview and assessment rows. The row itself renders no
 * interactive state, so none of the text, the dates or the counts need to reach
 * the browser as data.
 *
 * **Four icon controls is more than any other row in the app carries**, and that
 * is a consequence of there being no resume detail page to move them to. A resume
 * is a file and a name; a page showing one would hold nothing but the controls
 * themselves. So they live here, as icon buttons with named labels rather than
 * behind a kebab menu — a menu would hide the download, and it would have no
 * sensible place for the one action the name itself now carries.
 *
 * **Reading the document is the name, not a fifth button.** See the trigger
 * below: "click the thing to open the thing" needs no icon, and it keeps the
 * action cluster for operations *on* the record rather than on its contents.
 */
export function ResumeRow({ resume }: { resume: ResumeListItem }) {
  const kind = resumeKindFromMime(resume.mimeType);

  return (
    <li className="border-border flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      {/*
       * The glyph plus the format in small caps, rather than a red PDF icon and a
       * blue Word one. Two saturated brand colours on every row is decoration
       * standing in for hierarchy — the format matters, so it is stated, and the
       * one accent on this page belongs to the default star.
       */}
      <div
        aria-hidden="true"
        className="bg-muted text-muted-foreground flex size-10 shrink-0 flex-col items-center justify-center rounded-lg"
      >
        <FileText className="size-4" />
        {kind ? (
          <span className="mt-0.5 text-[0.5625rem] leading-none font-semibold tracking-wide">
            {RESUME_KIND_LABELS[kind]}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/*
           * Clicking the name opens the document, which is what people come here
           * to do — checking *which* version this is should not cost a download
           * and a trip to the file manager.
           *
           * A DOCX gets a download link instead of a preview, because no browser
           * renders one (see `canPreviewKind`). Both are "click the name to open
           * it"; the mechanism differs only where the format forces it, and a
           * control that opened an empty viewer would be worse than one that
           * plainly hands over the file.
           */}
          {canPreviewKind(kind) ? (
            <ResumePreview resume={resume} />
          ) : (
            <a
              href={`/api/resumes/${resume.id}/download`}
              className="focus-visible:ring-ring/40 truncate rounded-sm text-sm leading-snug font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
            >
              {resume.label}
              <span className="sr-only"> — download to read</span>
            </a>
          )}

          {resume.isDefault ? (
            <Badge variant="secondary" className="shrink-0">
              Default
            </Badge>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-1 truncate text-[0.8125rem]">
          {resume.fileName}
          <span className="text-muted-foreground/70">
            {" · "}
            {formatFileSize(resume.fileSize)}
            {" · added "}
            {formatDateOnly(resume.createdAt)}
          </span>
        </p>

        {/*
         * The number that makes this a record rather than a file list. Suppressed
         * at zero: "sent with 0 applications" is a labelled absence, and a new
         * upload has not been sent with anything yet by definition.
         */}
        {resume._count.applications > 0 ? (
          <p className="mt-1.5 text-[0.8125rem]">
            Sent with{" "}
            <span className="font-medium">
              {resume._count.applications === 1
                ? "one application"
                : `${resume._count.applications} applications`}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/*
         * A plain anchor, not a fetch and deliberately not `ButtonLink`.
         *
         * The route answers 307 to a signed URL carrying a
         * `Content-Disposition`, so the browser downloads the file under its
         * original name with no JavaScript involved — see the download route for
         * why it redirects rather than returning the URL in a body.
         *
         * `next/link` would be wrong twice over for that. It treats a
         * same-origin href as a route and tries to navigate the router to an API
         * path that is not a page, and it *prefetches* — which would mint a
         * signed URL every time the pointer crossed this button.
         */}
        <a
          href={`/api/resumes/${resume.id}/download`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <Download aria-hidden="true" />
          <span className="sr-only">Download “{resume.label}”</span>
        </a>

        <ResumeDefaultButton resume={resume} />

        <ResumeRenameDialog resume={resume} />

        {/*
         * No `undo`, and the dialog says so by omission — `ConfirmDelete` only
         * promises "a few seconds to undo" when that prop is set. There is
         * genuinely no undo here: the file is removed from storage for real, and
         * nothing in a response body could put it back. What survives is the
         * record, which is what the description explains.
         */}
        <ConfirmDelete
          endpoint={`/api/resumes/${resume.id}`}
          triggerLabel={`Delete “${resume.label}”`}
          title="Delete this resume?"
          description={
            <>
              The file for <strong className="text-foreground font-medium">{resume.label}</strong>{" "}
              will be permanently deleted and cannot be recovered.
              {resume._count.applications > 0 ? (
                <>
                  {" "}
                  The{" "}
                  <strong className="text-foreground font-medium">
                    {resume._count.applications === 1
                      ? "one application"
                      : `${resume._count.applications} applications`}
                  </strong>{" "}
                  sent with it will keep showing its name, marked as deleted, so you can still see
                  which version you sent.
                </>
              ) : (
                " No application has been sent with it yet."
              )}
            </>
          }
          successTitle="Resume deleted"
          successDescription={resume.label}
          failureMessage="Could not delete that resume."
        />
      </div>
    </li>
  );
}
