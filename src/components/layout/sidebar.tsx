import Link from "next/link";

import { Logo } from "@/components/brand/logo";

import { SidebarNav } from "./sidebar-nav";

/**
 * The desktop sidebar: 256px, white against the slate canvas, hidden below
 * `lg` where the drawer in `mobile-nav.tsx` takes over.
 *
 * Fixed rather than a flex sibling, so the nav never scrolls with the page and
 * long tables keep the full viewport height. The content column pays for that
 * with `lg:pl-64` in the layout — the one place the width is mirrored.
 *
 * The brand header is 64px to match the topbar exactly. When the two are a few
 * pixels apart the horizontal rule across the top of the app visibly steps,
 * which is the kind of detail that reads as "unfinished" without anyone being
 * able to say why.
 */
export function Sidebar() {
  return (
    <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          aria-label="CareerTrack dashboard"
          className="focus-visible:ring-ring/40 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-offset-4 focus-visible:ring-offset-(--sidebar)"
        >
          <Logo size="sm" />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
        <SidebarNav />
      </nav>
    </aside>
  );
}
