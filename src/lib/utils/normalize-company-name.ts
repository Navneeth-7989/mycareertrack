/**
 * Legal suffixes stripped from the end of a company name.
 *
 * Ordered longest-first so that "private limited" is matched before "limited"
 * and "pvt ltd" before "ltd" — otherwise the shorter form wins and leaves a
 * dangling fragment behind.
 */
const LEGAL_SUFFIXES = [
  "private limited",
  "private ltd",
  "pvt limited",
  "pvt ltd",
  "pte ltd",
  "incorporated",
  "corporation",
  "limited",
  "company",
  "pvt",
  "pte",
  "ltd",
  "llc",
  "llp",
  "inc",
  "corp",
  "plc",
  "gmbh",
  "co",
] as const;

/**
 * Builds the match key used to decide whether two company names are the same
 * company. See DESIGN.md §3.
 *
 * "Google", "google " and "Google LLC" all collapse to "google", so there is
 * one Company row, duplicate detection works, and analytics group correctly —
 * while `Company.name` still holds the display casing the user typed.
 *
 * Internal punctuation is deliberately preserved. Stripping it would merge
 * names that are genuinely different, and the trigram index handles fuzzy
 * search separately.
 */
export function normalizeCompanyName(input: string): string {
  // Collapse all whitespace (including tabs and non-breaking spaces) to single
  // spaces, then lowercase.
  let name = input.toLowerCase().replace(/\s+/g, " ").trim();

  // Strip suffixes repeatedly: "Foo Pvt. Ltd." needs two passes.
  let changed = true;
  while (changed) {
    changed = false;

    // Drop trailing punctuation left behind by an abbreviation ("Ltd.") or a
    // separator before the suffix ("Foo, Inc").
    const trimmed = name.replace(/[.,\s]+$/, "");
    if (trimmed !== name) {
      name = trimmed;
      changed = true;
    }

    for (const suffix of LEGAL_SUFFIXES) {
      // Require a separator before the suffix so "Cisco" does not lose "co"
      // and "Intel" keeps its tail. Only a word-boundary match counts.
      if (name.endsWith(` ${suffix}`)) {
        const candidate = name.slice(0, -(suffix.length + 1)).replace(/[.,\s]+$/, "");

        // Never reduce a name to nothing: a company actually called "Limited"
        // keeps its name rather than normalizing to an empty match key.
        if (candidate.length > 0) {
          name = candidate;
          changed = true;
          break;
        }
      }
    }
  }

  return name;
}
