import type { Prisma } from "@prisma/client";

import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";

import { prisma } from "../db";
import { companiesVisibleTo, type CompanySuggestion } from "../queries/companies";

/**
 * Turns a typed company name into a `Company` row: normalize, then find or
 * create (DESIGN.md §5).
 *
 * This is the only place a `Company` is created. Having one entry point is what
 * makes the guarantee in §3 hold — that "Google", "google " and "Google LLC"
 * can never become three rows — because the match key is derived here rather
 * than at each call site.
 */

/**
 * Accepts either the client or a transaction client, so application create can
 * resolve the company inside the same transaction that writes the application
 * and its `SAVED` event. A company created by a transaction that then rolls
 * back must not survive.
 */
type CompanyClient = Pick<Prisma.TransactionClient, "company">;

const companySelect = {
  id: true,
  name: true,
  nameNormalized: true,
  website: true,
  isSeeded: true,
} satisfies Prisma.CompanySelect;

export type ResolvedCompany = CompanySuggestion & {
  /** False when an existing row answered — the caller decides 200 versus 201. */
  created: boolean;
};

export async function resolveCompanyByName(
  userId: string,
  input: { name: string; website?: string | null },
  client: CompanyClient = prisma,
): Promise<ResolvedCompany> {
  const name = input.name.trim();
  const nameNormalized = normalizeCompanyName(name);

  if (!nameNormalized) {
    // Unreachable through the API, where `companyNameSchema` rejects this
    // first. Kept because this function is also called from server code that
    // has not been through Zod, and an empty match key would collide with every
    // other junk name while matching nothing.
    throw new ValidationError({}, "Enter a company name");
  }

  const existing = await findVisibleByName(userId, nameNormalized, client);

  if (existing) {
    return { ...(await backfillWebsite(existing, input.website, client)), created: false };
  }

  try {
    const company = await client.company.create({
      data: {
        name,
        nameNormalized,
        website: input.website ?? null,
        // A company the user typed is theirs alone. Only the seed script writes
        // rows with a null creator, which is what keeps a private employer name
        // out of everyone else's autocomplete (§8).
        createdByUserId: userId,
        isSeeded: false,
      },
      select: companySelect,
    });

    return { ...company, created: true };
  } catch (error) {
    // Two requests resolving the same new company at once: one insert wins, the
    // other violates @@unique([createdByUserId, nameNormalized]). Re-reading is
    // the correct answer — the row the loser wanted now exists — and surfacing a
    // 409 for a double-submitted form would be a worse one.
    if (isUniqueViolation(error)) {
      const raced = await findVisibleByName(userId, nameNormalized, client);

      if (raced) {
        return { ...raced, created: false };
      }
    }

    throw error;
  }
}

/**
 * Resolves a company the client identified by id, confirming the caller is
 * allowed to see it.
 *
 * 404 rather than 403 for someone else's company, per §6 — and the ownership
 * test is in the `WHERE` clause, never an `if` afterwards (§4).
 */
export async function resolveCompanyById(
  userId: string,
  companyId: string,
  client: CompanyClient = prisma,
): Promise<CompanySuggestion> {
  const company = await client.company.findFirst({
    where: { AND: [companiesVisibleTo(userId), { id: companyId }] },
    select: companySelect,
  });

  if (!company) {
    throw new NotFoundError("Company not found");
  }

  return company;
}

async function findVisibleByName(
  userId: string,
  nameNormalized: string,
  client: CompanyClient,
): Promise<CompanySuggestion | null> {
  return client.company.findFirst({
    where: { AND: [companiesVisibleTo(userId), { nameNormalized }] },
    select: companySelect,
    // Seeded first when both exist, so everyone resolving "Google" lands on the
    // same row and the analytics group correctly. Ties are impossible: the
    // partial unique index allows one seeded row per name, and the composite
    // unique allows one of the user's own.
    orderBy: { isSeeded: "desc" },
  });
}

/**
 * Fills in a website the row was missing.
 *
 * Only ever adds, and only to the user's own rows. Overwriting would let a
 * typo on one application silently change the link on every other application
 * pointing at that company, and seeded rows are shared — one user must not be
 * able to edit what another sees.
 */
async function backfillWebsite(
  company: CompanySuggestion,
  website: string | null | undefined,
  client: CompanyClient,
): Promise<CompanySuggestion> {
  if (company.isSeeded || company.website || !website) {
    return company;
  }

  return client.company.update({
    where: { id: company.id },
    data: { website },
    select: companySelect,
  });
}

/**
 * Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`,
 * matching `lib/api/errors.ts` — the shape is stable across Prisma versions and
 * the import of the error class is not.
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code: unknown }).code === "P2002";
}
