import { Prisma } from "@prisma/client";

import { NotFoundError } from "@/lib/api/errors";
import { RESUME_MIME_BY_KIND, type ResumeFileKind } from "@/lib/constants/resume";

import { TRANSACTION_OPTIONS, prisma } from "../db";
import {
  buildResumeStoragePath,
  removeResumeFile,
  uploadResumeFile,
} from "../services/resume-storage";

/**
 * Resume writes (DESIGN.md §6, §7 Phase 4).
 *
 * **The only mutations in the app that touch two systems**, and that is what
 * shapes every function here. A file lives in Supabase and a row lives in
 * Postgres, there is no transaction spanning them, so each of the two writes
 * needs an order chosen for what happens when the second one fails. Those choices
 * are the interesting part of this module and each is argued at its call site.
 *
 * The rule that does carry over unchanged is §4's: ownership lives in the WHERE
 * clause. `findFirst({ id, userId })` everywhere, 404 rather than 403, and the
 * storage path is only ever read from a row that query returned — so the file
 * operations never need an identity check of their own.
 */

/** Narrowed like the resolver services', so the helper reads either client. */
type ResumeClient = Pick<Prisma.TransactionClient, "resume">;

export type WrittenResume = {
  id: string;
  label: string;
  isDefault: boolean;
};

const writtenSelect = { id: true, label: true, isDefault: true } as const;

/**
 * Stores a file and records it.
 *
 * **The upload happens first, outside the transaction.** Two reasons, and the
 * second is the load-bearing one:
 *
 * - Network I/O inside a database transaction holds a connection open for the
 *   duration of a 5 MB upload. `TRANSACTION_OPTIONS` allows 20 seconds, so it
 *   would usually fit — "usually" being the problem.
 * - The failure that must not happen is a row pointing at a file that is not
 *   there, because that row is unreadable and undeletable-looking forever. The
 *   opposite failure — a file with no row — is invisible garbage in a private
 *   bucket, and is cleaned up below anyway.
 *
 * So: upload, then insert, and if the insert fails, delete what was just
 * uploaded. The compensating delete is best-effort and deliberately swallowed —
 * it runs while another error is already on its way to the caller, and replacing
 * a useful "could not save that resume" with a storage error from the cleanup
 * would hide the real fault.
 */
export async function createResume(
  userId: string,
  input: {
    label: string;
    fileName: string;
    kind: ResumeFileKind;
    bytes: Uint8Array;
  },
): Promise<WrittenResume> {
  const mimeType = RESUME_MIME_BY_KIND[input.kind];

  // Generated here, from nothing the user sent. See `buildResumeStoragePath`.
  const storagePath = buildResumeStoragePath(userId, input.kind);

  await uploadResumeFile({ path: storagePath, bytes: input.bytes, mimeType });

  try {
    return await prisma.$transaction(async (tx) => {
      /*
       * The first resume becomes the default, and nothing afterwards does.
       *
       * Without this, `isDefault` would stay false for every user who never
       * found the control, and "default" would be a feature that only works
       * once someone goes looking for it. Promoting the *first* upload is the
       * only guess that is always right: with one resume on file, it is the one
       * that gets sent.
       */
      const existingDefault = await tx.resume.findFirst({
        where: { userId, deletedAt: null, isDefault: true },
        select: { id: true },
      });

      const resume = await tx.resume.create({
        data: {
          userId,
          label: input.label,
          fileName: input.fileName,
          storagePath,
          fileSize: input.bytes.length,
          mimeType,
          isDefault: existingDefault === null,
        },
        select: writtenSelect,
      });

      /*
       * Holds "at most one default" against the race the read above cannot:
       * two concurrent first uploads can both find no default and both claim
       * it. Last writer wins, which is arbitrary but leaves exactly one — and
       * is free on the normal path, where it matches no rows.
       */
      if (resume.isDefault) {
        await clearOtherDefaults(tx, userId, resume.id);
      }

      return resume;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    await removeResumeFile(storagePath).catch(() => {
      // Nothing useful to do with this. The object is orphaned in a private
      // bucket; the caller's original error is the one worth reporting.
    });

    throw error;
  }
}

/**
 * Renames a resume. The file is untouched — a label is the user's name for a
 * version, and `fileName` keeps whatever they uploaded.
 */
export async function renameResume(
  userId: string,
  resumeId: string,
  label: string,
): Promise<WrittenResume> {
  const existing = await prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Resume not found");
  }

  return prisma.resume.update({
    where: { id: existing.id },
    data: { label },
    select: writtenSelect,
  });
}

/**
 * Sets or clears the default resume.
 *
 * **Its own mutation and its own endpoint**, rather than a field on the rename
 * PATCH, for the reason that already put `isCompleted` on `/tasks/:id/completion`
 * and `status` on `/applications/:id/status`: the write maintains an invariant
 * across *other* rows. Setting one default has to unset the previous one, and a
 * general field update that happened to carry `isDefault: true` would leave two.
 *
 * A deleted resume cannot be made the default — the file is gone, so it is not
 * something that can be sent — and `deleteResume` clears the flag for the same
 * reason.
 */
export async function setResumeDefault(
  userId: string,
  resumeId: string,
  isDefault: boolean,
): Promise<WrittenResume> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.resume.findFirst({
      where: { id: resumeId, userId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundError("Resume not found");
    }

    if (isDefault) {
      await clearOtherDefaults(tx, userId, existing.id);
    }

    return tx.resume.update({
      where: { id: existing.id },
      data: { isDefault },
      select: writtenSelect,
    });
  }, TRANSACTION_OPTIONS);
}

