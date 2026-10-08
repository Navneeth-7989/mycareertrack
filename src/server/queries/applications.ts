import { Prisma } from "@prisma/client";

import type { ApplicationStatusValue } from "@/lib/constants/application";
import { APPLICATION_STATUSES } from "@/lib/constants/application";
import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";
import type { ApplicationFilters, ApplicationSort } from "@/lib/validations/application-filters";

import { prisma } from "../db";

/**
 * Application reads: the filtered, sorted, paginated list behind the table and
 * the board (DESIGN.md §6).
 *
 * Everything here happens in Postgres. §8's "thousands of applications" case is
 * the reason — the browser never receives a row it is not showing, and the
 * counts come from aggregates rather than from `array.length` on a full fetch.
 */

const listSelect = {
  id: true,
  jobTitle: true,
  location: true,
  status: true,
  priority: true,
  workMode: true,
  employmentType: true,
  source: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  appliedAt: true,
  deadline: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true, website: true } },
} satisfies Prisma.ApplicationSelect;

export type ApplicationListItem = Prisma.ApplicationGetPayload<{ select: typeof listSelect }>;

export type ApplicationListResult = {
  items: ApplicationListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function listApplications(
  userId: string,
  filters: ApplicationFilters,
): Promise<ApplicationListResult> {
  const where = buildWhere(userId, filters);

  /*
   * `Promise.all`, not `$transaction([...])`. This was a transaction, on the
   * reasoning that the count and the page should describe one snapshot — and it
   * is the line that took this page down.
   *
   * Prisma allows 2 seconds by default to acquire a transaction. A suspended
   * Neon database takes longer than that to wake, so the first visit after a
   * quiet spell threw `P2028` out of a Server Component and rendered an error
   * page instead of a list.
   *
   * The snapshot it was buying was worth close to nothing. Both queries read
   * one user's own rows inside one request, so the only way the count and the
   * page could disagree is if that same user created an application in the
   * milliseconds between them — from a second tab, and the consequence would be
   * a footer reading "21" above twenty rows until the next render. Trading an
   * error page for that was a bad trade.
   *
   * Concurrent either way, so the latency is the same.
   */
  const [total, items] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy(filters.sort),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  return {
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    // One, not zero, when there is nothing: "Page 1 of 0" is not a thing, and
    // the empty state is what the user sees anyway.
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

/**
 * Everything the detail page shows about one application.
 *
 * A wider select than `listSelect` on purpose — this is the one screen that
 * reads `jobDescription`, which is a `@db.Text` column and is exactly the kind
 * of field that should never be dragged into a list query for 20 rows at a
 * time.
 */
const detailSelect = {
  id: true,
  jobTitle: true,
  jobUrl: true,
  location: true,
  workMode: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  status: true,
  priority: true,
  source: true,
  savedAt: true,
  appliedAt: true,
  deadline: true,
  jobDescription: true,
  firstResponseAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true, website: true } },
  contacts: {
    select: {
      // The role on *this* application, which is why it lives on the join —
      // the same person can be a referrer here and the hiring manager there.
      role: true,
      contact: {
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          phone: true,
          linkedinUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  /*
   * What a delete would take with it — the cascade preview §8 asks for, counted
   * in the database rather than inferred from the arrays above. It has to be:
   * `events` is capped at `TIMELINE_LIMIT`, so an application with eighty
   * entries would otherwise promise to delete fifty.
   *
   * All six relations are counted, including the five that are always zero until
   * Phase 3 builds them. The dialog renders only the non-zero ones, so interviews
   * and assessments start appearing in the warning the day they can exist,
   * without anyone having to remember to come back here.
   */
  _count: {
    select: {
      events: true,
      contacts: true,
      interviews: true,
      assessments: true,
      notes: true,
      tasks: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

/**
 * `isAutomatic` is here now, which it was not in Phase 2 — nothing wrote a
 * manual event then, so every row came back `true` and the column would have
 * been data the page fetched and never read.
 *
 * It earns its place by deciding what the timeline renders *controls* for. Only
 * a manual entry can be edited or deleted (see `mutations/events`), so this is
 * what the UI reads to decide whether an entry gets an Edit and a Delete button.
 * The server enforces the same rule independently; this is the flag that keeps
 * the page from offering an action that would be refused.
 */
const timelineSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
  occurredAt: true,
  isAutomatic: true,
} satisfies Prisma.ApplicationEventSelect;

export type ApplicationTimelineEvent = Prisma.ApplicationEventGetPayload<{
  select: typeof timelineSelect;
}>;

export type ApplicationDetail = Prisma.ApplicationGetPayload<{ select: typeof detailSelect }> & {
  events: ApplicationTimelineEvent[];
  /** True when the timeline was truncated by `TIMELINE_LIMIT`. */
  hasMoreEvents: boolean;
};

/**
 * How many timeline entries the detail page renders.
 *
 * Generous rather than tight: today the only events are automatic — one on
 * create, one per status change — so fifty is well past what any real
 * application accumulates. It is a bound rather than a feature, for the same
 * reason as `BOARD_COLUMN_LIMIT`. Phase 3 adds manual events and is where
 * paging the timeline belongs, if it ever needs to.
 */
export const TIMELINE_LIMIT = 50;

/**
 * One application, with its timeline and linked contacts.
 *
 * `findFirst({ id, userId })`, never `findUnique({ id })` — the §4 rule that
 * puts ownership in the WHERE clause rather than in a check someone has to
 * remember. A wrong id and another user's id both come back null, and the page
 * turns that into a 404 rather than a 403 (§6), so the response never confirms
 * that somebody else's application exists.
 *
 * The two queries run concurrently rather than in sequence. The events query
 * carries `userId` in its own WHERE clause, so it is independently scoped and
 * does not need the application read to have proved ownership first — which is
 * the whole point of the denormalised `userId` on every child table (§3). The
 * cost is one wasted query on a 404, which is the rare path.
 */
export async function getApplication(
  userId: string,
  applicationId: string,
): Promise<ApplicationDetail | null> {
  const [application, events] = await Promise.all([
    prisma.application.findFirst({
      where: { id: applicationId, userId },
      select: detailSelect,
    }),
    prisma.applicationEvent.findMany({
      where: { applicationId, userId },
      select: timelineSelect,
      /*
       * Newest first, tie-broken on `id` — the same discipline as
       * `buildOrderBy`, and it bites harder here. Creating an application past
       * APPLIED writes its opening event and its status event with timestamps
       * that can land in the same millisecond, so without the tiebreaker the
       * two could swap places between renders of the same page.
       */
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      // One more than the limit, which is how the page knows whether anything
      // was left out without a second count query.
      take: TIMELINE_LIMIT + 1,
    }),
  ]);

  if (!application) {
    return null;
  }

  return {
    ...application,
    events: events.slice(0, TIMELINE_LIMIT),
    hasMoreEvents: events.length > TIMELINE_LIMIT,
  };
}

/**
 * What the edit form needs, which is not what the detail page needs.
 *
 * A deliberately separate query rather than a reuse of `getApplication`. That
 * one fetches the timeline and the full contact records to *display* them, and
 * the edit form shows neither — while this one needs something the detail page
 * has no use for: how many other applications share the linked contact, which
 * is what lets the recruiter block warn before an edit reaches them all.
 */
const editSelect = {
  id: true,
  jobTitle: true,
  jobUrl: true,
  location: true,
  workMode: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  status: true,
  priority: true,
  source: true,
  appliedAt: true,
  deadline: true,
  jobDescription: true,
  company: { select: { id: true, name: true } },
  contacts: {
    select: {
      role: true,
      contact: {
        select: {
          id: true,
          name: true,
          role: true,
          email: true,
          phone: true,
          // How many applications this person is attached to, this one
          // included. The form subtracts one to say "3 other applications".
          _count: { select: { applications: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    /*
     * One, because four inputs can only describe one person. Phase 3 allows
     * several contacts per application, and the form will have to grow a real
     * list then — until something can create a second link there is exactly one
     * to edit, and taking the oldest makes which one deterministic rather than
     * leaving it to row order.
     */
    take: 1,
  },
} satisfies Prisma.ApplicationSelect;

export type ApplicationForEdit = Prisma.ApplicationGetPayload<{ select: typeof editSelect }>;

export async function getApplicationForEdit(
  userId: string,
  applicationId: string,
): Promise<ApplicationForEdit | null> {
  return prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: editSelect,
  });
}

/**
 * The `WHERE` clause. Exported for the board in the next step, which applies
 * the same filters without the pagination.
 *
 * `userId` is the first thing in it and is never conditional — the rule from §4
 * that makes an IDOR structurally impossible rather than a check someone has to
 * remember.
 */
export function buildWhere(
  userId: string,
  filters: ApplicationFilters,
): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];

  if (filters.q) {
    and.push(searchClause(filters.q));
  }

  if (filters.status.length > 0) {
    and.push({ status: { in: filters.status } });
  }

  if (filters.company.length > 0) {
    and.push({ companyId: { in: filters.company } });
  }

  if (filters.location.length > 0) {
    and.push({ location: { in: filters.location } });
  }

  if (filters.workMode.length > 0) {
    and.push({ workMode: { in: filters.workMode } });
  }

  if (filters.employmentType.length > 0) {
    and.push({ employmentType: { in: filters.employmentType } });
  }

  if (filters.priority.length > 0) {
    and.push({ priority: { in: filters.priority } });
  }

  if (filters.source.length > 0) {
    and.push({ source: { in: filters.source } });
  }

  if (filters.appliedFrom) {
    and.push({ appliedAt: { gte: filters.appliedFrom } });
  }

  if (filters.appliedTo) {
    // The bound is a calendar day, but `appliedAt` is a real timestamp — set to
    // "now" when an application is created as already submitted. `lte` on
    // midnight of the chosen day would therefore exclude almost everything that
    // happened *on* that day, so the bound is the start of the next one.
    and.push({ appliedAt: { lt: addDays(filters.appliedTo, 1) } });
  }

  return { userId, ...(and.length > 0 ? { AND: and } : {}) };
}

/**
 * Search across company, job title, location and notes (§3).
 *
 * Substring rather than full-text, because users type fragments — "goog",
 * "bangal" — and the trigram indexes in the `search_indexes` migration are what
 * keep that off a sequential scan.
 *
 * The company arm searches `nameNormalized` with the needle put through the
 * same normalizer, so searching "Google LLC" finds Google. The others use
 * `mode: "insensitive"`, which is ILIKE. Every value goes through Prisma as a
 * parameter, so `C++` and `O'Brien & Co.` are data and never syntax (§8).
 */
function searchClause(q: string): Prisma.ApplicationWhereInput {
  const or: Prisma.ApplicationWhereInput[] = [
    { jobTitle: { contains: q, mode: "insensitive" } },
    { location: { contains: q, mode: "insensitive" } },
    { notes: { some: { content: { contains: q, mode: "insensitive" } } } },
  ];

  const normalized = normalizeCompanyName(q);

  // Empty when the query is nothing but punctuation, in which case a
  // `contains: ""` arm would match every company and quietly defeat the search.
  if (normalized) {
    or.push({ company: { nameNormalized: { contains: normalized } } });
  }

  return { OR: or };
}

/**
 * Sort order, always ending in `id` — the tiebreaker is not optional.
 *
 * Without it, rows that tie on the sort column have no defined order between
 * them, and Postgres is free to return them differently for `OFFSET 0` and
 * `OFFSET 20`. The symptom is an application that appears on both page 1 and
 * page 2 while another never appears at all, and it shows up precisely when
 * rows were created together — a seed, or a batch logged in one sitting.
 */
function buildOrderBy(sort: ApplicationSort): Prisma.ApplicationOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }, { id: "desc" }];
    case "deadline":
      // Nulls last, or every application without a deadline would crowd out the
      // ones the sort exists to surface.
      return [{ deadline: { sort: "asc", nulls: "last" } }, { id: "desc" }];
    case "company":
      return [{ company: { name: "asc" } }, { jobTitle: "asc" }, { id: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * How many cards one column renders before it says "+N more".
 *
 * §8's "thousands of applications" case applies to the board more sharply than
 * to the table: the table pages, while a board has no natural page boundary and
 * would happily try to render 800 draggable cards in one column. The cap keeps
 * the DOM bounded; the count beside the heading stays honest about what was
 * left out, and the table view is where someone goes to see all of it.
 */
export const BOARD_COLUMN_LIMIT = 50;

export type BoardColumn = {
  status: ApplicationStatusValue;
  items: ApplicationListItem[];
  /** Matching the current filters, which may exceed what `items` holds. */
  total: number;
  hasMore: boolean;
};

/**
 * The Kanban board: every status as a column, under the same filters as the
 * table.
 *
 * One count query, then one page of cards per status that actually has any.
 * The alternative — a single `findMany` with a global cap, grouped in memory —
 * starves columns: a user with 400 saved roles would fetch 400 SAVED rows and
 * none of their interviews. Per-status queries are each served by the
 * `[userId, status]` index, and only the non-empty ones are issued, so a new
 * account costs one or two rather than nine.
 *
 * Pagination is deliberately ignored. A board is not paged — `page` and
 * `pageSize` belong to the table, and honouring them here would silently show
 * a fraction of the pipeline.
 */
export async function getBoardColumns(
  userId: string,
  filters: ApplicationFilters,
): Promise<BoardColumn[]> {
  const where = buildWhere(userId, filters);

  const counts = await prisma.application.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
    orderBy: { status: "asc" },
  });

  const totals = new Map(counts.map((row) => [row.status, row._count._all]));

  const populated = APPLICATION_STATUSES.filter((status) => (totals.get(status) ?? 0) > 0);

  const pages = await Promise.all(
    populated.map((status) =>
      prisma.application.findMany({
        where: { AND: [where, { status }] },
        select: listSelect,
        orderBy: buildOrderBy(filters.sort),
        take: BOARD_COLUMN_LIMIT,
      }),
    ),
  );

  const byStatus = new Map(populated.map((status, index) => [status, pages[index] ?? []]));

  // Every status gets a column, including the empty ones: a board is a picture
  // of a pipeline, and a missing "Offer" column would read as "offers are not
  // tracked" rather than "you have none yet". An empty column is also the only
  // place a card can be dropped to reach that status.
  return APPLICATION_STATUSES.map((status) => {
    const items = byStatus.get(status) ?? [];
    const total = totals.get(status) ?? 0;

    return { status, items, total, hasMore: total > items.length };
  });
}

/**
 * The options the filter bar offers, and the counts beside them.
 *
 * Computed across **all** of the user's applications rather than across the
 * current result set. Faceting against the filtered set is the fancier
 * behaviour and the wrong one here: it removes the option you would use to widen
 * a search, so a user who filtered to Rejected cannot see that they have
 * anything else. These counts answer "what is in my pipeline", which stays true
 * whatever is on screen.
 *
 * `total` is the unfiltered count, and it is what lets the page tell "you have
 * no applications" apart from "no applications match these filters" — two
 * states that need completely different words and completely different buttons.
 */
export type ApplicationFacets = {
  total: number;
  statusCounts: Record<ApplicationStatusValue, number>;
  companies: { id: string; name: string; count: number }[];
  locations: { value: string; count: number }[];
};

export async function getApplicationFacets(userId: string): Promise<ApplicationFacets> {
  /*
   * `Promise.all`, not `$transaction([...])`, for two reasons.
   *
   * The practical one: Prisma's batch transaction widens the return type of
   * `groupBy`, so `_count` comes back as the *input* union rather than a number
   * and every read of it needs a cast. A cast on an aggregate is exactly the
   * kind of `any`-by-another-name §5's checklist asks to keep off boundaries.
   *
   * The honest one: these counts do not need to describe one instant. They are
   * the labels beside filter options — "Interview 4" — and the list they
   * annotate is a separate query anyway. The place a shared snapshot genuinely
   * matters is `listApplications`, where the total and the page must agree, and
   * that one is a transaction.
   */
  const [total, byStatus, byCompany, byLocation] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
      // Prisma requires an explicit `orderBy` on `groupBy`. The order is
      // irrelevant here — the result is reshaped into a keyed record below — so
      // this is the cheapest deterministic one.
      orderBy: { status: "asc" },
    }),
    prisma.application.groupBy({
      by: ["companyId"],
      where: { userId },
      _count: { _all: true },
      orderBy: { _count: { companyId: "desc" } },
      take: 50,
    }),
    prisma.application.groupBy({
      by: ["location"],
      where: { userId, location: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { location: "desc" } },
      take: 50,
    }),
  ]);

  const names = await companyNames(
    userId,
    byCompany.map((row) => row.companyId),
  );

  const statusCounts = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatusValue, number>;

  for (const row of byStatus) {
    statusCounts[row.status] = row._count._all;
  }

  return {
    total,
    statusCounts,
    companies: byCompany
      .flatMap((row) => {
        const name = names.get(row.companyId);

        // A company that vanished between the two queries is dropped rather
        // than rendered as a blank chip.
        return name ? [{ id: row.companyId, name, count: row._count._all }] : [];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    locations: byLocation.flatMap((row) =>
      row.location ? [{ value: row.location, count: row._count._all }] : [],
    ),
  };
}

async function companyNames(userId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const companies = await prisma.company.findMany({
    // Scoped to companies this user can see, even though the ids came from
    // their own applications. Belt and braces, for the same reason as in
    // `queries/companies.ts`.
    where: {
      id: { in: ids },
      OR: [{ createdByUserId: null }, { createdByUserId: userId }],
    },
    select: { id: true, name: true },
  });

  return new Map(companies.map((company) => [company.id, company.name]));
}
