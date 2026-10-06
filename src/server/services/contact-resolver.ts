import type { Prisma } from "@prisma/client";

import { prisma } from "../db";

/**
 * Auto-creates a `Contact` from the recruiter fields on the application form,
 * and links it to the application (DESIGN.md §9).
 *
 * The rule that shapes everything here, from §8's edge-case table: **a bare
 * name is not a contact.** Something to reach the person by — an email or a
 * phone number — is what makes a row worth creating. A name on its own produces
 * nothing, because a contacts page full of names with no way to contact them is
 * worse than an empty one.
 *
 * Matching is by `[userId, email]`, which the schema has a unique index on
 * precisely so this can be idempotent: entering the same recruiter on five
 * applications creates one contact with five links, not five contacts.
 */

type ContactClient = Pick<Prisma.TransactionClient, "contact" | "applicationContact">;

export type RecruiterInput = {
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
};

export type LinkedContact = {
  id: string;
  name: string;
  created: boolean;
};

export async function resolveAndLinkRecruiter(
  userId: string,
  applicationId: string,
  input: RecruiterInput,
  client: ContactClient = prisma,
): Promise<LinkedContact | null> {
  if (!input.email && !input.phone) {
    return null;
  }

  const contact = await findOrCreateContact(userId, input, client);

  await client.applicationContact.create({
    data: {
      applicationId,
      contactId: contact.id,
      // The role lives on the join, not on the contact: the same person can be
      // a referrer on one application and the hiring manager on another (§3).
      role: input.role,
    },
  });

  return contact;
}

async function findOrCreateContact(
  userId: string,
  input: RecruiterInput,
  client: ContactClient,
): Promise<LinkedContact> {
  const name = contactName(input);

  const existing = await client.contact.findFirst({
    where: {
      userId,
      // Email is the identity when there is one, because it is the field with a
      // unique index behind it. Falling back to the phone number is best-effort
      // — there is no index to enforce it, and "+919876543210" and
      // "098765 43210" are the same person written two ways, which is more than
      // a WHERE clause can know. The cost of missing a match is a duplicate
      // contact the user can merge on the contacts page, not lost data.
      ...(input.email ? { email: input.email } : { phone: input.phone }),
    },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  if (existing) {
    return { ...(await backfill(existing, input, client)), created: false };
  }

  const contact = await client.contact.create({
    data: {
      userId,
      name,
      role: input.role,
      email: input.email,
      phone: input.phone,
    },
    select: { id: true, name: true },
  });

  return { ...contact, created: true };
}

/**
 * The name to store when the form gave us contact details but no name.
 *
 * `Contact.name` is non-null, and the honest options were a placeholder like
 * "Unknown" or the address itself. The address wins: "recruiting@google.com" is
 * recognisable in a list and is literally true, where "Unknown" is a row the
 * user cannot identify. They can rename it on the contacts page.
 */
function contactName(input: RecruiterInput): string {
  return input.name ?? input.email ?? input.phone ?? "Contact";
}

/**
 * Fills in details the existing contact was missing — never overwrites.
 *
 * A recruiter stored months ago with only an email gains their phone number the
 * first time it is typed. Overwriting instead would mean one typo on one
 * application silently rewrites a contact used by a dozen others, and the user
 * would have no idea which form did it. Editing a contact is the contacts page's
 * job, where it is an explicit act.
 */
async function backfill(
  existing: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
  },
  input: RecruiterInput,
  client: ContactClient,
): Promise<{ id: string; name: string }> {
  const data: Prisma.ContactUpdateInput = {};

  if (!existing.email && input.email) {
    data.email = input.email;
  }

  if (!existing.phone && input.phone) {
    data.phone = input.phone;
  }

  if (!existing.role && input.role) {
    data.role = input.role;
  }

  // A contact stored as its own email address gains a real name the first time
  // one is given — the placeholder from `contactName` is not a name the user
  // chose, so replacing it is a fix rather than an overwrite.
  if (input.name && existing.name !== input.name && isPlaceholderName(existing)) {
    data.name = input.name;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return client.contact.update({
    where: { id: existing.id },
    data,
    select: { id: true, name: true },
  });
}

function isPlaceholderName(existing: {
  name: string;
  email: string | null;
  phone: string | null;
}): boolean {
  return existing.name === existing.email || existing.name === existing.phone;
}
