import type { Prisma } from "@prisma/client";

import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { isManualEventType, type EventTypeValue } from "@/lib/constants/event";
import type { EventPayload } from "@/lib/validations/event";

import { TRANSACTION_OPTIONS, prisma } from "../db";

/**
 * Manual timeline entries: add, edit, delete (DESIGN.md §6, §7).
 *
 * Automatic events are written elsewhere — `createApplication` writes the
 * opening one and `updateApplicationStatus` writes one per move, each inside the
 * transaction that changes the columns it describes. Nothing here touches those.
 *
 * Two rules run through every function below.
 *
 * **Only manual rows are writable.** `isAutomatic` is checked on the stored row,
 * not taken from the request, so an automatic entry cannot be edited or deleted
 * however the call is shaped. That is what the column is for (§3): the system's
 * own record of what happened has to stay the system's. Editing *"Moved to
 * Interview · From Assessment"* into something else would corrupt the history
 * the compare-and-set in `updateApplicationStatus` exists to keep honest.
 *
 * **An `EMAIL_RECEIVED` entry can stamp `firstResponseAt`.** §3 defines that
 * column as written once, on whichever comes first: a qualifying status change,
 * *or an `EMAIL_RECEIVED` timeline event being added*. The status half shipped in
 * Phase 2; this is the other half, and until now it was the one line of §3's
 * metric definitions that nothing implemented. It matters because a reply that
 * arrives before any status change — the common case, since people read the
 * email before they move the card — would otherwise leave the response rate
 * understating reality.
 */

/**
 * What the timeline needs back after a write. Narrow on purpose: the page
 * re-renders from the server, so this is for the toast, not for patching state.
 */
export type WrittenEvent = {
  id: string;
  applicationId: string;
  title: string;
  /**
   * The stored column's type, which is the full enum rather than the manual
   * subset. Narrowing it here would be a claim the database does not make: the
   * row is read back after the write, and `select` returns `EventType`. The
   * write that produced it was constrained by `eventSchema`, which is where that
   * guarantee belongs.
   */
  type: EventTypeValue;
};

const writtenEventSelect = {
  id: true,
  applicationId: true,
  title: true,
  type: true,
} satisfies Prisma.ApplicationEventSelect;

/**
 * Adds an entry to an application's timeline.
 *
 * One transaction, because the stamp below has to either happen with the event
 * or not at all. An `EMAIL_RECEIVED` row written without its `firstResponseAt`
 * would be a response the analytics cannot see, and the two are impossible to
 * reconcile afterwards — nothing records which event set the column.
 */
export async function createApplicationEvent(
  userId: string,
  applicationId: string,
  payload: EventPayload,
): Promise<WrittenEvent> {
  return prisma.$transaction(async (tx) => {
    /*
     * Ownership in the WHERE clause (§4), never a check afterwards. A wrong id
     * and someone else's id are the same thing here — null — which the caller
     * turns into a 404 rather than a 403, so the response cannot confirm that
     * another user's application exists (§6).
     *
     * The application is read even though the event carries its own `userId`,
     * because an event has to belong to an application that exists and is this
     * user's. Without it a forged `applicationId` would attach a timeline entry
     * to a stranger's row.
     */
    const application = await tx.application.findFirst({
      where: { id: applicationId, userId },
      select: { id: true, appliedAt: true, firstResponseAt: true },
    });

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    const event = await tx.applicationEvent.create({
      data: {
        userId,
        applicationId: application.id,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        occurredAt: payload.occurredAt,
        // The flag that makes this row editable, and the one thing in it the
        // client does not get a say in.
        isAutomatic: false,
      },
      select: writtenEventSelect,
    });

    await stampFirstResponse(tx, userId, application, payload);

    return event;
  }, TRANSACTION_OPTIONS);
}

/**
 * Edits a manual entry.
 *
 * Changing the type *to* `EMAIL_RECEIVED` stamps `firstResponseAt` on the same
 * terms as adding one, which is the consistent reading of §3: the user is saying
 * a reply arrived, and how they arrived at that statement — a new entry, or a
 * correction to one they mistyped — is not something the metric should care
 * about.
 *
 * Changing the type *away* from `EMAIL_RECEIVED` does **not** clear it. See
 * `stampFirstResponse` for why that asymmetry is deliberate rather than an
 * omission.
 */
