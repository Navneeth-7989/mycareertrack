import { Card, CardContent } from "@/components/ui/card";
import type { Analytics } from "@/server/queries/analytics";

/**
 * The three volume figures from §3 — total, submitted, active — as one strip
 * rather than three tiles.
 *
 * They are deliberately not given the same weight as the rates below them.
 * §3 is explicit that *"total applications still counts everything; that's a
 * volume figure, not a performance one"*, and a page whose first row is four
 * big counts is a page about how busy the user has been. These are the context
 * the rates are read against — the denominator, written down — so they get one
 * line, and the rates get the tiles.
 *
 * The split between tracked and submitted is the point of the strip: it is the
 * only place the page shows how many saved roles are sitting unsent, which is
 * the one number on the screen that is directly actionable.
 */
export function OverviewStrip({ analytics }: { analytics: Analytics }) {
  const saved = analytics.total - analytics.submitted;

  const figures = [
    {
      label: "Tracked",
      value: analytics.total,
      hint: saved === 0 ? "All of them sent" : `${saved} saved, not sent yet`,
    },
    {
      label: "Submitted",
      value: analytics.submitted,
      hint: "What every rate is measured against",
    },
    {
      label: "Still active",
      value: analytics.active,
      hint: "Not rejected, withdrawn or closed",
    },
  ];

  return (
    <Card size="sm" className="gap-0">
      <CardContent>
        {/*
         * Plain divs rather than a `<dl>`, unlike `StatTile`. A `div` inside a
         * definition list may only wrap `dt`/`dd` pairs, and each figure here
         * carries a third element — the hint — so the list markup would be
         * invalid for the sake of a relationship the layout already makes
         * obvious.
         */}
        <div className="divide-border grid gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x">
          {figures.map((figure, index) => (
            <div
              key={figure.label}
              className={
                index === 0 ? "sm:pr-6" : index === figures.length - 1 ? "sm:pl-6" : "sm:px-6"
              }
            >
              <p className="flex items-baseline gap-2">
                <span className="font-heading text-2xl leading-none font-semibold tabular-nums">
                  {figure.value}
                </span>
                <span className="text-sm font-medium">{figure.label}</span>
              </p>

              <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{figure.hint}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
