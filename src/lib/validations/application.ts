import { z } from "zod";

import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
  type ApplicationSourceValue,
  type ApplicationStatusValue,
  type CurrencyValue,
  type EmploymentTypeValue,
  type PriorityValue,
} from "@/lib/constants/application";
import { EVENT_TYPES } from "@/lib/constants/event";
import { WORK_MODES, type WorkModeValue } from "@/lib/constants/work-mode";
import { toDateInputValue } from "@/lib/utils/date-only";
import { companyNameSchema } from "@/lib/validations/company";
import {
  isFutureDateOnly,
  optionalDateOnly,
  optionalEnum,
  optionalId,
  optionalText,
  requiredText,
} from "@/lib/validations/fields";
import { nullableWireDate, nullableWireUrl, wireDate } from "@/lib/validations/snapshot";
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
 * A money amount as typed. "12,00,000" and "1 200 000" are what people
 * actually enter, so separators are stripped before the digits are checked
 * rather than being rejected as invalid input.
 *
 * The only field builder still local to this module: salary is the one shape no
 * other entity has. The generic four live in `validations/fields`, shared with
 * the six entities Phase 3 adds.
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
   * Which resume version was sent (Phase 4).
   *
   * A real column on `Application`, unlike the recruiter block below — the
   * relation is `onDelete: Restrict` (§3), so an application cannot be left
   * pointing at a hard-deleted resume. It never is: deleting a resume is a soft
   * delete, which is the whole reason this field can be trusted to still answer
   * "which version got the interview" a year later.
   *
   * Validated for shape only. Whether the id is a resume, is this user's, and is
   * still available is decided by `createApplication` and `updateApplication`,
   * which can query — and which disagree on purpose about the deleted case. See
   * `resolveResumeId`.
   */
  resumeId: optionalId("resume"),

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
  if (value.appliedAt && isFutureDateOnly(value.appliedAt)) {
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

/**
 * What `PATCH /api/applications/:id` accepts: every editable field, plus the
 * same duplicate acknowledgement the create endpoint takes.
 *
 * **`status` is omitted, and that is the whole shape of this schema.** It has
 * its own endpoint because changing it writes a timeline event and maintains
 * `appliedAt` and `firstResponseAt` in one transaction (see `updateStatusSchema`
 * above). Accepting it here would give the client a second route to the same
 * column that skips all of that — so the field is not merely ignored by the
 * mutation, it cannot be expressed in the request at all.
 *
 * Everything else is the create schema unchanged, down to the cross-field rules,
 * which is why `applicationCrossFieldRules` was extracted in the first place. A
 * second copy of "max salary cannot be below min" is a second copy that drifts.
 */
export const updateApplicationRequestSchema = applicationObject
  .omit({ status: true })
  .extend({
    /**
     * "I know this now looks like another application — save it anyway."
     *
     * Only ever asked when this edit *changed* the company or the job title
     * into something that collides. See `updateApplication`.
     */
    acknowledgeDuplicate: z.boolean().optional().default(false),
  })
  .superRefine(applicationCrossFieldRules);

/** What the update mutation receives: numbers, Dates, nulls, and the flag. */
export type UpdateApplicationPayload = z.output<typeof updateApplicationRequestSchema>;

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
  resumeId: "",
  recruiterName: "",
  recruiterRole: "",
  recruiterEmail: "",
  recruiterPhone: "",
};

/**
 * A stored application, in the shape `toApplicationFormValues` needs.
 *
 * Spelled out rather than imported from Prisma, for the §4 rule that keeps
 * Prisma inside `src/server/`. The structural match is checked by the compiler
 * at the one call site, which is the edit page.
 */
