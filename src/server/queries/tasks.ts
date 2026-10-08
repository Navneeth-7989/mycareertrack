import { Prisma } from "@prisma/client";

import { startOfTodayUtc } from "@/lib/utils/date-only";

import { prisma } from "../db";

/**
 * Task reads: the `/tasks` page and the dashboard's overdue list.
 *
 * §7 names the four buckets — **overdue / today / upcoming / completed** — and they
 * are the whole design of the page. A flat list ordered by due date buries the one
 * thing that matters, which is what is already late.
 *
 * The composite index `[userId, isCompleted, dueDate]` in §3 was chosen for exactly
 * this query: my tasks, incomplete, by due date.
 */

const taskListSelect = {
  id: true,
  title: true,
  description: true,
  dueDate: true,
  priority: true,
  isCompleted: true,
  completedAt: true,
  /** Nullable — §3 allows standalone tasks, so this is absent for many of them. */
  application: {
    select: {
      id: true,
      jobTitle: true,
      company: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TaskSelect;

export type TaskListItem = Prisma.TaskGetPayload<{ select: typeof taskListSelect }>;

export type TaskLists = {
  /** Incomplete, due before today. The reason the page exists. */
  overdue: TaskListItem[];
  /** Incomplete, due today. */
  today: TaskListItem[];
  /** Incomplete, due later — or with no due date at all. */
  upcoming: TaskListItem[];
  completed: TaskListItem[];
  outstanding: number;
};

/**
 * How many completed tasks the page keeps on screen.
 *
 * Only the completed bucket is capped. The three open ones are bounded by the
 * user's own tolerance for a to-do list, where finished work accumulates forever —
 * and a page that renders two years of ticked-off items to show four live ones has
 * the proportions exactly backwards.
 */
export const COMPLETED_TASK_LIMIT = 50;

/**
 * Everything the tasks page shows.
 *
 * Two queries, not four: the open tasks come back in one read and are partitioned
 * in memory, while completed is its own because it is the one that needs a different
 * order (most recently finished first) and a cap. Four queries would be three extra
 * round trips to sort a list the first query already ordered.
 *
 * The boundary is **midnight UTC today**, matching how a date-only value is stored —
 * see `startOfTodayUtc` in `queries/assessments` for why a zoned "today" would be
 * the wrong thing to compare against unzoned storage.
 */
export async function listTasks(userId: string): Promise<TaskLists> {
  const [open, completed] = await Promise.all([
    prisma.task.findMany({
      where: { userId, isCompleted: false },
      select: taskListSelect,
      /*
       * Due date first with nulls last, then priority. `priority` is an enum whose
       * declaration order is LOW, MEDIUM, HIGH, so `desc` puts HIGH first — the
       * ordering depends on that declaration order and would silently invert if the
       * enum were ever reordered, which is why `PRIORITIES` in
       * `constants/application` is asserted against the schema.
       */
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    }),
    prisma.task.findMany({
      where: { userId, isCompleted: true },
      select: taskListSelect,
      // Most recently finished first. `completedAt` rather than `updatedAt`: editing
      // the title of a task finished last month should not move it to the top.
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take: COMPLETED_TASK_LIMIT,
    }),
  ]);

  // Read once. Three separate `new Date()` calls could straddle midnight and build
  // a boundary from two different days.
  const startOfToday = startOfTodayUtc();

  const overdue: TaskListItem[] = [];
  const today: TaskListItem[] = [];
  const upcoming: TaskListItem[] = [];

  for (const task of open) {
    if (!task.dueDate) {
      // No due date is "someday", which belongs with upcoming rather than in a
      // fourth open bucket nobody asked for.
      upcoming.push(task);
    } else if (task.dueDate.getTime() < startOfToday) {
      overdue.push(task);
    } else if (task.dueDate.getTime() === startOfToday) {
      today.push(task);
    } else {
      upcoming.push(task);
    }
  }

  return { overdue, today, upcoming, completed, outstanding: open.length };
}

/**
 * Overdue and due-today tasks, soonest first — the dashboard's action list.
 *
 * A separate query so the dashboard does not fetch a user's whole task list to
 * render three rows. Tasks with no due date are excluded: a list that exists to say
 * "these are late" must only contain things that can be.
 */
export async function getPressingTasks(userId: string, limit: number): Promise<TaskListItem[]> {
  const now = new Date();
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );

  return prisma.task.findMany({
    where: { userId, isCompleted: false, dueDate: { not: null, lte: endOfToday } },
    select: taskListSelect,
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { id: "asc" }],
    take: limit,
  });
}
