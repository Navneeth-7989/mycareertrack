import { ApplicationStatus } from "@prisma/client";

import { prisma } from "../db";

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
 * One `$transaction` rather than five awaits: a single round trip to Neon, and
 * all five numbers describe the same instant, so the tiles can never show a
 * response rate computed against a different snapshot than the total.
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

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const now = new Date();

  const [
    totalApplications,
    activeApplications,
    submittedApplications,
    responses,
    upcomingInterviews,
  ] = await prisma.$transaction([
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
