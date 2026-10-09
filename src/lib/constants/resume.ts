/**
 * What counts as a resume (DESIGN.md §6 "Resumes", §7 Phase 4).
 *
 * **PDF and DOCX only, and the list is closed.** A resume is a document that a
 * recruiter has to be able to open, which rules out the formats people
 * occasionally try — .pages, .odt, a screenshot — and an allowlist rather than a
 * blocklist is what makes "anything else" the default answer rather than a
 * sequence of individual refusals.
 *
 * Shared by the client and the server on purpose. The upload dialog needs the
 * accept string and the size cap to say what it wants *before* the user picks a
 * file, and the API needs the same two to enforce it afterwards — one constant so
 * the dialog cannot promise something the route then rejects.
 */

/**
 * The two kinds, as the app refers to them internally.
 *
 * A short kind rather than the MIME type as the canonical value, because the MIME
 * type for a DOCX is 73 characters long and would otherwise appear in file
 * extensions, switch statements and UI labels.
 */
export const RESUME_FILE_KINDS = ["pdf", "docx"] as const;

export type ResumeFileKind = (typeof RESUME_FILE_KINDS)[number];

export const RESUME_MIME_BY_KIND: Record<ResumeFileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** What the UI calls each kind — on a row, in a badge. */
export const RESUME_KIND_LABELS: Record<ResumeFileKind, string> = {
  pdf: "PDF",
  docx: "DOCX",
};

/**
 * The MIME type a browser declares → our kind, or null for anything else.
 *
 * Derived from `RESUME_MIME_BY_KIND` rather than written out again, so adding a
 * format cannot leave the two halves disagreeing about what is accepted.
 */
const KIND_BY_MIME = new Map<string, ResumeFileKind>(
  RESUME_FILE_KINDS.map((kind) => [RESUME_MIME_BY_KIND[kind], kind]),
);

export function resumeKindFromMime(mimeType: string): ResumeFileKind | null {
  return KIND_BY_MIME.get(mimeType.trim().toLowerCase()) ?? null;
}

/**
 * Which formats a browser can display rather than save.
 *
 * **PDF only, and that is a fact about browsers rather than a product choice.**
 * Every browser ships a PDF viewer; none can render a DOCX, which is a ZIP of XML
 * — pointed at one, it downloads the file regardless of what any header asks for.
 * So a "view" affordance on a Word document would be a control that appears to
 * fail, and the honest offer there is the download.
 *
 * One predicate used by both halves: the row decides whether to show a preview
 * trigger, and `/api/resumes/:id/view` decides whether to sign an inline URL at
 * all — so the UI cannot offer something the route would refuse.
 */
const PREVIEWABLE_KINDS = new Set<ResumeFileKind>(["pdf"]);

export function canPreviewKind(kind: ResumeFileKind | null): boolean {
  return kind !== null && PREVIEWABLE_KINDS.has(kind);
}

/** The same question asked of a stored row, which holds a MIME type. */
export function canPreviewResume(mimeType: string): boolean {
  return canPreviewKind(resumeKindFromMime(mimeType));
}

/**
 * 4 MB — lowered from §6's 5 MB in Phase 5, deliberately and with the design
 * updated to match.
 *
 * **The number is the platform's, not a judgement about resumes.** Vercel
 * refuses a serverless function's request body over 4.5 MB *before the function
 * runs*, and this upload goes through our own route so the MIME and magic-byte
 * checks in §6 can happen before a byte is stored. At 5 MB the app therefore
 * advertised a cap it could not honour: a 4.6 MB PDF passed every check locally
 * and came back from production as the platform's own 413, with none of our
 * copy and nothing in the field under the picker. A limit that is wrong in the
 * direction of accepting too much is worse than a smaller one, because the
 * failure lands on the user as an unexplained error.
 *
 * 4 rather than 4.4: the margin covers the multipart envelope — boundaries, the
 * `label` field, headers — which all count toward the platform's limit and the
 * file does not.
 *
 * Still comfortably above any real resume. A text-heavy two-page PDF is well
 * under a megabyte; what exceeds 4 MB is a scanned document or an embedded
 * image, both of which a recruiter would rather receive smaller anyway.
 *
 * The rejected alternative, so it is not re-proposed: a signed Supabase upload
 * URL would keep 5 MB, but it puts the file in the bucket before the signature
 * check can run, which inverts the order §6 requires and would need a
 * post-upload verification sweep to get back to where the route already is.
 *
 * One constant, and the copy quotes it. The upload dialog, the page's helper
 * text and the route's refusal all call `formatFileSize(RESUME_MAX_BYTES)`, so
 * this line is the only place the number exists.
 */
export const RESUME_MAX_BYTES = 4 * 1024 * 1024;

/** "Frontend Resume" — the user's name for a version, not the file's name. */
export const RESUME_LABEL_MAX = 100;

/**
 * A generous bound on the original file name, which is stored for display and
 * handed back as the download's filename. Never used to build a storage path —
 * see `buildResumeStoragePath`.
 */
export const RESUME_FILE_NAME_MAX = 255;

/**
 * The `accept` attribute for the file input.
 *
 * Both the extensions and the MIME types, because neither alone is reliable: some
 * platforms match only on extension, and some file pickers ignore an extension
 * list for a type they think they know better. It is a hint to the picker in any
 * case — the server decides (§8), which is why `verifyResumeFile` exists.
 */
export const RESUME_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ...RESUME_FILE_KINDS.map((kind) => RESUME_MIME_BY_KIND[kind]),
].join(",");