export type ApplicationFormSource = {
  companyName: string;
  jobTitle: string;
  jobUrl: string | null;
  location: string | null;
  workMode: WorkModeValue | null;
  employmentType: EmploymentTypeValue | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  status: ApplicationStatusValue;
  priority: PriorityValue;
  source: ApplicationSourceValue | null;
  appliedAt: Date | null;
  deadline: Date | null;
  jobDescription: string | null;
  /** The resume this application was sent with, or null. */
  resumeId: string | null;
  /** The contact the recruiter block edits, or null when none is linked. */
  recruiter: {
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

/**
 * A stored application → the form's starting values.
 *
 * The inverse of what the schema does on submit, and it has to be exact: the
 * form's input side is all strings (see the header), so every null becomes `""`
 * and every number and date becomes the text its input expects. Returning
 * `Required<ApplicationFormValues>` is what makes that the compiler's problem —
 * add a field to the schema and this fails to build until it is mapped, the same
 * guarantee `EMPTY_APPLICATION_FORM` gives the create page.
 *
 * Dates go through `toDateInputValue`, which reads them back in UTC — the other
 * half of the date-only convention. Formatting a deadline in local time here
 * would show the 13th in the input for a value stored as the 14th, and saving
 * would then quietly move it.
 */
export function toApplicationFormValues(
  source: ApplicationFormSource,
): Required<ApplicationFormValues> {
  return {
    companyName: source.companyName,
    jobTitle: source.jobTitle,
    jobUrl: source.jobUrl ?? "",
    location: source.location ?? "",
    workMode: source.workMode ?? "",
    employmentType: source.employmentType ?? "",
    salaryMin: source.salaryMin === null ? "" : String(source.salaryMin),
    salaryMax: source.salaryMax === null ? "" : String(source.salaryMax),
    /*
     * The column is nullable text with an `INR` default, while the form offers a
     * fixed list. A row holding anything outside that list — from a seed, a
     * backup, or a future currency added and then removed — would select nothing
     * and submit as invalid, so it falls back to the column default rather than
     * rendering an empty control the user cannot fix.
     */
    currency: isOfferedCurrency(source.currency) ? source.currency : "INR",
    status: source.status,
    priority: source.priority,
    source: source.source ?? "",
    appliedAt: toDateInputValue(source.appliedAt),
    deadline: toDateInputValue(source.deadline),
    jobDescription: source.jobDescription ?? "",
    resumeId: source.resumeId ?? "",
    recruiterName: source.recruiter?.name ?? "",
    recruiterRole: source.recruiter?.role ?? "",
    recruiterEmail: source.recruiter?.email ?? "",
    recruiterPhone: source.recruiter?.phone ?? "",
  };
}

function isOfferedCurrency(value: string | null): value is CurrencyValue {
  return value !== null && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * The deleted-application snapshot that powers undo (DESIGN.md §8).
 *
 * Delete is real: the row and its children are gone the moment the request
 * returns. What comes back is this — everything needed to put them back —
 * which the client holds for the life of the toast and posts to
 * `/api/applications/:id/restore` if the user clicks Undo.
 *
 * **It crosses the trust boundary twice**, server → browser → server, so it is
 * validated on the way back in like any other request body and nothing in it is
 * trusted for authorization. `userId` is deliberately *not* a field: the restore
 * takes identity from the session, exactly as §4 requires, so a hand-crafted
 * snapshot cannot plant a row in someone else's account. The mutation separately
 * re-checks that the company and every contact id belong to the caller.
 *
 * Ids are preserved rather than regenerated. A restored application is the same
 * application — the link that was open in another tab still works, and the
 * timeline keeps the entries it had rather than being re-synthesised with
 * today's dates.
 */

/**
 * The date and URL field builders live in `validations/snapshot` now, shared
 * with the three Phase 3 snapshots that arrived after this one. See that module
 * for why a nullable date is a union rather than `.nullable()`, and why a URL
 * has to be re-checked on the way back in.
 */

/**
 * Bounds on the child arrays. Not a product limit — a request-size one. These
 * arrive from the browser, and an unbounded array is an invitation to post ten
 * thousand events in one body.
 */
const MAX_SNAPSHOT_EVENTS = 500;
const MAX_SNAPSHOT_CONTACTS = 100;

export const applicationSnapshotSchema = z.object({
  application: z.object({
    id: z.string().min(1).max(64),
    companyId: z.string().min(1).max(64),
    jobTitle: z.string().min(1),
    // `nullableWireUrl`, not `z.string().nullable()`: the detail header renders
    // this in an `href`, and a snapshot is the only way a string that never went
    // through `optionalUrl` could get into the column. See `validations/snapshot`.
    jobUrl: nullableWireUrl,
    location: z.string().nullable(),
    workMode: z.enum(WORK_MODES).nullable(),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
    salaryMin: z.number().int().nullable(),
    salaryMax: z.number().int().nullable(),
    currency: z.string().nullable(),
    status: z.enum(APPLICATION_STATUSES),
    priority: z.enum(PRIORITIES),
    source: z.enum(APPLICATION_SOURCES).nullable(),
    savedAt: wireDate,
    appliedAt: nullableWireDate,
    deadline: nullableWireDate,
    jobDescription: z.string().nullable(),
    resumeId: z.string().max(64).nullable(),
    firstResponseAt: nullableWireDate,
    createdAt: wireDate,
  }),
  events: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        type: z.enum(EVENT_TYPES),
        title: z.string(),
        description: z.string().nullable(),
        occurredAt: wireDate,
        isAutomatic: z.boolean(),
        createdAt: wireDate,
      }),
    )
    .max(MAX_SNAPSHOT_EVENTS),
  contacts: z
    .array(
      z.object({
        contactId: z.string().min(1).max(64),
        role: z.string().nullable(),
        createdAt: wireDate,
      }),
    )
    .max(MAX_SNAPSHOT_CONTACTS),
});

export type ApplicationSnapshot = z.output<typeof applicationSnapshotSchema>;

/** What `POST /api/applications/:id/restore` accepts. */
export const restoreApplicationSchema = z.object({ snapshot: applicationSnapshotSchema });

/**
 * Reads the snapshot out of a delete response.
 *
 * Strict rather than tolerant, unlike `createdApplicationIdSchema`: a snapshot
 * that cannot be parsed means undo is not available, and the client needs to
 * know that in order to say so rather than offering a button that will fail.
 */
export const deletedApplicationSchema = z.object({
  data: z.object({
    jobTitle: z.string(),
    companyName: z.string(),
    snapshot: applicationSnapshotSchema,
  }),
});

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

/**
 * Reads the new application's id out of a create response, so the form can send
 * the user to its detail page.
 *
 * Tolerant for the same reason as `applicationWarningsSchema`, and it matters
 * more here: the row has already been written by the time this runs, so a body
 * that cannot be parsed must not turn a successful save into an error. Null is
 * the caller's cue to fall back to the list — a worse destination, not a
 * failure.
 */
export const createdApplicationIdSchema = z
  .object({ data: z.object({ id: z.string().min(1) }) })
  .catch({ data: { id: "" } })
  .transform((body) => body.data.id || null);
