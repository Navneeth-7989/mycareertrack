import { z } from "zod";

import { PRIORITIES, type PriorityValue } from "@/lib/constants/application";
import { toDateInputValue } from "@/lib/utils/date-only";
import { idSchema, optionalDateOnly, optionalText, requiredText } from "@/lib/validations/fields";
import { nullableWireDate, wireDate } from "@/lib/validations/snapshot";

/**
 * Task validation (DESIGN.md §3, §6, §7 Phase 3).
 *
 * Like assessments and unlike interviews, this is not a factory: a due date is a
 * **calendar day**, so it goes through `optionalDateOnly` and no timezone is
 * involved. "Chase the recruiter by Friday" means Friday wherever you read it.
 *
 * **`applicationId` is optional, and that is the one thing that makes tasks
 * structurally different from every other child in this phase.** §3 has it nullable
 * with the comment "standalone tasks are allowed", and the reason is that a job
 * search contains work that belongs to no single application — update the resume,
 * ask a senior for a referral, practise system design. Forcing every task under an
 * application would mean inventing a fake parent for a third of them.
 */

const TASK_TITLE_MAX = 200;

/** `@db.Text` in the schema; the cap is a product decision. */
const TASK_DESCRIPTION_MAX = 10_000;

const taskFields = {
  title: requiredText("Title", TASK_TITLE_MAX),
  description: optionalText("Description", TASK_DESCRIPTION_MAX),
  /**
   * Optional, and a past date is accepted. A task with no due date is a someday
   * item, which is a legitimate thing to write down and the reason the "Upcoming"
   * bucket holds both. A task already overdue when it is written down is normal
   * too — people add the thing they have just realised they are late on.
   */
  dueDate: optionalDateOnly("due date"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
};

/**
 * What `POST /api/tasks` accepts.
 *
 * `applicationId` is optional here in the Zod sense as well as the schema's: an
 * empty string becomes null, so a form that renders "No application" as a blank
 * option does not have to omit the key. The mutation re-checks ownership of
 * whatever id does arrive.
 */
export const createTaskSchema = z.object({
  applicationId: z
    .union([idSchema, z.literal("")])
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
  ...taskFields,
});

/**
 * What `PATCH /api/tasks/:id` accepts.
 *
 * Unlike interviews and assessments, `applicationId` **is** editable here. The
 * difference is real: attaching a standalone task to an application, or detaching
 * one, is a normal thing to want — "practise system design" becomes specific to the
 * Google loop — where moving an interview between applications is not a coherent
 * action.
 *
 * `isCompleted` is deliberately absent. It has its own endpoint, for the same
 * reason an application's status does: flipping it maintains the derived
 * `completedAt` column, and a field edit must not be a second route to that.
 */
export const updateTaskSchema = createTaskSchema;

/** What the form validates: the task's own fields, without the parent. */
export const taskFormSchema = z.object(taskFields);

export type TaskFormValues = z.input<typeof taskFormSchema>;

/**
 * What the form's resolver produces — **no `applicationId`**, because the form has no
 * such field: the parent is a separate control whose value is posted alongside.
 *
 * Distinct from `TaskPayload` on purpose, and the distinction is load-bearing rather
 * than tidy. React Hook Form's third generic *is* the resolver's output, so the two
 * must agree exactly; using the request payload there claims the resolver returns a
 * field it has never heard of, and the compiler rejects it. The same split as
 * `ApplicationFormPayload` against `CreateApplicationPayload`.
 */
export type TaskFormPayload = z.output<typeof taskFormSchema>;

export type TaskPayload = z.output<typeof updateTaskSchema>;

export type CreateTaskPayload = z.output<typeof createTaskSchema>;

/**
 * `PATCH /api/tasks/:id/completion` — ticking a task off.
 *
 * Its own endpoint and its own schema rather than a field on the general update,
 * exactly like `updateStatusSchema`. Flipping this writes or clears `completedAt`,
 * and a `completedAt` that disagrees with `isCompleted` would make "completed this
 * week" uncountable. A real boolean on the wire: nothing types this, so there is no
 * `<input>` whose string value it has to match.
 */
export const toggleTaskCompletionSchema = z.object({
  isCompleted: z.boolean(),
});

/** The form's starting state. A plain constant — nothing here is derived from the clock. */
export const EMPTY_TASK_FORM: Required<TaskFormValues> = {
  title: "",
  description: "",
  dueDate: "",
  priority: "MEDIUM",
};

/**
 * A stored task, in the shape `toTaskFormValues` needs. Spelled out rather than
 * imported from Prisma, for the §4 rule that keeps Prisma inside `src/server/`.
 */
export type TaskFormSource = {
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: PriorityValue;
};

/**
 * A stored task → the form's starting values.
 *
 * `toDateInputValue` reads the due date back in **UTC**, the other half of the
 * date-only convention — formatting in local time would show the 13th for a value
 * stored as the 14th, and saving would quietly move the deadline.
 */
export function toTaskFormValues(source: TaskFormSource): Required<TaskFormValues> {
  return {
    title: source.title,
    description: source.description ?? "",
    dueDate: toDateInputValue(source.dueDate),
    priority: source.priority,
  };
}

/**
 * The deleted-task snapshot that powers undo (DESIGN.md §8).
 *
 * Two things set this apart from the interview and assessment snapshots.
 *
 * **`applicationId` is nullable**, because a standalone task is a real task. The
 * union puts null first so an absent parent is matched before `idSchema` is ever
 * tried, and `restoreTask` treats the two cases differently: null means "no
 * parent", an id means "a parent that must be re-checked".
 *
 * **`isCompleted` and `completedAt` are both carried**, which is the only place
 * in the product where that pair is written from a request body rather than by
 * `toggleTaskCompletion`. Deleting a finished task and undoing it has to give
 * back a finished task — dropping the pair would silently put it back on the
 * to-do list, and dropping just the timestamp would break the invariant
 * `completedAt IS NOT NULL ⟺ isCompleted` that "tasks completed this week"
 * divides by. So the invariant is enforced here instead, by a refinement rather
 * than by trust: a forged snapshot cannot be the thing that breaks it.
 */
export const taskSnapshotSchema = z.object({
  id: idSchema,
  applicationId: z.union([z.null(), idSchema]),
  title: z.string().min(1).max(TASK_TITLE_MAX),
  description: z.string().max(TASK_DESCRIPTION_MAX).nullable(),
  dueDate: nullableWireDate,
  priority: z.enum(PRIORITIES),
  isCompleted: z.boolean(),
  completedAt: nullableWireDate,
  createdAt: wireDate,
});

export type TaskSnapshot = z.output<typeof taskSnapshotSchema>;

/** What `POST /api/tasks/:id/restore` accepts. */
export const restoreTaskSchema = z.object({
  snapshot: taskSnapshotSchema.refine(
    (snapshot) => (snapshot.completedAt !== null) === snapshot.isCompleted,
    {
      error: "A task's completion flag and timestamp must agree",
      path: ["completedAt"],
    },
  ),
});
