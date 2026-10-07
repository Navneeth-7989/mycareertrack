import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while the edit query runs.
 *
 * `/applications/new` needs no equivalent — an empty form has nothing to fetch
 * and renders immediately. This one does: the fields cannot be drawn until the
 * stored values arrive, so without a skeleton the router would hold the detail
 * page on screen and the Edit button would look dead for as long as a sleeping
 * Neon database takes to answer.
 *
 * Four cards, in the real form's proportions — the role, where it stands,
 * compensation, the recruiter — so the page does not reflow when the inputs
 * replace the bars.
 */
export default function EditApplicationLoading() {
  return (
    <SkeletonRegion label="Loading application" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-6">
        {FORM_CARDS.map((rows, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-1.5 h-4 w-full max-w-md" />
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {rows.map((columns, row) => (
                <div key={row} className="grid gap-5 sm:grid-cols-2">
                  {Array.from({ length: columns }, (_, column) => (
                    <div key={column} className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-24" />
                      {/* 40px, the height of every control in the form. */}
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Fields per row, per card — mirroring the real form's grids. */
const FORM_CARDS = [
  [2, 1, 2],
  [2, 2],
  [2, 1],
  [2, 2],
];
