import { NotFoundError } from "@/lib/api/errors";
import type { NotePayload } from "@/lib/validations/note";

import { prisma } from "../db";

/**
 * Note writes (DESIGN.md §6, §7 Phase 3).
 *
 * Nested on create — `POST /api/applications/:id/notes` — and flat thereafter,
 * which is §6's shape and the same split as timeline events: a note cannot exist
 * without an application, so the parent is part of its identity, while an existing
 * note is named by its own id.
 *
 * No timeline event is written. A note is not a thing that *happened* in the
 * search; it is the user's own working memory about the application, which is
 * exactly the distinction step 1 drew when it refused to log field edits.
 *
 * Ownership in the WHERE clause everywhere (§4). 404, never 403 (§6).
 */

export type WrittenNote = { id: string; applicationId: string };

export async function createNote(
  userId: string,
  applicationId: string,
  payload: NotePayload,
): Promise<WrittenNote> {
  /*
   * The application read is the authorization. Unlike interviews and assessments
   * the id comes from the path rather than the body, but it is no more trustworthy
   * for that — a path segment is user input too.
   */
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true },
  });

  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return prisma.note.create({
    data: { userId, applicationId: application.id, content: payload.content },
    select: { id: true, applicationId: true },
  });
}

export async function updateNote(
  userId: string,
  noteId: string,
  payload: NotePayload,
): Promise<WrittenNote> {
  const existing = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Note not found");
  }

  /*
   * `updatedAt` moves on its own — it is `@updatedAt` in the schema. The UI reads
   * the gap between it and `createdAt` to mark a note as edited, so nothing here
   * needs to track that separately.
   */
  return prisma.note.update({
    where: { id: existing.id },
    data: { content: payload.content },
    select: { id: true, applicationId: true },
  });
}

export async function deleteNote(userId: string, noteId: string): Promise<WrittenNote> {
  const existing = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true, applicationId: true },
  });

  if (!existing) {
    throw new NotFoundError("Note not found");
  }

  await prisma.note.delete({ where: { id: existing.id } });

  return existing;
}
