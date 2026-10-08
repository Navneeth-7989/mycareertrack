import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * One row of a bar list: a label, a figure, and a horizontal bar under both.
 *
 * Three charts on this page are the same shape — the conversion stages, the
 * status mix and the reply-time distribution — and they are all a single
 * measure across named categories. That form does not need a charting library,
 * an axis or a tooltip: the category is written out, the value is written out,
 * and the bar exists only to make the comparison between rows pre-attentive. It
 * renders on the server with no JavaScript, which is why the one client island
 * on the page is the chart that genuinely needs interaction.
 *
 * **One hue, never a palette.** Colour here would be encoding rank, and rank is
 * already encoded by position and by the bar itself — so a second encoding
 * would only add the suggestion that the categories are different *kinds* of
 * thing. The `muted` tone exists for rows that are context rather than the
 * measure being read.
 *
 * The 2px surface gap between the fill and the track's end, plus the 4px data
 * end, are the mark spec: the fill is a solid shape with a rounded leading
 * edge, not a progress bar.
 */
export function MetricBar({
  label,
  hint,
  value,
  share,
  tone = "primary",
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** The figure, already formatted — this component never divides. */
  value: ReactNode;
  /** 0–1. Clamped, so a bad input cannot overflow the track. */
  share: number;
  tone?: "primary" | "muted";
}) {
  const width = Math.min(100, Math.max(0, share * 100));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-medium">{label}</span>

        <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
      </div>

      {/*
       * `aria-hidden` on the track: the label and the figure above it already
       * say everything the bar says, so announcing a third, unitless element
       * would only add noise to a screen reader.
       */}
      <div aria-hidden="true" className="bg-muted h-2 w-full overflow-hidden rounded-sm">
        <div
          className={cn(
            "h-full rounded-sm transition-[width] duration-500",
            tone === "primary" ? "bg-primary" : "bg-muted-foreground/35",
          )}
          /*
           * A floor of 2px rather than 0 for a non-zero value. A count of one
           * out of two hundred rounds to a bar nobody can see, and an invisible
           * bar beside the figure "1" reads as a rendering fault.
           */
          style={{ width: share > 0 ? `max(2px, ${width}%)` : 0 }}
        />
      </div>

      {hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
    </div>
  );
}
