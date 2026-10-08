import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while the session resolves.
 *
 * Briefer than most of the app's loading states, and deliberately so: the page
 * reads no table of its own — every value is already on `CurrentUser` — so this
 * only ever covers the session lookup. The shape still matches, because a
 * skeleton whose proportions are wrong is worse than none at all.
 */
export default function SettingsLoading() {
  return (
    <SkeletonRegion label="Loading settings" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <div className="flex max-w-2xl flex-col gap-4">
        <CardSkeleton rows={4} tall />
        <CardSkeleton rows={2} />
        <Skeleton className="h-10 w-36" />
      </div>
    </SkeletonRegion>
  );
}

function CardSkeleton({ rows, tall = false }: { rows: number; tall?: boolean }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full max-w-md" />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={tall ? "h-16 w-full rounded-lg" : "h-10 w-full"} />
        ))}
      </CardContent>
    </Card>
  );
}
