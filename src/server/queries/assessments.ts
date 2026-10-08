import { Prisma } from "@prisma/client";

import { startOfTodayUtc } from "@/lib/utils/date-only";

import { prisma } from "../db";

/**
 * Assessment reads: the `/assessments` page and the dashboard's deadline list
 * (DESIGN.md §6, §7 Phase 3 — "assessments with deadline surfacing").
 *
 * **"Surfacing" is the whole design of this query.** An assessment matters in
 * proportion to how soon it is due and whether it is still outstanding, so the
 * page is grouped by urgency rather than listed flat: what is overdue or due
 * today, what is coming, what is finished. Those are three different questions and
 * a single chronological list answers none of them well.
 *
 * The deadline is a **calendar day** (`optionalDateOnly`), stored as midnight UTC
 * and compared as such — see `utils/date-only` for why that is right for a
 * deadline and wrong for an interview.
 */

const assessmentListSelect = {
  id: true,
  name: true,
  provider: true,
  url: true,
  deadline: true,
  status: true,
  score: true,
  notes: true,
  application: {
    select: {
      id: true,
      jobTitle: true,
      company: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.AssessmentSelect;

export type AssessmentListItem = Prisma.AssessmentGetPayload<{
  select: typeof assessmentListSelect;
}>;

export type AssessmentLists = {
  /**
   * Outstanding, with a deadline that has arrived or passed. The reason the page
   * exists — these are the ones about to be missed.
   */
  dueNow: AssessmentListItem[];
  /** Outstanding, due later or with no deadline at all. */
  upcoming: AssessmentListItem[];
  /** Submitted, passed or failed. A record rather than a to-do list. */
  done: AssessmentListItem[];
  total: number;
};

/**
 * Everything the assessments page shows, in one read.
 *
 * **One query, partitioned in memory** — deliberately the opposite choice from
 * `listInterviews`, which issues four. The difference is that interviews split on
 * an instant and grow without bound on the past side, where a user's outstanding
 * assessments are a handful by nature: nobody is sitting on two hundred untaken
 * tests. Three queries here would be three round trips to sort a list short enough
 * to sort locally, and the partition needs "today" anyway, which SQL would have to
 * be told.
 *
 * Capped all the same, because `done` does grow forever.
 */
export const ASSESSMENT_LIMIT = 200;

export async function listAssessments(userId: string): Promise<AssessmentLists> {
  const assessments = await prisma.assessment.findMany({
    where: { userId },
    select: assessmentListSelect,
    /*
     * Outstanding first, then by deadline with nulls last, then newest. The
     * ordering is what makes the in-memory partition below stable rather than
     * dependent on row order, and it means each group comes out already sorted.
     */
    orderBy: [
      { status: "asc" },
      { deadline: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: ASSESSMENT_LIMIT,
  });

  /*
   * The boundary is the **start of today in UTC**, matching how a date-only value
   * is stored. An assessment due today is in `dueNow`, not `upcoming`: the user has
   * hours left, which is exactly when they need to see it at the top. Using `now`
   * instead would move it into "due now" only after midnight had already passed,
   * which is too late to be useful.
   */
  const startOfToday = startOfTodayUtc();

  const dueNow: AssessmentListItem[] = [];
  const upcoming: AssessmentListItem[] = [];
  const done: AssessmentListItem[] = [];

  for (const assessment of assessments) {
    if (assessment.status !== "PENDING") {
      done.push(assessment);
    } else if (assessment.deadline && assessment.deadline.getTime() <= startOfToday) {
      dueNow.push(assessment);
    } else {
      upcoming.push(assessment);
    }
  }

  return { dueNow, upcoming, done, total: assessments.length };
}

/**
 * Outstanding assessments with a deadline, soonest first — the dashboard's action
 * list.
 *
 * A separate query rather than slicing `listAssessments`, so the dashboard does
 * not fetch a user's whole assessment history to render three rows. Assessments
 * with no deadline are excluded here even though the page shows them: a list
 * headed "deadlines" should only contain things that have one.
 */
export async function getDueAssessments(
  userId: string,
  limit: number,
): Promise<AssessmentListItem[]> {
  return prisma.assessment.findMany({
    where: { userId, status: "PENDING", deadline: { not: null } },
    select: assessmentListSelect,
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    take: limit,
  });
}
