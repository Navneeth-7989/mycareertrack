import { Prisma } from "@prisma/client";

import { ConflictError } from "@/lib/api/errors";
import type { RegisterPayload } from "@/lib/validations/auth";

import { prisma } from "../db";
import { hashPassword } from "../services/password";

export type RegisteredUser = { id: string; email: string };

/**
 * Creates an email/password account.
 *
 * No `Profile` row is created here — the onboarding wizard writes it, and it
 * has to handle the OAuth case anyway, where the `User` row appears without any
 * code of ours running. One code path for both is better than two that must
 * stay in agreement.
 */
export async function registerCredentialsUser({
  email,
  password,
}: RegisterPayload): Promise<RegisteredUser> {
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });
  } catch (error) {
    // Relying on the unique index rather than checking for the email first:
    // a read-then-write leaves a window where two simultaneous registrations
    // both see "no such user" and only one survives, with the loser getting a
    // 500 instead of a 409.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // This does confirm the email is registered, which /login deliberately
      // refuses to do. The trade is accepted here because the alternative —
      // claiming success and sending nothing — needs a verification email to
      // be anything other than a lie, and there is no email provider in this
      // build (DESIGN.md §9, password reset deferred).
      //
      // An existing OAuth-only account lands here too, and is also refused: an
      // unverified email must not be able to attach a password to an account
      // someone else created with Google (DESIGN.md §8, account linking).
      throw new ConflictError("An account with this email already exists", {
        email: "An account with this email already exists",
      });
    }

    throw error;
  }
}
