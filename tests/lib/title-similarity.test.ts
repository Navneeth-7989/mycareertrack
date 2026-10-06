import { describe, expect, it } from "vitest";

import {
  DUPLICATE_TITLE_THRESHOLD,
  isSimilarJobTitle,
  jobTitleSimilarity,
  normalizeJobTitle,
} from "@/lib/utils/title-similarity";

describe("normalizeJobTitle", () => {
  it("reduces a decorated title to its words", () => {
    expect(normalizeJobTitle("Software Engineer (New Grad) - 2026")).toBe(
      "software engineer new grad 2026",
    );
  });

  it("treats a hyphenated level as a separate word", () => {
    expect(normalizeJobTitle("SDE-1")).toBe("sde 1");
  });

  it("keeps non-Latin scripts rather than erasing them", () => {
    expect(normalizeJobTitle("सॉफ्टवेयर इंजीनियर")).toBe("सॉफ्टवेयर इंजीनियर");
  });
});

describe("jobTitleSimilarity", () => {
  it("scores an identical title as 1", () => {
    expect(jobTitleSimilarity("SDE Intern", "sde intern ")).toBe(1);
  });

  it("scores nothing in common as 0", () => {
    expect(jobTitleSimilarity("SDE Intern", "Product Manager")).toBe(0);
  });

  it("scores a blank title as 0 rather than dividing by zero", () => {
    expect(jobTitleSimilarity("", "SDE Intern")).toBe(0);
    expect(jobTitleSimilarity("---", "SDE Intern")).toBe(0);
  });

  it("is symmetric", () => {
    const left = jobTitleSimilarity("Software Engineer", "Senior Software Engineer");
    const right = jobTitleSimilarity("Senior Software Engineer", "Software Engineer");

    expect(left).toBe(right);
  });

  it("finds short titles comparable at all", () => {
    // The padding in `trigrams` is what makes this work: a bare 3-character
    // string yields no trigrams under a sliding window, so "SDE" against "SDE"
    // would score 0 without it.
    expect(jobTitleSimilarity("SDE", "SDE")).toBe(1);
    expect(jobTitleSimilarity("SDE", "SDE 2")).toBeGreaterThan(0);
  });
});

/**
 * The threshold is the whole design of this feature, so it is pinned against
 * real title pairs rather than asserted in the abstract. These are measured
 * values: the should-warn set runs 0.70–1.00 and the should-not-warn set
 * 0.00–0.50, which is the gap 0.6 sits in.
 *
 * A failure here means a tuning change moved the boundary across a pair that
 * matters — which is exactly when someone should have to look at this list.
 */
describe("the duplicate threshold", () => {
  const SAME_ROLE: Array<[string, string]> = [
    ["SDE Intern", "SDE Intern"],
    ["Software Engineer (New Grad) - 2026", "software engineer new grad 2026"],
    ["Software Engineer", "Software Engineer II"],
    ["Software Engineer", "Senior Software Engineer"],
    ["Data Analyst Intern", "Data Analyst Internship"],
    ["SDE-1", "SDE 1"],
    ["Product Manager", "Product Manager - Growth"],
    ["Full Stack Developer", "Fullstack Developer"],
    ["SDE Intern", "SDE Intern 2"],
  ];

  const DIFFERENT_ROLE: Array<[string, string]> = [
    ["Frontend Engineer", "Backend Engineer"],
    ["SDE Intern", "Product Manager"],
    ["Data Analyst", "Data Scientist"],
    ["Software Engineer", "Hardware Engineer"],
    ["Marketing Intern", "Finance Intern"],
    ["Analyst", "Senior Analyst"],
  ];

  it.each(SAME_ROLE)("warns on %s ~ %s", (left, right) => {
    expect(isSimilarJobTitle(left, right)).toBe(true);
  });

  it.each(DIFFERENT_ROLE)("stays quiet on %s ~ %s", (left, right) => {
    // These still produce an info-level advisory from the same company — they
    // just don't claim the user applied to this role twice.
    expect(isSimilarJobTitle(left, right)).toBe(false);
  });

  it("leaves daylight between the two sets", () => {
    const warned = Math.min(...SAME_ROLE.map(([a, b]) => jobTitleSimilarity(a, b)));
    const quiet = Math.max(...DIFFERENT_ROLE.map(([a, b]) => jobTitleSimilarity(a, b)));

    // The threshold must sit strictly inside the gap, not on either edge — a
    // boundary that touches a real pair is one rounding change from flipping.
    expect(quiet).toBeLessThan(DUPLICATE_TITLE_THRESHOLD);
    expect(warned).toBeGreaterThan(DUPLICATE_TITLE_THRESHOLD);
  });
});
