import type { Prisma } from "@prisma/client";

import { ConfirmationRequiredError, ConflictError, NotFoundError } from "@/lib/api/errors";
import type { ContactPayload, LinkContactPayload } from "@/lib/validations/contact";

import { prisma } from "../db";

/**
 * Contact writes for the contacts page (DESIGN.md §6, §7 Phase 3).
 *
 * The auto-creation path from the application form is `services/contact-resolver` and
 * is untouched by this file. The two coexist deliberately: that one *backfills* and
 * never overwrites, because there the fields are a side effect of logging an
 * application; this one does what the user explicitly typed, because they opened a
 * form headed "Edit contact".
 *
 * **The duplicate story is layered, which is how §8 and §3 are reconciled.** §8 asks
 * for a "warning on manual entry"; §3 puts a unique index on `[userId, email]`. Those
 * pull in opposite directions — a warning implies you may proceed, and the index says
 * you may not — so the two cases are separated:
 *
 * - **Same email** → a hard `ConflictError`. There is nowhere to put the row, so
 *   pretending it is a warning would mean offering a confirmation that could only
 *   fail. The message names the existing contact, because the useful action is to edit
 *   that one.
 * - **Same name, different or absent email** → `ConfirmationRequiredError`, the
 *   acknowledge-and-retry pattern the application form already uses. This is §8's
 *   warning, and it is genuinely only a warning: two people really can be called Priya
 *   Sharma, and the second one must be storable.
 */

export type WrittenContact = { id: string; name: string };

const writtenSelect = { id: true, name: true } as const;

/**
 * Looks for a contact this one would collide with.
 *
 * `existing` is null on create and the stored row on update. It does two jobs, and the
 * second one is the whole reason this function has the shape it does.
 *
 * **It excludes the row from matching itself** — the same problem `findDuplicateWarning`
 * solved for applications with the same fix. Without it no contact could ever be saved a
 * second time.
 *
 * **And it skips the name check entirely when the name did not change.** That is not an
 * optimisation; without it the feature is broken in a way the probe caught. Acknowledge a
 * duplicate name once — two people really are both called Priya Sharma — and every later
 * edit to *either* of them re-asks a question that was settled, because each now has a
 * namesake on file. The user would be interrupted on every save of a contact's phone
 * number forever. This is the identical lesson as `identityChanged` in
 * `updateApplication`, which says it in full: "a dialog that appears on saves it has no
 * business interrupting is a dialog people learn to dismiss without reading."
 *
 * The **email** arm still runs unconditionally, and safely: the unique index means an
 * unchanged email cannot collide with anything except the row it is already on, which
 * `notSelf` excludes. So a conflict there is always a genuinely new one.
 *
 * The name comparison is case-insensitive and trimmed but nothing cleverer. Trigram
 * similarity is right for job titles, where "SDE Intern" and "SDE-Intern" are the same
 * role; for people it would start asking whether Priya Sharma is Priya Sharman, and a
 * false positive on a person's name is more annoying than a missed duplicate.
 */
async function findCollision(
  userId: string,
  payload: { name: string; email: string | null },
  existing: { id: string; name: string } | null,
  client: Prisma.TransactionClient = prisma,
): Promise<{ kind: "email" | "name"; contact: WrittenContact } | null> {
  const notSelf = existing ? { id: { not: existing.id } } : {};

  if (payload.email) {
    const byEmail = await client.contact.findFirst({
      where: { userId, email: payload.email, ...notSelf },
      select: writtenSelect,
    });

    if (byEmail) {
      return { kind: "email", contact: byEmail };
    }
  }

  const name = payload.name.trim();

  // Unchanged name on an edit: nothing to ask about. The collision, if any, is one the
  // user already answered when this row was created.
  if (existing && existing.name.trim().toLowerCase() === name.toLowerCase()) {
    return null;
  }

  const byName = await client.contact.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, ...notSelf },
    select: writtenSelect,
  });

  return byName ? { kind: "name", contact: byName } : null;
}

/**
 * Raises the right error for a collision, or returns quietly when there is none.
 *
 * Shared by create and update so the two cannot answer the same situation differently —
 * which they would, eventually, since the create path is the one anybody tests.
 */
function rejectCollision(
  collision: { kind: "email" | "name"; contact: WrittenContact } | null,
  acknowledged: boolean,
): void {
  if (!collision) {
    return;
  }

  if (collision.kind === "email") {
    throw new ConflictError(
      `${collision.contact.name} already has that email address. Edit that contact instead of adding a second one.`,
      { email: "You already have a contact with this email" },
    );
  }

  if (!acknowledged) {
    throw new ConfirmationRequiredError({
      reason: "POSSIBLE_DUPLICATE_CONTACT",
      message: `You already have a contact called ${collision.contact.name}. Add this one anyway?`,
      relatedIds: [collision.contact.id],
    });
  }
}

