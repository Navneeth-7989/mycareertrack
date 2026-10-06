import { describe, expect, it } from "vitest";

import { rankCompanyMatches, type CompanySuggestion } from "@/server/queries/companies";

/**
 * Ranking is the part of autocomplete a user notices immediately when it is
 * wrong — typing "meta" and being offered "Metadata Technologies" first reads
 * as a broken search box. No database is touched: the two Postgres queries hand
 * their rows to this function, and this is where the order is decided.
 */

function company(name: string, overrides: Partial<CompanySuggestion> = {}): CompanySuggestion {
  return {
    id: overrides.id ?? name,
    name,
    nameNormalized: overrides.nameNormalized ?? name.toLowerCase(),
    website: overrides.website ?? null,
    isSeeded: overrides.isSeeded ?? true,
  };
}

function names(matches: CompanySuggestion[]): string[] {
  return matches.map((match) => match.name);
}

describe("rankCompanyMatches", () => {
  it("puts the exact match first, then prefixes, then the rest", () => {
    const ranked = rankCompanyMatches(
      [company("Metadata Technologies"), company("Cometa"), company("Meta")],
      "meta",
      10,
    );

    expect(names(ranked)).toEqual(["Meta", "Metadata Technologies", "Cometa"]);
  });

  it("ranks a match at a word boundary above one buried mid-word", () => {
    const ranked = rankCompanyMatches(
      [company("Reconsultancy"), company("Tata Consultancy Services")],
      "consultancy",
      10,
    );

    expect(names(ranked)).toEqual(["Tata Consultancy Services", "Reconsultancy"]);
  });

  it("prefers the shorter name within a tier", () => {
    const ranked = rankCompanyMatches(
      [company("Infosys BPM"), company("Infosys"), company("Infosys Finacle")],
      "infos",
      10,
    );

    expect(names(ranked)).toEqual(["Infosys", "Infosys BPM", "Infosys Finacle"]);
  });

  it("collapses a user's own row into the seeded one with the same match key", () => {
    // Reachable in real data: a user adds "Google" before that company is
    // seeded, and ends up owning a row the shared pool also has. Offering the
    // same company twice makes the list look broken, and the resolver would
    // pick the seeded row regardless.
    const ranked = rankCompanyMatches(
      [
        company("google", { id: "own", isSeeded: false, nameNormalized: "google" }),
        company("Google", { id: "seeded", isSeeded: true, nameNormalized: "google" }),
      ],
      "goog",
      10,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.id).toBe("seeded");
  });

  it("keeps the user's own row when nothing seeded matches", () => {
    const ranked = rankCompanyMatches(
      [company("Hasty Robotics", { id: "own", isSeeded: false })],
      "hasty",
      10,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.id).toBe("own");
  });

  it("de-duplicates the overlap between the prefix and substring queries", () => {
    // Both queries return the same row for a leading match, so the pool handed
    // to this function legitimately contains duplicates by id.
    const wipro = company("Wipro");

    expect(rankCompanyMatches([wipro, wipro], "wip", 10)).toHaveLength(1);
  });

  it("applies the cap after ranking, not before", () => {
    const ranked = rankCompanyMatches(
      [company("Appletree"), company("Applebee"), company("Apple")],
      "apple",
      2,
    );

    expect(names(ranked)).toEqual(["Apple", "Applebee"]);
  });

  it("returns nothing for nothing", () => {
    expect(rankCompanyMatches([], "anything", 10)).toEqual([]);
  });
});
