import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";
import { prisma } from "@/server/db";

/**
 * The two-account fixture the authorization suite runs against
 * (DESIGN.md §7, Phase 5 — "User A vs User B across every entity").
 *
 * **Why this is database-backed and not mocked.** The rule being tested is §4's:
 * ownership lives in the `WHERE` clause, never in a check beside it. A mocked
 * Prisma client would assert that the application *asked* for
 * `{ id, userId }` — which is a restatement of the code, not a test of it. Only
 * a real database can answer "does the row actually come back", and that is the
 * only question worth asking of an isolation boundary.
 *
 * So the suite needs two real accounts with a full set of rows each, and it is
 * responsible for leaving the database exactly as it found it.
 *
 * **Three things keep that safe.**
 *
 * 1. Both accounts live under `@authz.careertrack.invalid`. `.invalid` is
 *    reserved by RFC 2606 and can never be a deliverable address, so no real
 *    person's account can ever land in this fixture's blast radius. Teardown
 *    selects on that domain, so the `WHERE` clause is the guard — the same
 *    discipline the suite is testing.
 * 2. `createFixtures` tears down before it builds. A run killed halfway through
 *    leaves rows behind, and the unique constraint on `User.email` would then
 *    fail the *next* run with a confusing error instead of recovering.
 * 3. Applications point at a **seeded** company rather than creating one, so the
 *    fixture adds nothing to the shared company table in the normal case.
 *    Teardown still sweeps user-created companies, because a mutation under test
 *    (`updateApplication` resolving a new name) can create one.
 *
 * This database is shared with the deployed app, so none of the above is
 * theoretical. Treat an edit to the email domain or the teardown order as a
 * change to a safety mechanism.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The reserved domain every fixture account sits under, and the only thing
 * teardown will delete. See the note above before changing it.
 */
export const FIXTURE_EMAIL_DOMAIN = "@authz.careertrack.invalid";

/** Which of the two accounts a row belongs to. Appears in every fixture value,
 * so a failure message says whose row the assertion was about. */
type FixtureLabel = "A" | "B";

/**
 * One account and one row of every kind it owns.
 *
 * Every id here is a target for the suite: the test calls the real query or
 * mutation with the *other* account's user id and asserts it comes back empty or
 * throws. Ids are returned rather than looked up in the test so that a test
 * failing means the authorization rule broke, never that the fixture moved.
 */
export type FixtureAccount = {
  label: FixtureLabel;
  userId: string;
  email: string;

  applicationId: string;
  /** A hand-written timeline entry, which its owner may edit. */
  manualEventId: string;
  /** A `STATUS_CHANGE` entry, which nobody may edit — not even its owner. */
  automaticEventId: string;
  interviewId: string;
  interviewScheduledAt: Date;
  assessmentId: string;
  noteId: string;
  /** Attached to `applicationId`. */
  taskId: string;
  /** No parent application — the one child entity §3 allows to stand alone. */
  standaloneTaskId: string;
  contactId: string;
  contactEmail: string;
  resumeId: string;
  /** Soft-deleted: the row survives, the file is notionally gone (§8). */
  deletedResumeId: string;
  notificationId: string;

  /**
   * A company only this account can see (`createdByUserId` set), which is what
   * §8's "cross-user autocomplete leakage" defence is tested against.
   */
  privateCompanyId: string;
  privateCompanyName: string;
};

export type Fixtures = {
  a: FixtureAccount;
  b: FixtureAccount;
  /** Shared, visible to everyone, and owned by neither account. */
  seededCompany: { id: string; name: string };
};

/**
 * Builds both accounts. Safe to call when a previous run left rows behind.
 */
export async function createFixtures(): Promise<Fixtures> {
  await destroyFixtures();

  const seededCompany = await prisma.company.findFirst({
    where: { createdByUserId: null },
    select: { id: true, name: true },
    // Deterministic, so a failure message names the same company every run.
    orderBy: { nameNormalized: "asc" },
  });

  if (!seededCompany) {
    throw new Error(
      "No seeded company found — run `npm run db:seed`. The authorization fixture attaches its " +
        "applications to a seeded company so that it never has to create one of its own.",
    );
  }

  const [a, b] = await Promise.all([
    createAccount("A", seededCompany.id),
    createAccount("B", seededCompany.id),
  ]);

  return { a, b, seededCompany };
}

