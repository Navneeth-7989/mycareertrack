import { NotFoundError } from "@/lib/api/errors";
import type { CreateTaskPayload, TaskPayload } from "@/lib/validations/task";

import { prisma } from "../db";

/**
 * Task writes (DESIGN.md §6, §7 Phase 3).
 *
 * Two things distinguish these from the other children in this phase.
 *
 * **The parent is optional.** §3 has `applicationId` nullable — "standalone tasks
 * are allowed" — so `assertOwnedApplication` returns null for a null id rather than
 * throwing. A task with no application is not a task with a missing application.
 *
 * **Completion is its own mutation.** `toggleTaskCompletion` maintains
 * `completedAt`, which is a derived column in exactly the sense `appliedAt` is: it
 * must be non-null if and only if `isCompleted` is true. A general field update that
 * could also flip the boolean would be a second route to that invariant, and the
 * one that forgot the timestamp would be the one nobody tested.
 */

export type WrittenTask = { id: string; title: string; applicationId: string | null };

const writtenSelect = { id: true, title: true, applicationId: true } as const;

/**
 * Confirms the application is this user's, or that there isn't one.
 *
 * Returns null for a null id — a standalone task — and throws only for an id that
 * was given and does not resolve. Both the create and the update path need exactly
 * this, and the distinction between "no parent" and "a parent you may not touch" is
 * the thing worth getting right: collapsing them would silently turn a forged id
 * into a standalone task rather than a 404.
 */
async function assertOwnedApplication(
  userId: string,
  applicationId: string | null,
): Promise<string | null> {
  if (applicationId === null) {
    return null;
  }

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return application.id;
}

export async function createTask(userId: string, payload: CreateTaskPayload): Promise<WrittenTask> {
  const applicationId = await assertOwnedApplication(userId, payload.applicationId);

  return prisma.task.create({
    data: {
      userId,
      applicationId,
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate,
      priority: payload.priority,
    },
    select: writtenSelect,
  });
}

/**
 * Edits a task, including which application it belongs to — or none.
 *
 * Re-parenting is allowed here where it is not for interviews and assessments,
 * because it is a coherent intent: a standalone "practise system design" becomes
 * specific to one company's loop, or a task written under the wrong application
 * gets moved.
 */
export async function updateTask(
  userId: string,
  taskId: string,
  payload: TaskPayload,
): Promise<WrittenTask> {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Task not found");
  }

  const applicationId = await assertOwnedApplication(userId, payload.applicationId);

  return prisma.task.update({
    where: { id: existing.id },
    data: {
      applicationId,
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate,
      priority: payload.priority,
    },
    select: writtenSelect,
  });
}

export type ToggledTask = WrittenTask & { isCompleted: boolean };

/**
 * Ticks a task off, or puts it back.
 *
 * **`completedAt` is maintained here and nowhere else**, holding the invariant
 * `completedAt IS NOT NULL ⟺ isCompleted` — the same shape of rule as §3's
 * `appliedAt IS NOT NULL ⟺ status ≠ SAVED`, and it matters for the same reason:
 * anything that later counts "tasks completed this week" divides by this column, and
 * the day it stops agreeing with the boolean is the day that count starts lying.
 *
 * Un-completing **clears** the timestamp rather than keeping it. A task put back on
 * the list has not been completed, so a date saying it was would be false — and
 * unlike `firstResponseAt`, which records that a reply genuinely happened, there is
 * no historical fact here worth preserving against the user's correction.
 *
 * No transaction and no compare-and-set. Both columns are written in one statement,
 * so they cannot diverge, and the last writer winning is the right semantics for a
 * checkbox: two clicks in flight should settle on whichever the user did last.
 */
export async function toggleTaskCompletion(
  userId: string,
  taskId: string,
  isCompleted: boolean,
): Promise<ToggledTask> {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Task not found");
  }

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: { isCompleted, completedAt: isCompleted ? new Date() : null },
    select: { ...writtenSelect, isCompleted: true },
  });

  return task;
}

export async function deleteTask(userId: string, taskId: string): Promise<WrittenTask> {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: writtenSelect,
  });

  if (!existing) {
    throw new NotFoundError("Task not found");
  }

  await prisma.task.delete({ where: { id: existing.id } });

  return existing;
}
