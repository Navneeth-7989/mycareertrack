import { CalendarRange } from "lucide-react";

import { VolumeChartLazy } from "@/components/analytics/volume-chart-lazy";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analytics, VolumeMonth } from "@/server/queries/analytics";

/**
 * The server half of the volume chart: the card, the copy, the decision about
 * whether there is enough of a series to draw at all — and, since Phase 5,
 * everything around the chart that does not need a browser.
 *
 * It exists so the client island stays as small as possible. Recharts is 355 KB
 * and is now loaded only after the page is interactive (see `VolumeChartLazy`),
 * which means anything server-renderable has to live *here* or it would vanish
 * from the initial HTML. Two things moved in for exactly that reason: the
 * legend and the `sr-only` table.
 *
 * One month of data is a single bar, which is a number with axes drawn round
 * it, so the chart waits for two.
 */
export function VolumeCard({ analytics }: { analytics: Analytics }) {
  const { volume } = analytics;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Applications over time</CardTitle>
        <CardDescription>
          Grouped by the month you applied, so each month&rsquo;s replies sit with the applications
          that earned them — a reply arriving in April to a March application counts in March.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {volume.length < 2 ? (
          <EmptyState
            variant="plain"
            icon={CalendarRange}
            title="Not enough months yet"
            description="This chart needs applications submitted across at least two months before the shape of it means anything."
          />
        ) : (
          <>
            {/*
             * Hand-built rather than Recharts' own legend, and on the server
             * rather than in the island. It appears with the page instead of
             * waiting for a chart library to arrive, it inherits the product's
             * type scale, and the swatches are the only coloured marks — the
             * text beside them stays in ink tokens, so identity is never
             * carried by colour alone.
             */}
            <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <LegendKey className="bg-[var(--chart-1)]" label="Got a reply" />
              <LegendKey className="bg-border" label="No reply yet" />
            </ul>

            <VolumeChartLazy months={volume} />

            <VolumeTable months={volume} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <li className="text-muted-foreground flex items-center gap-2 text-xs">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${className}`} />
      {label}
    </li>
  );
}

/**
 * The table view the chart cannot be.
 *
 * Recharts emits SVG paths, so the series itself is unreadable to assistive
 * technology however well the hover layer describes one focused month. On the
 * server, so it is also what a reader gets in print, in forced-colours mode,
 * with JavaScript off, and in the window before the deferred chart has loaded —
 * which since Phase 5 is a window that always exists.
 */
function VolumeTable({ months }: { months: VolumeMonth[] }) {
  return (
    <table className="sr-only">
      <caption>Applications sent per month, and how many of them got a reply</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Sent</th>
          <th scope="col">Got a reply</th>
        </tr>
      </thead>
      <tbody>
        {months.map((month) => (
          <tr key={month.key}>
            <th scope="row">{month.fullLabel}</th>
            <td>{month.submitted}</td>
            <td>{month.replied}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
