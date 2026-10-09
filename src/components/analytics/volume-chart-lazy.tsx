"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { VolumeMonth } from "@/server/queries/analytics";

/**
 * Defers Recharts until after the page has painted (DESIGN.md §7, Phase 5
 * "lazy-load charts").
 *
 * **What this is worth, measured rather than assumed.** Recharts compiles to a
 * single 355 KB chunk — about 15% of the app's entire client JavaScript — and
 * the build manifest shows it is already referenced by exactly one route, so
 * Next's route-level splitting means nobody outside /analytics pays for it.
 * What was left was the analytics page itself: those 355 KB sat in the route's
 * initial chunks, so the four server-rendered bar lists and the stat strip
 * waited behind a chart library before anything appeared.
 *
 * `ssr: false` rather than a plain dynamic import. With SSR left on, the chunk
 * is still required for hydration and the deferral buys almost nothing; off, it
 * is fetched after the page is interactive and the rest of the page is not
 * blocked on it.
 *
 * **The cost of `ssr: false` is paid elsewhere, deliberately.** Two parts of
 * this card are documented as server-rendered — the hand-built legend, which
 * exists so it appears without waiting for the chart to mount, and the `sr-only`
 * table, which is what a reader gets in print, in forced-colours mode, or while
 * the island is still hydrating. Both would have been lost here. So they live in
 * `VolumeCard` instead, which is a Server Component: they now render with no
 * JavaScript at all, which is strictly better than what they had, and this
 * wrapper carries only the part that genuinely needs a browser.
 */
const VolumeChart = dynamic(
  () => import("./volume-chart").then((module) => ({ default: module.VolumeChart })),
  {
    ssr: false,
    /*
     * Exactly the chart's own height — `h-64 sm:h-72`, the same two classes —
     * so the card does not resize when the real chart arrives. A skeleton that
     * shifts the layout is worse than no skeleton: it moves the content the
     * reader has already started reading.
     */
    loading: () => <Skeleton className="h-64 w-full sm:h-72" />,
  },
);

export function VolumeChartLazy({ months }: { months: VolumeMonth[] }) {
  return <VolumeChart months={months} />;
}
