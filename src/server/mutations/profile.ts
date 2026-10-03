import type { OnboardingPayload } from "@/lib/validations/profile";

import { prisma } from "../db";

/**
 * Writes the onboarding wizard's answers and opens the app up.
 *
 * Two tables, one transaction. `name` and `timezone` live on `User` — the row
 * Auth.js owns — while everything else lives on `Profile` (DESIGN.md §3). If
 * the profile write succeeded and the flag did not, the user would be sent
 * back through a wizard they had already filled in; if the flag was set and
 * the profile write failed, they would reach a dashboard with no profile
 * behind it. Neither half is useful alone.
 *
 * `upsert` rather than `create` because this is also the path a user takes if
 * they reload mid-wizard and submit again, and because the design allows the
 * same fields to be edited later from settings.
 */
export async function completeOnboarding(
  userId: string,
  payload: OnboardingPayload,
): Promise<void> {
  const {
    name,
    timezone,
    university,
    degree,
    fieldOfStudy,
    graduationYear,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
    targetRoles,
    skills,
    preferredLocations,
    preferredWorkModes,
  } = payload;

  const profileFields = {
    university,
    degree,
    fieldOfStudy,
    graduationYear,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
    targetRoles,
    skills,
    preferredLocations,
    preferredWorkModes,
  };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { name, timezone, onboardingCompleted: true },
    }),

    prisma.profile.upsert({
      where: { userId },
      create: { userId, ...profileFields },
      update: profileFields,
    }),
  ]);
}
