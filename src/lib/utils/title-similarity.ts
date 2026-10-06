/**
 * How alike two job titles are, for the duplicate advisory in DESIGN.md §6.
 *
 * §6 calls for "normalized, trigram similarity above threshold". This computes
 * that in JavaScript rather than through pg_trgm's `similarity()`, which was the
 * obvious alternative since the extension is already installed:
 *
 * - The candidate set is tiny. Duplicate detection only ever compares against
 *   this user's applications *at one company* — single digits in practice — so
 *   there is nothing for an index to accelerate.
 * - It stays a pure function, so the threshold can be tuned against real title
 *   pairs in a unit test instead of requiring a database round trip.
 * - It keeps the raw-SQL surface at the two DDL statements in migrations. §8
 *   lists "the two raw statements" as the whole injection surface, and a third
 *   taking user text would weaken a claim worth keeping true.
 *
 * The measure is Jaccard over trigram sets — shared trigrams divided by the
 * union — which is what pg_trgm's `similarity()` computes, so the numbers mean
 * the same thing either way if this ever moves into Postgres.
 */

/**
 * Above this, two titles at the same company are "the same role" and the
 * advisory is raised from info to warning (§6).
 *
 * 0.6 rather than pg_trgm's default 0.3, which is tuned for search recall —
 * where offering too much is cheap — while this decides whether to tell someone
 * they may have already applied. "Frontend Engineer" and "Backend Engineer"
 * score around 0.45, and warning on that pair would train the user to ignore
 * the warning that matters. Near-duplicates, which is what this is for, score
 * far above 0.6: see the table in the test.
 */
export const DUPLICATE_TITLE_THRESHOLD = 0.6;

/**
 * Strips everything that is punctuation or spacing noise rather than meaning.
 *
 * "Software Engineer (New Grad) - 2026" and "software engineer new grad 2026"
 * are the same posting typed twice.
 *
 * `\p{M}` is in the keep set alongside letters and digits, and it is not
 * optional: combining marks are their own Unicode category, so letters-only
 * would tear the vowel signs out of "सॉफ्टवेयर इंजीनियर" and leave
 * "स फ टव यर इ ज न यर" — a title shredded into fragments that then matches
 * nothing. Most Indic scripts, and plenty of others, write vowels this way.
 */
export function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Padded to the width pg_trgm uses, so a short title still has trigrams to
 * compare: "sde" alone yields none from a bare 3-character string under a
 * sliding window, but "  sde " yields four.
 */
function trigrams(normalized: string): Set<string> {
  const padded = `  ${normalized} `;
  const result = new Set<string>();

  for (let index = 0; index + 3 <= padded.length; index += 1) {
    result.add(padded.slice(index, index + 3));
  }

  return result;
}

/**
 * 0 for nothing in common, 1 for identical once normalized.
 *
 * Two titles that normalize to the same string short-circuit to exactly 1,
 * which matters because the trigram measure of a string against itself is 1
 * anyway — the early return just makes the common case free and the intent
 * obvious.
 */
export function jobTitleSimilarity(left: string, right: string): number {
  const a = normalizeJobTitle(left);
  const b = normalizeJobTitle(right);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const first = trigrams(a);
  const second = trigrams(b);

  let shared = 0;

  for (const gram of first) {
    if (second.has(gram)) {
      shared += 1;
    }
  }

  // |A ∪ B| without building the union set.
  const union = first.size + second.size - shared;

  return union === 0 ? 0 : shared / union;
}

/** Whether two titles are close enough to warrant the stronger warning. */
export function isSimilarJobTitle(left: string, right: string): boolean {
  return jobTitleSimilarity(left, right) >= DUPLICATE_TITLE_THRESHOLD;
}
