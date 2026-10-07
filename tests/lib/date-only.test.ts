import { describe, expect, it } from "vitest";

import {
  daysSinceDateOnly,
  formatDateOnly,
  isDateOnlyString,
  parseDateOnly,
  relativeDayLabel,
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

describe("daysSinceDateOnly", () => {
  // "Now" is fixed so these never depend on the day the suite runs.
  const now = new Date(2026, 9, 7, 12, 0, 0);

  it("counts whole days from a stored value to today", () => {
    expect(daysSinceDateOnly(parseDateOnly("2026-10-07"), now)).toBe(0);
    expect(daysSinceDateOnly(parseDateOnly("2026-10-06"), now)).toBe(1);
    expect(daysSinceDateOnly(parseDateOnly("2026-09-07"), now)).toBe(30);
  });

  it("goes negative for a date in the future", () => {
    expect(daysSinceDateOnly(parseDateOnly("2026-10-10"), now)).toBe(-3);
  });

  it("ignores the clock time on the stored instant", () => {
    /*
     * The column holds a mix: a deadline is midnight UTC on a calendar day,
     * while `appliedAt` set by the server is the actual instant. Both have to
     * answer "how many days ago" with the same number, or an application
     * created at 11pm would read as a day older than one created at 1am.
     */
    const lateUtc = new Date("2026-10-06T23:30:00.000Z");
    const earlyUtc = new Date("2026-10-06T00:30:00.000Z");

    expect(daysSinceDateOnly(lateUtc, now)).toBe(daysSinceDateOnly(earlyUtc, now));
  });

  it("stays exact across a month boundary", () => {
    // The reduction to UTC midnight is what makes this whole rather than
    // 30.958 — a raw millisecond subtraction would floor to the wrong day in a
    // zone that changed offset in between.
    expect(daysSinceDateOnly(parseDateOnly("2026-01-31"), new Date(2026, 1, 1, 12))).toBe(1);
  });

  it("answers zero rather than NaN for an invalid date", () => {
    expect(daysSinceDateOnly(new Date("not a date"), now)).toBe(0);
  });
});

describe("relativeDayLabel", () => {
  it("names the three days that have names", () => {
    expect(relativeDayLabel(0)).toBe("today");
    expect(relativeDayLabel(1)).toBe("yesterday");
    expect(relativeDayLabel(-1)).toBe("tomorrow");
  });

  it("counts in both directions", () => {
    expect(relativeDayLabel(5)).toBe("5 days ago");
    expect(relativeDayLabel(-5)).toBe("in 5 days");
  });
});
