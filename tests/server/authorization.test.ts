import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors";
import type { UpdateApplicationPayload } from "@/lib/validations/application";
import { EMPTY_APPLICATION_FILTERS } from "@/lib/validations/application-filters";
import type { AssessmentPayload, CreateAssessmentPayload } from "@/lib/validations/assessment";
import type { ContactPayload } from "@/lib/validations/contact";
import type { EventPayload } from "@/lib/validations/event";
import type { CreateInterviewPayload, InterviewPayload } from "@/lib/validations/interview";
import type { NotePayload } from "@/lib/validations/note";
import type { CreateTaskPayload } from "@/lib/validations/task";
import { prisma } from "@/server/db";
import {
  deleteApplication,
  restoreApplication,
  updateApplication,
  updateApplicationStatus,
} from "@/server/mutations/applications";
import {
  createAssessment,
  deleteAssessment,
  restoreAssessment,
  updateAssessment,
} from "@/server/mutations/assessments";
import {
  deleteContact,
  linkContactToApplication,
  unlinkContactFromApplication,
  updateContact,
} from "@/server/mutations/contacts";
import {
  createApplicationEvent,
  deleteApplicationEvent,
  updateApplicationEvent,
} from "@/server/mutations/events";
import {
  createInterview,
  deleteInterview,
  restoreInterview,
  updateInterview,
} from "@/server/mutations/interviews";
import { createNote, deleteNote, updateNote } from "@/server/mutations/notes";
import { markAllNotificationsRead, markNotificationRead } from "@/server/mutations/notifications";
import { deleteResume, renameResume, setResumeDefault } from "@/server/mutations/resumes";
import { updateSettings } from "@/server/mutations/settings";
import {
  createTask,
  deleteTask,
  restoreTask,
  toggleTaskCompletion,
  updateTask,
} from "@/server/mutations/tasks";
import { getAnalytics } from "@/server/queries/analytics";
import {
  getApplication,
  getApplicationForEdit,
  getApplicationFacets,
  getBoardColumns,
  listApplications,
} from "@/server/queries/applications";
import { listAssessments } from "@/server/queries/assessments";
import { searchCompanies } from "@/server/queries/companies";
import { listContacts, listLinkableContacts } from "@/server/queries/contacts";
import { getDashboardActions, getDashboardSummary } from "@/server/queries/dashboard";
import { getInterview, listApplicationOptions, listInterviews } from "@/server/queries/interviews";
import { getNotificationBellCounts, getNotificationInbox } from "@/server/queries/notifications";
import { getResumeFile, listResumeOptions, listResumes } from "@/server/queries/resumes";
import { listTasks } from "@/server/queries/tasks";

import { createFixtures, destroyFixtures, type FixtureAccount, type Fixtures } from "./fixtures";

/**
 * The isolation suite (DESIGN.md §7, Phase 5 — "the authorization suite first").
 *
 * Two real accounts, a full set of rows each, and every read and write in the
 * server layer called with the *wrong* user id. §8 names IDOR as the first risk
 * in the product and §4 gives the defence: ownership lives in the `WHERE`
 * clause, never in a check beside it. This is where that claim gets tested
 * instead of asserted.
 *
 * **Why the server layer and not the route handlers.** Every Route Handler does
 * the same two things — `requireApiUser()`, then delegate — so the identity a
 * mutation receives is never in question; what is in question is what the
 * mutation does with it. Testing through the routes would mean faking a session,
 * and a test that stubs `auth()` proves the stub works. The queries and
 * mutations take `userId` as their first parameter precisely so the boundary can
 * be driven directly, which is what this does.
 *
 * **Two rules every case here follows.**
 *
 * The denial is a **404, never a 403** (§6, §8). A 403 confirms the row exists,
 * which tells a stranger something they should not learn; `expectDenied` asserts
 * the status, not just that something was thrown.
 *
 * And a denial is only meaningful if the target was reachable. "B gets 404" is
 * trivially true for an id that does not exist, so every case either reads the
 * row back afterwards or checks it with its owner's id — the assertion is
 * always "this row is right there, and the stranger still cannot have it".
 */

let fx: Fixtures;

beforeAll(async () => {
  fx = await createFixtures();
}, 60_000);

afterAll(async () => {
  await destroyFixtures();
}, 60_000);

const RESOLVED = Symbol("resolved");

async function thrownBy(attempt: () => Promise<unknown>): Promise<unknown> {
  try {
    await attempt();
    return RESOLVED;
  } catch (error) {
    return error;
  }
}

