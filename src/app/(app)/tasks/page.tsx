import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listApplicationOptions } from "@/server/queries/interviews";
import { COMPLETED_TASK_LIMIT, listTasks } from "@/server/queries/tasks";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Tasks · CareerTrack",
};

/**
 * `/tasks` — the four buckets §7 names: overdue, today, upcoming, completed.
 *
 * Replaces the `PlannedPage` placeholder wholesale.
 *
 * **Unlike every other page in this phase, this one does not require an
 * application.** §3 allows standalone tasks, so a brand-new account with nothing
 * logged can still use it — which is why the empty state offers "Add task" rather
 * than sending the user to create an application first.
 *
 * The boundary between the open buckets is midnight UTC, matching how a date-only
 * value is stored (`startOfTodayUtc`). See `listTasks`.
 */
export default async function TasksPage() {
  const user = await requireUser();

  const [lists, applicationOptions] = await Promise.all([
    listTasks(user.id),
    listApplicationOptions(user.id),
  ]);

  const hasAny = lists.outstanding > 0 || lists.completed.length > 0;

  /*
   * Rendered in urgency order, and each is skipped when empty — except "Upcoming",
   * which stays as the place a user with a clear plate still sees structure. An
   * "Overdue" heading with nothing under it reads as a loading failure, and its
   * absence is already the good news.
   */
  const groups: {
    key: string;
    title: string;
    description: string;
    tasks: TaskRowData[];
    tone?: "alert";
    alwaysShow?: boolean;
  }[] = [
    {
      key: "overdue",
      title: "Overdue",
      description: "Past their due date and still open.",
      tasks: lists.overdue,
      tone: "alert",
    },
    {
      key: "today",
      title: "Today",
      description: "Due today.",
      tasks: lists.today,
    },
    {
      key: "upcoming",
      title: "Upcoming",
      description: "Due later, or with no date set.",
      tasks: lists.upcoming,
      alwaysShow: true,
    },
    {
      key: "completed",
      title: "Completed",
      description: "Most recently finished first.",
      tasks: lists.completed,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tasks"
        description="Everything you have told yourself to do, with whatever is late at the top."
        actions={<TaskDialog applicationOptions={applicationOptions} />}
      />

      {!hasAny ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing on your list"
          description="Add the next thing you need to do — chase a recruiter, polish your resume, practise a round. Tasks can hang off an application or stand on their own."
          action={<TaskDialog applicationOptions={applicationOptions} />}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) =>
            group.tasks.length === 0 && !group.alwaysShow ? null : (
              <Card key={group.key}>
                <CardHeader className="border-b">
                  <CardTitle className={group.tone === "alert" ? "text-destructive" : undefined}>
                    {group.title}
                    {group.tasks.length > 0 ? (
                      <span className="text-muted-foreground ml-2 text-sm font-normal">
                        {group.tasks.length}
                      </span>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>

                <CardContent>
                  {group.tasks.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-sm">
                      Nothing here. {lists.outstanding === 0 ? "Your list is clear." : ""}
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {group.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          applicationOptions={applicationOptions}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ),
          )}

          {/* The constant, not a literal 50 — a cap the page states and the query
              enforces must be the same number. */}
          {lists.completed.length >= COMPLETED_TASK_LIMIT ? (
            <p className="text-muted-foreground text-xs">
              Only the {COMPLETED_TASK_LIMIT} most recently completed tasks are shown.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
