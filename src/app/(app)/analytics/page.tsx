import type { Metadata } from "next";
import { ChartColumnBig, Plus } from "lucide-react";

import { ConversionFunnel } from "@/components/analytics/conversion-funnel";
import { OverviewStrip } from "@/components/analytics/overview-strip";
import { ResponseTimes } from "@/components/analytics/response-times";
import { SourceBreakdown } from "@/components/analytics/source-breakdown";
import { StatusMix } from "@/components/analytics/status-mix";
import { VolumeCard } from "@/components/analytics/volume-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { formatPercent } from "@/lib/utils/metrics";
import { getAnalytics, type Analytics } from "@/server/queries/analytics";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Analytics · CareerTrack",
};

/**
 * The analytics page — §7's second Phase 4 block, and what §1 calls the
 * product's differentiator: *"analytics that produce insight rather than
 * restating counts."*
 *
 * **Every figure comes from one call to `getAnalytics`.** Nothing on this page
 * divides, counts or buckets anything; the query owns all of it, per §3's
 * "defined once, implemented once, computed nowhere else". The components here
 * are given numbers and decide how to draw them.
 *
 * **Four of the five charts render on the server with no JavaScript.** They are
 * single-measure bar lists whose categories and values are written out in text,
 * so a charting library would add a hydration boundary for a shape that HTML
 * already draws. Only the twelve-month volume chart ships Recharts, because
 * twenty-four values is past what direct labels can carry and it genuinely
 * needs a hover layer.
 *
 * **Three escalating empty states, not one.** Nothing tracked at all gets the
 * page's own empty state with a way to fill it; a thin pipeline gets the counts
 * with the rates withheld (§8: *"rates hidden below a minimum sample"*); and
 * individual cards handle their own gaps — no replies logged, fewer than two
 * months of history, a channel below its own threshold. §8's "new user, no
 * data" rule asks for a designed first screen rather than a zeroed grid, and a
 * grid of "0%" is exactly the thing it is warning about.
 */
export default async function AnalyticsPage() {
  const user = await requireUser();
  const analytics = await getAnalytics(user.id);

  if (analytics.total === 0) {
    return (
      <div className="flex flex-col gap-8">
        <AnalyticsHeader />

        <EmptyState
          icon={ChartColumnBig}
          title="Nothing to analyse yet"
          description="Log a few applications and this page starts answering the questions that matter — which channels get you interviews, how long companies take to reply, and where your pipeline is leaking."
          action={
            <ButtonLink href="/applications/new">
              <Plus aria-hidden="true" data-icon="inline-start" />
              New application
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AnalyticsHeader />

      <OverviewStrip analytics={analytics} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <RateTile
          label="Response rate"
          analytics={analytics}
          metric={analytics.response}
          respondedHint="replied"
        />

        <RateTile
          label="Interview rate"
          analytics={analytics}
          metric={analytics.interview}
          respondedHint="reached an interview"
        />

        <RateTile
          label="Offer rate"
          analytics={analytics}
          metric={analytics.offer}
          respondedHint="led to an offer"
        />

        <RateTile
          label="Rejection rate"
          analytics={analytics}
          metric={analytics.rejection}
          respondedHint="rejected"
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <ConversionFunnel analytics={analytics} />
        <StatusMix analytics={analytics} />
      </div>

      <VolumeCard analytics={analytics} />

      {/*
       * Five columns rather than two: the source table carries four numeric
       * columns and needs the room, while the reply-time card is a short bar
       * list that would only stretch to fill an equal half.
       */}
      <div className="grid items-stretch gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SourceBreakdown analytics={analytics} />
        </div>

        <div className="lg:col-span-2">
          <ResponseTimes analytics={analytics} />
        </div>
      </div>
    </div>
  );
}

function AnalyticsHeader() {
  return (
    <PageHeader
      title="Analytics"
      description="Response rates, interview conversion and how long companies actually take to reply — measured against the applications you submitted, not the roles you only saved."
    />
  );
}

/**
 * One headline rate.
 *
 * `StatTile` is imported from the dashboard rather than copied: it already
 * renders an absent metric as a muted em dash, which is precisely the state
 * every tile here is in until the sample is large enough, and two
 * implementations of that would eventually disagree about it.
 *
 * The hint carries the fraction the rate came from, always. A percentage with
 * no denominator beside it is the thing §1 says destroys trust in a metrics
 * page — "20%" reads very differently once you know it is one application out
 * of five.
 */
function RateTile({
  label,
  analytics,
  metric,
  respondedHint,
}: {
  label: string;
  analytics: Analytics;
  metric: Analytics["response"];
  respondedHint: string;
}) {
  const shortfall = analytics.minSubmittedForRates - analytics.submitted;

  return (
    <StatTile
      label={label}
      value={formatPercent(metric.rate)}
      hint={
        analytics.enoughForRates
          ? `${metric.count} of ${analytics.submitted} ${respondedHint}`
          : analytics.submitted === 0
            ? "Nothing submitted yet"
            : `${metric.count} so far · ${shortfall} more submitted to show a rate`
      }
    />
  );
}
