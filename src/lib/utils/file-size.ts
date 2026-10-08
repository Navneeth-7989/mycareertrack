/**
 * A byte count as a person would read it.
 *
 * Binary units (1 KB = 1024 B), matching what every operating system shows for
 * the same file — a resume the user's file manager calls 248 KB should not be
 * called 254 KB here, and being technically right about SI prefixes is worth less
 * than agreeing with the number they already saw.
 *
 * One decimal place for MB and none below it. "1.4 MB" is a useful distinction
 * from "1.1 MB"; "248.3 KB" is three characters of noise, because nobody makes a
 * decision on the fraction of a kilobyte.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes < 1024) {
    // Singular at exactly one byte. A rounding artefact rather than a real case,
    // but "1 bytes" is the kind of detail that makes a UI look unfinished.
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
