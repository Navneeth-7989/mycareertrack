import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";

import { InterviewDialog } from "@/components/interviews/interview-dialog";
import { InterviewRow } from "@/components/interviews/interview-row";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listApplicationOptions, listInterviews } from "@/server/queries/interviews";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Interviews · CareerTrack",
};

/**
 * `/interviews` — every round, split into what is ahead and what has happened.
 *
 * Replaces the `PlannedPage` placeholder wholesale, as those were always meant to
 * be (see `planned-page`).
 *
 * A Server Component that reads Postgres directly (§4). The only JavaScript it
 * ships is the schedule/edit dialog and the delete confirmations — every date on
 * the page is formatted here, on the server, in `User.timezone`, which is what
 * keeps the one timezone conversion §4 asks for at the display boundary and
 * nowhere else.
 *
 * **The split is on `now`, not on the start of today** — see `listInterviews`. An
 * interview that finished an hour ago is not something to prepare for.
 */
export default async function InterviewsPage() {
  const user = await requireUser();

  const [lists, applicationOptions] = await Promise.all([
    listInterviews(user.id),
    listApplicationOptions(user.id),
  ]);

  const hasAnyApplication = applicationOptions.length > 0;
  const hasAnyInterview = lists.upcomingCount > 0 || lists.pastCount > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Interviews"
        description="Every round you have scheduled, split into what is still ahead and what has already happened."
        actions={
          /*
           * The action is omitted when there is nothing to attach a round to. An
           * interview requires an application, so the dialog's picker would be
           * empty — a button that opens a form the user cannot complete is worse
           * than no button, and the empty state below sends them to the right
           * place instead.
           */
          hasAnyApplication ? (
            <InterviewDialog timeZone={user.timezone} applicationOptions={applicationOptions} />
          ) : null
        }
      />

      {!hasAnyInterview ? (
        <EmptyState
          icon={CalendarClock}
          title={hasAnyApplication ? "No interviews scheduled" : "No applications yet"}
          description={
            hasAnyApplication
              ? "Schedule a round against one of your applications and it will show up here, with prep notes and a result to fill in afterwards."
              : "Interviews hang off an application, so log the role you are interviewing for first."
          }
          action={
            hasAnyApplication ? (
              <InterviewDialog timeZone={user.timezone} applicationOptions={applicationOptions} />
            ) : (
              <ButtonLink href="/applications/new">New application</ButtonLink>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/*
           * Upcoming is rendered even when empty, as long as something exists in
           * the past. "You have nothing coming up" is a genuinely useful answer —
           * and omitting the section would make the page look like it only ever
           * holds history.
           */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>
                Upcoming
                {lists.upcomingCount > 0 ? (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {lists.upcomingCount}
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription>Soonest first — the next thing to prepare for.</CardDescription>
            </CardHeader>

            <CardContent>
              {lists.upcoming.length === 0 ? (
                <p className="text-muted-foreground py-2 text-sm">
                  Nothing scheduled. {lists.pastCount > 0 ? "All your rounds are in the past." : ""}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {lists.upcoming.map((interview) => (
                    <InterviewRow
                      key={interview.id}
                      interview={interview}
                      timeZone={user.timezone}
                      showApplication
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {lists.past.length > 0 ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  Past
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {lists.pastCount}
                  </span>
                </CardTitle>
                <CardDescription>
                  Most recent first. Fill in how each one went while you still remember.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col">
                  {lists.past.map((interview) => (
                    <InterviewRow
                      key={interview.id}
                      interview={interview}
                      timeZone={user.timezone}
                      showApplication
                    />
                  ))}
                </ul>

                {lists.hasMorePast ? (
                  <p className="text-muted-foreground border-border mt-4 border-t pt-4 text-xs">
                    Only the {lists.past.length} most recent rounds are shown.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
