import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Pagination for a server-rendered list.
 *
 * Links, not buttons. The page number lives in the URL (see
 * `ApplicationFilters`), so "next" is a navigation and gets an anchor —
 * middle-clickable, shareable, and it works before any JavaScript has run.
 * Buttons calling `router.push` would look identical and lose all three.
 *
 * `rel="prev"`/`rel="next"` are there for the same reason: they are what the
 * element means.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Builds the URL for a page, carrying the current filters with it. */
  hrefFor: (page: number) => string;
  className?: string;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // A single page of results needs no controls, and the count is already in the
  // header above the list.
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className={className} data-slot="pagination">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-muted-foreground text-[0.8125rem] tabular-nums">
          {first > total ? (
            // Reachable by editing the URL or by going back to a page that no
            // longer exists. §8 asks for correct numbers and a way out rather
            // than a crash or a silent redirect.
            <>Nothing on this page — {total.toLocaleString("en-IN")} in total</>
          ) : (
            <>
              Showing {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of{" "}
              {total.toLocaleString("en-IN")}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          {/*
           * A real disabled `Button` at the boundary, a `ButtonLink` otherwise.
           * There is no disabled anchor: `<a>` with a `disabled` attribute is
           * still focusable and still navigates, so the control would look dead
           * and work anyway. Swapping the element is what makes "you cannot go
           * back from page 1" true rather than merely styled.
           */}
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft aria-hidden="true" data-icon="inline-start" />
              Previous
            </Button>
          ) : (
            <ButtonLink variant="outline" size="sm" href={hrefFor(page - 1)} rel="prev">
              <ChevronLeft aria-hidden="true" data-icon="inline-start" />
              Previous
            </ButtonLink>
          )}

          <p className="text-muted-foreground px-1 text-[0.8125rem] tabular-nums">
            Page {page.toLocaleString("en-IN")} of {totalPages.toLocaleString("en-IN")}
          </p>

          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              Next
              <ChevronRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          ) : (
            <ButtonLink variant="outline" size="sm" href={hrefFor(page + 1)} rel="next">
              Next
              <ChevronRight aria-hidden="true" data-icon="inline-end" />
            </ButtonLink>
          )}
        </div>
      </div>
    </nav>
  );
}
