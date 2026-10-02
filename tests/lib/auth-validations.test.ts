import { describe, expect, it } from "vitest";

import {
  credentialsSignInSchema,
  registerPayloadSchema,
  registerSchema,
} from "@/lib/validations/auth";

describe("email normalisation", () => {
  it("trims and lowercases before validating", () => {
    const result = registerPayloadSchema.safeParse({
      email: "  Navneet@Example.COM ",
      password: "correct horse",
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("navneet@example.com");
  });

  // The unique index on User.email is case-sensitive, so normalising is what
  // stops "Me@x.com" and "me@x.com" becoming two accounts.
  it("collapses casing variants to the same value", () => {
    const a = registerPayloadSchema.parse({ email: "ME@X.COM", password: "password1" });
    const b = registerPayloadSchema.parse({ email: "me@x.com", password: "password1" });

    expect(a.email).toBe(b.email);
  });

  it.each(["", "not-an-email", "me@", "@example.com", "me @example.com"])("rejects %j", (email) => {
    expect(registerPayloadSchema.safeParse({ email, password: "password1" }).success).toBe(false);
  });
});

describe("password rules", () => {
  it("rejects anything shorter than 8 characters", () => {
    const result = registerPayloadSchema.safeParse({ email: "me@x.com", password: "short7!" });

    expect(result.success).toBe(false);
  });

  // bcrypt truncates at 72 bytes. Without the cap, two different long
  // passwords would share a hash and both unlock the account.
  it("rejects anything longer than 72 characters", () => {
    const result = registerPayloadSchema.safeParse({
      email: "me@x.com",
      password: "a".repeat(73),
    });

    expect(result.success).toBe(false);
  });

  it("accepts exactly 72 characters", () => {
    const result = registerPayloadSchema.safeParse({
      email: "me@x.com",
      password: "a".repeat(72),
    });

    expect(result.success).toBe(true);
  });
});

describe("registerSchema", () => {
  it("reports a mismatch on the confirmation field", () => {
    const result = registerSchema.safeParse({
      email: "me@x.com",
      password: "password1",
      confirmPassword: "password2",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("accepts a matching pair", () => {
    const result = registerSchema.safeParse({
      email: "me@x.com",
      password: "password1",
      confirmPassword: "password1",
    });

    expect(result.success).toBe(true);
  });
});

describe("registerPayloadSchema", () => {
  // The API takes email and password only — a client that posts extra fields
  // must not be able to get them anywhere near prisma.user.create.
  it("strips fields it does not declare", () => {
    const result = registerPayloadSchema.parse({
      email: "me@x.com",
      password: "password1",
      confirmPassword: "password1",
      onboardingCompleted: true,
      id: "cuid-of-another-user",
    });

    expect(result).toEqual({ email: "me@x.com", password: "password1" });
  });
});

describe("credentialsSignInSchema", () => {
  // A sign-in is checked against the stored hash, not the current policy, so an
  // account made before a rule changed must still be able to sign in.
  it("does not apply the registration password policy", () => {
    const result = credentialsSignInSchema.safeParse({ email: "me@x.com", password: "old" });

    expect(result.success).toBe(true);
  });

  it("still requires a password", () => {
    const result = credentialsSignInSchema.safeParse({ email: "me@x.com", password: "" });

    expect(result.success).toBe(false);
  });
});
