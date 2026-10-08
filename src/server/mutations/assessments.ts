import { ConflictError, NotFoundError } from "@/lib/api/errors";
import type {
  AssessmentPayload,
  AssessmentSnapshot,
  CreateAssessmentPayload,
} from "@/lib/validations/assessment";

import { prisma } from "../db";

/**
 * Assessment writes (DESIGN.md §6, §7 Phase 3).
 *
 * The same shape as `mutations/interviews`, and for the same reasons: no timeline
 * event is written, because an assessment is a mutable row whose deadline and
 * status genuinely change while the event log is append-only in practice — a
 * "Assessment received" event would be stale the moment the deadline moved. The
 * detail page renders live rows beside the timeline instead, and a user who wants
 * one in the rail can add an `ASSESSMENT` entry by hand.
 *
 * Ownership is in the WHERE clause everywhere (§4): a wrong id and another user's
 * id both come back null, which becomes a 404 rather than a 403 (§6).
 */

export type WrittenAssessment = {
  id: string;
  applicationId: string;
  name: string;
};

const writtenSelect = { id: true, applicationId: true, name: true } as const;

export async function createAssessment(
  userId: string,
  payload: CreateAssessmentPayload,
): Promise<WrittenAssessment> {
  /*
   * `applicationId` arrives in the request body, so this read is the only thing
   * standing between a forged id and an assessment attached to a stranger's
   * application. The assessment's own `userId` comes from the session regardless.
   */
  const application = await prisma.application.findFirst({
    where: { id: payload.applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return prisma.assessment.create({
    data: {
      userId,
      applicationId: application.id,
      name: payload.name,
      provider: payload.provider,
      url: payload.url,
      deadline: payload.deadline,
      status: payload.status,
      score: payload.score,
      notes: payload.notes,
    },
    select: writtenSelect,
  });
}

export async function updateAssessment(
  userId: string,
  assessmentId: string,
  payload: AssessmentPayload,
): Promise<WrittenAssessment> {
  const existing = await prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Assessment not found");
  }

  return prisma.assessment.update({
    where: { id: existing.id },
    data: {
      name: payload.name,
      provider: payload.provider,
      url: payload.url,
      deadline: payload.deadline,
      status: payload.status,
      score: payload.score,
      notes: payload.notes,
    },
    select: writtenSelect,
  });
}

/**
 * Every column an undo needs: all of them except `userId`, which the session
 * supplies on the way back, and `updatedAt`, which Prisma owns.
 */
const snapshotSelect = {
  id: true,
  applicationId: true,
  name: true,
  provider: true,
  url: true,
  deadline: true,
  status: true,
  score: true,
  notes: true,
  createdAt: true,
} as const;

export type DeletedAssessment = {
  id: string;
  applicationId: string;
  snapshot: AssessmentSnapshot;
};

/**
 * Deletes an assessment and returns what it would take to put it back
 * (DESIGN.md §8).
 *
 * Real delete plus snapshot, the same arrangement as interviews and
 * applications — see `deleteInterview` for why that beats a held request or a
 * `deletedAt` column.
 *
 * The score and the notes are the reason this one needs an undo at all. A
 * deleted assessment takes "180/200" and a paragraph about what the take-home
 * asked for with it, and neither is anywhere else.
 */
export async function deleteAssessment(
  userId: string,
  assessmentId: string,
): Promise<DeletedAssessment> {
  const existing = await prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: snapshotSelect,
  });

  if (!existing) {
    throw new NotFoundError("Assessment not found");
  }

  await prisma.assessment.delete({ where: { id: existing.id } });

  return { id: existing.id, applicationId: existing.applicationId, snapshot: existing };
}

/**
 * Puts a deleted assessment back.
 *
 * `applicationId` is re-checked against the session user, for the reason spelled
 * out in `restoreInterview`: it is the one field in a snapshot that could point
 * at someone else's row, and the snapshot has been through the browser. A
 * missing application is a 409 — the realistic cause is the user deleting it
 * during the undo window, which cascaded this away again.
 *
 * Idempotent, so a double-clicked Undo returns the assessment rather than a
 * conflict.
 */
export async function restoreAssessment(
  userId: string,
  snapshot: AssessmentSnapshot,
): Promise<WrittenAssessment> {
  const alreadyThere = await prisma.assessment.findFirst({
    where: { id: snapshot.id, userId },
    select: writtenSelect,
  });

  if (alreadyThere) {
    return alreadyThere;
  }

  const application = await prisma.application.findFirst({
    where: { id: snapshot.applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new ConflictError("The application this assessment belonged to is no longer available");
  }

  return prisma.assessment.create({
    data: {
      ...snapshot,
      applicationId: application.id,
      // From the session, never from the body (§4, rule 3).
      userId,
    },
    select: writtenSelect,
  });
}
