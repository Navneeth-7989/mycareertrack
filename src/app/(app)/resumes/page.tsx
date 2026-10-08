import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ResumeRow } from "@/components/resumes/resume-row";
import { ResumeUpload } from "@/components/resumes/resume-upload";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RESUME_MAX_BYTES } from "@/lib/constants/resume";
import { formatFileSize } from "@/lib/utils/file-size";
import { listResumes } from "@/server/queries/resumes";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Resumes · CareerTrack",
};

/**
 * `/resumes` — every version on file (DESIGN.md §7 Phase 4).
 *
 * Replaces the `PlannedPage` placeholder wholesale.
 *
 * **One flat list, default first.** The other Phase 3 pages group by urgency
 * because their rows compete for attention — a deadline today outranks one next
 * month. Resumes do not: there are three of them, none is overdue, and the only
 * distinction worth drawing is which one gets sent by default. So the default
 * sits at the top with a badge and everything else is newest-first, and no
 * grouping is invented to fill the space.
 *
 * Deleted resumes are not shown, per §3. The row survives a delete so that an
 * application can still name the version it was sent with, but this page is a
 * list of resumes the user *has* — and a section of files that no longer exist
 * would be a graveyard nobody asked for. They surface where they are relevant:
 * on the application that used one, as "Frontend Resume (deleted)".
 */
export default async function ResumesPage() {
  const user = await requireUser();

  const resumes = await listResumes(user.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Resumes"
        description="Every version you have sent, and which application received which one."
        actions={resumes.length > 0 ? <ResumeUpload /> : null}
      />

      {resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          description={`Upload the PDF or Word document you send with applications, up to ${formatFileSize(
            RESUME_MAX_BYTES,
          )}. Keeping each version here is what lets an application still tell you which one got the interview.`}
          action={<ResumeUpload />}
        />
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              On file
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {resumes.length}
              </span>
            </CardTitle>

            <CardDescription>
              Stored privately. Downloads go through a link that expires after a minute, and nobody
              else can reach them.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="flex flex-col">
              {resumes.map((resume) => (
                <ResumeRow key={resume.id} resume={resume} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
