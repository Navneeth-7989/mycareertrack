import { EventType, Prisma } from "@prisma/client";

import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  type ApplicationSourceValue,
  type ApplicationStatusValue,
} from "@/lib/constants/application";

import { prisma } from "../db";

/**
 * Every metric in the product, defined here and computed nowhere else.
 *
 * DESIGN.md §3 "Metric definitions" is the specification this file implements,
 * and §1 names the reason it is one file: *"three places dividing by slightly
 * different denominators produce three different numbers and destroy trust"*.
 * The dashboard's four tiles are the one documented exception — simple counts,
 * flagged as such in `queries/dashboard.ts`.
 *
 * **The read and the arithmetic are deliberately separate.** `getAnalytics`
 * does three queries and hands the rows to `summarizeAnalytics`, which is pure.
 * That is what makes §7's "analytics match hand-counted figures" testable
 * without a database: `tests/server/analytics.test.ts` hand-counts fixtures
 * through the same function the page calls.
 *
 * **One read, one pass, one denominator.** Every figure on the page comes from
 * the same three result sets at the same instant, so the rates cannot disagree
 * with the counts they are drawn from — a split into per-metric aggregate
 * queries would reintroduce exactly the inconsistency §1 warns about. The cost
 * is that one user's applications are held in server memory; the projection is
 * five scalars wide and a job search is hundreds of rows, not millions. §8's
 * "thousands of applications" rule is about what the *browser* holds, and the
 * browser gets only the summary. Flagged for Phase 5's query-plan step if the
 * volume ever justifies pushing this into SQL aggregates.
 */

/**
 * How many submitted applications a rate needs before it is shown.
 *
 * §8's edge-case table: *"Analytics with 2 applications — rates hidden below a
 * minimum sample with 'not enough data yet' rather than a misleading 50%"*. One
 * rejection out of two applications is a 50% rejection rate that means nothing,
 * and a number that means nothing is worse than a blank, because the user will
 * act on it.
 *
 * Five rather than ten: the threshold has to be reachable in a first session,
 * or the page the product is sold on stays empty for a fortnight.
 */
export const MIN_SUBMITTED_FOR_RATES = 5;

/**
 * The same idea per source, and necessarily lower — a user who has sent twenty
 * applications has spread them over four or five channels, so a per-source bar
 * that waited for five each would never appear. Three is the fewest that can
 * show a trend rather than a coin flip, and the table prints the raw counts
 * beside every rate so the reader can see how thin the sample is.
 */
export const MIN_SUBMITTED_PER_SOURCE = 3;

/** The volume chart's window: a year of months, trimmed to the months with data. */
export const VOLUME_MONTHS = 12;

/**
 * The only fields any metric needs.
 *
 * `savedAt` is absent on purpose — the volume chart buckets by `appliedAt`,
 * because "applications sent in March" is the figure a user is looking for and
 * a saved role carries no month worth charting.
 */
const analyticsSelect = {
  id: true,
  status: true,
  source: true,
  appliedAt: true,
  firstResponseAt: true,
} satisfies Prisma.ApplicationSelect;

export type AnalyticsRow = Prisma.ApplicationGetPayload<{ select: typeof analyticsSelect }>;

/**
 * Which applications have evidence of reaching interview or offer, as ids.
 *
 * §3: *"'ever reached' needs history, not current status — a rejected candidate
 * who interviewed still counts toward interview rate."* The current status
 * cannot answer that, because a rejection overwrites it.
 *
 * **What history is readable, and what is not.** §3 points at
 * `ApplicationEvent`, and the `[userId, type, occurredAt]` index exists for it —
 * but a `STATUS_CHANGE` event records its target status only inside the
 * display string `title` ("Moved to Interview"), set from
 * `APPLICATION_STATUS_LABELS` in `mutations/applications.ts`. Parsing a label
 * back into an enum would make every metric on this page depend on UI copy, and
 * the first time someone retitles a status the rates would silently change. So
 * the label is not parsed. Three typed signals are used instead, any one of
 * which is proof:
 *
 * - the **current status** is at or past the stage (the common case),
 * - an **`Interview` row** exists — scheduling a round is not something you do
 *   to an application that never got one, and it survives a later rejection,
 * - a manual **`INTERVIEW` / `OFFER` timeline event** exists, which is the user
 *   stating it happened.
 *
 * This is a documented departure from §3's single-source wording and is
 * recorded in DESIGN.md §3. It is strictly more complete than the status alone
 * and strictly more durable than the string.
 */
