import { describe, expect, it } from "vitest";

import { REMINDER_HOUR_OPTIONS } from "@/lib/constants/notification";
import {
  settingsSchema,
  toSettingsFormValues,
  type SettingsFormValues,
} from "@/lib/validations/settings";

/**
 * `PATCH /api/settings` is the one endpoint in the app that can change how
 * every interview time in the product is rendered, so the timezone arm is worth
 * more than the usual amount of testing.
 */

const VALID: SettingsFormValues = {
  notifyInterviews: true,
  notifyAssessments: false,
  notifyDeadlines: true,
  notifyTasks: true,
  reminderHours: "24",
  defaultView: "KANBAN",
  timezone: "Asia/Kolkata",
};

function parse(overrides: Partial<SettingsFormValues> = {}) {
  return settingsSchema.safeParse({ ...VALID, ...overrides });
}

describe("settingsSchema", () => {
  it("accepts a complete set of preferences", () => {
    const result = parse();

    expect(result.success).toBe(true);
    expect(result.data?.reminderHours).toBe(24);
    expect(result.data?.notifyAssessments).toBe(false);
  });

  it("coerces the reminder window from the string a select holds", () => {
    for (const hours of REMINDER_HOUR_OPTIONS) {
      const result = parse({ reminderHours: String(hours) });

      expect(result.success).toBe(true);
      expect(result.data?.reminderHours).toBe(hours);
    }
  });

  it("refuses a window outside the offered set", () => {
    // The column is an Int and would take this happily; 9 999 hours would
    // generate a notification for every interview the user will ever schedule.
    expect(parse({ reminderHours: "9999" }).success).toBe(false);
    expect(parse({ reminderHours: "25" }).success).toBe(false);
    expect(parse({ reminderHours: "0" }).success).toBe(false);
    expect(parse({ reminderHours: "-24" }).success).toBe(false);
    expect(parse({ reminderHours: "24.5" }).success).toBe(false);
    expect(parse({ reminderHours: "" }).success).toBe(false);
    expect(parse({ reminderHours: "a day" }).success).toBe(false);
  });

  it("refuses a timezone the runtime does not know", () => {
    expect(parse({ timezone: "Fake/Nowhere" }).success).toBe(false);
    expect(parse({ timezone: "" }).success).toBe(false);
    expect(parse({ timezone: "Asia/Kolkatta" }).success).toBe(false);
    expect(parse({ timezone: "GMT+5:30" }).success).toBe(false);
  });

  it("accepts a legacy abbreviation the runtime still resolves", () => {
    /*
     * "IST" passes, which is worth a test rather than a surprise: `Intl`
     * resolves a handful of legacy abbreviations as aliases, so
     * `isValidTimeZone` says yes and every date in the app formats correctly
     * under it. The picker never offers one — `TIMEZONES` comes from
     * `Intl.supportedValuesOf`, which lists only canonical zones — so this is
     * only reachable by posting directly, and accepting something that
     * demonstrably works is the right answer.
     */
    expect(parse({ timezone: "IST" }).success).toBe(true);
  });

  it("accepts real zones from either hemisphere, and UTC", () => {
    for (const zone of ["UTC", "America/New_York", "Europe/London", "Australia/Sydney"]) {
      expect(parse({ timezone: zone }).success).toBe(true);
    }
  });

  it("refuses a view that is not one of the two", () => {
    expect(parse({ defaultView: "LIST" as "KANBAN" }).success).toBe(false);
  });

  it("requires the booleans rather than defaulting a missing one to true", () => {
    // A checkbox the user unticked and one that never arrived must not be the
    // same request — defaulting would silently re-enable a reminder they turned
    // off.
    const withoutTasks: Record<string, unknown> = { ...VALID };
    delete withoutTasks.notifyTasks;

    expect(settingsSchema.safeParse(withoutTasks).success).toBe(false);
    expect(settingsSchema.safeParse({ ...VALID, notifyTasks: "on" }).success).toBe(false);
  });

  it("names the field it is complaining about", () => {
    const result = parse({ timezone: "Fake/Nowhere", reminderHours: "7" });

    const paths = result.error?.issues.map((issue) => issue.path.join("."));

    expect(paths).toContain("timezone");
    expect(paths).toContain("reminderHours");
  });
});

describe("toSettingsFormValues", () => {
  const stored = {
    notifyInterviews: false,
    notifyAssessments: true,
    notifyDeadlines: false,
    notifyTasks: true,
    reminderHours: 48,
    defaultView: "TABLE" as const,
    timezone: "Europe/London",
  };

  it("stringifies the reminder window for the select", () => {
    expect(toSettingsFormValues(stored).reminderHours).toBe("48");
  });

  it("falls back to the column default for a window outside the offered set", () => {
    // Only reachable by editing the column directly. Seeding the select with an
    // option it does not contain would render blank and then silently rewrite
    // the user's setting on the next save.
    expect(toSettingsFormValues({ ...stored, reminderHours: 100 }).reminderHours).toBe("24");
  });

  it("carries the booleans through untouched", () => {
    expect(toSettingsFormValues(stored)).toMatchObject({
      notifyInterviews: false,
      notifyAssessments: true,
      notifyDeadlines: false,
      notifyTasks: true,
      defaultView: "TABLE",
      timezone: "Europe/London",
    });
  });

  it("produces something the schema accepts", () => {
    expect(settingsSchema.safeParse(toSettingsFormValues(stored)).success).toBe(true);
  });
});

describe("the form posts raw values, not parsed ones", () => {
  it("cannot parse its own output", () => {
    /*
     * The tripwire every validation suite in this app keeps. `reminderHours`
     * has a string input side and a number output side, so posting what
     * `handleSubmit` produces would send `24` where `"24"` is expected and have
     * the server reject its own output — the bug the onboarding wizard learned
     * the hard way. `SettingsForm` posts `getValues()`.
     */
    const parsed = settingsSchema.parse(VALID);

    expect(settingsSchema.safeParse(parsed).success).toBe(false);
  });
});
