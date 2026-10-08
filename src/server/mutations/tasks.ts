import { NotFoundError } from "@/lib/api/errors";
import type { CreateTaskPayload, TaskPayload, TaskSnapshot } from "@/lib/validations/task";

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

/**
 * Every column an undo needs: all of them except `userId`, which the session
 * supplies on the way back, and `updatedAt`, which Prisma owns.
 *
 * `isCompleted` and `completedAt` are both in it. A finished task that is
 * deleted and undone has to come back finished — see `taskSnapshotSchema` for
 * why the pair travels together and why the invariant between them is re-checked
 * on arrival rather than assumed.
 */
const snapshotSelect = {
  id: true,
  applicationId: true,
  title: true,
  description: true,
  dueDate: true,
  priority: true,
  isCompleted: true,
  completedAt: true,
  createdAt: true,
} as const;

export type DeletedTask = WrittenTask & { snapshot: TaskSnapshot };

/**
 * Deletes a task and returns what it would take to put it back (DESIGN.md §8).
 *
 * Real delete plus snapshot, as for interviews and assessments. The undo matters
 * more here than the size of the row suggests: a task is one click to delete from
 * a list of many, often while skimming, and the description can hold the only
 * copy of what the recruiter actually asked for.
 */
export async function deleteTask(userId: string, taskId: string): Promise<DeletedTask> {
  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: snapshotSelect,
  });

  if (!existing) {
    throw new NotFoundError("Task not found");
  }

  await prisma.task.delete({ where: { id: existing.id } });

  return {
    id: existing.id,
    title: existing.title,
    applicationId: existing.applicationId,
    snapshot: existing,
  };
}

/**
 * Puts a deleted task back.
 *
 * `assertOwnedApplication` does the re-check, and it is the right helper for
 * exactly the reason it exists: a task's parent is optional, so null has to mean
 * "standalone" rather than "missing". The create and update paths run the same
 * check on the same field from a request body, and a snapshot is no more trusted
 * than either.
 *
 * **It throws a 404 where the interview and assessment restores throw a 409**,
 * and the asymmetry is deliberate. For those two the application is structural —
 * if it is gone, the round is gone with it and there is nothing to say but "no
 * longer available". A task's parent is a field. A missing one means the id in
 * this body does not resolve, which is the same thing `updateTask` reports for
 * the same input, and reporting it differently through a different route would be
 * two answers to one question.
 *
 * Idempotent, so a double-clicked Undo returns the task rather than a conflict.
 */
export async function restoreTask(userId: string, snapshot: TaskSnapshot): Promise<WrittenTask> {
  const alreadyThere = await prisma.task.findFirst({
    where: { id: snapshot.id, userId },
    select: writtenSelect,
  });

  if (alreadyThere) {
    return alreadyThere;
  }

  const applicationId = await assertOwnedApplication(userId, snapshot.applicationId);

  return prisma.task.create({
    data: {
      ...snapshot,
      applicationId,
      // From the session, never from the body (§4, rule 3).
      userId,
    },
    select: writtenSelect,
  });
}
