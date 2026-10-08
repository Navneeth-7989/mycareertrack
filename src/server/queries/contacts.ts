import { Prisma } from "@prisma/client";

import { prisma } from "../db";

/**
 * Contact reads: the `/contacts` page and the picker that links one to an application
 * (DESIGN.md §6, §7 Phase 3).
 */

const contactListSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  phone: true,
  linkedinUrl: true,
  notes: true,
  /**
   * The applications this person is attached to, through the join.
   *
   * Fetched rather than counted, because the card shows *which* roles — a recruiter
   * who handled three of your applications is the useful fact about them, and a bare
   * "3 applications" would send the user hunting. `role` comes from the join, since
   * the same person can be a referrer on one and the hiring manager on another (§3).
   */
  applications: {
    select: {
      role: true,
      application: {
        select: {
          id: true,
          jobTitle: true,
          status: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ContactSelect;

export type ContactListItem = Prisma.ContactGetPayload<{ select: typeof contactListSelect }>;

/**
 * A bound rather than a feature, like `BOARD_COLUMN_LIMIT`. A job search produces tens
 * of contacts, not thousands; the cap is here so one pathological account cannot
 * render ten thousand cards.
 */
export const CONTACT_LIMIT = 200;

export async function listContacts(userId: string): Promise<ContactListItem[]> {
  return prisma.contact.findMany({
    where: { userId },
    select: contactListSelect,
    /*
     * Most-connected first, then alphabetical. The recruiter who has handled four of
     * your applications is the one you came to the page to find; sorting purely by name
     * would bury them under every one-off contact auto-created from a form.
     *
     * Tie-broken on `name` and then `id`, so the order is stable between renders —
     * most contacts have exactly one link, which means most of this list is one big tie.
     */
    orderBy: [{ applications: { _count: "desc" } }, { name: "asc" }, { id: "asc" }],
    take: CONTACT_LIMIT,
  });
}

/**
 * The contacts offered when linking one to an application, minus the ones already
 * linked to it.
 *
 * Excluding the existing links is what keeps the picker honest: offering a person who
 * is already attached would invite a click whose only effect is to rewrite their role,
 * which is not what "Link a contact" says it does.
 */
export type ContactOption = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
};

export async function listLinkableContacts(
  userId: string,
  applicationId: string,
): Promise<ContactOption[]> {
  return prisma.contact.findMany({
    where: {
      userId,
      // `none` rather than fetching and filtering — the join is indexed on
      // `[contactId]` and this keeps the exclusion in Postgres.
      applications: { none: { applicationId } },
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: CONTACT_LIMIT,
  });
}
