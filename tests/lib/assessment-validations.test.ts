import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_STATUS_HINTS,
  ASSESSMENT_STATUS_LABELS,
  isOutstanding,
} from "@/lib/constants/assessment";
import {
  EMPTY_ASSESSMENT_FORM,
  assessmentFormSchema,
  assessmentSnapshotSchema,
  createAssessmentSchema,
  restoreAssessmentSchema,
  toAssessmentFormValues,
  updateAssessmentSchema,
} from "@/lib/validations/assessment";

/**
 * Assessments (DESIGN.md §7, Phase 3 step 3).
 *
 * The thing worth guarding is that a deadline is a **calendar day**, not an instant — the
 * opposite of an interview's `scheduledAt`. It is written as midnight UTC and read back in
 * UTC, so it cannot shift when the user travels.
 */

const VALID = {
  name: "Online assessment — round 1",
  provider: "HackerRank",
  url: "https://hackerrank.com/test/abc123",
  deadline: "2026-03-14",
  status: "PENDING",
  score: "",
  notes: "",
};

describe("assessmentFormSchema", () => {
  it("stores the deadline as midnight UTC", () => {
    const parsed = assessmentFormSchema.parse(VALID);

    expect(parsed.deadline?.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });

  it("turns blank optionals into null, never empty strings", () => {
    const parsed = assessmentFormSchema.parse({
      ...VALID,
      provider: "",
      url: "",
      deadline: "",
      score: "",
      notes: "",
    });

    expect(parsed.provider).toBeNull();
    expect(parsed.url).toBeNull();
    expect(parsed.deadline).toBeNull();
    expect(parsed.score).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("defaults the status to PENDING", () => {
    const { status, ...withoutStatus } = VALID;

    expect(assessmentFormSchema.parse(withoutStatus).status).toBe("PENDING");
    expect(status).toBe("PENDING");
  });

  /**
   * §8: "Deadline in the past — allowed, flagged visually. People log things late." The
   * flagging is the row's job; the schema must not refuse it.
   */
  it("accepts a deadline in the past", () => {
    expect(assessmentFormSchema.safeParse({ ...VALID, deadline: "2020-01-01" }).success).toBe(true);
  });

  it("accepts a deadline far in the future", () => {
    expect(assessmentFormSchema.safeParse({ ...VALID, deadline: "2030-01-01" }).success).toBe(true);
  });

  /**
   * §3 is explicit: `score` is a String because real scores look like "180/200", "85%" and
   * "Passed with distinction". An Int column would have forced all three into a lie.
   */
  it.each(["180/200", "85%", "Passed with distinction", "7.5/10"])(
    "accepts %s as a score",
    (score) => {
      expect(assessmentFormSchema.parse({ ...VALID, score }).score).toBe(score);
    },
  );

  it.each([
    { name: "an empty name", input: { name: "" }, path: "name" },
    { name: "a whitespace-only name", input: { name: "   " }, path: "name" },
    { name: "a name over 150 characters", input: { name: "x".repeat(151) }, path: "name" },
    { name: "a malformed deadline", input: { deadline: "14-03-2026" }, path: "deadline" },
    { name: "a deadline that does not exist", input: { deadline: "2026-02-31" }, path: "deadline" },
    { name: "an unknown status", input: { status: "ALMOST" }, path: "status" },
    { name: "a javascript: link", input: { url: "javascript:alert(1)" }, path: "url" },
  ])("rejects $name", ({ input, path }) => {
    const result = assessmentFormSchema.safeParse({ ...VALID, ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });
});

describe("createAssessmentSchema", () => {
  it("requires an application", () => {
    const result = createAssessmentSchema.safeParse(VALID);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("applicationId");
  });

  it("cannot re-parent on update", () => {
    const parsed = updateAssessmentSchema.parse({ ...VALID, applicationId: "somewhere-else" });

    expect("applicationId" in parsed).toBe(false);
  });
});

describe("toAssessmentFormValues", () => {
  it("is the inverse of what the schema does on submit", () => {
    const parsed = assessmentFormSchema.parse(VALID);

    expect(toAssessmentFormValues(parsed)).toEqual(VALID);
  });

  /**
   * Read back in **UTC**. Formatting the deadline in local time would put the 13th in the
   * input for a value stored as the 14th, and saving would then quietly move it — once per
   * edit, for every user west of Greenwich.
   */
  it("reads the deadline back in UTC, not local time", () => {
    const values = toAssessmentFormValues({
      name: "Take-home",
      provider: null,
      url: null,
      deadline: new Date("2026-03-14T00:00:00.000Z"),
      status: "PENDING",
      score: null,
      notes: null,
    });

    expect(values.deadline).toBe("2026-03-14");
  });

  it("turns nulls back into empty strings for the inputs", () => {
    const values = toAssessmentFormValues({
      name: "Take-home",
      provider: null,
      url: null,
      deadline: null,
      status: "COMPLETED",
      score: null,
      notes: null,
    });

    expect(values).toEqual({
      name: "Take-home",
      provider: "",
      url: "",
      deadline: "",
      status: "COMPLETED",
      score: "",
      notes: "",
    });
  });
});

describe("EMPTY_ASSESSMENT_FORM", () => {
  it("needs only a name to become valid", () => {
    const result = assessmentFormSchema.safeParse(EMPTY_ASSESSMENT_FORM);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["name"]);
  });
});

describe("the form-posts-raw-values contract", () => {
  it("cannot parse its own output", () => {
    const parsed = assessmentFormSchema.parse(VALID);

    expect(assessmentFormSchema.safeParse(parsed).success).toBe(false);
  });
});

describe("isOutstanding", () => {
  /**
   * The predicate the deadline surfacing turns on. A passed assessment whose deadline was
   * last Tuesday is finished, not overdue — colouring it red would train the user to
   * ignore the colour.
   */
  it("is true only for PENDING", () => {
    expect(isOutstanding("PENDING")).toBe(true);
    expect(isOutstanding("COMPLETED")).toBe(false);
    expect(isOutstanding("PASSED")).toBe(false);
    expect(isOutstanding("FAILED")).toBe(false);
  });
});

/**
 * The undo snapshot (DESIGN.md §8).
 *
 * The deadline is the interesting field: it is a calendar day stored as midnight
 * UTC, and a snapshot's job is to carry that exact instant back rather than to
 * re-decide which day it stands for.
 */
describe("assessmentSnapshotSchema", () => {
  const snapshot = {
    id: "cl_assessment",
    applicationId: "cl_app",
    name: "HackerRank screen",
    provider: "HackerRank",
    url: "https://hackerrank.com/test/abc123",
    deadline: new Date("2026-10-14T00:00:00.000Z"),
    status: "PENDING" as const,
    score: "180/200",
    notes: null,
    createdAt: new Date("2026-10-08T00:00:00.000Z"),
  };

  it("survives the JSON round trip, deadline included", () => {
    const overTheWire: unknown = JSON.parse(JSON.stringify(snapshot));
    const parsed = assessmentSnapshotSchema.parse(overTheWire);

    expect(parsed.deadline).toBeInstanceOf(Date);
    // Still midnight UTC on the 14th: the day has not moved.
    expect(parsed.deadline?.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("keeps a null deadline null rather than turning it into the epoch", () => {
    expect(assessmentSnapshotSchema.parse({ ...snapshot, deadline: null }).deadline).toBeNull();
  });

  it("refuses a URL that is not http or https", () => {
    // Rendered as a link on the assessment row, so the scheme has to be checked
    // on the way back in as well as on the form.
    expect(
      assessmentSnapshotSchema.safeParse({ ...snapshot, url: "javascript:alert(1)" }).success,
    ).toBe(false);

    expect(assessmentSnapshotSchema.safeParse({ ...snapshot, url: null }).success).toBe(true);
  });

  it("rejects a status outside the enum and a blank name", () => {
    expect(assessmentSnapshotSchema.safeParse({ ...snapshot, status: "SKIPPED" }).success).toBe(
      false,
    );

    expect(assessmentSnapshotSchema.safeParse({ ...snapshot, name: "" }).success).toBe(false);
  });

  it("carries no userId, so a forged snapshot cannot name an owner", () => {
    const parsed = assessmentSnapshotSchema.parse({ ...snapshot, userId: "someone-else" });

    expect(parsed).not.toHaveProperty("userId");
  });

  it("is what the restore endpoint accepts, under a snapshot key", () => {
    expect(restoreAssessmentSchema.safeParse({ snapshot }).success).toBe(true);
    expect(restoreAssessmentSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("the constants match schema.prisma", () => {
  it("AssessmentStatus", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block = /enum AssessmentStatus \{([^}]*)\}/.exec(schema)?.[1] ?? "";

    const declared = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();

    expect(declared).toEqual([...ASSESSMENT_STATUSES].sort());
  });

  it.each([
    { name: "labels", labels: ASSESSMENT_STATUS_LABELS },
    { name: "hints", labels: ASSESSMENT_STATUS_HINTS },
  ])("covers every status in $name", ({ labels }) => {
    const missing = ASSESSMENT_STATUSES.filter(
      (status) => !(labels as Record<string, string>)[status],
    );

    expect(missing).toEqual([]);
  });
});
