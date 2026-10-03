import { z } from "zod";

import { WORK_MODES } from "@/lib/constants/work-mode";
import { FALLBACK_TIMEZONE, isValidTimeZone } from "@/lib/utils/timezone";

/**
 * Onboarding and profile validation, shared by the wizard and the API
 * (DESIGN.md §4, rule 4).
 *
 * Required: name, university, degree, graduation year, LinkedIn (§9). The
 * columns are nullable in the database on purpose — an OAuth sign-in creates
 * the `User` row before any of this is collected — so this schema is the only
 * thing enforcing the requirement.
 */

const MIN_GRADUATION_YEAR = 1950;

/** Enough headroom for a first-year undergraduate planning ahead. */
const GRADUATION_YEAR_LOOKAHEAD = 10;

const MAX_TAGS = 25;
const MAX_TAG_LENGTH = 60;

function maxGraduationYear(): number {
  return new Date().getFullYear() + GRADUATION_YEAR_LOOKAHEAD;
}

function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .max(max, { error: `${label} must be at most ${max} characters` });
}

/**
 * Optional free text, stored as null when blank.
 *
 * Same reasoning as `optionalUrl` below: a nullable column holding empty
 * strings means every read has to treat "" and null as the same thing, and
 * eventually one of them forgets.
 */
function optionalText(label: string, max: number) {
  return (
    z
      .string()
      .trim()
      .max(max, { error: `${label} must be at most ${max} characters` })
      // Absent and blank mean the same thing — nothing was answered. Accepting
      // both keeps a client that simply omits the key from getting a 400 over a
      // field that was never required in the first place.
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value))
  );
}

/**
 * Nobody types the scheme. "linkedin.com/in/navneet" is what comes out of a
 * copy-paste from the address bar, and rejecting it over a missing "https://"
 * is the kind of validation that makes a form feel hostile — so it is added
 * rather than demanded.
 */
