import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { WelcomeToast } from "@/components/dashboard/welcome-toast";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getDashboardSummary } from "@/server/queries/dashboard";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Dashboard · CareerTrack",
};

/**
 * The dashboard.
 *
 * The tiles are real counts from the database, not placeholders — which on a
 * new account means four honest zeroes. That is the point of building it this
 * way now: when Phase 2 starts writing applications, these numbers move on
 * their own with nothing left to wire up.
 *
 * Response rate is the one tile that can read "—". Its denominator is submitted
 * applications (DESIGN.md §3), and a rate over zero submissions is undefined
 * rather than 0% — see the note on `responseRate` in the query.
 *
 * `requireUser()` is called here as well as in the layout on purpose: it is how
 * a page gets the user, and the second call is served from the same request's
 * cache rather than hitting the database twice.
 *
 * TODO(phase-2): the primary "New application" action belongs in the header
 * here once the create form exists. TODO(phase-3): the upcoming-interviews,
 * deadline and task lists replace the empty state below.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);

  const firstName = user.name?.trim().split(/\s+/)[0];
  const { welcome } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      {welcome === "1" ? <WelcomeToast firstName={firstName} /> : null}

      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Every application, interview and deadline you are tracking, at a glance."
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
          description="Adding and tracking applications is the next block of the build. Your profile is saved, so there is nothing you need to do here right now."
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="Your pipeline is taking shape"
          description="The board and table views that list these applications arrive with the next block of the build. The counts above are already live."
        />
      )}
    </div>
  );
}
