import { describe, expect, it } from "vitest";

import { DEGREES } from "@/lib/constants/degrees";
import { FIELDS_OF_STUDY } from "@/lib/constants/fields-of-study";
import { UNIVERSITIES } from "@/lib/constants/universities";

/**
 * These lists are hand-maintained data, so the tests here are about the kinds of
 * mistake hand-maintained data attracts: a duplicate after a copy-paste, a
 * stray space, an entry so long it cannot be saved.
 *
 * The length ceilings mirror `validations/profile`. A suggestion the server
 * would then reject is the worst possible kind of bug in a signup form — the
 * user picks from a list we gave them and gets told it is invalid.
 */
const LISTS = [
  { name: "universities", values: UNIVERSITIES, maxLength: 150 },
  { name: "degrees", values: DEGREES as readonly string[], maxLength: 150 },
  { name: "fields of study", values: FIELDS_OF_STUDY, maxLength: 120 },
] as const;

describe.each(LISTS)("$name", ({ values, maxLength }) => {
  it("has no duplicates", () => {
    const seen = new Map<string, number>();

    for (const value of values) {
      const key = value.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const repeated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);

    expect(repeated).toEqual([]);
  });

  it("is free of blank and untrimmed entries", () => {
    expect(values.filter((value) => value !== value.trim() || value === "")).toEqual([]);
  });

  it("stays within the length the server accepts", () => {
    expect(values.filter((value) => value.length > maxLength)).toEqual([]);
  });
});

describe("list sizes", () => {
  // Loose bounds on purpose: these assert "somebody did not delete half the
  // file", not an exact count, since entries get added over time.
  it("covers enough institutions to be useful", () => {
    expect(UNIVERSITIES.length).toBeGreaterThan(350);
  });

  it("covers the common degrees", () => {
    expect(DEGREES.length).toBeGreaterThan(60);
  });

  it("covers the common fields of study", () => {
    expect(FIELDS_OF_STUDY.length).toBeGreaterThan(90);
  });
});

describe("ordering", () => {
  // Universities and fields of study are what an undecided user scrolls, so
  // they are alphabetical. Degrees are deliberately not: they are ordered by
  // level, bachelor's first, because that is who signs up.
  it.each([
    { name: "universities", values: UNIVERSITIES },
    { name: "fields of study", values: FIELDS_OF_STUDY },
  ])("sorts $name alphabetically", ({ values }) => {
    const sorted = [...values].sort((left, right) => left.localeCompare(right, "en"));

    expect(values).toEqual(sorted);
  });

  it("starts the degree list with an undergraduate degree", () => {
    expect(DEGREES[0]).toBe("B.Tech");
  });
});
