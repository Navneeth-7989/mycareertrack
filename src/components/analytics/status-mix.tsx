import { StatusBadge } from "@/components/applications/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analytics } from "@/server/queries/analytics";

/**
 * Where everything stands right now, by status.
 *
 * **Shares of total, not of submitted** — this is the volume view, so saved
 * roles belong in it. Which also means no minimum-sample gate: "3 of your 5 are
 * at Applied" is a count comparison, not a performance claim, and withholding
 * it would be withholding the user's own list back from them.
 *
 * The row is laid out here rather than through `MetricBar` because the label is
 * a `StatusBadge`, not text: the pill is the app's established encoding for a
 * status, identical on the board, the table and the detail page, and inventing
 * a second one on this page would be the two disagreeing.
 *
 * **The bar itself stays one hue.** Nine statuses is past what any categorical
 * palette can separate, and the pill beside it already carries the identity — so
 * the bar encodes magnitude only, and the colour on the row is the pill's.
 */
export function StatusMix({ analytics }: { analytics: Analytics }) {
  const { statusMix, total } = analytics;

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Pipeline right now</CardTitle>
        <CardDescription>
          Every application you are tracking, by where it currently sits — saved roles included.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-col gap-3.5">
          {statusMix.map((slice) => (
            <li key={slice.status} className="flex items-center gap-3">
              <span className="w-28 shrink-0">
                <StatusBadge status={slice.status} />
              </span>

              <span
                aria-hidden="true"
                className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-sm"
              >
                <span
                  className="bg-primary/70 block h-full rounded-sm"
                  style={{ width: `max(2px, ${slice.share * 100}%)` }}
                />
              </span>

              <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                {slice.count}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
          {total} application{total === 1 ? "" : "s"} across {statusMix.length} stage
          {statusMix.length === 1 ? "" : "s"}.
        </p>
      </CardContent>
    </Card>
  );
}
