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

import { EventDialog } from "@/components/applications/event-dialog";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT_TYPE_LABELS, isManualEventType, type EventTypeValue } from "@/lib/constants/event";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import type { ApplicationTimelineEvent } from "@/server/queries/applications";

/**
 * The history of one application.
 *
 * Both halves now. Phase 2 shipped the display and the automatic events — one
 * written on create, one per status change, each inside the same transaction as
 * the change it describes. Phase 3 adds the entries a user writes by hand, which
 * is the part the product could not observe for itself: a recruiter's reply, an
 * assessment link, a follow-up sent.
 *
 * **Automatic entries have no controls, and that is the feature.** `isAutomatic`
 * decides it here and `assertEditable` decides it again on the server, so the
 * page never offers an action that would be refused. The system's record of what
 * happened stays the system's: rewriting *"Moved to Interview · From
 * Assessment"* would corrupt the history the compare-and-set in
 * `updateApplicationStatus` exists to keep honest, and §3 computes its interview
 * and offer rates from exactly these rows.
 *
 * Newest first. A job search is read backwards — "what happened last" is the
 * question, and the opening "Role saved" entry is the one a user already knows.
 *
 * Dates only, no clock times. `occurredAt` is a mix: a status change stamps the
 * instant it happened, while a manual entry and an application logged with a
 * date applied both stamp midnight UTC on a calendar day. Printing "12:00 am"
 * beside the latter would be inventing precision the column does not carry, so
 * the shared date-only convention wins (see `utils/date-only`). The visible
 * consequence is that entries sharing a day have no meaningful order between
 * them — which is honest, because the data has none either.
 */
export function DetailTimeline({
  applicationId,
  events,
  hasMore,
}: {
  applicationId: string;
  events: ApplicationTimelineEvent[];
  hasMore: boolean;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Recorded automatically as this application moves, plus anything you add.
        </CardDescription>

        <CardAction>
          <EventDialog applicationId={applicationId} />
        </CardAction>
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
              <Entry key={event.id} applicationId={applicationId} event={event} />
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

function Entry({
  applicationId,
  event,
}: {
  applicationId: string;
  event: ApplicationTimelineEvent;
}) {
  const Icon = EVENT_ICONS[event.type];
  const days = daysSinceDateOnly(event.occurredAt);

  /*
   * Both conditions, not just the flag. They should always agree — every writer
   * of an automatic type sets `isAutomatic` — but the type is what the analytics
   * read, so a row that disagreed with itself renders read-only here and is
   * refused by the server, which is the same answer from both ends.
   *
   * The narrowed type is carried rather than a boolean, because `EventDialog`
   * accepts only the seven manual ones and this is the guard that proves it. A
   * `const editable = …` would lose the narrowing by the time the JSX below
   * needs `event.type`, and the cast that replaced it would be a cast on exactly
   * the value this check exists to constrain.
   */
  const manualType = !event.isAutomatic && isManualEventType(event.type) ? event.type : null;

  return (
    <li className="relative flex gap-3.5">
      {/*
       * `bg-card`, not transparent: the marker has to cover the rail behind it,
       * and a ring would still show the line through the middle of the glyph.
       *
       * A manual entry's marker takes the foreground colour where an automatic
       * one stays muted. That is the only styling difference between the two,
       * and it is deliberately quiet — the presence of the controls on the right
       * is what actually tells the user which entries are theirs, so a louder
       * treatment here would be saying the same thing twice.
       */}
      <span
        className={
          manualType
            ? "bg-card text-foreground border-border z-10 flex size-6 shrink-0 items-center justify-center rounded-full border"
            : "bg-card text-muted-foreground border-border z-10 flex size-6 shrink-0 items-center justify-center rounded-full border"
        }
      >
        <Icon aria-hidden="true" className="size-3" />
      </span>

      <div className="flex min-w-0 flex-1 items-start gap-2 pt-0.5">
        <div className="min-w-0 flex-1">
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

        {/*
         * Always visible rather than revealed on hover. Hover-only controls are
         * unreachable on a phone, and §1 names mobile as this product's hardest
         * surface — the same reasoning that made the status dropdown the primary
         * control on the board. They are `ghost` and 32px, so they read as
         * secondary without hiding.
         *
         * `-mt-1` pulls them level with the title rather than with the block,
         * which is a line and a half taller.
         */}
        {manualType ? (
          <div className="-mt-1 flex shrink-0 items-center gap-0.5">
            <EventDialog
              applicationId={applicationId}
              event={{
                id: event.id,
                type: manualType,
                title: event.title,
                description: event.description,
                occurredAt: event.occurredAt,
              }}
            />

            <ConfirmDelete
              endpoint={`/api/events/${event.id}`}
              triggerLabel={`Delete “${event.title}”`}
              title="Delete this entry?"
              description={
                <>
                  <strong className="text-foreground font-medium">{event.title}</strong> will be
                  removed from this application&rsquo;s timeline. Nothing else about the application
                  changes.
                </>
              }
              successTitle="Entry deleted"
              successDescription={event.title}
              failureMessage="Could not delete that entry."
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One glyph per event type, so the rail can be skimmed without reading it.
 *
 * Every type is mapped, automatic and manual alike. A map with holes would mean
 * a crash rather than a missing icon — `noUncheckedIndexedAccess` would hand
 * back `undefined` and React would be asked to render it as a component.
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