async function createAccount(label: FixtureLabel, companyId: string): Promise<FixtureAccount> {
  const slug = label.toLowerCase();

  const user = await prisma.user.create({
    data: {
      email: `${slug}${FIXTURE_EMAIL_DOMAIN}`,
      name: `Authorization fixture ${label}`,
      // Otherwise the `(app)` layout's onboarding gate would be the thing under
      // test, which is a different rule.
      onboardingCompleted: true,
    },
    select: { id: true, email: true },
  });

  const privateCompanyName = `Authz Private Holdings ${label}`;
  const contactEmail = `recruiter-${slug}${FIXTURE_EMAIL_DOMAIN}`;

  const [privateCompany, contact, resume, deletedResume] = await Promise.all([
    prisma.company.create({
      data: {
        name: privateCompanyName,
        nameNormalized: normalizeCompanyName(privateCompanyName),
        createdByUserId: user.id,
      },
      select: { id: true, name: true },
    }),

    prisma.contact.create({
      data: {
        userId: user.id,
        name: `Recruiter ${label}`,
        role: "Talent Partner",
        email: contactEmail,
        phone: "+91 90000 0000",
        notes: `Private to account ${label}.`,
      },
      select: { id: true },
    }),

    /*
     * `storagePath` names an object that was never uploaded, and that is
     * deliberate. Everything the suite checks about a resume is decided before
     * any storage call — `getResumeFile` is the ownership boundary and the
     * signing function trusts whatever path it is handed — so the fixture does
     * not need, and must not require, a reachable Supabase bucket.
     */
    prisma.resume.create({
      data: {
        userId: user.id,
        label: `Resume ${label}`,
        fileName: `resume-${slug}.pdf`,
        storagePath: `${user.id}/authz-fixture-never-uploaded.pdf`,
        fileSize: 1024,
        mimeType: "application/pdf",
        isDefault: true,
      },
      select: { id: true },
    }),

    prisma.resume.create({
      data: {
        userId: user.id,
        label: `Deleted resume ${label}`,
        fileName: `old-resume-${slug}.pdf`,
        storagePath: `${user.id}/authz-fixture-deleted.pdf`,
        fileSize: 2048,
        mimeType: "application/pdf",
        deletedAt: new Date(),
      },
      select: { id: true },
    }),
  ]);

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      companyId,
      jobTitle: `Fixture Engineer ${label}`,
      location: "Bengaluru",
      status: "APPLIED",
      priority: "HIGH",
      source: "REFERRAL",
      appliedAt: new Date(Date.now() - 30 * DAY_MS),
      jobDescription: `Only account ${label} should ever see this description.`,
    },
    select: { id: true },
  });

  const interviewScheduledAt = new Date(Date.now() + 3 * DAY_MS);

  const [manualEvent, automaticEvent, interview, assessment, note, task, standaloneTask] =
    await Promise.all([
      prisma.applicationEvent.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          type: "FOLLOW_UP",
          title: `Followed up — account ${label}`,
          occurredAt: new Date(Date.now() - 7 * DAY_MS),
          isAutomatic: false,
        },
        select: { id: true },
      }),

      prisma.applicationEvent.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          type: "STATUS_CHANGE",
          title: "Moved to Applied",
          description: "From Saved",
          occurredAt: new Date(Date.now() - 30 * DAY_MS),
          isAutomatic: true,
        },
        select: { id: true },
      }),

      prisma.interview.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          type: "TECHNICAL",
          scheduledAt: interviewScheduledAt,
          interviewerName: `Interviewer ${label}`,
          prepNotes: `Account ${label}'s private preparation notes.`,
        },
        select: { id: true },
      }),

      prisma.assessment.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          name: `Take-home ${label}`,
          provider: "HackerRank",
          deadline: new Date(Date.now() + 2 * DAY_MS),
          status: "PENDING",
        },
        select: { id: true },
      }),

      prisma.note.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          content: `Account ${label} wrote this and nobody else may read it.`,
        },
        select: { id: true },
      }),

      prisma.task.create({
        data: {
          userId: user.id,
          applicationId: application.id,
          title: `Send thank-you note — ${label}`,
          dueDate: new Date(Date.now() + DAY_MS),
          priority: "HIGH",
        },
        select: { id: true },
      }),

      prisma.task.create({
        data: {
          userId: user.id,
          applicationId: null,
          title: `Update portfolio — ${label}`,
          priority: "LOW",
        },
        select: { id: true },
      }),
    ]);

  await prisma.applicationContact.create({
    data: { applicationId: application.id, contactId: contact.id, role: "Recruiter" },
  });

  const notification = await prisma.notification.create({
    data: {
      userId: user.id,
      type: "INTERVIEW_UPCOMING",
      title: `Technical interview — account ${label}`,
      entityType: "INTERVIEW",
      entityId: interview.id,
      linkUrl: `/applications/${application.id}`,
      triggerAt: new Date(interviewScheduledAt.getTime() - DAY_MS),
      eventAt: interviewScheduledAt,
    },
    select: { id: true },
  });

  return {
    label,
    userId: user.id,
    email: user.email,
    applicationId: application.id,
    manualEventId: manualEvent.id,
    automaticEventId: automaticEvent.id,
    interviewId: interview.id,
    interviewScheduledAt,
    assessmentId: assessment.id,
    noteId: note.id,
    taskId: task.id,
    standaloneTaskId: standaloneTask.id,
    contactId: contact.id,
    contactEmail,
    resumeId: resume.id,
    deletedResumeId: deletedResume.id,
    notificationId: notification.id,
    privateCompanyId: privateCompany.id,
    privateCompanyName: privateCompany.name,
  };
}

/**
 * Removes every row belonging to a fixture account, and nothing else.
 *
 * **The order is load-bearing, not tidiness.** `Application.company` and
 * `Application.resume` are `onDelete: Restrict` (§3) — deleting an application is
 * not a reason to delete the company it was at — so a company or resume cannot
 * go while an application still points at it. Deleting the user first would
 * cascade towards both at once and could trip that restriction. Applications
 * therefore go first, which also cascades the timeline, interviews, assessments,
 * notes, attached tasks and contact links with them.
 *
 * Standalone tasks need their own sweep: their parent is nullable, so there is no
 * application to cascade from.
 */
export async function destroyFixtures(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: FIXTURE_EMAIL_DOMAIN } },
    select: { id: true },
  });

  if (users.length === 0) {
    return;
  }

  const userId = { in: users.map((user) => user.id) };

  await prisma.application.deleteMany({ where: { userId } });
  await prisma.task.deleteMany({ where: { userId } });
  await prisma.resume.deleteMany({ where: { userId } });
  await prisma.contact.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  // Includes anything a mutation under test created by resolving a new name.
  await prisma.company.deleteMany({ where: { createdByUserId: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}
