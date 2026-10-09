-- The trigram index the `search_indexes` migration missed. See DESIGN.md §3
-- and the Phase 5 step 4 findings.
--
-- No user input reaches this file: it is DDL in a migration, so there is no
-- injection surface here.

-- ---------------------------------------------------------------------------
-- Note.content trigram search
--
-- `searchClause` in queries/applications.ts matches four things, because §3
-- says the applications search covers notes: job title, location, company name
-- — and note content. The original search_indexes migration added a GIN
-- trigram index for the first three and not for the fourth, so the notes arm of
-- every search was a sequential scan over the whole Note table.
--
-- **Measured, not assumed.** The Phase 5 query-plan probe seeded 20 350 notes
-- across 26 accounts and ran the list endpoint's search: 15.95 ms with a
-- `Seq Scan on Note` in the plan, against 0.55 ms for the same query when the
-- table held a few hundred rows. A 29× regression caused by one missing index.
--
-- It is also the worst table to leave unindexed. `Note` is the only searched
-- table that grows without bound and without the user noticing: an application
-- count is visible and self-limiting, while notes accumulate a few at a time
-- forever, across every account, and they are the longest text in the schema.
--
-- GIN rather than GiST, and trigram rather than tsvector, for the reason given
-- in search_indexes: the search is substring-based (`contains`, which Prisma
-- renders as ILIKE '%fragment%') because people type fragments. A tsvector
-- index would not serve a substring match at all.
-- ---------------------------------------------------------------------------

CREATE INDEX "note_content_trgm"
  ON "Note" USING gin ("content" gin_trgm_ops);
