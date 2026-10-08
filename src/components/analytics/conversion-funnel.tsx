import { MetricBar } from "@/components/analytics/metric-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/utils/metrics";
import type { Analytics } from "@/server/queries/analytics";

/**
 * Submitted → heard back → interviewed → offer.
 *
 * **Every bar is a share of submitted, not of the bar above it** — the
 * denominator §3 defines for all four rates. `buildFunnel` carries the full
 * reasoning; the short version is that stage-on-stage division would need a
 * second set of rates, and the stages do not strictly nest (an interview can be
 * scheduled on an application still sitting at Applied), so a nesting funnel
 * would have to clamp away a number the data really contains.
 *
 * Below the minimum sample the bars come off entirely and the stages are listed
 * as counts. That is §8's rule — *"rates hidden below a minimum sample"* —
 * applied to the bars as well as the numbers, because a bar drawn at
 * two-thirds of the track is a 67% claim whether or not the percentage is
 * printed next to it.
 */
export function ConversionFunnel({ analytics }: { analytics: Analytics }) {
  const { funnel, submitted, enoughForRates, minSubmittedForRates } = analytics;

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Conversion</CardTitle>
        <CardDescription>
          How far your submitted applications get. Each stage is measured against all {submitted}{" "}
          you sent, not against the stage above it.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {enoughForRates ? (
          <div className="flex flex-col gap-5">
            {funnel.map((stage) => (
              <MetricBar
                key={stage.key}
                label={stage.label}
                value={formatPercent(stage.share)}
                share={stage.share ?? 0}
                hint={`${stage.count} of ${submitted} · ${stage.hint.toLowerCase()}`}
                tone={stage.key === "submitted" ? "muted" : "primary"}
              />
            ))}
          </div>
        ) : (
          <>
            {/*
             * The counts are still worth showing — they are facts, and a user
             * with three applications wants to see their three. It is only the
             * division that is withheld.
             */}
            <dl className="divide-border divide-y">
              {funnel.map((stage) => (
                <div key={stage.key} className="flex items-baseline justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <dt className="text-sm font-medium">{stage.label}</dt>
                    <dd className="text-muted-foreground mt-0.5 text-xs">{stage.hint}</dd>
                  </div>

                  <span className="font-heading shrink-0 text-lg font-semibold tabular-nums">
                    {stage.count}
                  </span>
                </div>
              ))}
            </dl>

            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              Percentages appear at {minSubmittedForRates} submitted applications. Below that a
              single rejection moves the rate by twenty points, which is a number worth more as a
              blank than as a figure.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
