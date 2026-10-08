import { describe, expect, it } from "vitest";

import {
  MIN_SUBMITTED_FOR_RATES,
  MIN_SUBMITTED_PER_SOURCE,
  VOLUME_MONTHS,
  summarizeAnalytics,
  type AnalyticsRow,
  type ReachedEvidence,
} from "@/server/queries/analytics";

/**
 * §7's done-when for this block: *"analytics match hand-counted figures on
 * seeded data"*. Every expectation below is hand-counted from the fixture
 * written beside it, which is why the fixtures are small enough to count.
 *
 * No database is touched. `getAnalytics` does three reads and hands the rows to
 * `summarizeAnalytics`, which is pure and takes `now` as an argument — the
 * split exists so the arithmetic that §1 calls the product's trust problem can
 * be checked without seeding anything.
 */

const NOW = new Date(Date.UTC(2026, 5, 15)); // 15 June 2026

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

let counter = 0;

/**
 * Spread rather than `??` for the defaults: half these fields are nullable, and
 * `overrides.appliedAt ?? default` would quietly ignore an explicit `null` —
 * which is exactly what `savedRow` passes.
 */
function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  counter += 1;

  return {
    id: `app-${counter}`,
    status: "APPLIED",
    source: null,
    appliedAt: utc(2026, 6, 1),
    firstResponseAt: null,
    ...overrides,
  };
}

/** A saved role — no `appliedAt`, so it is volume and nothing else. */
function savedRow(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return row({ ...overrides, status: "SAVED", appliedAt: null, firstResponseAt: null });
}

const NO_EVIDENCE: ReachedEvidence = { interviewed: new Set(), offered: new Set() };

function evidence(interviewed: string[] = [], offered: string[] = []): ReachedEvidence {
  return { interviewed: new Set(interviewed), offered: new Set(offered) };
}

/** Enough submitted rows to lift the sample gate, with no responses on any. */
function filler(count: number): AnalyticsRow[] {
  return Array.from({ length: count }, () => row());
}

describe("summarizeAnalytics — empty and near-empty", () => {
  it("reports nothing rather than zero rates on an empty account", () => {
    const result = summarizeAnalytics([], NO_EVIDENCE, NOW);

    expect(result.total).toBe(0);
    expect(result.submitted).toBe(0);
    expect(result.active).toBe(0);
    expect(result.enoughForRates).toBe(false);

    // Null, not 0 — "0% of nothing replied" is a claim the data cannot make.
    expect(result.response.rate).toBeNull();
    expect(result.interview.rate).toBeNull();
    expect(result.offer.rate).toBeNull();
    expect(result.rejection.rate).toBeNull();
    expect(result.avgResponseDays).toBeNull();
    expect(result.medianResponseDays).toBeNull();

    expect(result.funnel.every((stage) => stage.share === null)).toBe(true);
    expect(result.volume).toEqual([]);
    expect(result.statusMix).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.sourceInsight).toBeNull();
  });

  it("withholds every rate one application below the sample threshold", () => {
    const rows = filler(MIN_SUBMITTED_FOR_RATES - 1);
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.submitted).toBe(MIN_SUBMITTED_FOR_RATES - 1);
    expect(result.enoughForRates).toBe(false);
    expect(result.response.rate).toBeNull();

    // The count is still real. §8 hides the misleading division, not the facts.
    expect(result.response.count).toBe(0);
  });

  it("releases the rates exactly at the threshold", () => {
    const rows = filler(MIN_SUBMITTED_FOR_RATES);
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.enoughForRates).toBe(true);
    expect(result.response.rate).toBe(0);
  });
});

