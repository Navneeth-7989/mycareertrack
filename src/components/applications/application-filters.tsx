"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { EnumSelect } from "@/components/form/enum-select";
import { FilterMenu, type FilterOption } from "@/components/form/filter-menu";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/constants/application";
import { WORK_MODES, WORK_MODE_LABELS } from "@/lib/constants/work-mode";
import { toDateInputValue } from "@/lib/utils/date-only";
import {
  APPLICATION_SORTS,
  APPLICATION_SORT_LABELS,
  activeFilterCount,
  applicationFiltersToQuery,
  type ApplicationFilters,
} from "@/lib/validations/application-filters";
import type { ApplicationFacets } from "@/server/queries/applications";

/**
 * The filter bar.
 *
 * **The URL is the state.** Every control writes to the query string and the
 * page re-renders on the server from it. Nothing here holds a copy of the
 * filters, which is what makes the back button, a refresh, a bookmark and a
 * link someone pastes into Slack all behave — and it is why the list can stay
 * a Server Component doing the work in Postgres (§4) instead of shipping every
 * row to the browser to filter locally.
 *
 * The search box is the one exception, and only for the moment between
 * keystrokes: it keeps its own value so typing is not waiting on a round trip,
 * then debounces into the URL.
 */

/** Long enough that a word is typed before a request goes out. */
const SEARCH_DEBOUNCE_MS = 350;

const SORT_OPTIONS = APPLICATION_SORTS.map((value) => ({
  value,
  label: APPLICATION_SORT_LABELS[value],
}));

function enumFilterOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
  counts?: Record<T, number>,
): FilterOption[] {
  return values.map((value) => ({
    value,
    label: labels[value],
    ...(counts ? { count: counts[value] } : {}),
  }));
}

