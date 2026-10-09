import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, ok, parseFormFields } from "@/lib/api/responses";
import { RATE_LIMITS } from "@/lib/constants/rate-limit";
import { RESUME_MAX_BYTES } from "@/lib/constants/resume";
import { formatFileSize } from "@/lib/utils/file-size";
import {
  deriveResumeLabel,
  resumeUploadFieldsSchema,
  sanitizeFileName,
  verifyResumeFile,
} from "@/lib/validations/resume";
import { createResume } from "@/server/mutations/resumes";
import { listResumes } from "@/server/queries/resumes";
import { requireApiUser } from "@/server/require-user";
import { enforceRateLimit } from "@/server/services/rate-limit";

/**
 * `/api/resumes` — list and upload (DESIGN.md §6).
 *
 * Soft-deleted resumes are excluded from the list, which `listResumes` does in
 * the WHERE clause.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser();

    return ok(await listResumes(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Uploads a resume.
 *
 * **The only multipart endpoint in the app**, and the only one that writes to a
 * system other than the database. Everything §6 asks for happens here, in this
 * order, before a single byte is stored:
 *
 * 1. The caller is authenticated — nothing is read from the body first.
 * 2. The declared type is in the allowlist, the size is within the cap, and the
 *    *content* agrees with the declared type. That last check is the one that
 *    makes a renamed `.exe` fail; see `verifyResumeFile` and
 *    `utils/file-signature`.
 * 3. Only then does `createResume` upload and insert.
 *
 * The validated kind, not the uploaded file name, decides the stored extension
 * and MIME type — so a file called `cv.pdf.exe` is stored as a `.pdf` because its
 * bytes are a PDF, and the name it arrived with has no say in where it goes.
 *
 * **The Vercel body-size caveat was settled in Phase 5: the cap is 4 MB.** The
 * platform refuses a request body over 4.5 MB before this function runs, so a
 * cap above that was a size the endpoint claimed to accept and the deployment
 * would reject with its own 413. The alternative — a signed Supabase upload URL
 * and metadata posted here — was rejected because it puts the bytes in the
 * bucket *before* the magic-byte check, which is the §6 requirement this route
 * exists to satisfy. See `RESUME_MAX_BYTES`.
 *
 * **20 uploads per hour per user (§6).** The one limit on an endpoint that
 * writes to a second system: every accepted request is an object in the bucket,
 * and a soft delete leaves the row behind, so the usual "they can only hurt
 * themselves" reading does not hold — the storage bill is ours.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();

    /*
     * Before `formData()`, which is the whole point of putting it here: that
     * call buffers the upload. Enforcing afterwards would mean reading up to
     * 4 MB off the wire for every request we were going to refuse anyway, at
     * which point a rate limit on an upload endpoint protects almost nothing.
     */
    await enforceRateLimit(RATE_LIMITS.resumeUpload, user.id);

    let form: FormData;

    try {
      form = await request.formData();
    } catch {
      // A truncated upload or a wrong content type. The client's mistake, so it
      // is reported the same way a failed field would be.
      throw new ValidationError({}, "Send the resume as multipart form data");
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError({ file: "Choose a PDF or Word document to upload" });
    }

    /*
     * Checked before the bytes are read, purely so an oversized file gets a
     * useful message quickly. It is not the enforcement — `verifyResumeFile`
     * measures what actually arrived, because `File.size` is a number the client
     * reported and the stored `fileSize` should be the one we counted.
     */
    if (file.size > RESUME_MAX_BYTES) {
      throw new ValidationError({
        file: `That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(
          RESUME_MAX_BYTES,
        )}.`,
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const verdict = verifyResumeFile({ mimeType: file.type, bytes });

    if (!verdict.ok) {
      // Pinned to `file` so the dialog renders it under the picker rather than
      // as a banner the user has to connect back to the control themselves.
      throw new ValidationError({ file: verdict.message });
    }

    const { label } = parseFormFields(form, resumeUploadFieldsSchema);

    /*
     * Falls back rather than failing. `sanitizeFileName` can empty a name made
     * entirely of characters it strips, and the column is non-nullable — but an
     * unusable file name is not a reason to refuse a file whose bytes have
     * already been verified. The extension comes from the sniffed kind, so the
     * substitute is accurate.
     */
    const fileName = sanitizeFileName(file.name) || `resume.${verdict.kind}`;

    return created(
      await createResume(user.id, {
        // Blank falls back to the file name, which is what most people would
        // have typed anyway. See `resumeUploadFieldsSchema`.
        label: label ?? deriveResumeLabel(fileName),
        fileName,
        kind: verdict.kind,
        bytes,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
