-- Indexes the Prisma schema language cannot express. See DESIGN.md §3.
--
-- No user input reaches this file: it is DDL in a migration, so there is no
-- injection surface here.

-- ---------------------------------------------------------------------------
-- Seeded-company uniqueness
--
-- @@unique([createdByUserId, nameNormalized]) in the schema covers companies a
-- user created, but Postgres treats NULLs as distinct, so it does not stop two
-- seeded rows (createdByUserId IS NULL) sharing a name. A partial unique index
-- closes that gap and keeps the seed script idempotent.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "company_seeded_name_unique"
  ON "Company" ("nameNormalized")
  WHERE "createdByUserId" IS NULL;

-- ---------------------------------------------------------------------------
-- Trigram search
--
-- Search is substring-based rather than full-text: users type fragments
-- ("goog", "bangal") rather than whole words, so ILIKE '%fragment%' is what
-- they actually expect. A GIN trigram index is what keeps that from becoming a
-- sequential scan; a tsvector index would not serve substring matching at all.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "application_jobtitle_trgm"
  ON "Application" USING gin ("jobTitle" gin_trgm_ops);

CREATE INDEX "application_location_trgm"
  ON "Application" USING gin ("location" gin_trgm_ops);

CREATE INDEX "company_name_trgm"
  ON "Company" USING gin ("nameNormalized" gin_trgm_ops);
