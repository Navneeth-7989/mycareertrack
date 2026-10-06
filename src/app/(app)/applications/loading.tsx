import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while the list query runs — on a cold navigation to `/applications`,
 * and on any filter change, since each one is a fresh server render.
 *
 * The shape matches the real page closely enough that nothing jumps when the
 * rows arrive: same header block, same filter row height, same row rhythm.
 * A centred spinner would be less work and would reflow the entire page the
 * moment it was replaced.
 */
export default function ApplicationsLoading() {
  return (
    <SkeletonRegion label="Loading applications" className="flex flex-col gap-6">
      <PageHeaderSkeleton />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-56 flex-1" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-8 w-28" />
      </div>

      <Card className="overflow-hidden py-0">
        <div className="divide-border divide-y">
          {/* Six rows: enough to read as a list, not so many that the skeleton
              is taller than most real results. */}
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>

              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="hidden h-3 w-24 md:block" />
              <Skeleton className="hidden h-3 w-20 md:block" />
            </div>
          ))}
        </div>
      </Card>
    </SkeletonRegion>
  );
}
