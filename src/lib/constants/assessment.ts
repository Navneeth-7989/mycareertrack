/**
 * Display metadata for `AssessmentStatus`.
 *
 * Written out as string literals rather than imported from `@prisma/client`, for
 * the reason given in `constants/application`: that import would pull Prisma
 * outside `src/server/` and break the one-import-site rule in DESIGN.md §4. The
 * test suite asserts the list against `schema.prisma`.
 */

/**
 * Ordered as an assessment actually moves: not done, done, then the two ways it
 * can be judged. `COMPLETED` sits before `PASSED`/`FAILED` because submitting the
 * test and hearing the result are separate events, often weeks apart — which is
 * the whole reason the enum has three terminal-ish states rather than two.
 */
export const ASSESSMENT_STATUSES = ["PENDING", "COMPLETED", "PASSED", "FAILED"] as const;

export type AssessmentStatusValue = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatusValue, string> = {
  PENDING: "Not done yet",
  COMPLETED: "Submitted",
  PASSED: "Passed",
  FAILED: "Didn't pass",
};

/**
 * Worth the words, for the same reason as `APPLICATION_STATUS_HINTS`: "Completed"
 * against "Passed" is genuinely ambiguous — one is about whether you did it, the
 * other about whether it counted — and a user guessing between them produces
 * analytics nobody can trust.
 */
export const ASSESSMENT_STATUS_HINTS: Record<AssessmentStatusValue, string> = {
  PENDING: "Still to take",
  COMPLETED: "Submitted, waiting on the result",
  PASSED: "Cleared it",
  FAILED: "Did not clear it",
};

/**
 * Whether an assessment is still something the user has to *do*.
 *
 * This is the predicate the deadline surfacing in §7 turns on: a deadline only
 * matters while the test is untaken. A passed assessment whose deadline was last
 * Tuesday is not overdue, it is finished, and showing it in red would train the
 * user to ignore the colour.
 */
export function isOutstanding(status: AssessmentStatusValue): boolean {
  return status === "PENDING";
}