export type ReachedEvidence = {
  interviewed: ReadonlySet<string>;
  offered: ReadonlySet<string>;
};

/** Statuses that are themselves proof the application reached interview. */
const INTERVIEW_OR_LATER: readonly ApplicationStatusValue[] = ["INTERVIEW", "OFFER", "ACCEPTED"];

/** Statuses that are themselves proof an offer was made. */
const OFFER_OR_LATER: readonly ApplicationStatusValue[] = ["OFFER", "ACCEPTED"];

/** §3's "active": an application you might still hear back about. */
const INACTIVE_STATUSES: readonly ApplicationStatusValue[] = ["REJECTED", "WITHDRAWN", "ACCEPTED"];

/**
 * A numerator with the rate it produces.
 *
 * `rate` is `null` in two distinct situations that the UI renders the same way
 * but describes differently: nothing submitted at all, and a sample below
 * `MIN_SUBMITTED_FOR_RATES`. `count` is always real, so the card can say "2 of
 * 3 replied" while withholding "67%".
 */
export type RateMetric = {
  count: number;
  rate: number | null;
};

export type FunnelStage = {
  key: "submitted" | "response" | "interview" | "offer";
  label: string;
  hint: string;
  count: number;
  /** Share of submitted, 0–1. Always 1 for the first stage, null with nothing submitted. */
  share: number | null;
};

export type StatusSlice = {
  status: ApplicationStatusValue;
  count: number;
  /** Share of *total*, not submitted — this is the volume view, not a rate. */
  share: number;
};

export type VolumeMonth = {
  /** `YYYY-MM`, UTC. The React key, and stable across re-renders. */
  key: string;
  /** Axis tick — "Mar", or "Jan 26" where a window crossing new year needs it. */
  label: string;
  /** Tooltip heading — "March 2026". */
  fullLabel: string;
  submitted: number;
  replied: number;
  /** `submitted - replied`, precomputed so the stacked chart does no arithmetic. */
  silent: number;
};

export type ResponseTimeBucket = {
  label: string;
  count: number;
};

export type SourceStats = {
  /** `null` is "not recorded" — the form leaves source optional. */
  source: ApplicationSourceValue | null;
  submitted: number;
  responses: number;
  interviews: number;
  offers: number;
  /** All three are `null` below `MIN_SUBMITTED_PER_SOURCE`. */
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
};

/**
 * The comparison §1 promises: *"referrals convert 8× better than LinkedIn
 * applies for you"* — the line the product is sold on.
 *
 * Only ever built from two sources that both clear `MIN_SUBMITTED_PER_SOURCE`,
 * and only when the gap is worth a sentence. `multiple` is `null` when the
 * weaker channel has produced no interviews at all, because dividing by zero
 * would claim an infinite advantage from what may be three applications.
 */
export type SourceInsight = {
  best: ApplicationSourceValue | null;
  bestRate: number;
  bestSubmitted: number;
  worst: ApplicationSourceValue | null;
  worstRate: number;
  worstSubmitted: number;
  multiple: number | null;
};

export type Analytics = {
  /** Echoed so the UI can say "three more to go" without a second copy of the number. */
  minSubmittedForRates: number;
  minSubmittedPerSource: number;

  total: number;
  /** `appliedAt IS NOT NULL` — the denominator for every rate on this page. */
  submitted: number;
  active: number;
  /** True once `submitted >= MIN_SUBMITTED_FOR_RATES`. Every rate is null until then. */
  enoughForRates: boolean;

  response: RateMetric;
  interview: RateMetric;
  offer: RateMetric;
  rejection: RateMetric;

  /** Mean days from `appliedAt` to `firstResponseAt`. Null with nothing to average. */
  avgResponseDays: number | null;
  medianResponseDays: number | null;
  /** How many applications the two figures above are drawn from. */
  responseTimeSample: number;

  funnel: FunnelStage[];
  statusMix: StatusSlice[];
  volume: VolumeMonth[];
  responseTimes: ResponseTimeBucket[];
  sources: SourceStats[];
  sourceInsight: SourceInsight | null;
};

