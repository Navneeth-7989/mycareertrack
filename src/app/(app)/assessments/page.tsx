import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import { AssessmentDialog } from "@/components/assessments/assessment-dialog";
import { AssessmentRow } from "@/components/assessments/assessment-row";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAssessments } from "@/server/queries/assessments";
import { listApplicationOptions } from "@/server/queries/interviews";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Assessments · CareerTrack",
};

/**
 * `/assessments` — tests grouped by urgency, which is the "deadline surfacing"
 * §7 asks for.
 *
 * Replaces the `PlannedPage` placeholder wholesale.
 *
 * **Grouped rather than listed.** A flat chronological list of assessments answers
 * "what have I been set", which is not a question anybody opens this page with.
 * The question is "what am I about to miss", so the overdue-and-due-today group
 * comes first and is the only one that can be empty *and* still worth its heading
 * being absent. See `listAssessments` for where the boundary sits and why it is
 * the start of today rather than now.
 */
export default async function AssessmentsPage() {
  const user = await requireUser();

  const [lists, applicationOptions] = await Promise.all([
    listAssessments(user.id),
    listApplicationOptions(user.id),
  ]);

  const hasAnyApplication = applicationOptions.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Assessments"
        description="Online tests and take-homes, with whatever is about to run out of time at the top."
        actions={
          // Omitted when there is nothing to attach a test to — the picker would be
          // empty, and a button opening a form the user cannot complete is worse
          // than no button.
          hasAnyApplication ? <AssessmentDialog applicationOptions={applicationOptions} /> : null
        }
      />

      {lists.total === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={hasAnyApplication ? "No assessments yet" : "No applications yet"}
          description={
            hasAnyApplication
              ? "Add the online test or take-home a company has sent you, and its deadline will be surfaced here before it runs out."
              : "Assessments hang off an application, so log the role that set the test first."
          }
          action={
            hasAnyApplication ? (
              <AssessmentDialog applicationOptions={applicationOptions} />
            ) : (
              <ButtonLink href="/applications/new">New application</ButtonLink>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/*
           * Rendered only when it has rows. This is the one group whose heading
           * would be actively misleading when empty — a card saying "Needs
           * attention" with nothing in it reads as a loading failure, and its
           * absence is already the good news.
           */}
          {lists.dueNow.length > 0 ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-destructive">
                  Needs attention
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {lists.dueNow.length}
                  </span>
                </CardTitle>
                <CardDescription>Due today or already past their deadline.</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col">
                  {lists.dueNow.map((assessment) => (
                    <AssessmentRow key={assessment.id} assessment={assessment} showApplication />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                Still to do
                {lists.upcoming.length > 0 ? (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {lists.upcoming.length}
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription>
                Soonest deadline first. Tests with no fixed date come last.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {lists.upcoming.length === 0 ? (
                <p className="text-muted-foreground py-2 text-sm">
                  Nothing outstanding
                  {lists.dueNow.length > 0 ? " beyond what needs attention above" : ""}.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {lists.upcoming.map((assessment) => (
                    <AssessmentRow key={assessment.id} assessment={assessment} showApplication />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {lists.done.length > 0 ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  Done
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {lists.done.length}
                  </span>
                </CardTitle>
                <CardDescription>
                  Submitted, passed or not. Scores worth remembering live here.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col">
                  {lists.done.map((assessment) => (
                    <AssessmentRow key={assessment.id} assessment={assessment} showApplication />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