describe("summarizeAnalytics — the §3 metric set", () => {
  /*
   * Ten rows, hand-counted:
   *
   *   s1  SAVED       no appliedAt                   → volume only
   *   s2  SAVED       no appliedAt                   → volume only
   *   a1  APPLIED     no reply
   *   a2  APPLIED     no reply
   *   a3  SCREENING   replied
   *   a4  ASSESSMENT  replied
   *   a5  INTERVIEW   replied                        → interviewed
   *   a6  OFFER       replied                        → interviewed, offered
   *   a7  REJECTED    replied, interview evidence    → interviewed
   *   a8  WITHDRAWN   no reply
   *
   * total 10 · submitted 8 · active 8 (only a7 and a8 are terminal)
   * responses 5 · interviewed 3 · offered 1 · rejected 1
   */
  const rows: AnalyticsRow[] = [
    savedRow({ id: "s1" }),
    savedRow({ id: "s2" }),
    row({ id: "a1", status: "APPLIED" }),
    row({ id: "a2", status: "APPLIED" }),
    row({ id: "a3", status: "SCREENING", firstResponseAt: utc(2026, 6, 3) }),
    row({ id: "a4", status: "ASSESSMENT", firstResponseAt: utc(2026, 6, 5) }),
    row({ id: "a5", status: "INTERVIEW", firstResponseAt: utc(2026, 6, 8) }),
    row({ id: "a6", status: "OFFER", firstResponseAt: utc(2026, 6, 11) }),
    row({ id: "a7", status: "REJECTED", firstResponseAt: utc(2026, 6, 2) }),
    row({ id: "a8", status: "WITHDRAWN" }),
  ];

  // `a7` was rejected after interviewing — the case §3 singles out: *"a rejected
  // candidate who interviewed still counts toward interview rate."*
  const result = summarizeAnalytics(rows, evidence(["a7"]), NOW);

  it("counts volume including saved and withdrawn", () => {
    expect(result.total).toBe(10);
  });

  it("uses appliedAt for the denominator, so saved roles cannot drag a rate down", () => {
    expect(result.submitted).toBe(8);
  });

  it("treats rejected, withdrawn and accepted as inactive", () => {
    // SAVED ×2, APPLIED ×2, SCREENING, ASSESSMENT, INTERVIEW, OFFER = 8 active.
    // REJECTED and WITHDRAWN are the two that are not.
    expect(result.active).toBe(8);
  });

  it("counts a response as any reply, positive or negative", () => {
    // a3, a4, a5, a6, a7 — the rejection included.
    expect(result.response.count).toBe(5);
    expect(result.response.rate).toBeCloseTo(5 / 8);
  });

  it("counts 'ever reached interview' from history, not current status", () => {
    // a5 (INTERVIEW), a6 (OFFER, which is past it), a7 (REJECTED with evidence).
    expect(result.interview.count).toBe(3);
    expect(result.interview.rate).toBeCloseTo(3 / 8);
  });

  it("counts an offer from OFFER or ACCEPTED", () => {
    expect(result.offer.count).toBe(1);
    expect(result.offer.rate).toBeCloseTo(1 / 8);
  });

  it("measures the rejection rate against submitted, not total", () => {
    expect(result.rejection.count).toBe(1);
    expect(result.rejection.rate).toBeCloseTo(1 / 8);
  });

  it("builds the funnel from one denominator rather than stage on stage", () => {
    const byKey = new Map(result.funnel.map((stage) => [stage.key, stage]));

    expect(byKey.get("submitted")?.share).toBe(1);
    expect(byKey.get("response")?.share).toBeCloseTo(5 / 8);
    expect(byKey.get("interview")?.share).toBeCloseTo(3 / 8);
    expect(byKey.get("offer")?.share).toBeCloseTo(1 / 8);
  });

  it("lists the status mix in pipeline order with the empty statuses dropped", () => {
    expect(result.statusMix.map((slice) => slice.status)).toEqual([
      "SAVED",
      "APPLIED",
      "SCREENING",
      "ASSESSMENT",
      "INTERVIEW",
      "OFFER",
      "REJECTED",
      "WITHDRAWN",
    ]);

    expect(result.statusMix[0]).toMatchObject({ count: 2, share: 0.2 });
  });
});

describe("summarizeAnalytics — 'ever reached' evidence", () => {
  it("accepts an offer event on an application that was later rejected", () => {
    const rows = [row({ id: "x", status: "REJECTED", firstResponseAt: utc(2026, 6, 4) })];
    const result = summarizeAnalytics(rows, evidence([], ["x"]), NOW);

    expect(result.offer.count).toBe(1);
  });

  it("ignores evidence for an application that was never submitted", () => {
    // A saved role with an interview scheduled against it is a data oddity, not
    // a conversion — it leaves the loop before any rate input is touched.
    const rows = [savedRow({ id: "x" })];
    const result = summarizeAnalytics(rows, evidence(["x"], ["x"]), NOW);

    expect(result.interview.count).toBe(0);
    expect(result.offer.count).toBe(0);
  });

  it("does not require the stages to nest", () => {
    /*
     * An interview scheduled on an application still sitting at APPLIED: it is
     * interviewed with `firstResponseAt` still null, so "interviewed" exceeds
     * "heard back". The funnel must report that rather than clamp it — see
     * `buildFunnel`.
     */
    const rows = [row({ id: "x", status: "APPLIED" }), ...filler(MIN_SUBMITTED_FOR_RATES - 1)];
    const result = summarizeAnalytics(rows, evidence(["x"]), NOW);

    expect(result.response.count).toBe(0);
    expect(result.interview.count).toBe(1);
  });
});

