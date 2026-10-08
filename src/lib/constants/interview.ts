/**
 * Display metadata for `InterviewType` and `InterviewResult`.
 *
 * Written out as string literals rather than imported from `@prisma/client`, for
 * the reason given in `constants/application`: that import would pull Prisma
 * outside `src/server/` and break the one-import-site rule in DESIGN.md §4. The
 * test suite asserts both lists against `schema.prisma`, which is what stops them
 * drifting.
 */

/**
 * Ordered by where a round falls in a real process, not alphabetically and not
 * in schema order: a recruiter screen comes first, the hiring manager near the
 * end, and "Other" last wherever it appears.
 */
export const INTERVIEW_TYPES = [
  "HR",
  "TECHNICAL",
  "SYSTEM_DESIGN",
  "BEHAVIORAL",
  "MANAGERIAL",
  "OTHER",
] as const;

export type InterviewTypeValue = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABELS: Record<InterviewTypeValue, string> = {
  HR: "HR / recruiter",
  TECHNICAL: "Technical",
  SYSTEM_DESIGN: "System design",
  BEHAVIORAL: "Behavioural",
  MANAGERIAL: "Hiring manager",
  OTHER: "Other",
};

/**
 * `PENDING` first, because it is the default and the state every interview
 * starts in. The rest are the ways a round can end.
 */
export const INTERVIEW_RESULTS = ["PENDING", "PASSED", "FAILED", "CANCELLED"] as const;

export type InterviewResultValue = (typeof INTERVIEW_RESULTS)[number];

/**
 * "Not known yet" rather than "Pending", because this label appears on a
 * *scheduled* interview where "pending" reads as a status the user is supposed
 * to act on. "Didn't pass" rather than "Failed" for the same reason the status
 * list says "Not moving forward" — the product should not be blunter about a
 * rejection than it has to be.
 */
export const INTERVIEW_RESULT_LABELS: Record<InterviewResultValue, string> = {
  PENDING: "Not known yet",
  PASSED: "Passed",
  FAILED: "Didn't pass",
  CANCELLED: "Cancelled",
};

/**
 * Which results mean the round is finished.
 *
 * `CANCELLED` counts as settled even though nothing was assessed: a cancelled
 * round is not waiting on anything, so it does not belong in the "awaiting
 * result" bucket the UI uses to prompt the user.
 */
export function isSettledResult(result: InterviewResultValue): boolean {
  return result !== "PENDING";
}

/**
 * How long a round is assumed to run when nobody says.
 *
 * Only used to prefill the duration field on a new interview — `endsAt` stays
 * nullable in the database and a blank duration stores null rather than this.
 * An hour is the modal answer for every type in the list above.
 */
export const DEFAULT_INTERVIEW_MINUTES = 60;

/**
 * Bounds on the duration field. A round shorter than a minute is a typo, and one
 * longer than a day is too — the longest real on-site is a working day, and
 * `endsAt` is derived from this, so an absurd value would put the end of one
 * interview past the start of the next week's.
 */
export const MIN_INTERVIEW_MINUTES = 1;
export const MAX_INTERVIEW_MINUTES = 24 * 60;
