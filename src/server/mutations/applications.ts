import { EventType } from "@prisma/client";

import { ConfirmationRequiredError, ConflictError, NotFoundError } from "@/lib/api/errors";
import {
  APPLICATION_STATUS_LABELS,
  isResponseStatus,
  isSubmittedStatus,
  type ApplicationStatusValue,
} from "@/lib/constants/application";
import type {
  ApplicationWarning,
  CreateApplicationPayload,
  UpdateApplicationPayload,
} from "@/lib/validations/application";

import { TRANSACTION_OPTIONS, prisma } from "../db";
import { resolveCompanyByName } from "../services/company-resolver";
import {
  resolveAndLinkRecruiter,
  syncRecruiterLink,
  type LinkedContact,
} from "../services/contact-resolver";
import { findDuplicateWarning } from "../services/duplicate-check";

/**
 * Application writes.
 *
 * `createApplication` is the worked example from DESIGN.md §4 in reverse: one
 * transaction that resolves the company, writes the application, links a
 * recruiter and records the opening timeline event. The transaction is the point
 * — an application whose company row rolled back, or which exists with no
 * timeline event, is corrupt in a way the analytics in Phase 4 would quietly
 * inherit.
 */

export type CreatedApplication = {
  id: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
  status: CreateApplicationPayload["status"];
  /**
   * What was noticed but not acted on. Empty when this is the first of its
   * kind. A warning-level duplicate only appears here when the caller
   * acknowledged it — otherwise this never returned at all.
   */
  warnings: ApplicationWarning[];
  /** Non-null when the recruiter fields produced or matched a contact. */
  contact: LinkedContact | null;
};

export type StatusChangeResult = {
  id: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationStatusValue;
  previousStatus: ApplicationStatusValue;
  /** False when the application was already at this status and nothing was written. */
  changed: boolean;
};

/**
 * How many times a status change re-reads and retries after losing a race.
 *
 * The budget is a pile-up depth, not a flakiness allowance, and that is what
 * sets the number. Contending writes queue on the row lock and commit one at a
 * time, so with N requests in flight against the same application the last one
 * to get the lock has to lose, and retry, N-1 times. A budget below N therefore
 * does not make the loser slower — it makes it fail.
 *
 * Measured rather than guessed: at three, firing five concurrent moves at one
 * row left one or two of them exhausting the budget and returning a 409, with
 * the stored data still perfectly consistent. Eight absorbs every pile-up a
 * person can produce by hand, since each retry is one short transaction against
 * a row only its owner can touch.
 *
 * It stays bounded. An unbounded loop here would turn a stuck lock into a
 * request that never returns.
 */
const STATUS_WRITE_ATTEMPTS = 8;

/**
 * Moves an application to a new status — the worked example in DESIGN.md §4.
 *
 * One transaction does three things, and the transaction is the point: a status
 * change that failed to record its timeline event would corrupt the history the
 * analytics in Phase 4 are built on, and there would be no way to tell
 * afterwards.
 *
 * Two derived columns are maintained here as well, because this is the only
 * place status changes:
 *
 * - **`appliedAt`** holds the invariant `appliedAt IS NOT NULL ⟺ status is not
 *   SAVED`. Every rate in §3 divides by `appliedAt IS NOT NULL`, so the day
 *   that stops matching the status is the day the analytics start lying.
 * - **`firstResponseAt`** is written once and never overwritten (§3), so a
 *   second reply does not reset the first — except by the regression below.
 *
 * **On the retry loop.** The read that decides all of the above has to happen
 * inside the same transaction as the write, and the write has to be conditional
 * on nothing having moved in between. The first version of this function read
 * outside the transaction, and the bug was not theoretical: two changes 10ms
 * apart both read `ASSESSMENT`, so the timeline ended up with "Moved to
 * Screening · From Assessment" and "Moved to Applied · From Assessment" — one
 * of which never happened, on a row that has no record of ever being in
 * Screening.
 *
 * That matters more than it looks. §3 computes "ever reached INTERVIEW" and
 * "ever reached OFFER" from `ApplicationEvent` rather than from the current
 * status — the event log *is* the analytics input, and it is append-only, so a
 * fabricated entry is permanent. The same race can also split a derived column
 * off from the log: race APPLIED against SCREENING on a saved role and the
 * last writer can leave `firstResponseAt` null while the log says a response
 * arrived, which silently undercounts the response rate.
 *
 * Losing the race is not an error the user should see. Their intent — "put this
 * in Interview" — is still valid whatever the previous status turned out to be;
 * only the description of the move was stale. So the loser re-reads and writes
 * a *truthful* event rather than reporting a conflict.
 */
