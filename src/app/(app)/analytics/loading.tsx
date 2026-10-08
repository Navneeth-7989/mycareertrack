import { PageHeaderSkeleton, StatTileSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while `getAnalytics` runs.
 *
 * The shape follows the real page exactly — strip, four rate tiles, two
 * half-width cards, the full-width chart, then the three/two split — because
 * this is the heaviest read in the app (three queries over every application a
 * user has) and it is the page most likely to be seen loading. A skeleton with
 * the wrong proportions on a page this tall produces a visible reflow all the
 * way down.
 */
export default function AnalyticsLoading() {
  return (
    <SkeletonRegion label="Loading analytics" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <Card size="sm" className="gap-0">
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-36 max-w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatTileSkeleton key={index} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarListSkeleton rows={4} />
        <BarListSkeleton rows={5} />
      </div>

      <ChartSkeleton />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BarListSkeleton rows={4} />
        </div>

        <div className="lg:col-span-2">
          <BarListSkeleton rows={5} />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Stands in for a card whose body is a label-figure-bar list. */
function BarListSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full max-w-sm" />
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-10" />
            </div>

            <Skeleton className="h-2 w-full rounded-sm" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * The volume chart's placeholder: a legend row and a block the exact height of
 * the plot area, so the one hydrating island on the page does not move the
 * cards below it when it mounts.
 */
function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full max-w-xl" />
      </CardHeader>

      <CardContent>
        <div className="mb-4 flex items-center gap-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>

        <Skeleton className="h-64 w-full sm:h-72" />
      </CardContent>
    </Card>
  );
}
