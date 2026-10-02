import "dotenv/config";

import { normalizeCompanyName } from "../src/lib/utils/normalize-company-name";
import { prisma } from "../src/server/db";
import { SEED_COMPANIES } from "./seed-data/companies";

type CompanyRow = {
  name: string;
  nameNormalized: string;
  website: string | null;
  isSeeded: true;
  createdByUserId: null;
};

/**
 * Collapses the hand-written list down to one row per match key.
 *
 * Two entries normalizing to the same key would otherwise be rejected by the
 * `company_seeded_name_unique` partial index mid-insert, failing the whole
 * seed. Catching it here means the list can be edited freely and a collision
 * is reported by name rather than as a constraint violation.
 */
function dedupe(): { rows: CompanyRow[]; collisions: string[] } {
  const byKey = new Map<string, CompanyRow>();
  const collisions: string[] = [];

  for (const company of SEED_COMPANIES) {
    const nameNormalized = normalizeCompanyName(company.name);

    if (nameNormalized.length === 0) {
      throw new Error(`"${company.name}" normalizes to an empty match key.`);
    }

    const existing = byKey.get(nameNormalized);
    if (existing) {
      collisions.push(
        `"${company.name}" collides with "${existing.name}" (key: ${nameNormalized})`,
      );
      continue;
    }

    byKey.set(nameNormalized, {
      name: company.name,
      nameNormalized,
      website: company.website ?? null,
      isSeeded: true,
      createdByUserId: null,
    });
  }

  return { rows: [...byKey.values()], collisions };
}

async function main(): Promise<void> {
  const { rows, collisions } = dedupe();

  for (const collision of collisions) {
    console.warn(`  skipped: ${collision}`);
  }

  // Only seeded rows matter here. A user-created company sharing a name is
  // legitimate and must not be touched.
  const existing = await prisma.company.findMany({
    where: { createdByUserId: null },
    select: { nameNormalized: true },
  });
  const alreadySeeded = new Set(existing.map((row) => row.nameNormalized));

  const toInsert = rows.filter((row) => !alreadySeeded.has(row.nameNormalized));

  if (toInsert.length > 0) {
    // skipDuplicates makes this safe to run concurrently with itself, and the
    // partial unique index is the real backstop.
    await prisma.company.createMany({ data: toInsert, skipDuplicates: true });
  }

  const total = await prisma.company.count({ where: { createdByUserId: null } });

  console.log(`companies in list:    ${SEED_COMPANIES.length}`);
  console.log(`unique after dedupe:  ${rows.length}`);
  console.log(`inserted this run:    ${toInsert.length}`);
  console.log(`seeded rows total:    ${total}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
