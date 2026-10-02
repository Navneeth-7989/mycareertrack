import bcrypt from "bcryptjs";

/**
 * Password hashing. The only module that knows the cost factor, so hashing and
 * verification can never disagree about it.
 *
 * Cost 12 per DESIGN.md §8 — roughly 250ms per hash on commodity hardware,
 * which is slow enough to make offline cracking expensive and fast enough that
 * a sign-in still feels instant.
 */
const COST = 12;

/**
 * A real cost-12 hash of a random string that is not any user's password, used
 * to burn the same CPU time when the account doesn't exist. Without it, a
 * missing user returns in ~1ms while a wrong password takes ~250ms, and that
 * gap is a usable email-enumeration oracle.
 *
 * It is a baked-in constant rather than a hash computed at import time because
 * computing one would add 250ms to cold start on every serverless invocation.
 */
const DECOY_HASH = "$2b$12$5NKFLnELSOqWcgOpD/8eEuNIIA9UCniEQlGe7uI41RIgQkfwAFEdm";

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Call instead of `verifyPassword` when there is no hash to check against — an
 * email with no account, or an OAuth-only account with a null `passwordHash`.
 * Always returns false; the point is the time it takes to do so.
 */
export async function burnPasswordComparison(plaintext: string): Promise<false> {
  await bcrypt.compare(plaintext, DECOY_HASH);
  return false;
}
