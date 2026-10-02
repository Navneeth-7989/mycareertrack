/**
 * Server-side environment access.
 *
 * Reading a secret straight from `process.env` gives you `string | undefined`,
 * and the `undefined` case usually surfaces much later as an unrelated-looking
 * failure — an OAuth provider configured with an undefined client id fails at
 * the provider's redirect with an opaque "invalid_client", which is a miserable
 * thing to debug. Failing at module load with the variable's name instead is
 * the same bargain src/server/db.ts already makes for DATABASE_URL.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }

  return value;
}
