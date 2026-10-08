import { Prisma } from "@prisma/client";

import { prisma } from "../db";

/**
 * Resume reads: the `/resumes` page, the download route, and the picker on the
 * application form (DESIGN.md §6, §7 Phase 4).
 *
 * **Soft delete is the organising fact of this module.** The row survives a
 * delete so that an application can still say which version was sent, which means
 * every read has to decide for itself whether it wants the deleted ones — and
 * three of the four here do not. `deletedAt: null` is therefore in the WHERE
 * clause beside `userId`, not applied afterwards, and the `[userId, deletedAt]`
 * index (§3) exists for exactly that pair.
 *
 * The one read that *does* want a deleted row is `listResumeOptions`, and the
 * reason is in its own note: an edit form that silently dropped a deleted resume
 * would destroy the record the soft delete exists to keep.
 *
 * `storagePath` appears in exactly one select — `getResumeFile` — because §3 says
 * it never reaches the browser. Everything the page renders comes from the other
 * columns.
 */

const resumeListSelect = {
  id: true,
  label: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  isDefault: true,
  createdAt: true,
  /**
   * How many applications were sent with this version.
   *
   * It is the one number on the row that makes the list more than a file
   * manager, and it is what the delete dialog needs in order to say "used by 5
   * applications" *before* the user confirms (§6) rather than afterwards.
   *
   * Counted in the database rather than by fetching the applications, because
   * nothing on this page renders them.
   */
  _count: { select: { applications: true } },
} satisfies Prisma.ResumeSelect;

export type ResumeListItem = Prisma.ResumeGetPayload<{ select: typeof resumeListSelect }>;

/**
 * A bound rather than a feature, like `ASSESSMENT_LIMIT`. Nobody keeps two
 * hundred versions of their resume, and if anyone does, the hundredth is not the
 * one they are looking for.
 */
export const RESUME_LIMIT = 100;

/**
 * Every live resume, default first.
 *
 * **Default first, then newest.** The default is the answer to "which one do I
 * usually send", so it belongs at the top where it can be confirmed at a glance;
 * everything after it is in the order it was uploaded, newest first, because a
 * new version supersedes an old one. Tie-broken on `id` so two uploads in the
 * same millisecond cannot swap places between renders — the same discipline as
 * every other list in the app.
 */
export async function listResumes(userId: string): Promise<ResumeListItem[]> {
  return prisma.resume.findMany({
    where: { userId, deletedAt: null },
    select: resumeListSelect,
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: RESUME_LIMIT,
  });
}

export type ResumeFile = {
  storagePath: string;
  fileName: string;
  /** What the preview route checks before signing an inline URL. */
  mimeType: string;
};

/**
 * What the download and preview routes need, and the only read in the app that
 * selects `storagePath`.
 *
 * `findFirst({ id, userId })`, never `findUnique({ id })` — the §4 rule, and this
 * is the single most important place in Phase 4 for it to hold. The path it
 * returns is handed straight to a signing function that does not check anything,
 * so this WHERE clause *is* the authorization on every resume download. A wrong
 * id and another user's id both come back null, which the route turns into a 404
 * rather than a 403 (§6).
 *
 * `deletedAt: null` is part of that, not a tidy-up: the file behind a deleted row
 * is genuinely gone, so a signed URL for it would resolve to nothing. A 404 is
 * both the honest answer and the same one a stranger's id gets.
 */
export async function getResumeFile(userId: string, resumeId: string): Promise<ResumeFile | null> {
  return prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
    select: { storagePath: true, fileName: true, mimeType: true },
  });
}

export type ResumeOption = {
  id: string;
  label: string;
  fileName: string;
  isDefault: boolean;
  /** True for the one deleted row `currentId` may have pulled in. */
  isDeleted: boolean;
};

/**
 * The choices for the resume picker on the application form.
 *
 * **`currentId` is why this is not just `listResumes` with fewer columns.** An
 * application that was sent with a resume the user has since deleted still points
 * at it — that is the entire point of the soft delete — and the edit form has to
 * offer that row as a choice, or the select would open on a value it does not
 * contain, show nothing, and quietly clear the link on the next save. The record
 * the feature exists to preserve would be destroyed by the form that displays it.
 *
 * So exactly one deleted resume can appear here, the one already attached, marked
 * so the UI can render it as "Frontend Resume (deleted)" (§3). Deleted resumes are
 * otherwise invisible: they are not offered on the create form, and not to any
 * other application. `updateApplication` enforces the same rule independently —
 * this is what keeps the form from offering something the server would refuse.
 */
export async function listResumeOptions(
  userId: string,
  currentId: string | null = null,
): Promise<ResumeOption[]> {
  const resumes = await prisma.resume.findMany({
    where: {
      userId,
      ...(currentId ? { OR: [{ deletedAt: null }, { id: currentId }] } : { deletedAt: null }),
    },
    select: { id: true, label: true, fileName: true, isDefault: true, deletedAt: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: RESUME_LIMIT,
  });

  return resumes.map(({ deletedAt, ...resume }) => ({
    ...resume,
    isDeleted: deletedAt !== null,
  }));
}