/**
 * Response-time buckets, as inclusive upper bounds in days.
 *
 * Uneven on purpose, because waiting is experienced on a log scale: the
 * difference between one day and three matters to a candidate, the difference
 * between forty days and sixty does not. The last bucket is open-ended.
 */
const RESPONSE_TIME_BUCKETS: readonly { readonly max: number; readonly label: string }[] = [
  { max: 2, label: "Within 2 days" },
  { max: 7, label: "3–7 days" },
  { max: 14, label: "1–2 weeks" },
  { max: 30, label: "2–4 weeks" },
  { max: Number.POSITIVE_INFINITY, label: "Over a month" },
];

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM` in UTC — see `monthKey`'s note on why not a zoned month. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Rate, or null when the denominator cannot support one.
 *
 * The single place a division happens in this file. Both guards matter: zero
 * submitted is undefined, and a sample below the threshold is §8's "misleading
 * 50%".
 */
function rateOf(count: number, submitted: number, enough: boolean): number | null {
  if (submitted === 0 || !enough) return null;

  return count / submitted;
}

/**
 * Turn the three result sets into every figure the page shows.
 *
 * Pure, and takes `now` rather than reading the clock, so a test can pin the
 * volume window. One pass over the rows fills every accumulator — the funnel,
 * the source table and the monthly buckets are all derived from the same
 * iteration, which is what makes them impossible to disagree.
 */
export function summarizeAnalytics(
  rows: readonly AnalyticsRow[],
  reached: ReachedEvidence,
  now: Date,
): Analytics {
  const total = rows.length;

  let submitted = 0;
  let active = 0;
  let responses = 0;
  let interviews = 0;
  let offers = 0;
  let rejections = 0;

  const statusCounts = new Map<ApplicationStatusValue, number>();
  const monthCounts = new Map<string, { submitted: number; replied: number }>();
  const bucketCounts = RESPONSE_TIME_BUCKETS.map(() => 0);
  const responseDays: number[] = [];

  type SourceAccumulator = {
    submitted: number;
    responses: number;
    interviews: number;
    offers: number;
  };
  const sourceCounts = new Map<ApplicationSourceValue | null, SourceAccumulator>();

  for (const row of rows) {
    const status = row.status as ApplicationStatusValue;

    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    if (!INACTIVE_STATUSES.includes(status)) active += 1;

    // Everything below is a rate input, and §3 measures every rate against
    // submitted applications. A saved role you never sent is volume, not
    // performance, so it leaves the loop here.
    if (!row.appliedAt) continue;

    submitted += 1;

    const replied = row.firstResponseAt !== null;
    const reachedInterview = INTERVIEW_OR_LATER.includes(status) || reached.interviewed.has(row.id);
    const reachedOffer = OFFER_OR_LATER.includes(status) || reached.offered.has(row.id);

    if (replied) responses += 1;
    if (reachedInterview) interviews += 1;
    if (reachedOffer) offers += 1;
    if (status === "REJECTED") rejections += 1;

    const key = monthKey(row.appliedAt);
    const month = monthCounts.get(key) ?? { submitted: 0, replied: 0 };
    month.submitted += 1;
    if (replied) month.replied += 1;
    monthCounts.set(key, month);

    const source = (row.source as ApplicationSourceValue | null) ?? null;
    const bySource = sourceCounts.get(source) ?? {
      submitted: 0,
      responses: 0,
      interviews: 0,
      offers: 0,
    };
    bySource.submitted += 1;
    if (replied) bySource.responses += 1;
    if (reachedInterview) bySource.interviews += 1;
    if (reachedOffer) bySource.offers += 1;
    sourceCounts.set(source, bySource);

    if (row.firstResponseAt) {
      /*
       * Clamped at zero defensively. `mutations/events.ts` already clamps a
       * manual `EMAIL_RECEIVED` at `appliedAt`, so a negative gap should not
       * exist — but an average is the one statistic a single bad row can move a
       * long way, and a mean of "-4 days to reply" would be read as a bug in
       * the page rather than in the data.
       */
      const days = Math.max(
        0,
        (row.firstResponseAt.getTime() - row.appliedAt.getTime()) / MS_PER_DAY,
      );
      responseDays.push(days);

      // The last bucket's bound is Infinity, so this always matches — the
      // fallback is for `tsconfig`'s `noUncheckedIndexedAccess`, not for a
      // reachable state.
      const found = RESPONSE_TIME_BUCKETS.findIndex((candidate) => days <= candidate.max);
      const bucket = found === -1 ? RESPONSE_TIME_BUCKETS.length - 1 : found;
      bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    }
  }

  const enoughForRates = submitted >= MIN_SUBMITTED_FOR_RATES;

  const response: RateMetric = {
    count: responses,
    rate: rateOf(responses, submitted, enoughForRates),
  };
  const interview: RateMetric = {
    count: interviews,
    rate: rateOf(interviews, submitted, enoughForRates),
  };
  const offer: RateMetric = { count: offers, rate: rateOf(offers, submitted, enoughForRates) };
  const rejection: RateMetric = {
    count: rejections,
    rate: rateOf(rejections, submitted, enoughForRates),
  };

  return {
    minSubmittedForRates: MIN_SUBMITTED_FOR_RATES,
    minSubmittedPerSource: MIN_SUBMITTED_PER_SOURCE,

    total,
    submitted,
    active,
    enoughForRates,

    response,
    interview,
    offer,
    rejection,

    ...summarizeResponseTimes(responseDays),
    responseTimes: RESPONSE_TIME_BUCKETS.map((bucket, index) => ({
      label: bucket.label,
      count: bucketCounts[index] ?? 0,
    })),

    funnel: buildFunnel({ submitted, responses, interviews, offers }),
    statusMix: buildStatusMix(statusCounts, total),
    volume: buildVolume(monthCounts, now),
    ...buildSources(sourceCounts),
  };
}

/**
 * Mean and median together, because they answer different questions and the
 * gap between them is the interesting part: one company sitting on an
 * application for four months drags a mean of six days to twenty, and the
 * median is what a user should actually expect next time.
 *
 * Days are kept fractional here and rounded for display. Rounding each gap
 * before averaging would bias a set of same-day replies to zero.
 */
function summarizeResponseTimes(days: readonly number[]): {
  avgResponseDays: number | null;
  medianResponseDays: number | null;
  responseTimeSample: number;
} {
  if (days.length === 0) {
    return { avgResponseDays: null, medianResponseDays: null, responseTimeSample: 0 };
  }

  const sorted = [...days].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // `?? 0` throughout for `noUncheckedIndexedAccess`; the early return above
  // guarantees the array is non-empty, so no index here can actually miss.
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? upper;

  return {
    avgResponseDays: days.reduce((sum, value) => sum + value, 0) / days.length,
    medianResponseDays: sorted.length % 2 === 1 ? upper : (lower + upper) / 2,
    responseTimeSample: days.length,
  };
}

/**
 * The four conversion stages.
 *
 * **Every stage is a share of submitted, not of the stage above it.** §3
 * defines all four rates against the one denominator, and a stage-to-stage
 * funnel would need a second set of divisions that §1 explicitly warns about.
 *
 * It also avoids a lie. The stages do not strictly nest: an `Interview` row can
 * be added to an application still sitting at APPLIED, which counts it as
 * interviewed while `firstResponseAt` is still null, so "interviewed" can
 * legitimately exceed "heard back". A funnel drawn stage-on-stage would have to
 * clamp that away and show a number the data does not contain. Shares of one
 * denominator stay true whatever shape the data has.
 */
function buildFunnel(counts: {
  submitted: number;
  responses: number;
  interviews: number;
  offers: number;
}): FunnelStage[] {
  const share = (count: number) => (counts.submitted === 0 ? null : count / counts.submitted);

  return [
    {
      key: "submitted",
      label: "Submitted",
      hint: "Applications you actually sent",
      count: counts.submitted,
      share: counts.submitted === 0 ? null : 1,
    },
    {
      key: "response",
      label: "Heard back",
      hint: "Any reply, positive or not",
      count: counts.responses,
      share: share(counts.responses),
    },
    {
      key: "interview",
      label: "Interviewed",
      hint: "Ever reached an interview",
      count: counts.interviews,
      share: share(counts.interviews),
    },
    {
      key: "offer",
      label: "Offer",
      hint: "Offered or accepted",
      count: counts.offers,
      share: share(counts.offers),
    },
  ];
}

/**
 * Current pipeline by status, in `APPLICATION_STATUSES` order so the bars read
 * as a journey rather than a ranking, and with the empty statuses dropped.
 *
 * The order is imported rather than restated — the Kanban columns, the status
 * filter and this chart must never disagree about what comes after what.
 */
function buildStatusMix(
  counts: ReadonlyMap<ApplicationStatusValue, number>,
  total: number,
): StatusSlice[] {
  return APPLICATION_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => {
    const count = counts.get(status) ?? 0;

    return { status, count, share: total === 0 ? 0 : count / total };
  });
}

/**
 * The monthly series, as a dense run of months with the gaps filled in.
 *
 * Filling matters: a user who sent nothing in February must see an empty
 * February, not two bars labelled January and March sitting next to each other,
 * which reads as continuous effort.
 *
 * The window starts at the earliest month with data and is trimmed to the most
 * recent `VOLUME_MONTHS`, rather than always showing a fixed year. A new user's
 * first chart would otherwise be eleven blank columns and one bar — a
 * presentation of how little they have done, which is not what the page is for.
 *
 * **Months are UTC, matching how the dates are stored.** `appliedAt` for a
 * date-only field is written at midnight UTC (see `utils/date-only`), so
 * bucketing in the user's zone would move an application applied on the 1st in
 * Asia/Kolkata into the previous month.
 */
function buildVolume(
  counts: ReadonlyMap<string, { submitted: number; replied: number }>,
  now: Date,
): VolumeMonth[] {
  if (counts.size === 0) return [];

  // Lexicographic sort is chronological for `YYYY-MM` with a padded month,
  // which is why `monthKey` pads it.
  const earliest = [...counts.keys()].sort()[0];
  if (!earliest) return [];

  const [earliestYear = 0, earliestMonth = 1] = earliest.split("-").map(Number);

  // The window always runs to the current month, so "nothing sent this month"
  // is visible rather than implied by the chart simply stopping.
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;

  const firstIndex = earliestYear * 12 + (earliestMonth - 1);
  const lastIndex = Math.max(firstIndex, endYear * 12 + (endMonth - 1));
  const startIndex = Math.max(firstIndex, lastIndex - (VOLUME_MONTHS - 1));

  const months: VolumeMonth[] = [];
  const spansYears = Math.floor(startIndex / 12) !== Math.floor(lastIndex / 12);

  for (let index = startIndex; index <= lastIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = index % 12;
    const at = new Date(Date.UTC(year, month, 1));
    const key = monthKey(at);
    const bucket = counts.get(key) ?? { submitted: 0, replied: 0 };

    months.push({
      key,
      // The year is appended only on January, where the axis crosses into a new
      // one. Stamping every tick with a year to cover that case costs six
      // characters on all twelve and is the first thing to collide on a phone.
      label:
        spansYears && month === 0
          ? `${MONTH_SHORT.format(at)} ${String(year).slice(-2)}`
          : MONTH_SHORT.format(at),
      fullLabel: MONTH_LONG.format(at),
      submitted: bucket.submitted,
      replied: bucket.replied,
      silent: bucket.submitted - bucket.replied,
    });
  }

  return months;
}

type SourceAccumulators = ReadonlyMap<
  ApplicationSourceValue | null,
  { submitted: number; responses: number; interviews: number; offers: number }
>;

/**
 * The per-source table and the one-line comparison above it.
 *
 * Ordered by volume, not by rate. Sorting the table by the measure the insight
 * line already names would make the two say the same thing twice, and a channel
 * dropping down the table because one application was rejected is movement
 * without meaning. "Not recorded" is pinned last wherever it appears — it is an
 * absence, not a channel.
 */
function buildSources(counts: SourceAccumulators): {
  sources: SourceStats[];
  sourceInsight: SourceInsight | null;
} {
  const sources: SourceStats[] = [...counts.entries()]
    .map(([source, stats]) => {
      const enough = stats.submitted >= MIN_SUBMITTED_PER_SOURCE;

      return {
        source,
        ...stats,
        responseRate: rateOf(stats.responses, stats.submitted, enough),
        interviewRate: rateOf(stats.interviews, stats.submitted, enough),
        offerRate: rateOf(stats.offers, stats.submitted, enough),
      };
    })
    .sort((a, b) => {
      if (a.source === null) return 1;
      if (b.source === null) return -1;
      if (b.submitted !== a.submitted) return b.submitted - a.submitted;

      // A stable tiebreak, so two channels on equal volume do not swap places
      // between page loads.
      return APPLICATION_SOURCES.indexOf(a.source) - APPLICATION_SOURCES.indexOf(b.source);
    });

  return { sources, sourceInsight: buildSourceInsight(sources) };
}

/**
 * Best versus worst channel by interview rate — §1's headline claim.
 *
 * Interview rate rather than response rate, because a reply is cheap: an
 * automated rejection is a response, and a channel that reliably replies "no"
 * is not a channel worth more of the user's time. Reaching an interview is the
 * outcome the comparison should drive behaviour towards.
 *
 * Both channels must clear `MIN_SUBMITTED_PER_SOURCE`, and the winner must
 * actually be ahead — with every channel converting identically there is no
 * sentence to write, and inventing one from noise is how a user is talked out
 * of a method that was working.
 */
function buildSourceInsight(sources: readonly SourceStats[]): SourceInsight | null {
  const comparable = sources.filter(
    (entry): entry is SourceStats & { interviewRate: number } =>
      entry.source !== null && entry.interviewRate !== null,
  );

  if (comparable.length < 2) return null;

  const ranked = [...comparable].sort((a, b) => b.interviewRate - a.interviewRate);
  const best = ranked[0];
  const worst = ranked.at(-1);

  // Unreachable — the length check above guarantees both — but `at` and index
  // access are both optional under `noUncheckedIndexedAccess`.
  if (!best || !worst) return null;
  if (best.interviewRate <= worst.interviewRate) return null;

  return {
    best: best.source,
    bestRate: best.interviewRate,
    bestSubmitted: best.submitted,
    worst: worst.source,
    worstRate: worst.interviewRate,
    worstSubmitted: worst.submitted,
    // Null rather than Infinity when the weaker channel has never converted.
    // "LinkedIn converts ∞× worse" is not a sentence, and the component says
    // "no interviews yet" instead.
    multiple: worst.interviewRate === 0 ? null : best.interviewRate / worst.interviewRate,
  };
}

/**
 * The analytics page's one read.
 *
 * Three queries rather than one join, because the two evidence sets are
 * existence tests over different tables and a join would multiply the
 * application rows by their interviews before anything could be counted.
 *
 * `Promise.all`, not `$transaction`, for the Neon cold-start reason documented
 * in `db.ts` — the two-second transaction acquisition budget is shorter than a
 * suspended database takes to wake, which turns a slow first visit into an
 * error page. Nothing here needs a consistent snapshot: the evidence sets only
 * ever *add* an application id, so a row landing between the reads can at worst
 * credit an interview whose application arrives on the next refresh.
 *
 * Every query is scoped by `userId` in the WHERE clause, per §4.
 */
export async function getAnalytics(userId: string, now: Date = new Date()): Promise<Analytics> {
  const [rows, interviewRows, eventRows] = await Promise.all([
    prisma.application.findMany({ where: { userId }, select: analyticsSelect }),

    // Scheduling a round is proof the application reached interview, and unlike
    // the status it survives the rejection that follows.
    prisma.interview.findMany({ where: { userId }, select: { applicationId: true } }),

    /*
     * The manual arm of "ever reached", and the reason §3's
     * `[userId, type, occurredAt]` index exists. `STATUS_CHANGE` is deliberately
     * not read: its target status lives only in a display string. See
     * `ReachedEvidence`.
     */
    prisma.applicationEvent.findMany({
      where: { userId, type: { in: [EventType.INTERVIEW, EventType.OFFER] } },
      select: { applicationId: true, type: true },
    }),
  ]);

  const interviewed = new Set(interviewRows.map((row) => row.applicationId));
  const offered = new Set<string>();

  for (const event of eventRows) {
    if (event.type === EventType.INTERVIEW) interviewed.add(event.applicationId);
    else offered.add(event.applicationId);
  }

  return summarizeAnalytics(rows, { interviewed, offered }, now);
}
