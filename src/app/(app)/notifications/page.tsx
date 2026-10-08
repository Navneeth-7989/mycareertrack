import type { Metadata } from "next";
import { BellOff, Settings2 } from "lucide-react";

import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { NotificationRow } from "@/components/notifications/notification-row";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NOTIFICATION_PREFERENCE_KEYS } from "@/lib/constants/notification";
import {
  getNotificationInbox,
  PAST_NOTIFICATION_LIMIT,
  type NotificationItem,
} from "@/server/queries/notifications";
import { requireUser } from "@/server/require-user";
import { ensureNotificationsGenerated } from "@/server/services/notifications";

export const metadata: Metadata = {
  title: "Notifications · CareerTrack",
};

/**
 * The inbox — §7's third Phase 4 block, and the whole of the notification
 * feature. There is no email and no push: a locked decision, which is why the
 * page describes itself as the only place reminders arrive rather than as one
 * channel among several.
 *
 * **Generation runs before the read**, through the same `cache()`d call the
 * shell makes — so on this page it is already done and this line costs nothing.
 * It is here anyway rather than relied upon: a page that reads a table somebody
 * else is responsible for filling is a page that breaks the day the layout
 * changes.
 *
 * **Split by whether the event has happened, not by read state.** "In six
 * hours" is something to act on and "yesterday" is a record, which is the
 * distinction worth a heading; grouping by read/unread instead would move a row
 * the instant the user looked at it.
 */
export default async function NotificationsPage() {
  const user = await requireUser();

  await ensureNotificationsGenerated(user);
  const inbox = await getNotificationInbox(user.id);

  const allOff = Object.values(NOTIFICATION_PREFERENCE_KEYS).every((key) => !user[key]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Notifications"
        description="Reminders for what is coming up — interviews, assessment and application deadlines, and your own tasks. This inbox is the only place they arrive; there is no email."
        actions={
          inbox.unreadCount > 0 ? <MarkAllRead unreadCount={inbox.unreadCount} /> : undefined
        }
      />

      {/*
       * Shown when every toggle is off, which would otherwise look identical to
       * "nothing is coming up" — a silent inbox the user configured themselves
       * and has since forgotten about. It sits above the list rather than
       * replacing it, because notifications generated before the toggles were
       * turned off are still there and still real.
       */}
      {allOff ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Every reminder is switched off.</span>{" "}
              <span className="text-muted-foreground">
                Nothing new will appear here until you turn at least one back on.
              </span>
            </p>

            <ButtonLink variant="outline" size="sm" href="/settings" className="shrink-0">
              <Settings2 aria-hidden="true" data-icon="inline-start" />
              Open settings
            </ButtonLink>
          </CardContent>
        </Card>
      ) : null}

      {inbox.total === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nothing to remind you about"
          description={`Reminders appear here automatically — nothing to set up. Schedule an interview or put a deadline on an application and it will show up ${describeWindow(user.reminderHours)} beforehand.`}
          action={
            <ButtonLink variant="outline" href="/settings">
              <Settings2 aria-hidden="true" data-icon="inline-start" />
              Reminder settings
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <InboxSection
            title="Coming up"
            description="Soonest first."
            items={inbox.upcoming}
            timeZone={user.timezone}
            emptyMessage="Nothing in the next few days."
          />

          {inbox.past.length > 0 ? (
            <InboxSection
              title="Already happened"
              description="Kept so you can see what you were told about."
              items={inbox.past}
              timeZone={user.timezone}
              footnote={
                inbox.hasMorePast
                  ? `Showing the most recent ${PAST_NOTIFICATION_LIMIT}.`
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function InboxSection({
  title,
  description,
  items,
  timeZone,
  emptyMessage,
  footnote,
}: {
  title: string;
  description: string;
  items: NotificationItem[];
  timeZone: string;
  emptyMessage?: string;
  footnote?: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          {title}
          <span className="text-muted-foreground ml-2 text-xs font-medium tabular-nums">
            {items.length}
          </span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{emptyMessage}</p>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                timeZone={timeZone}
              />
            ))}
          </ul>
        )}

        {footnote ? (
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">{footnote}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The user's own reminder window, in words — "a day", "two days".
 *
 * Read from their setting rather than hard-coded to 24 hours, so the empty
 * state cannot promise a window they have changed. The agreed default is 24
 * (§9), and `reminderHours` is configurable precisely so the number is a
 * setting rather than a migration.
 */
function describeWindow(hours: number): string {
  if (hours < 24) return `${hours} hours`;
  if (hours === 24) return "a day";

  return `${Math.round(hours / 24)} days`;
}
