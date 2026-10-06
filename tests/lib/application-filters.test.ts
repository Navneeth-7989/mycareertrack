import { describe, expect, it } from "vitest";

import { parseSearchParams } from "@/lib/api/responses";
import {
  APPLICATION_SORTS,
  APPLICATION_SORT_LABELS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_APPLICATION_FILTERS,
  MAX_PAGE_SIZE,
  activeFilterCount,
  applicationFiltersSchema,
  applicationFiltersToQuery,
  hasActiveFilters,
} from "@/lib/validations/application-filters";

/**
 * The contract this file defends is that the schema is **total**. These
 * parameters arrive from bookmarks, hand-edited URLs and stale history entries,
 * and a 400 over one of them replaces a page of applications with an error
 * screen. Every "garbage in" case below must produce a usable view.
 */

/**
 * Parses the way the API does: a query string through `parseSearchParams`.
 *
 * Must be handed a *query string*, never the schema's own output. The fields
 * are string-in, rich-out — `appliedFrom` arrives as "2026-01-05" and leaves as
 * a `Date` — so re-parsing a parsed result silently drops the date bounds,
 * which is how the first version of this helper made a date assertion pass
 * while testing nothing.
 */
function fromQuery(queryString: string) {
  return parseSearchParams(new URLSearchParams(queryString), applicationFiltersSchema);
}

/**
 * Parses the way the *page* does: straight from Next's `searchParams` record,
 * where a repeated key is already an array.
 */
function fromRecord(record: Record<string, string | string[] | undefined>) {
  return applicationFiltersSchema.parse(record);
}

