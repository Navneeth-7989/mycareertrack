import { describe, expect, it } from "vitest";

import {
  RESUME_FILE_ACCEPT,
  RESUME_LABEL_MAX,
  RESUME_MAX_BYTES,
  RESUME_MIME_BY_KIND,
  canPreviewKind,
  canPreviewResume,
  resumeKindFromMime,
} from "@/lib/constants/resume";
import { formatFileSize } from "@/lib/utils/file-size";
import {
  deriveResumeLabel,
  renameResumeSchema,
  resumeUploadFieldsSchema,
  sanitizeFileName,
  setResumeDefaultSchema,
  verifyResumeFile,
} from "@/lib/validations/resume";

function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((character) => character.charCodeAt(0)));
}

const PDF_BYTES = ascii("%PDF-1.7\ntrailer\n");

const DOCX_BYTES = new Uint8Array([
  0x50,
  0x4b,
  0x03,
  0x04,
  ...ascii("[Content_Types].xml"),
  ...ascii("word/document.xml"),
]);

const PDF = RESUME_MIME_BY_KIND.pdf;
const DOCX = RESUME_MIME_BY_KIND.docx;

describe("resumeKindFromMime", () => {
  it("accepts the two allowed types", () => {
    expect(resumeKindFromMime(PDF)).toBe("pdf");
    expect(resumeKindFromMime(DOCX)).toBe("docx");
  });

  it("is case- and whitespace-insensitive, as a header value may be either", () => {
    expect(resumeKindFromMime(" APPLICATION/PDF ")).toBe("pdf");
  });

  /**
   * The old `.doc` is not accepted, and neither is anything else. An allowlist
   * is what makes "no" the default answer rather than a sequence of individual
   * refusals (§6).
   */
  it("refuses everything else, including legacy Word", () => {
    for (const mime of [
      "application/msword",
      "application/octet-stream",
      "text/plain",
      "image/png",
      "application/zip",
      "",
    ]) {
      expect(resumeKindFromMime(mime)).toBeNull();
    }
  });
});

describe("canPreviewKind / canPreviewResume", () => {
  /**
   * PDF only, and it is a fact about browsers rather than a product choice:
   * every browser ships a PDF viewer and none can render a DOCX.
   */
  it("allows a PDF to be previewed and not a DOCX", () => {
    expect(canPreviewKind("pdf")).toBe(true);
    expect(canPreviewKind("docx")).toBe(false);
    expect(canPreviewResume(PDF)).toBe(true);
    expect(canPreviewResume(DOCX)).toBe(false);
  });

  /**
   * The row and the `/view` route ask this same question, so an unrecognised
   * MIME type must answer no — otherwise a row written before the allowlist
   * existed could offer a preview the route would then refuse.
   */
  it("refuses an unknown or absent type", () => {
    expect(canPreviewKind(null)).toBe(false);
    expect(canPreviewResume("application/msword")).toBe(false);
    expect(canPreviewResume("")).toBe(false);
  });
});

describe("RESUME_FILE_ACCEPT", () => {
  /** Both extensions and MIME types — neither alone is honoured everywhere. */
  it("offers extensions and MIME types", () => {
    expect(RESUME_FILE_ACCEPT).toContain(".pdf");
    expect(RESUME_FILE_ACCEPT).toContain(".docx");
    expect(RESUME_FILE_ACCEPT).toContain(PDF);
    expect(RESUME_FILE_ACCEPT).toContain(DOCX);
  });
});

describe("verifyResumeFile", () => {
  it("accepts a PDF declared as a PDF", () => {
    expect(verifyResumeFile({ mimeType: PDF, bytes: PDF_BYTES })).toEqual({
      ok: true,
      kind: "pdf",
    });
  });

  it("accepts a DOCX declared as a DOCX", () => {
    expect(verifyResumeFile({ mimeType: DOCX, bytes: DOCX_BYTES })).toEqual({
      ok: true,
      kind: "docx",
    });
  });

  /**
   * §6's worked example. The declared type is in the allowlist and the name
   * would pass any extension check — the bytes are what refuse it.
   */
  it("refuses an executable renamed to .pdf", () => {
    const verdict = verifyResumeFile({ mimeType: PDF, bytes: ascii("MZ\u0090\u0000") });

    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ message: expect.stringContaining("PDF") });
  });

  /**
   * Content and claim disagreeing is refused rather than silently reclassified.
   * A request that says DOCX while carrying a PDF is not an honest mistake, and
   * storing it under the type it really is would mean trusting the bytes to
   * overrule the request — which is the wrong way round for a write.
   */
  it("refuses a real PDF declared as a DOCX", () => {
    const verdict = verifyResumeFile({ mimeType: DOCX, bytes: PDF_BYTES });

    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ message: expect.stringContaining("DOCX") });
  });

  it("refuses an unsupported declared type before looking at the bytes", () => {
    const verdict = verifyResumeFile({ mimeType: "application/msword", bytes: PDF_BYTES });

    expect(verdict).toEqual({
      ok: false,
      message: "Only PDF and Word (.docx) files can be stored as a resume.",
    });
  });

  /** Its own message: a failed drag-and-drop, not a bad file. */
  it("refuses an empty file with its own complaint", () => {
    const verdict = verifyResumeFile({ mimeType: PDF, bytes: new Uint8Array() });

    expect(verdict).toEqual({
      ok: false,
      message: "That file is empty. Choose the document you meant to upload.",
    });
  });

  it("accepts a file exactly at the cap and refuses one byte more", () => {
    const atCap = new Uint8Array(RESUME_MAX_BYTES);
    const overCap = new Uint8Array(RESUME_MAX_BYTES + 1);

    atCap.set(PDF_BYTES);
    overCap.set(PDF_BYTES);

    expect(verifyResumeFile({ mimeType: PDF, bytes: atCap })).toEqual({ ok: true, kind: "pdf" });

    const verdict = verifyResumeFile({ mimeType: PDF, bytes: overCap });

    expect(verdict.ok).toBe(false);
    // Names the limit, so the message is actionable rather than just a refusal.
    expect(verdict).toMatchObject({
      message: expect.stringContaining(formatFileSize(RESUME_MAX_BYTES)),
    });
  });

  /**
   * Size is checked before the content, so an oversized file is reported as
   * oversized rather than as unreadable — the first is something the user can
   * act on.
   */
  it("reports size before content when both are wrong", () => {
    const verdict = verifyResumeFile({
      mimeType: PDF,
      bytes: new Uint8Array(RESUME_MAX_BYTES + 1),
    });

    expect(verdict).toMatchObject({ message: expect.stringContaining("The limit is") });
  });
});

