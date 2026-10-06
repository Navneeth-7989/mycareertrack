import type { Metadata } from "next";
import { Briefcase, Plus, SearchX } from "lucide-react";

import { ApplicationFilters } from "@/components/applications/application-filters";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { KanbanBoard } from "@/components/applications/kanban-board";
import { ViewSwitch } from "@/components/applications/view-switch";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  applicationFiltersSchema,
  applicationFiltersToQuery,
  hasActiveFilters,
  type ApplicationView,
} from "@/lib/validations/application-filters";
import {
  getApplicationFacets,
  getBoardColumns,
  listApplications,
} from "@/server/queries/applications";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Applications · CareerTrack",
};

/**
 * `/applications` — the table view.
 *
 * A Server Component that reads its own URL and queries Postgres, per §4: no
 * client-side fetch, no spinner for the initial rows, and the filtering,
 * sorting and paging all happen in the database. The only client island is the
 * filter bar, which writes to the query string and lets this re-render.
 *
 * That is also why the filters are not component state. `?status=INTERVIEW&
 * sort=deadline` is a view someone can bookmark, share, or reach with the back
 * button, and none of that is possible if the filters only exist in a
 * `useState` somewhere.
 *
 * Two views over one query. `?view=` decides, and when it is absent the user's
 * own `defaultView` does — which is why the filter schema parses `view` as
 * nullable rather than defaulting it: a default invented in the schema would
 * mean the preference could never apply.
 */
export default async function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  const user = await requireUser();

  // `searchParams` arrives as a record of string | string[] | undefined, which
  // is exactly what the filter schema is written to accept — repeatable
  // parameters included. It cannot fail: see the header of
  // `validations/application-filters`.
  const filters = applicationFiltersSchema.parse(await searchParams);

  // The URL wins; the stored preference is the fallback. `ViewPreference` is
  // uppercase in Postgres and the URL parameter is lowercase, and this is the
  // only place the two meet.
  const view: ApplicationView = filters.view ?? (user.defaultView === "TABLE" ? "table" : "board");

  const [result, board, facets] = await Promise.all([
    // The table's query runs for both views, because its `total` is what the
    // heading counts and it is one indexed count plus at most one page.
    listApplications(user.id, filters),
    view === "board" ? getBoardColumns(user.id, filters) : null,
    getApplicationFacets(user.id),
  ]);

  const filtered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description={describe(facets.total, result.total, filtered)}
        actions={
          <>
            {facets.total > 0 ? <ViewSwitch filters={filters} current={view} /> : null}

            <ButtonLink size="lg" href="/applications/new">
              <Plus aria-hidden="true" data-icon="inline-start" />
              New application
            </ButtonLink>
          </>
        }
      />

      {/*
       * The filter bar is hidden only when the account is genuinely empty.
       * Filters over nothing are controls that cannot do anything, and the
       * empty state below says something more useful instead.
       */}
      {facets.total > 0 ? <ApplicationFilters filters={filters} facets={facets} /> : null}

      {/*
       * The board branches first, because its own empty columns *are* its empty
       * state — a board with nine labelled drop targets and no cards reads
       * correctly, where the table needs a sentence explaining itself. The one
       * case it cannot speak for is a brand-new account, which falls through to
       * the shared empty state below.
       */}
      {view === "board" && board && facets.total > 0 ? (
        <KanbanBoard columns={board} />
      ) : result.items.length === 0 ? (
        facets.total === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No applications yet"
            description="Log the first role you have saved or applied to. Everything else on this page — the board, the filters, the analytics — is built from these."
            action={
              <ButtonLink href="/applications/new">
                <Plus aria-hidden="true" data-icon="inline-start" />
                New application
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Nothing matches these filters"
            description={
              result.page > result.totalPages
                ? "This page is past the end of the results. The filters still apply — go back to the first page to see them."
                : "You have applications, just none that match what you are filtering by. Widen the filters or clear them."
            }
            action={
              <ButtonLink
                variant="outline"
                href={result.page > result.totalPages ? pageHref(filters, 1) : "/applications"}
              >
                {result.page > result.totalPages ? "Back to the first page" : "Clear all filters"}
              </ButtonLink>
            }
          />
        )
      ) : (
        <Card className="overflow-hidden py-0">
          <ApplicationsTable items={result.items} />
        </Card>
      )}

      {/* A board is not paged — it shows the whole pipeline, capped per column
          with a link into the table for the overflow. */}
      {view === "table" ? (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          hrefFor={(page) => pageHref(filters, page)}
        />
      ) : null}
    </div>
  );
}

function pageHref(filters: Parameters<typeof applicationFiltersToQuery>[0], page: number): string {
  const query = applicationFiltersToQuery(filters, { page });

  return query ? `/applications?${query}` : "/applications";
}

/**
 * The line under the heading. Three different situations, three different
 * sentences — "Showing 4 of 37" is information, while a fixed marketing line
 * above a filtered list is noise the user has to read past every time.
 */
function describe(total: number, matched: number, filtered: boolean): string {
  if (total === 0) {
    return "Every role you have applied to or saved, in one place.";
  }

  if (filtered) {
    return `${matched.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} ${
      total === 1 ? "application" : "applications"
    } match your filters.`;
  }

  return `${total.toLocaleString("en-IN")} ${total === 1 ? "application" : "applications"} tracked.`;
}
