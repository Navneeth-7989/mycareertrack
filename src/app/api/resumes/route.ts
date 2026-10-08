import type { NextRequest } from "next/server";

import { ValidationError, handleRouteError } from "@/lib/api/errors";
import { created, ok, parseFormFields } from "@/lib/api/responses";
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
 * **One deployment caveat, which Phase 5's ship step has to settle.** Vercel caps
 * a serverless function's request body at 4.5 MB, below the 5 MB this endpoint
 * enforces — so the largest accepted files upload locally and would be refused by
 * the platform in production. The two ways out are lowering `RESUME_MAX_BYTES`,
 * or having the browser upload to a signed Supabase URL and post only the
 * metadata here. The second keeps the 5 MB but gives up checking the bytes before
 * they are stored, which is the §6 requirement this route is built around, so it
 * would need a post-upload verification pass. Neither is a Phase 4 decision.
 *
 * TODO(phase-5): 20 uploads/hour per user, per the rate-limit table in §6.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireApiUser();

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
