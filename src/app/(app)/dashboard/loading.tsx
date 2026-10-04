import { PageHeaderSkeleton, PanelSkeleton, StatTileSkeleton } from "@/components/shared/skeletons";
import { SkeletonRegion } from "@/components/ui/skeleton";

/**
 * Shown while the dashboard's counts are being read.
 *
 * `loading.tsx` is what makes the shell feel instant rather than fast: Next
 * wraps the page in a Suspense boundary and can prefetch this fallback, so a
 * click on "Dashboard" paints the sidebar, the topbar and this layout
 * immediately while the query runs (Next.js "Linking and Navigating" —
 * partial prefetching of dynamic routes).
 *
 * The shape mirrors `dashboard/page.tsx` exactly — same `gap-8` column, same
 * four-tile grid at the same breakpoint — because any difference shows up as a
 * jump at the moment the real content swaps in.
 */
export default function DashboardLoading() {
  return (
    <SkeletonRegion label="Loading dashboard" className="flex flex-col gap-8">
      <PageHeaderSkeleton />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>

      <PanelSkeleton />
    </SkeletonRegion>
  );
}
