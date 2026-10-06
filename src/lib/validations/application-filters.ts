import { z } from "zod";

import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  PRIORITIES,
} from "@/lib/constants/application";
import { WORK_MODES } from "@/lib/constants/work-mode";
import { isDateOnlyString, parseDateOnly } from "@/lib/utils/date-only";

/**
 * The query parameters for `GET /api/applications` and for the list page
 * itself, which reads the very same shape out of its own URL (DESIGN.md §6).
 *
 * **This schema cannot fail.** Every field falls back rather than rejecting,
 * which is a deliberate departure from the rest of `validations/` — and the
 * reason is what the input is. A filter is a request to *look* at data, not to
 * write any, and these parameters arrive from places a form's never do: a
 * bookmarked URL from before a status was renamed, a link someone edited by
 * hand, a stale page in a back-button history. Rejecting one of those with a
 * 400 replaces a page of applications with an error screen over a parameter
 * nobody typed.
 *
 * So unknown enum values are dropped, out-of-range pages are clamped, and a
 * malformed date is treated as absent. What the user asked for that we
 * understood is applied; the rest is ignored. The filter bar renders from the
 * parsed result, so whatever survived is what the UI shows as active — the
 * screen and the query can never disagree about what is being filtered.
 */

/**
 * The two presentations of the same filtered list.
 *
 * Lowercase in the URL and uppercase in the database (`ViewPreference`), which
 * is not an oversight: `?view=board` is a thing a person reads and types, while
 * the enum is Postgres's. The page maps between them in one place.
 */
export const APPLICATION_VIEWS = ["board", "table"] as const;

export type ApplicationView = (typeof APPLICATION_VIEWS)[number];

export const APPLICATION_SORTS = ["newest", "oldest", "updated", "deadline", "company"] as const;

export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export const APPLICATION_SORT_LABELS: Record<ApplicationSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
  deadline: "Deadline soonest",
  company: "Company A–Z",
};

export const DEFAULT_SORT: ApplicationSort = "newest";

/** §9: 20 by default, 100 at most, capped server-side. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const SEARCH_MAX = 120;

/**
 * Caps how many values one repeatable filter may carry, bounding the `IN`
 * clause it becomes. Comfortably above any real selection — there are only nine
 * statuses — and low enough that a crafted URL with 10,000 company ids cannot
 * turn one page view into a query the database has to think about.
 */
const MAX_LIST_VALUES = 50;

/**
 * The input side of every field below: anything at all, including absent.
 *
 * `.optional()` is load-bearing, not decoration. Zod 4 treats a missing key as
 * an error even for `z.unknown()` — "expected nonoptional, received undefined"
 * — so without it a URL that simply omits a parameter, which is to say almost
 * every URL, throws. That would make a schema whose entire design is "never
 * fail" fail on the most ordinary input there is.
 */
function anyParam() {
  return z.unknown().optional();
}

/** A repeated parameter arrives as a string, an array, or not at all. */
function toStringArray(raw: unknown): string[] {
  if (typeof raw === "string") {
    return [raw];
  }

  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }

  return [];
}

/**
 * A repeatable enum filter.
 *
 * `anyParam()` as the input is what makes it total. The result is sorted into
 * the canonical order of `values`, which also de-duplicates: `?status=OFFER&
 * status=SAVED` and `?status=SAVED&status=OFFER` are the same request and must
 * produce byte-identical queries, or two users with the same filters get
 * different cache entries and different `IN` clauses for no reason.
 */
function enumList<T extends string>(values: readonly T[]) {
  return anyParam().transform((raw): T[] => {
    const chosen = new Set(toStringArray(raw));

    return values.filter((value) => chosen.has(value)).slice(0, MAX_LIST_VALUES);
  });
}

/**
 * A repeatable free-text filter — company ids and location names, whose values
 * come from the user's own data rather than from an enum.
 *
 * De-duplicated and sorted so the same selection always produces the same
 * query, for the reason above. Sorting by codepoint rather than locale is
 * deliberate: this ordering is a canonical form, not something a user reads.
 */
function textList() {
  return anyParam().transform((raw): string[] => {
    const cleaned = toStringArray(raw)
      .map((value) => value.trim())
      .filter((value) => value !== "" && value.length <= SEARCH_MAX);

    return [...new Set(cleaned)].sort().slice(0, MAX_LIST_VALUES);
  });
}

/** A date-only bound. Anything unparseable is simply no bound. */
function dateBound() {
  return anyParam().transform((raw): Date | null => {
    if (typeof raw !== "string" || !isDateOnlyString(raw.trim())) {
      return null;
    }

    return parseDateOnly(raw.trim());
  });
}

