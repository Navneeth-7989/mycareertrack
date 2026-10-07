import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while the detail query runs.
 *
 * The shape follows the real page — breadcrumb, title, stats strip, then the
 * two-thirds / one-third split — so nothing jumps when the data lands. That is
 * the whole job of a skeleton; bars in the wrong places are worse than none,
 * because the layout has to be re-read at the exact moment the content appears.
 *
 * It matters more here than on the list. Arriving at this page means a
 * navigation from the table or the board, and without a `loading.tsx` the
 * router holds the old page on screen until the query resolves — so a click
 * would look like it did nothing for as long as a sleeping Neon database takes
 * to answer.
 */
export default function ApplicationDetailLoading() {
  return (
    <SkeletonRegion label="Loading application" className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-4 w-28" />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-5 w-52 max-w-full" />
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>

      <Card className="bg-border grid grid-cols-2 gap-px py-0 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-card flex flex-col gap-2 px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <Skeleton className="h-5 w-24" />
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/* Four entries: a real application has at least one event and
                rarely many, so this is the honest middle of the range. */}
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex gap-3.5">
                <Skeleton className="size-6 shrink-0 rounded-full" />

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-44 max-w-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <Skeleton className="h-5 w-20" />
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </SkeletonRegion>
  );
}
