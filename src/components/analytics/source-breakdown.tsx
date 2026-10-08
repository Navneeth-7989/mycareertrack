import { Lightbulb } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_SOURCE_LABELS } from "@/lib/constants/application";
import { ABSENT, formatMultiple, formatPercent } from "@/lib/utils/metrics";
import type { Analytics, SourceStats } from "@/server/queries/analytics";

/**
 * Which channels are actually working — the comparison §1 calls the
 * differentiator: *"referrals convert 8× better than LinkedIn applies for you"
 * is the feature that changes a user's behaviour.*
 *
 * **A table with bars in it, not a chart.** Four measures across up to seven
 * channels is a small multiple problem, and the honest form for it is the one
 * that shows all four numbers at once: four grouped-bar charts would make the
 * reader compare across charts, and one chart of the four measures would need
 * four hues to say what four column headings already say. The bar lives inside
 * the interview-rate column, where it is doing the one job a bar does well —
 * making a ranking pre-attentive — while the exact figures stay legible.
 *
 * **The numbers are never colour-coded.** Text wears text tokens here; the only
 * colour in the table is the bar.
 */
export function SourceBreakdown({ analytics }: { analytics: Analytics }) {
  const { sources, sourceInsight, minSubmittedPerSource } = analytics;

  // The widest bar is the best-converting channel, so the column reads as a
  // ranking. Scaling to 100% instead would leave every bar stubby for a user
  // whose best channel converts at 15%, which is a perfectly good rate.
  const bestRate = Math.max(...sources.map((entry) => entry.interviewRate ?? 0), 0.01);

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Where your applications come from</CardTitle>
        <CardDescription>
          Reply and interview rates per channel, each measured against what you sent through it.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sourceInsight ? (
          <p className="bg-accent text-accent-foreground mb-5 flex items-start gap-2.5 rounded-lg p-3.5 text-sm leading-relaxed">
            <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0" />

            <span>
              <strong className="font-semibold">{sourceLabel(sourceInsight.best)}</strong> gets you
              an interview{" "}
              {sourceInsight.multiple === null ? (
                <>
                  {formatPercent(sourceInsight.bestRate)} of the time, while{" "}
                  <strong className="font-semibold">{sourceLabel(sourceInsight.worst)}</strong> has
                  not produced one yet
                </>
              ) : (
                <>
                  <strong className="font-semibold">
                    {formatMultiple(sourceInsight.multiple)} more often
                  </strong>{" "}
                  than {sourceLabel(sourceInsight.worst)} — {formatPercent(sourceInsight.bestRate)}{" "}
                  against {formatPercent(sourceInsight.worstRate)}
                </>
              )}
              . Worth putting more of your time there.
            </span>
          </p>
        ) : null}

        {/*
         * Horizontal scroll on the table rather than on the page: four numeric
         * columns plus a channel name does not fit a phone, and a card that
         * forces the whole layout sideways is worse than one that scrolls
         * inside its own border.
         */}
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">
              Applications, reply rate, interview rate and offers by source
            </caption>

            <thead>
              <tr className="text-muted-foreground border-border border-b text-xs tracking-[0.04em] uppercase">
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Source
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sent
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Replied
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Interview rate
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Offers
                </th>
              </tr>
            </thead>

            <tbody className="divide-border divide-y">
              {sources.map((entry) => (
                <SourceRow
                  key={entry.source ?? "unspecified"}
                  entry={entry}
                  bestRate={bestRate}
                  minSubmitted={minSubmittedPerSource}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          Rates appear once a channel has {minSubmittedPerSource} submitted applications. The counts
          are always shown, so you can see how much each rate is standing on.
        </p>
      </CardContent>
    </Card>
  );
}

function SourceRow({
  entry,
  bestRate,
  minSubmitted,
}: {
  entry: SourceStats;
  bestRate: number;
  minSubmitted: number;
}) {
  // Destructured so the `=== null` checks below narrow it. A boolean flag read
  // off the object would not, and the rate is used in two cells.
  const { interviewRate } = entry;
  const thin = interviewRate === null;

  return (
    <tr>
      <th scope="row" className="py-3 pr-3 text-left font-medium">
        {sourceLabel(entry.source)}
      </th>

      <td className="px-3 py-3 text-right tabular-nums">{entry.submitted}</td>

      <td className="px-3 py-3 text-right tabular-nums">
        {thin ? (
          <span className="text-muted-foreground">{entry.responses}</span>
        ) : (
          <>
            {formatPercent(entry.responseRate)}
            <span className="text-muted-foreground"> · {entry.responses}</span>
          </>
        )}
      </td>

      <td className="px-3 py-3">
        {interviewRate === null ? (
          <span className="text-muted-foreground text-xs">
            {entry.interviews} so far · needs {minSubmitted - entry.submitted} more
          </span>
        ) : (
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="bg-muted h-2 w-full max-w-24 min-w-10 overflow-hidden rounded-sm"
            >
              <span
                className="bg-primary block h-full rounded-sm"
                style={{
                  width: interviewRate > 0 ? `max(2px, ${(interviewRate / bestRate) * 100}%)` : 0,
                }}
              />
            </span>

            <span className="shrink-0 font-semibold tabular-nums">
              {formatPercent(interviewRate)}
            </span>
          </span>
        )}
      </td>

      <td className="py-3 pl-3 text-right tabular-nums">
        {entry.offers === 0 ? (
          <span className="text-muted-foreground">{ABSENT}</span>
        ) : (
          entry.offers
        )}
      </td>
    </tr>
  );
}

/**
 * `null` is not a seventh channel — the source field is optional on the form, so
 * these are applications where the user simply did not say. Naming it "Not
 * recorded" rather than "Other" matters: `OTHER` is a real `ApplicationSource` a
 * user can pick, and conflating the two would merge a deliberate answer with a
 * blank one.
 */
function sourceLabel(source: SourceStats["source"]): string {
  return source === null ? "Not recorded" : APPLICATION_SOURCE_LABELS[source];
}
