import type { Metadata } from "next";
import { CalendarClock, ClipboardCheck, Inbox, ListChecks, Plus } from "lucide-react";

import { ActionList, type ActionItem } from "@/components/dashboard/action-list";
import { StatTile } from "@/components/dashboard/stat-tile";
import { WelcomeToast } from "@/components/dashboard/welcome-toast";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { INTERVIEW_TYPE_LABELS } from "@/lib/constants/interview";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import { daysUntilInZone, daysUntilLabel, formatTimeInZone } from "@/lib/utils/date-time";
import { getDashboardActions, getDashboardSummary } from "@/server/queries/dashboard";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Dashboard · CareerTrack",
};

/**
 * The dashboard.
 *
 * The tiles have been real counts since Phase 1. Phase 3 fills in the three action lists
 * underneath them, which is the `TODO(phase-3)` this file carried from the start and the
 * last bullet of §7.
 *
 * **Every date is formatted here, on the server.** Interviews convert into
 * `User.timezone` because they are instants; assessment deadlines and task due dates are
 * read in UTC because they are calendar days. Getting those two the same way round is the
 * most likely source of an off-by-a-day bug in this phase, which is why the two helper
 * modules are deliberately separate — see `utils/date-only` and `utils/date-time`.
 *
 * `requireUser()` is called here as well as in the layout on purpose: it is how a page
 * gets the user, and the second call is served from the same request's cache rather than
 * hitting the database twice.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();

  const [summary, actions] = await Promise.all([
    getDashboardSummary(user.id),
    getDashboardActions(user.id),
  ]);

  const firstName = user.name?.trim().split(/\s+/)[0];
  const { welcome } = await searchParams;

  const interviewItems: ActionItem[] = actions.upcomingInterviews.map((interview) => {
    const days = daysUntilInZone(interview.scheduledAt, user.timezone);

    return {
      id: interview.id,
      title: INTERVIEW_TYPE_LABELS[interview.type],
      // "Tomorrow · 3:30 pm" — the relative day is what a user scans for, the clock time
      // is what they need once they have found it.
      when: `${daysUntilLabel(days)} · ${formatTimeInZone(interview.scheduledAt, user.timezone)}`,
      context: `${interview.application.jobTitle} at ${interview.application.company.name}`,
      href: `/applications/${interview.application.id}`,
    };
  });

  const assessmentItems: ActionItem[] = actions.dueAssessments.map((assessment) => {
    // `getDueAssessments` only returns rows with a deadline, so this is never null —
    // but the type is nullable, and `?? 0` is cheaper than a non-null assertion on a
    // boundary the compiler cannot verify.
    const daysPast = assessment.deadline ? daysSinceDateOnly(assessment.deadline) : 0;
    const overdue = daysPast > 0;

    return {
      id: assessment.id,
      title: assessment.name,
      when: overdue
        ? `Overdue · ${formatDateOnly(assessment.deadline)}`
        : daysPast === 0
          ? "Due today"
          : `Due ${formatDateOnly(assessment.deadline)} · ${relativeDayLabel(daysPast)}`,
      urgent: overdue || daysPast === 0,
      context: `${assessment.application.jobTitle} at ${assessment.application.company.name}`,
      href: `/applications/${assessment.application.id}`,
    };
  });

  const taskItems: ActionItem[] = actions.pressingTasks.map((task) => {
    const daysPast = task.dueDate ? daysSinceDateOnly(task.dueDate) : 0;
    const overdue = daysPast > 0;

    return {
      id: task.id,
      title: task.title,
      when: overdue ? `Overdue · ${formatDateOnly(task.dueDate)}` : "Due today",
      urgent: true,
      // Absent for a standalone task, which §3 allows — so the row simply has no
      // context line rather than an invented one.
      ...(task.application
        ? {
            context: `${task.application.jobTitle} at ${task.application.company.name}`,
            href: `/applications/${task.application.id}`,
          }
        : { href: "/tasks" }),
    };
  });

  /**
   * Whether there is anything to act on at all.
   *
   * Three empty cards are worse than one honest empty state on a new account — but once
   * a user has applications, an empty "Tasks due" card is genuinely useful information
   * ("nothing is late"), so the cards appear as soon as the pipeline does rather than
   * waiting for each list to fill.
   */
  const hasActions =
    interviewItems.length > 0 || assessmentItems.length > 0 || taskItems.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {welcome === "1" ? <WelcomeToast firstName={firstName} /> : null}

      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Every application, interview and deadline you are tracking, at a glance."
        actions={
          <ButtonLink size="lg" href="/applications/new">
            <Plus aria-hidden="true" data-icon="inline-start" />
            New application
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Applications"
          value={String(summary.totalApplications)}
          hint="Everything logged, saved roles included"
        />

        <StatTile
          label="Active"
          value={String(summary.activeApplications)}
          hint="Still open — not rejected, withdrawn or closed"
        />

        <StatTile
          label="Response rate"
          value={summary.responseRate === null ? "—" : `${Math.round(summary.responseRate * 100)}%`}
          hint={
            summary.submittedApplications === 0
              ? "Needs a submitted application to measure"
              : `${summary.responses} of ${summary.submittedApplications} submitted`
          }
        />

        <StatTile
          label="Interviews"
          value={String(summary.upcomingInterviews)}
          hint="Scheduled from today onwards"
        />
      </div>

      {summary.totalApplications === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No applications yet"
          description="Log the first role you have found or applied to, and these counts start moving."
          action={
            <ButtonLink href="/applications/new">
              <Plus aria-hidden="true" data-icon="inline-start" />
              New application
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <ActionList
            title="Next interviews"
            description="Soonest first."
            icon={CalendarClock}
            items={interviewItems}
            total={summary.upcomingInterviews}
            emptyMessage="Nothing scheduled. Add a round from an application when one is booked."
            viewAllHref="/interviews"
            viewAllLabel="All interviews"
          />

          <ActionList
            title="Assessment deadlines"
            description="Outstanding tests with a date."
            icon={ClipboardCheck}
            items={assessmentItems}
            emptyMessage="No deadlines coming up."
            viewAllHref="/assessments"
            viewAllLabel="All assessments"
          />

          <ActionList
            title="Tasks due"
            description="Overdue or due today."
            icon={ListChecks}
            items={taskItems}
            emptyMessage="Nothing due. Your list is clear."
            viewAllHref="/tasks"
            viewAllLabel="All tasks"
          />
        </div>
      )}

      {/*
       * Shown only when the pipeline exists but nothing in it needs attention — the
       * genuinely good state, which three empty cards would otherwise report as though
       * something were missing.
       */}
      {summary.totalApplications > 0 && !hasActions ? (
        <p className="text-muted-foreground text-center text-sm">
          Nothing needs your attention right now.
        </p>
      ) : null}
    </div>
  );
}
