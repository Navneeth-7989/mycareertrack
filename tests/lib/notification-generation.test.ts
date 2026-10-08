import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  NOTIFIABLE_ENTITIES,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  REMINDER_HOUR_OPTIONS,
  bellBadge,
  formatUnreadBadge,
  isReminderHours,
} from "@/lib/constants/notification";
import {
  applicationDraft,
  assessmentDraft,
  interviewDraft,
  reminderWindow,
  taskDraft,
} from "@/server/services/notifications";

/**
 * The parts of notification generation that can be wrong without any database
 * being involved: the two kinds of reminder window, and what each draft says.
 *
 * §7's done-when for this block is *"an interview 20 hours out produces exactly
 * one inbox item"*. The "exactly one" half is the unique constraint and is
 * proved by a probe against the real database; the "20 hours out is inside the
 * window" half is `reminderWindow`, and it is proved here.
 */

const NOW = new Date("2026-06-15T09:30:00.000Z");

function utc(iso: string): Date {
  return new Date(iso);
}

const APPLICATION = {
  id: "app-1",
  jobTitle: "Frontend Engineer",
  company: { name: "Google" },
};

describe("reminderWindow — interviews are instants", () => {
  it("runs from now to exactly now plus the reminder hours", () => {
    const window = reminderWindow(NOW, 24);

    expect(window.now).toEqual(NOW);
    expect(window.instantUntil.toISOString()).toBe("2026-06-16T09:30:00.000Z");
  });

  it("includes an interview 20 hours out and excludes one 28 hours out", () => {
    const window = reminderWindow(NOW, 24);

    const twentyHours = new Date(NOW.getTime() + 20 * 3_600_000);
    const twentyEightHours = new Date(NOW.getTime() + 28 * 3_600_000);

    expect(twentyHours >= window.now && twentyHours <= window.instantUntil).toBe(true);
    expect(twentyEightHours <= window.instantUntil).toBe(false);
  });

  it("excludes an interview that has already started", () => {
    const window = reminderWindow(NOW, 24);
    const anHourAgo = new Date(NOW.getTime() - 3_600_000);

    // An overdue reminder is not a reminder — the interviews page and the
    // dashboard both surface the past already.
    expect(anHourAgo >= window.now).toBe(false);
  });

  it("tracks a non-default window", () => {
    expect(reminderWindow(NOW, 6).instantUntil.toISOString()).toBe("2026-06-15T15:30:00.000Z");
    expect(reminderWindow(NOW, 72).instantUntil.toISOString()).toBe("2026-06-18T09:30:00.000Z");
  });
});