export async function createContact(
  userId: string,
  payload: ContactPayload,
): Promise<WrittenContact> {
  /*
   * One transaction, so the check and the write cannot be separated by another
   * create. Without it two tabs submitting the same email would both pass the check
   * and the second would hit the unique index — a P2002 that `handleRouteError` turns
   * into a generic "That record already exists" rather than the sentence above.
   */
  return prisma.$transaction(async (tx) => {
    // No `existing` on create: every collision is a new one, so both arms run.
    const collision = await findCollision(userId, payload, null, tx);

    rejectCollision(collision, payload.acknowledgeDuplicate);

    return tx.contact.create({
      data: {
        // From the session, never from the body (§4, rule 3).
        userId,
        name: payload.name,
        role: payload.role,
        email: payload.email,
        phone: payload.phone,
        linkedinUrl: payload.linkedinUrl,
        notes: payload.notes,
      },
      select: writtenSelect,
    });
  });
}

/**
 * Edits a contact.
 *
 * **This overwrites**, where the resolver's `backfill` only fills blanks. The
 * difference is intent, exactly as in `syncRecruiterLink`: here the user has seen the
 * stored values in the inputs and changed them. A contact shared with several
 * applications is changed for all of them, which is why the page says how many are
 * affected before the fields.
 */
export async function updateContact(
  userId: string,
  contactId: string,
  payload: ContactPayload,
): Promise<WrittenContact> {
  return prisma.$transaction(async (tx) => {
    // Ownership in the WHERE clause (§4). Null becomes a 404, never a 403 (§6).
    const existing = await tx.contact.findFirst({
      where: { id: contactId, userId },
      // `name` as well as `id`: `findCollision` needs it to tell an edit that *renamed*
      // the contact from one that merely touched another field.
      select: { id: true, name: true },
    });

    if (!existing) {
      throw new NotFoundError("Contact not found");
    }

    const collision = await findCollision(userId, payload, existing, tx);

    rejectCollision(collision, payload.acknowledgeDuplicate);

    return tx.contact.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        role: payload.role,
        email: payload.email,
        phone: payload.phone,
        linkedinUrl: payload.linkedinUrl,
        notes: payload.notes,
      },
      select: writtenSelect,
    });
  });
}

/**
 * Deletes a contact and every link to it.
 *
 * The links go by `onDelete: Cascade` on `ApplicationContact` (§3) — no loop here, and
 * no orphan possible. The *applications* are untouched: deleting a person is not a
 * reason to delete the roles they were attached to, which is the mirror of why
 * deleting an application only unlinks its contacts.
 */
export async function deleteContact(userId: string, contactId: string): Promise<WrittenContact> {
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, userId },
    select: writtenSelect,
  });

  if (!existing) {
    throw new NotFoundError("Contact not found");
  }

  await prisma.contact.delete({ where: { id: existing.id } });

  return existing;
}

/**
 * Links an existing contact to an application — the many-to-many §7 asks for.
 *
 * **Both ids are checked against `userId` separately**, and that is the whole security
 * surface of this function: it takes two foreign keys from the client, and either one
 * pointing at somebody else's row would be the IDOR §8 is most concerned about. A
 * single query cannot answer both questions, so there are two.
 *
 * Linking twice is not an error. The join's primary key is the pair, so a second
 * identical link is impossible anyway — and the honest reading of a repeated request
 * is that the user wants the link to exist, which it does. The `role` is updated in
 * that case, since that is the only thing they could have meant to change.
 */
export async function linkContactToApplication(
  userId: string,
  applicationId: string,
  payload: LinkContactPayload,
): Promise<WrittenContact> {
  return prisma.$transaction(async (tx) => {
    const [application, contact] = await Promise.all([
      tx.application.findFirst({ where: { id: applicationId, userId }, select: { id: true } }),
      tx.contact.findFirst({ where: { id: payload.contactId, userId }, select: writtenSelect }),
    ]);

    if (!application) {
      throw new NotFoundError("Application not found");
    }

    if (!contact) {
      throw new NotFoundError("Contact not found");
    }

    await tx.applicationContact.upsert({
      where: {
        applicationId_contactId: { applicationId: application.id, contactId: contact.id },
      },
      create: { applicationId: application.id, contactId: contact.id, role: payload.role },
      update: { role: payload.role },
    });

    return contact;
  });
}

/**
 * Removes a link without deleting the person (§8: contacts are "unlinked, not
 * deleted").
 *
 * Scoped by `userId` through the application, so a forged pair cannot unpick somebody
 * else's link. `deleteMany` rather than `delete` because the ownership predicate lives
 * on a relation and Prisma's `delete` takes only a unique `where` — the same reason
 * `updateApplicationStatus` uses `updateMany`.
 */
export async function unlinkContactFromApplication(
  userId: string,
  applicationId: string,
  contactId: string,
): Promise<void> {
  const removed = await prisma.applicationContact.deleteMany({
    where: {
      applicationId,
      contactId,
      // The guard. Both sides belong to this user or nothing is deleted.
      application: { userId },
      contact: { userId },
    },
  });

  if (removed.count === 0) {
    throw new NotFoundError("That contact is not linked to this application");
  }
}
