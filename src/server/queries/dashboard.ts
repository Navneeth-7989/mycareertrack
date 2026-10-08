import { ApplicationStatus } from "@prisma/client";

import { prisma } from "../db";
import { getDueAssessments, type AssessmentListItem } from "./assessments";
import { getUpcomingInterviews, type InterviewListItem } from "./interviews";
import { getPressingTasks, type TaskListItem } from "./tasks";

/**
 * The dashboard's headline figures.
 *
 * These are the only metrics computed outside `queries/analytics.ts`, and they
 * are the four the design names for the dashboard (DESIGN.md §7, Phase 1) —
 * deliberately simple counts, not the full metric set. The analytics page owns
 * anything that needs the event log, such as "ever reached INTERVIEW", because
 * that definition must exist in exactly one place.
 *
 * Every count is scoped by `userId` in the WHERE clause, per the rule in §4.
 *
 * These were one `$transaction` for a consistent snapshot. They are now
 * `Promise.all`, for the reason in `db.ts`: Prisma's two-second default for
 * acquiring a transaction is shorter than a suspended Neon database takes to
 * wake, so a transaction on a read path turns a slow first visit into an error
 * page. The applications list is where that was found; this had the identical
 * exposure.
 *
 * Nothing is lost. The one number that could have been made incoherent by
 * reading at different instants is `responseRate`, and it cannot be: every
 * application with a `firstResponseAt` already had an `appliedAt` before it,
 * so `responses` can grow between the two counts while `submitted` cannot
 * shrink. The rate stays at or below 1 whatever order they resolve in.
 */

/**
 * Terminal states. "Active" is everything else — an application you might still
 * hear back about, which is what the tile is actually telling you.
 */
const INACTIVE_STATUSES = [
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ACCEPTED,
] as const;

export type DashboardSummary = {
  /** Every application, including SAVED and WITHDRAWN — a volume figure. */
  totalApplications: number;
  activeApplications: number;
  /** `appliedAt IS NOT NULL` — the denominator for every rate. */
  submittedApplications: number;
  responses: number;
  /**
   * Null, not zero, when nothing has been submitted yet. "0%" is a claim that
   * nobody replied; null is the truth, which is that there is nothing to
   * measure. The UI renders an em dash for it.
   */
  responseRate: number | null;
  upcomingInterviews: number;
};

/**
 * How many rows each dashboard action list shows.
 *
 * Small on purpose. These are a prompt to act, not a replacement for the pages they
 * link to — a dashboard that lists twelve tasks has become the tasks page, badly. Four
 * is enough to convey "there is a queue here" while fitting three cards across without
 * any of them scrolling.
 */
const ACTION_LIST_SIZE = 4;

export type DashboardActions = {
  upcomingInterviews: InterviewListItem[];
  dueAssessments: AssessmentListItem[];
  /** Overdue and due-today, which is what "pressing" means here. */
  pressingTasks: TaskListItem[];
};

/**
 * The three action lists on the dashboard — the `TODO(phase-3)` the page carried since
 * Phase 1 (§7: "dashboard action lists wired to real data").
 *
 * Each delegates to the query that owns its entity rather than re-deriving the rules
 * here. That matters more than it looks: "due" for an assessment means outstanding with
 * a deadline that has arrived, and "pressing" for a task means not done and due by the
 * end of today — definitions that already exist beside the pages that display them, and
 * which would drift the moment the dashboard wrote its own copy.
 *
 * `Promise.all`, not `$transaction`, per the Neon cold-start reasoning in `db.ts`: three
 * reads on a page, and a transaction's two-second acquisition budget is shorter than a
 * suspended database takes to wake. There is also nothing to make consistent — these are
 * three independent lists, not parts of one figure.
 */
export async function getDashboardActions(userId: string): Promise<DashboardActions> {
  const [upcomingInterviews, dueAssessments, pressingTasks] = await Promise.all([
    getUpcomingInterviews(userId, ACTION_LIST_SIZE),
    getDueAssessments(userId, ACTION_LIST_SIZE),
    getPressingTasks(userId, ACTION_LIST_SIZE),
  ]);

  return { upcomingInterviews, dueAssessments, pressingTasks };
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const now = new Date();

  const [
    totalApplications,
    activeApplications,
    submittedApplications,
    responses,
    upcomingInterviews,
  ] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: { notIn: [...INACTIVE_STATUSES] } } }),
    prisma.application.count({ where: { userId, appliedAt: { not: null } } }),
    prisma.application.count({ where: { userId, firstResponseAt: { not: null } } }),
    prisma.interview.count({ where: { userId, scheduledAt: { gte: now } } }),
  ]);

  return {
    totalApplications,
    activeApplications,
    submittedApplications,
    responses,
    responseRate: submittedApplications === 0 ? null : responses / submittedApplications,
    upcomingInterviews,
  };
}
