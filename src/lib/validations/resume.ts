import { z } from "zod";

import {
  RESUME_FILE_NAME_MAX,
  RESUME_KIND_LABELS,
  RESUME_LABEL_MAX,
  RESUME_MAX_BYTES,
  resumeKindFromMime,
  type ResumeFileKind,
} from "@/lib/constants/resume";
import { sniffResumeFileKind } from "@/lib/utils/file-signature";
import { formatFileSize } from "@/lib/utils/file-size";
import { optionalText, requiredText } from "@/lib/validations/fields";

/**
 * Resume validation (DESIGN.md §3, §6, §7 Phase 4).
 *
 * **The upload is the one request in the app that is not JSON**, so this module
 * has two halves that the others do not need to separate: the text fields, which
 * are ordinary Zod schemas parsed from the multipart form, and the file itself,
 * which is bytes and is checked by `verifyResumeFile`.
 *
 * Everything the browser says about the file is treated as a claim. The name, the
 * declared MIME type and the reported size all arrive from the client and all
 * three are either re-derived or re-measured here — see `verifyResumeFile` for
 * what that buys, and `utils/file-signature` for the content check it delegates
 * to.
 */

/**
 * What the upload form sends alongside the file.
 *
 * The label is **optional on the wire** and defaulted from the file name, which
 * is a deliberate softening of §6's implied required field. Most people upload
 * "Navneet_Shahi_Frontend.pdf" and have no second name in mind for it, and a
 * required field that everybody fills with a transcription of the file they just
 * chose is a field that should have had a default.
 */
export const resumeUploadFieldsSchema = z.object({
  label: optionalText("Label", RESUME_LABEL_MAX),
});

/** What `PATCH /api/resumes/:id` accepts. Renaming is the only field edit. */
export const renameResumeSchema = z.object({
  label: requiredText("Label", RESUME_LABEL_MAX),
});

/** What the rename dialog holds and validates — the same one field. */
export const resumeRenameFormSchema = renameResumeSchema;

export type ResumeRenameFormValues = z.input<typeof resumeRenameFormSchema>;

/**
 * What `PATCH /api/resumes/:id/default` accepts.
 *
 * A real boolean, not a string: nothing types this, so there is no `<input>`
 * whose value it has to match — the same call as `isCompleted` on a task.
 *
 * It accepts `false` as well as `true`, so "no default resume" stays a reachable
 * state. A toggle that can only ever be switched on is a one-way door, and the
 * user who set the wrong version as their default would have no way back except
 * promoting a different one.
 */
export const setResumeDefaultSchema = z.object({
  isDefault: z.boolean(),
});

/**
 * The verdict on an uploaded file's bytes.
 *
 * A union rather than a thrown `ValidationError`, so this stays a pure function
 * that `tests/lib/resume-validations.test.ts` can drive with literal arrays. The
 * route turns a refusal into the 400 (see `POST /api/resumes`), which is also
 * where the message gets pinned to the `file` field.
 */
export type ResumeFileVerdict = { ok: true; kind: ResumeFileKind } | { ok: false; message: string };

/**
 * Whether these bytes may be stored as a resume.
 *
 * Four checks, in this order, and the order is chosen so the message the user
 * gets names the thing they can actually fix:
 *
 * 1. **Empty.** Its own case rather than part of the signature check, because
 *    "that file is empty" is a different problem from "that is not a PDF" — and
 *    an empty file is nearly always a failed drag-and-drop rather than a bad
 *    file.
 * 2. **Size**, measured from the bytes rather than taken from `File.size`. The
 *    two agree for a real upload, but the stored `fileSize` should be the number
 *    we counted, not the number we were told.
 * 3. **Declared type**, against the closed allowlist in `constants/resume`.
 * 4. **Content**, against the declared type. This is the check §6 asks for by
 *    name, and the `kind !== declared` arm is the half that matters: a file whose
 *    bytes say PDF while the request says DOCX is not an honest mistake, so it is
 *    refused rather than silently reclassified.
 */
export function verifyResumeFile(input: {
  mimeType: string;
  bytes: Uint8Array;
}): ResumeFileVerdict {
  const { mimeType, bytes } = input;

  if (bytes.length === 0) {
    return { ok: false, message: "That file is empty. Choose the document you meant to upload." };
  }

  if (bytes.length > RESUME_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${formatFileSize(bytes.length)}. The limit is ${formatFileSize(
        RESUME_MAX_BYTES,
      )}.`,
    };
  }

  const declared = resumeKindFromMime(mimeType);

  if (!declared) {
    return { ok: false, message: "Only PDF and Word (.docx) files can be stored as a resume." };
  }

  const actual = sniffResumeFileKind(bytes);

  if (!actual) {
    return {
      ok: false,
      message: `That file is not a readable ${RESUME_KIND_LABELS[declared]}, whatever its name says.`,
    };
  }

  if (actual !== declared) {
    return {
      ok: false,
      message: `That file was sent as a ${RESUME_KIND_LABELS[declared]} but its contents are a ${RESUME_KIND_LABELS[actual]}.`,
    };
  }

  return { ok: true, kind: actual };
}

/**
 * The original file name, made safe to store and to hand back as a download
 * name.
 *
 * **It never reaches a storage path** — `buildResumeStoragePath` generates those
 * from scratch — so this is not the defence against traversal; that is structural.
 * What it guards is the two places the name *is* used: rendered on the resumes
 * page, and put in a `Content-Disposition` header by the signed download URL.
 *
 * So: directory parts are dropped (a browser can send "C:\\Users\\me\\cv.pdf" from
 * some platforms), and control characters go because a CR or LF in a header value
 * is a response-splitting primitive. Quotes and backslashes go for the same
 * reason — they are the characters that terminate a quoted header parameter.
 */
export function sanitizeFileName(value: string): string {
  const withoutDirectories = value.split(/[\\/]/).pop() ?? "";

  const cleaned = withoutDirectories
    .replace(/[\u0000-\u001f\u007f"\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, RESUME_FILE_NAME_MAX);
}

/**
 * The label to use when the user did not type one: the file name without its
 * extension.
 *
 * Underscores and hyphens become spaces, because "Navneet_Shahi_Frontend" is a
 * file name and "Navneet Shahi Frontend" is a label — the user is naming a
 * version of their resume, and the list reads as a list of documents rather than
 * of uploads.
 */
export function deriveResumeLabel(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");

  const label = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // Falls back rather than failing. A file called ".pdf" is pathological, not
  // worth a 400, and "Resume" is a true description of what was stored.
  return label.slice(0, RESUME_LABEL_MAX) || "Resume";
}
