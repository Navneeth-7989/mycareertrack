import { Bell } from "lucide-react";
import { cn } from "cn";

import { ButtonLink } from "@/components/ui/button";
import { bellBadge, formatUnreadBadge, UNREAD_BADGE_CAP } from "@/lib/constants/notification";
import type { NotificationBellCounts } from "@/server/queries/notifications";

/**
 * The topbar bell and its badge.
 *
 * It still **links to the inbox rather than opening a dropdown**, which is the
 * call `Topbar` recorded from the start. A popover would be a second place the
 * list is rendered, a second read on every page, and a client island in the
 * shell — for a list that is a handful of rows and already has a page of its
 * own with grouping and a mark-all control on it.
 *
 * **The badge counts what is still ahead of you, and unread decides how loudly
 * it says so.** Three states:
 *
 * | unread | upcoming | badge                                    |
 * |--------|----------|------------------------------------------|
 * | > 0    | any      | filled accent, the **unread** count      |
 * | 0      | > 0      | quiet outline, the **upcoming** count    |
 * | 0      | 0        | none                                     |
 *
 * The two tiers exist because one number cannot do this job. A pure unread
 * count vanishes the second you glance at a notification, leaving a bare bell
 * while the interview it was about is still tomorrow — so the thing the bell is
 * for, knowing there is something waiting without opening anything, stops
 * working as soon as it is used once. A pure total count is worse: it would
 * include every reminder for every date already gone by, never clear, and
 * become wallpaper.
 *
 * Counting *ahead* rather than *all* is also what makes it self-clearing. There
 * is no sweep and nothing to dismiss: as each interview and deadline passes,
 * the number falls on its own.
 *
 * **Why the unread count and not the upcoming one in the loud state:** when
 * something is unread, "how many have I not seen" is the more urgent of the two
 * questions, and it is the one that goes down when the user acts. Once nothing
 * is unread the question changes to "what is still coming", which is the quiet
 * number.
 *
 * Server-rendered, so the badge is right in the first paint rather than popping
 * in after hydration. Both counts come from `(app)/layout.tsx`, which is also
 * where generation runs — so the number is never behind the notifications it is
 * counting.
 */
export function NotificationBell({ counts }: { counts: NotificationBellCounts }) {
  const { unread, upcoming } = counts;
  // The three-state table above, as one tested function — see `bellBadge`.
  const badge = bellBadge(unread, upcoming);

  return (
    <ButtonLink
      variant="ghost"
      size="icon-sm"
      href="/notifications"
      /*
       * The count goes in the accessible name, in words. A badge beside an icon
       * is unreachable any other way, and "Notifications, 3 unread" read aloud
       * is the entire point of it.
       */
      aria-label={describeBell(unread, upcoming)}
      className="relative"
    >
      <Bell aria-hidden="true" />

      {badge ? (
        <span
          aria-hidden="true"
          className={cn(
            // `ring-card` in the topbar's own colour is what makes the badge
            // read as sitting on top of the bell rather than merged into it —
            // the one place in the app where two marks overlap.
            "ring-card absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-semibold tabular-nums ring-2",
            badge.tone === "loud"
              ? "bg-primary text-primary-foreground"
              : // Read, but still ahead: the same shape in muted ink, so it is
                // legible without competing with anything on the page.
                "bg-muted text-muted-foreground border-border border",
          )}
        >
          {formatUnreadBadge(badge.count)}
        </span>
      ) : null}
    </ButtonLink>
  );
}

/**
 * The bell's accessible name.
 *
 * It says which number is on the badge rather than reciting both, because the
 * badge only ever shows one — announcing a figure that is not on screen is how
 * a screen-reader label and the thing it labels come apart.
 */
function describeBell(unread: number, upcoming: number): string {
  if (unread > 0) {
    return `Notifications, ${countInWords(unread)} unread`;
  }

  if (upcoming > 0) {
    return `Notifications, ${countInWords(upcoming)} coming up`;
  }

  return "Notifications";
}

/** "9+" is not a number anybody can hear, so past the cap it is said in words. */
function countInWords(count: number): string {
  return count > UNREAD_BADGE_CAP ? `more than ${UNREAD_BADGE_CAP}` : String(count);
}