function clampedInt(fallback: number, min: number, max: number) {
  return anyParam().transform((raw): number => {
    const parsed = Number(typeof raw === "string" ? raw.trim() : raw);

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(parsed, min), max);
  });
}

export const applicationFiltersSchema = z.object({
  q: anyParam().transform((raw) =>
    typeof raw === "string" ? raw.trim().slice(0, SEARCH_MAX) : "",
  ),

  status: enumList(APPLICATION_STATUSES),
  workMode: enumList(WORK_MODES),
  employmentType: enumList(EMPLOYMENT_TYPES),
  priority: enumList(PRIORITIES),
  source: enumList(APPLICATION_SOURCES),

  /** Company ids, not names — the filter chips come from the user's own facets. */
  company: textList(),
  location: textList(),

  appliedFrom: dateBound(),
  appliedTo: dateBound(),

  /**
   * Null when the URL does not say, which is not the same as a default. The
   * page resolves it from `User.defaultView` — a preference the schema has no
   * business knowing about, and which must not be overwritten by a default
   * invented here.
   */
  view: anyParam().transform((raw): ApplicationView | null =>
    typeof raw === "string" && (APPLICATION_VIEWS as readonly string[]).includes(raw)
      ? (raw as ApplicationView)
      : null,
  ),

  sort: anyParam().transform((raw): ApplicationSort =>
    typeof raw === "string" && (APPLICATION_SORTS as readonly string[]).includes(raw)
      ? (raw as ApplicationSort)
      : DEFAULT_SORT,
  ),

  // Not clamped to the last page: §8 asks for an empty list with correct meta
  // and a way back, rather than a silent redirect to a page the user did not
  // request. 10,000 is a ceiling against `?page=1e9`, which would otherwise
  // become an OFFSET Postgres has to count past.
  page: clampedInt(1, 1, 10_000),
  pageSize: clampedInt(DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
});

export type ApplicationFilters = z.output<typeof applicationFiltersSchema>;

/** The filters as they are with nothing applied, for comparisons and resets. */
export const EMPTY_APPLICATION_FILTERS: ApplicationFilters = applicationFiltersSchema.parse({});

/**
 * Which filters are narrowing the list, ignoring sort, pagination and the view
 * — none of which hides a row, so none belongs in a "3 filters active" count or
 * is cleared by "Clear all".
 */
export function activeFilterCount(filters: ApplicationFilters): number {
  return (
    (filters.q ? 1 : 0) +
    filters.status.length +
    filters.workMode.length +
    filters.employmentType.length +
    filters.priority.length +
    filters.source.length +
    filters.company.length +
    filters.location.length +
    (filters.appliedFrom ? 1 : 0) +
    (filters.appliedTo ? 1 : 0)
  );
}

export function hasActiveFilters(filters: ApplicationFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/**
 * Serialises filters back to a query string, omitting anything at its default.
 *
 * This is what keeps a shared link honest: `/applications` and
 * `/applications?page=1&sort=newest&q=` describe the same view, and only the
 * first is worth putting in someone's address bar. Pagination links are built
 * from this, so they carry the current filters forward without having to
 * enumerate them at the call site.
 */
export function applicationFiltersToQuery(
  filters: ApplicationFilters,
  overrides: Partial<Pick<ApplicationFilters, "page">> = {},
): string {
  const params = new URLSearchParams();
  const page = overrides.page ?? filters.page;

  if (filters.q) {
    params.set("q", filters.q);
  }

  for (const [key, values] of [
    ["status", filters.status],
    ["company", filters.company],
    ["location", filters.location],
    ["workMode", filters.workMode],
    ["employmentType", filters.employmentType],
    ["priority", filters.priority],
    ["source", filters.source],
  ] as const) {
    for (const value of values) {
      params.append(key, value);
    }
  }

  if (filters.appliedFrom) {
    params.set("appliedFrom", toParam(filters.appliedFrom));
  }

  if (filters.appliedTo) {
    params.set("appliedTo", toParam(filters.appliedTo));
  }

  // Carried verbatim, including its absence. Adding `view=board` to a link that
  // did not have it would pin a view the user never chose, and then their
  // saved preference could never apply again.
  if (filters.view) {
    params.set("view", filters.view);
  }

  if (filters.sort !== DEFAULT_SORT) {
    params.set("sort", filters.sort);
  }

  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(filters.pageSize));
  }

  if (page !== 1) {
    params.set("page", String(page));
  }

  return params.toString();
}

/** Back to the "2026-03-14" form the bound was read from. */
function toParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}
