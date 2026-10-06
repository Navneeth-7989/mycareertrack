import { z } from "zod";

import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
} from "@/lib/constants/application";
import { WORK_MODES } from "@/lib/constants/work-mode";
import { isDateOnlyString, parseDateOnly } from "@/lib/utils/date-only";
import { companyNameSchema } from "@/lib/validations/company";
import { optionalUrl } from "@/lib/validations/url";

/**
 * Application validation, shared by the form and the API (DESIGN.md §4, rule 4).
 *
 * **The input side is all strings**, like `validations/profile`, because that is
 * what an `<input>` holds. The form posts its raw values and the server parses
 * them with this same schema — the contract that the onboarding wizard learned
 * the hard way. Posting the *parsed* payload instead sends a number where the
 * schema expects a numeric string and a Date where it expects "2026-03-14", and
 * the server rejects its own output. `tests/lib/application-validations.test.ts`
 * has a tripwire asserting exactly that.
 *
 * Almost everything is optional on purpose. §1 is explicit about it: saving a
 * posting you found 30 seconds ago with nothing but a company and a title is the
 * most common action in the product, and requiring more would kill it. Company
 * and job title are the only required fields.
 */

const JOB_TITLE_MAX = 150;
const LOCATION_MAX = 120;

/** @db.Text in the schema; the cap is the one §8's edge-case table asks for. */
const JOB_DESCRIPTION_MAX = 50_000;

const CONTACT_NAME_MAX = 120;
const CONTACT_ROLE_MAX = 80;
const CONTACT_PHONE_MAX = 30;

/**
 * Comfortably inside a Postgres `Int` (2,147,483,647) while still accepting a
 * salary nobody will ever be offered. The column is Int rather than BigInt
 * because the alternative was storing paise.
 */
const SALARY_MAX = 999_999_999;

/**
 * Tolerance on "applied on" dates in the future.
 *
 * One day, not zero: the value is stored as midnight UTC on the chosen day
 * (see `utils/date-only`), so a user in Asia/Kolkata picking "today" late in
 * the evening produces an instant that is already tomorrow in UTC. Zero
 * tolerance would reject today's date for everyone east of Greenwich.
 */
const APPLIED_AT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .max(max, { error: `${label} must be at most ${max} characters` });
}

/** Blank becomes null, never "" — the reasoning is in `validations/profile`. */
function optionalText(label: string, max: number) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value.length <= max, {
      error: `${label} must be at most ${max} characters`,
    })
    .transform((value) => (value === "" ? null : value));
}

/**
 * An enum field the user may leave alone. A `<select>` with no choice made
 * submits "", and absent means the same thing — both become null rather than
 * being rejected or stored as an empty string in an enum column.
 */
function optionalEnum<const T extends readonly [string, ...string[]]>(values: T, label: string) {
  return z
    .union([z.enum(values), z.literal("")])
    .optional()
    .refine((value) => value === undefined || value === "" || values.includes(value), {
      error: `Choose a valid ${label}`,
    })
    .transform((value) => (value === undefined || value === "" ? null : value));
}

/**
 * A money amount as typed. "12,00,000" and "1 200 000" are what people
 * actually enter, so separators are stripped before the digits are checked
 * rather than being rejected as invalid input.
 */
function optionalSalary(label: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? "").replace(/[,\s]/g, ""))
    .refine((value) => value === "" || /^\d+$/.test(value), {
      error: `${label} must be a whole number`,
    })
    .refine((value) => value === "" || Number(value) <= SALARY_MAX, {
      error: `${label} is larger than this field can store`,
    })
    .transform((value) => (value === "" ? null : Number(value)));
}

/**
 * A calendar day. Past dates are accepted everywhere this is used — §8 is
 * explicit that a deadline in the past is allowed and merely flagged, because
 * people log things late.
 */
function optionalDateOnly(label: string) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value === "" || isDateOnlyString(value), {
      error: `Enter a valid ${label}`,
    })
    .transform((value) => (value === "" ? null : parseDateOnly(value)));
}