export function ApplicationFilters({
  filters,
  facets,
}: {
  filters: ApplicationFilters;
  facets: ApplicationFacets;
}) {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * `isPending` is true while the server re-renders the list for a new URL.
   * Without it the whole bar looks inert for the length of a query — the user
   * ticks "Interview" and nothing visibly happens until the rows swap.
   */
  const [isPending, startTransition] = useTransition();

  /**
   * The search box's own value, so typing is not waiting on a round trip.
   *
   * `syncedQ` beside it is React's documented "adjust some state when a prop
   * changes" pattern — compare the previous value during render, not in an
   * effect. An effect calling `setSearch` was the first version of this and it
   * is a lint error for a good reason: it renders once with the stale text,
   * then again with the new, so the box visibly flickers through the old query
   * on a back-button navigation.
   *
   * It matters for three cases where the URL changes from somewhere other than
   * this input: the back button, "Clear all", and the moment the debounce below
   * commits. That last one is why there is no flicker in normal typing —
   * `filters.q` becomes the text already on screen, so `setSearch` is a no-op
   * and the caret stays where it was.
   */
  const [search, setSearch] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);

  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setSearch(filters.q);
  }

  /**
   * Whether the second row of filters is open. Starts open when one of them is
   * already applied, so a shared link does not hide the filters that produced
   * the view it is showing.
   */
  const [showAdvanced, setShowAdvanced] = useState(
    () =>
      filters.company.length > 0 ||
      filters.location.length > 0 ||
      filters.workMode.length > 0 ||
      filters.employmentType.length > 0 ||
      filters.priority.length > 0 ||
      filters.source.length > 0 ||
      filters.appliedFrom !== null ||
      filters.appliedTo !== null,
  );

  /**
   * Navigates to the filters as changed.
   *
   * Every change resets to page 1, because a filter that narrows the list from
   * 90 rows to 4 while the URL still says `page=3` lands the user on an empty
   * page and reads as "no results".
   */
  function apply(changes: Partial<ApplicationFilters>, options: { replace?: boolean } = {}) {
    const query = applicationFiltersToQuery({ ...filters, ...changes, page: 1 });
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      // `replace` for the search box: one history entry per keystroke would
      // make the back button walk the user letter-by-letter out of their query.
      // Everything else is a deliberate act and earns an entry.
      if (options.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    });
  }

  /**
   * The debounce lives in the change handler rather than in an effect.
   *
   * An effect watching the typed text was the obvious way to write this and the
   * wrong one: it re-arms its timer on every render, and this component
   * re-renders whenever `isPending` flips — so a slow query could reset the
   * countdown it was supposed to have started. Debouncing where the event
   * happens means one timer per keystroke and nothing else can disturb it.
   */
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearchChange(value: string) {
    setSearch(value);

    if (debounce.current !== null) {
      clearTimeout(debounce.current);
    }

    debounce.current = setTimeout(() => apply({ q: value }, { replace: true }), SEARCH_DEBOUNCE_MS);
  }

  // A pending keystroke must not navigate after the user has left the page.
  useEffect(
    () => () => {
      if (debounce.current !== null) {
        clearTimeout(debounce.current);
      }
    },
    [],
  );

  const activeCount = activeFilterCount(filters);

  function clearAll() {
    // The pending keystroke would otherwise fire after this and put the search
    // straight back.
    if (debounce.current !== null) {
      clearTimeout(debounce.current);
    }

    setSearch("");

    startTransition(() => {
      // Sort and page size survive a clear: neither hides a row, and resetting
      // someone's chosen ordering as a side effect of clearing filters is the
      // kind of helpfulness that feels like a bug.
      const query = applicationFiltersToQuery({
        ...filters,
        q: "",
        status: [],
        company: [],
        location: [],
        workMode: [],
        employmentType: [],
        priority: [],
        source: [],
        appliedFrom: null,
        appliedTo: null,
        page: 1,
      });

      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full min-w-56 flex-1 sm:w-auto">
          <InputGroupAddon align="inline-start">
            <Search aria-hidden="true" className="text-muted-foreground size-4" />
          </InputGroupAddon>

          <InputGroupInput
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search company, role, location or notes"
            aria-label="Search applications"
            autoComplete="off"
          />

          {search !== "" && (
            <InputGroupAddon align="inline-end">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
              >
                <X aria-hidden="true" />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>

        <FilterMenu
          label="Status"
          options={enumFilterOptions(
            APPLICATION_STATUSES,
            APPLICATION_STATUS_LABELS,
            facets.statusCounts,
          )}
          value={filters.status}
          onValueChange={(status) => apply({ status: status as ApplicationFilters["status"] })}
        />

        <div className="w-44">
          <EnumSelect
            id="sort"
            value={filters.sort}
            onValueChange={(sort) => apply({ sort: sort as ApplicationFilters["sort"] })}
            options={SORT_OPTIONS}
          />
        </div>

        <Button
          variant={showAdvanced ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
        >
          <SlidersHorizontal aria-hidden="true" data-icon="inline-start" />
          More filters
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
            <span className="text-muted-foreground">({activeCount})</span>
          </Button>
        )}

        {/*
         * The list is a Server Component sibling, so it cannot be dimmed from
         * here — and dimming the filters would be backwards, since they are not
         * what is loading. A word is the honest signal: without it, ticking a
         * status looks like nothing happened for as long as the query takes.
         *
         * `aria-live` so it is announced rather than only seen; `polite` so it
         * waits for a pause instead of interrupting someone mid-label.
         */}
        <p
          aria-live="polite"
          className="text-muted-foreground text-xs transition-opacity duration-150"
          style={{ opacity: isPending ? 1 : 0 }}
        >
          Updating…
        </p>
      </div>

      {showAdvanced && (
        <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu
              label="Company"
              options={facets.companies.map((company) => ({
                value: company.id,
                label: company.name,
                count: company.count,
              }))}
              value={filters.company}
              onValueChange={(company) => apply({ company })}
              emptyMessage="No companies yet."
            />

            <FilterMenu
              label="Location"
              options={facets.locations.map((location) => ({
                value: location.value,
                label: location.value,
                count: location.count,
              }))}
              value={filters.location}
              onValueChange={(location) => apply({ location })}
              emptyMessage="No locations recorded yet."
            />

            <FilterMenu
              label="Work mode"
              options={enumFilterOptions(WORK_MODES, WORK_MODE_LABELS)}
              value={filters.workMode}
              onValueChange={(workMode) =>
                apply({ workMode: workMode as ApplicationFilters["workMode"] })
              }
            />

            <FilterMenu
              label="Type"
              options={enumFilterOptions(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS)}
              value={filters.employmentType}
              onValueChange={(employmentType) =>
                apply({
                  employmentType: employmentType as ApplicationFilters["employmentType"],
                })
              }
            />

            <FilterMenu
              label="Priority"
              options={enumFilterOptions(PRIORITIES, PRIORITY_LABELS)}
              value={filters.priority}
              onValueChange={(priority) =>
                apply({ priority: priority as ApplicationFilters["priority"] })
              }
            />

            <FilterMenu
              label="Source"
              options={enumFilterOptions(APPLICATION_SOURCES, APPLICATION_SOURCE_LABELS)}
              value={filters.source}
              onValueChange={(source) => apply({ source: source as ApplicationFilters["source"] })}
            />
          </div>

          <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="appliedFrom">Applied from</FieldLabel>

              <Input
                id="appliedFrom"
                type="date"
                value={toDateInputValue(filters.appliedFrom)}
                max={toDateInputValue(filters.appliedTo) || undefined}
                onChange={(event) => apply({ appliedFrom: parseBound(event.target.value) })}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="appliedTo">Applied to</FieldLabel>

              <Input
                id="appliedTo"
                type="date"
                value={toDateInputValue(filters.appliedTo)}
                min={toDateInputValue(filters.appliedFrom) || undefined}
                onChange={(event) => apply({ appliedTo: parseBound(event.target.value) })}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A cleared date input gives "", which must become no bound rather than an
 * Invalid Date. The parsed value is only ever serialised straight back into the
 * URL, where the schema validates it properly.
 */
function parseBound(value: string): Date | null {
  return value === "" ? null : new Date(`${value}T00:00:00.000Z`);
}