function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  // Matches any scheme, not just one followed by "//". That distinction
  // matters: "mailto:me@example.com" has no "//", so a "://" test would treat
  // it as scheme-less and prepend https — and "https://mailto:me@example.com"
  // is a *valid* URL, pointing at example.com with "mailto:me" as credentials.
  // The input would be silently rewritten into a different, working link
  // instead of being rejected.
  //
  // Dots are excluded from the scheme pattern so "example.com:8080/x" reads as
  // a host and port rather than as a scheme. Real schemes may contain dots per
  // RFC 3986, but none in use do, whereas host:port is typed by actual people.
  return /^[a-z][a-z0-9+-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * http and https only (DESIGN.md §8) — this value ends up in an `href`, and
 * "javascript:alert(1)" must never get there.
 *
 * Embedded credentials are refused as well. "https://linkedin.com@evil.example"
 * is a valid URL whose host is evil.example, and it is the oldest trick for
 * making a link look like it goes somewhere it doesn't. No genuine profile URL
 * has a userinfo component.
 *
 * The dot check rejects "https://localhost" style input, which is never a real
 * portfolio.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

const URL_ERROR = "Enter a valid link, for example linkedin.com/in/your-name";

function requiredUrl(label: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label} is required` })
    .transform(normalizeUrl)
    .refine(isHttpUrl, { error: URL_ERROR });
}

/**
 * An empty optional URL becomes null, not "". A nullable column with empty
 * strings in it means every read has to treat "" and null as the same thing,
 * and eventually one of them forgets.
 */
function optionalUrl() {
  return z
    .string()
    .transform(normalizeUrl)
    .refine((value) => value === "" || isHttpUrl(value), { error: URL_ERROR })
    .transform((value) => (value === "" ? null : value));
}

/**
 * A four-digit string on the wire, an Int in the database.
 *
 * The wire format is a string because that is what an `<input>` holds, and the
 * alternative — coercing on the way in — makes the form's value type `unknown`
 * and the "required" case indistinguishable from a typo.
 */
const graduationYear = z
  .string()
  .trim()
  .min(1, { error: "Graduation year is required" })
  .regex(/^\d{4}$/, { error: "Enter a four-digit year, for example 2027" })
  .refine(
    (value) => {
      const year = Number(value);

      return year >= MIN_GRADUATION_YEAR && year <= maxGraduationYear();
    },
    { error: () => `Enter a year between ${MIN_GRADUATION_YEAR} and ${maxGraduationYear()}` },
  )
  .transform(Number);

/**
 * Free-text lists — target roles, skills, locations (DESIGN.md §3 explains why
 * these are Postgres arrays and not join tables).
 *
 * Blanks are dropped and near-duplicates collapsed case-insensitively, keeping
 * the casing the user typed first: "React" and "react" are one skill, and
 * storing both would show the same chip twice.
 */
function tagList(label: string) {
  return (
    z
      .array(z.string())
      .transform((items) => {
        const seen = new Set<string>();
        const result: string[] = [];

        for (const item of items) {
          const trimmed = item.trim();
          const key = trimmed.toLowerCase();

          if (trimmed && !seen.has(key)) {
            seen.add(key);
            result.push(trimmed);
          }
        }

        return result;
      })
      // Counted after de-duplication, because the limit is about what gets
      // stored — pasting "React, react" twice shouldn't eat two of the 25 slots.
      .refine((items) => items.length <= MAX_TAGS, {
        error: `Add at most ${MAX_TAGS} ${label}`,
      })
      .refine((items) => items.every((item) => item.length <= MAX_TAG_LENGTH), {
        error: `Each entry must be at most ${MAX_TAG_LENGTH} characters`,
      })
  );
}

/**
 * Work modes the user would accept — a list, because "remote or hybrid, but not
 * on-site" is the normal answer.
 *
 * An empty list is "no preference": there is no separate null, and no sentinel
 * option to submit, so the three states the single-value version had (a mode,
 * an explicit "no preference", or nothing) collapse into one honest one.
 *
 * The transform sorts the selection into `WORK_MODES` order rather than keeping
 * the order ticked, which also de-duplicates. Two users who want the same two
 * modes should have identical rows regardless of which box they clicked first —
 * otherwise anything grouping on this column later sees phantom variety.
 */
const preferredWorkModes = z
  .array(z.enum(WORK_MODES))
  .optional()
  .transform((values) => {
    const chosen = new Set(values ?? []);

    return WORK_MODES.filter((mode) => chosen.has(mode));
  });

/**
 * Never fails. See DESIGN.md §10.4 — detection is primary, the fallback is for
 * when it fails, and neither is worth blocking a form over.
 *
 * Optional on input because it has no field in the wizard: the browser's zone
 * is attached at submit, and a client that omits it gets the fallback rather
 * than a 400.
 */
const timezone = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";

    return isValidTimeZone(trimmed) ? trimmed : FALLBACK_TIMEZONE;
  });

/**
 * University, degree and field of study are offered as curated lists in the
 * wizard (see `lib/constants/`), but all three validate as free text here, on
 * purpose.
 *
 * No shippable list covers 40,000-plus Indian colleges, every qualification or
 * every specialisation, and a student holding something we failed to list has to
 * be able to finish signing up. The lists exist to make the common case one
 * click and to keep spellings consistent — not to reject the long tail.
 *
 * Field of study is the one that may be blank: it is meaningless for an MBBS or
 * an LL.B, and DESIGN.md §9's required set deliberately omits it.
 */
export const onboardingStepOneSchema = z.object({
  name: requiredText("Full name", 100),
  university: requiredText("University", 150),
  degree: requiredText("Degree", 150),
  fieldOfStudy: optionalText("Field of study", 120),
  graduationYear,
});

export const onboardingStepTwoSchema = z.object({
  linkedinUrl: requiredUrl("LinkedIn profile"),
  githubUrl: optionalUrl(),
  portfolioUrl: optionalUrl(),
});

export const onboardingStepThreeSchema = z.object({
  targetRoles: tagList("target roles"),
  skills: tagList("skills"),
  preferredLocations: tagList("locations"),
  preferredWorkModes,
});

/**
 * The whole payload. `timezone` is appended by the wizard from the browser and
 * has no field in the form, which is why it isn't in any step schema.
 */
export const onboardingSchema = z.object({
  ...onboardingStepOneSchema.shape,
  ...onboardingStepTwoSchema.shape,
  ...onboardingStepThreeSchema.shape,
  timezone,
});

/** What the form holds: every field a string or string[], as inputs produce. */
export type OnboardingFormValues = z.input<typeof onboardingSchema>;

/** What the mutation receives: year as a number, empty optionals as null. */
export type OnboardingPayload = z.output<typeof onboardingSchema>;

/**
 * Which fields each step owns, so the wizard can validate one step at a time.
 *
 * Spelled out rather than derived from `.shape` because `Object.keys` returns
 * `string[]`, and the whole value of this constant is that `satisfies` fails
 * the build if a field is renamed in a schema and not here.
 */
export const STEP_FIELDS = [
  ["name", "university", "degree", "fieldOfStudy", "graduationYear"],
  ["linkedinUrl", "githubUrl", "portfolioUrl"],
  ["targetRoles", "skills", "preferredLocations", "preferredWorkModes"],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof OnboardingFormValues>>;
