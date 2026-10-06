import { z } from "zod";

import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";
import { optionalUrl } from "@/lib/validations/url";

/**
 * Company validation, shared by the autocomplete, the "add a company" path and
 * the application form (DESIGN.md §4, rule 4).
 */

/**
 * Long enough for "Tata Consultancy Services Private Limited" with room to
 * spare, short enough that a pasted paragraph is rejected rather than stored.
 */
export const COMPANY_NAME_MAX = 120;

/**
 * The company name as typed, with its display casing preserved — `Company.name`
 * keeps what the user wrote and `nameNormalized` is derived from it.
 *
 * Two checks beyond length, both about the match key rather than the name:
 *
 * - It must contain a letter or a digit. "---" normalizes to "---", which is a
 *   perfectly valid match key for a company that does not exist; the unicode
 *   classes are what keep a name written in Devanagari or Han from being
 *   mistaken for punctuation.
 * - It must not normalize away to nothing, which would produce an empty match
 *   key that collides with every other such name while matching none of them.
 *   `normalizeCompanyName` already refuses to reduce a real name to nothing, so
 *   this is a backstop rather than the primary defence — and it is why "Ltd."
 *   is *accepted*: the normalizer requires a separator before a suffix, so
 *   that name keeps its key, and the rule that makes it do so is the same one
 *   protecting a company genuinely called "Limited".
 */
export const companyNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Company is required" })
  .max(COMPANY_NAME_MAX, {
    error: `Company must be at most ${COMPANY_NAME_MAX} characters`,
  })
  .refine((name) => /[\p{L}\p{N}]/u.test(name), {
    error: "Enter a company name",
  })
  .refine((name) => normalizeCompanyName(name).length > 0, {
    error: "Enter a company name",
  });

export const companyWebsiteSchema = optionalUrl(
  "Enter a valid website, for example careers.google.com",
);

/**
 * `POST /api/companies` — the explicit "add a company" path. The common case is
 * implicit, inside application create (DESIGN.md §6).
 */
export const createCompanySchema = z.object({
  name: companyNameSchema,
  website: companyWebsiteSchema,
});

export type CreateCompanyPayload = z.output<typeof createCompanySchema>;

/**
 * The autocomplete row, as it arrives in the browser.
 *
 * Parsed rather than asserted, for the reason given in `lib/api/read-error.ts`:
 * a `fetch` can resolve with a proxy's HTML error page just as easily as with
 * our envelope, and the combobox should find nothing rather than crash. This is
 * also what keeps `any` off the boundary (§5, Phase 5's checklist).
 */
export const companySuggestionSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameNormalized: z.string(),
  website: z.string().nullable(),
  isSeeded: z.boolean(),
});

export const companySearchResponseSchema = z.object({
  data: z.array(companySuggestionSchema),
});

export type CompanyOption = z.output<typeof companySuggestionSchema>;

/** Matches the API cap in DESIGN.md §6: autocomplete returns at most 10. */
export const COMPANY_SEARCH_LIMIT = 10;
const COMPANY_SEARCH_LIMIT_MAX = 25;

/**
 * `GET /api/companies/search` query parameters.
 *
 * `q` is deliberately not required. An empty query is a real request — it is
 * what the combobox sends when it opens, and it answers with the companies the
 * user has already applied to rather than with nothing.
 *
 * Over-long input is truncated rather than rejected: this runs on every
 * keystroke, and a 400 would turn a long paste into an error message under a
 * search box instead of simply finding no matches.
 */
export const companySearchParamsSchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim().slice(0, COMPANY_NAME_MAX)),
  limit: z.coerce
    .number()
    .int({ error: "limit must be a whole number" })
    .min(1, { error: "limit must be at least 1" })
    .max(COMPANY_SEARCH_LIMIT_MAX, { error: `limit must be at most ${COMPANY_SEARCH_LIMIT_MAX}` })
    .default(COMPANY_SEARCH_LIMIT),
});
