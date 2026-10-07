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

/**
 * The edit form's half of the same job: reconcile the recruiter block against
 * whatever contact this application is already linked to.
 *
 * **This one overwrites, and `resolveAndLinkRecruiter` deliberately does not.**
 * The difference is intent, not inconsistency. On create the fields are a side
 * effect of logging an application, so a typo must not rewrite a contact a dozen
 * other applications share — hence `backfill`, which only fills blanks. On the
 * edit form the user has opened a contact's details, seen them in the inputs and
 * changed them, which is an explicit act. Silently refusing that edit would be
 * worse than performing it, so the page warns when the contact is shared and
 * then does what it was told.
 *
 * Four cases, in the order they are decided:
 *
 * 1. **Nothing to reach them by** — no email and no phone. §8's rule that a bare
 *    name is not a contact applies on the way out as well as in, so any existing
 *    link is removed. The `Contact` row survives: it may belong to other
 *    applications, and deleting someone's record because one application stopped
 *    referring to them is not an edit, it is data loss.
 * 2. **No contact linked yet** — the create path, unchanged.
 * 3. **The email now names a different contact** — the link moves. Matching by
 *    email is the identity rule everywhere else here, so typing a colleague's
 *    address means "it was actually them", not "rename this person".
 * 4. **Otherwise** — update the linked contact in place.
 */
export async function syncRecruiterLink(
  userId: string,
  applicationId: string,
  input: RecruiterInput,
  linkedContactId: string | null,
  client: ContactClient = prisma,
): Promise<LinkedContact | null> {
  if (!input.email && !input.phone) {
    if (linkedContactId) {
      await client.applicationContact.delete({
        where: { applicationId_contactId: { applicationId, contactId: linkedContactId } },
      });
    }

    return null;
  }

  if (!linkedContactId) {
    return resolveAndLinkRecruiter(userId, applicationId, input, client);
  }

  /*
   * Scoped by `userId`, not just by id. The id arrives from the application's
   * own join row so it is already this user's, but the rule in §4 is that
   * ownership lives in the WHERE clause rather than in an argument someone
   * trusted — and this is a write.
   */
  const linked = await client.contact.findFirst({
    where: { id: linkedContactId, userId },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!linked) {
    // The contact was deleted between the page load and the save. Treat it as
    // "none linked" rather than failing the whole edit over a stale reference.
    return resolveAndLinkRecruiter(userId, applicationId, input, client);
  }

  if (input.email && input.email !== linked.email) {
    const other = await client.contact.findFirst({
      where: { userId, email: input.email, id: { not: linked.id } },
      select: { id: true, name: true },
    });

    if (other) {
      // Move the link rather than rewriting either record. Re-pointed in two
      // steps because the join's primary key is the pair, so there is no row to
      // update — only one to drop and one to add.
      await client.applicationContact.delete({
        where: { applicationId_contactId: { applicationId, contactId: linked.id } },
      });

      await client.applicationContact.create({
        data: { applicationId, contactId: other.id, role: input.role },
      });

      return { ...other, created: false };
    }
  }

  const contact = await client.contact.update({
    where: { id: linked.id },
    data: {
      // `contactName` rather than the raw value: clearing the name on a contact
      // identified by its address should fall back to that address, never to an
      // empty string in a non-null column.
      name: contactName(input),
      email: input.email,
      phone: input.phone,
      role: input.role,
    },
    select: { id: true, name: true },
  });

  // The role on the join is this person's role *on this application* (§3), and
  // it is a different column from the one just written — the same recruiter can
  // be the referrer here and the hiring manager elsewhere.
  await client.applicationContact.update({
    where: { applicationId_contactId: { applicationId, contactId: contact.id } },
    data: { role: input.role },
  });

  return { ...contact, created: false };
}
