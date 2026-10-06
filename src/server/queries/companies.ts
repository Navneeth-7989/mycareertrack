import { Prisma } from "@prisma/client";

import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";
import { COMPANY_SEARCH_LIMIT } from "@/lib/validations/company";

import { prisma } from "../db";

/**
 * Company reads: the autocomplete behind the application form.
 *
 * Every query here is scoped by `companiesVisibleTo`, which is the defence
 * against the cross-user leak in DESIGN.md §8 — a company one user created is
 * theirs, and must never surface in someone else's suggestions. Seeded rows
 * (`createdByUserId = null`) are the shared pool everyone sees.
 */

const companySelect = {
  id: true,
  name: true,
  nameNormalized: true,
  website: true,
  isSeeded: true,
} satisfies Prisma.CompanySelect;

export type CompanySuggestion = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

/**
 * The visibility rule, as a `WHERE` fragment rather than a filter applied
 * afterwards — the same reasoning as the ownership convention in §4. There is
 * no code path that reads companies without it.
 */
export function companiesVisibleTo(userId: string): Prisma.CompanyWhereInput {
  return { OR: [{ createdByUserId: null }, { createdByUserId: userId }] };
}

/**
 * Autocomplete. At most `limit` suggestions, best match first.
 *
 * An empty query is not an error — it is what the combobox asks on open, and
 * the honest answer is the companies this user already applied to rather than
 * an alphabetical slice of the seed list.
 */
export async function searchCompanies(
  userId: string,
  query: string,
  limit: number = COMPANY_SEARCH_LIMIT,
): Promise<CompanySuggestion[]> {
  // The needle goes through the same normalizer as the stored match key, so
  // "Google LLC", "google" and "  GOOGLE " all search for "google". Passing
  // user text straight to Prisma keeps it parameterized — `C++` and
  // `O'Brien & Co.` are data, never query syntax (§8).
  const needle = normalizeCompanyName(query);

  if (!needle) {
    return recentCompanies(userId, limit);
  }

  const visible = companiesVisibleTo(userId);

  // Two queries rather than one, because a single `contains` ordered by name
  // can push the exact match past the cap: "tech" matches hundreds of rows, and
  // the company actually called "Tech" could sort anywhere among them. The
  // prefix query guarantees exact and leading matches are in the pool; the
  // substring query fills the rest. One `$transaction` keeps it to a single
  // round trip to Neon.
  const [prefixMatches, substringMatches] = await prisma.$transaction([
    prisma.company.findMany({
      where: { AND: [visible, { nameNormalized: { startsWith: needle } }] },
      select: companySelect,
      orderBy: { nameNormalized: "asc" },
      take: limit,
    }),
    prisma.company.findMany({
      where: { AND: [visible, { nameNormalized: { contains: needle } }] },
      select: companySelect,
      orderBy: { nameNormalized: "asc" },
      // A wider pool than we return, so ranking has something to choose from —
      // the substring hits arrive alphabetically, which is not an ordering any
      // user asked for.
      take: limit * 3,
    }),
  ]);

  return rankCompanyMatches([...prefixMatches, ...substringMatches], needle, limit);
}

/**
 * Companies this user has already applied to, most recently used first.
 *
 * `groupBy` rather than `findMany({ distinct })`: the distinct option is
 * applied to the rows already fetched, so `take: 10` would return fewer than
 * ten companies as soon as two applications shared one. Grouping does the
 * de-duplication in Postgres, where the limit then means what it says.
 */
async function recentCompanies(userId: string, limit: number): Promise<CompanySuggestion[]> {
  const recent = await prisma.application.groupBy({
    by: ["companyId"],
    where: { userId },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });

  if (recent.length === 0) {
    return [];
  }

  const ids = recent.map((row) => row.companyId);

  const companies = await prisma.company.findMany({
    // Scoped by visibility even though these ids came from the user's own
    // applications. Belt and braces: it costs nothing, and it means no read of
    // this table can leak another user's company even if the source of the ids
    // changes later.
    where: { AND: [companiesVisibleTo(userId), { id: { in: ids } }] },
    select: companySelect,
  });

  // `findMany({ id: { in } })` does not preserve the order of the list, and the
  // order is the whole point of this function.
  const byId = new Map(companies.map((company) => [company.id, company]));

  return ids.flatMap((id) => {
    const company = byId.get(id);

    return company ? [company] : [];
  });
}

/**
 * How well a stored match key answers what was typed. Lower is better.
 *
 * The word-boundary tier is what keeps this useful on the seed list: typing
 * "consultancy" should offer "Tata Consultancy Services" above
 * "Reconsultancy", and both above a company with the fragment buried
 * mid-word.
 */
function matchTier(nameNormalized: string, needle: string): number {
  if (nameNormalized === needle) {
    return 0;
  }

  if (nameNormalized.startsWith(needle)) {
    return 1;
  }

  if (nameNormalized.includes(` ${needle}`)) {
    return 2;
  }

  return 3;
}

/**
 * Orders and de-duplicates the pooled matches. Exported for its own test —
 * ranking is the part of search a user notices immediately when it is wrong.
 *
 * De-duplication is by match key, not by id, and prefers the seeded row. Two
 * rows can legitimately share a normalized name — a user who created "Google"
 * before that company was seeded owns one, and the shared pool owns the other —
 * and offering the same company twice makes the list look broken.
 */
export function rankCompanyMatches(
  matches: CompanySuggestion[],
  needle: string,
  limit: number,
): CompanySuggestion[] {
  const best = new Map<string, CompanySuggestion>();

  for (const match of matches) {
    const existing = best.get(match.nameNormalized);

    if (!existing || (!existing.isSeeded && match.isSeeded)) {
      best.set(match.nameNormalized, match);
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      const tier = matchTier(a.nameNormalized, needle) - matchTier(b.nameNormalized, needle);
      if (tier !== 0) {
        return tier;
      }

      // Within a tier, the shorter name is the closer answer: "Meta" before
      // "Metadata Technologies" for someone who typed "meta".
      const length = a.nameNormalized.length - b.nameNormalized.length;
      if (length !== 0) {
        return length;
      }

      return a.nameNormalized.localeCompare(b.nameNormalized);
    })
    .slice(0, limit);
}
