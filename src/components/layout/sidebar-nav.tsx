"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { isNavItemActive, NAV_SECTIONS } from "@/lib/constants/navigation";

/**
 * The navigation list itself, shared verbatim by the desktop sidebar and the
 * mobile drawer.
 *
 * It is a client component for exactly one reason — `usePathname()`, which is
 * what lights the current section. That is also why the list is factored out of
 * `Sidebar`: the brand header and the shell around it stay on the server, and
 * only these links ship as JavaScript.
 *
 * `onNavigate` exists for the drawer, which has to close itself when a link is
 * tapped. A client-side transition keeps the drawer mounted, so without this
 * the new page renders behind a sheet that is still open.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label ? (
            <h2 className="text-muted-foreground/90 mb-1 px-2.5 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase">
              {section.label}
            </h2>
          ) : null}

          {section.items.map((item) => {
            const active = isNavItemActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                /*
                 * `aria-current` rather than only a colour change — the active
                 * item has to be announced, not just seen, and the tint alone
                 * would make the current section invisible to a screen reader.
                 */
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/nav text-sidebar-foreground focus-visible:ring-sidebar-ring/40 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 transition-colors duration-150",
                    active
                      ? "text-sidebar-primary"
                      : "text-muted-foreground group-hover/nav:text-sidebar-accent-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