describe("summarizeAnalytics — response time", () => {
  it("averages and medians the gap in days, keeping both", () => {
    const rows = [
      // 1 day, 3 days, 30 days — mean 11.33, median 3. The gap between the two
      // is the reason both are reported.
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 2) }),
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 4) }),
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 31) }),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.responseTimeSample).toBe(3);
    expect(result.avgResponseDays).toBeCloseTo(34 / 3);
    expect(result.medianResponseDays).toBe(3);
  });

  it("averages an even sample from the middle pair", () => {
    const rows = [
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 3) }), // 2
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 5) }), // 4
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 9) }), // 8
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 17) }), // 16
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.medianResponseDays).toBe(6);
  });

  it("excludes applications still waiting, rather than counting them as slow", () => {
    const rows = [
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 3) }),
      row({ appliedAt: utc(2026, 1, 1) }),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.responseTimeSample).toBe(1);
    expect(result.avgResponseDays).toBe(2);
  });

  it("clamps a reply dated before the application at zero", () => {
    // Should be unreachable — `mutations/events.ts` clamps at `appliedAt` — but
    // a mean is the one figure a single bad row moves a long way.
    const rows = [row({ appliedAt: utc(2026, 5, 10), firstResponseAt: utc(2026, 5, 1) })];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.avgResponseDays).toBe(0);
    expect(result.responseTimes[0]).toEqual({ label: "Within 2 days", count: 1 });
  });

  it("buckets on inclusive upper bounds", () => {
    const rows = [
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 3) }), // 2 → within 2 days
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 4) }), // 3 → 3–7 days
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 8) }), // 7 → 3–7 days
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 15) }), // 14 → 1–2 weeks
      row({ appliedAt: utc(2026, 5, 1), firstResponseAt: utc(2026, 5, 31) }), // 30 → 2–4 weeks
      row({ appliedAt: utc(2026, 4, 1), firstResponseAt: utc(2026, 5, 31) }), // 60 → over a month
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.responseTimes.map((bucket) => bucket.count)).toEqual([1, 2, 1, 1, 1]);
  });
});

describe("summarizeAnalytics — volume", () => {
  it("fills the months with no applications in them", () => {
    const rows = [
      row({ appliedAt: utc(2026, 3, 4) }),
      row({ appliedAt: utc(2026, 3, 20), firstResponseAt: utc(2026, 4, 2) }),
      row({ appliedAt: utc(2026, 5, 9) }),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    // March through June: April is empty and must still be a column, or two
    // bars side by side would read as continuous effort.
    expect(result.volume.map((month) => month.key)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);

    expect(result.volume[0]).toMatchObject({ submitted: 2, replied: 1, silent: 1 });
    expect(result.volume[1]).toMatchObject({ submitted: 0, replied: 0, silent: 0 });
  });

  it("credits a reply to the month the application was sent", () => {
    // A cohort view: the reply landed in April, the application went out in
    // March, and it counts in March.
    const rows = [row({ appliedAt: utc(2026, 3, 20), firstResponseAt: utc(2026, 4, 2) })];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.volume.find((month) => month.key === "2026-03")?.replied).toBe(1);
    expect(result.volume.find((month) => month.key === "2026-04")?.replied).toBe(0);
  });

  it("always runs to the current month", () => {
    const rows = [row({ appliedAt: utc(2026, 4, 2) })];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.volume.at(-1)?.key).toBe("2026-06");
  });

  it("trims a long history to the most recent window", () => {
    const rows = [row({ appliedAt: utc(2023, 1, 5) }), row({ appliedAt: utc(2026, 6, 1) })];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.volume).toHaveLength(VOLUME_MONTHS);
    expect(result.volume[0]?.key).toBe("2025-07");
    expect(result.volume.at(-1)?.key).toBe("2026-06");
  });

  it("stamps the year on January only, and only when the window crosses one", () => {
    const spanning = summarizeAnalytics([row({ appliedAt: utc(2025, 11, 4) })], NO_EVIDENCE, NOW);

    expect(spanning.volume.find((month) => month.key === "2026-01")?.label).toBe("Jan 26");
    expect(spanning.volume.find((month) => month.key === "2025-11")?.label).toBe("Nov");

    const withinOneYear = summarizeAnalytics(
      [row({ appliedAt: utc(2026, 2, 4) })],
      NO_EVIDENCE,
      NOW,
    );

    expect(withinOneYear.volume.every((month) => !/\d/.test(month.label))).toBe(true);
  });

  it("buckets in UTC, matching how the dates are stored", () => {
    // Midnight UTC on the 1st — a zoned month would push this into February.
    const result = summarizeAnalytics([row({ appliedAt: utc(2026, 3, 1) })], NO_EVIDENCE, NOW);

    expect(result.volume[0]?.key).toBe("2026-03");
    expect(result.volume[0]?.fullLabel).toBe("March 2026");
  });

  it("ignores saved roles entirely", () => {
    const result = summarizeAnalytics([savedRow()], NO_EVIDENCE, NOW);

    expect(result.volume).toEqual([]);
  });
});

