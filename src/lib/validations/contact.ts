import { z } from "zod";

import { idSchema, optionalText, requiredText } from "@/lib/validations/fields";
import { optionalUrl } from "@/lib/validations/url";

/**
 * Contact validation (DESIGN.md §3, §6, §7 Phase 3).
 *
 * The contacts *page* is Phase 3's; auto-creation from the application form shipped
 * in Phase 2 (§9), and `services/contact-resolver` owns that path. This module is
 * what the page itself posts.
 *
 * **`name` is required here and only here.** The resolver can create a contact from
 * an email alone — falling back to the address as the name, see `contactName` — because
 * there the fields are a side effect of logging an application. On this page the user
 * has opened a form headed "Add a contact", so asking for a name is reasonable and a
 * row named "recruiting@google.com" would be a worse outcome than a required field.
 *
 * Everything else is optional, including both ways of reaching the person. That looks
 * like it contradicts §8's "a contact with no email or phone is not auto-created", and
 * does not: that rule governs *auto*-creation, where a bare name is a half-record the
 * user never asked for. Typing someone's name into this form deliberately is a
 * different act — a hiring manager you know of but have no address for is worth
 * writing down.
 */

const CONTACT_NAME_MAX = 120;
const CONTACT_ROLE_MAX = 80;
const CONTACT_PHONE_MAX = 30;

/** `@db.Text` in the schema; the cap is a product decision. */
const CONTACT_NOTES_MAX = 10_000;

/**
 * Lowercased, because `[userId, email]` is the unique index the whole
 * duplicate-matching story rests on (§3). "Priya@Google.com" and
 * "priya@google.com" are one person, and Postgres would treat them as two.
 */
const contactEmail = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim().toLowerCase())
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    error: "Enter a valid email address",
  })
  .transform((value) => (value === "" ? null : value));

/**
 * Deliberately loose, matching `recruiterPhone` in `validations/application`. Real
 * numbers arrive as "+91 98765 43210", "098765-43210" and "(080) 4123 4567", and a
 * strict pattern would reject more genuine numbers than bad ones.
 */
const contactPhone = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim())
  .refine((value) => value.length <= CONTACT_PHONE_MAX, {
    error: `Phone must be at most ${CONTACT_PHONE_MAX} characters`,
  })
  .refine((value) => value === "" || /^[+()\d\s.-]{6,}$/.test(value), {
    error: "Enter a valid phone number",
  })
  .transform((value) => (value === "" ? null : value));

const contactFields = {
  name: requiredText("Name", CONTACT_NAME_MAX),
  role: optionalText("Role", CONTACT_ROLE_MAX),
  email: contactEmail,
  phone: contactPhone,
  linkedinUrl: optionalUrl("Enter a valid LinkedIn URL, for example linkedin.com/in/priya"),
  notes: optionalText("Notes", CONTACT_NOTES_MAX),
};

/** What the form validates. */
export const contactFormSchema = z.object(contactFields);

/**
 * What `POST /api/contacts` and `PATCH /api/contacts/:id` accept.
 *
 * `acknowledgeDuplicate` is the same arrangement as on the application form: not a
 * form field, appended at submit time when the user answers the confirmation. It
 * governs the *name* collision only — a duplicate email cannot be acknowledged away,
 * because the unique index means there is nowhere to put it. See
 * `findContactDuplicate`.
 */
export const contactRequestSchema = z.object({
  ...contactFields,
  acknowledgeDuplicate: z.boolean().optional().default(false),
});

export type ContactFormValues = z.input<typeof contactFormSchema>;

export type ContactFormPayload = z.output<typeof contactFormSchema>;

export type ContactPayload = z.output<typeof contactRequestSchema>;

/** The form's starting state. */
export const EMPTY_CONTACT_FORM: Required<ContactFormValues> = {
  name: "",
  role: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  notes: "",
};

/**
 * A stored contact, in the shape `toContactFormValues` needs. Spelled out rather than
 * imported from Prisma, for the §4 rule that keeps Prisma inside `src/server/`.
 */
export type ContactFormSource = {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
};

export function toContactFormValues(source: ContactFormSource): Required<ContactFormValues> {
  return {
    name: source.name,
    role: source.role ?? "",
    email: source.email ?? "",
    phone: source.phone ?? "",
    linkedinUrl: source.linkedinUrl ?? "",
    notes: source.notes ?? "",
  };
}

/**
 * What `POST /api/applications/:id/contacts` accepts — linking an existing person to
 * an application (§6).
 *
 * `role` here is their role on *this* application and lives on the join, not on the
 * contact (§3): the same person can be a referrer on one application and the hiring
 * manager on another.
 */
export const linkContactSchema = z.object({
  contactId: idSchema,
  role: optionalText("Role", CONTACT_ROLE_MAX),
});

export type LinkContactPayload = z.output<typeof linkContactSchema>;
