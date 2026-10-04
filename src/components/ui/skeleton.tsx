import * as React from "react";
import { cn } from "cn";

/**
 * A loading placeholder.
 *
 * Two deliberate choices. The fill is `--muted` at 70% rather than a flat grey,
 * so a skeleton sitting on a white card and one sitting on the slate canvas both
 * read as "absent content" instead of one of them reading as a filled block.
 * And the pulse is slowed to 1.8s: Tailwind's default 2s-at-full-contrast
 * flicker is the single most common reason a loading state feels cheap.
 *
 * Skeletons must mirror the real layout's metrics — same heights, same widths,
 * same gaps — or the content visibly jumps when it arrives. That is why the
 * per-screen shapes live next to the screens that use them rather than being
 * generated from a `count` prop here.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("bg-muted/70 animate-pulse rounded-md [animation-duration:1.8s]", className)}
      {...props}
    />
  );
}

/**
 * The accessible wrapper for a skeleton screen. The individual bars are
 * `aria-hidden`, so without this a screen reader is told nothing at all while a
 * page loads; `aria-busy` plus a label is the one announcement worth making.
 */
function SkeletonRegion({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      data-slot="skeleton-region"
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(className)}
      {...props}
    />
  );
}

export { Skeleton, SkeletonRegion };
