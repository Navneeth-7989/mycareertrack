/**
 * Display metadata and ordering for the application enums.
 *
 * Every list is written out as string literals rather than imported from
 * `@prisma/client`, for the reason given in `constants/work-mode.ts`: that
 * import would pull Prisma outside `src/server/` and break the one-import-site
 * rule in DESIGN.md §4. They stay string literals, so Prisma's generated enum
 * types still accept them at the mutation boundary, and the test suite asserts
 * each list against `schema.prisma` — which is what stops them drifting.
 */

/**
 * Pipeline order, not alphabetical and not schema order. This is the sequence a
 * real search moves through, and it is what orders the status dropdown, the
 * Kanban columns and every status filter.
 *
 * The three terminal states sit at the end: an application that was accepted,
 * rejected or withdrawn has left the pipeline, and putting REJECTED between
 * OFFER and ACCEPTED — where the schema happens to declare it — would read as a
 * step on the way to an offer.
 */
export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatusValue, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  SCREENING: "Screening",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/**
 * What each status means, shown under the status field on the form. Worth the
 * words: "Screening" and "Assessment" are not self-evident, and a user guessing
 * between them produces analytics nobody can trust.
 */
export const APPLICATION_STATUS_HINTS: Record<ApplicationStatusValue, string> = {
  SAVED: "Found it, not applied yet",
  APPLIED: "Application submitted",
  SCREENING: "Recruiter call or resume screen",
  ASSESSMENT: "Online test or take-home",
  INTERVIEW: "Interview scheduled or done",
  OFFER: "Offer received",
  ACCEPTED: "Offer accepted",
  REJECTED: "Not moving forward",
  WITHDRAWN: "You pulled out",
};

export const EMPLOYMENT_TYPES = ["INTERNSHIP", "FULL_TIME", "PART_TIME", "CONTRACT"] as const;

export type EmploymentTypeValue = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentTypeValue, string> = {
  INTERNSHIP: "Internship",
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
};

/** Low to high, so the dropdown reads as a scale rather than a set. */
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type PriorityValue = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<PriorityValue, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * Ordered by how often a student actually uses each one, not alphabetically —
 * LinkedIn and the company's own careers page are most of the list in practice,
 * and "Other" belongs last wherever it appears.
 */
export const APPLICATION_SOURCES = [
  "LINKEDIN",
  "COMPANY_WEBSITE",
  "REFERRAL",
  "COLLEGE",
  "INDEED",
  "OTHER",
] as const;

export type ApplicationSourceValue = (typeof APPLICATION_SOURCES)[number];

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSourceValue, string> = {
  LINKEDIN: "LinkedIn",
  COMPANY_WEBSITE: "Company website",
  REFERRAL: "Referral",
  COLLEGE: "College / campus",
  INDEED: "Indeed",
  OTHER: "Other",
};

/**
 * Whether a status means the application was actually submitted.
 *
 * `appliedAt IS NOT NULL` is the denominator for every rate in §3, so this
 * predicate decides what the rates are measured against. Only SAVED is not
 * submitted — including WITHDRAWN, because withdrawing is something you do to
 * an application you sent. A saved role you never applied to and then stopped
 * caring about is deleted, not withdrawn.
 */
export function isSubmittedStatus(status: ApplicationStatusValue): boolean {
  return status !== "SAVED";
}

/**
 * Whether a status means the company replied — the "response" of §3's metric
 * definitions, where a response is *any* reply, positive or negative.
 *
 * Defined here rather than inside the mutation that writes `firstResponseAt`
 * because two code paths stamp that column — creating an application already
 * past APPLIED, and the status-change endpoint — and two copies of this rule
 * would eventually disagree. The analytics page reads the column, so it never
 * re-derives this.
 *
 * REJECTED counts: a rejection is a reply, and treating it as silence would
 * flatter the response rate. WITHDRAWN does not: nothing was heard, the user
 * simply left.
 */
export function isResponseStatus(status: ApplicationStatusValue): boolean {
  const RESPONDED: readonly ApplicationStatusValue[] = [
    "SCREENING",
    "ASSESSMENT",
    "INTERVIEW",
    "OFFER",
    "ACCEPTED",
    "REJECTED",
  ];

  return RESPONDED.includes(status);
}

/** Currency codes offered on the form. The column default is INR (§9). */
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] as const;

export type CurrencyValue = (typeof CURRENCIES)[number];
