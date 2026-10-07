import { cn } from "cn";

import { Card } from "@/components/ui/card";
import type { ApplicationStatusValue } from "@/lib/constants/application";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import type { ApplicationDetail } from "@/server/queries/applications";

/**
 * The four dates that describe where this application stands, as one strip.
 *
 * Deliberately not `StatTile`. That component is built around a headline number
 * set in 30px type, and three of these four values are dates — "28 Sep 2026" at
 * that size wraps in a quarter-width tile and stops reading as a figure. So the
 * type scale here is smaller and the segments share one card, which also keeps
 * the four of them reading as one answer to "how is this going" rather than as
 * four unrelated counters.
 *
 * Every segment renders whether or not it has a value, because the absences are
 * the information: "no deadline set" and "no reply yet" are facts about the
 * application, and a strip that quietly dropped to two segments would leave the
 * user unsure whether they had missed something.
 */
export function DetailStats({ application }: { application: ApplicationDetail }) {
  /*
   * Dividers by `gap-px` over a tinted card rather than `divide-x`, which is
   * subtly wrong in a grid: `divide-*` compiles to `> * + *`, so it walks the
   * DOM and knows nothing about rows. On the two-column mobile layout that puts
   * a border on the second cell of the first row — a line that belongs to no
   * edge. Letting the gap show the card's own background draws every line from
   * the layout itself, so it is correct at two columns and at four.
   */
  return (
    <Card className="bg-border grid grid-cols-2 gap-px py-0 lg:grid-cols-4">
      {segments(application).map((segment) => (
        <Segment key={segment.label} {...segment} />
      ))}
    </Card>
  );
}

type Segment = {
  label: string;
  value: string;
  hint: string;
  /** Draws the value in the destructive tone — used only for a passed deadline. */
  urgent?: boolean;
};

function Segment({ label, value, hint, urgent = false }: Segment) {
  const absent = value === "—";

  return (
    <div className="bg-card flex flex-col gap-1 px-5 py-4">
      <dl>
        <dt className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
          {label}
        </dt>

        <dd
          className={cn(
            "font-heading mt-1.5 text-base leading-snug font-semibold tracking-tight",
            // An absent value is muted so it does not read as a bad result
            // sitting next to the real ones — the same reasoning as `StatTile`.
            absent && "text-muted-foreground",
            urgent && "text-destructive",
          )}
        >
          {value}
        </dd>
      </dl>

      <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
    </div>
  );
}

function segments(application: ApplicationDetail): Segment[] {
  return [
    trackedSegment(application),
    appliedSegment(application),
    responseSegment(application),
    deadlineSegment(application),
  ];
}

/**
 * How long this role has been in the system.
 *
 * Measured from `savedAt` rather than `createdAt`, which are the same instant
 * today but mean different things: `savedAt` is the column the product treats
 * as "when this entered my pipeline", and back-dating a manually logged
 * application would move it while `createdAt` stayed put.
 */
function trackedSegment(application: ApplicationDetail): Segment {
  const days = daysSinceDateOnly(application.savedAt);

  return {
    label: "Tracked",
    value: days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"}`,
    hint: `Saved ${formatDateOnly(application.savedAt)}`,
  };
}

function appliedSegment(application: ApplicationDetail): Segment {
  if (!application.appliedAt) {
    return {
      label: "Applied",
      value: "—",
      // The invariant from §3: `appliedAt IS NULL` ⟺ the status is SAVED. So
      // this branch can say *why* with certainty rather than hedging.
      hint: "Still a saved role, not submitted",
    };
  }

  return {
    label: "Applied",
    value: formatDateOnly(application.appliedAt),
    hint: relativeDayLabel(daysSinceDateOnly(application.appliedAt)),
  };
}

/**
 * Time to first response — the per-application form of §3's "avg response
 * time", which the analytics page averages in Phase 4.
 *
 * Shown as a duration rather than a date, because the duration is what anyone
 * actually wants to know, and the date it landed on goes in the hint.
 */
function responseSegment(application: ApplicationDetail): Segment {
  const { appliedAt, firstResponseAt } = application;

  if (!firstResponseAt) {
    return {
      label: "First response",
      value: "—",
      hint: appliedAt ? "No reply recorded yet" : "Nothing submitted to reply to",
    };
  }

  const replied = `Replied ${formatDateOnly(firstResponseAt)}`;

  /*
   * `appliedAt` is non-null whenever `firstResponseAt` is — both are written by
   * the same two code paths, and a response implies a submission. The guard is
   * here anyway because the alternative to a defensive branch on a derived
   * column is "NaN days" on a real page.
   */
  if (!appliedAt) {
    return { label: "First response", value: formatDateOnly(firstResponseAt), hint: replied };
  }

  const days = daysSinceDateOnly(appliedAt) - daysSinceDateOnly(firstResponseAt);

  return {
    label: "First response",
    // Zero is a same-day reply, which is a real and notable outcome rather
    // than a missing value.
    value: days <= 0 ? "Same day" : `${days} ${days === 1 ? "day" : "days"}`,
    hint: replied,
  };
}

/**
 * The deadline, flagged when it has passed — §8 allows a past deadline and asks
 * for it to be marked rather than rejected. Suppressed once the application has
 * left the pipeline, for the reason in `applications-table`: a rejected
 * application's old deadline is not an overdue task.
 */
function deadlineSegment(application: ApplicationDetail): Segment {
  if (!application.deadline) {
    return { label: "Deadline", value: "—", hint: "None set for this role" };
  }

  const days = daysSinceDateOnly(application.deadline);
  const overdue = days > 0 && !isClosedStatus(application.status);

  return {
    label: "Deadline",
    value: formatDateOnly(application.deadline),
    hint: overdue ? `passed ${relativeDayLabel(days)}` : relativeDayLabel(days),
    urgent: overdue,
  };
}

function isClosedStatus(status: ApplicationStatusValue): boolean {
  return status === "REJECTED" || status === "WITHDRAWN" || status === "ACCEPTED";
}
