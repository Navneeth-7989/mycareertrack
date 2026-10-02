import { z } from "zod";

/**
 * Auth validation schemas, shared between the client forms and the server
 * (DESIGN.md §4, rule 4). Importing the same schema on both sides is what stops
 * client and server validation from drifting apart.
 */

/**
 * Emails are normalised before they are validated, not after: trimming a string
 * that has already failed `z.email()` is pointless, and lowercasing after the
 * fact would let " Me@Example.com " and "me@example.com" become two User rows
 * despite the unique index.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address" }));

/**
 * The 72-byte ceiling is bcrypt's, not ours. bcrypt silently truncates input
 * past 72 bytes, so without this cap two different long passwords could share a
 * hash and both unlock the account. Rejecting them is better than truncating
 * them quietly.
 */
const password = z
  .string()
  .min(8, { error: "Password must be at least 8 characters" })
  .max(72, { error: "Password must be at most 72 characters" });

/**
 * What the credentials provider receives. Deliberately lenient on the password
 * — a sign-in attempt is checked against the stored hash, not against the
 * current password policy, so an account created before a rule changed can
 * still sign in.
 */
export const credentialsSignInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }),
});

export const registerSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * The server-side half of registration. The confirmation field is a UI concern
 * — the API takes email and password only, so a client that skips the form
 * can't smuggle in a third field we then have to reason about.
 */
export const registerPayloadSchema = z.object({ email, password });

export type CredentialsSignInInput = z.infer<typeof credentialsSignInSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterPayload = z.infer<typeof registerPayloadSchema>;