export type DeletedResume = {
  id: string;
  label: string;
  /** How many applications still name this version. */
  applicationCount: number;
};

/**
 * Soft delete: the file goes, the row stays (§9, and §3's note on the model).
 *
 * This is the decision the whole feature was designed around. A hard delete would
 * have to either refuse while any application still points at the row — the
 * relation is `onDelete: Restrict` precisely so it cannot silently cascade — or
 * erase which version got the interview, which was the point of storing resumes
 * at all. So the record survives and renders as "Frontend Resume (deleted)", and
 * the document itself is really removed, because keeping a file the user asked to
 * delete would be a promise quietly broken.
 *
 * **The file is removed before the row is stamped**, and the order is a judgment
 * call rather than an obvious one. If the stamp then fails, the resume is still
 * listed but its download 404s, and clicking delete again fixes it — storage
 * removal is idempotent, so the retry converges. The other order fails the other
 * way: the row reads as deleted while the document is still sitting in the
 * bucket, and nothing would ever come back to remove it. Between a visible
 * inconsistency that a retry repairs and an invisible one that silently keeps a
 * deleted file, the first is better.
 *
 * `isDefault` is cleared, because a resume with no file is not one that can be
 * sent. No other resume is promoted to take its place — which one the user wants
 * is a question with no obvious answer, and guessing would quietly change what
 * every new application defaults to.
 *
 * One measured consequence of that order, for whoever reads this next: in the
 * window where the removal succeeded and the stamp did not, a download of the
 * still-listed resume answers **500, not 404**. Supabase validates an object's
 * existence when it signs a URL rather than when one is followed (see
 * `createResumeDownloadUrl`), so the failure lands in our code. That is the
 * honest status for a genuinely inconsistent server state, and the retry above
 * is the fix — but it is not the 404 one would guess.
 */
export async function deleteResume(userId: string, resumeId: string): Promise<DeletedResume> {
  const existing = await prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
    select: {
      id: true,
      label: true,
      storagePath: true,
      _count: { select: { applications: true } },
    },
  });

  if (!existing) {
    throw new NotFoundError("Resume not found");
  }

  await removeResumeFile(existing.storagePath);

  await prisma.resume.update({
    where: { id: existing.id },
    /*
     * `storagePath` is deliberately left as it was, pointing at an object that
     * no longer exists. Nothing reads it — `getResumeFile` filters on
     * `deletedAt: null` — and keeping it means a bucket audit can still say
     * which row an orphaned object belonged to. The column is non-nullable in
     * any case.
     */
    data: { deletedAt: new Date(), isDefault: false },
  });

  return {
    id: existing.id,
    label: existing.label,
    applicationCount: existing._count.applications,
  };
}

/**
 * Takes the default flag off every *other* resume of this user's.
 *
 * `updateMany` with the flag in the WHERE clause, so it writes only the rows that
 * actually hold it — on the normal path that is one row, or none.
 */
async function clearOtherDefaults(tx: ResumeClient, userId: string, keepId: string): Promise<void> {
  await tx.resume.updateMany({
    where: { userId, isDefault: true, id: { not: keepId } },
    data: { isDefault: false },
  });
}