describe("defaults", () => {
  it("parses an empty query into an unfiltered first page", () => {
    expect(fromQuery("")).toEqual({
      q: "",
      status: [],
      workMode: [],
      employmentType: [],
      priority: [],
      source: [],
      company: [],
      location: [],
      appliedFrom: null,
      appliedTo: null,
      sort: DEFAULT_SORT,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("exports the same thing as EMPTY_APPLICATION_FILTERS", () => {
    expect(fromQuery("")).toEqual(EMPTY_APPLICATION_FILTERS);
  });

  it("labels every sort it offers", () => {
    const missing = APPLICATION_SORTS.filter((sort) => !APPLICATION_SORT_LABELS[sort]);

    expect(missing).toEqual([]);
  });
});

describe("it never throws", () => {
  const hostile = [
    "status=GHOSTED",
    "status=",
    "sort=by-vibes",
    "page=0",
    "page=-5",
    "page=abc",
    "page=1e9",
    "page=1.5",
    "pageSize=0",
    "pageSize=100000",
    "pageSize=NaN",
    "appliedFrom=yesterday",
    "appliedFrom=2026-02-31",
    "appliedTo=",
    "workMode=UNDERWATER&priority=URGENT&source=TELEPATHY",
    "q=" + "x".repeat(500),
    "company=" + "a".repeat(200),
    `status=${Array.from({ length: 200 }, () => "status=SAVED").join("&")}`,
    "unknownParam=whatever",
  ];

  it.each(hostile)("survives ?%s", (queryString) => {
    expect(() => fromQuery(queryString)).not.toThrow();
  });

  it("drops an unknown enum value instead of rejecting the request", () => {
    // Reachable for real: a bookmark from before a status was renamed.
    const filters = fromQuery("status=GHOSTED&status=INTERVIEW");

    expect(filters.status).toEqual(["INTERVIEW"]);
  });

  it("falls back to the default sort for an unknown one", () => {
    expect(fromQuery("sort=by-vibes").sort).toBe(DEFAULT_SORT);
  });

  it("treats a malformed date as no bound at all", () => {
    expect(fromQuery("appliedFrom=yesterday").appliedFrom).toBeNull();
    expect(fromQuery("appliedFrom=2026-02-31").appliedFrom).toBeNull();
  });
});

describe("repeatable filters", () => {
  it("collects a repeated key", () => {
    expect(fromQuery("status=SAVED&status=OFFER").status).toEqual(["SAVED", "OFFER"]);
  });

  it("accepts a single occurrence as a list of one", () => {
    expect(fromQuery("status=SAVED").status).toEqual(["SAVED"]);
  });

  it("is order-independent", () => {
    // Two users with the same filters must produce byte-identical queries, or
    // the `IN` clause differs for no reason. Canonical order is the enum's.
    expect(fromQuery("status=OFFER&status=SAVED").status).toEqual(
      fromQuery("status=SAVED&status=OFFER").status,
    );
    expect(fromQuery("status=OFFER&status=SAVED").status).toEqual(["SAVED", "OFFER"]);
  });

  it("de-duplicates", () => {
    expect(fromQuery("status=SAVED&status=SAVED&status=SAVED").status).toEqual(["SAVED"]);
    expect(fromQuery("location=Pune&location=Pune").location).toEqual(["Pune"]);
  });

  it("caps how many values one filter may carry", () => {
    // Bounds the IN clause a crafted URL can build.
    const many = Array.from({ length: 500 }, (_, index) => `company=c${index}`).join("&");

    expect(fromQuery(many).company).toHaveLength(50);
  });
});

describe("paging", () => {
  it("clamps a page below one", () => {
    expect(fromQuery("page=0").page).toBe(1);
    expect(fromQuery("page=-5").page).toBe(1);
  });

  it("keeps a page past the end rather than silently redirecting", () => {
    // §8: an empty list with correct meta and a way back, not a redirect to a
    // page the user did not ask for.
    expect(fromQuery("page=500").page).toBe(500);
  });

  it("caps the page so OFFSET cannot be absurd", () => {
    expect(fromQuery("page=99999999").page).toBe(10_000);
  });

  it("caps page size at the documented maximum", () => {
    expect(fromQuery(`pageSize=${MAX_PAGE_SIZE + 1}`).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("clamps an in-range-able number but falls back for a non-number", () => {
    // Two nonsense inputs, two different answers, and the asymmetry is
    // deliberate: a number gets clamped into range, while something that is not
    // a number at all was not understood and gets the default. One rule for
    // "too big or too small", one for "not a number".
    expect(fromQuery("pageSize=0").pageSize).toBe(1);
    expect(fromQuery("pageSize=NaN").pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(fromQuery("pageSize=lots").pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("rejects a fractional page in favour of the default", () => {
    expect(fromQuery("page=1.5").page).toBe(1);
  });
});

describe("activeFilterCount", () => {
  it("is zero for an unfiltered view", () => {
    expect(activeFilterCount(fromQuery(""))).toBe(0);
    expect(hasActiveFilters(fromQuery(""))).toBe(false);
  });

  it("ignores sort and paging, which hide nothing", () => {
    // Otherwise "Clear all (1)" appears on a list that is showing everything.
    expect(activeFilterCount(fromQuery("sort=deadline&page=3&pageSize=50"))).toBe(0);
  });

  it("counts each chosen value, not each filter", () => {
    expect(activeFilterCount(fromQuery("status=SAVED&status=OFFER&priority=HIGH"))).toBe(3);
  });

  it("counts a search and each date bound", () => {
    expect(activeFilterCount(fromQuery("q=google&appliedFrom=2026-01-01"))).toBe(2);
  });
});

describe("applicationFiltersToQuery", () => {
  it("omits everything at its default", () => {
    // `/applications` and `/applications?page=1&sort=newest&q=` are the same
    // view; only one belongs in someone's address bar.
    expect(applicationFiltersToQuery(fromQuery(""))).toBe("");
  });

  it("round-trips a filtered view", () => {
    const original = fromQuery(
      "q=google&status=INTERVIEW&status=OFFER&sort=deadline&priority=HIGH",
    );
    const rebuilt = fromQuery(applicationFiltersToQuery(original));

    expect(rebuilt).toEqual(original);
  });

  it("round-trips the date bounds", () => {
    const original = fromQuery("appliedFrom=2026-01-05&appliedTo=2026-03-14");

    // Asserted before the comparison, because `null?.toISOString()` is
    // undefined on both sides and would make the round-trip check below pass
    // without either date having survived.
    expect(original.appliedFrom?.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(original.appliedTo?.toISOString()).toBe("2026-03-14T00:00:00.000Z");

    const rebuilt = fromQuery(applicationFiltersToQuery(original));

    expect(rebuilt.appliedFrom?.toISOString()).toBe(original.appliedFrom?.toISOString());
    expect(rebuilt.appliedTo?.toISOString()).toBe(original.appliedTo?.toISOString());
  });

  it("carries the filters onto another page", () => {
    const filters = fromQuery("q=google&status=OFFER");
    const page2 = applicationFiltersToQuery(filters, { page: 2 });

    expect(fromQuery(page2)).toEqual({ ...filters, page: 2 });
  });

  it("drops the page parameter when going back to the first page", () => {
    const filters = fromQuery("q=google&page=4");

    expect(applicationFiltersToQuery(filters, { page: 1 })).toBe("q=google");
  });

  it("produces the same string whichever order values were chosen in", () => {
    const one = applicationFiltersToQuery(fromQuery("status=OFFER&status=SAVED"));
    const other = applicationFiltersToQuery(fromQuery("status=SAVED&status=OFFER"));

    expect(one).toBe(other);
  });
});

describe("the page path and the API path agree", () => {
  it("parses a record the same way it parses a query string", () => {
    // The page hands the schema Next's `searchParams` record directly, while
    // the API goes through `parseSearchParams`. If these two disagreed, a
    // shared link would show one thing on the page and another through the API.
    expect(fromRecord({ q: "google", status: "OFFER", page: "2" })).toEqual(
      fromQuery("q=google&status=OFFER&page=2"),
    );
  });

  it("agrees on a repeated key, which the record already holds as an array", () => {
    expect(fromRecord({ status: ["OFFER", "SAVED"] })).toEqual(
      fromQuery("status=OFFER&status=SAVED"),
    );
  });

  it("treats a present-but-empty parameter as absent", () => {
    expect(fromQuery("q=&status=&sort=")).toEqual(EMPTY_APPLICATION_FILTERS);
  });

  it("survives an undefined value in the record", () => {
    // Next's type allows it, so the page can hand one over.
    expect(fromRecord({ q: undefined, status: undefined })).toEqual(EMPTY_APPLICATION_FILTERS);
  });
});