describe("sanitizeFileName", () => {
  it("keeps an ordinary name", () => {
    expect(sanitizeFileName("Navneet Shahi — Frontend.pdf")).toBe("Navneet Shahi — Frontend.pdf");
  });

  /**
   * Not the defence against traversal — storage paths are generated from
   * scratch (`buildResumeStoragePath`), so that is structural. This keeps the
   * *displayed* and *downloaded* name sane.
   */
  it("drops directory parts from both path styles", () => {
    expect(sanitizeFileName("C:\\Users\\me\\Documents\\cv.pdf")).toBe("cv.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("/var/tmp/cv.docx")).toBe("cv.docx");
  });

  /**
   * The real hazard: this value ends up in a `Content-Disposition` header, where
   * a CR or LF is a response-splitting primitive and a quote terminates the
   * parameter it sits in.
   */
  it("strips the characters that would break a header", () => {
    // Removed outright rather than replaced with a space: control characters go
    // before the whitespace collapse, so the two halves of a smuggled header are
    // joined rather than separated. Cosmetically arbitrary — what matters is that
    // no CR or LF survives into the header value.
    expect(sanitizeFileName("cv\r\nX-Injected: yes.pdf")).toBe("cvX-Injected: yes.pdf");
    expect(sanitizeFileName('cv".pdf')).toBe("cv.pdf");
    expect(sanitizeFileName("cv\u0000.pdf")).toBe("cv.pdf");
  });

  it("caps the length", () => {
    expect(sanitizeFileName(`${"a".repeat(400)}.pdf`)).toHaveLength(255);
  });

  /** Reachable, and the route substitutes a generated name rather than failing. */
  it("can empty a name made only of stripped characters", () => {
    expect(sanitizeFileName("\u0000\u0001")).toBe("");
  });
});

describe("deriveResumeLabel", () => {
  it("drops the extension and reads separators as spaces", () => {
    expect(deriveResumeLabel("Navneet_Shahi_Frontend.pdf")).toBe("Navneet Shahi Frontend");
    expect(deriveResumeLabel("resume-2026-final.docx")).toBe("resume 2026 final");
  });

  it("only drops the last extension", () => {
    expect(deriveResumeLabel("cv.v2.pdf")).toBe("cv.v2");
  });

  /** A pathological name is not worth a 400; "Resume" is true of what was stored. */
  it("falls back rather than producing an empty label", () => {
    expect(deriveResumeLabel(".pdf")).toBe("Resume");
    expect(deriveResumeLabel("   ")).toBe("Resume");
  });

  it("caps the label at the column's limit", () => {
    expect(deriveResumeLabel(`${"a".repeat(300)}.pdf`)).toHaveLength(RESUME_LABEL_MAX);
  });
});

describe("resumeUploadFieldsSchema", () => {
  /** Absent and blank mean the same thing, and both become null (`optionalText`). */
  it("treats a missing or blank label as none", () => {
    expect(resumeUploadFieldsSchema.parse({})).toEqual({ label: null });
    expect(resumeUploadFieldsSchema.parse({ label: "   " })).toEqual({ label: null });
  });

  it("trims a typed label", () => {
    expect(resumeUploadFieldsSchema.parse({ label: "  Frontend Resume  " })).toEqual({
      label: "Frontend Resume",
    });
  });

  it("refuses a label past the cap", () => {
    expect(
      resumeUploadFieldsSchema.safeParse({ label: "a".repeat(RESUME_LABEL_MAX + 1) }).success,
    ).toBe(false);
  });
});

describe("renameResumeSchema", () => {
  it("requires a label", () => {
    expect(renameResumeSchema.safeParse({ label: "" }).success).toBe(false);
    expect(renameResumeSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(renameResumeSchema.parse({ label: " Backend " })).toEqual({ label: "Backend" });
  });
});

describe("setResumeDefaultSchema", () => {
  /**
   * A real boolean, because nothing types this — there is no `<input>` whose
   * string value it has to match. The string "true" is therefore not accepted.
   */
  it("takes a boolean and not its string form", () => {
    expect(setResumeDefaultSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
    expect(setResumeDefaultSchema.parse({ isDefault: false })).toEqual({ isDefault: false });
    expect(setResumeDefaultSchema.safeParse({ isDefault: "true" }).success).toBe(false);
    expect(setResumeDefaultSchema.safeParse({}).success).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("uses the units an operating system shows for the same file", () => {
    expect(formatFileSize(0)).toBe("0 bytes");
    expect(formatFileSize(1)).toBe("1 byte");
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(254_000)).toBe("248 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(RESUME_MAX_BYTES)).toBe("5.0 MB");
  });

  it("does not crash on a nonsense size", () => {
    expect(formatFileSize(Number.NaN)).toBe("—");
    expect(formatFileSize(-1)).toBe("—");
  });
});