describe("reminderWindow — deadlines are calendar days", () => {
  it("runs from midnight UTC today, not from the current time", () => {
    const window = reminderWindow(NOW, 24);

    // Midnight, not 09:30 — a deadline dated today must be inside the window
    // for the whole of today, not only before breakfast.
    expect(window.dayFrom.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("covers today and tomorrow at the default 24 hours", () => {
    const window = reminderWindow(NOW, 24);

    expect(window.dayUntil.toISOString()).toBe("2026-06-16T00:00:00.000Z");

    const today = utc("2026-06-15T00:00:00.000Z");
    const tomorrow = utc("2026-06-16T00:00:00.000Z");
    const dayAfter = utc("2026-06-17T00:00:00.000Z");

    expect(today >= window.dayFrom && today <= window.dayUntil).toBe(true);
    expect(tomorrow >= window.dayFrom && tomorrow <= window.dayUntil).toBe(true);
    expect(dayAfter <= window.dayUntil).toBe(false);
  });

  it("rounds a sub-day window up to one whole day rather than down to none", () => {
    // Six hours before a date that has no time on it is meaningless; the
    // smallest honest answer is "today".
    const window = reminderWindow(NOW, 6);

    expect(window.dayUntil.toISOString()).toBe("2026-06-16T00:00:00.000Z");
  });

  it("converts larger windows to whole days", () => {
    expect(reminderWindow(NOW, 48).dayUntil.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(reminderWindow(NOW, 72).dayUntil.toISOString()).toBe("2026-06-18T00:00:00.000Z");
  });

  it("excludes a deadline that has passed", () => {
    const window = reminderWindow(NOW, 24);
    const yesterday = utc("2026-06-14T00:00:00.000Z");

    expect(yesterday >= window.dayFrom).toBe(false);
  });
});

describe("drafts", () => {
  it("names an interview by its type and company, with no relative time in it", () => {
    const draft = interviewDraft({
      id: "int-1",
      type: "TECHNICAL",
      scheduledAt: utc("2026-06-16T04:00:00.000Z"),
      application: APPLICATION,
    });

    expect(draft).toEqual({
      type: "INTERVIEW_UPCOMING",
      entityType: "INTERVIEW",
      entityId: "int-1",
      title: "Technical interview at Google",
      body: "Frontend Engineer",
      linkUrl: "/applications/app-1",
      eventAt: utc("2026-06-16T04:00:00.000Z"),
    });
  });

  it("writes no relative time into any title", () => {
    /*
     * The rule that keeps the inbox honest: a title is written once and only
     * rewritten when generation sees the row again, so "tomorrow" baked into it
     * is wrong within the day. `eventAt` carries the time and the row computes
     * the phrase at render.
     */
    const titles = [
      interviewDraft({
        id: "i",
        type: "HR",
        scheduledAt: NOW,
        application: APPLICATION,
      }).title,
      assessmentDraft({
        id: "a",
        name: "HackerRank test",
        deadline: NOW,
        application: APPLICATION,
      }).title,
      applicationDraft({
        id: "p",
        jobTitle: "Frontend Engineer",
        deadline: NOW,
        company: { name: "Google" },
      }).title,
      taskDraft({ id: "t", title: "Email the recruiter", dueDate: NOW, application: null }).title,
    ];

    for (const title of titles) {
      expect(title).not.toMatch(/today|tomorrow|hours?|days?|soon/i);
    }
  });

  it("falls back to a generic label for an unrecognised interview type", () => {
    // Unreachable through the schema, but the map lookup is the one place a new
    // enum member would land as `undefined` and print "undefined interview".
    const draft = interviewDraft({
      id: "int-2",
      type: "SOMETHING_NEW",
      scheduledAt: NOW,
      application: APPLICATION,
    });

    expect(draft.title).toBe("Interview interview at Google");
  });

  it("points an assessment at the application, carrying its context in the body", () => {
    const draft = assessmentDraft({
      id: "ass-1",
      name: "HackerRank test",
      deadline: utc("2026-06-16T00:00:00.000Z"),
      application: APPLICATION,
    });

    expect(draft.type).toBe("ASSESSMENT_DEADLINE");
    expect(draft.title).toBe("HackerRank test is due");
    expect(draft.body).toBe("Frontend Engineer at Google");
    expect(draft.linkUrl).toBe("/applications/app-1");
  });

  it("describes an application deadline as applications closing", () => {
    const draft = applicationDraft({
      id: "app-1",
      jobTitle: "Frontend Engineer",
      deadline: utc("2026-06-16T00:00:00.000Z"),
      company: { name: "Google" },
    });

    expect(draft.type).toBe("APPLICATION_DEADLINE");
    expect(draft.entityType).toBe("APPLICATION");
    expect(draft.title).toBe("Applications close for Frontend Engineer");
    expect(draft.body).toBe("Google");
  });

  it("gives a standalone task no invented context and sends it to /tasks", () => {
    const draft = taskDraft({
      id: "task-1",
      title: "Email the recruiter",
      dueDate: utc("2026-06-16T00:00:00.000Z"),
      application: null,
    });

    expect(draft.body).toBeNull();
    expect(draft.linkUrl).toBe("/tasks");
  });

  it("links a task that has a parent to that application", () => {
    const draft = taskDraft({
      id: "task-2",
      title: "Prepare system design",
      dueDate: utc("2026-06-16T00:00:00.000Z"),
      application: APPLICATION,
    });

    expect(draft.body).toBe("Frontend Engineer at Google");
    expect(draft.linkUrl).toBe("/applications/app-1");
  });

  it("carries eventAt through on every draft, which the row renders from", () => {
    const when = utc("2026-06-16T00:00:00.000Z");

    expect(taskDraft({ id: "t", title: "x", dueDate: when, application: null }).eventAt).toEqual(
      when,
    );
    expect(
      applicationDraft({ id: "a", jobTitle: "x", deadline: when, company: { name: "y" } }).eventAt,
    ).toEqual(when);
  });
});

describe("the unread badge", () => {
  it("prints small counts exactly", () => {
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(9)).toBe("9");
  });

  it("caps past the point a number stops being actionable", () => {
    expect(formatUnreadBadge(10)).toBe("9+");
    expect(formatUnreadBadge(213)).toBe("9+");
  });
});

describe("bellBadge", () => {
  it("shows the unread count loudly when anything is unseen", () => {
    expect(bellBadge(3, 5)).toEqual({ count: 3, tone: "loud" });
    expect(bellBadge(1, 1)).toEqual({ count: 1, tone: "loud" });
  });

  it("falls back to the upcoming count, quietly, once everything is read", () => {
    /*
     * The case the two tiers exist for: you read "Technical interview at
     * Adobe", the interview is still tomorrow, and a pure unread badge would
     * leave a bare bell — losing the at-a-glance signal the moment it is used.
     */
    expect(bellBadge(0, 2)).toEqual({ count: 2, tone: "quiet" });
  });

  it("shows nothing when there is nothing ahead and nothing unread", () => {
    expect(bellBadge(0, 0)).toBeNull();
  });

  it("shows nothing for an inbox of only past, read reminders", () => {
    // `upcoming` counts only events that have not happened, which is what makes
    // the badge self-clearing — a total count would never go back to zero.
    expect(bellBadge(0, 0)).toBeNull();
  });

  it("keeps unread loud even when it exceeds what is upcoming", () => {
    // Reachable: a reminder for yesterday's interview that was never read.
    // "You have not looked at these" is still the more urgent message.
    expect(bellBadge(4, 1)).toEqual({ count: 4, tone: "loud" });
  });
});

describe("reminder hour options", () => {
  it("accepts only the offered spans", () => {
    expect(isReminderHours(24)).toBe(true);
    expect(isReminderHours(25)).toBe(false);
    expect(isReminderHours(0)).toBe(false);
    expect(isReminderHours(9999)).toBe(false);
  });

  it("includes the column default, so an untouched account can round-trip", () => {
    expect(REMINDER_HOUR_OPTIONS).toContain(24);
  });
});

describe("the constants match schema.prisma", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  function enumMembers(name: string): string[] {
    const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);

    expect(block).not.toBeNull();

    return (block?.[1] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
  }

  it("covers every NotificationType", () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(enumMembers("NotificationType").sort());
  });

  it("covers every NotifiableEntity", () => {
    expect([...NOTIFIABLE_ENTITIES].sort()).toEqual(enumMembers("NotifiableEntity").sort());
  });

  it("labels every type", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("gives every type a preference column that exists on User", () => {
    // The map is what stops a new type shipping with no way to turn it off.
    for (const type of NOTIFICATION_TYPES) {
      const column = NOTIFICATION_PREFERENCE_KEYS[type];

      expect(column).toBeTruthy();
      expect(schema).toMatch(new RegExp(`${column}\\s+Boolean`));
    }
  });

  it("has a reminderHours column for the window to live in", () => {
    expect(schema).toMatch(/reminderHours\s+Int\s+@default\(24\)/);
  });
});
