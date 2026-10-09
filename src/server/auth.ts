import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { clientIpBucket } from "@/lib/api/client-ip";
import { RateLimitError } from "@/lib/api/errors";
import { RATE_LIMITED_SIGNIN_CODE, RATE_LIMITS } from "@/lib/constants/rate-limit";
import { credentialsSignInSchema } from "@/lib/validations/auth";

import { prisma } from "./db";
import { requireEnv } from "./env";
import { burnPasswordComparison, verifyPassword } from "./services/password";
import { clearRateLimit, enforceRateLimit } from "./services/rate-limit";

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
/**
 * The one credentials failure the login form is allowed to describe
 * specifically (DESIGN.md §6 rate limits, §8 enumeration).
 *
 * Auth.js gives `authorize` exactly two outcomes — a user, or a failure — so
 * telling the client *which* failure means subclassing `CredentialsSignin` to
 * set its `code`, which arrives on the client as `result.code`.
 *
 * Saying so leaks nothing. The counter is incremented before the user is looked
 * up, so a rate-limited response is identical for a registered address and an
 * unregistered one; all an attacker learns is that they have been hammering
 * this email and IP, which they already know. Silence here, by contrast, would
 * show a locked-out user "invalid email or password" while their password was
 * correct — which reads as "my account is broken", and is how someone ends up
 * resetting a password that was never wrong.
 */
class RateLimitedSignin extends CredentialsSignin {
  override code = RATE_LIMITED_SIGNIN_CODE;
}

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
       * endpoint can't be used to test whether an email is registered. The one
       * exception is the rate limit, which throws; see `RateLimitedSignin`.
       */
      async authorize(raw, request) {
        const parsed = credentialsSignInSchema.safeParse(raw);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        /*
         * The 5-per-15-minutes limit from §6, keyed on email **and** IP.
         *
         * Three things about where this sits:
         *
         * - **Before the user lookup**, so the bucket moves identically for a
         *   registered address and an unregistered one. Counting only real
         *   accounts would make the 429 itself an enumeration oracle, which is
         *   the bug this limit is meant to prevent rather than create.
         * - **After the schema parse**, because the key needs a normalised
         *   email. `credentialsSignInSchema` trims and lowercases, so
         *   "Me@x.com " and "me@x.com" share one bucket instead of giving an
         *   attacker a fresh five attempts per spelling.
         * - **Counting every attempt, cleared on success** (see
         *   `clearRateLimit`), so the limit is aimed at guessing rather than at
         *   a user who mistypes their own password twice.
         */
        const subject = `${email}|${clientIpBucket(request.headers)}`;

        /*
         * Translated, not propagated. `enforceRateLimit` throws the
         * `RateLimitError` that `handleRouteError` turns into a 429 with a
         * `Retry-After`, which is right for the four Route Handlers that use
         * it — but this is not a Route Handler. Anything other than a
         * `CredentialsSignin` thrown here is wrapped by Auth.js as an internal
         * callback error, which would reach the form as a generic failure and
         * be logged as a server fault rather than as the limiter working.
         *
         * The seconds are dropped on purpose rather than smuggled into the
         * code: the code travels in a URL, and `rate_limited` is the whole of
         * what the form needs to pick its copy.
         */
        try {
          await enforceRateLimit(RATE_LIMITS.credentialsLogin, subject);
        } catch (error) {
          // Narrowed deliberately. A bare `catch` here would report a database
          // outage as "too many attempts", which is a lie that sends the user
          // away to wait instead of showing that something is broken.
          if (error instanceof RateLimitError) {
            throw new RateLimitedSignin();
          }

          throw error;
        }

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

        /*
         * The password was right, so the attempts that preceded it were this
         * user's typos, not an attack. Forgetting them is what stops a correct
         * sign-in from leaving a half-full bucket behind to refuse the same
         * person later in the window.
         *
         * Awaited rather than fire-and-forget: it is a single indexed delete,
         * and a sign-in that returns before its own counter is cleared could
         * still be refused on the very next attempt.
         */
        await clearRateLimit(RATE_LIMITS.credentialsLogin, subject);

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
