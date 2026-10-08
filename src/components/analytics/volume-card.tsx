import { CalendarRange } from "lucide-react";

import { VolumeChart } from "@/components/analytics/volume-chart";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analytics } from "@/server/queries/analytics";

/**
 * The server half of the volume chart: the card, the copy, and the decision
 * about whether there is enough of a series to draw at all.
 *
 * It exists so the client island stays as small as possible — the chart
 * component ships Recharts to the browser, and everything that can be settled
 * on the server is settled here. One month of data is a single bar, which is a
 * number with axes drawn round it, so the chart waits for two.
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
          <VolumeChart months={volume} />
        )}
      </CardContent>
    </Card>
  );
}
