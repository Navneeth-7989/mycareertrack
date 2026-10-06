import Link from "next/link";
import { Bell } from "lucide-react";

import { UserMenu } from "@/components/account/user-menu";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

import { MobileNav } from "./mobile-nav";
import { SectionLabel } from "./section-label";

/**
 * The app's top chrome: 64px, sticky, translucent over the content it covers.
 *
 * It carries only what has to follow you down a long page — where you are, the
 * notification inbox, and the account menu. Page-level actions ("New
 * application") belong to the page header instead, next to the heading they act
 * on, so the topbar stays the same on every screen.
 *
 * The bell links to the inbox rather than opening a dropdown. The unread badge
 * and the dropdown both arrive with the notification work in Phase 4; shipping
 * a bell that opens an empty popover now would be a control that does nothing.
 */
export function Topbar({ name, email }: { name: string | null; email: string }) {
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
          <ButtonLink
            variant="ghost"
            size="icon-sm"
            aria-label="Notifications"
            href="/notifications"
          >
            <Bell aria-hidden="true" />
          </ButtonLink>

          {/* No Dashboard item — the sidebar two inches away already has one. */}
          <UserMenu name={name} email={email} showDashboardLink={false} />
        </div>
      </div>
    </header>
  );
}
