import type { Metadata } from "next";
import { Briefcase, Plus, SearchX } from "lucide-react";

import { ApplicationFilters } from "@/components/applications/application-filters";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  applicationFiltersSchema,
  applicationFiltersToQuery,
  hasActiveFilters,
} from "@/lib/validations/application-filters";
import { getApplicationFacets, listApplications } from "@/server/queries/applications";
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
 * TODO(step-4): the Kanban board and the board/table toggle, honouring
 * `User.defaultView`. The table is unconditional until the board exists —
 * sending a user to their saved board preference before there is a board to
 * send them to would be worse than ignoring it.
 */
export default async function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  const user = await requireUser();

  // `searchParams` arrives as a record of string | string[] | undefined, which
  // is exactly what the filter schema is written to accept — repeatable
  // parameters included. It cannot fail: see the header of
  // `validations/application-filters`.
  const filters = applicationFiltersSchema.parse(await searchParams);

  const [result, facets] = await Promise.all([
    listApplications(user.id, filters),
    getApplicationFacets(user.id),
  ]);

  const filtered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description={describe(facets.total, result.total, filtered)}
        actions={
          <ButtonLink size="lg" href="/applications/new">
            <Plus aria-hidden="true" data-icon="inline-start" />
            New application
          </ButtonLink>
        }
      />

      {/*
       * The filter bar is hidden only when the account is genuinely empty.
       * Filters over nothing are controls that cannot do anything, and the
       * empty state below says something more useful instead.
       */}
      {facets.total > 0 ? <ApplicationFilters filters={filters} facets={facets} /> : null}

      {result.items.length === 0 ? (
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

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
        hrefFor={(page) => pageHref(filters, page)}
      />
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
