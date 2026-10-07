import {
  ArrowRight,
  Award,
  Bookmark,
  CircleX,
  ClipboardCheck,
  Mail,
  Repeat2,
  Send,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_TYPE_LABELS, type EventTypeValue } from "@/lib/constants/event";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import type { ApplicationTimelineEvent } from "@/server/queries/applications";

/**
 * The history of one application.
 *
 * Read-only, and that is the whole of step 5. The events it renders are already
 * being written — one on create, one per status change, both inside the same
 * transaction as the change they describe (see `mutations/applications`) — so
 * until this page existed the product was recording a history nobody could see.
 * Adding, editing and deleting entries by hand is Phase 3's timeline work; this
 * is the display half, which the data already earned.
 *
 * Newest first. A job search is read backwards — "what happened last" is the
 * question, and the opening "Role saved" entry is the one a user already knows.
 *
 * Dates only, no clock times. `occurredAt` is a mix today: a status change
 * stamps the instant it happened, while an application logged with a date
 * applied stamps midnight UTC on that calendar day. Printing "12:00 am" beside
 * the second kind would be inventing precision the column does not carry, so
 * the shared date-only convention wins here too (see `utils/date-only`). Phase
 * 3 owns the timeline and can revisit it once manual events arrive with
 * user-chosen timestamps.
 */
export function DetailTimeline({
  events,
  hasMore,
}: {
  events: ApplicationTimelineEvent[];
  hasMore: boolean;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Recorded automatically as this application moves through the pipeline.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          /*
           * Not reachable through the product: creating an application writes
           * its opening event in the same transaction, so every row has at
           * least one. It is here because a card whose only content is an
           * empty rail is the worst way to find out that assumption broke.
           */
          <p className="text-muted-foreground py-2 text-sm">
            Nothing recorded for this application yet.
          </p>
        ) : (
          /*
           * The rail is a pseudo-element on the list rather than a border on
           * each item, so it can stop short of the first and last markers
           * instead of trailing past them into the card's padding.
           */
          <ol className="before:bg-border relative flex flex-col gap-5 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:-translate-x-1/2 before:content-['']">
            {events.map((event) => (
              <Entry key={event.id} event={event} />
            ))}
          </ol>
        )}

        {hasMore ? (
          <p className="text-muted-foreground border-border mt-5 border-t pt-4 text-xs">
            Only the most recent entries are shown.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Entry({ event }: { event: ApplicationTimelineEvent }) {
  const Icon = EVENT_ICONS[event.type];
  const days = daysSinceDateOnly(event.occurredAt);

  return (
    <li className="relative flex gap-3.5">
      {/*
       * `bg-card`, not transparent: the marker has to cover the rail behind it,
       * and a ring would still show the line through the middle of the glyph.
       */}
      <span className="bg-card text-muted-foreground border-border z-10 flex size-6 shrink-0 items-center justify-center rounded-full border">
        <Icon aria-hidden="true" className="size-3" />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm leading-snug font-medium">{event.title}</p>

          {/* The type tag, not the title again — see `constants/event`. It is
              the only thing distinguishing two same-day entries at a glance. */}
          <span className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
            {EVENT_TYPE_LABELS[event.type]}
          </span>
        </div>

        {event.description ? (
          <p className="text-muted-foreground mt-1 text-[0.8125rem] leading-relaxed">
            {event.description}
          </p>
        ) : null}

        <p className="text-muted-foreground mt-1.5 text-xs">
          {formatDateOnly(event.occurredAt)}
          <span className="text-muted-foreground/70"> · {relativeDayLabel(days)}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * One glyph per event type, so the rail can be skimmed without reading it.
 *
 * Every type is mapped, including the seven Phase 3 writes. A map with holes
 * would mean a crash on the first manual event rather than a missing icon —
 * `noUncheckedIndexedAccess` would hand back `undefined` and React would be
 * asked to render it as a component.
 */
const EVENT_ICONS: Record<EventTypeValue, LucideIcon> = {
  SAVED: Bookmark,
  APPLIED: Send,
  STATUS_CHANGE: ArrowRight,
  EMAIL_RECEIVED: Mail,
  ASSESSMENT: ClipboardCheck,
  INTERVIEW: Users,
  FOLLOW_UP: Repeat2,
  OFFER: Award,
  REJECTION: CircleX,
  CUSTOM: StickyNote,
};
