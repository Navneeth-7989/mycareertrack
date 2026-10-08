import { describe, expect, it } from "vitest";

import {
  daysUntilInZone,
  daysUntilLabel,
  formatTimeInZone,
  isDateTimeInputString,
  parseWallClockInZone,
  toDateTimeInputValue,
  zonedDateOnly,
} from "@/lib/utils/date-time";

/**
 * Instants, as opposed to calendar days (DESIGN.md §4, "one conversion at
 * display").
 *
 * The function under real scrutiny here is `parseWallClockInZone`. There is no
 * primitive for "read this wall clock in that zone", so it recovers the offset by
 * measurement and corrects twice — and the second pass exists specifically for
 * DST boundaries, which is what most of these tests are about. India has no DST,
 * so the default zone would never have exercised it.
 */

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("toDateTimeInputValue", () => {
  it("converts a UTC instant to the wall clock shown in the zone", () => {
    // 10:00 UTC is 15:30 in IST (+5:30).
    expect(toDateTimeInputValue(new Date("2026-03-14T10:00:00.000Z"), IST)).toBe(
      "2026-03-14T15:30",
    );
  });

  it("is the identity in UTC", () => {
    expect(toDateTimeInputValue(new Date("2026-03-14T15:30:00.000Z"), "UTC")).toBe(
      "2026-03-14T15:30",
    );
  });

  it("crosses the date line backwards where the offset is negative", () => {
    // 02:00 UTC on the 14th is still the evening of the 13th in New York.
    expect(toDateTimeInputValue(new Date("2026-03-14T02:00:00.000Z"), NY)).toBe("2026-03-13T22:00");
  });

  it("renders midnight as 00, never 24", () => {
    // `hour12: false` produces "24" on some ICU builds, which would parse as the
    // next day. `hourCycle: "h23"` is what stops that.
    expect(toDateTimeInputValue(new Date("2026-03-14T00:00:00.000Z"), "UTC")).toBe(
      "2026-03-14T00:00",
    );
  });

  it("returns an empty string for null and for an invalid date", () => {
    expect(toDateTimeInputValue(null, IST)).toBe("");
    expect(toDateTimeInputValue(new Date("nonsense"), IST)).toBe("");
  });
});

describe("parseWallClockInZone", () => {
  it("reads a wall clock as the instant it names in the zone", () => {
    expect(parseWallClockInZone("2026-03-14T15:30", IST).toISOString()).toBe(
      "2026-03-14T10:00:00.000Z",
    );
  });

  it("is the identity in UTC", () => {
    expect(parseWallClockInZone("2026-03-14T15:30", "UTC").toISOString()).toBe(
      "2026-03-14T15:30:00.000Z",
    );
  });

  it("handles a negative offset", () => {
    // 22:00 on the 13th in New York (EDT, -4) is 02:00 UTC on the 14th.
    expect(parseWallClockInZone("2026-03-13T22:00", NY).toISOString()).toBe(
      "2026-03-14T02:00:00.000Z",
    );
  });

  it("returns an invalid date for a malformed value", () => {
    expect(Number.isNaN(parseWallClockInZone("not-a-date", IST).getTime())).toBe(true);
  });

  /*
   * The round trip is the property that actually matters: a stored interview put
   * into the form and saved again unchanged must not move. Several zones,
   * including two with DST and one with a half-hour offset, across both sides of
   * a transition.
   */
  it.each([
    { zone: "UTC", wall: "2026-06-15T09:00" },
    { zone: IST, wall: "2026-06-15T09:00" },
    { zone: NY, wall: "2026-06-15T09:00" },
    { zone: NY, wall: "2026-01-15T09:00" },
    { zone: "Europe/London", wall: "2026-07-01T13:45" },
    { zone: "Europe/London", wall: "2026-12-01T13:45" },
    { zone: "Australia/Adelaide", wall: "2026-09-20T18:15" },
    { zone: "Pacific/Kiritimati", wall: "2026-05-05T06:00" },
    { zone: "Pacific/Midway", wall: "2026-05-05T06:00" },
  ])("round-trips $wall in $zone", ({ zone, wall }) => {
    expect(toDateTimeInputValue(parseWallClockInZone(wall, zone), zone)).toBe(wall);
  });

  /*
   * The second correction pass exists for these. On 8 March 2026 New York jumps
   * 02:00 → 03:00, so a wall clock an hour either side of the gap is measured
   * with one offset and must be corrected with the other.
   */
  describe("around a spring-forward transition", () => {
    it("reads the hour before the gap with the old offset (EST, -5)", () => {
      expect(parseWallClockInZone("2026-03-08T01:30", NY).toISOString()).toBe(
        "2026-03-08T06:30:00.000Z",
      );
    });

    it("reads the hour after the gap with the new offset (EDT, -4)", () => {
      expect(parseWallClockInZone("2026-03-08T03:30", NY).toISOString()).toBe(
        "2026-03-08T07:30:00.000Z",
      );
    });

    /*
     * 02:30 does not exist that night. Documented behaviour: return the nearest
     * instant that does rather than fail, because the user picked a time their
     * own calendar control offered. The assertion is only that it is real and
     * lands in the right hour — not which side it falls on, which is an
     * implementation detail nobody should depend on.
     */
    it("normalises a local time that does not exist instead of failing", () => {
      const parsed = parseWallClockInZone("2026-03-08T02:30", NY);

      expect(Number.isNaN(parsed.getTime())).toBe(false);

      // One of the two instants adjacent to the gap — 01:30 EST or 03:30 EDT,
      // depending on which offset the correction settles on. Both are "the
      // nearest real instant"; pinning one would be asserting an implementation
      // detail, which is exactly what the comment above says not to depend on.
      expect(["2026-03-08T06:30:00.000Z", "2026-03-08T07:30:00.000Z"]).toContain(
        parsed.toISOString(),
      );
    });
  });

  describe("around a fall-back transition", () => {
    it("resolves an ambiguous wall clock to one of the two real instants", () => {
      // 1 November 2026, New York repeats 01:00–02:00. Either answer is
      // defensible; what must not happen is a wrong hour or a NaN.
      const parsed = parseWallClockInZone("2026-11-01T01:30", NY);

      expect(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]).toContain(
        parsed.toISOString(),
      );
    });

    it("still round-trips the wall clock it chose", () => {
      const parsed = parseWallClockInZone("2026-11-01T01:30", NY);

      expect(toDateTimeInputValue(parsed, NY)).toBe("2026-11-01T01:30");
    });
  });
});

