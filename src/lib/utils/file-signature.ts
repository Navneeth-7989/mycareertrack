import type { ResumeFileKind } from "@/lib/constants/resume";

/**
 * What a file actually is, read from its bytes rather than from what the upload
 * claimed (DESIGN.md §6: "MIME **and** magic-byte check — a `.exe` renamed to
 * `.pdf` fails").
 *
 * **The declared MIME type is a client-supplied string.** It comes from the
 * browser's guess, which is usually taken from the extension, and a request made
 * with `curl` can say whatever it likes. So it is checked — an unsupported type is
 * refused before anything is read — but it is never the *answer*. These functions
 * are the second half: the content has to agree with the claim.
 *
 * Deliberately pure and byte-oriented, with no `File`, no `Request` and no
 * storage client anywhere near it, so the interesting cases can be unit-tested
 * from a handful of literal arrays. See `tests/lib/file-signature.test.ts`.
 */

/** `%PDF-`, which every PDF opens with. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * `PK\x03\x04` — a local file header, so the first entry of a ZIP archive.
 *
 * A DOCX *is* a ZIP, which is why this alone is not enough to identify one: a
 * JAR, an XLSX and an Android package all start with the same four bytes. Hence
 * `DOCX_PART_MARKER` below.
 */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/**
 * `word/` in ASCII.
 *
 * An OOXML package stores each part's path as plain text in its local header and
 * again in the central directory, neither of which is compressed — so the
 * `word/` directory that holds a WordprocessingML document's body is findable in
 * the raw bytes without unzipping anything. A spreadsheet has `xl/`, a
 * presentation has `ppt/`, and a renamed JAR has neither.
 *
 * It is a discriminator, not a parser. Something could be constructed that is a
 * valid ZIP, contains the string, and is not a Word document — but it would also
 * have to be under 5 MB, be declared as a DOCX, and the worst it achieves is
 * occupying a private bucket slot the uploader already owns. What this closes is
 * the realistic case: an executable or an archive renamed to get past the
 * extension check.
 */
const DOCX_PART_MARKER = [0x77, 0x6f, 0x72, 0x64, 0x2f];

/**
 * The kind these bytes really are, or null when they are neither.
 *
 * Both signatures are required at **offset 0**, not merely somewhere near the
 * start. Readers tolerate junk before a PDF header, but accepting a file whose
 * real first bytes are something else is exactly the hole this check exists to
 * close — a prefix is how a polyglot file gets two readers to disagree about what
 * they are looking at.
 */
export function sniffResumeFileKind(bytes: Uint8Array): ResumeFileKind | null {
  if (startsWith(bytes, PDF_SIGNATURE)) {
    return "pdf";
  }

  if (startsWith(bytes, ZIP_SIGNATURE) && containsBytes(bytes, DOCX_PART_MARKER)) {
    return "docx";
  }

  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * A plain scan. The needles here are five bytes and the haystack is capped at
 * `RESUME_MAX_BYTES`, so the naive search is a few milliseconds in the worst case
 * and brings no dependency with it.
 */
function containsBytes(haystack: Uint8Array, needle: readonly number[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }

  const last = haystack.length - needle.length;

  for (let start = 0; start <= last; start += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
}
