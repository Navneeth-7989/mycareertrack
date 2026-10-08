import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while `listResumes` runs.
 *
 * The shape matches the real page — header, card header, then rows carrying a
 * 40px file tile, two lines of text and a cluster of icon buttons — so nothing
 * reflows when the list arrives. Three rows rather than six: a user keeps a
 * handful of resume versions, not a page of them, and a skeleton taller than the
 * content it stands in for is its own kind of flicker.
 */
export default function ResumesLoading() {
  return (
    <SkeletonRegion label="Loading resumes" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <Card>
        <CardHeader className="border-b">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </CardHeader>

        <CardContent>
          <div className="divide-border divide-y">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                <Skeleton className="size-10 shrink-0 rounded-lg" />

                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: 4 }, (_, action) => (
                    <Skeleton key={action} className="size-8 rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </SkeletonRegion>
  );
}
