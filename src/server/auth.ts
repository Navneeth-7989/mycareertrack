import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { credentialsSignInSchema } from "@/lib/validations/auth";

import { prisma } from "./db";
import { requireEnv } from "./env";
import { burnPasswordComparison, verifyPassword } from "./services/password";

/**
 * Auth.js v5 configuration — the single place identity is established.
 *
 * Three sign-in methods land on one `User` row (DESIGN.md §3): Google, GitHub,
 * and email/password. `User.passwordHash` is nullable, which is what lets an
 * OAuth-only account exist without a password.
 *
 * Session strategy is JWT, not database. This is forced rather than preferred:
 * the Credentials provider cannot issue database sessions in Auth.js v5,
 * because a credentials sign-in never goes through the adapter's
 * `createSession`. The `Session` table stays in the schema regardless — the
 * Prisma adapter's types require it — it simply holds no rows. The adapter is
 * still doing real work for the OAuth providers: creating users, and linking
 * `Account` rows on sign-in.
 *
 * The practical consequence of JWT sessions is that a token keeps working until
 * it expires even if the user row is deleted. `requireUser()` closes that gap
 * by reading the user row on every call, so the token is treated as a claim
 * about identity, never as proof the account still exists.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // Explicit rather than inferred from AUTH_SECRET so a missing secret fails at
  // startup with the variable's name instead of as a token-decryption error on
  // the first sign-in.
  secret: requireEnv("AUTH_SECRET"),

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    // Send provider failures to our own form, which can render them inline,
    // rather than to the unstyled default page at /api/auth/error.
    error: "/login",
  },

  providers: [
    // allowDangerousEmailAccountLinking is deliberately left at its default of
    // false (DESIGN.md §8): if it were true, signing in with a Google account
    // whose email matches an existing unverified account would silently take
    // that account over.
    Google({
      clientId: requireEnv("AUTH_GOOGLE_ID"),
      clientSecret: requireEnv("AUTH_GOOGLE_SECRET"),
    }),

    GitHub({
      clientId: requireEnv("AUTH_GITHUB_ID"),
      clientSecret: requireEnv("AUTH_GITHUB_SECRET"),
    }),

    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      /**
       * Returning `null` is the only failure signal this function has — every
       * rejection below is indistinguishable to the caller, by design. The
       * login form therefore shows one generic message for all of them, so the
       * endpoint can't be used to test whether an email is registered.
       */
      async authorize(raw) {
        const parsed = credentialsSignInSchema.safeParse(raw);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // findUnique on email is correct here and is not a breach of the
        // findFirst-with-userId rule in DESIGN.md §4. That rule protects rows
        // *owned by* a user; this query is how we establish who the user is, so
        // there is no userId to scope it by yet.
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
          },
        });

        // No account, or an OAuth-only account with no password set. Burn the
        // same ~250ms a real comparison costs so the response time doesn't
        // reveal which case it was.
        if (!user?.passwordHash) {
          await burnPasswordComparison(password);
          return null;
        }

        if (!(await verifyPassword(password, user.passwordHash))) {
          return null;
        }

        // passwordHash is deliberately not spread into the returned object —
        // whatever is returned here ends up inside the JWT.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * The token carries identity and nothing else. Mutable profile state —
     * `onboardingCompleted` above all — is deliberately kept out of it: a
     * JWT is a snapshot, and a stale `onboardingCompleted: false` would bounce
     * a user back into the wizard they just finished. `requireUser()` reads
     * that from the database instead.
     */
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }

      return token;
    },

    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
