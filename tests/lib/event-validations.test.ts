import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EVENT_TYPES,
  MANUAL_EVENT_TITLE_PLACEHOLDERS,
  MANUAL_EVENT_TYPES,
  MANUAL_EVENT_TYPE_HINTS,
  isManualEventType,
  type EventTypeValue,
} from "@/lib/constants/event";
import { toDateInputValue, todayAsDateOnly } from "@/lib/utils/date-only";
import { emptyEventForm, eventSchema, toEventFormValues } from "@/lib/validations/event";

/**
 * Manual timeline entries (DESIGN.md §7, Phase 3 step 1).
 *
 * The two things worth guarding here are the ones that are invisible at a
 * glance: that the three automatic event types cannot be expressed in a
 * request, and that the schema's input side stays all strings so the form can
 * post its raw values to an API that re-validates with the same schema.
 */

const VALID = {
  type: "EMAIL_RECEIVED",
  title: "Recruiter replied about next steps",
  description: "Asked for my availability next week.",
  occurredAt: "2026-03-14",
};

describe("eventSchema", () => {
  it("parses a complete entry", () => {
    const parsed = eventSchema.parse(VALID);

    expect(parsed).toEqual({
      type: "EMAIL_RECEIVED",
      title: "Recruiter replied about next steps",
      description: "Asked for my availability next week.",
      occurredAt: new Date("2026-03-14T00:00:00.000Z"),
    });
  });

  it("stores a date-only value as midnight UTC", () => {
    const { occurredAt } = eventSchema.parse(VALID);

    expect(occurredAt.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });

  it("trims the title", () => {
    expect(eventSchema.parse({ ...VALID, title: "  Phone screen  " }).title).toBe("Phone screen");
  });

  it("turns a blank description into null, never an empty string", () => {
    expect(eventSchema.parse({ ...VALID, description: "   " }).description).toBeNull();
    expect(eventSchema.parse({ ...VALID, description: undefined }).description).toBeNull();
  });

  it.each([
    { name: "an empty title", input: { title: "" }, path: "title" },
    { name: "a whitespace-only title", input: { title: "   " }, path: "title" },
    { name: "a title over 150 characters", input: { title: "x".repeat(151) }, path: "title" },
    {
      name: "a description over 2000 characters",
      input: { description: "x".repeat(2001) },
      path: "description",
    },
    { name: "a missing date", input: { occurredAt: "" }, path: "occurredAt" },
    { name: "a malformed date", input: { occurredAt: "14-03-2026" }, path: "occurredAt" },
    // The round-trip check in `isDateOnlyString` is what catches this: V8 rolls
    // 31 February over to 3 March rather than rejecting it.
    { name: "a date that does not exist", input: { occurredAt: "2026-02-31" }, path: "occurredAt" },
  ])("rejects $name", ({ input, path }) => {
    const result = eventSchema.safeParse({ ...VALID, ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });
});

/**
 * The one date rule in the app that is strict about the future. Everywhere else
 * a future date is the normal case and a past one is merely late; a timeline
 * records what happened, so it inverts.
 */
describe("a timeline entry cannot be in the future", () => {
  function dateInDays(days: number): string {
    return toDateInputValue(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  }

  it("accepts today", () => {
    expect(eventSchema.safeParse({ ...VALID, occurredAt: todayAsDateOnly() }).success).toBe(true);
  });

  it("accepts the past, because people log things late", () => {
    expect(eventSchema.safeParse({ ...VALID, occurredAt: "2020-01-01" }).success).toBe(true);
  });

  it("rejects a date well in the future", () => {
    const result = eventSchema.safeParse({ ...VALID, occurredAt: dateInDays(7) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["occurredAt"]);
  });

  /*
   * The tolerance is a day, not zero, and this is why: a date-only value is
   * stored as midnight UTC, so a user in Asia/Kolkata picking "today" late in
   * the evening produces an instant already in tomorrow's UTC date. Zero
   * tolerance would reject today for everyone east of Greenwich.
   */
  it("tolerates tomorrow, so a late-evening pick east of UTC still saves", () => {
    expect(eventSchema.safeParse({ ...VALID, occurredAt: dateInDays(1) }).success).toBe(true);
  });
});

/**
 * The boundary that matters most in this step. `SAVED`, `APPLIED` and
 * `STATUS_CHANGE` are written by the system inside the transaction that changes
 * the columns they describe, and §3 reads the event log as the authority for
 * "ever reached INTERVIEW". A hand-written one is a transition that never
 * happened, recorded as indistinguishable from one that did.
 */
describe("only manual event types can be written by hand", () => {
  const AUTOMATIC = ["SAVED", "APPLIED", "STATUS_CHANGE"] as const;

  it.each(AUTOMATIC)("rejects %s", (type) => {
    const result = eventSchema.safeParse({ ...VALID, type });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["type"]);
  });

  it.each(MANUAL_EVENT_TYPES)("accepts %s", (type) => {
    expect(eventSchema.safeParse({ ...VALID, type }).success).toBe(true);
  });

  it("is exactly the complement of the automatic types", () => {
    const expected = EVENT_TYPES.filter((type) => !(AUTOMATIC as readonly string[]).includes(type));

    expect([...MANUAL_EVENT_TYPES]).toEqual(expected);
  });

  it("agrees with isManualEventType", () => {
    for (const type of EVENT_TYPES) {
      expect(isManualEventType(type)).toBe(
        (MANUAL_EVENT_TYPES as readonly string[]).includes(type),
      );
    }
  });

  it("rejects a type that is not in the enum at all", () => {
    expect(eventSchema.safeParse({ ...VALID, type: "NOT_A_TYPE" }).success).toBe(false);
  });
});

describe("the manual type maps are total", () => {
  // A hole would render `undefined` under the picker, or as the placeholder
  // attribute of the title input — `noUncheckedIndexedAccess` cannot catch
  // either, because both are valid React.
  it.each([
    { name: "hints", labels: MANUAL_EVENT_TYPE_HINTS },
    { name: "title placeholders", labels: MANUAL_EVENT_TITLE_PLACEHOLDERS },
  ])("covers every manual type in $name", ({ labels }) => {
    const missing = MANUAL_EVENT_TYPES.filter((type) => !(labels as Record<string, string>)[type]);

    expect(missing).toEqual([]);
  });
});

describe("the form's starting values", () => {
  it("defaults the date to today, so an entry is dated when it happened", () => {
    expect(emptyEventForm().occurredAt).toBe(todayAsDateOnly());
  });

  it("is a function, so a page left open overnight does not offer yesterday", () => {
    // The guard is structural rather than behavioural: a module-scope constant
    // would freeze the date at bundle evaluation, and the only way to assert
    // that it has not become one is to check that calling it twice re-reads the
    // clock. Both calls land in the same day here, so this asserts the shape.
    expect(typeof emptyEventForm).toBe("function");
    expect(emptyEventForm()).toEqual(emptyEventForm());
  });

  it("starts valid except for the title the user has to write", () => {
    const result = eventSchema.safeParse(emptyEventForm());

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["title"]);
  });
});

describe("toEventFormValues", () => {
  it("is the inverse of what the schema does on submit", () => {
    const parsed = eventSchema.parse(VALID);

    expect(toEventFormValues(parsed)).toEqual(VALID);
  });

  it("turns a null description back into an empty string for the textarea", () => {
    const values = toEventFormValues({
      type: "CUSTOM",
      title: "Something happened",
      description: null,
      occurredAt: new Date("2026-03-14T00:00:00.000Z"),
    });

    expect(values.description).toBe("");
  });

  /*
   * Read back in UTC, the other half of the date-only convention. Formatting in
   * local time would put the 13th in the input for a value stored as the 14th,
   * and saving would then quietly move the entry a day earlier — once per edit,
   * for every user west of Greenwich.
   */
  it("reads the date back in UTC, not local time", () => {
    const values = toEventFormValues({
      type: "CUSTOM",
      title: "Late in the day",
      description: null,
      occurredAt: new Date("2026-03-14T00:00:00.000Z"),
    });

    expect(values.occurredAt).toBe("2026-03-14");
  });
});

/**
 * The tripwire. The form posts `getValues()` — raw strings — because the API
 * re-validates with this same schema, whose input side is all strings. Posting
 * the *parsed* payload instead would send a `Date` where "2026-03-14" is
 * expected and have the server reject its own output. This is the mistake the
 * onboarding wizard made, and it cost an hour.
 */
describe("the schema cannot parse its own output", () => {
  it("rejects the parsed payload, which is why the form posts raw values", () => {
    const parsed = eventSchema.parse(VALID);

    expect(eventSchema.safeParse(parsed).success).toBe(false);
  });
});

/**
 * The constants are hand-written in src/lib/constants so Prisma stays out of
 * src/lib (§4). This is what stops them drifting from the schema.
 */
describe("the manual types exist in schema.prisma", () => {
  it("every manual type is a member of the EventType enum", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block = /enum EventType \{([^}]*)\}/.exec(schema)?.[1] ?? "";

    const declared = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const missing = MANUAL_EVENT_TYPES.filter((type) => !declared.includes(type as EventTypeValue));

    expect(missing).toEqual([]);
  });
});
