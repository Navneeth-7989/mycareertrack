import { describe, expect, it } from "vitest";

import {
  EMPTY_CONTACT_FORM,
  contactFormSchema,
  contactRequestSchema,
  linkContactSchema,
  toContactFormValues,
} from "@/lib/validations/contact";

/**
 * Contacts (DESIGN.md §7, Phase 3 step 4).
 *
 * Two things here are load-bearing. The email is **lowercased**, because `[userId, email]`
 * is the unique index the whole duplicate-matching story rests on (§3) — "Priya@Google.com"
 * and "priya@google.com" are one person and Postgres would treat them as two. And
 * `acknowledgeDuplicate` defaults to **false**, so a client that has never heard of the
 * flag gets the confirmation rather than silently bypassing it.
 */

const VALID = {
  name: "Priya Sharma",
  role: "Technical recruiter",
  email: "priya@google.com",
  phone: "+91 98765 43210",
  linkedinUrl: "https://linkedin.com/in/priya",
  notes: "Met at the campus drive.",
};

describe("contactFormSchema", () => {
  it("parses a complete contact", () => {
    expect(contactFormSchema.parse(VALID)).toEqual(VALID);
  });

  it("lowercases and trims the email, as the unique index needs", () => {
    expect(contactFormSchema.parse({ ...VALID, email: "  Priya@Google.COM  " }).email).toBe(
      "priya@google.com",
    );
  });

  it("turns blank optionals into null, never empty strings", () => {
    const parsed = contactFormSchema.parse({
      name: "Someone",
      role: "",
      email: "",
      phone: "",
      linkedinUrl: "",
      notes: "",
    });

    expect(parsed.role).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.linkedinUrl).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  /**
   * §8's "a contact with no email or phone is not auto-created" governs *auto*-creation,
   * where a bare name is a half-record nobody asked for. Typing a name into this form
   * deliberately is a different act — a hiring manager you know of but cannot yet reach is
   * worth writing down.
   */
  it("accepts a name with no way to reach them, unlike auto-creation", () => {
    expect(
      contactFormSchema.safeParse({ ...EMPTY_CONTACT_FORM, name: "Known unknown" }).success,
    ).toBe(true);
  });

  it("requires a name, unlike the resolver which can fall back to an address", () => {
    const result = contactFormSchema.safeParse({ ...VALID, name: "  " });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["name"]);
  });

  /** Deliberately loose, matching `recruiterPhone`: real numbers are written many ways. */
  it.each(["+91 98765 43210", "098765-43210", "(080) 4123 4567", "+1 212 555 0199"])(
    "accepts %s as a phone number",
    (phone) => {
      expect(contactFormSchema.safeParse({ ...VALID, phone }).success).toBe(true);
    },
  );

  it.each([
    { name: "a malformed email", input: { email: "not-an-email" }, path: "email" },
    { name: "a too-short phone", input: { phone: "12" }, path: "phone" },
    { name: "letters in a phone", input: { phone: "call me maybe" }, path: "phone" },
    {
      name: "a javascript: LinkedIn URL",
      input: { linkedinUrl: "javascript:alert(1)" },
      path: "linkedinUrl",
    },
    { name: "a name over 120 characters", input: { name: "x".repeat(121) }, path: "name" },
  ])("rejects $name", ({ input, path }) => {
    const result = contactFormSchema.safeParse({ ...VALID, ...input });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
  });
});

describe("contactRequestSchema", () => {
  /**
   * Defaults to false so a client that has never heard of the flag gets the confirmation
   * rather than silently bypassing it — the same reasoning as on the application form.
   */
  it("defaults acknowledgeDuplicate to false", () => {
    expect(contactRequestSchema.parse(VALID).acknowledgeDuplicate).toBe(false);
  });

  it("accepts it when set", () => {
    expect(
      contactRequestSchema.parse({ ...VALID, acknowledgeDuplicate: true }).acknowledgeDuplicate,
    ).toBe(true);
  });

  /** A real boolean on the wire: nothing types this, so there is no input to match. */
  it("rejects a stringified flag", () => {
    expect(contactRequestSchema.safeParse({ ...VALID, acknowledgeDuplicate: "true" }).success).toBe(
      false,
    );
  });
});

/**
 * `role` here is their role on *this* application and lives on the join, not on the contact
 * (§3): the same person can be a referrer on one application and the hiring manager on
 * another.
 */
describe("linkContactSchema", () => {
  it("requires a contact id", () => {
    const result = linkContactSchema.safeParse({ role: "HR" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("contactId");
  });

  it("accepts a link with no role", () => {
    expect(linkContactSchema.parse({ contactId: "abc123" })).toEqual({
      contactId: "abc123",
      role: null,
    });
  });

  it("rejects an id longer than the column could hold", () => {
    expect(linkContactSchema.safeParse({ contactId: "x".repeat(65) }).success).toBe(false);
  });
});

describe("toContactFormValues", () => {
  it("is the inverse of what the schema does on submit", () => {
    const parsed = contactFormSchema.parse(VALID);

    expect(toContactFormValues(parsed)).toEqual(VALID);
  });

  it("turns nulls back into empty strings for the inputs", () => {
    expect(
      toContactFormValues({
        name: "Someone",
        role: null,
        email: null,
        phone: null,
        linkedinUrl: null,
        notes: null,
      }),
    ).toEqual({ ...EMPTY_CONTACT_FORM, name: "Someone" });
  });
});

describe("the form-posts-raw-values contract", () => {
  /**
   * Weaker than the other entities' tripwires, and honestly so: every contact field is
   * already a string or null, so the parsed output *is* re-parseable. What this asserts is
   * the one place the round trip would go wrong — a null reaching a required field.
   */
  it("rejects its own output when the name came back null", () => {
    expect(contactFormSchema.safeParse({ ...VALID, name: null }).success).toBe(false);
  });

  it("round-trips through toContactFormValues instead", () => {
    const parsed = contactFormSchema.parse(VALID);

    expect(contactFormSchema.safeParse(toContactFormValues(parsed)).success).toBe(true);
  });
});
