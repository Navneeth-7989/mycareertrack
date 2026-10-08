import { NotFoundError } from "@/lib/api/errors";
import type { AssessmentPayload, CreateAssessmentPayload } from "@/lib/validations/assessment";

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

export type DeletedAssessment = { id: string; applicationId: string };

export async function deleteAssessment(
  userId: string,
  assessmentId: string,
): Promise<DeletedAssessment> {
  const existing = await prisma.assessment.findFirst({
    where: { id: assessmentId, userId },
    select: { id: true, applicationId: true },
  });

  if (!existing) {
    throw new NotFoundError("Assessment not found");
  }

  await prisma.assessment.delete({ where: { id: existing.id } });

  return existing;
}
