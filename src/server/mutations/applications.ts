import { EventType } from "@prisma/client";

import { ConfirmationRequiredError, NotFoundError } from "@/lib/api/errors";
import {
  APPLICATION_STATUS_LABELS,
  isResponseStatus,
  isSubmittedStatus,
  type ApplicationStatusValue,
} from "@/lib/constants/application";
import type { ApplicationWarning, CreateApplicationPayload } from "@/lib/validations/application";

import { TRANSACTION_OPTIONS, prisma } from "../db";
import { resolveCompanyByName } from "../services/company-resolver";
import { resolveAndLinkRecruiter, type LinkedContact } from "../services/contact-resolver";
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
 */
export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  status: ApplicationStatusValue,
): Promise<StatusChangeResult> {
  // Ownership in the WHERE clause, never a check afterwards (§4). A wrong id
  // and someone else's id are the same thing here: null, which the caller turns
  // into a 404 rather than a 403 (§6).
  const existing = await prisma.application.findFirst({
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

  // Dropping a card back in the column it came from is not a status change. It
  // writes nothing — otherwise a board that is fiddled with for a minute fills
  // the timeline with "moved to Applied" from Applied.
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

  const application = await prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id: existing.id },
      data: {
        status,
        appliedAt: regressed ? null : (existing.appliedAt ?? now),
        firstResponseAt: regressed
          ? null
          : // Written once: an application already stamped keeps its original
            // date, so "time to first response" measures the first one.
            (existing.firstResponseAt ?? (isResponseStatus(status) ? now : null)),
      },
      select: { status: true },
    });

    await tx.applicationEvent.create({
      data: {
        userId,
        applicationId: existing.id,
        type: EventType.STATUS_CHANGE,
        title: `Moved to ${APPLICATION_STATUS_LABELS[status]}`,
        description: `From ${APPLICATION_STATUS_LABELS[existing.status]}`,
        occurredAt: now,
        isAutomatic: true,
      },
    });

    return updated;
  }, TRANSACTION_OPTIONS);

  return { ...result, status: application.status, changed: true };
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
