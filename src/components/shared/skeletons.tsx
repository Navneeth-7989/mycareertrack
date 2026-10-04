import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The reusable skeleton shapes, kept beside each other so their metrics can be
 * checked against the real components in one place.
 *
 * Each one copies the exact heights and gaps of the component it stands in for
 * — `PageHeaderSkeleton` is 32px then 20px with the same 8px gap as
 * `PageHeader`'s heading and description. That is the whole job of a skeleton:
 * if the bars and the content they become are different sizes, the page jumps
 * at the moment it finishes loading, which is worse than no skeleton at all.
 *
 * Widths are fixed rather than full-bleed. A 100%-wide bar where a two-word
 * heading will land reads as a loading *banner*, and the eye has to re-learn
 * the layout when the real text arrives.
 */
export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-5 w-full max-w-sm" />
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <Card size="sm" className="gap-0">
      <CardContent>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-8 w-14" />
        <Skeleton className="mt-2.5 h-3 w-full max-w-[9rem]" />
      </CardContent>
    </Card>
  );
}

/** Stands in for a card whose body is a list or an empty state. */
export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />

        <div className="flex flex-col gap-3">
          {Array.from({ length: lines }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
