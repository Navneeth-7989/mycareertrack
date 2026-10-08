import { Prisma } from "@prisma/client";

import type { SettingsPayload } from "@/lib/validations/settings";

import { prisma } from "../db";

/**
 * Account settings — the five `User` columns the settings page owns.
 *
 * Preferences are columns rather than a 1:1 `NotificationPreference` table
 * (§10.1, a locked decision), which is why this is a plain `update` with no join
 * and no row that could be missing.
 */

const settingsSelect = {
  notifyInterviews: true,
  notifyAssessments: true,
  notifyDeadlines: true,
  notifyTasks: true,
  reminderHours: true,
  defaultView: true,
  timezone: true,
} satisfies Prisma.UserSelect;

export type UserSettings = Prisma.UserGetPayload<{ select: typeof settingsSelect }>;

/**
 * Writes all seven fields at once.
 *
 * **`update` by bare `id` is correct here, and it is the one place in the app
 * where it is.** §4's rule — never `findUnique({ where: { id } })`, always
 * `findFirst({ where: { id, userId } })` — exists because a row id arriving in
 * a request could belong to anyone. This id does not arrive in a request: it
 * comes from `requireApiUser()`, which is the session. There is no id in the
 * body or the path to get wrong, so there is nothing for an ownership clause to
 * add.
 *
 * The whole object is written rather than a diff. Every field is present in the
 * form, so a partial update would mean the client deciding what changed — and a
 * checkbox the user unticked is indistinguishable from one they never sent.
 *
 * **Changing `timezone` silently re-renders every interview in the app**, which
 * is the point: times are formatted from `User.timezone` on the server (§4), so
 * the next page load is already correct with nothing to migrate. It changes no
 * stored instant — an interview at 3pm in Bangalore is the same moment read from
 * anywhere, which is exactly why it is stored as one.
 *
 * **Changing `reminderHours` does not retroactively rewrite notifications.**
 * `triggerAt` on an existing row keeps the window it was generated under until
 * the next generation pass sees that entity again and the upsert recomputes it.
 * Widening the window brings new items in on the very next page load, which is
 * the direction that matters; narrowing it leaves already-generated reminders
 * in place rather than deleting things the user has been told about.
 */
export async function updateSettings(
  userId: string,
  payload: SettingsPayload,
): Promise<UserSettings> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      notifyInterviews: payload.notifyInterviews,
      notifyAssessments: payload.notifyAssessments,
      notifyDeadlines: payload.notifyDeadlines,
      notifyTasks: payload.notifyTasks,
      reminderHours: payload.reminderHours,
      defaultView: payload.defaultView,
      timezone: payload.timezone,
    },
    select: settingsSelect,
  });
}