describe("summarizeAnalytics — sources", () => {
  it("gates a thin channel's rates while still showing its counts", () => {
    const rows = [
      ...Array.from({ length: MIN_SUBMITTED_PER_SOURCE }, () =>
        row({ source: "REFERRAL", firstResponseAt: utc(2026, 6, 4) }),
      ),
      ...Array.from({ length: MIN_SUBMITTED_PER_SOURCE - 1 }, () => row({ source: "LINKEDIN" })),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    const referral = result.sources.find((entry) => entry.source === "REFERRAL");
    const linkedin = result.sources.find((entry) => entry.source === "LINKEDIN");

    expect(referral?.responseRate).toBe(1);
    expect(linkedin?.responseRate).toBeNull();
    expect(linkedin?.submitted).toBe(MIN_SUBMITTED_PER_SOURCE - 1);
  });

  it("orders by volume and pins 'not recorded' last", () => {
    const rows = [
      row({ source: null }),
      row({ source: null }),
      row({ source: null }),
      row({ source: "LINKEDIN" }),
      row({ source: "LINKEDIN" }),
      row({ source: "REFERRAL" }),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.sources.map((entry) => entry.source)).toEqual(["LINKEDIN", "REFERRAL", null]);
  });

  it("builds §1's comparison from interview rate", () => {
    const rows = [
      // Referral: 4 sent, 2 interviewed → 50%
      row({ id: "r1", source: "REFERRAL" }),
      row({ id: "r2", source: "REFERRAL" }),
      row({ id: "r3", source: "REFERRAL" }),
      row({ id: "r4", source: "REFERRAL" }),
      // LinkedIn: 8 sent, 1 interviewed → 12.5%
      ...Array.from({ length: 8 }, (_, index) => row({ id: `l${index}`, source: "LINKEDIN" })),
    ];
    const result = summarizeAnalytics(rows, evidence(["r1", "r2", "l0"]), NOW);

    expect(result.sourceInsight).toMatchObject({
      best: "REFERRAL",
      worst: "LINKEDIN",
    });
    expect(result.sourceInsight?.bestRate).toBeCloseTo(0.5);
    expect(result.sourceInsight?.worstRate).toBeCloseTo(0.125);
    expect(result.sourceInsight?.multiple).toBeCloseTo(4);
  });

  it("refuses to divide by a channel that has never converted", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, index) => row({ id: `r${index}`, source: "REFERRAL" })),
      ...Array.from({ length: 3 }, () => row({ source: "LINKEDIN" })),
    ];
    const result = summarizeAnalytics(rows, evidence(["r0"]), NOW);

    // "∞× better" is not a sentence; the component says "has not produced one
    // yet" instead.
    expect(result.sourceInsight?.multiple).toBeNull();
    expect(result.sourceInsight?.worstRate).toBe(0);
  });

  it("writes no comparison when every channel converts identically", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ source: "REFERRAL" })),
      ...Array.from({ length: 3 }, () => row({ source: "LINKEDIN" })),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    expect(result.sourceInsight).toBeNull();
  });

  it("writes no comparison from a single comparable channel", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row({ source: "REFERRAL" })),
      row({ source: "LINKEDIN" }),
      row({ source: null }),
      row({ source: null }),
      row({ source: null }),
    ];
    const result = summarizeAnalytics(rows, NO_EVIDENCE, NOW);

    // "Not recorded" is never a side of the comparison even when it clears the
    // threshold — it is an absence, not a channel the user can choose more of.
    expect(result.sourceInsight).toBeNull();
  });
});