/**
 * The shape every cross-account call must produce: a `NotFoundError`, carrying a
 * 404 and `NOT_FOUND`. A 403 here would be a leak, so the status is asserted
 * rather than taken on trust from the class name.
 */
async function expectDenied(attempt: () => Promise<unknown>): Promise<void> {
  const error = await thrownBy(attempt);

  if (error === RESOLVED) {
    throw new Error("The call succeeded. A cross-account call must be refused, never carried out.");
  }

  expect(error).toBeInstanceOf(NotFoundError);
  expect((error as AppError).status).toBe(404);
  expect((error as AppError).code).toBe("NOT_FOUND");
}

async function expectRefused(
  attempt: () => Promise<unknown>,
  type: typeof ConflictError | typeof ValidationError,
  status: number,
): Promise<void> {
  const error = await thrownBy(attempt);

  if (error === RESOLVED) {
    throw new Error("The call succeeded when it should have been refused.");
  }

  expect(error).toBeInstanceOf(type);
  expect((error as AppError).status).toBe(status);
}

function idsOf(...lists: { id: string }[][]): string[] {
  return lists.flat().map((row) => row.id);
}

/**
 * An extra application for a test that has to destroy or re-parent one.
 *
 * The fixture's own application is shared by every case in the file, and its
 * children are not all recoverable from a snapshot — deleting it would cascade
 * the interview, assessment, note and task that `restoreApplication` does not
 * put back. So anything destructive gets its own row.
 */
async function scratchApplication(
  account: FixtureAccount,
  jobTitle: string,
  extra: { resumeId?: string; linkContactId?: string } = {},
): Promise<string> {
  const application = await prisma.application.create({
    data: {
      userId: account.userId,
      companyId: fx.seededCompany.id,
      jobTitle,
      status: "SAVED",
      resumeId: extra.resumeId ?? null,
    },
    select: { id: true },
  });

  if (extra.linkContactId) {
    await prisma.applicationContact.create({
      data: { applicationId: application.id, contactId: extra.linkContactId, role: "Recruiter" },
    });
  }

  return application.id;
}

/**
 * `acknowledgeDuplicate` is true in every payload below. The duplicate
 * confirmation is a product rule with its own tests, and leaving it unanswered
 * here would let a `ConfirmationRequiredError` stand in for the authorization
 * failure a case is meant to prove — a 409 passing as if it were a 404.
 */
function applicationUpdate(
  overrides: Partial<UpdateApplicationPayload> = {},
): UpdateApplicationPayload {
  return {
    companyName: fx.seededCompany.name,
    jobTitle: "Rewritten by a stranger",
    jobUrl: null,
    location: null,
    workMode: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    currency: "INR",
    priority: "LOW",
    source: null,
    appliedAt: null,
    deadline: null,
    jobDescription: null,
    resumeId: null,
    recruiterName: null,
    recruiterRole: null,
    recruiterEmail: null,
    recruiterPhone: null,
    acknowledgeDuplicate: true,
    ...overrides,
  };
}

function interviewPayload(overrides: Partial<InterviewPayload> = {}): InterviewPayload {
  return {
    type: "HR",
    scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    durationMinutes: 30,
    meetingUrl: null,
    interviewerName: "Rewritten by a stranger",
    prepNotes: null,
    notes: null,
    result: "PENDING",
    ...overrides,
  };
}

function assessmentPayload(overrides: Partial<AssessmentPayload> = {}): AssessmentPayload {
  return {
    name: "Rewritten by a stranger",
    provider: null,
    url: null,
    deadline: null,
    status: "COMPLETED",
    score: null,
    notes: null,
    ...overrides,
  };
}

function taskPayload(overrides: Partial<CreateTaskPayload> = {}): CreateTaskPayload {
  return {
    applicationId: null,
    title: "Rewritten by a stranger",
    description: null,
    dueDate: null,
    priority: "LOW",
    ...overrides,
  };
}

function contactPayload(overrides: Partial<ContactPayload> = {}): ContactPayload {
  return {
    name: "Rewritten by a stranger",
    role: null,
    email: null,
    phone: null,
    linkedinUrl: null,
    notes: null,
    acknowledgeDuplicate: true,
    ...overrides,
  };
}

