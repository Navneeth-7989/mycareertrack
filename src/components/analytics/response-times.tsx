import { Clock } from "lucide-react";

import { MetricBar } from "@/components/analytics/metric-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatResponseDays } from "@/lib/utils/metrics";
import type { Analytics } from "@/server/queries/analytics";

/**
 * How long companies actually take to reply.
 *
 * **Bars are scaled to the busiest bucket, not to the sample.** The question
 * this chart answers is "which wait is typical", which is a comparison between
 * buckets — scaling to the total would leave every bar short and the shape of
 * the distribution unreadable on a thin sample. No percentage is printed, so
 * there is no rate to gate: these are counts of real replies.
 *
 * The median leads and the mean follows it. One company sitting on an
 * application for four months pulls a mean of six days up to twenty, and the
 * median is the figure that answers "what should I expect next time" — so the
 * mean is shown beside it rather than instead of it, because the gap between
 * the two is itself the finding.
 */
export function ResponseTimes({ analytics }: { analytics: Analytics }) {
  const { responseTimes, responseTimeSample, avgResponseDays, medianResponseDays } = analytics;

  const busiest = Math.max(...responseTimes.map((bucket) => bucket.count), 1);

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Time to first reply</CardTitle>
        <CardDescription>
          Measured from the day you applied to the day you first heard anything back.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {responseTimeSample === 0 ? (
          <EmptyState
            variant="plain"
            icon={Clock}
            title="No replies logged yet"
            description="This fills in once an application gets a response — either by moving its status past Applied, or by adding an “Email received” entry to its timeline."
          />
        ) : (
          <>
            <div className="border-border mb-5 flex items-baseline gap-6 border-b pb-5">
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
                  Median
                </p>
                <p className="font-heading mt-1.5 text-2xl leading-none font-semibold tabular-nums">
                  {formatResponseDays(medianResponseDays)}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
                  Average
                </p>
                <p className="text-muted-foreground mt-1.5 text-2xl leading-none font-semibold tabular-nums">
                  {formatResponseDays(avgResponseDays)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {responseTimes.map((bucket) => (
                <MetricBar
                  key={bucket.label}
                  label={bucket.label}
                  value={bucket.count}
                  share={bucket.count / busiest}
                  tone={bucket.count === 0 ? "muted" : "primary"}
                />
              ))}
            </div>

            <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
              From {responseTimeSample} application{responseTimeSample === 1 ? "" : "s"} that got a
              reply. Applications still waiting are not counted — they have no reply time yet, and
              treating silence as a long wait would flatter the figures every time one finally
              lands.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