const recruiterEmail = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim().toLowerCase())
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    error: "Enter a valid email address",
  })
  .transform((value) => (value === "" ? null : value));

/**
 * Deliberately loose. Real phone numbers arrive as "+91 98765 43210",
 * "098765-43210" and "(080) 4123 4567", and a strict pattern would reject more
 * genuine numbers than bad ones. The characters allowed are the ones a phone
 * number can contain; the shape is not our business.
 */
const recruiterPhone = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim())
  .refine((value) => value.length <= CONTACT_PHONE_MAX, {
    error: `Phone must be at most ${CONTACT_PHONE_MAX} characters`,
  })
  .refine((value) => value === "" || /^[+()\d\s.-]{6,}$/.test(value), {
    error: "Enter a valid phone number",
  })
  .transform((value) => (value === "" ? null : value));

const applicationFields = {
  companyName: companyNameSchema,
  jobTitle: requiredText("Job title", JOB_TITLE_MAX),
  jobUrl: optionalUrl("Enter a valid job link, for example careers.google.com/jobs/123"),
  location: optionalText("Location", LOCATION_MAX),

  workMode: optionalEnum(WORK_MODES, "work mode"),
  employmentType: optionalEnum(EMPLOYMENT_TYPES, "employment type"),

  salaryMin: optionalSalary("Minimum salary"),
  salaryMax: optionalSalary("Maximum salary"),
  currency: z.enum(CURRENCIES).default("INR"),

  status: z.enum(APPLICATION_STATUSES).default("SAVED"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  source: optionalEnum(APPLICATION_SOURCES, "source"),

  appliedAt: optionalDateOnly("date"),
  deadline: optionalDateOnly("deadline"),

  jobDescription: optionalText("Job description", JOB_DESCRIPTION_MAX),

  /**
   * The recruiter block. These are not columns on `Application` — they feed
   * `contact-resolver.ts`, which creates or matches a `Contact` and links it
   * (§9). A name with neither an email nor a phone creates nothing: §8 is
   * explicit that a bare name is not a contact.
   */
  recruiterName: optionalText("Recruiter name", CONTACT_NAME_MAX),
  recruiterRole: optionalText("Recruiter role", CONTACT_ROLE_MAX),
  recruiterEmail,
  recruiterPhone,
};

/**
 * Cross-field rules, applied after every field has parsed.
 *
 * Standalone so the edit schema in a later step applies the identical rules
 * rather than a second copy of them. `ctx.addIssue` with an explicit `path` is
 * what puts each complaint on the field the user has to fix — an issue with no
 * path renders as a form-level message, which is the wrong place to say "max is
 * below min".
 */
export function applicationCrossFieldRules(
  value: { salaryMin: number | null; salaryMax: number | null; appliedAt: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (value.salaryMin !== null && value.salaryMax !== null && value.salaryMax < value.salaryMin) {
    ctx.addIssue({
      code: "custom",
      path: ["salaryMax"],
      message: "Maximum salary cannot be below the minimum",
    });
  }

  // A date you applied on cannot be in the future. Unlike a past deadline,
  // which is normal, this is always a typo — and it would distort the
  // applications-over-time chart in Phase 4 rather than just looking odd.
  if (value.appliedAt && value.appliedAt.getTime() - Date.now() > APPLIED_AT_FUTURE_TOLERANCE_MS) {
    ctx.addIssue({
      code: "custom",
      path: ["appliedAt"],
      message: "The date applied cannot be in the future",
    });
  }
}

const applicationObject = z.object(applicationFields);

/** What the form validates: the fields a user can fill in, and nothing else. */
export const createApplicationSchema = applicationObject.superRefine(applicationCrossFieldRules);

/**
 * What `POST /api/applications` accepts: the form's fields plus the
 * acknowledgement.
 *
 * Two schemas rather than one optional field in a single schema, because the
 * flag is not a form value. It has no input, it is appended at submit time
 * — the same arrangement as `timezone` in the onboarding wizard — and keeping
 * it out of `createApplicationSchema` is what lets `EMPTY_APPLICATION_FORM`
 * stay exactly "every field the form holds", enforced by the compiler.
 *
 * A real boolean on the wire, not a string: nothing types this, so there is no
 * `<input>` whose value it has to match.
 */
export const createApplicationRequestSchema = applicationObject
  .extend({
    /**
     * "I know this looks like a duplicate — save it anyway."
     *
     * Defaults to false, so a client that has never heard of the flag gets the
     * confirmation rather than silently bypassing it.
     */
    acknowledgeDuplicate: z.boolean().optional().default(false),
  })
  .superRefine(applicationCrossFieldRules);

/** What the form holds: every field a string, as inputs produce. */
export type ApplicationFormValues = z.input<typeof createApplicationSchema>;

/**
 * What the form's resolver produces — no acknowledgement flag, because the
 * form has no such field.
 *
 * Distinct from `CreateApplicationPayload` on purpose. React Hook Form's third
 * generic is the resolver's output, so the two must agree exactly: using the
 * request payload there claims the resolver returns a field the form schema has
 * never heard of.
 */
export type ApplicationFormPayload = z.output<typeof createApplicationSchema>;

/** What the mutation receives: numbers, Dates, nulls for blank optionals, and the flag. */
export type CreateApplicationPayload = z.output<typeof createApplicationRequestSchema>;

/**
 * The form's starting state. Exported so the create page and the edit page in a
 * later step cannot disagree about what "empty" means — and so a field added to
 * the schema without a default here fails the build rather than rendering as an
 * uncontrolled input.
 */
export const EMPTY_APPLICATION_FORM: Required<ApplicationFormValues> = {
  companyName: "",
  jobTitle: "",
  jobUrl: "",
  location: "",
  workMode: "",
  employmentType: "",
  salaryMin: "",
  salaryMax: "",
  currency: "INR",
  status: "SAVED",
  priority: "MEDIUM",
  source: "",
  appliedAt: "",
  deadline: "",
  jobDescription: "",
  recruiterName: "",
  recruiterRole: "",
  recruiterEmail: "",
  recruiterPhone: "",
};

/**
 * `PATCH /api/applications/:id/status` — the board's and the detail page's
 * status control (§6).
 *
 * Its own endpoint and its own schema rather than a field on the general
 * update, because it is not a field edit: it writes a timeline event and
 * maintains `appliedAt` and `firstResponseAt` in the same transaction. A status
 * arriving through a partial update would skip all of that.
 */
export const updateStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
});

/** The duplicate advisory returned alongside a created application (§6). */
export const APPLICATION_WARNING_CODES = ["POSSIBLE_DUPLICATE"] as const;

export const APPLICATION_WARNING_LEVELS = ["info", "warning"] as const;

export const applicationWarningSchema = z.object({
  code: z.enum(APPLICATION_WARNING_CODES),
  level: z.enum(APPLICATION_WARNING_LEVELS),
  message: z.string(),
  applicationIds: z.array(z.string()),
});

/** Derived from the schema, so the server's shape and the client's parser cannot drift. */
export type ApplicationWarning = z.output<typeof applicationWarningSchema>;

export type ApplicationWarningLevel = ApplicationWarning["level"];

/**
 * Reads the advisories out of a create response.
 *
 * Tolerant by design, on both axes. `warnings` is absent when there are none
 * (see `createdWithWarnings`), and the whole body could be a proxy's HTML error
 * page rather than ours — in which case the create still succeeded, and failing
 * to show an advisory is not worth throwing in a success path. Both cases
 * resolve to an empty list.
 */
export const applicationWarningsSchema = z
  .object({ warnings: z.array(applicationWarningSchema).optional() })
  .catch({ warnings: [] })
  .transform((body) => body.warnings ?? []);
