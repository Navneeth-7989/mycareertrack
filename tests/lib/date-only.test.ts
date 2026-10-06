import { describe, expect, it } from "vitest";

import {
  formatDateOnly,
  isDateOnlyString,
  parseDateOnly,
  toDateInputValue,
  todayAsDateOnly,
} from "@/lib/utils/date-only";

/**
 * The convention these tests defend: a deadline is a calendar day, written as
 * midnight UTC and read back in UTC. Breaking either half shows the wrong date
 * to somebody — which is the bug class the whole module exists to prevent.
 */

describe("isDateOnlyString", () => {
  it("accepts the format a date input produces", () => {
    expect(isDateOnlyString("2026-03-14")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of ["", "2026-3-14", "14/03/2026", "2026-03-14T10:00:00Z", "tomorrow"]) {
      expect(isDateOnlyString(value)).toBe(false);
    }
  });

  it("rejects a day that does not exist", () => {
    // The pattern alone would pass this; the parse check is what catches it.
    expect(isDateOnlyString("2026-02-31")).toBe(false);
    expect(isDateOnlyString("2026-13-01")).toBe(false);
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(isDateOnlyString("2024-02-29")).toBe(true);
    expect(isDateOnlyString("2026-02-29")).toBe(false);
  });
});

describe("parseDateOnly", () => {
  it("lands on midnight UTC", () => {
    expect(parseDateOnly("2026-03-14").toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });
});

describe("toDateInputValue", () => {
  it("round-trips a stored value back into the input", () => {
    expect(toDateInputValue(parseDateOnly("2026-03-14"))).toBe("2026-03-14");
  });

  it("reads in UTC, not the machine's zone", () => {
    // 20:00 UTC on the 14th is already the 15th in Asia/Kolkata. Reading this
    // locally would move the deadline a day for every user east of Greenwich.
    expect(toDateInputValue(new Date("2026-03-14T20:00:00.000Z"))).toBe("2026-03-14");
  });

  it("gives an empty string for nothing, so an input stays controlled", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue(new Date("nope"))).toBe("");
  });
});

describe("formatDateOnly", () => {
  it("spells the month so 03/04 is never ambiguous", () => {
    expect(formatDateOnly(parseDateOnly("2026-03-14"))).toBe("14 Mar 2026");
  });

  it("formats in UTC, matching how the value was written", () => {
    expect(formatDateOnly(new Date("2026-03-14T20:00:00.000Z"))).toBe("14 Mar 2026");
  });

  it("renders nothing for nothing", () => {
    expect(formatDateOnly(null)).toBe("");
  });
});

describe("todayAsDateOnly", () => {
  it("uses the viewer's own calendar", () => {
    // The one place local time is right: "is this overdue" is a question about
    // the user's today.
    const noon = new Date(2026, 2, 14, 12, 0, 0);

    expect(todayAsDateOnly(noon)).toBe("2026-03-14");
  });

  it("pads single-digit months and days", () => {
    expect(todayAsDateOnly(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("compares as a string in the same order as in time", () => {
    const earlier = todayAsDateOnly(new Date(2026, 0, 5, 12));
    const later = todayAsDateOnly(new Date(2026, 10, 5, 12));

    expect(earlier < later).toBe(true);
  });
});
