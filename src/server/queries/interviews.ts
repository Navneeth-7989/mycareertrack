import { Prisma } from "@prisma/client";

import { prisma } from "../db";

/**
 * Interview reads: the `/interviews` page and the dashboard's next-up list
 * (DESIGN.md §6, §7 Phase 3).
 *
 * **Upcoming and past are two queries, not one list split in the browser.** The
 * split is the whole organising idea of the page — what is ahead of you is a
 * to-do list and what is behind you is a record — and they want opposite orders:
 * soonest first looking forward, most recent first looking back. Fetching
 * everything and partitioning in memory would also mean sending a user's entire
 * interview history to render the three rounds they have next week.
 *
 * Both are scoped by `userId` in the WHERE clause (§4) and both are served by the
 * `[userId, scheduledAt]` index.
 */

const interviewListSelect = {
  id: true,
  type: true,
  scheduledAt: true,
  endsAt: true,
  meetingUrl: true,
  interviewerName: true,
  result: true,
  prepNotes: true,
  notes: true,
  application: {
    select: {
      id: true,
      jobTitle: true,
      status: true,
      company: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InterviewSelect;

export type InterviewListItem = Prisma.InterviewGetPayload<{
  select: typeof interviewListSelect;
}>;

/**
 * How many past rounds the page renders.
 *
 * Only the past list is capped. Upcoming is bounded by reality — nobody has two
 * hundred interviews scheduled — while past grows forever, and §8's "thousands of
 * applications" case applies to it for the same reason it applies to the board.
 */
export const PAST_INTERVIEW_LIMIT = 50;

export type InterviewLists = {
  /** Soonest first: the next thing to prepare for is the first row. */
  upcoming: InterviewListItem[];
  /** Most recent first. */
  past: InterviewListItem[];
  /** True when `past` was truncated by `PAST_INTERVIEW_LIMIT`. */
  hasMorePast: boolean;
  /** Counts the whole set, not the page — the heading says how many there are. */
  upcomingCount: number;
  pastCount: number;
};

/**
 * Everything the interviews page shows.
 *
 * **The boundary between upcoming and past is `now`, not the start of today.** An
 * interview that finished an hour ago belongs under "past" — it is not something
 * to prepare for — and a user checking the page after a morning round would
 * otherwise still see it listed as upcoming all day. The cost is that the two
 * lists are computed against an instant that moves, which is correct for a
 * question about what happens next.
 *
 * `Promise.all` rather than `$transaction`, per the Neon cold-start reasoning in
 * `db.ts`: these are reads on a page, and a transaction's two-second acquisition
 * budget is shorter than a suspended database takes to wake.
 */
export async function listInterviews(userId: string): Promise<InterviewLists> {
  const now = new Date();

  const [upcoming, past, upcomingCount, pastCount] = await Promise.all([
    prisma.interview.findMany({
      where: { userId, scheduledAt: { gte: now } },
      select: interviewListSelect,
      // Tie-broken on id, the same discipline as `buildOrderBy`: two rounds
      // scheduled for the same minute would otherwise have no defined order and
      // could swap between renders.
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    }),
    prisma.interview.findMany({
      where: { userId, scheduledAt: { lt: now } },
      select: interviewListSelect,
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take: PAST_INTERVIEW_LIMIT + 1,
    }),
    prisma.interview.count({ where: { userId, scheduledAt: { gte: now } } }),
    prisma.interview.count({ where: { userId, scheduledAt: { lt: now } } }),
  ]);

  return {
    upcoming,
    past: past.slice(0, PAST_INTERVIEW_LIMIT),
    hasMorePast: past.length > PAST_INTERVIEW_LIMIT,
    upcomingCount,
    pastCount,
  };
}

/**
 * The next few rounds, for the dashboard's action list.
 *
 * A separate query rather than `listInterviews().upcoming.slice(0, n)`, because
 * the dashboard must not pay for the past list, the two counts, or the full
 * upcoming set to render three rows.
 */
export async function getUpcomingInterviews(
  userId: string,
  limit: number,
): Promise<InterviewListItem[]> {
  return prisma.interview.findMany({
    where: { userId, scheduledAt: { gte: new Date() } },
    select: interviewListSelect,
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: limit,
  });
}

/**
 * One interview, for the edit form. Ownership in the WHERE clause (§4), so a
 * wrong id and someone else's are both null.
 */
export async function getInterview(
  userId: string,
  interviewId: string,
): Promise<InterviewListItem | null> {
  return prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: interviewListSelect,
  });
}

/**
 * The applications an interview can be attached to, for the picker on the
 * interviews page.
 *
 * Scoped to this user and ordered by recency, because the role you are most
 * likely to be scheduling a round for is one you logged recently. Capped: the
 * picker is a dropdown, not a search, and a user with four hundred applications
 * should schedule from the application's own detail page instead — which is why
 * that path exists and does not need this list at all.
 */
export const APPLICATION_PICKER_LIMIT = 100;

export type ApplicationOption = {
  id: string;
  jobTitle: string;
  companyName: string;
};

export async function listApplicationOptions(userId: string): Promise<ApplicationOption[]> {
  const applications = await prisma.application.findMany({
    where: { userId },
    select: { id: true, jobTitle: true, company: { select: { name: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: APPLICATION_PICKER_LIMIT,
  });

  return applications.map((application) => ({
    id: application.id,
    jobTitle: application.jobTitle,
    companyName: application.company.name,
  }));
}