describe("isDateTimeInputString", () => {
  it.each(["2026-03-14T15:30", "2026-01-01T00:00", "2026-12-31T23:59"])("accepts %s", (value) => {
    expect(isDateTimeInputString(value)).toBe(true);
  });

  it.each([
    "",
    "2026-03-14",
    "2026-03-14T15:30:00",
    "14-03-2026T15:30",
    "2026-3-14T15:30",
    "2026-03-14 15:30",
    // V8 rolls these over rather than rejecting them, which is what the
    // round-trip check inside the function catches.
    "2026-02-31T10:00",
    "2026-13-01T10:00",
    "2026-03-14T25:00",
    "2026-03-14T10:61",
  ])("rejects %s", (value) => {
    expect(isDateTimeInputString(value)).toBe(false);
  });
});

describe("zonedDateOnly", () => {
  it("reports the calendar day in the zone, not in UTC", () => {
    const instant = new Date("2026-03-14T20:00:00.000Z");

    // Already the 15th in IST, still the 14th in New York.
    expect(zonedDateOnly(instant, IST)).toBe("2026-03-15");
    expect(zonedDateOnly(instant, NY)).toBe("2026-03-14");
  });
});

describe("daysUntilInZone", () => {
  const now = new Date("2026-03-14T06:00:00.000Z");

  it.each([
    { name: "later today", at: "2026-03-14T12:00:00.000Z", expected: 0 },
    { name: "tomorrow", at: "2026-03-15T12:00:00.000Z", expected: 1 },
    { name: "yesterday", at: "2026-03-13T12:00:00.000Z", expected: -1 },
    { name: "next week", at: "2026-03-21T12:00:00.000Z", expected: 7 },
  ])("counts $name as $expected", ({ at, expected }) => {
    expect(daysUntilInZone(new Date(at), IST, now)).toBe(expected);
  });

  /*
   * The point of counting in the zone rather than from the raw difference: an
   * interview 11 hours away can be "tomorrow" because it is tomorrow on the
   * user's calendar, which is what a human means.
   */
  it("counts calendar days, not elapsed hours", () => {
    const soon = new Date("2026-03-14T19:00:00.000Z"); // 00:30 on the 15th, IST

    expect(daysUntilInZone(soon, IST, now)).toBe(1);
    expect(daysUntilInZone(soon, "UTC", now)).toBe(0);
  });

  it("returns 0 for an invalid date rather than NaN", () => {
    expect(daysUntilInZone(new Date("nonsense"), IST, now)).toBe(0);
  });
});

describe("daysUntilLabel", () => {
  it.each([
    { days: 0, label: "Today" },
    { days: 1, label: "Tomorrow" },
    { days: -1, label: "Yesterday" },
    { days: 3, label: "In 3 days" },
    { days: -4, label: "4 days ago" },
  ])("labels $days as $label", ({ days, label }) => {
    expect(daysUntilLabel(days)).toBe(label);
  });
});

describe("formatTimeInZone", () => {
  it("renders a 12-hour clock in the zone", () => {
    const formatted = formatTimeInZone(new Date("2026-03-14T10:00:00.000Z"), IST);

    // Asserted loosely: ICU varies the space before the meridiem between
    // versions, and pinning the exact byte makes this fail on a Node upgrade for
    // no reason.
    expect(formatted).toMatch(/^3:30\s*pm$/i);
  });

  it("returns an empty string for null", () => {
    expect(formatTimeInZone(null, IST)).toBe("");
  });
});
