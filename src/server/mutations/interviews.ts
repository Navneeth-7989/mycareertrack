import { NotFoundError } from "@/lib/api/errors";
import type { CreateInterviewPayload, InterviewPayload } from "@/lib/validations/interview";

import { prisma } from "../db";

/**
 * Interview writes (DESIGN.md §6, §7 Phase 3).
 *
 * **No timeline event is written here, and that is a decision rather than an
 * omission.** `EventType` has an `INTERVIEW` member and it would be easy to
 * record "Interview scheduled" on every create — but an interview is a mutable
 * row with a date that genuinely changes, and the event log is append-only in
 * practice. Reschedule a round and the event would still name the old date;
 * delete it and the event would outlive the thing it described. The alternatives
 * are worse: cascading edits into the log makes it an audit trail of form
 * submissions, which step 1 already rejected for field edits.
 *
 * The history stays complete without it. §7 asks that "a single application shows
 * its complete history", and the detail page does that by rendering interviews as
 * their own panel beside the timeline, reading live rows rather than a copy. A
 * user who wants a round in the rail itself can add an `INTERVIEW` entry by hand —
 * `MANUAL_EVENT_TYPES` includes it for exactly that reason.
 *
 * Every function puts ownership in the WHERE clause (§4). A wrong id and another
 * user's id both come back null, which becomes a 404 rather than a 403 (§6).
 */

export type WrittenInterview = {
  id: string;
  applicationId: string;
  scheduledAt: Date;
};

/** Milliseconds in a minute — `endsAt` is derived from the duration the form collects. */
const MINUTE_MS = 60 * 1000;

/**
 * `endsAt` from the start and the duration.
 *
 * Null when no duration was given, which is the column's own default: an
 * interview whose length nobody recorded has no end, and inventing one would put
 * a fabricated block on a calendar. The form cannot express a zero or negative
 * duration (see `interviewFields`), so this cannot produce an end before the
 * start.
 */
function endsAt(scheduledAt: Date, durationMinutes: number | null): Date | null {
  return durationMinutes === null
    ? null
    : new Date(scheduledAt.getTime() + durationMinutes * MINUTE_MS);
}

export async function createInterview(
  userId: string,
  payload: CreateInterviewPayload,
): Promise<WrittenInterview> {
  /*
   * The application is read first, and this is the only authorization that
   * matters here: `applicationId` arrives in the request body, so without this a
   * forged id would hang an interview off a stranger's application. The
   * interview's own `userId` comes from the session either way.
   *
   * No transaction. One row is written and nothing is derived from it — unlike a
   * manual timeline entry, which can move `firstResponseAt` and therefore has to
   * be atomic with it.
   */
  const application = await prisma.application.findFirst({
    where: { id: payload.applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return prisma.interview.create({
    data: {
      userId,
      applicationId: application.id,
      type: payload.type,
      scheduledAt: payload.scheduledAt,
      endsAt: endsAt(payload.scheduledAt, payload.durationMinutes),
      meetingUrl: payload.meetingUrl,
      interviewerName: payload.interviewerName,
      prepNotes: payload.prepNotes,
      notes: payload.notes,
      result: payload.result,
    },
    select: { id: true, applicationId: true, scheduledAt: true },
  });
}

/**
 * Edits an interview. `applicationId` is not among the fields — an interview
 * belongs to the role it was for, and `updateInterviewSchema` has no such key, so
 * it cannot be expressed in a request.
 */
export async function updateInterview(
  userId: string,
  interviewId: string,
  payload: InterviewPayload,
): Promise<WrittenInterview> {
  const existing = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Interview not found");
  }

  return prisma.interview.update({
    where: { id: existing.id },
    data: {
      type: payload.type,
      scheduledAt: payload.scheduledAt,
      endsAt: endsAt(payload.scheduledAt, payload.durationMinutes),
      meetingUrl: payload.meetingUrl,
      interviewerName: payload.interviewerName,
      prepNotes: payload.prepNotes,
      notes: payload.notes,
      result: payload.result,
    },
    select: { id: true, applicationId: true, scheduledAt: true },
  });
}

export type DeletedInterview = { id: string; applicationId: string };

export async function deleteInterview(
  userId: string,
  interviewId: string,
): Promise<DeletedInterview> {
  const existing = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: { id: true, applicationId: true },
  });

  if (!existing) {
    throw new NotFoundError("Interview not found");
  }

  await prisma.interview.delete({ where: { id: existing.id } });

  return existing;
}