function eventPayload(overrides: Partial<EventPayload> = {}): EventPayload {
  return {
    type: "FOLLOW_UP",
    title: "Written by a stranger",
    description: null,
    occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

const notePayload: NotePayload = { content: "Written by a stranger." };

describe("applications", () => {
  it("does not read another account's application", async () => {
    await expect(getApplication(fx.b.userId, fx.a.applicationId)).resolves.toBeNull();
    await expect(getApplicationForEdit(fx.b.userId, fx.a.applicationId)).resolves.toBeNull();

    // The same ids, asked for by their owner: the row is there, and the private
    // field proves a successful read would have carried something worth hiding.
    const mine = await getApplication(fx.a.userId, fx.a.applicationId);

    expect(mine?.jobDescription).toContain("Only account A should ever see this");
  });

  it("does not update another account's application", async () => {
    await expectDenied(() =>
      updateApplication(fx.b.userId, fx.a.applicationId, applicationUpdate()),
    );

    const after = await prisma.application.findFirst({
      where: { id: fx.a.applicationId },
      select: { userId: true, jobTitle: true, priority: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      jobTitle: "Fixture Engineer A",
      priority: "HIGH",
    });
  });

  it("does not move another account's application through the pipeline", async () => {
    const before = await prisma.applicationEvent.count({
      where: { applicationId: fx.a.applicationId },
    });

    await expectDenied(() => updateApplicationStatus(fx.b.userId, fx.a.applicationId, "OFFER"));

    const after = await prisma.application.findFirst({
      where: { id: fx.a.applicationId },
      select: { status: true },
    });

    expect(after?.status).toBe("APPLIED");

    // A status change writes a timeline event, and the event log is an
    // analytics input (§3). A refused change must leave no trace in it.
    await expect(
      prisma.applicationEvent.count({ where: { applicationId: fx.a.applicationId } }),
    ).resolves.toBe(before);
  });

  it("does not delete another account's application", async () => {
    await expectDenied(() => deleteApplication(fx.b.userId, fx.a.applicationId));

    await expect(
      prisma.application.count({ where: { id: fx.a.applicationId, userId: fx.a.userId } }),
    ).resolves.toBe(1);
  });

  it("does not let a replayed snapshot take over a live application", async () => {
    const scratchId = await scratchApplication(fx.a, "Snapshot replay target");
    const { snapshot } = await deleteApplication(fx.a.userId, scratchId);

    // Put it back where it belongs, so the id is live again and the replay below
    // is aimed at a real row rather than an empty one.
    await restoreApplication(fx.a.userId, snapshot);

    /*
     * B now replays A's snapshot. Ids are preserved on restore (§8), so this is
     * an attempt to write A's row from B's session — and what stops it is the
     * primary key, after the `alreadyThere` check has looked for the id *within
     * B's own rows* and correctly not found it.
     *
     * This case prints a `prisma:error ... Unique constraint failed` while
     * passing. That log is the defence working, not a fault: a refusal by
     * constraint is a refusal, and the row is read back below to prove the
     * attempt changed nothing.
     */
    const error = await thrownBy(() => restoreApplication(fx.b.userId, snapshot));

    expect(error).not.toBe(RESOLVED);

    const after = await prisma.application.findFirst({
      where: { id: scratchId },
      select: { userId: true },
    });

    expect(after?.userId).toBe(fx.a.userId);
  });

  it("takes the owner of a restored application from the session, never the snapshot", async () => {
    /*
     * A snapshot goes server → browser → server, so §4's third rule is the only
     * thing standing between it and a forged row. Reaching this state requires
     * holding A's delete response, which only A is ever sent — the test is not
     * that B can do this, it is that the identity and the two foreign keys are
     * taken from the session and re-checked rather than believed.
     */
    const scratchId = await scratchApplication(fx.a, "Cross-account restore", {
      resumeId: fx.a.resumeId,
      linkContactId: fx.a.contactId,
    });

    const { snapshot } = await deleteApplication(fx.a.userId, scratchId);

    expect(snapshot.application.resumeId).toBe(fx.a.resumeId);
    expect(snapshot.contacts.map((link) => link.contactId)).toEqual([fx.a.contactId]);

    await restoreApplication(fx.b.userId, snapshot);

    // Read unscoped on purpose: where the row actually landed is the question,
    // and a scoped read could not tell "not B's" from "nowhere".
    const restored = await prisma.application.findFirst({
      where: { id: scratchId },
      select: {
        userId: true,
        resumeId: true,
        contacts: { select: { contactId: true } },
      },
    });

    expect(restored?.userId).toBe(fx.b.userId);
    // A's resume and A's contact are the two ways this could have leaked. Both
    // are dropped rather than carried across.
    expect(restored?.resumeId).toBeNull();
    expect(restored?.contacts).toEqual([]);
  });

  it("refuses a restore whose company belongs to another account", async () => {
    const scratchId = await scratchApplication(fx.b, "Forged company restore");
    const { snapshot } = await deleteApplication(fx.b.userId, scratchId);

    const forged = {
      ...snapshot,
      application: { ...snapshot.application, companyId: fx.a.privateCompanyId },
    };

    // 409, not 404: nothing about B's own request is missing — the company named
    // in it is simply not one B can use.
    await expectRefused(() => restoreApplication(fx.b.userId, forged), ConflictError, 409);

    await expect(prisma.application.count({ where: { id: scratchId } })).resolves.toBe(0);
  });
});

describe("timeline entries", () => {
  it("does not add an entry to another account's application", async () => {
    await expectDenied(() =>
      createApplicationEvent(fx.b.userId, fx.a.applicationId, eventPayload()),
    );
  });

  it("does not stamp another account's first response", async () => {
    /*
     * An `EMAIL_RECEIVED` entry writes `firstResponseAt` (§3), which is a
     * denominator in the analytics and is written once and never cleared. A
     * stranger able to drive it could permanently skew another account's
     * response rate without creating anything visible.
     */
    const before = await prisma.application.findFirst({
      where: { id: fx.a.applicationId },
      select: { firstResponseAt: true },
    });

    await expectDenied(() =>
      createApplicationEvent(
        fx.b.userId,
        fx.a.applicationId,
        eventPayload({ type: "EMAIL_RECEIVED", title: "Reply from the recruiter" }),
      ),
    );

    const after = await prisma.application.findFirst({
      where: { id: fx.a.applicationId },
      select: { firstResponseAt: true },
    });

    expect(after?.firstResponseAt).toEqual(before?.firstResponseAt);
  });

  it("does not edit or delete another account's entry", async () => {
    await expectDenied(() =>
      updateApplicationEvent(fx.b.userId, fx.a.manualEventId, eventPayload()),
    );
    await expectDenied(() => deleteApplicationEvent(fx.b.userId, fx.a.manualEventId));

    const after = await prisma.applicationEvent.findFirst({
      where: { id: fx.a.manualEventId },
      select: { userId: true, title: true },
    });

    expect(after).toMatchObject({ userId: fx.a.userId, title: "Followed up — account A" });
  });
});

describe("interviews", () => {
  it("does not schedule a round on another account's application", async () => {
    const payload: CreateInterviewPayload = {
      ...interviewPayload(),
      applicationId: fx.a.applicationId,
    };

    await expectDenied(() => createInterview(fx.b.userId, payload));

    await expect(
      prisma.interview.count({ where: { applicationId: fx.a.applicationId } }),
    ).resolves.toBe(1);
  });

  it("does not read another account's round", async () => {
    await expect(getInterview(fx.b.userId, fx.a.interviewId)).resolves.toBeNull();

    const mine = await getInterview(fx.a.userId, fx.a.interviewId);

    expect(mine?.id).toBe(fx.a.interviewId);
  });

  it("does not update or delete another account's round", async () => {
    await expectDenied(() => updateInterview(fx.b.userId, fx.a.interviewId, interviewPayload()));
    await expectDenied(() => deleteInterview(fx.b.userId, fx.a.interviewId));

    const after = await prisma.interview.findFirst({
      where: { id: fx.a.interviewId },
      select: { userId: true, type: true, interviewerName: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      type: "TECHNICAL",
      interviewerName: "Interviewer A",
    });
  });

  it("refuses to restore another account's round into this one", async () => {
    const scratchId = await scratchApplication(fx.a, "Interview restore target");

    const interview = await prisma.interview.create({
      data: {
        userId: fx.a.userId,
        applicationId: scratchId,
        type: "SYSTEM_DESIGN",
        scheduledAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const { snapshot } = await deleteInterview(fx.a.userId, interview.id);

    /*
     * 409 rather than 404, and the distinction is §8's: the snapshot is
     * well-formed and the row is genuinely gone, but the application it names is
     * not B's, so restoring would mean an interview hanging off a parent its
     * owner cannot see. An orphan is a structural problem, not a missing row.
     */
    await expectRefused(() => restoreInterview(fx.b.userId, snapshot), ConflictError, 409);

    await expect(prisma.interview.count({ where: { id: interview.id } })).resolves.toBe(0);
  });

  it("keeps the lists and the application picker to one account", async () => {
    const lists = await listInterviews(fx.b.userId);

    expect(idsOf(lists.upcoming, lists.past)).not.toContain(fx.a.interviewId);

    const options = await listApplicationOptions(fx.b.userId);

    expect(idsOf(options)).not.toContain(fx.a.applicationId);
  });
});

describe("assessments", () => {
  it("does not add an assessment to another account's application", async () => {
    const payload: CreateAssessmentPayload = {
      ...assessmentPayload(),
      applicationId: fx.a.applicationId,
    };

    await expectDenied(() => createAssessment(fx.b.userId, payload));

    await expect(
      prisma.assessment.count({ where: { applicationId: fx.a.applicationId } }),
    ).resolves.toBe(1);
  });

  it("does not update or delete another account's assessment", async () => {
    await expectDenied(() => updateAssessment(fx.b.userId, fx.a.assessmentId, assessmentPayload()));
    await expectDenied(() => deleteAssessment(fx.b.userId, fx.a.assessmentId));

    const after = await prisma.assessment.findFirst({
      where: { id: fx.a.assessmentId },
      select: { userId: true, name: true, status: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      name: "Take-home A",
      status: "PENDING",
    });
  });

  it("refuses to restore another account's assessment into this one", async () => {
    const scratchId = await scratchApplication(fx.a, "Assessment restore target");

    const assessment = await prisma.assessment.create({
      data: {
        userId: fx.a.userId,
        applicationId: scratchId,
        name: "Online round",
        status: "PENDING",
      },
      select: { id: true },
    });

    const { snapshot } = await deleteAssessment(fx.a.userId, assessment.id);

    await expectRefused(() => restoreAssessment(fx.b.userId, snapshot), ConflictError, 409);

    await expect(prisma.assessment.count({ where: { id: assessment.id } })).resolves.toBe(0);
  });

  it("keeps the lists to one account", async () => {
    const lists = await listAssessments(fx.b.userId);

    expect(idsOf(lists.dueNow, lists.upcoming, lists.done)).not.toContain(fx.a.assessmentId);
  });
});

describe("notes", () => {
  it("does not write a note on another account's application", async () => {
    await expectDenied(() => createNote(fx.b.userId, fx.a.applicationId, notePayload));

    await expect(prisma.note.count({ where: { applicationId: fx.a.applicationId } })).resolves.toBe(
      1,
    );
  });

  it("does not edit or delete another account's note", async () => {
    await expectDenied(() => updateNote(fx.b.userId, fx.a.noteId, notePayload));
    await expectDenied(() => deleteNote(fx.b.userId, fx.a.noteId));

    const after = await prisma.note.findFirst({
      where: { id: fx.a.noteId },
      select: { userId: true, content: true },
    });

    expect(after?.userId).toBe(fx.a.userId);
    expect(after?.content).toContain("nobody else may read it");
  });
});

describe("tasks", () => {
  it("does not attach a task to another account's application", async () => {
    await expectDenied(() =>
      createTask(fx.b.userId, taskPayload({ applicationId: fx.a.applicationId })),
    );
  });

  it("does not re-parent its own task onto another account's application", async () => {
    /*
     * Tasks are the only child entity whose parent can change (§3 allows a
     * standalone task), which makes `applicationId` on update the one place in
     * the app where a request names a parent for a row the caller does own. That
     * is the IDOR this case exists for — the call is legitimate apart from the
     * one field.
     */
    await expectDenied(() =>
      updateTask(
        fx.b.userId,
        fx.b.standaloneTaskId,
        taskPayload({ title: "Mine, pointed at theirs", applicationId: fx.a.applicationId }),
      ),
    );

    const after = await prisma.task.findFirst({
      where: { id: fx.b.standaloneTaskId },
      select: { userId: true, applicationId: true, title: true },
    });

    expect(after).toMatchObject({
      userId: fx.b.userId,
      applicationId: null,
      title: "Update portfolio — B",
    });
  });

  it("does not update, complete or delete another account's task", async () => {
    await expectDenied(() => updateTask(fx.b.userId, fx.a.taskId, taskPayload()));
    await expectDenied(() => toggleTaskCompletion(fx.b.userId, fx.a.taskId, true));
    await expectDenied(() => deleteTask(fx.b.userId, fx.a.taskId));

    const after = await prisma.task.findFirst({
      where: { id: fx.a.taskId },
      select: { userId: true, title: true, isCompleted: true, completedAt: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      title: "Send thank-you note — A",
      isCompleted: false,
      completedAt: null,
    });
  });

  it("refuses to restore another account's task into this one", async () => {
    const { snapshot } = await deleteTask(fx.a.userId, fx.a.standaloneTaskId);

    /*
     * 404 here where an interview gets a 409, and §8 draws the line: a task's
     * parent is a nullable field rather than structural, so a parent that is not
     * the caller's is the same answer `updateTask` gives for the same input.
     */
    await expectDenied(() =>
      restoreTask(fx.b.userId, { ...snapshot, applicationId: fx.a.applicationId }),
    );

    // Put A's own task back, so the fixture is as it was.
    await restoreTask(fx.a.userId, snapshot);

    await expect(
      prisma.task.count({ where: { id: fx.a.standaloneTaskId, userId: fx.a.userId } }),
    ).resolves.toBe(1);
  });

  it("keeps the lists to one account", async () => {
    const lists = await listTasks(fx.b.userId);

    expect(idsOf(lists.overdue, lists.today, lists.upcoming, lists.completed)).not.toContain(
      fx.a.taskId,
    );
  });
});

describe("contacts", () => {
  it("does not update or delete another account's contact", async () => {
    await expectDenied(() => updateContact(fx.b.userId, fx.a.contactId, contactPayload()));
    await expectDenied(() => deleteContact(fx.b.userId, fx.a.contactId));

    const after = await prisma.contact.findFirst({
      where: { id: fx.a.contactId },
      select: { userId: true, name: true, email: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      name: "Recruiter A",
      email: fx.a.contactEmail,
    });
  });

  it("does not link across accounts in either direction", async () => {
    // Own application, someone else's contact — the form sends a `contactId`,
    // so this is the shape a forged request would take.
    await expectDenied(() =>
      linkContactToApplication(fx.b.userId, fx.b.applicationId, {
        contactId: fx.a.contactId,
        role: null,
      }),
    );

    // Own contact, someone else's application.
    await expectDenied(() =>
      linkContactToApplication(fx.b.userId, fx.a.applicationId, {
        contactId: fx.b.contactId,
        role: null,
      }),
    );

    await expect(
      prisma.applicationContact.count({ where: { contactId: fx.a.contactId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.applicationContact.count({ where: { applicationId: fx.b.applicationId } }),
    ).resolves.toBe(1);
  });

  it("does not unlink another account's contact", async () => {
    await expectDenied(() =>
      unlinkContactFromApplication(fx.b.userId, fx.a.applicationId, fx.a.contactId),
    );

    await expect(
      prisma.applicationContact.count({
        where: { applicationId: fx.a.applicationId, contactId: fx.a.contactId },
      }),
    ).resolves.toBe(1);
  });

  it("keeps the lists to one account", async () => {
    const all = await listContacts(fx.b.userId);
    const linkable = await listLinkableContacts(fx.b.userId, fx.b.applicationId);

    expect(idsOf(all)).not.toContain(fx.a.contactId);
    expect(idsOf(linkable)).not.toContain(fx.a.contactId);
  });
});

describe("resumes", () => {
  it("does not hand out another account's file", async () => {
    /*
     * §7's done-when for Phase 4 is "a PDF round-trips through Supabase with
     * authorization enforced", and this is where the enforcing happens.
     * `getResumeFile` is the only read in the app that selects `storagePath`,
     * and the signing function it feeds checks nothing — so this WHERE clause
     * *is* the authorization on every resume download and preview.
     */
    await expect(getResumeFile(fx.b.userId, fx.a.resumeId)).resolves.toBeNull();

    const mine = await getResumeFile(fx.a.userId, fx.a.resumeId);

    expect(mine?.storagePath).toContain(fx.a.userId);
  });

  it("does not hand out a soft-deleted file, even to its owner", async () => {
    // The row survives a delete so history reads "(deleted)" (§8), but the file
    // is genuinely gone — a signed URL for it would resolve to nothing.
    await expect(getResumeFile(fx.a.userId, fx.a.deletedResumeId)).resolves.toBeNull();
  });

  it("does not rename, re-default or delete another account's resume", async () => {
    await expectDenied(() => renameResume(fx.b.userId, fx.a.resumeId, "Taken over"));
    await expectDenied(() => setResumeDefault(fx.b.userId, fx.a.resumeId, false));
    // Refused before `removeResumeFile` is reached, which is why this case needs
    // no bucket: the ownership read is the first thing the mutation does.
    await expectDenied(() => deleteResume(fx.b.userId, fx.a.resumeId));

    const after = await prisma.resume.findFirst({
      where: { id: fx.a.resumeId },
      select: { userId: true, label: true, isDefault: true, deletedAt: true },
    });

    expect(after).toMatchObject({
      userId: fx.a.userId,
      label: "Resume A",
      isDefault: true,
      deletedAt: null,
    });
  });

  it("does not pull another account's resume into the picker", async () => {
    /*
     * `currentId` is the one parameter in the resume reads that is allowed to
     * name a *deleted* row, which makes it the one place a foreign id could be
     * smuggled in. The owner gets their deleted resume back — that asymmetry is
     * what keeps an edit from clearing a record the soft delete exists to keep —
     * and a stranger passing the same id gets nothing.
     */
    const theirs = await listResumeOptions(fx.b.userId, fx.a.deletedResumeId);

    expect(idsOf(theirs)).not.toContain(fx.a.deletedResumeId);
    expect(idsOf(theirs)).not.toContain(fx.a.resumeId);

    const mine = await listResumeOptions(fx.a.userId, fx.a.deletedResumeId);

    expect(idsOf(mine)).toContain(fx.a.deletedResumeId);
    expect(mine.find((option) => option.id === fx.a.deletedResumeId)?.isDeleted).toBe(true);

    expect(idsOf(await listResumes(fx.b.userId))).not.toContain(fx.a.resumeId);
  });

  it("does not attach another account's resume to an application", async () => {
    /*
     * `resumeId` arrives in a request body, so this read is the only thing
     * between a forged id and an application claiming it was sent with a
     * stranger's resume. A `ValidationError` rather than a 404 because the field
     * is on a form and the realistic cause is a stale page.
     */
    await expectRefused(
      () =>
        updateApplication(
          fx.b.userId,
          fx.b.applicationId,
          applicationUpdate({ jobTitle: "Fixture Engineer B", resumeId: fx.a.resumeId }),
        ),
      ValidationError,
      400,
    );

    const after = await prisma.application.findFirst({
      where: { id: fx.b.applicationId },
      select: { resumeId: true, jobTitle: true },
    });

    // Nothing was written: the check runs before the update, inside the
    // transaction, so the rest of the edit rolled back with it.
    expect(after).toMatchObject({ resumeId: null, jobTitle: "Fixture Engineer B" });
  });
});

describe("notifications", () => {
  it("does not mark another account's notification read", async () => {
    await expectDenied(() => markNotificationRead(fx.b.userId, fx.a.notificationId));

    const after = await prisma.notification.findFirst({
      where: { id: fx.a.notificationId },
      select: { userId: true, isRead: true },
    });

    expect(after).toMatchObject({ userId: fx.a.userId, isRead: false });
  });

  it("marks all read for one account only", async () => {
    /*
     * The only account-wide write in the app, and the one with no id to get
     * wrong — so the `userId` in its WHERE clause is the entire boundary. A
     * missing one would silently clear every account's inbox, which no
     * single-row test would notice.
     */
    await markAllNotificationsRead(fx.b.userId);

    const after = await prisma.notification.findFirst({
      where: { id: fx.a.notificationId },
      select: { isRead: true },
    });

    expect(after?.isRead).toBe(false);
  });

  it("keeps the inbox and the bell count to one account", async () => {
    const inbox = await getNotificationInbox(fx.b.userId);

    expect(idsOf(inbox.upcoming, inbox.past)).not.toContain(fx.a.notificationId);
    await expect(prisma.notification.count({ where: { userId: fx.b.userId } })).resolves.toBe(
      inbox.total,
    );

    const counts = await getNotificationBellCounts(fx.b.userId);

    // B's own notification was marked read above, so a leaking count is the only
    // thing that could make this non-zero.
    expect(counts.unread).toBe(0);
  });
});

describe("companies", () => {
  it("does not surface another account's private company in autocomplete", async () => {
    /*
     * §8 names this separately from IDOR, and it is a subtler leak: a company is
     * created by typing a name no seed list has, so the name itself can be the
     * secret — a stealth startup, or an employer the user has told nobody about.
     */
    const theirs = await searchCompanies(fx.b.userId, fx.a.privateCompanyName);

    expect(theirs.map((company) => company.id)).not.toContain(fx.a.privateCompanyId);

    const mine = await searchCompanies(fx.a.userId, fx.a.privateCompanyName);

    expect(mine.map((company) => company.id)).toContain(fx.a.privateCompanyId);
  });

  it("surfaces seeded companies to everyone", async () => {
    // The other half of the two-tier rule (§3): a leak test that passed because
    // search returns nothing would be worthless.
    const results = await searchCompanies(fx.b.userId, fx.seededCompany.name);

    expect(results.map((company) => company.id)).toContain(fx.seededCompany.id);
  });
});

describe("aggregate reads", () => {
  /**
   * Counts and rates are where a missing `userId` hides best: the page still
   * renders, nothing is attributed to the wrong person, and the only symptom is
   * a number that is too big. So each of these compares against the account's
   * own rows rather than a literal — which also keeps them indifferent to the
   * scratch rows other cases in this file create.
   */
  it("counts only its own applications in the facets and the dashboard", async () => {
    const mine = await prisma.application.count({ where: { userId: fx.b.userId } });

    await expect(getApplicationFacets(fx.b.userId)).resolves.toMatchObject({ total: mine });
    await expect(getDashboardSummary(fx.b.userId)).resolves.toMatchObject({
      totalApplications: mine,
    });
  });

  it("counts only its own applications in the analytics", async () => {
    const mine = await prisma.application.count({ where: { userId: fx.b.userId } });

    await expect(getAnalytics(fx.b.userId)).resolves.toMatchObject({ total: mine });
  });

  it("keeps the list, the board and the dashboard action lists to one account", async () => {
    const list = await listApplications(fx.b.userId, EMPTY_APPLICATION_FILTERS);

    expect(idsOf(list.items)).not.toContain(fx.a.applicationId);

    const board = await getBoardColumns(fx.b.userId, EMPTY_APPLICATION_FILTERS);

    expect(idsOf(board.flatMap((column) => column.items))).not.toContain(fx.a.applicationId);

    const actions = await getDashboardActions(fx.b.userId);

    expect(idsOf(actions.upcomingInterviews)).not.toContain(fx.a.interviewId);
    expect(idsOf(actions.dueAssessments)).not.toContain(fx.a.assessmentId);
    expect(idsOf(actions.pressingTasks)).not.toContain(fx.a.taskId);
  });
});

describe("settings", () => {
  it("writes only the account it was called for", async () => {
    /*
     * The one place a bare-id `update` is correct, because the id comes from the
     * session rather than a request — there is no `userId` field in
     * `settingsSchema` to smuggle one in. This case is what makes that safe to
     * rely on.
     */
    await updateSettings(fx.b.userId, {
      notifyInterviews: false,
      notifyAssessments: false,
      notifyDeadlines: false,
      notifyTasks: false,
      reminderHours: 72,
      defaultView: "TABLE",
      timezone: "America/New_York",
    });

    const untouched = await prisma.user.findFirst({
      where: { id: fx.a.userId },
      select: { notifyInterviews: true, reminderHours: true, timezone: true, defaultView: true },
    });

    expect(untouched).toMatchObject({
      notifyInterviews: true,
      reminderHours: 24,
      timezone: "Asia/Kolkata",
      defaultView: "KANBAN",
    });
  });
});

describe("what even the owner may not do", () => {
  /**
   * The one rule in the app that is not about who is asking. Automatic timeline
   * entries are the analytics input §3 computes "ever reached INTERVIEW" from,
   * and the log is append-only — so a hand-edited `STATUS_CHANGE` is a
   * transition that never happened, recorded as indistinguishable from one that
   * did. The owner is refused along with everyone else.
   *
   * **409, deliberately not 404**, and this is the single place the app departs
   * from 404-for-everything: the row is the caller's own and is on their screen,
   * so "not found" would read as a bug in the product rather than an answer.
   */
  it("refuses to edit or delete an automatic entry", async () => {
    await expectRefused(
      () => updateApplicationEvent(fx.a.userId, fx.a.automaticEventId, eventPayload()),
      ConflictError,
      409,
    );

    await expectRefused(
      () => deleteApplicationEvent(fx.a.userId, fx.a.automaticEventId),
      ConflictError,
      409,
    );

    const after = await prisma.applicationEvent.findFirst({
      where: { id: fx.a.automaticEventId },
      select: { title: true, isAutomatic: true },
    });

    expect(after).toMatchObject({ title: "Moved to Applied", isAutomatic: true });
  });
});
