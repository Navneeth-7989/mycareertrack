import Link from "next/link";

import { UserMenu } from "@/components/account/user-menu";
import { Logo } from "@/components/brand/logo";
import type { NotificationBellCounts } from "@/server/queries/notifications";

import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { SectionLabel } from "./section-label";

/**
 * The app's top chrome: 64px, sticky, translucent over the content it covers.
 *
 * It carries only what has to follow you down a long page — where you are, the
 * notification inbox, and the account menu. Page-level actions ("New
 * application") belong to the page header instead, next to the heading they act
 * on, so the topbar stays the same on every screen.
 *
 * The bell links to the inbox rather than opening a dropdown, and that stayed
 * true when Phase 4 added the badge — see `NotificationBell` for why a popover
 * was not the answer. The counts are passed down rather than read here so the
 * topbar stays free of queries: `(app)/layout.tsx` generates and counts in one
 * place, which is also what keeps the badge in step with the inbox.
 */
export function Topbar({
  name,
  email,
  notifications,
}: {
  name: string | null;
  email: string;
  notifications: NotificationBellCounts;
}) {
  return (
    <header className="border-border bg-card/85 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav />

        {/* The wordmark stands in for the hidden sidebar below `lg`. */}
        <Link
          href="/dashboard"
          aria-label="CareerTrack dashboard"
          className="focus-visible:ring-ring/40 rounded-lg outline-none focus-visible:ring-3 lg:hidden"
        >
          <Logo size="sm" />
        </Link>

        <SectionLabel className="hidden lg:block" />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <NotificationBell counts={notifications} />

          {/* No Dashboard item — the sidebar two inches away already has one. */}
          <UserMenu name={name} email={email} showDashboardLink={false} />
        </div>
      </div>
    </header>
  );
}