export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  status: ApplicationStatusValue,
): Promise<StatusChangeResult> {
  for (let attempt = 0; attempt < STATUS_WRITE_ATTEMPTS; attempt += 1) {
    const result = await attemptStatusChange(userId, applicationId, status);

    if (result) {
      return result;
    }
  }

  /*
   * Only reachable if every attempt had another write land underneath it. A 409
   * rather than a 500: nothing is broken and nothing is corrupt — the stored
   * status and the timeline still agree, this request simply never got a turn —
   * so re-sending is the right response, which is what the client's error toast
   * already invites.
   */
  throw new ConflictError("That application is being changed somewhere else. Try again.");
}

/**
 * One attempt. Returns null — never throws — when the row moved underneath it,
 * which is the caller's signal to read again.
 */
async function attemptStatusChange(
  userId: string,
  applicationId: string,
  status: ApplicationStatusValue,
): Promise<StatusChangeResult | null> {
  return prisma.$transaction(async (tx) => {
    /*
     * Inside the transaction, and on `tx` rather than `prisma` — the whole
     * point of the change. Ownership stays in the WHERE clause, never a check
     * afterwards (§4): a wrong id and someone else's id are the same thing
     * here, null, which the caller turns into a 404 rather than a 403 (§6).
     */
    const existing = await tx.application.findFirst({
      where: { id: applicationId, userId },
      select: {
        id: true,
        jobTitle: true,
        status: true,
        appliedAt: true,
        firstResponseAt: true,
        company: { select: { name: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError("Application not found");
    }

    const result = {
      id: existing.id,
      jobTitle: existing.jobTitle,
      companyName: existing.company.name,
      previousStatus: existing.status,
    };

    // Dropping a card back in the column it came from is not a status change.
    // It writes nothing — otherwise a board that is fiddled with for a minute
    // fills the timeline with "moved to Applied" from Applied. The board also
    // short-circuits this client-side; this is the authoritative copy, and it
    // is what makes a retry that finds the work already done return quietly
    // rather than write a second identical event.
    if (existing.status === status) {
      return { ...result, status, changed: false };
    }

    const now = new Date();
    const submitted = isSubmittedStatus(status);

    /*
     * Moving back to SAVED clears both stamps.
     *
     * SAVED means "found it, not applied yet", so an application date cannot
     * survive the move — and `firstResponseAt` cannot either, because a reply to
     * an application that was never sent would make `responses` exceed
     * `submitted` and push the response rate above 100%.
     *
     * It is the one case where §3's "written once, never overwritten" gives way,
     * and deliberately so: that rule exists to stop a *later* reply overwriting
     * the first, not to preserve a stamp on an application the user has just said
     * was never sent. The regression is recorded as a timeline event, so the
     * history of what happened survives even though the derived columns do not.
     */
    const regressed = !submitted;

    /*
     * Compare-and-set: `status` is in the WHERE, so this writes only if the row
     * still holds what was just read.
     *
     * `updateMany` rather than `update` because Prisma's `update` accepts only a
     * unique `where`, and the status predicate is the entire guard. Postgres
     * makes it a real test rather than an optimistic one: at Read Committed —
     * what `TRANSACTION_OPTIONS` leaves in place — a blocked `UPDATE`
     * re-evaluates its WHERE against the newest committed version of the row
     * once the lock is released. So `count === 0` means precisely "someone
     * committed a different status while this transaction was open", and never
     * "the row vanished", which `findFirst` above has already ruled out.
     */
    const written = await tx.application.updateMany({
      where: { id: existing.id, userId, status: existing.status },
      data: {
        status,
        appliedAt: regressed ? null : (existing.appliedAt ?? now),
        firstResponseAt: regressed
          ? null
          : // Written once: an application already stamped keeps its original
            // date, so "time to first response" measures the first one.
            (existing.firstResponseAt ?? (isResponseStatus(status) ? now : null)),
      },
    });

    if (written.count === 0) {
      // Lost. Nothing has been written, so returning from here leaves an empty
      // transaction to commit and the caller starts again from a fresh read.
      return null;
    }

    await tx.applicationEvent.create({
      data: {
        userId,
        applicationId: existing.id,
        type: EventType.STATUS_CHANGE,
        title: `Moved to ${APPLICATION_STATUS_LABELS[status]}`,
        // True by construction now: the update above refused to run unless the
        // row still held `existing.status`, so this names the status the
        // application actually moved from.
        description: `From ${APPLICATION_STATUS_LABELS[existing.status]}`,
        occurredAt: now,
        isAutomatic: true,
      },
    });

    return { ...result, status, changed: true };
  }, TRANSACTION_OPTIONS);
}

export type UpdatedApplication = {
  id: string;
  jobTitle: string;
  companyName: string;
  /** Non-null when the recruiter block produced, matched or kept a contact. */
  contact: LinkedContact | null;
};

/**
 * Edits an application's own fields (DESIGN.md §6, `PATCH /api/applications/:id`).
 *
 * **Status is not among them**, and cannot be: `updateApplicationRequestSchema`
 * omits it, so there is no way to express it in the request. Changing status
 * writes a timeline event and maintains two derived columns in one transaction,
 * and a field edit that skipped all of that would corrupt exactly the history
 * `updateApplicationStatus` exists to protect. The pill on the detail page is
 * the control.
 *
 * No timeline event is written here either, and that is deliberate rather than
 * an omission. `EventType` has no "edited" member because the timeline is a
 * record of what happened in the *search* — applied, screened, interviewed — not
 * an audit log of form submissions. Correcting a salary range you mistyped is
 * not a thing that happened to the application.
 *
 * One transaction, for the same reason as `createApplication`: resolving a
 * company, moving a contact link and writing the row either all happen or none
 * do. A rolled-back edit that had already created a `Company` would leave a
 * row nothing points at.
 */
export async function updateApplication(
  userId: string,
  applicationId: string,
  payload: UpdateApplicationPayload,
): Promise<UpdatedApplication> {
  return prisma.$transaction(async (tx) => {
    // Ownership in the WHERE clause (§4); null becomes a 404, never a 403 (§6).
    const existing = await tx.application.findFirst({
      where: { id: applicationId, userId },
      select: {
        id: true,
        companyId: true,
        jobTitle: true,
        status: true,
        appliedAt: true,
        contacts: {
          select: { contactId: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Application not found");
    }

    const company = await resolveCompanyByName(userId, { name: payload.companyName }, tx);

    /*
     * The duplicate question is asked only when this edit actually moved the
     * application onto another one — a changed company, or a changed title.
     *
     * Checking unconditionally would be the obvious implementation and a bad
     * one: an application that already shares a company and a similar title with
     * another is a duplicate the user has *already* confirmed once, so every
     * later edit to its salary or its notes would stop and re-ask a question
     * that was settled. A dialog that appears on saves it has no business
     * interrupting is a dialog people learn to dismiss without reading.
     */
    const identityChanged =
      company.id !== existing.companyId || payload.jobTitle !== existing.jobTitle;

    const warning = identityChanged
      ? await findDuplicateWarning(
          userId,
          {
            companyId: company.id,
            companyName: company.name,
            jobTitle: payload.jobTitle,
            // Without this the application matches itself and no edit ever saves.
            excludeId: existing.id,
          },
          tx,
        )
      : null;

    if (warning?.level === "warning" && !payload.acknowledgeDuplicate) {
      // Thrown inside the transaction, so nothing is written — including any
      // `Company` just created for a name the user may now abandon.
      throw new ConfirmationRequiredError({
        reason: warning.code,
        message: warning.message,
        relatedIds: warning.applicationIds,
      });
    }

    const application = await tx.application.update({
      where: { id: existing.id },
      data: {
        companyId: company.id,
        jobTitle: payload.jobTitle,
        jobUrl: payload.jobUrl,
        location: payload.location,
        workMode: payload.workMode,
        employmentType: payload.employmentType,
        salaryMin: payload.salaryMin,
        salaryMax: payload.salaryMax,
        currency: payload.currency,
        priority: payload.priority,
        source: payload.source,
        deadline: payload.deadline,
        jobDescription: payload.jobDescription,
        appliedAt: nextAppliedAt(existing, payload.appliedAt),
      },
      select: { id: true, jobTitle: true },
    });

    const contact = await syncRecruiterLink(
      userId,
      existing.id,
      {
        name: payload.recruiterName,
        role: payload.recruiterRole,
        email: payload.recruiterEmail,
        phone: payload.recruiterPhone,
      },
      existing.contacts[0]?.contactId ?? null,
      tx,
    );

    return {
      id: application.id,
      jobTitle: application.jobTitle,
      companyName: company.name,
      contact,
    };
  }, TRANSACTION_OPTIONS);
}

/**
 * What `appliedAt` becomes after an edit, given that this endpoint cannot change
 * status.
 *
 * The invariant from §3 is `appliedAt IS NOT NULL ⟺ status is not SAVED`, and
 * every rate in the analytics divides by it — so the status decides, not the
 * form:
 *
 * - **SAVED** — null, whatever was submitted. The form does not render the field
 *   for a saved role, so this discards nothing the user typed; it is here
 *   because the endpoint must hold the invariant against any request, not only
 *   against its own form.
 * - **Submitted, with a date** — that date. This is the correction the field
 *   exists for.
 * - **Submitted, cleared** — the stored date survives. Null is not an option
 *   without changing the status, and silently inventing today's date for an
 *   application submitted last month would be worse than ignoring the blank.
 */
function nextAppliedAt(
  existing: { status: ApplicationStatusValue; appliedAt: Date | null },
  submitted: Date | null,
): Date | null {
  if (!isSubmittedStatus(existing.status)) {
    return null;
  }

  return submitted ?? existing.appliedAt ?? new Date();
}

export async function createApplication(
  userId: string,
  payload: CreateApplicationPayload,
): Promise<CreatedApplication> {
  const now = new Date();

  // Submitted is every status except SAVED (§3's denominator rule, defined once
  // in `constants/application`). The form only offers a "date applied" field
  // for a submitted status, so forcing it to null for SAVED discards nothing
  // the user typed — and an application that is simultaneously "saved, not
  // applied" and stamped with an applied date would be counted as submitted by
  // every rate in the analytics.
  const submitted = isSubmittedStatus(payload.status);
  const appliedAt = submitted ? (payload.appliedAt ?? now) : null;

  return prisma.$transaction(async (tx) => {
    const company = await resolveCompanyByName(userId, { name: payload.companyName }, tx);

    // Read before the write, inside the same transaction: the advisory has to
    // describe the applications that existed *before* this one, and running it
    // afterwards would have the new row warn about itself.
    const warning = await findDuplicateWarning(
      userId,
      { companyId: company.id, companyName: company.name, jobTitle: payload.jobTitle },
      tx,
    );

    /*
     * A near-identical application stops here and asks, unless the user has
     * already said yes. Throwing rolls the transaction back, so nothing is
     * written — including the `Company` row this may just have created, which
     * is why the question is asked here rather than before the transaction
     * opens. An abandoned dialog leaves the database exactly as it was.
     *
     * Only the warning level gates. The info level — another role at the same
     * company — stays a post-save toast: applying to four roles at one employer
     * is normal behaviour (§8), and a dialog people learn to click through is a
     * dialog nobody reads.
     */
    if (warning?.level === "warning" && !payload.acknowledgeDuplicate) {
      throw new ConfirmationRequiredError({
        reason: warning.code,
        message: warning.message,
        relatedIds: warning.applicationIds,
      });
    }

    const application = await tx.application.create({
      data: {
        userId,
        companyId: company.id,
        jobTitle: payload.jobTitle,
        jobUrl: payload.jobUrl,
        location: payload.location,
        workMode: payload.workMode,
        employmentType: payload.employmentType,
        salaryMin: payload.salaryMin,
        salaryMax: payload.salaryMax,
        currency: payload.currency,
        status: payload.status,
        priority: payload.priority,
        source: payload.source,
        appliedAt,
        deadline: payload.deadline,
        jobDescription: payload.jobDescription,
        /**
         * Stamped on create when the status already implies a reply, which is
         * the case for someone logging an application they have been
         * interviewing for. §3 describes this column as written "on the first
         * qualifying status change", and a create past APPLIED is that same
         * event arriving as history rather than as a transition — leaving it
         * null would understate the response rate for every back-filled
         * application.
         */
        firstResponseAt: isResponseStatus(payload.status) ? now : null,
      },
      select: { id: true, jobTitle: true, status: true },
    });

    const contact = await resolveAndLinkRecruiter(
      userId,
      application.id,
      {
        name: payload.recruiterName,
        role: payload.recruiterRole,
        email: payload.recruiterEmail,
        phone: payload.recruiterPhone,
      },
      tx,
    );

    await tx.applicationEvent.create({
      data: {
        userId,
        applicationId: application.id,
        /**
         * One event on create, not a synthesised trail. An application logged
         * directly at INTERVIEW could be given an APPLIED event plus a
         * STATUS_CHANGE, but both would carry this moment as their timestamp —
         * inventing a history with fake dates in it. The status it was logged
         * at goes in the description instead, which is true.
         */
        type: submitted ? EventType.APPLIED : EventType.SAVED,
        title: submitted ? "Application submitted" : "Role saved",
        description:
          submitted && payload.status !== "APPLIED"
            ? `Logged at ${APPLICATION_STATUS_LABELS[payload.status]}`
            : null,
        occurredAt: appliedAt ?? now,
        isAutomatic: true,
      },
    });

    return {
      id: application.id,
      jobTitle: application.jobTitle,
      companyId: company.id,
      companyName: company.name,
      status: application.status,
      warnings: warning ? [warning] : [],
      contact,
    };
  }, TRANSACTION_OPTIONS);
}
