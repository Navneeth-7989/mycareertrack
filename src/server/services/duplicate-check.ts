import type { Prisma } from "@prisma/client";

import { isSimilarJobTitle } from "@/lib/utils/title-similarity";
import type { ApplicationWarning } from "@/lib/validations/application";

import { prisma } from "../db";

/**
 * The duplicate advisory for application create (DESIGN.md §6).
 *
 * This function only *detects*. What happens next is the caller's decision, and
 * `mutations/applications.ts` makes it by level:
 *
 * - Same company → `level: "info"`. Returned beside a 201 and shown as a toast.
 *   Three Google roles is normal; this is context, not a problem.
 * - Same company *and* a similar job title → `level: "warning"`. The create
 *   stops and asks for confirmation before writing anything, because this one
 *   is usually the same posting entered twice.
 *
 * Neither is a block in §8's sense — a duplicate can never be *refused*. The
 * warning level can only ask first, and a confirmed duplicate saves normally.
 */

type ApplicationClient = Pick<Prisma.TransactionClient, "application">;

/**
 * The cap exists so a user with 40 applications at one company does not turn
 * one create into a 40-row read. Ordered newest first, because if the advisory
 * is going to name one application, the most recent is the one the user
 * remembers.
 */
const CANDIDATE_LIMIT = 20;

export async function findDuplicateWarning(
  userId: string,
  input: { companyId: string; companyName: string; jobTitle: string },
  client: ApplicationClient = prisma,
): Promise<ApplicationWarning | null> {
  // userId in the WHERE clause of both, as everywhere (§4). Without it this
  // would happily tell one user about another user's applications at the same
  // company — a data leak dressed up as a helpful warning.
  const where = { userId, companyId: input.companyId };

  const candidates = await client.application.findMany({
    where,
    select: { id: true, jobTitle: true },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) {
    return null;
  }

  // Counted rather than inferred from `candidates.length`, which is capped:
  // someone with 30 applications at one company would otherwise be told they
  // have 20. An indexed count on one user's rows at one company is cheap.
  const total =
    candidates.length < CANDIDATE_LIMIT
      ? candidates.length
      : await client.application.count({ where });

  const similar = candidates.filter((candidate) =>
    isSimilarJobTitle(candidate.jobTitle, input.jobTitle),
  );

  if (similar.length > 0) {
    return {
      code: "POSSIBLE_DUPLICATE",
      level: "warning",
      message: `You already have an application for ${similar[0]!.jobTitle} at ${input.companyName}`,
      applicationIds: similar.map((candidate) => candidate.id),
    };
  }

  return {
    code: "POSSIBLE_DUPLICATE",
    level: "info",
    // Counting rather than naming: at the info level the point is "you have
    // history here", and listing four unrelated job titles in a toast is
    // noise.
    message:
      total === 1
        ? `You have one other application at ${input.companyName}`
        : `You have ${total} other applications at ${input.companyName}`,
    applicationIds: candidates.map((candidate) => candidate.id),
  };
}
