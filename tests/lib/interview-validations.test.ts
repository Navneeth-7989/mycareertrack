import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERVIEW_MINUTES,
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  MAX_INTERVIEW_MINUTES,
  isSettledResult,
} from "@/lib/constants/interview";
import {
  createInterviewSchema,
  emptyInterviewForm,
  interviewFormSchema,
  interviewSnapshotSchema,
  restoreInterviewSchema,
  toInterviewFormValues,
  updateInterviewSchema,
} from "@/lib/validations/interview";

/**
 * Interviews (DESIGN.md §7, Phase 3 step 2).
 *
 * The thing under real scrutiny is that **every schema here is a factory taking a
 * timezone**, and that the zone threads through both directions consistently. A stored
 * interview put into the form and saved again must not move, and that round trip is only
 * correct if `toInterviewFormValues` formats in the same zone `requiredDateTime` parses
 * in.
 */

const IST = "Asia/Kolkata";
const NY = "America/New_York";

const VALID = {
  type: "TECHNICAL",
  scheduledAt: "2026-03-14T15:30",
  durationMinutes: "60",
  meetingUrl: "https://meet.google.com/abc-defg",
  interviewerName: "Priya Sharma",
  prepNotes: "Revise graphs.",
  notes: "",
  result: "PENDING",
};

