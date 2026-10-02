import { config } from "dotenv";

// Vitest does not read .env the way Next.js does, so load it explicitly.
// Tests that touch the database need DATABASE_URL and DIRECT_URL present.
config({ path: ".env", quiet: true });
