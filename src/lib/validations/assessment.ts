import { z } from "zod";

import { ASSESSMENT_STATUSES, type AssessmentStatusValue } from "@/lib/constants/assessment";
import { toDateInputValue } from "@/lib/utils/date-only";
import { idSchema, optionalDateOnly, optionalText, requiredText } from "@/lib/validations/fields";
import { nullableWireDate, nullableWireUrl, wireDate } from "@/lib/validations/snapshot";
import { optionalUrl } from "@/lib/validations/url";

/**
 * Assessment validation (DESIGN.md §3, §6, §7 Phase 3).
 *
 * Not a factory, unlike interviews: a deadline is a **calendar day**, not an
 * instant. "Submit by the 14th" is the 14th wherever you read it, so it goes
 * through `optionalDateOnly` — written as midnight UTC, read back in UTC — and no
 * timezone is involved. `utils/date-only` has the full reasoning, and this is the
 * clearest case for it: a deadline that shifted by a day when the user travelled
 * would be a bug with real consequences.
 *
 * **A past deadline is valid**, per §8: "Deadline in the past — allowed, flagged
 * visually. People log things late." The flagging is the UI's job, not the
 * schema's.
 */

const ASSESSMENT_NAME_MAX = 150;
const ASSESSMENT_PROVIDER_MAX = 80;

/**
 * `score` is a **string**, as §3 insists: real scores look like "180/200", "85%"
 * and "Passed with distinction". An Int column would have forced every one of
 * those into a lie.
 */
const ASSESSMENT_SCORE_MAX = 80;

/** `@db.Text` in the schema; the cap is a product decision. */
const ASSESSMENT_NOTES_MAX = 10_000;

const assessmentFields = {
  name: requiredText("Name", ASSESSMENT_NAME_MAX),
  /** "HackerRank", "Codility", "Take-home" — who set it, not what it is called. */
  provider: optionalText("Provider", ASSESSMENT_PROVIDER_MAX),
  url: optionalUrl("Enter a valid link, for example hackerrank.com/test/abc123"),
  deadline: optionalDateOnly("deadline"),
  status: z.enum(ASSESSMENT_STATUSES).default("PENDING"),
  score: optionalText("Score", ASSESSMENT_SCORE_MAX),
  notes: optionalText("Notes", ASSESSMENT_NOTES_MAX),
};

/**
 * What `POST /api/assessments` accepts — the fields plus the application.
 *
 * Flat with `applicationId` in the body, per §6's table, and for the same reason
 * as interviews: an assessment is created both from an application's detail page
 * and from the assessments page, and on the second the application is a field
 * rather than context in the URL.
 */
export const createAssessmentSchema = z.object({
  applicationId: idSchema,
  ...assessmentFields,
});

/**
 * What `PATCH /api/assessments/:id` accepts.
 *
 * No `applicationId`: an assessment belongs to the role that set it, so moving one
 * is not expressible — the same reasoning as interviews.
 */
export const updateAssessmentSchema = z.object(assessmentFields);

/** What the form validates: the assessment's own fields, without the parent. */
export const assessmentFormSchema = z.object(assessmentFields);

/** What the form holds: every field a string, derived from the schema's input side. */
export type AssessmentFormValues = z.input<typeof assessmentFormSchema>;

export type AssessmentPayload = z.output<typeof updateAssessmentSchema>;

export type CreateAssessmentPayload = z.output<typeof createAssessmentSchema>;

/**
 * The form's starting state.
 *
 * A plain constant, not a function — unlike interviews and timeline entries,
 * nothing here is derived from the clock. An assessment's deadline is whatever the
 * email said, and guessing a date would be worse than an empty field the user
 * fills from the thing in front of them.
 */
export const EMPTY_ASSESSMENT_FORM: Required<AssessmentFormValues> = {
  name: "",
  provider: "",
  url: "",
  deadline: "",
  status: "PENDING",
  score: "",
  notes: "",
};

/**
 * A stored assessment, in the shape `toAssessmentFormValues` needs. Spelled out
 * rather than imported from Prisma, for the §4 rule that keeps Prisma inside
 * `src/server/`.
 */
export type AssessmentFormSource = {
  name: string;
  provider: string | null;
  url: string | null;
  deadline: Date | null;
  status: AssessmentStatusValue;
  score: string | null;
  notes: string | null;
};

/**
 * A stored assessment → the form's starting values.
 *
 * `toDateInputValue` reads the deadline back in **UTC**, the other half of the
 * date-only convention. Formatting in local time would show the 13th in the input
 * for a value stored as the 14th, and saving would then quietly move the deadline
 * a day earlier — once per edit, for every user west of Greenwich.
 */
export function toAssessmentFormValues(
  source: AssessmentFormSource,
): Required<AssessmentFormValues> {
  return {
    name: source.name,
    provider: source.provider ?? "",
    url: source.url ?? "",
    deadline: toDateInputValue(source.deadline),
    status: source.status,
    score: source.score ?? "",
    notes: source.notes ?? "",
  };
}

/**
 * The deleted-assessment snapshot that powers undo (DESIGN.md §8).
 *
 * `deadline` goes through `nullableWireDate` like every other instant in a
 * snapshot, and that is **not** a contradiction of this module's date-only
 * convention. The column holds midnight UTC on the chosen day; a snapshot's job
 * is to carry that exact instant back, not to re-interpret the day it stands
 * for. `optionalDateOnly` is for the form, where a user types "2026-03-14" and
 * something has to decide what instant that means — a decision a restore must
 * not make a second time.
 */
export const assessmentSnapshotSchema = z.object({
  id: idSchema,
  /*
   * Present even though `updateAssessmentSchema` refuses it: a restore has to
   * know which application to re-attach the row to. `restoreAssessment`
   * re-checks that the application is this user's, because this value has been
   * through the browser.
   */
  applicationId: idSchema,
  name: z.string().min(1).max(ASSESSMENT_NAME_MAX),
  provider: z.string().max(ASSESSMENT_PROVIDER_MAX).nullable(),
  url: nullableWireUrl,
  deadline: nullableWireDate,
  status: z.enum(ASSESSMENT_STATUSES),
  score: z.string().max(ASSESSMENT_SCORE_MAX).nullable(),
  notes: z.string().max(ASSESSMENT_NOTES_MAX).nullable(),
  createdAt: wireDate,
});

export type AssessmentSnapshot = z.output<typeof assessmentSnapshotSchema>;

/** What `POST /api/assessments/:id/restore` accepts. */
export const restoreAssessmentSchema = z.object({ snapshot: assessmentSnapshotSchema });
