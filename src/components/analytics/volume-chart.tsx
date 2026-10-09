"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatPercent } from "@/lib/utils/metrics";
import type { VolumeMonth } from "@/server/queries/analytics";

/**
 * Applications sent per month, split by whether each one got a reply.
 *
 * **The one client island on this page.** Twelve months × two segments is
 * twenty-four values, which is past what direct labels can carry — so this
 * chart earns a hover layer, and that is the whole reason it is not server
 * rendered like the other four. Everything else on the page is a bar list with
 * its figures written out, and needs no JavaScript at all.
 *
 * **Nothing in here renders on the server, and nothing in here may need to.**
 * It is loaded through `VolumeChartLazy` with `ssr: false`, which keeps 355 KB
 * of Recharts out of the route's initial chunks — so the card, the legend and
 * the `sr-only` series table all live in `VolumeCard` instead. Anything added
 * below that a reader would need without JavaScript belongs there, not here.
 *
 * **Stacked, not grouped.** "Replied" is a subset of "sent", so the segments
 * genuinely sum to the bar — grouping them would invite the reader to add two
 * numbers that already overlap. The stack also puts the answer where the eye
 * starts: the blue sits on the axis, so its height *is* the month's replies and
 * the pale block above it is the silence.
 *
 * **One accent and one neutral, deliberately not two hues.** A colour pair
 * would need to survive a colour-vision check at every adjacency; an accent
 * against a slate that is already the page's border token cannot be confused by
 * anybody, and it encodes the thing that matters — replies are the signal,
 * silence is the ground.
 *
 * **It is a cohort view, not a timeline of events.** Both segments are bucketed
 * by the month the application was *sent*, so a reply that arrived in April to
 * a March application counts in March. That is what makes the two comparable:
 * bucketing replies by their own arrival date would produce a chart where the
 * reply bar can exceed the send bar and neither column means anything.
 */
export function VolumeChart({ months }: { months: VolumeMonth[] }) {
  const byKey = new Map(months.map((month) => [month.key, month]));

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={months}
          margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
          barCategoryGap="28%"
          /* Recharts' keyboard and screen-reader layer: arrow keys walk the
           * months and announce each one. `VolumeCard`'s `sr-only` table is
           * still rendered, because this layer describes a focused point
           * rather than the whole series. */
          accessibilityLayer
        >
          {/* Horizontal rules only, in the border token. A vertical grid on a
           * categorical axis fences each month off from the next, which is
           * the opposite of what a volume chart is for. */}
          <CartesianGrid vertical={false} stroke="var(--border)" />

          <XAxis
            dataKey="key"
            tickFormatter={(key: string) => byKey.get(key)?.label ?? key}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />

          <YAxis
            // Counts of applications — a tick at 2.5 would be an application
            // that does not exist.
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />

          <Tooltip
            // Recharts' default is a grey box with a drop shadow; this hands
            // the hover state back to the product's own popover surface.
            cursor={{ fill: "var(--muted)", radius: 4 }}
            content={({ active, label }) => {
              if (!active) return null;

              const month = byKey.get(String(label));
              if (!month) return null;

              return <VolumeTooltip month={month} />;
            }}
          />

          {/* Order matters: the first `Bar` in a stack sits on the axis. */}
          <Bar dataKey="replied" stackId="sent" fill="var(--chart-1)" />

          <Bar
            dataKey="silent"
            stackId="sent"
            fill="var(--border)"
            radius={[4, 4, 0, 0]}
            /* A 2px stroke in the card colour is the surface gap between the
             * two segments — on a white card it is invisible everywhere
             * except the one edge where the two fills meet, which is exactly
             * where a gap belongs. */
            stroke="var(--card)"
            strokeWidth={2}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolumeTooltip({ month }: { month: VolumeMonth }) {
  return (
    <div className="bg-popover text-popover-foreground border-border rounded-lg border px-3 py-2.5 text-xs shadow-md">
      <p className="font-heading text-sm font-semibold">{month.fullLabel}</p>

      {month.submitted === 0 ? (
        <p className="text-muted-foreground mt-1.5">Nothing sent this month</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt className="text-muted-foreground">Sent</dt>
          <dd className="text-right font-medium">{month.submitted}</dd>

          <dt className="text-muted-foreground">Got a reply</dt>
          <dd className="text-right font-medium">
            {month.replied}
            {/* The rate is shown without a minimum-sample gate because its
             * denominator is named right above it — "1 (100%)" beside "Sent 1"
             * cannot mislead the way a page-level headline rate can. */}
            <span className="text-muted-foreground">
              {" "}
              ({formatPercent(month.replied / month.submitted)})
            </span>
          </dd>
        </dl>
      )}
    </div>
  );
}
