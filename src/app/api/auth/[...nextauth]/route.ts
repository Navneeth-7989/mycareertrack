import { handlers } from "@/server/auth";

/**
 * Auth.js mounts its entire surface here — sign-in, callbacks, CSRF, session,
 * sign-out. The provider redirect URIs registered with Google and GitHub point
 * at /api/auth/callback/google and /api/auth/callback/github, which are handled
 * by these two exports.
 */
export const { GET, POST } = handlers;