describe("interviewFormSchema", () => {
  it("reads the wall clock in the given timezone", () => {
    const parsed = interviewFormSchema(IST).parse(VALID);

    // 15:30 IST is 10:00 UTC.
    expect(parsed.scheduledAt.toISOString()).toBe("2026-03-14T10:00:00.000Z");
  });

  it("reads the same wall clock as a different instant in a different zone", () => {
    const ist = interviewFormSchema(IST).parse(VALID);
    const ny = interviewFormSchema(NY).parse(VALID);

    expect(ist.scheduledAt.toISOString()).not.toBe(ny.scheduledAt.toISOString());
    expect(ny.scheduledAt.toISOString()).toBe("2026-03-14T19:30:00.000Z");
  });

  it("turns blank optionals into null, never empty strings", () => {
    const parsed = interviewFormSchema(IST).parse({
      ...VALID,
      durationMinutes: "",
      meetingUrl: "",
      interviewerName: "",
      prepNotes: "",
      notes: "",
    });

    expect(parsed.durationMinutes).toBeNull();
    expect(parsed.meetingUrl).toBeNull();
    expect(parsed.interviewerName).toBeNull();
    expect(parsed.prepNotes).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("defaults the result to PENDING", () => {
    const { result, ...withoutResult } = VALID;

    expect(interviewFormSchema(IST).parse(withoutResult).result).toBe("PENDING");
    expect(result).toBe("PENDING");
  });

  /**
   * §8: "Interview in the past — allowed, post-hoc logging is normal." The opposite rule
   * from a timeline entry, which deliberately refuses the future.
   */
  it("accepts a past interview, because logging one after the fact is normal", () => {
    expect(
      interviewFormSchema(IST).safeParse({ ...VALID, scheduledAt: "2020-01-01T09:00" }).success,
    ).toBe(true);
  });

  it.each([
    { name: "a missing date", input: { scheduledAt: "" }, path: "scheduledAt" },
    { name: "a date-only value", input: { scheduledAt: "2026-03-14" }, path: "scheduledAt" },
    { name: "a malformed time", input: { scheduledAt: "2026-03-14T25:00" }, path: "scheduledAt" },
    {
      name: "a date that does not exist",
      input: { scheduledAt: "2026-02-31T10:00" },
      path: "scheduledAt",
    },
    { name: "an unknown round type", input: { type: "LUNCH" }, path: "type" },
    { name: "an unknown result", input: { result: "MAYBE" }, path: "result" },
    { name: "a zero duration", input: { durationMinutes: "0" }, path: "durationMinutes" },
    {
      name: "a duration over a day",
      input: { durationMinutes: String(MAX_INTERVIEW_MINUTES + 1) },
      path: "durationMinutes",
    },
    {
      name: "a non-numeric duration",
      input: { durationMinutes: "an hour" },
      path: "durationMinutes",
    },
    {
      name: "a javascript: meeting link",
      input: { meetingUrl: "javascript:alert(1)" },
      path: "meetingUrl",
    },
  ])("rejects $name", ({ input, path }) => {
    const result = interviewFormSchema(IST).safeParse({ ...VALID, ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });

  it("strips separators from a typed duration", () => {
    expect(
      interviewFormSchema(IST).parse({ ...VALID, durationMinutes: "1,440" }).durationMinutes,
    ).toBe(1440);
  });
});

describe("createInterviewSchema", () => {
  it("requires an application", () => {
    const result = createInterviewSchema(IST).safeParse(VALID);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("applicationId");
  });

  it("accepts one", () => {
    expect(
      createInterviewSchema(IST).safeParse({ ...VALID, applicationId: "abc123" }).success,
    ).toBe(true);
  });

  /**
   * An interview belongs to the role it was for. `applicationId` is absent from the
   * update schema so re-parenting cannot even be expressed — and Zod strips unknown keys,
   * which is what makes that a guarantee rather than a convention.
   */
  it("cannot be expressed on update", () => {
    const parsed = updateInterviewSchema(IST).parse({ ...VALID, applicationId: "somewhere-else" });

    expect("applicationId" in parsed).toBe(false);
  });
});

describe("the duration round trip", () => {
  it("recovers the duration from a stored endsAt", () => {
    const values = toInterviewFormValues(
      {
        type: "TECHNICAL",
        scheduledAt: new Date("2026-03-14T10:00:00.000Z"),
        endsAt: new Date("2026-03-14T10:45:00.000Z"),
        meetingUrl: null,
        interviewerName: null,
        prepNotes: null,
        notes: null,
        result: "PENDING",
      },
      IST,
    );

    expect(values.durationMinutes).toBe("45");
    expect(values.scheduledAt).toBe("2026-03-14T15:30");
  });

  it("reads a null endsAt back as a blank duration", () => {
    const values = toInterviewFormValues(
      {
        type: "HR",
        scheduledAt: new Date("2026-03-14T10:00:00.000Z"),
        endsAt: null,
        meetingUrl: null,
        interviewerName: null,
        prepNotes: null,
        notes: null,
        result: "PENDING",
      },
      IST,
    );

    expect(values.durationMinutes).toBe("");
  });

  /**
   * A stored `endsAt` at or before `scheduledAt` cannot be produced by this form, but a
   * seed or a backup could hold one. It reads back blank rather than as a negative the
   * form would then refuse to save for a reason the user did not cause.
   */
  it("reads a non-positive stored interval back as blank", () => {
    const values = toInterviewFormValues(
      {
        type: "HR",
        scheduledAt: new Date("2026-03-14T10:00:00.000Z"),
        endsAt: new Date("2026-03-14T09:00:00.000Z"),
        meetingUrl: null,
        interviewerName: null,
        prepNotes: null,
        notes: null,
        result: "PENDING",
      },
      IST,
    );

    expect(values.durationMinutes).toBe("");
  });

  /**
   * The property that matters most: a stored interview, loaded into the form and saved
   * unchanged, must land on the same instant. Checked in a DST zone as well, since that
   * is where the two-pass offset correction in `parseWallClockInZone` earns its keep.
   */
  it.each([IST, NY, "UTC", "Europe/London"])("does not move the interview in %s", (zone) => {
    const stored = {
      type: "TECHNICAL" as const,
      scheduledAt: new Date("2026-07-15T13:45:00.000Z"),
      endsAt: new Date("2026-07-15T14:45:00.000Z"),
      meetingUrl: null,
      interviewerName: null,
      prepNotes: null,
      notes: null,
      result: "PENDING" as const,
    };

    const values = toInterviewFormValues(stored, zone);
    const reparsed = interviewFormSchema(zone).parse(values);

    expect(reparsed.scheduledAt.toISOString()).toBe(stored.scheduledAt.toISOString());
    expect(reparsed.durationMinutes).toBe(60);
  });
});

describe("emptyInterviewForm", () => {
  it("defaults to tomorrow at 10:00 in the user's zone", () => {
    const now = new Date("2026-03-14T18:00:00.000Z");

    // 18:00 UTC is already 23:30 on the 14th in IST, so tomorrow is the 15th.
    expect(emptyInterviewForm(IST, now).scheduledAt).toBe("2026-03-15T10:00");
  });

  it("prefills the default duration", () => {
    expect(emptyInterviewForm(IST).durationMinutes).toBe(String(DEFAULT_INTERVIEW_MINUTES));
  });

  it("is valid as it stands, so the form opens savable", () => {
    expect(interviewFormSchema(IST).safeParse(emptyInterviewForm(IST)).success).toBe(true);
  });
});

/**
 * The form posts `getValues()` — raw strings — because the API re-validates with this same
 * schema, whose input side is all strings. Posting the parsed payload would send a `Date`
 * where "2026-03-14T15:30" is expected.
 */
describe("the form-posts-raw-values contract", () => {
  it("cannot parse its own output", () => {
    const parsed = interviewFormSchema(IST).parse(VALID);

    expect(interviewFormSchema(IST).safeParse(parsed).success).toBe(false);
  });
});

/**
 * The undo snapshot (DESIGN.md §8).
 *
 * It is the only interview payload that leaves the server and comes back expecting
 * to be written, so these are mostly about what it must **refuse** — and the
 * sharpest of those is the meeting URL, which the row renders into an `href`.
 */
describe("interviewSnapshotSchema", () => {
  const snapshot = {
    id: "cl_interview",
    applicationId: "cl_app",
    type: "TECHNICAL",
    scheduledAt: new Date("2026-10-20T09:30:00.000Z"),
    endsAt: new Date("2026-10-20T10:30:00.000Z"),
    meetingUrl: "https://meet.google.com/abc-defg",
    interviewerName: "Priya",
    prepNotes: "Revise graphs",
    notes: null,
    result: "PENDING" as const,
    createdAt: new Date("2026-10-08T00:00:00.000Z"),
  };

  it("survives the JSON round trip it is designed for", () => {
    // The actual journey: server -> response body -> browser -> request body.
    // Every Date becomes an ISO string on the way out, so the schema has to read
    // them back as Dates or the restore writes strings into timestamp columns.
    const overTheWire: unknown = JSON.parse(JSON.stringify(snapshot));
    const parsed = interviewSnapshotSchema.parse(overTheWire);

    expect(parsed.scheduledAt).toBeInstanceOf(Date);
    expect(parsed.scheduledAt.toISOString()).toBe("2026-10-20T09:30:00.000Z");
    expect(parsed.endsAt?.toISOString()).toBe("2026-10-20T10:30:00.000Z");
  });

  it("keeps a null endsAt null rather than turning it into the epoch", () => {
    // The hazard `nullableWireDate` exists for: a bare z.coerce.date() would
    // read null as 1 January 1970 and put a finished round on the calendar.
    const parsed = interviewSnapshotSchema.parse({ ...snapshot, endsAt: null });

    expect(parsed.endsAt).toBeNull();
  });

  it("refuses a meeting URL that is not http or https", () => {
    // The one snapshot field where lax validation is a vulnerability: this value
    // goes straight into an href on the interview row.
    for (const meetingUrl of ["javascript:alert(1)", "data:text/html,<script>", "not a url"]) {
      expect(interviewSnapshotSchema.safeParse({ ...snapshot, meetingUrl }).success).toBe(false);
    }

    expect(interviewSnapshotSchema.safeParse({ ...snapshot, meetingUrl: null }).success).toBe(true);
  });

  it("rejects a type or result outside the enum", () => {
    expect(interviewSnapshotSchema.safeParse({ ...snapshot, type: "COFFEE_CHAT" }).success).toBe(
      false,
    );

    expect(interviewSnapshotSchema.safeParse({ ...snapshot, result: "MAYBE" }).success).toBe(false);
  });

  it("carries no userId, so a forged snapshot cannot name an owner", () => {
    const parsed = interviewSnapshotSchema.parse({ ...snapshot, userId: "someone-else" });

    expect(parsed).not.toHaveProperty("userId");
  });

  it("is what the restore endpoint accepts, under a snapshot key", () => {
    expect(restoreInterviewSchema.safeParse({ snapshot }).success).toBe(true);
    expect(restoreInterviewSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("isSettledResult", () => {
  it("treats everything but PENDING as finished, cancellation included", () => {
    expect(isSettledResult("PENDING")).toBe(false);
    expect(isSettledResult("PASSED")).toBe(true);
    expect(isSettledResult("FAILED")).toBe(true);
    expect(isSettledResult("CANCELLED")).toBe(true);
  });
});

describe("the constants match schema.prisma", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  function enumValues(name: string): string[] {
    const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema)?.[1] ?? "";

    return block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
  }

  it.each([
    { name: "InterviewType", values: INTERVIEW_TYPES },
    { name: "InterviewResult", values: INTERVIEW_RESULTS },
  ])("$name", ({ name, values }) => {
    expect(enumValues(name)).toEqual([...values].sort());
  });

  it.each([
    { name: "interview types", values: INTERVIEW_TYPES, labels: INTERVIEW_TYPE_LABELS },
    { name: "interview results", values: INTERVIEW_RESULTS, labels: INTERVIEW_RESULT_LABELS },
  ])("labels every value in $name", ({ values, labels }) => {
    const missing = values.filter((value) => !(labels as Record<string, string>)[value]);

    expect(missing).toEqual([]);
  });
});
