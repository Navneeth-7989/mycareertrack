import { ConflictError, NotFoundError } from "@/lib/api/errors";
import type {
  CreateInterviewPayload,
  InterviewPayload,
  InterviewSnapshot,
} from "@/lib/validations/interview";

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

/**
 * Everything an undo needs, which is every column except `userId` — supplied by
 * the session on the way back — and `updatedAt`, which Prisma owns.
 *
 * Spelled as a `select` rather than taken from the model type, so adding a
 * column to `Interview` and forgetting it here is a compile error at
 * `restoreInterview` rather than a field that silently stops surviving a delete.
 */
const snapshotSelect = {
  id: true,
  applicationId: true,
  type: true,
  scheduledAt: true,
  endsAt: true,
  meetingUrl: true,
  interviewerName: true,
  prepNotes: true,
  notes: true,
  result: true,
  createdAt: true,
} as const;

export type DeletedInterview = {
  id: string;
  applicationId: string;
  snapshot: InterviewSnapshot;
};

/**
 * Deletes a round and returns what it would take to put it back (DESIGN.md §8).
 *
 * **The delete is real**, as it is for an application: the row is gone when the
 * request returns, and the ~10-second undo is built on the snapshot rather than
 * on a deferred request or a `deletedAt` flag. Both alternatives were rejected
 * for applications and the reasoning carries over unchanged — a held delete
 * shows the row as gone while it is still there, and a soft-delete column would
 * put a filter in `listInterviews`, the dashboard's next-up query, the detail
 * page's panel and every count beside them.
 *
 * Deleting is still distinct from marking the round `CANCELLED`. That is a
 * result, which keeps the row and its place in the history; this is for a round
 * entered by mistake. The undo window does not blur that — it just means a
 * misclick costs ten seconds of attention rather than the prep notes.
 *
 * No transaction. One row goes, nothing cascades to it, and the snapshot is read
 * in the statement before the delete — an interview has no children, so there is
 * no second read that could see a different world.
 */
export async function deleteInterview(
  userId: string,
  interviewId: string,
): Promise<DeletedInterview> {
  const existing = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: snapshotSelect,
  });

  if (!existing) {
    throw new NotFoundError("Interview not found");
  }

  await prisma.interview.delete({ where: { id: existing.id } });

  return { id: existing.id, applicationId: existing.applicationId, snapshot: existing };
}

/**
 * Puts a deleted round back, from the snapshot the delete returned.
 *
 * **Nothing in the snapshot is trusted for authorization.** It has been through
 * the browser, so `userId` comes from the session and `applicationId` — the one
 * field in it that could point somewhere it should not — is re-checked against
 * that user exactly as `createInterview` checks the id in a create body. Without
 * that, a forged snapshot would hang a round off a stranger's application.
 *
 * A missing application is a `ConflictError` rather than a 404, and the
 * distinction is the honest one: the id was fine, the world moved. The realistic
 * cause is the user deleting the application during the undo window — which
 * cascaded this interview away a second time — and "no longer available" says
 * that, where "not found" would suggest the Undo button was broken.
 *
 * Restoring twice is not an error: the second Undo finds the round already there
 * and returns it, which is what the user meant by clicking it.
 */
export async function restoreInterview(
  userId: string,
  snapshot: InterviewSnapshot,
): Promise<WrittenInterview> {
  const alreadyThere = await prisma.interview.findFirst({
    where: { id: snapshot.id, userId },
    select: { id: true, applicationId: true, scheduledAt: true },
  });

  if (alreadyThere) {
    return alreadyThere;
  }

  const application = await prisma.application.findFirst({
    where: { id: snapshot.applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new ConflictError("The application this interview belonged to is no longer available");
  }

  return prisma.interview.create({
    data: {
      ...snapshot,
      applicationId: application.id,
      // From the session, never from the body (§4, rule 3).
      userId,
    },
    select: { id: true, applicationId: true, scheduledAt: true },
  });
}
