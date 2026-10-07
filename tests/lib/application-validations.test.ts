import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_HINTS,
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  isResponseStatus,
  isSubmittedStatus,
} from "@/lib/constants/application";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants/event";
import {
  EMPTY_APPLICATION_FORM,
  applicationSnapshotSchema,
  applicationWarningsSchema,
  createApplicationRequestSchema,
  createApplicationSchema,
  createdApplicationIdSchema,
  deletedApplicationSchema,
  toApplicationFormValues,
  updateApplicationRequestSchema,
} from "@/lib/validations/application";

const minimal = { ...EMPTY_APPLICATION_FORM, companyName: "Google", jobTitle: "SDE Intern" };

function parse(overrides: Partial<typeof EMPTY_APPLICATION_FORM> = {}) {
  return createApplicationSchema.parse({ ...minimal, ...overrides });
}

function fails(overrides: Partial<typeof EMPTY_APPLICATION_FORM>) {
  return createApplicationSchema.safeParse({ ...minimal, ...overrides });
}

describe("createApplicationSchema", () => {
  it("accepts a company and a job title alone", () => {
    // The most common action in the product (§1). If this ever starts needing
    // more, the form has drifted from its design.
    const result = createApplicationSchema.parse({
      companyName: "Google",
      jobTitle: "SDE Intern",
    });

    expect(result.status).toBe("SAVED");
    expect(result.priority).toBe("MEDIUM");
    expect(result.currency).toBe("INR");
    expect(result.location).toBeNull();
    expect(result.appliedAt).toBeNull();
  });

  it("requires a company and a job title", () => {
    expect(fails({ companyName: "" }).success).toBe(false);
    expect(fails({ jobTitle: "" }).success).toBe(false);
    expect(fails({ jobTitle: "   " }).success).toBe(false);
  });

  it("stores every blank optional as null, never an empty string", () => {
    const result = parse();

    expect(result.jobUrl).toBeNull();
    expect(result.location).toBeNull();
    expect(result.workMode).toBeNull();
    expect(result.employmentType).toBeNull();
    expect(result.source).toBeNull();
    expect(result.salaryMin).toBeNull();
    expect(result.salaryMax).toBeNull();
    expect(result.deadline).toBeNull();
    expect(result.jobDescription).toBeNull();
    expect(result.recruiterName).toBeNull();
    expect(result.recruiterEmail).toBeNull();
    expect(result.recruiterPhone).toBeNull();
  });

  it("treats an omitted optional the same as a blank one", () => {
    // A client that simply leaves a key out must not get a 400 over a field
    // that was never required.
    const result = createApplicationSchema.parse({ companyName: "Meta", jobTitle: "PM Intern" });

    expect(result.workMode).toBeNull();
    expect(result.recruiterPhone).toBeNull();
  });

  it("adds the scheme to a job link", () => {
    expect(parse({ jobUrl: "careers.google.com/jobs/1" }).jobUrl).toBe(
      "https://careers.google.com/jobs/1",
    );
  });

  it("refuses a javascript: job link", () => {
    expect(fails({ jobUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("salary", () => {
  it("accepts the separators people actually type", () => {
    expect(parse({ salaryMin: "12,00,000" }).salaryMin).toBe(1200000);
    expect(parse({ salaryMin: "1 200 000" }).salaryMin).toBe(1200000);
  });

  it("rejects non-numeric input", () => {
    expect(fails({ salaryMin: "a lot" }).success).toBe(false);
    expect(fails({ salaryMin: "12.5" }).success).toBe(false);
    expect(fails({ salaryMin: "-5" }).success).toBe(false);
  });

  it("rejects an amount the Int column cannot hold", () => {
    expect(fails({ salaryMin: "9999999999" }).success).toBe(false);
  });

  it("rejects a maximum below the minimum, on the field the user must fix", () => {
    const result = fails({ salaryMin: "900000", salaryMax: "600000" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["salaryMax"]);
  });

  it("allows a range with only one end filled in", () => {
    expect(parse({ salaryMax: "900000" }).salaryMin).toBeNull();
    expect(parse({ salaryMin: "600000" }).salaryMax).toBeNull();
  });

  it("allows an exact figure as both ends", () => {
    const result = parse({ salaryMin: "750000", salaryMax: "750000" });

    expect([result.salaryMin, result.salaryMax]).toEqual([750000, 750000]);
  });
});

describe("dates", () => {
  it("stores a calendar day as midnight UTC", () => {
    // The convention in utils/date-only: a deadline is a day, not an instant,
    // so it is written and read in UTC. Anything else shows the wrong date to
    // somebody.
    expect(parse({ deadline: "2026-03-14" }).deadline?.toISOString()).toBe(
      "2026-03-14T00:00:00.000Z",
    );
  });

  it("accepts a deadline in the past", () => {
    // §8: allowed and flagged visually. People log things late.
    expect(fails({ deadline: "2020-01-01" }).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(fails({ deadline: "14/03/2026" }).success).toBe(false);
    expect(fails({ deadline: "2026-02-31" }).success).toBe(false);
    expect(fails({ deadline: "2026-3-4" }).success).toBe(false);
  });

  it("accepts a date applied in the past", () => {
    expect(fails({ status: "APPLIED", appliedAt: "2026-01-05" }).success).toBe(true);
  });

  it("rejects a date applied far in the future", () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const result = fails({ status: "APPLIED", appliedAt: nextYear.toISOString().slice(0, 10) });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["appliedAt"]);
  });

  it("accepts today, wherever the user is", () => {
    // Stored as midnight UTC, so for a user in Asia/Kolkata picking "today"
    // late in the evening the stored instant is already tomorrow in UTC. The
    // one-day tolerance is what stops that being rejected.
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;

    expect(fails({ status: "APPLIED", appliedAt: local }).success).toBe(true);
  });
});

describe("the recruiter block", () => {
  it("lowercases the email, as the contact match key needs", () => {
    expect(parse({ recruiterEmail: " Priya@Google.com " }).recruiterEmail).toBe("priya@google.com");
  });

  it("rejects a malformed email", () => {
    expect(fails({ recruiterEmail: "priya@" }).success).toBe(false);
  });

  it("accepts the phone formats people actually write", () => {
    for (const phone of ["+91 98765 43210", "098765-43210", "(080) 4123 4567", "+1-555-0100"]) {
      expect(fails({ recruiterPhone: phone }).success).toBe(true);
    }
  });

  it("rejects something that is not a phone number", () => {
    expect(fails({ recruiterPhone: "call me" }).success).toBe(false);
    expect(fails({ recruiterPhone: "12" }).success).toBe(false);
  });
});

describe("enum fields", () => {
  it("accepts every value the constants offer", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(fails({ status }).success).toBe(true);
    }

    for (const source of APPLICATION_SOURCES) {
      expect(fails({ source }).success).toBe(true);
    }
  });

  it("rejects a value outside the enum", () => {
    expect(fails({ status: "GHOSTED" as never }).success).toBe(false);
    expect(fails({ workMode: "UNDERWATER" as never }).success).toBe(false);
  });

  it("reads an empty optional enum as no answer", () => {
    expect(parse({ workMode: "" }).workMode).toBeNull();
  });
});

/**
 * The tripwire. The form posts raw values and the server parses them with this
 * schema, so the schema's input and output sides are deliberately different
 * types — and the moment they converge, someone has made the output postable
 * and the contract has quietly changed.
 */
describe("the form-posts-raw-values contract", () => {
  it("cannot parse its own output", () => {
    const output = parse({ deadline: "2026-03-14", salaryMin: "600000" });

    expect(createApplicationSchema.safeParse(output).success).toBe(false);
  });

  it("defaults exactly the fields the schema parses", () => {
    // `EMPTY_APPLICATION_FORM` is typed `Required<ApplicationFormValues>`, so a
    // field added to the schema and not here already fails the build. This
    // catches what types cannot see: a field dropped from the schema but left
    // behind in the defaults, which would render as an input bound to nothing.
    const parsed = createApplicationSchema.parse(minimal);

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(EMPTY_APPLICATION_FORM).sort());
  });
});

describe("createApplicationRequestSchema", () => {
  it("defaults the acknowledgement to false", () => {
    // The default matters more than it looks: a client that has never heard of
    // the flag must get the confirmation, not bypass it.
    expect(createApplicationRequestSchema.parse(minimal).acknowledgeDuplicate).toBe(false);
  });

  it("accepts an explicit acknowledgement", () => {
    const result = createApplicationRequestSchema.parse({
      ...minimal,
      acknowledgeDuplicate: true,
    });

    expect(result.acknowledgeDuplicate).toBe(true);
  });

  it("will not take a truthy string for the flag", () => {
    // Nothing types this field, so there is no input whose string value it has
    // to accept — and "false" being truthy is how a coerced boolean silently
    // acknowledges every duplicate.
    expect(
      createApplicationRequestSchema.safeParse({ ...minimal, acknowledgeDuplicate: "false" })
        .success,
    ).toBe(false);
  });

  it("applies the same field and cross-field rules as the form", () => {
    expect(createApplicationRequestSchema.safeParse({ ...minimal, companyName: "" }).success).toBe(
      false,
    );

    const salaries = createApplicationRequestSchema.safeParse({
      ...minimal,
      salaryMin: "900000",
      salaryMax: "600000",
    });

    expect(salaries.success).toBe(false);
    expect(salaries.error?.issues[0]?.path).toEqual(["salaryMax"]);
  });

  it("keeps the flag out of the form's own schema", () => {
    // EMPTY_APPLICATION_FORM is `Required<ApplicationFormValues>`, so the flag
    // leaking into the form schema would force a meaningless default onto the
    // form — and make the acknowledgement look like something a user types.
    expect("acknowledgeDuplicate" in EMPTY_APPLICATION_FORM).toBe(false);
    expect("acknowledgeDuplicate" in createApplicationSchema.parse(minimal)).toBe(false);
  });
});

describe("applicationWarningsSchema", () => {
  it("reads the advisory list out of a create response", () => {
    const warnings = applicationWarningsSchema.parse({
      data: { id: "abc" },
      warnings: [
        {
          code: "POSSIBLE_DUPLICATE",
          level: "warning",
          message: "You already have an application for SDE Intern at Google",
          applicationIds: ["xyz"],
        },
      ],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.level).toBe("warning");
  });

  it("reads an absent list as empty", () => {
    expect(applicationWarningsSchema.parse({ data: { id: "abc" } })).toEqual([]);
  });

  it("reads a body that is not ours as empty rather than throwing", () => {
    // The create already succeeded by this point. Failing to show an advisory
    // must not turn a success into an exception.
    expect(applicationWarningsSchema.parse("<html>502 Bad Gateway</html>")).toEqual([]);
    expect(applicationWarningsSchema.parse(null)).toEqual([]);
    expect(applicationWarningsSchema.parse({ warnings: [{ code: "WAT" }] })).toEqual([]);
  });
});

describe("status rules", () => {
  it("counts everything except SAVED as submitted", () => {
    // §3's denominator. WITHDRAWN counts: withdrawing is something you do to an
    // application you sent.
    expect(isSubmittedStatus("SAVED")).toBe(false);

    for (const status of APPLICATION_STATUSES.filter((value) => value !== "SAVED")) {
      expect(isSubmittedStatus(status)).toBe(true);
    }
  });

  it("counts a rejection as a response and a withdrawal as silence", () => {
    expect(isResponseStatus("REJECTED")).toBe(true);
    expect(isResponseStatus("WITHDRAWN")).toBe(false);
    expect(isResponseStatus("SAVED")).toBe(false);
    expect(isResponseStatus("APPLIED")).toBe(false);
    expect(isResponseStatus("SCREENING")).toBe(true);
  });

  it("treats every responded status as submitted too", () => {
    // A response to an application you never sent is incoherent, and it would
    // make the response rate exceed 100%.
    for (const status of APPLICATION_STATUSES.filter(isResponseStatus)) {
      expect(isSubmittedStatus(status)).toBe(true);
    }
  });
});

/**
 * These lists are hand-written in src/lib/constants so Prisma stays out of
 * src/lib (§4). This is what stops them drifting from the schema.
 */
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
    { name: "ApplicationStatus", values: APPLICATION_STATUSES },
    { name: "EmploymentType", values: EMPLOYMENT_TYPES },
    { name: "Priority", values: PRIORITIES },
    { name: "ApplicationSource", values: APPLICATION_SOURCES },
    { name: "EventType", values: EVENT_TYPES },
  ])("$name", ({ name, values }) => {
    expect(enumValues(name)).toEqual([...values].sort());
  });

  it.each([
    { name: "status labels", values: APPLICATION_STATUSES, labels: APPLICATION_STATUS_LABELS },
    { name: "status hints", values: APPLICATION_STATUSES, labels: APPLICATION_STATUS_HINTS },
    { name: "employment types", values: EMPLOYMENT_TYPES, labels: EMPLOYMENT_TYPE_LABELS },
    { name: "priorities", values: PRIORITIES, labels: PRIORITY_LABELS },
    { name: "sources", values: APPLICATION_SOURCES, labels: APPLICATION_SOURCE_LABELS },
    // The timeline's map has to be total, not just covering the two types
    // written today: a hole would render `undefined` where an icon goes.
    { name: "event types", values: EVENT_TYPES, labels: EVENT_TYPE_LABELS },
  ])("labels every value in $name", ({ values, labels }) => {
    const missing = values.filter((value) => !(labels as Record<string, string>)[value]);

    expect(missing).toEqual([]);
  });
});

/**
 * The create form reads the new id out of the response to redirect to its
 * detail page. By the time this parser runs the row is already written, so the
 * one thing it must never do is throw — a save that succeeded and then threw on
 * its own response body would show the user an error for a saved application.
 */
describe("createdApplicationIdSchema", () => {
  it("reads the id out of the wrapped success body", () => {
    expect(createdApplicationIdSchema.parse({ data: { id: "cl123" } })).toBe("cl123");
  });

  it("ignores the rest of the body", () => {
    // `warnings` sits beside `data` on a create (§6) and is read by a separate
    // parser.
    const body = { data: { id: "cl123", jobTitle: "SDE Intern" }, warnings: [] };

    expect(createdApplicationIdSchema.parse(body)).toBe("cl123");
  });

  it("answers null rather than throwing on a body it cannot read", () => {
    for (const body of [null, {}, { data: {} }, { data: { id: "" } }, "<html>", 42]) {
      expect(createdApplicationIdSchema.parse(body)).toBeNull();
    }
  });
});

/**
 * The edit endpoint's schema. Everything it shares with create is already
 * covered above — these are the differences, and the first one is the whole
 * reason it exists as a separate schema.
 */
describe("updateApplicationRequestSchema", () => {
  const minimalEdit = { companyName: "Google", jobTitle: "SDE Intern" };

  it("cannot express a status at all", () => {
    /*
     * Not "ignores it" — `.omit()` removes the key, so a status arriving in the
     * body is dropped rather than applied. Changing status writes a timeline
     * event and maintains appliedAt/firstResponseAt in one transaction, and a
     * field edit must never be a second route to that column.
     */
    const result = updateApplicationRequestSchema.parse({
      ...minimalEdit,
      status: "OFFER",
    });

    expect(result).not.toHaveProperty("status");
  });

  it("keeps every other field the create schema has", () => {
    const result = updateApplicationRequestSchema.parse({
      ...minimalEdit,
      location: "Bengaluru",
      salaryMin: "1200000",
      deadline: "2026-12-01",
      recruiterEmail: "priya@google.com",
    });

    expect(result.location).toBe("Bengaluru");
    expect(result.salaryMin).toBe(1200000);
    expect(result.deadline).toEqual(new Date("2026-12-01T00:00:00.000Z"));
    expect(result.recruiterEmail).toBe("priya@google.com");
  });

  it("applies the same cross-field rules as create", () => {
    // The point of extracting `applicationCrossFieldRules`: one definition, so
    // the two schemas cannot disagree about what is valid.
    const result = updateApplicationRequestSchema.safeParse({
      ...minimalEdit,
      salaryMin: "900000",
      salaryMax: "600000",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["salaryMax"]);
  });

  it("defaults the acknowledgement to false", () => {
    // A client that has never heard of the flag gets the confirmation rather
    // than silently bypassing it.
    expect(updateApplicationRequestSchema.parse(minimalEdit).acknowledgeDuplicate).toBe(false);
  });
});

describe("toApplicationFormValues", () => {
  const stored = {
    companyName: "Google",
    jobTitle: "SDE Intern",
    jobUrl: null,
    location: null,
    workMode: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    currency: "INR",
    status: "APPLIED",
    priority: "HIGH",
    source: null,
    appliedAt: null,
    deadline: null,
    jobDescription: null,
    recruiter: null,
  } as const;

  it("turns every null into an empty string, never undefined", () => {
    // The form's inputs are controlled; undefined would make them uncontrolled
    // and React would warn the first time the user typed.
    const values = toApplicationFormValues({ ...stored });

    for (const [key, value] of Object.entries(values)) {
      expect(typeof value, key).toBe("string");
    }
  });

  it("round-trips through the schema it feeds", () => {
    /*
     * The real contract: whatever this produces, the form's resolver must
     * accept. A mapper that emitted a number for salary or a Date for a
     * deadline would fail validation on a form the user had not touched.
     */
    const values = toApplicationFormValues({
      ...stored,
      jobUrl: "https://careers.google.com/jobs/1",
      location: "Bengaluru",
      workMode: "HYBRID",
      employmentType: "FULL_TIME",
      salaryMin: 1200000,
      salaryMax: 1800000,
      source: "LINKEDIN",
      appliedAt: new Date("2026-10-02T00:00:00.000Z"),
      deadline: new Date("2026-12-01T00:00:00.000Z"),
      jobDescription: "Build things.",
      recruiter: { name: "Priya", role: "Recruiter", email: "p@g.com", phone: "+91 98765 43210" },
    });

    const parsed = createApplicationSchema.parse(values);

    expect(parsed.salaryMin).toBe(1200000);
    expect(parsed.workMode).toBe("HYBRID");
    expect(parsed.deadline).toEqual(new Date("2026-12-01T00:00:00.000Z"));
    expect(parsed.recruiterEmail).toBe("p@g.com");
  });

  it("reads dates back on the day they were stored", () => {
    // UTC on the way out, matching how they went in. Reading in local time
    // would show the 30th in the input for a value stored as the 1st.
    const values = toApplicationFormValues({
      ...stored,
      deadline: new Date("2026-12-01T00:00:00.000Z"),
    });

    expect(values.deadline).toBe("2026-12-01");
  });

  it("falls back to the column default for a currency the form cannot show", () => {
    // A row holding something outside CURRENCIES would otherwise select nothing
    // and submit as invalid, with no way for the user to see why.
    expect(toApplicationFormValues({ ...stored, currency: "XYZ" }).currency).toBe("INR");
    expect(toApplicationFormValues({ ...stored, currency: null }).currency).toBe("INR");
  });

  it("prefers the per-application role over the contact's own", () => {
    const values = toApplicationFormValues({
      ...stored,
      recruiter: { name: "Priya", role: "Referrer", email: "p@g.com", phone: null },
    });

    expect(values.recruiterRole).toBe("Referrer");
    expect(values.recruiterPhone).toBe("");
  });
});

/**
 * The undo snapshot. It is the only thing in the product that leaves the server
 * and comes back expecting to be written, so these are mostly about what it
 * must refuse.
 */
describe("applicationSnapshotSchema", () => {
  const snapshot = {
    application: {
      id: "cl_app",
      companyId: "cl_company",
      jobTitle: "SDE Intern",
      jobUrl: null,
      location: null,
      workMode: null,
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      currency: "INR",
      status: "APPLIED",
      priority: "MEDIUM",
      source: null,
      savedAt: new Date("2026-10-01T00:00:00.000Z"),
      appliedAt: new Date("2026-10-02T00:00:00.000Z"),
      deadline: null,
      jobDescription: null,
      resumeId: null,
      firstResponseAt: null,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    events: [
      {
        id: "cl_event",
        type: "APPLIED",
        title: "Application submitted",
        description: null,
        occurredAt: new Date("2026-10-02T00:00:00.000Z"),
        isAutomatic: true,
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ],
    contacts: [
      {
        contactId: "cl_contact",
        role: "Recruiter",
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ],
  };

  it("survives the JSON round trip it is designed for", () => {
    /*
     * The actual journey: server -> response body -> browser -> request body.
     * Every Date becomes an ISO string on the way out, so the schema has to
     * read them back as Dates or the restore writes strings into timestamp
     * columns.
     */
    const overTheWire: unknown = JSON.parse(JSON.stringify(snapshot));
    const parsed = applicationSnapshotSchema.parse(overTheWire);

    expect(parsed.application.savedAt).toBeInstanceOf(Date);
    expect(parsed.application.appliedAt?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(parsed.events[0]?.occurredAt).toBeInstanceOf(Date);
    expect(parsed.contacts[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("keeps a null date null instead of turning it into the epoch", () => {
    /*
     * The bug `nullableWireDate` exists for. A bare `z.coerce.date()` parses
     * null as 1 January 1970, and an `appliedAt` of 1970 counts as a submitted
     * application in every rate in §3 — a silently wrong number rather than a
     * visible error.
     */
    const parsed = applicationSnapshotSchema.parse({
      ...snapshot,
      application: { ...snapshot.application, appliedAt: null, firstResponseAt: null },
    });

    expect(parsed.application.appliedAt).toBeNull();
    expect(parsed.application.firstResponseAt).toBeNull();
  });

  it("rejects a date that is not a date", () => {
    const result = applicationSnapshotSchema.safeParse({
      ...snapshot,
      application: { ...snapshot.application, savedAt: "whenever" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an enum value outside the schema", () => {
    expect(
      applicationSnapshotSchema.safeParse({
        ...snapshot,
        application: { ...snapshot.application, status: "ARCHIVED" },
      }).success,
    ).toBe(false);

    expect(
      applicationSnapshotSchema.safeParse({
        ...snapshot,
        events: [{ ...snapshot.events[0], type: "DELETED" }],
      }).success,
    ).toBe(false);
  });

  it("carries no userId, so a forged snapshot cannot name an owner", () => {
    // Identity comes from the session in `restoreApplication` (§4, rule 3).
    // Anything extra in the body is dropped rather than written.
    const parsed = applicationSnapshotSchema.parse({
      ...snapshot,
      application: { ...snapshot.application, userId: "someone-else" },
    });

    expect(parsed.application).not.toHaveProperty("userId");
  });

  it("refuses an unbounded child array", () => {
    // These arrive from a browser; the cap is a request-size bound, not a
    // product limit.
    const many = Array.from({ length: 501 }, (_, index) => ({
      ...snapshot.events[0],
      id: `cl_event_${index}`,
    }));

    expect(applicationSnapshotSchema.safeParse({ ...snapshot, events: many }).success).toBe(false);
  });

  it("accepts an application with no children at all", () => {
    const parsed = applicationSnapshotSchema.parse({ ...snapshot, events: [], contacts: [] });

    expect(parsed.events).toEqual([]);
    expect(parsed.contacts).toEqual([]);
  });
});

describe("deletedApplicationSchema", () => {
  it("is strict, unlike the create-response parsers", () => {
    /*
     * A snapshot that cannot be read means undo is not available, and the
     * client has to know that so it can withhold the button rather than offer
     * one that will fail.
     */
    expect(deletedApplicationSchema.safeParse({ data: { jobTitle: "x" } }).success).toBe(false);
    expect(deletedApplicationSchema.safeParse(null).success).toBe(false);
  });
});
