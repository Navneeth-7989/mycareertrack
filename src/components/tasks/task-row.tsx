import Link from "next/link";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { TonePill, type Tone } from "@/components/shared/tone-pill";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { PRIORITY_LABELS, type PriorityValue } from "@/lib/constants/application";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import type { ApplicationOption } from "@/server/queries/interviews";

/**
 * One task.
 *
 * The due date goes through `utils/date-only` and is read back in **UTC** — a due
 * date is a calendar day, like an assessment's deadline and unlike an interview's
 * start.
 */

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: PriorityValue;
  isCompleted: boolean;
  application: {
    id: string;
    jobTitle: string;
    company: { name: string };
  } | null;
};

/**
 * Only `HIGH` and `LOW` are shown.
 *
 * `MEDIUM` is the column default and therefore most rows, so a pill for it would put
 * a coloured chip on every line of a to-do list and say nothing — the design standard
 * calls that decoration standing in for design. The absence of a pill *is* medium,
 * which is the quiet default a list wants.
 */
const PRIORITY_TONES: Partial<Record<PriorityValue, Tone>> = {
  HIGH: {
    pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  LOW: {
    pill: "border-slate-200 bg-transparent text-slate-500 dark:border-slate-700 dark:text-slate-400",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

export function TaskRow({
  task,
  applicationOptions,
  showApplication = true,
}: {
  task: TaskRowData;
  /** Offered in the edit dialog so a task can be re-parented or detached. */
  applicationOptions?: ApplicationOption[];
  showApplication?: boolean;
}) {
  /*
   * `daysSinceDateOnly` counts backwards — positive for the past — so a positive
   * number means the date has gone. Overdue only means something while the task is
   * open: a completed task that was due last Tuesday is done, not late.
   */
  const daysPast = task.dueDate ? daysSinceDateOnly(task.dueDate) : null;
  const overdue = daysPast !== null && daysPast > 0 && !task.isCompleted;
  const dueToday = daysPast === 0 && !task.isCompleted;

  const tone = PRIORITY_TONES[task.priority];

  return (
    <li className="border-border flex items-start gap-3 border-b py-3.5 first:pt-0 last:border-b-0 last:pb-0">
      <TaskCheckbox id={task.id} title={task.title} isCompleted={task.isCompleted} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={
              task.isCompleted
                ? "text-muted-foreground text-sm leading-snug line-through"
                : "text-sm leading-snug font-medium"
            }
          >
            {task.title}
          </p>

          {/* Hidden once done: the priority of a finished task is not information. */}
          {tone && !task.isCompleted ? (
            <TonePill tone={tone} showDot={false} className="h-5 px-2 text-[0.6875rem]">
              {PRIORITY_LABELS[task.priority]}
            </TonePill>
          ) : null}
        </div>

        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {task.dueDate ? (
            <span className={overdue ? "text-destructive font-medium" : undefined}>
              {overdue ? "Overdue · " : dueToday ? "Due today · " : "Due "}
              {formatDateOnly(task.dueDate)}
              {!overdue && !dueToday ? ` · ${relativeDayLabel(daysPast ?? 0)}` : ""}
            </span>
          ) : (
            <span>No due date</span>
          )}

          {showApplication && task.application ? (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/applications/${task.application.id}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {task.application.jobTitle} at {task.application.company.name}
              </Link>
            </>
          ) : null}
        </div>

        {task.description ? (
          // `whitespace-pre-line` so typed line breaks survive. React escapes the
          // content, so this is plain text and never markup (§8).
          <p className="text-muted-foreground mt-1.5 text-[0.8125rem] leading-relaxed whitespace-pre-line">
            {task.description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <TaskDialog
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            dueDate: task.dueDate,
            priority: task.priority,
            applicationId: task.application?.id ?? null,
          }}
          applicationOptions={applicationOptions}
          trigger="icon"
        />

        <ConfirmDelete
          endpoint={`/api/tasks/${task.id}`}
          triggerLabel={`Delete “${task.title}”`}
          title="Delete this task?"
          description={
            <>
              <strong className="text-foreground font-medium">{task.title}</strong> will be removed.
              If you have finished it, tick it off instead — that keeps the record.
            </>
          }
          successTitle="Task deleted"
          successDescription={task.title}
          failureMessage="Could not delete that task."
          undo={{
            restoredTitle: "Task restored",
            failureMessage: "Could not restore that task.",
          }}
        />
      </div>
    </li>
  );
}
