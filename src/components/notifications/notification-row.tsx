import Link from "next/link";
import { CalendarClock, ClipboardCheck, Hourglass, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

import { MarkRead } from "@/components/notifications/mark-read";
import { TonePill, type Tone } from "@/components/shared/tone-pill";
import { NOTIFICATION_TYPE_LABELS, type NotificationTypeValue } from "@/lib/constants/notification";
import { daysSinceDateOnly, formatDateOnly, relativeDayLabel } from "@/lib/utils/date-only";
import { daysUntilInZone, daysUntilLabel, formatTimeInZone } from "@/lib/utils/date-time";
import type { NotificationItem } from "@/server/queries/notifications";

/**
 * One row of the inbox.
 *
 * **The whole row is the link and the tick is beside it**, rather than the title
 * being a link inside a row. A notification has exactly one thing you can do
 * with it — go and look at the thing it is about — so making the user aim at
 * five words of it would be friction for nothing.
 *
 * **The time is computed here, at render, never stored.** Generation writes a
 * title that names the thing ("Technical interview at Google") and leaves the
 * clock to `eventAt`, because a stored "tomorrow" is wrong within the day. See
 * the note on `interviewDraft`.
 *
 * **Two kinds of date, and getting them the wrong way round is this phase's
 * most likely bug.** An interview is an *instant* and is rendered in
 * `User.timezone` with a clock time on it; a deadline is a *calendar day*
 * stored at midnight UTC and is read back in UTC with no time at all. The
 * entity type is what decides, which is why `entityType` is on the row rather
 * than being inferred from the notification type — see `utils/date-only` and
 * `utils/date-time` for why the two helper modules are deliberately separate.
 */

/**
 * The four tones, matching the product's existing scale rather than a chart
 * palette: azure for a scheduled commitment, amber while you are being tested,
 * violet for a closing date, slate for your own to-do. The same temperature
 * logic as `APPLICATION_STATUS_TONES`, and every tone carries an explicit dark
 * variant for the same reason — a light-mode tint is unreadable on a slate-950
 * card.
 */
const NOTIFICATION_TONES: Record<NotificationTypeValue, Tone> = {
  INTERVIEW_UPCOMING: {
    pill: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  ASSESSMENT_DEADLINE: {
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  APPLICATION_DEADLINE: {
    pill: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  TASK_DUE: {
    pill: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
};

const NOTIFICATION_ICONS: Record<NotificationTypeValue, LucideIcon> = {
  INTERVIEW_UPCOMING: CalendarClock,
  ASSESSMENT_DEADLINE: ClipboardCheck,
  APPLICATION_DEADLINE: Hourglass,
  TASK_DUE: ListChecks,
};

export function NotificationRow({
  notification,
  timeZone,
}: {
  notification: NotificationItem;
  timeZone: string;
}) {
  const type = notification.type as NotificationTypeValue;
  const Icon = NOTIFICATION_ICONS[type];
  const when = describeEvent(notification, timeZone);

  return (
    <li className="relative flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      {/*
       * The unread mark. A dot in the gutter rather than a bold title or a
       * tinted row: the row already carries a coloured pill and an icon, and a
       * third emphasis would leave nothing recessive to compare it against.
       */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-2 size-1.5 shrink-0 rounded-full",
          notification.isRead ? "bg-transparent" : "bg-primary",
        )}
      />

      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
          notification.isRead ? "bg-muted text-muted-foreground" : "bg-accent text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        {/*
         * The link spans the row through an inset overlay, so the tick button
         * beside it stays clickable — nesting a button inside an anchor is
         * invalid and the browser's hit testing on it is undefined.
         */}
        <Link
          href={notification.linkUrl}
          className="focus-visible:ring-ring/40 rounded-lg outline-none focus-visible:ring-3"
        >
          <span className="absolute inset-0 rounded-lg" />

          <span
            className={cn(
              "block text-sm font-medium",
              notification.isRead && "text-muted-foreground",
            )}
          >
            {notification.title}
          </span>
        </Link>

        {notification.body ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-sm">
            {notification.body}
          </span>
        ) : null}

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <TonePill tone={NOTIFICATION_TONES[type]} showDot={false}>
            {NOTIFICATION_TYPE_LABELS[type]}
          </TonePill>

          <span
            className={cn(
              "text-xs",
              when.urgent ? "text-warning font-medium" : "text-muted-foreground",
            )}
          >
            {when.label}
          </span>
        </span>
      </span>

      {/*
       * `relative z-10` lifts the tick above the link overlay. Hidden entirely
       * once read — see `MarkRead`.
       */}
      {notification.isRead ? null : (
        <span className="relative z-10">
          <MarkRead id={notification.id} title={notification.title} />
        </span>
      )}
    </li>
  );
}

/**
 * When the thing being reminded about happens, in words.
 *
 * `urgent` is reserved for *today*, which is the only state the colour is worth
 * spending on: everything in this inbox is inside the reminder window by
 * construction, so marking all of it urgent would mark none of it.
 */
function describeEvent(
  notification: NotificationItem,
  timeZone: string,
): { label: string; urgent: boolean } {
  // An interview is an instant; everything else is a calendar day.
  if (notification.entityType === "INTERVIEW") {
    const days = daysUntilInZone(notification.eventAt, timeZone);

    return {
      // "Tomorrow · 3:30 pm" — the relative day is what the eye scans for, the
      // clock is what you need once you have found it. Same shape as the
      // dashboard's next-interviews list.
      label: `${daysUntilLabel(days)} · ${formatTimeInZone(notification.eventAt, timeZone)}`,
      urgent: days === 0,
    };
  }

  const daysPast = daysSinceDateOnly(notification.eventAt);

  return {
    label:
      daysPast === 0
        ? "Due today"
        : `${formatDateOnly(notification.eventAt)} · ${relativeDayLabel(daysPast)}`,
    urgent: daysPast === 0,
  };
}