export async function updateApplicationEvent(
  userId: string,
  eventId: string,
  payload: EventPayload,
): Promise<WrittenEvent> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.applicationEvent.findFirst({
      where: { id: eventId, userId },
      select: {
        id: true,
        type: true,
        isAutomatic: true,
        application: { select: { id: true, appliedAt: true, firstResponseAt: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError("Timeline entry not found");
    }

    assertEditable(existing);

    const event = await tx.applicationEvent.update({
      where: { id: existing.id },
      data: {
        type: payload.type,
        title: payload.title,
        description: payload.description,
        occurredAt: payload.occurredAt,
      },
      select: writtenEventSelect,
    });

    await stampFirstResponse(tx, userId, existing.application, payload);

    return event;
  }, TRANSACTION_OPTIONS);
}

export type DeletedEvent = { id: string; title: string };

/**
 * Removes a manual entry.
 *
 * No transaction and no snapshot: one row, no children, nothing derived to
 * maintain — `firstResponseAt` deliberately survives, per `stampFirstResponse`.
 * The confirmation dialog is what makes this safe rather than an undo, because
 * re-adding an entry the user wrote themselves is four fields they still
 * remember, where re-creating a deleted *application* is twenty they do not.
 */
export async function deleteApplicationEvent(
  userId: string,
  eventId: string,
): Promise<DeletedEvent> {
  const existing = await prisma.applicationEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, title: true, type: true, isAutomatic: true },
  });

  if (!existing) {
    throw new NotFoundError("Timeline entry not found");
  }

  assertEditable(existing);

  await prisma.applicationEvent.delete({ where: { id: existing.id } });

  return { id: existing.id, title: existing.title };
}

/**
 * Refuses to touch an entry the system wrote.
 *
 * A 409 rather than a 404, which is a deliberate departure from the rule that
 * governs the rest of this file. 404 is for rows the caller must not learn about
 * — someone else's. This row is the caller's own and is on their screen; saying
 * "not found" about an entry they are looking at would be a lie that reads as a
 * bug. The honest answer is that it exists and is not theirs to rewrite.
 *
 * Both conditions are checked, not just `isAutomatic`. They should agree — every
 * writer of an automatic type sets the flag — but the type is the one that
 * decides what the analytics in §3 count, so a row that disagrees with itself is
 * refused rather than trusted.
 */
function assertEditable(event: { type: EventTypeValue; isAutomatic: boolean }): void {
  if (event.isAutomatic || !isManualEventType(event.type)) {
    throw new ConflictError(
      "This entry was recorded automatically and cannot be changed. Use the status control to move the application.",
    );
  }
}

/**
 * Writes `firstResponseAt` when an `EMAIL_RECEIVED` entry says a reply arrived.
 *
 * Three guards, each of which is load-bearing:
 *
 * - **Only `EMAIL_RECEIVED`.** The other six manual types are not responses in
 *   §3's sense. An `INTERVIEW` entry logged after the fact is evidence a reply
 *   happened, but the status change that accompanied it already stamped the
 *   column, and inferring a response from an interview would double-count the
 *   same reply through two mechanisms that cannot see each other.
 * - **Written once.** §3's rule verbatim, so a second email does not reset the
 *   first and "time to first response" keeps measuring the first.
 * - **Only on a submitted application.** `appliedAt IS NOT NULL` is the
 *   denominator for every rate in §3, so a response recorded against a role that
 *   was never sent would let `responses` exceed `submitted` and push the
 *   response rate past 100%. This is the same reasoning that makes a move back to
 *   SAVED clear both stamps in `updateApplicationStatus`.
 *
 * **The date is the event's, not now.** "Average response time" is the mean of
 * `firstResponseAt − appliedAt`, and a user logging Tuesday's email on Friday
 * means Tuesday. Using the moment of data entry would measure how promptly they
 * keep their tracker up to date, which is not a thing anybody wants to know.
 * Clamped at `appliedAt`, because a reply cannot predate the application it
 * replies to and a negative response time would poison the mean.
 *
 * **Nothing here ever clears the column**, and that asymmetry is a decision
 * rather than an oversight. Deleting the entry, or retyping it as something
 * else, leaves the stamp. Three reasons: §3 says the column is written once and
 * never overwritten; nothing records *which* mechanism set it, so a delete
 * cannot tell whether it owns the stamp or whether a status change got there
 * first; and recomputing from the event log is not available either, because
 * `createApplication` stamps the column for an application logged straight in at
 * INTERVIEW while writing a single `APPLIED` event — so a recompute would
 * silently erase a legitimate response.
 */
async function stampFirstResponse(
  tx: Prisma.TransactionClient,
  userId: string,
  application: { id: string; appliedAt: Date | null; firstResponseAt: Date | null },
  payload: EventPayload,
): Promise<void> {
  if (payload.type !== "EMAIL_RECEIVED") {
    return;
  }

  if (application.firstResponseAt !== null || application.appliedAt === null) {
    return;
  }

  const respondedAt =
    payload.occurredAt < application.appliedAt ? application.appliedAt : payload.occurredAt;

  /*
   * `updateMany` with `firstResponseAt: null` in the WHERE, which makes this a
   * compare-and-set rather than a blind write — the same discipline as
   * `attemptStatusChange`, and for the same reason. Two replies logged at once,
   * or an email entry racing a status change, would otherwise both pass the
   * read above and the later commit would overwrite the earlier response.
   *
   * No count check and no retry: losing means something else already recorded a
   * first response, which is precisely the outcome "written once" asks for.
   * There is nothing to redo.
   */
  await tx.application.updateMany({
    where: { id: application.id, userId, firstResponseAt: null },
    data: { firstResponseAt: respondedAt },
  });
}
