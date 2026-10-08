import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while generation and the inbox read run.
 *
 * Two cards rather than one, because the common case once a user has anything
 * scheduled is both sections present — and three rows each, since an inbox is
 * bounded by the dates in your own week rather than by a growing table. The
 * row shape mirrors `NotificationRow`: a dot gutter, a 36px icon tile, two
 * lines of text and a pill.
 */
export default function NotificationsLoading() {
  return (
    <SkeletonRegion label="Loading notifications" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-4">
        <InboxSectionSkeleton rows={3} />
        <InboxSectionSkeleton rows={2} />
      </div>
    </SkeletonRegion>
  );
}

function InboxSectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </CardHeader>

      <CardContent>
        <div className="divide-border divide-y">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <span className="mt-2 size-1.5 shrink-0" />

              <Skeleton className="mt-0.5 size-9 shrink-0 rounded-lg" />

              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>

              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
