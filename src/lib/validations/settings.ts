import { z } from "zod";

import { isReminderHours, VIEW_PREFERENCES } from "@/lib/constants/notification";
import { isValidTimeZone } from "@/lib/utils/timezone";

/**
 * The settings form — notification preferences, the reminder window, the
 * default applications view, and the timezone.
 *
 * All five are columns on `User`. §6 lists no settings endpoint, so
 * `PATCH /api/settings` is an addition to it, recorded in that file's comment:
 * the preferences have to be reachable or the toggles in §7's Phase 4 bullet
 * are decoration, and they do not belong on `/api/onboarding`, which exists to
 * create a `Profile` once.
 *
 * **The input side is strings**, like every other schema in the app, because the
 * form posts its raw values and the Route Handler re-validates with this same
 * schema (§4, rule 4). `reminderHours` is the field that makes it matter: a
 * `<select>` holds "24", and posting the parsed `24` would send a number where
 * the schema's input expects text. The tripwire test asserts this schema cannot
 * parse its own output.
 *
 * The booleans are the exception and are genuinely booleans: a checkbox is bound
 * through a `Controller` to a real `boolean`, not to a form-encoded "on".
 */

/**
 * The reminder window, as one of the offered spans.
 *
 * A strict set rather than a bounded integer. `User.reminderHours` is an `Int`
 * and would happily take 9 999, which would generate a notification for every
 * interview the user will ever schedule — and there is no honest answer to
 * "what should this be" beyond a handful of sensible spans, so the API offers
 * exactly those. Widening it later is a one-line change to
 * `REMINDER_HOUR_OPTIONS` with no migration.
 */
const reminderHoursSchema = z
  .string()
  .trim()
  .min(1, { error: "Choose when reminders should arrive" })
  .refine((value) => /^\d+$/.test(value), { error: "Choose when reminders should arrive" })
  .transform((value) => Number(value))
  .refine(isReminderHours, { error: "Choose one of the offered reminder times" });

/**
 * The timezone, checked by asking `Intl` to use it rather than by pattern.
 *
 * Strict here, unlike onboarding — see `utils/timezone`, where detection is
 * allowed to fall back silently because failing a signup over a browser quirk
 * would be absurd. This field is a deliberate choice from a list, so an
 * unknown zone is a real error worth naming: it is what every interview time in
 * the product is rendered through, and a silent fallback would move every one of
 * them by hours without saying so.
 */
const timezoneSchema = z
  .string()
  .trim()
  .min(1, { error: "Timezone is required" })
  .max(64, { error: "That is not a timezone" })
  .refine((value) => isValidTimeZone(value), { error: "Choose a timezone from the list" });

export const settingsSchema = z.object({
  notifyInterviews: z.boolean(),
  notifyAssessments: z.boolean(),
  notifyDeadlines: z.boolean(),
  notifyTasks: z.boolean(),
  reminderHours: reminderHoursSchema,
  defaultView: z.enum(VIEW_PREFERENCES),
  timezone: timezoneSchema,
});

/** What the form holds — `reminderHours` as the string a `<select>` carries. */
export type SettingsFormValues = z.input<typeof settingsSchema>;

/** What the mutation receives. */
export type SettingsPayload = z.output<typeof settingsSchema>;

/**
 * Stored columns → form values.
 *
 * `reminderHours` is stringified because the select's `value` is a string and an
 * uncontrolled-to-controlled mismatch is the usual symptom of forgetting. A
 * stored value outside `REMINDER_HOUR_OPTIONS` — reachable only by editing the
 * column directly — falls back to the column default rather than seeding the
 * select with an option it does not contain, which would render as blank and
 * silently rewrite the user's setting on the next save.
 */
export function toSettingsFormValues(user: {
  notifyInterviews: boolean;
  notifyAssessments: boolean;
  notifyDeadlines: boolean;
  notifyTasks: boolean;
  reminderHours: number;
  defaultView: "KANBAN" | "TABLE";
  timezone: string;
}): SettingsFormValues {
  const hours = isReminderHours(user.reminderHours) ? user.reminderHours : 24;

  return {
    notifyInterviews: user.notifyInterviews,
    notifyAssessments: user.notifyAssessments,
    notifyDeadlines: user.notifyDeadlines,
    notifyTasks: user.notifyTasks,
    reminderHours: String(hours),
    defaultView: user.defaultView,
    timezone: user.timezone,
  };
}
