import { EventType } from "@prisma/client";

import {
  APPLICATION_STATUS_LABELS,
  isResponseStatus,
  isSubmittedStatus,
} from "@/lib/constants/application";
import type { ApplicationWarning, CreateApplicationPayload } from "@/lib/validations/application";

import { prisma } from "../db";
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
  /** Advisory, never a block (§6). Empty when this is the first of its kind. */
  warnings: ApplicationWarning[];
  /** Non-null when the recruiter fields produced or matched a contact. */
  contact: LinkedContact | null;
};

/**
 * Neon's free tier suspends an idle database, and the first query after that
 * waits for it to wake. Prisma's defaults — 2s to acquire a transaction, 5s to
 * run it — are generous for the five fast queries inside, and not generous
 * enough for a cold start: the symptom is a P2028 "unable to start a
 * transaction in the given time" on the first save after a quiet hour, which
 * looks like a bug in the form. The work itself still has to finish in 20
 * seconds or roll back.
 */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

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
